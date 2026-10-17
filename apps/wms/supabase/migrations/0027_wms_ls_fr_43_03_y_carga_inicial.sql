-- 0027 · WMS · Orden de Salida · OS-7: cambios del formato LS-FR.43.03 y carga inicial como «cambio de sistema»
--
-- Respuestas de Dirección Técnica del 2026-10-17 (docs/wms/respuestas-dt-2026-10.md, §9 y §10):
--
-- A. LS-FR.43.03 «Planificación de ruta»
--   1. USUARIO = el Jefe de Transporte que prepara la ruta; «N.° de cajas» = bultos (caja master). Los parámetros que lo dejaban PENDIENTE quedan resueltos.
--   2. Temperatura: data logger Elitech GSP-6. AL CERRAR LA RUTA se adjunta el archivo descargado (se guarda tal cual, sin leerlo) y se registran la
--      temperatura mínima y máxima, con quién y cuándo (`ruta_cierres`). Cerrar una ruta es el paso mínimo EN_RUTA / PENDIENTE_CIERRE → CERRADA: el resto del
--      cierre (cargos, entregas, retorno) es de otro PR. Corregir un cierre crea una versión nueva con motivo; la anterior queda.
--   3. Se imprime una copia antes de la salida, que viaja con el conductor: cada impresión queda registrada (`ls_fr_impresiones`, quién y cuándo). Liberar
--      la unidad advierte si no se imprimió (advertencia en la pantalla; no bloquea).
--   4. Firmas físicas (conductor y Dirección Técnica): se sube el escaneo firmado (`ls_fr_escaneos`) y queda ligado a la ruta. Cambiarlo exige motivo y deja la
--      versión anterior. Conservación: 5 años (parámetro `ls_fr_43_03_conservacion_anios`); cada escaneo guarda su fecha «conservar hasta». Nada se borra.
-- B. Carga inicial = cambio de sistema, no reproceso (D-99)
--   El stock de Odoo entra directo a su estado y ubicación, sin acta organoléptica ni recepción, pero el libro mayor muestra el recorrido real:
--   ingreso por carga inicial en Cuarentena → liberación (cambio de estado) → ubicación final (movimiento). Todo en la misma confirmación, con movimientos
--   reales e inmutables. Dirección Técnica valida con UNA sola confirmación (ya no hay un paso aparte para «decidir el estado»). Todo lote lleva código de
--   lote y vencimiento (en la validación y como restricción de la tabla).
--
-- Re-ejecutable. Se aplica a mano, después de la 0026 (necesita la 0022: `_ampliar_check_in`). Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Permisos y parámetros
-- ─────────────────────────────────────────────────────────────────────────────

-- Se AGREGAN valores al check (otras migraciones agregan los suyos en paralelo: reescribir la lista completa los pisaría).
select wms._ampliar_check_in('wms.permisos_rol', 'permisos_rol_accion_check', 'accion', array['cerrar_ruta', 'registrar_ls_fr']);

-- Cerrar la ruta: el Jefe de Transporte. Imprimir la copia y subir el escaneo firmado: quien lleva el papel (Transporte, Almacén) y Dirección Técnica, que lo firma.
insert into wms.permisos_rol (rol, accion) values
  ('jefe_transporte', 'cerrar_ruta'),
  ('jefe_transporte', 'registrar_ls_fr'), ('jefe_almacen', 'registrar_ls_fr'), ('direccion_tecnica', 'registrar_ls_fr'), ('asistente_dt', 'registrar_ls_fr')
on conflict (rol, accion) do nothing;
-- (A Dirección Técnica NO se le da el permiso `configurar`: con él podría registrar ingresos de carga inicial sueltos. Valida la carga solo por `confirmar_carga_inicial`.)

-- Las cuatro definiciones pendientes del formato quedan resueltas (solo si nadie las cambió).
update wms.parametros set valor = 'Jefe de Transporte (quien prepara la ruta)',
  nota = 'DT 2026-10-17 (OS-7): la columna USUARIO del LS-FR.43.03 es el Jefe de Transporte que prepara la ruta.' where clave = 'ls_fr_43_03_usuario_significado' and valor = 'PENDIENTE';
update wms.parametros set valor = 'SI',
  nota = 'DT 2026-10-17 (OS-7): «N.° cajas» del formato = bultos (caja master).' where clave = 'cajas_equivale_a_bultos' and valor = 'PENDIENTE';
update wms.parametros set valor = 'Data logger Elitech GSP-6: mínima y máxima al cerrar la ruta',
  nota = 'DT 2026-10-17 (OS-7): la temperatura sale del data logger Elitech GSP-6; al cerrar la ruta se adjunta el archivo y se registran mínima y máxima.' where clave = 'ls_fr_43_03_temperatura_metodo' and valor = 'PENDIENTE';
update wms.parametros set valor = 'SI',
  nota = 'DT 2026-10-17 (OS-7): se imprime una copia antes de la salida y viaja con el conductor; la impresión queda registrada.' where clave = 'ls_fr_43_03_copia_fisica' and valor = 'PENDIENTE';

