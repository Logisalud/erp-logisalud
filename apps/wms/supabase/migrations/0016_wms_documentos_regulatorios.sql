-- 0016 · WMS · Salidas · S6a: repositorio de documentos regulatorios
--
-- COA por lote, registro sanitario por producto y BPM por fabricante, con vigencia, historial y permisos; perfil documental del cliente por RUC;
-- y la carga masiva de COA (relación automática con el lote y revisión de lo que no se pudo relacionar).
--   · `documentos_regulatorios` es append-only: una fila por versión. Reemplazar = una fila nueva que apunta a la anterior; nada se borra ni se edita.
--   · Quién escribe (en las funciones y no solo en pantalla): el COA lo adjunta quien recibe (Jefe de Almacén, auxiliar, asistente de DT o DT) cuando el lote
--     todavía no tiene uno vigente; reemplazarlo, y subir o reemplazar registro sanitario y BPM, solo Dirección Técnica (`gestionar_documentos_regulatorios`).
--   · Los archivos viven en un bucket PRIVADO de Supabase Storage (`wms-documentos`, se crea a mano); aquí solo se guarda la referencia, el hash y la vigencia.
--     La base local no cubre Storage: las políticas del bucket se verifican en el Preview.
--   · `estado_documental(lote, ruc, entrega)` dice qué falta, qué venció y qué vence antes de la entrega; lo usará «Listo para carga» (S6b).
-- Re-ejecutable. Se aplica a mano, después de la 0015. Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Alertas nuevas
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'alertas_tipo_check' and conrelid = 'wms.alertas'::regclass) then
    alter table wms.alertas drop constraint alertas_tipo_check;
  end if;
  alter table wms.alertas add constraint alertas_tipo_check check (tipo in (
    'TEMPERATURA', 'RS_VENCIDO', 'DIVERGENCIA_COMPRAS', 'POR_TRASLADAR_VENCIDO', 'LOTE_POR_VENCER', 'LOTE_VENCIDO',
    'SOLICITUD_AJUSTADA', 'EXCEDE_OC', 'POR_REGISTRAR_EN_COMPRAS', 'NO_COINCIDE_CON_COMPRAS',
    'MOVIMIENTO_CON_DIFERENCIA', 'MOVIMIENTO_SIN_VERIFICAR', 'CONTEO_CON_DIFERENCIA', 'AJUSTE_POR_AUTORIZAR', 'PENDIENTE_AFECTA_PRODUCTO',
    'STOCK_INSUFICIENTE', 'PEDIDO_CAMBIADO', 'DOCUMENTO_VENCIDO'));
end $$;

insert into wms.parametros (clave, valor, nota) values
  ('documentos_dias_aviso_vencimiento', '30',
   'S6a: días antes del vencimiento de un documento regulatorio (registro sanitario, BPM, COA con vigencia) en que se avisa a Dirección Técnica.')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fabricantes (el BPM es del fabricante; hoy el fabricante es texto libre)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.fabricantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  activo boolean not null default true,
  creado_por uuid,
  creado_en timestamptz not null default now()
);
create unique index if not exists fabricantes_nombre_uk on wms.fabricantes (lower(btrim(nombre)));
alter table wms.fabricantes enable row level security;

