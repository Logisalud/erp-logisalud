-- 0031 · WMS · SB-A: vehículo calificado fuera del WMS + conductor real vs «conductor en documentos» (temporal)
--
-- Pedido de Sebas (GM, 2026-10-23). Decisiones D-153 a D-160 (docs/wms/decisiones-pendientes.md):
--   1. VEHÍCULO CALIFICADO: ya no se valida ni se trae de Pedidos (Roberto, Jefe de Transporte, decide el vehículo por experiencia). `planificar_ruta` pierde su comprobación
--      («El cliente de … exige un vehículo calificado») y `_cambios_de_pedido` ya no avisa «Cambió el vehículo calificado». La columna `vehiculos.calificado` queda como dato
--      informativo y opcional; el campo `vehiculoCalificado` que aún traiga un pedido viejo se ignora.
--   2. CONDUCTOR REAL: la ruta (`rutas.conductor_id`), sus versiones y la auditoría guardan SIEMPRE al conductor real.
--   3. «CONDUCTOR EN DOCUMENTOS» (TEMPORAL): el nombre, el documento y la licencia que salen en la guía electrónica (`contexto_guia`) y en el LS-FR.43.03 los toma el WMS del
--      parámetro `conductor_en_documentos` (valor = id de la persona; vacío = el conductor real). Lo cambia solo el Jefe de Transporte, con motivo, con
--      `cambiar_conductor_en_documentos`. Cada uso se audita junto al conductor real: al emitir la guía (disparador sobre `guias_remision`) y al imprimir el LS-FR.43.03
--      (disparador sobre `ls_fr_impresiones`) → evento `conductor_en_documento`.
--      CÓMO SE QUITA cuando Sebas avise: una migración nueva con `delete from wms.parametros where clave = 'conductor_en_documentos';` (y, si se quiere, borrar los dos
--      disparadores y las dos funciones). Sin la fila `_conductor_para_documentos` devuelve al conductor real y la pantalla deja de mostrar el interruptor. Nada más cambia.
--   4. DOCUMENTO DE IDENTIDAD: la guía de Michele usa un carné de extranjería, no DNI. `personal_transporte.documento_tipo` (DNI, CE, PASAPORTE) y el catálogo 06 de SUNAT
--      (1, 4, 7) en el envío a Nubefact. `guardar_documentos_personal` completa el documento y la licencia (vacío = pendiente).
-- Los datos de las personas y del vehículo NO van aquí: están en `supabase/seeds/0002_transporte_inicial.sql`.
-- Requiere 0017, 0024, 0027, 0029 y 0030. Re-ejecutable. Se aplica a mano (nunca al mergear). Termina con el `revoke execute … from public`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Vehículo calificado: fuera de la planificación y de los avisos de cambio de pedido
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_oid oid; v_def text;
  v_ancla text := E'      if nullif(btrim(coalesce(pd.snapshot->''cliente''->>''vehiculoCalificado'', '''')), '''') is not null and (p_vehiculo is null or not v.calificado) then\n'
               || E'        raise exception ''El cliente de % exige un vehículo calificado'', pd.numero using errcode = ''P0001'';\n'
               || E'      end if;\n';
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'planificar_ruta' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position('exige un vehículo calificado' in v_def) = 0 then return; end if;     -- ya aplicada (re-ejecución)
  if position(v_ancla in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.planificar_ruta: %', v_ancla; end if;
  execute replace(v_def, v_ancla, E'      -- 0031 (D-153): el vehículo calificado ya no se valida; el Jefe de Transporte elige el vehículo por experiencia\n');
end $$;

do $$
declare
  v_oid oid; v_def text;
  v_ancla text := E'  if coalesce(p_antes->''cliente''->>''vehiculoCalificado'', '''') <> coalesce(p_nuevo->''cliente''->>''vehiculoCalificado'', '''') then r := r || to_jsonb(''Cambió el vehículo calificado''::text); end if;\n';
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = '_cambios_de_pedido' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position('Cambió el vehículo calificado' in v_def) = 0 then return; end if;     -- ya aplicada (re-ejecución)
  if position(v_ancla in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms._cambios_de_pedido: %', v_ancla; end if;
  execute replace(v_def, v_ancla, '');
end $$;

comment on column wms.vehiculos.calificado is 'Solo informativo (0031, D-153): el WMS ya no valida «vehículo calificado».';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Documento de identidad de quien conduce
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.personal_transporte add column if not exists documento_tipo text not null default 'DNI';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'personal_transporte_documento_tipo_check' and conrelid = 'wms.personal_transporte'::regclass) then
    alter table wms.personal_transporte add constraint personal_transporte_documento_tipo_check check (documento_tipo in ('DNI', 'CE', 'PASAPORTE'));
  end if;
end $$;
comment on column wms.personal_transporte.dni is 'Número del documento de identidad (DNI, carné de extranjería o pasaporte según documento_tipo). El nombre del campo es histórico.';

-- Documento y licencia de una persona del personal de transporte. Vacío = pendiente. Mismas reglas que `errorDocumentoPersonal` (dominio).
create or replace function wms.guardar_documentos_personal(p_id uuid, p_documento_tipo text, p_documento text, p_licencia text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_doc text := upper(btrim(coalesce(p_documento, ''))); v_lic text := upper(btrim(coalesce(p_licencia, ''))); v_nombre text;
begin
  perform wms._exigir_accion('planificar_ruta', 'No tienes permiso para administrar el personal de transporte');
  select nombre into v_nombre from wms.personal_transporte where id = p_id;
  if not found then raise exception 'No encontramos a esa persona' using errcode = 'P0001'; end if;
  if p_documento_tipo is null or p_documento_tipo not in ('DNI', 'CE', 'PASAPORTE') then raise exception 'Elige el tipo de documento' using errcode = 'P0001'; end if;
  if v_doc <> '' and p_documento_tipo = 'DNI' and v_doc !~ '^[0-9]{8}$' then raise exception 'El DNI tiene 8 números' using errcode = 'P0001'; end if;
  if v_doc <> '' and p_documento_tipo = 'CE' and v_doc !~ '^[A-Z0-9]{9,12}$' then raise exception 'El carné de extranjería tiene de 9 a 12 letras o números' using errcode = 'P0001'; end if;
  if v_doc <> '' and p_documento_tipo = 'PASAPORTE' and v_doc !~ '^[A-Z0-9]{6,12}$' then raise exception 'El pasaporte tiene de 6 a 12 letras o números' using errcode = 'P0001'; end if;
  if v_lic <> '' and v_lic !~ '^[A-Z0-9]{9,10}$' then raise exception 'La licencia tiene 9 o 10 letras y números' using errcode = 'P0001'; end if;
  update wms.personal_transporte set documento_tipo = p_documento_tipo, dni = nullif(v_doc, ''), licencia = nullif(v_lic, '') where id = p_id;
  -- La auditoría dice QUÉ cambió, no el número (dato personal): pendiente o completo
  perform wms.registrar_audit('personal_documentos_guardados', 'personal_transporte', p_id::text, null,
    jsonb_build_object('nombre', v_nombre, 'documento_tipo', p_documento_tipo, 'documento', case when v_doc = '' then 'pendiente' else 'completo' end, 'licencia', case when v_lic = '' then 'pendiente' else 'completa' end), null);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. «Conductor en documentos» (TEMPORAL, D-155 a D-157)
-- ─────────────────────────────────────────────────────────────────────────────

-- La fila EXISTE = el interruptor está puesto (valor = id de la persona, o vacío = el conductor real). Borrar la fila lo quita (D-157).
insert into wms.parametros (clave, valor, nota) values
  ('conductor_en_documentos', '', 'TEMPORAL (SB-A): conductor que figura en la guía electrónica y en el LS-FR.43.03. Vacío = el conductor real de la ruta. Para quitar el interruptor: borrar esta fila.')
on conflict (clave) do nothing;

-- A quién nombran los documentos de una ruta cuyo conductor real es p_real: la persona del parámetro si existe, es conductor y está disponible; si no, el conductor real.
-- Sin la fila del parámetro (interruptor quitado) siempre es el conductor real.
create or replace function wms._conductor_para_documentos(p_real uuid) returns uuid
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v text; v_id uuid;
begin
  if p_real is null then return null; end if;
  select valor into v from wms.parametros where clave = 'conductor_en_documentos';
  if v is null or btrim(v) = '' or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return p_real; end if;
  select id into v_id from wms.personal_transporte where id = v::uuid and funcion = 'CONDUCTOR' and activo;
  return coalesce(v_id, p_real);
end $$;

-- Solo el Jefe de Transporte (permiso `planificar_ruta`), con motivo. p_persona null = los documentos llevan al conductor real de cada ruta.
create or replace function wms.cambiar_conductor_en_documentos(p_persona uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_motivo text := nullif(btrim(coalesce(p_motivo, '')), ''); v_antes text; v_nombre text;
begin
  perform wms._exigir_accion('planificar_ruta', 'No tienes permiso para cambiar el conductor que figura en los documentos');
  select valor into v_antes from wms.parametros where clave = 'conductor_en_documentos' for update;
  if not found then raise exception 'Esta opción ya no existe: los documentos llevan al conductor real de la ruta' using errcode = 'P0001'; end if;
  if v_motivo is null then raise exception 'Cuenta por qué cambia el conductor que figura en los documentos' using errcode = 'P0001'; end if;
  if p_persona is not null then
    select nombre into v_nombre from wms.personal_transporte where id = p_persona and funcion = 'CONDUCTOR' and activo;
    if not found then raise exception 'Elige un conductor disponible' using errcode = 'P0001'; end if;
  end if;
  update wms.parametros
     set valor = coalesce(p_persona::text, ''),
         nota = 'Lo cambió el Jefe de Transporte el ' || to_char(now() at time zone 'America/Lima', 'DD/MM/YYYY') || ': ' || v_motivo
   where clave = 'conductor_en_documentos';
  perform wms.registrar_audit('conductor_en_documentos_cambiado', 'parametros', 'conductor_en_documentos',
    jsonb_build_object('persona', nullif(v_antes, '')), jsonb_build_object('persona', p_persona, 'nombre', v_nombre), v_motivo);
end $$;

-- Contexto de la guía (0024): el conductor es quien figura en documentos; `conductor_real` es el de la ruta.
create or replace function wms.contexto_guia(p_salida uuid) returns jsonb
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare s wms.salidas; v_ruta record; v_ped record; v_par jsonb;
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para ver los datos de la guía');
  select * into s from wms.salidas where id = p_salida;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  -- 0031 (D-155): la guía nombra a quien figura en documentos (parámetro temporal); `conductor_real` es el de la ruta, el que se guarda siempre
  select r.id, r.numero, r.fecha, r.estado, ve.placa, c.nombre as conductor, c.dni as conductor_dni, c.documento_tipo as conductor_documento_tipo, c.licencia as conductor_licencia, a.nombre as auxiliar,
         creal.nombre as conductor_real
    into v_ruta
    from wms.ruta_paradas pa join wms.rutas r on r.id = pa.ruta_id
    left join wms.vehiculos ve on ve.id = r.vehiculo_id
    left join wms.personal_transporte creal on creal.id = r.conductor_id
    left join wms.personal_transporte c on c.id = wms._conductor_para_documentos(r.conductor_id)
    left join wms.personal_transporte a on a.id = r.auxiliar_id
   where pa.salida_id = p_salida and pa.activa and r.estado <> 'CANCELADA' order by r.fecha desc limit 1;
  select pedido_id, numero, cliente_nombre, cliente_ruc, snapshot into v_ped from wms.pedidos_despacho where salida_id = p_salida order by vigente desc, version desc limit 1;
  select coalesce(jsonb_object_agg(clave, valor), '{}'::jsonb) into v_par from wms.parametros where clave like 'guia\_%' escape '\' or clave like 'sunat\_%' escape '\' or clave like 'nubefact\_%' escape '\';
  return jsonb_build_object(
    'salida', jsonb_build_object('id', s.id, 'numero', s.numero, 'tipo', s.tipo, 'motivo', s.motivo, 'estado', s.estado, 'conforme', wms._salida_conforme(p_salida)),
    'pedido', case when v_ped.pedido_id is null then null else jsonb_build_object('id', v_ped.pedido_id, 'numero', v_ped.numero, 'cliente', v_ped.cliente_nombre, 'ruc', v_ped.cliente_ruc, 'snapshot', v_ped.snapshot) end,
    'ruta', case when v_ruta.id is null then null else jsonb_build_object('id', v_ruta.id, 'numero', v_ruta.numero, 'fecha', v_ruta.fecha, 'placa', v_ruta.placa,
              'conductor', v_ruta.conductor, 'conductor_dni', v_ruta.conductor_dni, 'conductor_documento_tipo', v_ruta.conductor_documento_tipo, 'conductor_licencia', v_ruta.conductor_licencia,
              'auxiliar', v_ruta.auxiliar, 'conductor_real', v_ruta.conductor_real) end,
    'bultos', coalesce(s.bultos_conformidad, (select count(*)::integer from wms.bultos where salida_id = p_salida and estado = 'EMBALADO')),
    'lineas', wms._lineas_de_guia(p_salida),
    'parametros', v_par);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Cada uso se audita junto al conductor real (D-156)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._auditar_uso_conductor(p_documento text, p_entidad text, p_entidad_id text, p_ruta uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas; v_real record; v_doc record;
begin
  select * into r from wms.rutas where id = p_ruta;
  if not found then return; end if;
  select id, nombre into v_real from wms.personal_transporte where id = r.conductor_id;
  select id, nombre into v_doc from wms.personal_transporte where id = wms._conductor_para_documentos(r.conductor_id);
  perform wms.registrar_audit('conductor_en_documento', p_entidad, p_entidad_id, null,
    jsonb_build_object('documento', p_documento, 'ruta', r.numero, 'conductor_real', v_real.nombre, 'conductor_real_id', v_real.id,
                       'conductor_en_documento', v_doc.nombre, 'conductor_en_documento_id', v_doc.id, 'distinto', v_real.id is distinct from v_doc.id), null);
end $$;

-- Guía electrónica: al registrarse (la que emite Nubefact; la GRE a mano o la del cliente no nombra al conductor)
create or replace function wms._tr_guia_audita_conductor() returns trigger
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_ruta uuid;
begin
  if new.origen <> 'NUBEFACT' then return new; end if;
  select r.id into v_ruta from wms.ruta_paradas pa join wms.rutas r on r.id = pa.ruta_id
   where pa.salida_id = new.salida_id and pa.activa and r.estado <> 'CANCELADA' order by r.fecha desc limit 1;
  if v_ruta is not null then perform wms._auditar_uso_conductor('Guía electrónica ' || new.numero, 'guias_remision', new.id::text, v_ruta); end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'guia_audita_conductor' and tgrelid = 'wms.guias_remision'::regclass and not tgisinternal) then drop trigger guia_audita_conductor on wms.guias_remision; end if;
  create trigger guia_audita_conductor after insert on wms.guias_remision for each row execute function wms._tr_guia_audita_conductor();
end $$;

-- LS-FR.43.03: al imprimirse (la copia que viaja con el conductor)
create or replace function wms._tr_impresion_ls_fr_audita_conductor() returns trigger
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  perform wms._auditar_uso_conductor('LS-FR.43.03 impreso', 'rutas', new.ruta_id::text, new.ruta_id);
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'ls_fr_impresion_audita_conductor' and tgrelid = 'wms.ls_fr_impresiones'::regclass and not tgisinternal) then drop trigger ls_fr_impresion_audita_conductor on wms.ls_fr_impresiones; end if;
  create trigger ls_fr_impresion_audita_conductor after insert on wms.ls_fr_impresiones for each row execute function wms._tr_impresion_ls_fr_audita_conductor();
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.cambiar_conductor_en_documentos(uuid, text), wms.guardar_documentos_personal(uuid, text, text, text), wms.contexto_guia(uuid) to authenticated;
revoke execute on all functions in schema wms from public;
