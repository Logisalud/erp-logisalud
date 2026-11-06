-- 0040 · WMS · Piloto F: reglas nuevas de vencimiento, vida útil mínima y formato organoléptico versionado
--
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0005, 0006, 0035 y 0039. Termina con el `revoke execute … from public`.
--
--   1. Vencimiento con solo mes y año: parámetro `vencimiento_dia_por_defecto` (nace en `primero`; antes se había decidido el último día: A CONFIRMAR con Katia).
--      El día lo aplica la aplicación al leer «06/2028»; la base solo guarda y valida el parámetro.
--   2. Proveedores con «vencimiento solo mes y año» (`wms.proveedores_config`, tabla propia del WMS; lee los proveedores de Compras por la vista
--      `wms.v_proveedores` y NO escribe nada allá). Al verificar una línea de ese proveedor nace la alerta `VENCIMIENTO_VERIFICAR`.
--   3. Vida útil mínima al recibir (`vida_util_minima_meses` = 24): si al lote le quedan menos meses, alerta `VIDA_UTIL_CORTA` para Dirección Técnica.
--   4. Corregir la fecha de vencimiento de un lote ya registrado es un cambio AUDITADO: `wms.corregir_vencimiento_lote` (Jefe de Almacén o Dirección Técnica,
--      con motivo) y su historial inmutable `wms.lote_vencimiento_cambios`.
--   5. Producto «sin material de envase» (lo marca Dirección Técnica; con historial como los demás datos regulatorios).
--   6. Formato controlado: `wms.formatos_versiones` (la versión 2 del acta organoléptica nace PENDIENTE y rige solo cuando Dirección Técnica la aprueba) y
--      `actas_organolepticas.formato_version` (la versión vigente al crear el acta; no cambia).

-- Parche por texto (el mismo ayudante de la 0035): cambia el texto exacto de una función y, si no está, falla en voz alta (re-ejecutable). Es interno.
create or replace function wms._parchar_funcion(p_nombre text, p_viejo text, p_nuevo text) returns void
language plpgsql set search_path = wms, pg_temp as $$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = p_nombre order by p.oid desc limit 1;
  if v_oid is null then raise exception 'No existe wms.%', p_nombre; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(p_viejo in v_def) = 0 then
    if position(p_nuevo in v_def) > 0 then return; end if;
    raise exception 'No se encontró el texto esperado en wms.%: %', p_nombre, p_viejo;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 y 3. Parámetros y su validación
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.parametros (clave, valor, nota) values
  ('vencimiento_dia_por_defecto', 'primero', 'Día que se asume cuando el producto solo muestra mes y año: primero | ultimo. Valor inicial: primer día del mes (A CONFIRMAR con Katia; antes se había decidido el último día).'),
  ('vida_util_minima_meses', '24', 'Meses de vida útil que debe quedarle a un lote al recibirlo; con menos, alerta a Dirección Técnica.')
on conflict (clave) do nothing;