alter table wms.producto_regulatorio add column if not exists fabricante_id uuid references wms.fabricantes(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Documentos regulatorios (una fila por versión)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.documentos_regulatorios (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('COA', 'REGISTRO_SANITARIO', 'BPM')),
  lote_id uuid references wms.lotes(id),
  producto_id uuid,                                   -- → catalogo.productos(id)
  fabricante_id uuid references wms.fabricantes(id),
  nombre_archivo text not null check (char_length(btrim(nombre_archivo)) > 0),
  archivo_ref text not null check (char_length(btrim(archivo_ref)) > 0),   -- ruta en el bucket privado
  hash_sha256 text not null check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  tamano_bytes integer not null check (tamano_bytes > 0),
  vigente_desde date not null default current_date,
  vigente_hasta date,                                 -- null = no vence
  subido_por uuid not null,
  subido_en timestamptz not null default now(),
  reemplaza_a uuid references wms.documentos_regulatorios(id),
  motivo_reemplazo text,
  -- Cada tipo cuelga de UN alcance: el COA, del lote; el registro sanitario, del producto; el BPM, del fabricante.
  check ((tipo = 'COA' and lote_id is not null and producto_id is null and fabricante_id is null)
      or (tipo = 'REGISTRO_SANITARIO' and producto_id is not null and lote_id is null and fabricante_id is null)
      or (tipo = 'BPM' and fabricante_id is not null and lote_id is null and producto_id is null)),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
alter table wms.documentos_regulatorios enable row level security;
create index if not exists documentos_reg_lote_idx on wms.documentos_regulatorios (lote_id) where lote_id is not null;
create index if not exists documentos_reg_producto_idx on wms.documentos_regulatorios (producto_id) where producto_id is not null;
create index if not exists documentos_reg_fabricante_idx on wms.documentos_regulatorios (fabricante_id) where fabricante_id is not null;
create index if not exists documentos_reg_hash_idx on wms.documentos_regulatorios (hash_sha256);
-- Una versión solo puede ser reemplazada una vez (la cadena es lineal).
create unique index if not exists documentos_reg_reemplazo_uk on wms.documentos_regulatorios (reemplaza_a) where reemplaza_a is not null;

do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'documentos_reg_inmutable' and tgrelid = 'wms.documentos_regulatorios'::regclass and not tgisinternal) then
    drop trigger documentos_reg_inmutable on wms.documentos_regulatorios;
  end if;
end $$;
create trigger documentos_reg_inmutable before update or delete on wms.documentos_regulatorios
  for each row execute function wms.trg_inmutable();