insert into wms.parametros (clave, valor, nota) values
  ('ls_fr_43_03_conservacion_anios', '5', 'DT 2026-10-17 (OS-7): el LS-FR.43.03 firmado se conserva 5 años, en físico y en digital (el escaneo en el WMS). Nada se borra; cada escaneo guarda su fecha «conservar hasta».'),
  ('ls_fr_43_03_temp_min_c', '15', 'Rango del formato LS-FR.43.03 (encabezado de la columna TEMPERATURA): una mínima o máxima fuera de este rango se marca en el cierre de la ruta.'),
  ('ls_fr_43_03_temp_max_c', '25', 'Rango del formato LS-FR.43.03 (encabezado de la columna TEMPERATURA).'),
  ('ls_fr_43_03_logger_formato', 'PENDIENTE', 'Pendiente (Sebas): el formato del archivo que descarga el data logger Elitech GSP-6. Mientras tanto el archivo se guarda tal cual, sin leerlo; la mínima y la máxima se escriben a mano.'),
  ('ls_fr_43_03_temperatura_fuera_de_rango', 'PENDIENTE', 'Pendiente de Dirección Técnica: qué se hace cuando la temperatura registrada sale del rango del formato. Hoy solo se marca en el cierre y en el PDF; no bloquea ni genera alertas.')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tablas del LS-FR.43.03: cierre de ruta, impresiones y escaneo firmado (solo se agregan filas)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.ruta_cierres (
  id uuid primary key default gen_random_uuid(),
  ruta_id uuid not null references wms.rutas(id),
  version integer not null default 1 check (version >= 1),
  temp_min numeric(4, 1) not null,
  temp_max numeric(4, 1) not null,
  fuera_de_rango boolean not null,                 -- fuera del rango del formato (parámetros `ls_fr_43_03_temp_min_c` / `_max_c`)
  archivo_ref text not null check (btrim(archivo_ref) <> ''),
  archivo_nombre text not null check (btrim(archivo_nombre) <> ''),
  archivo_hash text not null check (archivo_hash ~ '^[0-9a-f]{64}$'),
  archivo_bytes integer not null check (archivo_bytes > 0),
  archivo_tipo text,
  observaciones text,
  motivo text,                                     -- obligatorio desde la segunda versión (corrección)
  cerrado_por uuid not null,
  cerrado_en timestamptz not null default now(),
  vigente boolean not null default true,
  unique (ruta_id, version),
  check (temp_min <= temp_max),
  check (version = 1 or nullif(btrim(coalesce(motivo, '')), '') is not null)
);
alter table wms.ruta_cierres enable row level security;
create unique index if not exists ruta_cierres_vigente_uk on wms.ruta_cierres (ruta_id) where vigente;

create table if not exists wms.ls_fr_impresiones (
  id uuid primary key default gen_random_uuid(),
  ruta_id uuid not null references wms.rutas(id),
  estado_ruta text not null,
  antes_de_salir boolean not null,                 -- la copia que viaja con el conductor se imprime antes de la salida
  por uuid not null,
  en timestamptz not null default now()
);
alter table wms.ls_fr_impresiones enable row level security;
create index if not exists ls_fr_impresiones_ruta_idx on wms.ls_fr_impresiones (ruta_id);

create table if not exists wms.ls_fr_escaneos (
  id uuid primary key default gen_random_uuid(),
  ruta_id uuid not null references wms.rutas(id),
  version integer not null default 1 check (version >= 1),
  archivo_ref text not null check (btrim(archivo_ref) <> ''),
  archivo_nombre text not null check (btrim(archivo_nombre) <> ''),
  archivo_hash text not null check (archivo_hash ~ '^[0-9a-f]{64}$'),
  archivo_bytes integer not null check (archivo_bytes > 0),
  archivo_tipo text,
  motivo text,                                     -- obligatorio al reemplazar
  conservar_hasta date not null,                   -- fecha de la ruta + años de conservación (parámetro)
  subido_por uuid not null,
  subido_en timestamptz not null default now(),
  vigente boolean not null default true,
  unique (ruta_id, version),
  check (version = 1 or nullif(btrim(coalesce(motivo, '')), '') is not null)
);
alter table wms.ls_fr_escaneos enable row level security;
create unique index if not exists ls_fr_escaneos_vigente_uk on wms.ls_fr_escaneos (ruta_id) where vigente;