-- Misma función de la 0038 más dos reglas.
create or replace function wms.trg_validar_parametro() returns trigger
language plpgsql as $$
declare v text := btrim(coalesce(new.valor, ''));
begin
  if new.clave like 'guia\_motivo\_codigo\_%' and v !~ '^[0-9]{2}$' then
    raise exception 'El código del motivo de traslado son 2 números (Catálogo 20 de SUNAT), por ejemplo 01, 06 o 13' using errcode = 'P0001';
  end if;
  if new.clave like 'guia\_motivo\_otros\_descripcion\_%' then
    if char_length(v) < 1 or char_length(v) > 70 then
      raise exception 'La descripción del motivo «otros» lleva entre 1 y 70 caracteres (Nubefact no acepta más)' using errcode = 'P0001';
    end if;
    new.valor := v;
  end if;
  if new.clave = 'factura_anulacion_directa_dias' and (v !~ '^[0-9]{1,3}$' or v::integer < 1) then
    raise exception 'El plazo de anulación directa de la factura son días enteros, de 1 a 999' using errcode = 'P0001';
  end if;
  if new.clave = 'guia_modo' then
    if upper(v) not in ('WMS', 'PANEL') then
      raise exception 'La guía se emite con el WMS o en el panel: escribe WMS o PANEL' using errcode = 'P0001';
    end if;
    new.valor := upper(v);
  end if;
  if new.clave = 'modo_piloto' then
    if lower(v) not in ('si', 'no') then
      raise exception 'El modo piloto se enciende con «si» y se apaga con «no»' using errcode = 'P0001';
    end if;
    new.valor := lower(v);
  end if;
  if new.clave = 'vencimiento_dia_por_defecto' then
    if lower(v) not in ('primero', 'ultimo') then
      raise exception 'El día por defecto del vencimiento con solo mes y año es «primero» o «ultimo»' using errcode = 'P0001';
    end if;
    new.valor := lower(v);
  end if;
  if new.clave = 'vida_util_minima_meses' and (v !~ '^[0-9]{1,3}$' or v::integer < 1 or v::integer > 120) then
    raise exception 'La vida útil mínima son meses enteros, de 1 a 120' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Una fila vieja que ya existiera con un valor fuera de regla se normaliza ANTES de que el disparador la vigile.
update wms.parametros set valor = 'primero' where clave = 'vencimiento_dia_por_defecto' and lower(btrim(valor)) not in ('primero', 'ultimo');
update wms.parametros set valor = '24' where clave = 'vida_util_minima_meses' and (btrim(valor) !~ '^[0-9]{1,3}$' or btrim(valor)::integer not between 1 and 120);

select wms._ampliar_check_in('wms.alertas', 'alertas_tipo_check', 'tipo', array['VENCIMIENTO_VERIFICAR', 'VIDA_UTIL_CORTA']);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Proveedores: marca «vencimiento solo mes y año» (tabla propia del WMS; Compras solo se lee)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.proveedores_config (
  ruc text primary key check (ruc ~ '^[0-9]{11}$'),
  nombre text,
  vence_solo_mes_anio boolean not null default false,
  actualizado_por uuid,
  actualizado_en timestamptz not null default now()
);
alter table wms.proveedores_config enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'proveedores_config' and policyname = 'lectura') then
    create policy lectura on wms.proveedores_config for select to authenticated using (wms.es_usuario());
  end if;
end $$;
grant select on wms.proveedores_config to authenticated;

-- Los proveedores de Compras (solo lectura). Sin Compras en la base, la vista no existe y la pantalla muestra solo los que ya tienen marca.
do $$ begin
  if to_regclass('compras.proveedores') is not null then
    execute $v$create or replace view wms.v_proveedores with (security_invoker = true) as
      select pv.id as proveedor_id, pv.ruc, pv.razon_social as nombre from compras.proveedores pv where pv.ruc is not null$v$;
    execute 'grant select on wms.v_proveedores to authenticated';
  end if;
end $$;