-- La versión vigente de cada alcance: la que nadie ha reemplazado.
create or replace view wms.documentos_vigentes with (security_invoker = true) as
  select d.* from wms.documentos_regulatorios d
   where not exists (select 1 from wms.documentos_regulatorios r where r.reemplaza_a = d.id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Perfil documental del cliente (por RUC): qué documentos exige
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.perfil_documental_cliente (
  ruc text primary key check (ruc ~ '^[0-9]{11}$'),
  exige_coa boolean not null default true,
  exige_registro_sanitario boolean not null default true,
  exige_bpm boolean not null default false,
  copias integer not null default 1 check (copias between 1 and 10),
  nota text check (nota is null or char_length(nota) <= 500),
  actualizado_por uuid,
  actualizado_en timestamptz not null default now()
);
alter table wms.perfil_documental_cliente enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Carga masiva de COA (la carpeta que ya existe) y su pantalla de revisión
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.cargas_coa (
  id uuid primary key default gen_random_uuid(),
  creada_por uuid not null,
  creada_en timestamptz not null default now(),
  total integer not null default 0,
  importados integer not null default 0,
  por_revisar integer not null default 0,
  duplicados integer not null default 0
);
alter table wms.cargas_coa enable row level security;

create table if not exists wms.cargas_coa_items (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references wms.cargas_coa(id),
  nombre_archivo text not null,
  archivo_ref text not null,
  hash_sha256 text not null check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  tamano_bytes integer not null check (tamano_bytes > 0),
  estado text not null default 'POR_REVISAR' check (estado in ('IMPORTADO', 'POR_REVISAR', 'DESCARTADO', 'DUPLICADO')),
  lote_id uuid references wms.lotes(id),
  documento_id uuid references wms.documentos_regulatorios(id),
  motivo text,                                       -- por qué quedó por revisar / descartado
  candidatos jsonb not null default '[]'::jsonb,     -- [{lote_id, lote, producto}] que la lectura automática propuso
  resuelto_por uuid,
  resuelto_en timestamptz
);
alter table wms.cargas_coa_items enable row level security;
create index if not exists cargas_coa_items_estado_idx on wms.cargas_coa_items (estado) where estado = 'POR_REVISAR';
create index if not exists cargas_coa_items_carga_idx on wms.cargas_coa_items (carga_id);

-- Lectura: el personal (los documentos los ven quienes operan); nadie escribe con DML directo.
do $$ declare t text; begin
  foreach t in array array['fabricantes', 'documentos_regulatorios', 'perfil_documental_cliente', 'cargas_coa', 'cargas_coa_items'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then
      execute format('drop policy lectura on wms.%I', t);
    end if;
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
    execute format('grant select on wms.%I to authenticated', t);
  end loop;
end $$;
grant select on wms.documentos_vigentes to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Funciones
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.crear_fabricante(p_nombre text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_nombre text := btrim(coalesce(p_nombre, '')); v_id uuid;
begin
  perform wms._exigir_accion('gestionar_documentos_regulatorios', 'Solo Dirección Técnica crea fabricantes');
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 120 then raise exception 'El nombre del fabricante debe tener entre 2 y 120 caracteres' using errcode = 'P0001'; end if;
  select id into v_id from wms.fabricantes where lower(btrim(nombre)) = lower(v_nombre);
  if found then return v_id; end if;
  insert into wms.fabricantes (nombre, creado_por) values (v_nombre, auth.uid()) returning id into v_id;
  perform wms.registrar_audit('fabricante_creado', 'fabricantes', v_id::text, null, jsonb_build_object('nombre', v_nombre), null);
  return v_id;
end $$;

-- Liga el fabricante de un producto. Solo Dirección Técnica; el texto libre original NO se toca.
create or replace function wms.asignar_fabricante_producto(p_producto uuid, p_fabricante uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  perform wms._exigir_accion('gestionar_documentos_regulatorios', 'Solo Dirección Técnica asigna el fabricante de un producto');
  if not exists (select 1 from wms.fabricantes where id = p_fabricante and activo) then raise exception 'No encontramos ese fabricante' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.producto_regulatorio where producto_id = p_producto) then
    raise exception 'El producto todavía no tiene datos regulatorios: cárgalos primero' using errcode = 'P0001';
  end if;
  update wms.producto_regulatorio set fabricante_id = p_fabricante where producto_id = p_producto;
  perform wms.registrar_audit('fabricante_asignado', 'producto_regulatorio', p_producto::text, null, jsonb_build_object('fabricante_id', p_fabricante), null);
end $$;

-- Sube una versión de un documento. `p_alcance` es el lote (COA), el producto (registro sanitario) o el fabricante (BPM).
-- Primera versión: COA lo sube quien recibe; RS y BPM, solo DT. Reemplazo (p_reemplaza): solo DT, con motivo, y debe ser la versión vigente del mismo alcance.
create or replace function wms.subir_documento_regulatorio(
  p_tipo text, p_alcance uuid, p_nombre_archivo text, p_archivo_ref text, p_hash text, p_bytes integer,
  p_desde date default null, p_hasta date default null, p_reemplaza uuid default null, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v_id uuid; v_desde date := coalesce(p_desde, current_date); v_ant wms.documentos_regulatorios; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_vigente uuid; v_dt boolean;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if p_tipo not in ('COA', 'REGISTRO_SANITARIO', 'BPM') then raise exception 'Tipo de documento no válido' using errcode = 'P0001'; end if;
  v_dt := wms.tiene_permiso('gestionar_documentos_regulatorios');
  if p_tipo <> 'COA' and not v_dt then raise exception 'Solo Dirección Técnica sube o reemplaza el registro sanitario y el BPM' using errcode = '42501'; end if;
  if p_tipo = 'COA' and not (v_dt or wms.tiene_rol('jefe_almacen', 'auxiliar', 'asistente_dt')) then
    raise exception 'No tienes permiso para adjuntar un COA' using errcode = '42501';
  end if;
  -- el alcance existe
  if p_tipo = 'COA' and not exists (select 1 from wms.lotes where id = p_alcance) then raise exception 'No encontramos ese lote' using errcode = 'P0001'; end if;
  if p_tipo = 'REGISTRO_SANITARIO' and not exists (select 1 from wms.producto_regulatorio where producto_id = p_alcance) then
    raise exception 'El producto todavía no tiene datos regulatorios: cárgalos primero' using errcode = 'P0001';
  end if;
  if p_tipo = 'BPM' and not exists (select 1 from wms.fabricantes where id = p_alcance and activo) then raise exception 'No encontramos ese fabricante' using errcode = 'P0001'; end if;
  if p_hasta is not null and p_hasta < v_desde then raise exception 'El documento no puede vencer antes de empezar a regir' using errcode = 'P0001'; end if;

  select d.id into v_vigente from wms.documentos_vigentes d
   where d.tipo = p_tipo and coalesce(d.lote_id, d.producto_id, d.fabricante_id) = p_alcance;
  if p_reemplaza is null then
    if v_vigente is not null then raise exception 'Ya hay un documento vigente: se reemplaza (solo Dirección Técnica), no se sube otro' using errcode = 'P0001'; end if;
  else
    if not v_dt then raise exception 'Solo Dirección Técnica reemplaza un documento' using errcode = '42501'; end if;
    select * into v_ant from wms.documentos_regulatorios where id = p_reemplaza;
    if not found then raise exception 'No encontramos el documento que se reemplaza' using errcode = 'P0001'; end if;
    if v_ant.tipo <> p_tipo or coalesce(v_ant.lote_id, v_ant.producto_id, v_ant.fabricante_id) <> p_alcance then
      raise exception 'El documento que se reemplaza no es del mismo alcance' using errcode = 'P0001';
    end if;
    if v_vigente is distinct from p_reemplaza then raise exception 'Ese documento ya fue reemplazado: reemplaza la versión vigente' using errcode = 'P0001'; end if;
    if v_motivo is null then raise exception 'Indica el motivo del reemplazo' using errcode = 'P0001'; end if;
  end if;
  insert into wms.documentos_regulatorios (tipo, lote_id, producto_id, fabricante_id, nombre_archivo, archivo_ref, hash_sha256, tamano_bytes,
                                           vigente_desde, vigente_hasta, subido_por, reemplaza_a, motivo_reemplazo)
  values (p_tipo, case when p_tipo = 'COA' then p_alcance end, case when p_tipo = 'REGISTRO_SANITARIO' then p_alcance end,
          case when p_tipo = 'BPM' then p_alcance end, btrim(p_nombre_archivo), btrim(p_archivo_ref), lower(p_hash), p_bytes, v_desde, p_hasta, auth.uid(),
          p_reemplaza, v_motivo)
  returning id into v_id;
  perform wms.registrar_audit(case when p_reemplaza is null then 'documento_subido' else 'documento_reemplazado' end, 'documentos_regulatorios', v_id::text,
                              null, jsonb_build_object('tipo', p_tipo, 'alcance', p_alcance, 'hasta', p_hasta), v_motivo);
  return v_id;
end $$;

-- Perfil documental de un cliente: lo mantienen Dirección Técnica y Transporte.
create or replace function wms.guardar_perfil_documental(p_ruc text, p_exige_coa boolean, p_exige_rs boolean, p_exige_bpm boolean, p_copias integer, p_nota text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (wms.tiene_permiso('gestionar_documentos_regulatorios') or wms.tiene_rol('jefe_transporte')) then
    raise exception 'Solo Dirección Técnica y el Jefe de Transporte definen qué documentos exige un cliente' using errcode = '42501';
  end if;
  if p_ruc is null or p_ruc !~ '^[0-9]{11}$' then raise exception 'El RUC debe tener 11 dígitos' using errcode = 'P0001'; end if;
  if p_copias is null or p_copias < 1 or p_copias > 10 then raise exception 'Las copias van de 1 a 10' using errcode = 'P0001'; end if;
  insert into wms.perfil_documental_cliente (ruc, exige_coa, exige_registro_sanitario, exige_bpm, copias, nota, actualizado_por)
  values (p_ruc, p_exige_coa, p_exige_rs, p_exige_bpm, p_copias, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
  on conflict (ruc) do update set exige_coa = excluded.exige_coa, exige_registro_sanitario = excluded.exige_registro_sanitario, exige_bpm = excluded.exige_bpm,
         copias = excluded.copias, nota = excluded.nota, actualizado_por = excluded.actualizado_por, actualizado_en = now();
  perform wms.registrar_audit('perfil_documental_guardado', 'perfil_documental_cliente', p_ruc, null,
                              jsonb_build_object('coa', p_exige_coa, 'rs', p_exige_rs, 'bpm', p_exige_bpm, 'copias', p_copias), null);
end $$;

-- Qué documentos pide un lote para un cliente y cómo está cada uno. Sin perfil del cliente se exigen COA y registro sanitario (D-82).
-- Estados: OK · FALTA · VENCIDO · VENCE_ANTES_DE_ENTREGA (vence antes de la fecha de entrega).
create or replace function wms.estado_documental(p_lote uuid, p_ruc text default null, p_entrega date default null)
returns table (tipo text, exigido boolean, estado text, documento_id uuid, nombre_archivo text, vigente_hasta date)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare
  l wms.lotes; p wms.perfil_documental_cliente; v_fab uuid; v_hoy date := wms._hoy_lima(); v_entrega date;
  v_coa boolean := true; v_rs boolean := true; v_bpm boolean := false;
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  select * into l from wms.lotes where id = p_lote;
  if not found then raise exception 'No encontramos ese lote' using errcode = 'P0001'; end if;
  v_entrega := coalesce(p_entrega, v_hoy);
  if p_ruc is not null then
    select * into p from wms.perfil_documental_cliente where ruc = p_ruc;
    if found then v_coa := p.exige_coa; v_rs := p.exige_registro_sanitario; v_bpm := p.exige_bpm; end if;
  end if;
  select fabricante_id into v_fab from wms.producto_regulatorio where producto_id = l.producto_id;
  return query
  select t.tipo, t.exigido,
         case when d.id is null then case when t.exigido then 'FALTA' else 'NO_EXIGIDO' end
              when d.vigente_hasta is not null and d.vigente_hasta < v_hoy then 'VENCIDO'
              when d.vigente_hasta is not null and d.vigente_hasta < v_entrega then 'VENCE_ANTES_DE_ENTREGA'
              else 'OK' end,
         d.id, d.nombre_archivo, d.vigente_hasta
    from (values ('COA', v_coa, l.id), ('REGISTRO_SANITARIO', v_rs, l.producto_id), ('BPM', v_bpm, v_fab)) as t(tipo, exigido, alcance)
    left join wms.documentos_vigentes d on d.tipo = t.tipo and coalesce(d.lote_id, d.producto_id, d.fabricante_id) = t.alcance
   order by case t.tipo when 'COA' then 1 when 'REGISTRO_SANITARIO' then 2 else 3 end;
end $$;

-- Revisión diaria de vigencias: avisa a Dirección Técnica de un documento vencido o por vencer. (Lo FALTANTE se ve en la pantalla y se bloquea al usarlo.)
create or replace function wms.revisar_documentos_regulatorios() returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  r record; v_n integer := 0; v_hoy date := wms._hoy_lima();
  v_dias integer := coalesce((select valor::integer from wms.parametros where clave = 'documentos_dias_aviso_vencimiento'), 30);
begin
  if not wms.es_usuario() then raise exception 'Sin permiso' using errcode = '42501'; end if;
  for r in
    select d.id, d.tipo, d.nombre_archivo, d.vigente_hasta,
           case d.tipo when 'COA' then 'lote ' || (select codigo from wms.lotes where id = d.lote_id)
                       when 'REGISTRO_SANITARIO' then 'el producto ' || (select codigo from catalogo.productos where id = d.producto_id)
                       else 'el fabricante ' || (select nombre from wms.fabricantes where id = d.fabricante_id) end as de
      from wms.documentos_vigentes d
     where d.vigente_hasta is not null and d.vigente_hasta <= v_hoy + v_dias
  loop
    perform wms._alertar('DOCUMENTO_VENCIDO', 'direccion_tecnica', null, null, 'doc:' || r.id || ':' || case when r.vigente_hasta < v_hoy then 'v' else 'pv' end,
      case when r.vigente_hasta < v_hoy
           then format('El %s de %s (%s) venció el %s. Sin una versión vigente no sale en el paquete documental.', case r.tipo when 'COA' then 'COA' when 'BPM' then 'BPM' else 'registro sanitario' end, r.de, r.nombre_archivo, to_char(r.vigente_hasta, 'DD/MM/YYYY'))
           else format('El %s de %s (%s) vence el %s (en %s días). Prepara su reemplazo.', case r.tipo when 'COA' then 'COA' when 'BPM' then 'BPM' else 'registro sanitario' end, r.de, r.nombre_archivo, to_char(r.vigente_hasta, 'DD/MM/YYYY'), r.vigente_hasta - v_hoy) end);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Lotes con stock que todavía no tienen COA vigente (para la pantalla; no es una alerta: sería ruido con todo el stock inicial).
create or replace function wms.lotes_sin_coa()
returns table (lote_id uuid, lote text, producto_id uuid, producto_codigo text, producto text, unidades integer, vence date)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  return query
  select l.id, l.codigo, l.producto_id, p.codigo, p.descripcion, sum(s.cantidad)::integer, l.vence
    from wms.saldos s join wms.lotes l on l.id = s.lote_id join catalogo.productos p on p.id = l.producto_id
   where s.cantidad > 0 and s.estado <> 'BAJAS_RECHAZADOS'
     and not exists (select 1 from wms.documentos_vigentes d where d.tipo = 'COA' and d.lote_id = l.id)
   group by l.id, l.codigo, l.producto_id, p.codigo, p.descripcion, l.vence
   order by l.vence nulls last, l.codigo;
end $$;

-- ── Carga masiva de COA ───────────────────────────────────────────────────────────────────────────────────────────────

-- p_items: [{nombre, ref, hash, bytes, lote_id (null si la lectura automática no pudo relacionarlo), motivo, candidatos:[{lote_id, lote, producto}]}].
-- Con lote → se importa como COA vigente de ese lote (si el lote ya tiene COA o el mismo archivo ya está, no se pisa nada: queda por revisar o duplicado).
create or replace function wms.registrar_carga_coa(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  e jsonb; v_carga uuid := gen_random_uuid(); v_imp integer := 0; v_rev integer := 0; v_dup integer := 0; v_tot integer := 0;
  v_lote uuid; v_doc uuid; v_estado text; v_motivo text; v_hash text;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (wms.tiene_permiso('gestionar_documentos_regulatorios') or wms.tiene_rol('jefe_almacen', 'asistente_dt')) then
    raise exception 'No tienes permiso para cargar COA en bloque' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'No hay archivos para cargar' using errcode = 'P0001'; end if;
  insert into wms.cargas_coa (id, creada_por) values (v_carga, auth.uid());
  for e in select x from jsonb_array_elements(p_items) x loop
    v_tot := v_tot + 1;
    v_hash := lower(coalesce(e->>'hash', ''));
    v_lote := nullif(e->>'lote_id', '')::uuid;
    v_motivo := nullif(btrim(coalesce(e->>'motivo', '')), '');
    v_doc := null;
    if v_hash !~ '^[0-9a-f]{64}$' or coalesce((e->>'bytes')::integer, 0) <= 0 or coalesce(e->>'nombre', '') = '' or coalesce(e->>'ref', '') = '' then
      raise exception 'Cada archivo trae su nombre, ruta, tamaño y hash' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.documentos_regulatorios d where d.hash_sha256 = v_hash and d.tipo = 'COA')
       or exists (select 1 from wms.cargas_coa_items i where i.hash_sha256 = v_hash and i.estado in ('IMPORTADO', 'POR_REVISAR')) then
      v_estado := 'DUPLICADO'; v_motivo := 'Este mismo archivo ya está cargado.'; v_dup := v_dup + 1; v_lote := null;
    elsif v_lote is not null and exists (select 1 from wms.documentos_vigentes d where d.tipo = 'COA' and d.lote_id = v_lote) then
      v_estado := 'POR_REVISAR'; v_motivo := 'El lote ya tiene un COA vigente: solo Dirección Técnica lo reemplaza.'; v_rev := v_rev + 1;
    elsif v_lote is not null and exists (select 1 from wms.lotes where id = v_lote) then
      insert into wms.documentos_regulatorios (tipo, lote_id, nombre_archivo, archivo_ref, hash_sha256, tamano_bytes, subido_por)
      values ('COA', v_lote, e->>'nombre', e->>'ref', v_hash, (e->>'bytes')::integer, auth.uid()) returning id into v_doc;
      v_estado := 'IMPORTADO'; v_imp := v_imp + 1; v_motivo := null;
    else
      v_estado := 'POR_REVISAR'; v_rev := v_rev + 1; v_lote := null;
      v_motivo := coalesce(v_motivo, 'No se pudo relacionar con un lote.');
    end if;
    insert into wms.cargas_coa_items (carga_id, nombre_archivo, archivo_ref, hash_sha256, tamano_bytes, estado, lote_id, documento_id, motivo, candidatos)
    values (v_carga, e->>'nombre', e->>'ref', v_hash, (e->>'bytes')::integer, v_estado, v_lote, v_doc, v_motivo, coalesce(e->'candidatos', '[]'::jsonb));
  end loop;
  update wms.cargas_coa set total = v_tot, importados = v_imp, por_revisar = v_rev, duplicados = v_dup where id = v_carga;
  perform wms.registrar_audit('carga_coa', 'cargas_coa', v_carga::text, null, jsonb_build_object('total', v_tot, 'importados', v_imp, 'por_revisar', v_rev, 'duplicados', v_dup), null);
  return jsonb_build_object('carga_id', v_carga, 'total', v_tot, 'importados', v_imp, 'por_revisar', v_rev, 'duplicados', v_dup);
end $$;

-- Asignar a mano (o por «reintentar») un archivo por revisar a un lote.
create or replace function wms.asignar_item_coa(p_item uuid, p_lote uuid) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare i wms.cargas_coa_items; v_doc uuid;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (wms.tiene_permiso('gestionar_documentos_regulatorios') or wms.tiene_rol('jefe_almacen', 'asistente_dt')) then
    raise exception 'No tienes permiso para resolver la carga de COA' using errcode = '42501';
  end if;
  select * into i from wms.cargas_coa_items where id = p_item for update;
  if not found then raise exception 'No encontramos ese archivo' using errcode = 'P0001'; end if;
  if i.estado <> 'POR_REVISAR' then raise exception 'Ese archivo ya se resolvió' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.lotes where id = p_lote) then raise exception 'No encontramos ese lote' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.documentos_vigentes d where d.tipo = 'COA' and d.lote_id = p_lote) then
    raise exception 'El lote ya tiene un COA vigente: solo Dirección Técnica lo reemplaza' using errcode = 'P0001';
  end if;
  insert into wms.documentos_regulatorios (tipo, lote_id, nombre_archivo, archivo_ref, hash_sha256, tamano_bytes, subido_por)
  values ('COA', p_lote, i.nombre_archivo, i.archivo_ref, i.hash_sha256, i.tamano_bytes, auth.uid()) returning id into v_doc;
  update wms.cargas_coa_items set estado = 'IMPORTADO', lote_id = p_lote, documento_id = v_doc, motivo = null, resuelto_por = auth.uid(), resuelto_en = now() where id = p_item;
  perform wms.registrar_audit('coa_asignado', 'cargas_coa_items', p_item::text, null, jsonb_build_object('lote_id', p_lote, 'documento_id', v_doc), null);
  return v_doc;
end $$;

create or replace function wms.descartar_item_coa(p_item uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare i wms.cargas_coa_items; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (wms.tiene_permiso('gestionar_documentos_regulatorios') or wms.tiene_rol('jefe_almacen', 'asistente_dt')) then
    raise exception 'No tienes permiso para resolver la carga de COA' using errcode = '42501';
  end if;
  if v_motivo is null then raise exception 'Indica por qué se descarta' using errcode = 'P0001'; end if;
  select * into i from wms.cargas_coa_items where id = p_item for update;
  if not found then raise exception 'No encontramos ese archivo' using errcode = 'P0001'; end if;
  if i.estado <> 'POR_REVISAR' then raise exception 'Ese archivo ya se resolvió' using errcode = 'P0001'; end if;
  update wms.cargas_coa_items set estado = 'DESCARTADO', motivo = v_motivo, resuelto_por = auth.uid(), resuelto_en = now() where id = p_item;
  perform wms.registrar_audit('coa_descartado', 'cargas_coa_items', p_item::text, null, null, v_motivo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grants (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function
  wms.crear_fabricante(text), wms.asignar_fabricante_producto(uuid, uuid),
  wms.subir_documento_regulatorio(text, uuid, text, text, text, integer, date, date, uuid, text),
  wms.guardar_perfil_documental(text, boolean, boolean, boolean, integer, text), wms.estado_documental(uuid, text, date),
  wms.revisar_documentos_regulatorios(), wms.lotes_sin_coa(), wms.registrar_carga_coa(jsonb), wms.asignar_item_coa(uuid, uuid), wms.descartar_item_coa(uuid, text)
  to authenticated;
revoke execute on all functions in schema wms from public;