-- Cierres y escaneos: nada se borra ni se edita; lo único que cambia es `vigente` (true → false) cuando una versión nueva la reemplaza.
create or replace function wms._ls_fr_versionado_inmutable() returns trigger language plpgsql as $$
declare v_viejo jsonb; v_nuevo jsonb;
begin
  if tg_op = 'DELETE' then raise exception 'Esto se conserva 5 años: no se borra (se reemplaza con una versión nueva y su motivo)' using errcode = 'P0001'; end if;
  v_viejo := to_jsonb(old) - 'vigente'; v_nuevo := to_jsonb(new) - 'vigente';
  if v_viejo is distinct from v_nuevo or not (old.vigente and not new.vigente) then
    raise exception 'Esto no se edita: se reemplaza con una versión nueva y su motivo' using errcode = 'P0001';
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['ruta_cierres', 'ls_fr_impresiones', 'ls_fr_escaneos'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then execute format('drop policy lectura on wms.%I', t); end if;
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
    execute format('revoke all on wms.%I from anon, authenticated', t);
    execute format('grant select on wms.%I to authenticated', t);
  end loop;
  foreach t in array array['ruta_cierres', 'ls_fr_escaneos'] loop
    if exists (select 1 from pg_trigger where tgname = t || '_inmutable' and tgrelid = ('wms.' || t)::regclass and not tgisinternal) then execute format('drop trigger %I on wms.%I', t || '_inmutable', t); end if;
    execute format('create trigger %I before update or delete on wms.%I for each row execute function wms._ls_fr_versionado_inmutable()', t || '_inmutable', t);
  end loop;
  if exists (select 1 from pg_trigger where tgname = 'ls_fr_impresiones_inmutable' and tgrelid = 'wms.ls_fr_impresiones'::regclass and not tgisinternal) then drop trigger ls_fr_impresiones_inmutable on wms.ls_fr_impresiones; end if;
  create trigger ls_fr_impresiones_inmutable before update or delete on wms.ls_fr_impresiones for each row execute function wms.trg_inmutable();
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Funciones del LS-FR.43.03
-- ─────────────────────────────────────────────────────────────────────────────

-- El registro del formato sigue a lo que pasó: impreso → completo (ruta cerrada con su data logger) → archivado (con el escaneo firmado).
create or replace function wms._sincronizar_registro_ls_fr(p_ruta uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_cierre boolean := exists (select 1 from wms.ruta_cierres where ruta_id = p_ruta and vigente);
        v_escaneo boolean := exists (select 1 from wms.ls_fr_escaneos where ruta_id = p_ruta and vigente);
begin
  update wms.registros_ls_fr_43_03 set estado = case
      when v_cierre and v_escaneo then 'ARCHIVADO'
      when v_cierre then 'COMPLETO'
      when exists (select 1 from wms.ls_fr_impresiones where ruta_id = p_ruta) then 'GENERADO'
      else estado end
   where ruta_id = p_ruta;
end $$;

-- Valida el archivo adjunto: lo sube la aplicación al almacenamiento privado y aquí solo se registra su referencia (con su hash, que también va en el nombre).
create or replace function wms._validar_adjunto(p_prefijo text, p_ref text, p_nombre text, p_hash text, p_bytes integer) returns void
language plpgsql immutable set search_path = wms, pg_temp as $$
begin
  if nullif(btrim(coalesce(p_ref, '')), '') is null or nullif(btrim(coalesce(p_nombre, '')), '') is null then raise exception 'Adjunta el archivo' using errcode = 'P0001'; end if;
  if p_ref not like p_prefijo || '/%' or coalesce(p_hash, '') !~ '^[0-9a-f]{64}$' or position(left(p_hash, 16) in p_ref) = 0 then
    raise exception 'El archivo no se subió bien: vuelve a adjuntarlo' using errcode = 'P0001';
  end if;
  if coalesce(p_bytes, 0) <= 0 then raise exception 'El archivo está vacío' using errcode = 'P0001'; end if;
end $$;

-- Cierra la ruta (paso mínimo): adjunta el archivo del data logger y registra la temperatura mínima y máxima. Desde EN_RUTA (salida confirmada) o
-- PENDIENTE_CIERRE. Lo hace el Jefe de Transporte (permiso `cerrar_ruta`).
create or replace function wms.cerrar_ruta(
  p_ruta uuid, p_temp_min numeric, p_temp_max numeric, p_archivo_ref text, p_archivo_nombre text, p_archivo_hash text, p_archivo_bytes integer,
  p_archivo_tipo text default null, p_observaciones text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas; v_id uuid := gen_random_uuid(); v_fuera boolean; v_min numeric := coalesce((select valor from wms.parametros where clave = 'ls_fr_43_03_temp_min_c'), '15')::numeric;
        v_max numeric := coalesce((select valor from wms.parametros where clave = 'ls_fr_43_03_temp_max_c'), '25')::numeric;
begin
  perform wms._exigir_accion('cerrar_ruta', 'Solo el Jefe de Transporte cierra la ruta');
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if r.estado = 'CERRADA' then raise exception 'La ruta ya está cerrada. Si algo del cierre está mal, corrígelo con su motivo' using errcode = 'P0001'; end if;
  if r.estado not in ('EN_RUTA', 'PENDIENTE_CIERRE') then
    raise exception 'La ruta todavía no salió (está %): se cierra cuando la salida está confirmada', lower(replace(r.estado, '_', ' ')) using errcode = 'P0001';
  end if;
  if p_temp_min is null or p_temp_max is null then raise exception 'Escribe la temperatura mínima y la máxima que marcó el data logger' using errcode = 'P0001'; end if;
  if p_temp_min < -50 or p_temp_max > 80 then raise exception 'Revisa las temperaturas: el data logger no marca valores tan lejanos (entre -50 y 80 °C)' using errcode = 'P0001'; end if;
  if p_temp_min > p_temp_max then raise exception 'La temperatura mínima no puede ser mayor que la máxima' using errcode = 'P0001'; end if;
  perform wms._validar_adjunto('data_logger', p_archivo_ref, p_archivo_nombre, p_archivo_hash, p_archivo_bytes);
  v_fuera := p_temp_min < v_min or p_temp_max > v_max;
  insert into wms.ruta_cierres (id, ruta_id, temp_min, temp_max, fuera_de_rango, archivo_ref, archivo_nombre, archivo_hash, archivo_bytes, archivo_tipo, observaciones, cerrado_por)
  values (v_id, p_ruta, p_temp_min, p_temp_max, v_fuera, btrim(p_archivo_ref), btrim(p_archivo_nombre), p_archivo_hash, p_archivo_bytes, nullif(btrim(coalesce(p_archivo_tipo, '')), ''),
          nullif(btrim(coalesce(p_observaciones, '')), ''), auth.uid());
  update wms.rutas set estado = 'CERRADA' where id = p_ruta;
  perform wms._sincronizar_registro_ls_fr(p_ruta);
  perform wms.registrar_audit('ruta_cerrada', 'rutas', p_ruta::text, null, jsonb_build_object('temp_min', p_temp_min, 'temp_max', p_temp_max, 'fuera_de_rango', v_fuera, 'archivo', p_archivo_nombre), p_observaciones);
  return v_id;
end $$;

-- Corrige el cierre de una ruta ya cerrada: versión nueva con su motivo (la anterior queda como historia).
create or replace function wms.corregir_cierre_ruta(
  p_ruta uuid, p_temp_min numeric, p_temp_max numeric, p_archivo_ref text, p_archivo_nombre text, p_archivo_hash text, p_archivo_bytes integer,
  p_motivo text, p_archivo_tipo text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas; c wms.ruta_cierres; v_id uuid := gen_random_uuid(); v_mot text := nullif(btrim(coalesce(p_motivo, '')), '');
        v_min numeric := coalesce((select valor from wms.parametros where clave = 'ls_fr_43_03_temp_min_c'), '15')::numeric;
        v_max numeric := coalesce((select valor from wms.parametros where clave = 'ls_fr_43_03_temp_max_c'), '25')::numeric;
begin
  perform wms._exigir_accion('cerrar_ruta', 'Solo el Jefe de Transporte corrige el cierre de la ruta');
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if r.estado <> 'CERRADA' then raise exception 'La ruta todavía no está cerrada' using errcode = 'P0001'; end if;
  if v_mot is null then raise exception 'Cuenta por qué se corrige el cierre' using errcode = 'P0001'; end if;
  if p_temp_min is null or p_temp_max is null then raise exception 'Escribe la temperatura mínima y la máxima que marcó el data logger' using errcode = 'P0001'; end if;
  if p_temp_min < -50 or p_temp_max > 80 then raise exception 'Revisa las temperaturas: el data logger no marca valores tan lejanos (entre -50 y 80 °C)' using errcode = 'P0001'; end if;
  if p_temp_min > p_temp_max then raise exception 'La temperatura mínima no puede ser mayor que la máxima' using errcode = 'P0001'; end if;
  perform wms._validar_adjunto('data_logger', p_archivo_ref, p_archivo_nombre, p_archivo_hash, p_archivo_bytes);
  select * into c from wms.ruta_cierres where ruta_id = p_ruta and vigente for update;
  update wms.ruta_cierres set vigente = false where ruta_id = p_ruta and vigente;
  insert into wms.ruta_cierres (id, ruta_id, version, temp_min, temp_max, fuera_de_rango, archivo_ref, archivo_nombre, archivo_hash, archivo_bytes, archivo_tipo, motivo, cerrado_por)
  values (v_id, p_ruta, coalesce(c.version, 0) + 1, p_temp_min, p_temp_max, p_temp_min < v_min or p_temp_max > v_max, btrim(p_archivo_ref), btrim(p_archivo_nombre), p_archivo_hash, p_archivo_bytes,
          nullif(btrim(coalesce(p_archivo_tipo, '')), ''), v_mot, auth.uid());
  perform wms.registrar_audit('cierre_de_ruta_corregido', 'rutas', p_ruta::text, jsonb_build_object('temp_min', c.temp_min, 'temp_max', c.temp_max),
                              jsonb_build_object('temp_min', p_temp_min, 'temp_max', p_temp_max, 'archivo', p_archivo_nombre), v_mot);
  return v_id;
end $$;

-- Registra que se imprimió el formato (quién y cuándo). Solo las rutas con registro (confirmadas) y no canceladas.
create or replace function wms.registrar_impresion_ls_fr(p_ruta uuid) returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas; v_n integer;
begin
  perform wms._exigir_accion('registrar_ls_fr', 'No tienes permiso para imprimir el formato de la ruta');
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.registros_ls_fr_43_03 where ruta_id = p_ruta) then raise exception 'El formato nace al confirmar la ruta' using errcode = 'P0001'; end if;
  insert into wms.ls_fr_impresiones (ruta_id, estado_ruta, antes_de_salir, por) values (p_ruta, r.estado, r.estado in ('PLANIFICADA', 'LISTA_PARA_CARGA', 'LIBERADA'), auth.uid());
  perform wms._sincronizar_registro_ls_fr(p_ruta);
  select count(*)::integer into v_n from wms.ls_fr_impresiones where ruta_id = p_ruta;
  perform wms.registrar_audit('ls_fr_impreso', 'rutas', p_ruta::text, null, jsonb_build_object('impresiones', v_n), null);
  return v_n;
end $$;

-- Sube el escaneo del formato firmado (conductor y Dirección Técnica) y lo liga a la ruta; se conserva N años (parámetro). Cambiarlo exige motivo.
create or replace function wms.subir_escaneo_ls_fr(
  p_ruta uuid, p_archivo_ref text, p_archivo_nombre text, p_archivo_hash text, p_archivo_bytes integer, p_motivo text default null, p_archivo_tipo text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas; e wms.ls_fr_escaneos; v_id uuid := gen_random_uuid(); v_mot text := nullif(btrim(coalesce(p_motivo, '')), '');
        v_anios integer := coalesce(nullif((select valor from wms.parametros where clave = 'ls_fr_43_03_conservacion_anios'), '')::integer, 5);
begin
  perform wms._exigir_accion('registrar_ls_fr', 'No tienes permiso para subir el formato firmado');
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.registros_ls_fr_43_03 where ruta_id = p_ruta) then raise exception 'El formato nace al confirmar la ruta' using errcode = 'P0001'; end if;
  if r.estado not in ('LIBERADA', 'EN_RUTA', 'PENDIENTE_CIERRE', 'CERRADA') then
    raise exception 'El escaneo firmado se sube cuando la unidad ya fue liberada (la ruta está %)', lower(replace(r.estado, '_', ' ')) using errcode = 'P0001';
  end if;
  perform wms._validar_adjunto('ls_fr_escaneo', p_archivo_ref, p_archivo_nombre, p_archivo_hash, p_archivo_bytes);
  select * into e from wms.ls_fr_escaneos where ruta_id = p_ruta and vigente for update;
  if found and v_mot is null then raise exception 'Ya hay un escaneo firmado: para cambiarlo cuenta por qué (el anterior se conserva)' using errcode = 'P0001'; end if;
  update wms.ls_fr_escaneos set vigente = false where ruta_id = p_ruta and vigente;
  insert into wms.ls_fr_escaneos (id, ruta_id, version, archivo_ref, archivo_nombre, archivo_hash, archivo_bytes, archivo_tipo, motivo, conservar_hasta, subido_por)
  values (v_id, p_ruta, coalesce(e.version, 0) + 1, btrim(p_archivo_ref), btrim(p_archivo_nombre), p_archivo_hash, p_archivo_bytes, nullif(btrim(coalesce(p_archivo_tipo, '')), ''), v_mot,
          (r.fecha + make_interval(years => v_anios))::date, auth.uid());
  perform wms._sincronizar_registro_ls_fr(p_ruta);
  perform wms.registrar_audit('ls_fr_escaneo_subido', 'rutas', p_ruta::text, null, jsonb_build_object('archivo', p_archivo_nombre, 'version', coalesce(e.version, 0) + 1), v_mot);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Carga inicial: datos
-- ─────────────────────────────────────────────────────────────────────────────

-- Los movimientos del recorrido de cada carga (ingreso en Cuarentena → liberación / baja → ubicación final). `movimiento_id` (0007) sigue siendo el primero.
alter table wms.cargas_iniciales add column if not exists movimiento_aprobados_id uuid references wms.movimientos(id);
alter table wms.cargas_iniciales add column if not exists movimiento_bajas_id uuid references wms.movimientos(id);
alter table wms.cargas_iniciales add column if not exists movimiento_cuarentena_id uuid references wms.movimientos(id);
alter table wms.cargas_iniciales add column if not exists movimiento_liberacion_id uuid references wms.movimientos(id);
alter table wms.cargas_iniciales add column if not exists movimiento_baja_id uuid references wms.movimientos(id);
alter table wms.cargas_iniciales add column if not exists movimiento_ubicacion_id uuid references wms.movimientos(id);

-- Todo lote lleva vencimiento, y la carga inicial solo trae Aprobado, Cuarentena o Bajas. NOT VALID: se exige a las filas nuevas sin revalidar las
-- que ya existían (un check nuevo se valida contra la tabla entera: una carga vieja sin vencimiento haría fallar la migración).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cargas_iniciales_lineas_vence_check' and conrelid = 'wms.cargas_iniciales_lineas'::regclass) then
    alter table wms.cargas_iniciales_lineas add constraint cargas_iniciales_lineas_vence_check check (vence is not null) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cargas_iniciales_lineas_estado_carga_check' and conrelid = 'wms.cargas_iniciales_lineas'::regclass) then
    alter table wms.cargas_iniciales_lineas add constraint cargas_iniciales_lineas_estado_carga_check check (estado in ('APROBADO', 'CUARENTENA', 'BAJAS_RECHAZADOS')) not valid;
  end if;
end $$;

update wms.parametros set nota = 'D-09 reemplazada por D-99 (OS-7): ya no se decide un estado para toda la carga; cada fila trae su estado de Odoo. Sin uso.' where clave = 'carga_inicial_estado';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Carga inicial: validación (vista previa) con todo lote con código y vencimiento
-- ─────────────────────────────────────────────────────────────────────────────

-- Dónde «ingresa» en Cuarentena lo que luego se libera o se da de baja: la primera ubicación de Cuarentena que acepta al propietario.
create or replace function wms._posicion_cuarentena_carga(p_propietario uuid) returns uuid
language sql stable security definer set search_path = wms, pg_temp as $$
  select p.id from wms.posiciones p where p.tipo_area = 'CUARENTENA' and p.activa and wms.posicion_acepta(p.id, p_propietario, current_date) order by p.codigo limit 1
$$;

-- Vista previa (no escribe). p_lineas = [{producto, lote, vence, propietario, posicion, estado, cantidad}] (estado: APROBADO, CUARENTENA o BAJAS_RECHAZADOS).
create or replace function wms.validar_carga_inicial(p_lineas jsonb)
returns table (fila integer, error text)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare
  x jsonb; i integer := 0; v_prod uuid; v_prop uuid; v_pos uuid; v_area text; v_estado text; v_cant integer; v_vence date; v_lote text; v_codprod text;
  v_clave text; v_vence_vista jsonb := '{}'::jsonb; v_combo jsonb := '{}'::jsonb; v_comb text; v_existente date; v_otra integer;
begin
  if auth.uid() is null or not (wms.tiene_permiso('configurar') or wms.tiene_rol('direccion_tecnica')) then raise exception 'No tienes permiso para la carga inicial' using errcode = '42501'; end if;
  for x in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    v_codprod := trim(coalesce(x->>'producto', ''));
    select id into v_prod from catalogo.productos where codigo = v_codprod;
    select id into v_prop from wms.propietarios where codigo = trim(coalesce(x->>'propietario', ''));
    select id, tipo_area into v_pos, v_area from wms.posiciones where codigo = trim(coalesce(x->>'posicion', ''));
    v_estado := upper(trim(coalesce(x->>'estado', '')));
    v_lote := nullif(trim(coalesce(x->>'lote', '')), '');
    begin v_cant := (x->>'cantidad')::integer; exception when others then v_cant := null; end;
    v_vence := null;
    if nullif(trim(coalesce(x->>'vence', '')), '') is null then
      fila := i; error := 'Falta la fecha de vencimiento: todo lote necesita código de lote y fecha de vencimiento'; return next;
    else
      begin v_vence := (x->>'vence')::date; exception when others then fila := i; error := 'La fecha de vencimiento no es válida'; return next; end;
    end if;
    if v_lote is null then fila := i; error := 'Falta el código de lote: todo lote necesita código de lote y fecha de vencimiento'; return next; end if;
    if v_prod is null then fila := i; error := 'El producto «' || v_codprod || '» no existe en el catálogo'; return next; end if;
    if v_prop is null then fila := i; error := 'El propietario «' || coalesce(x->>'propietario', '') || '» no existe'; return next; end if;
    if v_pos is null then fila := i; error := 'La ubicación «' || coalesce(x->>'posicion', '') || '» no existe'; return next; end if;
    if v_cant is null or v_cant <= 0 then fila := i; error := 'La cantidad debe ser un entero mayor que cero'; return next; end if;
    if not exists (select 1 from wms.estados_sanitarios where codigo = v_estado) then
      fila := i; error := 'El estado «' || coalesce(x->>'estado', '') || '» no existe'; return next;
    elsif v_estado not in ('APROBADO', 'CUARENTENA', 'BAJAS_RECHAZADOS') then
      fila := i; error := 'El estado «' || coalesce(x->>'estado', '') || '» no se carga: usa Aprobado, Cuarentena o Bajas/Rechazados'; return next;
    elsif v_pos is not null and not exists (select 1 from wms.area_estado_admitido where tipo_area = v_area and estado = v_estado and (origen_requerido is null or origen_requerido = 'CARGA_INICIAL')) then
      fila := i; error := 'La zona ' || v_area || ' no admite unidades en estado ' || v_estado; return next;
    end if;
    if v_pos is not null and v_prop is not null and not wms.posicion_acepta(v_pos, v_prop, current_date) then
      fila := i; error := 'La ubicación ' || (x->>'posicion') || ' no acepta stock de ese propietario'; return next;
    end if;
    if v_prop is not null and v_estado in ('APROBADO', 'BAJAS_RECHAZADOS') and wms._posicion_cuarentena_carga(v_prop) is null then
      fila := i; error := 'No hay una ubicación de Cuarentena para el propietario ' || (x->>'propietario') || ': la carga ingresa primero por Cuarentena'; return next;
    end if;
    if v_prod is not null and v_estado = 'APROBADO' then
      if not exists (select 1 from wms.producto_regulatorio pr where pr.producto_id = v_prod and nullif(trim(pr.registro_sanitario), '') is not null and pr.rs_vence is not null) then
        fila := i; error := 'El producto ' || v_codprod || ' no tiene su registro sanitario y su vencimiento cargados: Dirección Técnica debe cargarlos antes de dejarlo Aprobado'; return next;
      elsif exists (select 1 from wms.producto_regulatorio pr where pr.producto_id = v_prod and pr.rs_vence < current_date) then
        fila := i; error := 'El registro sanitario del producto ' || v_codprod || ' está vencido: no se puede dejar Aprobado hasta que Dirección Técnica lo resuelva'; return next;
      end if;
    end if;
    -- Un mismo lote no puede tener dos fechas (ni en el sistema ni dentro del archivo) y una combinación no se repite.
    if v_prod is not null and v_prop is not null and v_lote is not null and v_vence is not null then
      select l.vence into v_existente from wms.lotes l where l.producto_id = v_prod and l.codigo = v_lote and l.propietario_id = v_prop;
      if found and v_existente is distinct from v_vence then
        fila := i; error := 'El lote ' || v_lote || ' ya existe con otro vencimiento (' || coalesce(v_existente::text, 'sin fecha') || '). Un mismo lote no puede tener dos fechas'; return next;
      end if;
      v_clave := v_prod::text || '|' || v_lote || '|' || v_prop::text;
      if v_vence_vista ? v_clave and (v_vence_vista->>v_clave)::date is distinct from v_vence then
        fila := i; error := 'El lote ' || v_lote || ' aparece con dos vencimientos distintos en el archivo'; return next;
      end if;
      v_vence_vista := v_vence_vista || jsonb_build_object(v_clave, v_vence);
      if v_pos is not null then
        v_comb := v_clave || '|' || v_pos::text || '|' || v_estado;
        if v_combo ? v_comb then
          v_otra := (v_combo->>v_comb)::integer;
          fila := i; error := 'Esta combinación de producto, lote, ubicación y estado ya está en la fila ' || v_otra || ': una fila por combinación'; return next;
        end if;
        v_combo := v_combo || jsonb_build_object(v_comb, i);
      end if;
    end if;
  end loop;
end $$;

create or replace function wms.crear_carga_inicial(p_lineas jsonb, p_nota text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_anio text := to_char(now(), 'YYYY'); v_errores integer; x jsonb; i integer := 0;
begin
  if auth.uid() is null or not (wms.tiene_permiso('configurar') or wms.tiene_rol('direccion_tecnica')) then raise exception 'No tienes permiso para la carga inicial' using errcode = '42501'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El archivo no tiene filas' using errcode = 'P0001';
  end if;
  select count(distinct v.fila) into v_errores from wms.validar_carga_inicial(p_lineas) v;
  if v_errores > 0 then raise exception 'La carga tiene % filas con errores: corrígelas y vuelve a cargar', v_errores using errcode = 'P0001'; end if;
  insert into wms.cargas_iniciales (id, numero, nota, creado_por)
  values (v_id, 'CI-' || v_anio || '-' || lpad(wms.siguiente_correlativo('CI-' || v_anio)::text, 5, '0'), nullif(trim(p_nota), ''), auth.uid());
  for x in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    insert into wms.cargas_iniciales_lineas (carga_id, fila, producto_id, lote_codigo, vence, propietario_id, posicion_id, estado, cantidad)
    select v_id, i, (select id from catalogo.productos where codigo = trim(x->>'producto')), trim(x->>'lote'), (x->>'vence')::date,
           (select id from wms.propietarios where codigo = trim(x->>'propietario')), (select id from wms.posiciones where codigo = trim(x->>'posicion')),
           upper(trim(x->>'estado')), (x->>'cantidad')::integer;
  end loop;
  perform wms.registrar_audit('carga_inicial_creada', 'cargas_iniciales', v_id::text, null, jsonb_build_object('filas', i), p_nota);
  return v_id;
end $$;

-- D-09 queda reemplazada por D-99: ya no hay un estado para toda la carga. La función se conserva (la lista de funciones expuestas no cambia) pero no decide nada.
create or replace function wms.decidir_estado_carga_inicial(p_estado text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  raise exception 'Este paso ya no existe: cada fila de la carga trae su estado de Odoo y Dirección Técnica valida todo con una sola confirmación' using errcode = 'P0001';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Carga inicial: la confirmación única de Dirección Técnica
-- ─────────────────────────────────────────────────────────────────────────────

-- ¿Estamos dentro de la confirmación de una carga inicial hecha por Dirección Técnica? Solo `confirmar_carga_inicial` fija el contexto (en su transacción) y aquí
-- se vuelve a comprobar contra la carga (en borrador) y el rol: quien llama no puede fabricarlo. Lo usa `postear_movimiento` para dejar que Dirección Técnica
-- registre el recorrido de la carga (ingreso, liberación y ubicación final) con una sola confirmación.
create or replace function wms._carga_en_confirmacion() returns boolean
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v text := nullif(current_setting('wms.carga_ctx', true), '');
begin
  if v is null or auth.uid() is null then return false; end if;
  return wms.tiene_rol('direccion_tecnica') and exists (select 1 from wms.cargas_iniciales c where c.id::text = v and c.estado = 'BORRADOR');
end $$;

-- `postear_movimiento` acepta el contexto de la carga inicial en dos permisos (CARGA_INICIAL y MOVIMIENTO). Se parcha el cuerpo VIGENTE de la función en lugar de
-- copiarlo entero, para no pisar los cambios que otras migraciones le hagan.
do $$ declare v_def text; v_nuevo text;
begin
  v_def := pg_get_functiondef('wms.postear_movimiento(text, text, jsonb, text, text, text, text, uuid)'::regprocedure);
  if position('_carga_en_confirmacion' in v_def) > 0 then return; end if;
  v_nuevo := replace(v_def, 'elsif p_tipo = ''CARGA_INICIAL'' and not wms.tiene_permiso(''configurar'') then',
                            'elsif p_tipo = ''CARGA_INICIAL'' and not wms.tiene_permiso(''configurar'') and not wms._carga_en_confirmacion() then');
  v_nuevo := replace(v_nuevo, 'v_sctx is null and not wms.tiene_permiso(''ejecutar'') then', 'v_sctx is null and not wms.tiene_permiso(''ejecutar'') and not wms._carga_en_confirmacion() then');
  if v_nuevo = v_def or (length(v_nuevo) - length(replace(v_nuevo, '_carga_en_confirmacion', ''))) / length('_carga_en_confirmacion') <> 2 then
    raise exception 'No se pudo adaptar postear_movimiento: su cuerpo cambió. Revisa el cuerpo vigente y agrega wms._carga_en_confirmacion() a los permisos de CARGA_INICIAL y MOVIMIENTO';
  end if;
  execute v_nuevo;
end $$;

-- El lote de la carga: el que ya existe (con el MISMO vencimiento) o uno nuevo. Hace lo mismo que `asegurar_lote`, que pide permisos de operación (Dirección Técnica no los tiene).
create or replace function wms._lote_de_carga(p_producto uuid, p_codigo text, p_vence date, p_propietario uuid) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v wms.lotes;
begin
  select * into v from wms.lotes where producto_id = p_producto and codigo = p_codigo and propietario_id = p_propietario;
  if found then
    if v.vence is distinct from p_vence then
      raise exception 'El lote % ya existe con otro vencimiento (%). Un mismo lote no puede tener dos fechas.', p_codigo, coalesce(v.vence::text, 'sin fecha') using errcode = 'P0001';
    end if;
    return v.id;
  end if;
  insert into wms.lotes (producto_id, codigo, vence, propietario_id) values (p_producto, p_codigo, p_vence, p_propietario) returning id into v.id;
  perform wms.registrar_audit('lote_creado', 'lotes', v.id::text, null, jsonb_build_object('producto_id', p_producto, 'codigo', p_codigo, 'vence', p_vence, 'origen', 'carga_inicial'));
  return v.id;
end $$;

-- UNA sola confirmación de Dirección Técnica. El stock de Odoo entra a su estado y ubicación sin acta organoléptica ni recepción, y el libro mayor deja el recorrido:
--   · Aprobados:   ingreso por carga inicial en Cuarentena → liberación (cambio de estado a Aprobado, en el lugar) → ubicación final (movimiento).
--   · Bajas:       ingreso en Cuarentena → baja (cambio de estado a Bajas/Rechazados) → ubicación en Bajas.
--   · Cuarentena:  ingreso en Cuarentena, en su ubicación; ahí se queda.
-- Todo en esta transacción: si algo falla, no entra nada. Los movimientos son los reales del libro (inmutables); un error se corrige con un ajuste.
create or replace function wms.confirmar_carga_inicial(p_carga uuid)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  c wms.cargas_iniciales; r record; v_lote uuid; v_cuar uuid; v_errores integer; v_lineas jsonb;
  v_ing_a jsonb := '[]'::jsonb; v_ing_b jsonb := '[]'::jsonb; v_ing_c jsonb := '[]'::jsonb;
  v_lib jsonb := '[]'::jsonb; v_baja jsonb := '[]'::jsonb; v_ubic jsonb := '[]'::jsonb;
  m_a uuid; m_b uuid; m_c uuid; m_lib uuid; m_baja uuid; m_ubic uuid; v_primero uuid; p jsonb; v_ref text;
begin
  if auth.uid() is null or not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica valida la carga inicial' using errcode = '42501';
  end if;
  select * into c from wms.cargas_iniciales where id = p_carga for update;
  if not found then raise exception 'No encontramos esa carga' using errcode = 'P0001'; end if;
  if c.estado <> 'BORRADOR' then raise exception 'Esta carga ya no está en borrador' using errcode = 'P0001'; end if;
  v_ref := c.numero;

  -- Se vuelve a validar al confirmar: entre la vista previa y hoy pudo cambiar el catálogo, el registro sanitario o las ubicaciones.
  select jsonb_agg(jsonb_build_object('producto', pr.codigo, 'lote', l.lote_codigo, 'vence', l.vence, 'propietario', o.codigo, 'posicion', po.codigo, 'estado', l.estado, 'cantidad', l.cantidad) order by l.fila)
    into v_lineas
    from wms.cargas_iniciales_lineas l join catalogo.productos pr on pr.id = l.producto_id join wms.propietarios o on o.id = l.propietario_id join wms.posiciones po on po.id = l.posicion_id
   where l.carga_id = p_carga;
  if v_lineas is null then raise exception 'La carga no tiene filas' using errcode = 'P0001'; end if;
  select count(distinct v.fila) into v_errores from wms.validar_carga_inicial(v_lineas) v;
  if v_errores > 0 then raise exception 'La carga tiene % filas con errores: vuelve a la vista previa y corrígelas', v_errores using errcode = 'P0001'; end if;

  perform set_config('wms.carga_ctx', p_carga::text, true);
  for r in select * from wms.cargas_iniciales_lineas where carga_id = p_carga order by fila loop
    v_lote := wms._lote_de_carga(r.producto_id, r.lote_codigo, r.vence, r.propietario_id);
    if r.estado = 'CUARENTENA' then
      v_ing_c := v_ing_c || jsonb_build_object('posicion_id', r.posicion_id, 'producto_id', r.producto_id, 'lote_id', v_lote, 'propietario_id', r.propietario_id,
        'estado', 'CUARENTENA', 'origen', 'CARGA_INICIAL', 'procedencia_id', r.id, 'delta', r.cantidad);
    else
      v_cuar := wms._posicion_cuarentena_carga(r.propietario_id);
      p := jsonb_build_object('posicion_id', v_cuar, 'producto_id', r.producto_id, 'lote_id', v_lote, 'propietario_id', r.propietario_id,
        'estado', 'CUARENTENA', 'origen', 'CARGA_INICIAL', 'procedencia_id', r.id, 'delta', r.cantidad);
      if r.estado = 'APROBADO' then v_ing_a := v_ing_a || p; else v_ing_b := v_ing_b || p; end if;
      -- Cambio de estado EN EL LUGAR (Cuarentena → Aprobado o Bajas): sale de Cuarentena y entra al estado final, misma ubicación y misma procedencia.
      p := jsonb_build_object('posicion_id', v_cuar, 'producto_id', r.producto_id, 'lote_id', v_lote, 'propietario_id', r.propietario_id, 'estado', 'CUARENTENA',
        'origen', 'CARGA_INICIAL', 'procedencia_id', r.id, 'delta', -r.cantidad);
      if r.estado = 'APROBADO' then v_lib := v_lib || p; else v_baja := v_baja || p; end if;
      p := jsonb_build_object('posicion_id', v_cuar, 'producto_id', r.producto_id, 'lote_id', v_lote, 'propietario_id', r.propietario_id, 'estado', r.estado,
        'origen', 'CARGA_INICIAL', 'procedencia_id', r.id, 'delta', r.cantidad);
      if r.estado = 'APROBADO' then v_lib := v_lib || p; else v_baja := v_baja || p; end if;
      -- Ubicación final: el movimiento interno de la ubicación de Cuarentena a la ubicación de Odoo.
      v_ubic := v_ubic || jsonb_build_object('posicion_id', v_cuar, 'producto_id', r.producto_id, 'lote_id', v_lote, 'propietario_id', r.propietario_id, 'estado', r.estado,
        'origen', 'CARGA_INICIAL', 'procedencia_id', r.id, 'delta', -r.cantidad);
      v_ubic := v_ubic || jsonb_build_object('posicion_id', r.posicion_id, 'producto_id', r.producto_id, 'lote_id', v_lote, 'propietario_id', r.propietario_id, 'estado', r.estado,
        'origen', 'CARGA_INICIAL', 'procedencia_id', r.id, 'delta', r.cantidad);
    end if;
  end loop;

  if jsonb_array_length(v_ing_a) > 0 then
    m_a := wms.postear_movimiento('CARGA_INICIAL', 'Carga inicial ' || v_ref || ': ingreso en Cuarentena → liberación → ubicación final (cambio de sistema, sin acta organoléptica)', v_ing_a, 'carga_inicial', v_ref);
  end if;
  if jsonb_array_length(v_ing_b) > 0 then
    m_b := wms.postear_movimiento('CARGA_INICIAL', 'Carga inicial ' || v_ref || ': ingreso en Cuarentena → baja → ubicación en Bajas (cambio de sistema, sin acta organoléptica)', v_ing_b, 'carga_inicial', v_ref);
  end if;
  if jsonb_array_length(v_ing_c) > 0 then
    m_c := wms.postear_movimiento('CARGA_INICIAL', 'Carga inicial ' || v_ref || ': ingreso en Cuarentena (se queda en Cuarentena hasta que Dirección Técnica decida)', v_ing_c, 'carga_inicial', v_ref);
  end if;
  if jsonb_array_length(v_lib) > 0 then
    m_lib := wms.postear_movimiento('CAMBIO_ESTADO', 'Liberación por carga inicial ' || v_ref || ' (el stock ya estaba aprobado en Odoo: sin acta organoléptica)', v_lib, 'carga_inicial', v_ref, 'carga_inicial', v_ref);
  end if;
  if jsonb_array_length(v_baja) > 0 then
    m_baja := wms.postear_movimiento('CAMBIO_ESTADO', 'Baja por carga inicial ' || v_ref || ' (el stock ya estaba dado de baja en Odoo: sin acta organoléptica)', v_baja, 'carga_inicial', v_ref, 'carga_inicial', v_ref);
  end if;
  if jsonb_array_length(v_ubic) > 0 then
    m_ubic := wms.postear_movimiento('MOVIMIENTO', 'Ubicación final por carga inicial ' || v_ref || ' (la ubicación que tenía en Odoo)', v_ubic, 'carga_inicial', v_ref);
  end if;
  perform set_config('wms.carga_ctx', '', true);

  v_primero := coalesce(m_a, m_b, m_c);
  update wms.cargas_iniciales set estado = 'CONFIRMADA', confirmado_por = auth.uid(), confirmado_en = now(), movimiento_id = v_primero,
         movimiento_aprobados_id = m_a, movimiento_bajas_id = m_b, movimiento_cuarentena_id = m_c, movimiento_liberacion_id = m_lib, movimiento_baja_id = m_baja, movimiento_ubicacion_id = m_ubic
   where id = p_carga;
  perform wms.registrar_audit('carga_inicial_confirmada', 'cargas_iniciales', p_carga::text, null,
    jsonb_build_object('filas', (select count(*) from wms.cargas_iniciales_lineas where carga_id = p_carga), 'aprobadas', jsonb_array_length(v_ing_a), 'bajas', jsonb_array_length(v_ing_b), 'cuarentena', jsonb_array_length(v_ing_c)), v_ref);
  return v_primero;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function
  wms.cerrar_ruta(uuid, numeric, numeric, text, text, text, integer, text, text),
  wms.corregir_cierre_ruta(uuid, numeric, numeric, text, text, text, integer, text, text),
  wms.registrar_impresion_ls_fr(uuid),
  wms.subir_escaneo_ls_fr(uuid, text, text, text, integer, text, text),
  wms.validar_carga_inicial(jsonb), wms.crear_carga_inicial(jsonb, text), wms.decidir_estado_carga_inicial(text), wms.confirmar_carga_inicial(uuid)
  to authenticated;
revoke execute on all functions in schema wms from public;