create or replace function wms.marcar_proveedor_vencimiento(p_ruc text, p_nombre text, p_solo_mes_anio boolean, p_motivo text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_antes boolean;
begin
  if not wms.tiene_rol('direccion_tecnica', 'asistente_dt', 'admin_wms') then
    raise exception 'Solo Dirección Técnica, su asistente y el Administrador marcan a un proveedor' using errcode = '42501';
  end if;
  if p_ruc is null or p_ruc !~ '^[0-9]{11}$' then raise exception 'El RUC tiene 11 dígitos' using errcode = 'P0001'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Cuéntanos por qué cambia: el motivo es obligatorio' using errcode = 'P0001'; end if;
  select vence_solo_mes_anio into v_antes from wms.proveedores_config where ruc = p_ruc for update;
  insert into wms.proveedores_config (ruc, nombre, vence_solo_mes_anio, actualizado_por, actualizado_en)
  values (p_ruc, nullif(trim(p_nombre), ''), coalesce(p_solo_mes_anio, false), auth.uid(), now())
  on conflict (ruc) do update set vence_solo_mes_anio = excluded.vence_solo_mes_anio, nombre = coalesce(excluded.nombre, wms.proveedores_config.nombre),
    actualizado_por = auth.uid(), actualizado_en = now();
  perform wms.registrar_audit('proveedor_vencimiento_marcado', 'proveedores_config', p_ruc,
    jsonb_build_object('vence_solo_mes_anio', coalesce(v_antes, false)), jsonb_build_object('vence_solo_mes_anio', coalesce(p_solo_mes_anio, false)), p_motivo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 y 3. Avisos al recibir (se llaman desde verificar_linea)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._avisos_vencimiento(p_linea uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  l wms.solicitud_ingreso_lineas;
  s wms.solicitudes_ingreso;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_min integer;
  v_meses integer;
begin
  select * into l from wms.solicitud_ingreso_lineas where id = p_linea;
  if not found then return; end if;
  select * into s from wms.solicitudes_ingreso where id = l.solicitud_id;
  if s.contraparte_ruc is not null and exists (select 1 from wms.proveedores_config c where c.ruc = s.contraparte_ruc and c.vence_solo_mes_anio) then
    perform wms._alertar('VENCIMIENTO_VERIFICAR', 'jefe_almacen', null, l.producto_id, 'venc-verificar:' || p_linea,
      coalesce(s.contraparte_nombre, 'Este proveedor') || ' solo imprime mes y año en sus productos. Verifica en el envase la fecha de vencimiento del lote ' || l.lote || ' antes de confirmar.',
      l.lote, s.id);
  end if;
  if l.vence is null then return; end if;
  v_min := coalesce((select valor::integer from wms.parametros where clave = 'vida_util_minima_meses'), 24);
  v_meses := (extract(year from age(l.vence, v_hoy)) * 12 + extract(month from age(l.vence, v_hoy)))::integer;
  if l.vence < v_hoy then
    perform wms._alertar('VIDA_UTIL_CORTA', 'direccion_tecnica', null, l.producto_id, 'vida-util:' || p_linea || ':' || l.vence,
      'El lote ' || l.lote || ' llega vencido. Dirección Técnica decide qué se hace.', l.lote, s.id);
  elsif v_meses < v_min then
    perform wms._alertar('VIDA_UTIL_CORTA', 'direccion_tecnica', null, l.producto_id, 'vida-util:' || p_linea || ':' || l.vence,
      'Al lote ' || l.lote || ' le quedan ' || v_meses || case when v_meses = 1 then ' mes' else ' meses' end || ' de vida útil, menos de los ' || v_min
      || ' mínimos. Dirección Técnica decide si se acepta.', l.lote, s.id);
  end if;
end $$;

do $$ begin
  perform wms._parchar_funcion('verificar_linea', $q$  perform wms.registrar_audit('linea_verificada'$q$,
    $q$  perform wms._avisos_vencimiento(p_linea);
  perform wms.registrar_audit('linea_verificada'$q$);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Corregir la fecha de vencimiento de un lote: cambio auditado, no edición libre
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.lote_vencimiento_cambios (
  id bigint generated always as identity primary key,
  lote_id uuid not null references wms.lotes(id),
  antes date,
  despues date not null,
  antes_texto text,
  motivo text not null check (nullif(trim(motivo), '') is not null),
  usuario uuid not null,
  ts timestamptz not null default now()
);
alter table wms.lote_vencimiento_cambios enable row level security;
create index if not exists lote_venc_cambios_idx on wms.lote_vencimiento_cambios (lote_id, id);
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'lote_venc_cambios_inmutable' and tgrelid = 'wms.lote_vencimiento_cambios'::regclass) then
    create trigger lote_venc_cambios_inmutable before update or delete on wms.lote_vencimiento_cambios
      for each row execute function wms.trg_inmutable();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'lote_venc_cambios_inmutable_tr' and tgrelid = 'wms.lote_vencimiento_cambios'::regclass) then
    create trigger lote_venc_cambios_inmutable_tr before truncate on wms.lote_vencimiento_cambios
      for each statement execute function wms.trg_inmutable();
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'lote_vencimiento_cambios' and policyname = 'lectura') then
    create policy lectura on wms.lote_vencimiento_cambios for select to authenticated using (wms.es_usuario());
  end if;
end $$;
grant select on wms.lote_vencimiento_cambios to authenticated;

-- Misma firma de la 0005; ahora también la corrige el Jefe de Almacén, y deja su historial.
create or replace function wms.corregir_vencimiento_lote(p_lote uuid, p_vence date, p_motivo text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare v wms.lotes;
begin
  if not wms.tiene_rol('direccion_tecnica', 'jefe_almacen', 'reemplazo_jefe') then
    raise exception 'Solo el Jefe de Almacén (o su reemplazo) y Dirección Técnica corrigen el vencimiento de un lote registrado' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'La corrección necesita un motivo' using errcode = 'P0001'; end if;
  if p_vence is null then raise exception 'Falta la fecha correcta' using errcode = 'P0001'; end if;
  select * into v from wms.lotes where id = p_lote for update;
  if not found then raise exception 'Lote inexistente' using errcode = 'P0001'; end if;
  if v.vence is not distinct from p_vence then raise exception 'Esa ya es la fecha del lote: no hay nada que corregir' using errcode = 'P0001'; end if;
  update wms.lotes set vence = p_vence, vence_texto_original = null where id = p_lote;
  insert into wms.lote_vencimiento_cambios (lote_id, antes, despues, antes_texto, motivo, usuario)
  values (p_lote, v.vence, p_vence, v.vence_texto_original, trim(p_motivo), auth.uid());
  perform wms.registrar_audit('lote_vencimiento_corregido', 'lotes', p_lote::text,
    jsonb_build_object('vence', v.vence), jsonb_build_object('vence', p_vence), p_motivo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. «Sin material de envase» (dato regulatorio que marca Dirección Técnica, con historial)
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.producto_regulatorio add column if not exists sin_material_envase boolean not null default false;

-- Parche sobre la `editar_regulatorio` que exista (la de la 0006, o la de la 0008 si ya se aplicó); no depende del texto de la 0008. Re-ejecutable.
do $$ begin
  if position('sin_material_envase' in pg_get_functiondef('wms.editar_regulatorio(uuid, jsonb, text)'::regprocedure)) = 0 then
    perform wms._parchar_funcion('editar_regulatorio', $q$'condicion_almacenamiento'];$q$, $q$'condicion_almacenamiento', 'sin_material_envase'];$q$);
    perform wms._parchar_funcion('editar_regulatorio', $q$    v_despues := nullif(trim(p_datos->>k), '');$q$,
      $q$    v_despues := nullif(trim(p_datos->>k), '');
    if k = 'sin_material_envase' then
      if not wms.tiene_rol('direccion_tecnica') then
        raise exception 'Solo Dirección Técnica marca un producto como «sin material de envase»' using errcode = '42501';
      end if;
      v_despues := case when lower(coalesce(v_despues, 'false')) in ('true', 'si', 'sí', 't', '1') then 'true' else 'false' end;
    end if;$q$);
    perform wms._parchar_funcion('editar_regulatorio', $q$k = 'rs_vence' then$q$,
      $q$k = 'sin_material_envase' then
      execute 'update wms.producto_regulatorio set sin_material_envase = $1::boolean where producto_id = $2' using v_despues, p_producto;
    elsif k = 'rs_vence' then$q$);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Formato controlado: versiones y aprobación de Dirección Técnica
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.formatos_versiones (
  formato text not null check (formato in ('ACTA_ORGANOLEPTICA')),
  version integer not null check (version >= 1),
  resumen text not null,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'APROBADA')),
  propuesta_en timestamptz not null default now(),
  aprobada_por uuid,
  aprobada_en timestamptz,
  primary key (formato, version),
  check (estado = 'PENDIENTE' or (aprobada_en is not null))
);
alter table wms.formatos_versiones enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'formatos_versiones' and policyname = 'lectura') then
    create policy lectura on wms.formatos_versiones for select to authenticated using (wms.es_usuario());
  end if;
end $$;
grant select on wms.formatos_versiones to authenticated;

-- La versión 1 es el formato de hoy (aprobada); la 2 queda PENDIENTE de Katia.
insert into wms.formatos_versiones (formato, version, resumen, estado, aprobada_en) values
  ('ACTA_ORGANOLEPTICA', 1, 'Formato original: el material del envase se llena siempre.', 'APROBADA', now())
on conflict (formato, version) do nothing;
insert into wms.formatos_versiones (formato, version, resumen, estado) values
  ('ACTA_ORGANOLEPTICA', 2, 'El punto «Material del envase» se oculta cuando Dirección Técnica marca el producto como «sin material de envase».', 'PENDIENTE')
on conflict (formato, version) do nothing;

create or replace function wms.formato_version_vigente(p_formato text) returns integer
language sql stable security definer set search_path = wms, pg_temp as $$
  select coalesce(max(version), 1) from wms.formatos_versiones where formato = p_formato and estado = 'APROBADA'
$$;

create or replace function wms.aprobar_version_formato(p_formato text, p_version integer)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare f wms.formatos_versiones;
begin
  if not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica aprueba una versión de un formato controlado' using errcode = '42501';
  end if;
  select * into f from wms.formatos_versiones where formato = p_formato and version = p_version for update;
  if not found then raise exception 'Esa versión del formato no existe' using errcode = 'P0001'; end if;
  if f.estado = 'APROBADA' then raise exception 'Esa versión ya está aprobada' using errcode = 'P0001'; end if;
  update wms.formatos_versiones set estado = 'APROBADA', aprobada_por = auth.uid(), aprobada_en = now() where formato = p_formato and version = p_version;
  perform wms.registrar_audit('formato_version_aprobada', 'formatos_versiones', p_formato || ':' || p_version, null, jsonb_build_object('version', p_version), f.resumen);
end $$;

-- Solo el paso de PENDIENTE a APROBADA (por la función); las versiones no se borran ni se reescriben.
create or replace function wms.trg_formato_version_guardia() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Una versión de un formato no se borra' using errcode = 'P0001'; end if;
  if old.estado = 'APROBADA' then raise exception 'Una versión aprobada no se modifica' using errcode = 'P0001'; end if;
  if (new.formato, new.version, new.resumen, new.propuesta_en) is distinct from (old.formato, old.version, old.resumen, old.propuesta_en) then
    raise exception 'Solo se aprueba una versión: su contenido no se edita' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'formato_version_guardia' and tgrelid = 'wms.formatos_versiones'::regclass) then
    create trigger formato_version_guardia before update or delete on wms.formatos_versiones
      for each row execute function wms.trg_formato_version_guardia();
  end if;
end $$;

-- El acta organoléptica recuerda con qué versión del formato nació (no cambia después).
alter table wms.actas_organolepticas add column if not exists formato_version integer not null default 1;
create or replace function wms.trg_acta_org_version() returns trigger
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  new.formato_version := wms.formato_version_vigente('ACTA_ORGANOLEPTICA');
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'acta_org_version' and tgrelid = 'wms.actas_organolepticas'::regclass) then
    create trigger acta_org_version before insert on wms.actas_organolepticas
      for each row execute function wms.trg_acta_org_version();
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.marcar_proveedor_vencimiento(text, text, boolean, text), wms.aprobar_version_formato(text, integer),
  wms.corregir_vencimiento_lote(uuid, date, text), wms.editar_regulatorio(uuid, jsonb, text), wms.verificar_linea(uuid, boolean, integer, text, date, text, uuid, text) to authenticated;
revoke execute on all functions in schema wms from public;
