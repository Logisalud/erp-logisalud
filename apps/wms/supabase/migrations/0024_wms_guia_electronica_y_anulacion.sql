-- WMS · OS-3 · Guía de remisión electrónica (Nubefact), anulación por casos, reapertura de la conformidad y eventos hacia Pedidos.
-- Requiere 0012, 0019, 0021, 0022 y 0023. Re-ejecutable. Se aplica a mano (nunca al mergear).
--
--  1. La guía guarda de dónde viene (WMS con Nubefact, a mano o la GRE de un cliente de almacenamiento), el entorno (simulador, prueba o producción),
--     el enlace y el hash que devuelve Nubefact, y lo que se envió y recibió. Sigue sin editarse y sin borrarse.
--  2. Anulación por casos (D-90): 1 = datos del traslado, 2 = contenido (la Orden vuelve a conformidad y el stock regresa de Despacho al rack),
--     3 = después de la salida confirmada (no se anula desde el WMS). Solo el Jefe de Transporte, con motivo.
--  3. Los eventos «guía emitida» y «guía anulada» quedan en una bandeja de salida (`eventos_pedidos`) que la aplicación envía a Pedidos con reintentos.
--     El WMS no toca la factura.
--  4. Las reglas de SUNAT para dar de baja una guía son parámetros en «PENDIENTE»: no se inventa la regla tributaria.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Guía: origen, entorno y respuesta de Nubefact
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.guias_remision add column if not exists origen text not null default 'MANUAL';
alter table wms.guias_remision add column if not exists entorno text;
alter table wms.guias_remision add column if not exists enlace text;
alter table wms.guias_remision add column if not exists hash_nubefact text;
alter table wms.guias_remision add column if not exists fecha_inicio_traslado date;
alter table wms.guias_remision add column if not exists peso_kg numeric(10, 2);
alter table wms.guias_remision add column if not exists bultos integer;
alter table wms.guias_remision add column if not exists payload jsonb;
alter table wms.guias_remision add column if not exists respuesta jsonb;
alter table wms.guias_remision add column if not exists enlace_xml text;
alter table wms.guias_remision add column if not exists estado_sunat text;
alter table wms.guias_remision add column if not exists archivo_ref text;
alter table wms.guias_remision add column if not exists caso_anulacion smallint;
alter table wms.guias_remision add column if not exists baja_sunat text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'guias_remision_origen_chk') then
    alter table wms.guias_remision add constraint guias_remision_origen_chk check (origen in ('MANUAL', 'NUBEFACT', 'CLIENTE'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'guias_remision_entorno_chk') then
    alter table wms.guias_remision add constraint guias_remision_entorno_chk check (entorno is null or entorno in ('SIMULADOR', 'PRUEBA', 'PRODUCCION'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'guias_remision_sunat_chk') then
    alter table wms.guias_remision add constraint guias_remision_sunat_chk check (estado_sunat is null or estado_sunat in ('ACEPTADA', 'PENDIENTE'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'guias_remision_caso_chk') then
    alter table wms.guias_remision add constraint guias_remision_caso_chk check (caso_anulacion is null or caso_anulacion in (1, 2, 3));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'guias_remision_baja_chk') then
    alter table wms.guias_remision add constraint guias_remision_baja_chk check (baja_sunat is null or baja_sunat in ('PENDIENTE', 'NO_APLICA', 'HECHA'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'guias_remision_nubefact_chk') then
    alter table wms.guias_remision add constraint guias_remision_nubefact_chk check (origen <> 'NUBEFACT' or (entorno is not null and enlace is not null));
  end if;
end $$;

-- Lo que no puede cambiar nunca (todo lo registrado); solo se permite pasar a ANULADA con su motivo, caso y estado de la baja.
create or replace function wms._guia_inmutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Una guía registrada no se borra: se anula con motivo' using errcode = 'P0001'; end if;
  if (new.salida_id, new.numero, new.lineas, new.placa, new.fecha_traslado, new.nota, new.registrada_por, new.registrada_en,
      new.origen, new.entorno, new.enlace, new.hash_nubefact, new.fecha_inicio_traslado, new.peso_kg, new.bultos, new.payload, new.respuesta, new.archivo_ref, new.enlace_xml, new.estado_sunat)
     is distinct from (old.salida_id, old.numero, old.lineas, old.placa, old.fecha_traslado, old.nota, old.registrada_por, old.registrada_en,
      old.origen, old.entorno, old.enlace, old.hash_nubefact, old.fecha_inicio_traslado, old.peso_kg, old.bultos, old.payload, old.respuesta, old.archivo_ref, old.enlace_xml, old.estado_sunat)
     or (old.estado = 'ANULADA' and (new.estado, new.anulada_por, new.anulada_en, new.motivo_anulacion, new.caso_anulacion) is distinct from (old.estado, old.anulada_por, old.anulada_en, old.motivo_anulacion, old.caso_anulacion)) then
    raise exception 'Una guía registrada no se edita: se anula con motivo y se registra otra' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Parámetros (lo desconocido queda en PENDIENTE: no se inventa)
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.parametros (clave, valor, nota) values
  ('guia_serie', 'T001', 'Serie de la guía de remisión remitente electrónica (la confirma Contabilidad al pasar a producción)'),
  ('guia_partida_ubigeo', '150119', 'Punto de partida: Lurín (Dirección Técnica, 2026-10)'),
  ('guia_partida_direccion', 'PENDIENTE', 'Dirección exacta del almacén de Lurín tal como va en la guía: la confirma Charlie o Katia'),
  ('guia_motivo_traslado', 'VENTA', 'Motivo del traslado de las guías de pedidos (Dirección Técnica)'),
  ('guia_modalidad_transporte', 'TRANSPORTE PRIVADO', 'Modalidad del traslado (Dirección Técnica)'),
  ('sunat_baja_plazo_horas', 'PENDIENTE', 'Plazo para dar de baja una guía ante SUNAT: pendiente de validar con Contabilidad y Nubefact'),
  ('sunat_baja_tras_inicio_traslado', 'PENDIENTE', 'Si la baja procede después de iniciado el traslado: pendiente de validar con Contabilidad y Nubefact'),
  ('nubefact_baja_soportada', 'PENDIENTE', 'Si la API de Nubefact da de baja la guía: pendiente de validar con Nubefact')
on conflict (clave) do nothing;

select wms._ampliar_check_in('wms.permisos_rol', 'permisos_rol_accion_check', 'accion', array['anular_guia']);
insert into wms.permisos_rol (rol, accion) values ('jefe_transporte', 'anular_guia') on conflict (rol, accion) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Bandeja de salida hacia Pedidos
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.eventos_pedidos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('GUIA_EMITIDA', 'GUIA_ANULADA')),
  salida_id uuid not null references wms.salidas(id),
  guia_id uuid not null references wms.guias_remision(id),
  pedido_id text,
  payload jsonb not null,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'ENVIADO')),
  intentos integer not null default 0,
  ultimo_error text,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz
);
alter table wms.eventos_pedidos enable row level security;
create index if not exists eventos_pedidos_pendientes_idx on wms.eventos_pedidos (creado_en) where estado = 'PENDIENTE';
create index if not exists eventos_pedidos_guia_idx on wms.eventos_pedidos (guia_id);

do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'eventos_pedidos' and policyname = 'lectura') then drop policy lectura on wms.eventos_pedidos; end if;
  create policy lectura on wms.eventos_pedidos for select to authenticated using (wms.es_usuario());
end $$;
revoke all on wms.eventos_pedidos from anon, authenticated;
grant select on wms.eventos_pedidos to authenticated;

-- El contenido del evento no se edita; solo se anota el envío.
create or replace function wms._evento_pedidos_inmutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Un evento hacia Pedidos no se borra' using errcode = 'P0001'; end if;
  if (new.tipo, new.salida_id, new.guia_id, new.pedido_id, new.payload, new.creado_en) is distinct from (old.tipo, old.salida_id, old.guia_id, old.pedido_id, old.payload, old.creado_en)
     or (old.estado = 'ENVIADO' and new.estado <> 'ENVIADO') then
    raise exception 'Un evento hacia Pedidos no se edita' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'eventos_pedidos_inmutable' and tgrelid = 'wms.eventos_pedidos'::regclass) then drop trigger eventos_pedidos_inmutable on wms.eventos_pedidos; end if; end $$;
create trigger eventos_pedidos_inmutable before update or delete on wms.eventos_pedidos for each row execute function wms._evento_pedidos_inmutable();

-- Arma el evento con la guía y lo confirmado en la conformidad (número, líneas con lote y vencimiento, bultos), o con el motivo de la anulación.
create or replace function wms._encolar_evento_guia(p_guia uuid, p_tipo text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare g wms.guias_remision; s wms.salidas; v_ped record; v_id uuid := gen_random_uuid(); v_payload jsonb;
begin
  select * into g from wms.guias_remision where id = p_guia;
  select * into s from wms.salidas where id = g.salida_id;
  select pedido_id, numero into v_ped from wms.pedidos_despacho where salida_id = s.id order by vigente desc, version desc limit 1;
  v_payload := jsonb_build_object('guia', g.numero, 'origen', g.origen, 'entorno', g.entorno, 'enlace', g.enlace, 'enlace_xml', g.enlace_xml, 'estado_sunat', g.estado_sunat, 'salida', s.numero,
                                  'pedido_id', v_ped.pedido_id, 'pedido_numero', v_ped.numero, 'fecha_traslado', coalesce(g.fecha_inicio_traslado, g.fecha_traslado),
                                  'bultos', coalesce(g.bultos, s.bultos_conformidad), 'lineas', g.lineas);
  if p_tipo = 'GUIA_ANULADA' then
    v_payload := v_payload || jsonb_build_object('caso', g.caso_anulacion, 'motivo', g.motivo_anulacion, 'baja_sunat', g.baja_sunat,
      'aviso', 'El WMS no modifica la factura: Contabilidad decide si se anula o si corresponde una nota de crédito');
  end if;
  insert into wms.eventos_pedidos (id, tipo, salida_id, guia_id, pedido_id, payload) values (v_id, p_tipo, s.id, g.id, v_ped.pedido_id, v_payload);
  return v_id;
end $$;

create or replace function wms.marcar_evento_pedidos(p_evento uuid, p_enviado boolean, p_error text default null) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para enviar eventos a Pedidos');
  update wms.eventos_pedidos
     set intentos = intentos + 1, estado = case when p_enviado then 'ENVIADO' else estado end,
         enviado_en = case when p_enviado then now() else enviado_en end, ultimo_error = case when p_enviado then null else nullif(btrim(coalesce(p_error, '')), '') end
   where id = p_evento and estado = 'PENDIENTE';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Contexto de la guía: todo lo que la guía toma del WMS (ruta, vehículo, conductor, bultos, líneas, punto de partida)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.contexto_guia(p_salida uuid) returns jsonb
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare s wms.salidas; v_ruta record; v_ped record; v_par jsonb;
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para ver los datos de la guía');
  select * into s from wms.salidas where id = p_salida;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  select r.id, r.numero, r.fecha, r.estado, ve.placa, c.nombre as conductor, c.dni as conductor_dni, a.nombre as auxiliar
    into v_ruta
    from wms.ruta_paradas pa join wms.rutas r on r.id = pa.ruta_id
    left join wms.vehiculos ve on ve.id = r.vehiculo_id
    left join wms.personal_transporte c on c.id = r.conductor_id
    left join wms.personal_transporte a on a.id = r.auxiliar_id
   where pa.salida_id = p_salida and pa.activa and r.estado <> 'CANCELADA' order by r.fecha desc limit 1;
  select pedido_id, numero, cliente_nombre, cliente_ruc, snapshot into v_ped from wms.pedidos_despacho where salida_id = p_salida order by vigente desc, version desc limit 1;
  select coalesce(jsonb_object_agg(clave, valor), '{}'::jsonb) into v_par from wms.parametros where clave like 'guia\_%' escape '\' or clave like 'sunat\_%' escape '\' or clave like 'nubefact\_%' escape '\';
  return jsonb_build_object(
    'salida', jsonb_build_object('id', s.id, 'numero', s.numero, 'tipo', s.tipo, 'motivo', s.motivo, 'estado', s.estado, 'conforme', wms._salida_conforme(p_salida)),
    'pedido', case when v_ped.pedido_id is null then null else jsonb_build_object('id', v_ped.pedido_id, 'numero', v_ped.numero, 'cliente', v_ped.cliente_nombre, 'ruc', v_ped.cliente_ruc, 'snapshot', v_ped.snapshot) end,
    'ruta', case when v_ruta.id is null then null else jsonb_build_object('id', v_ruta.id, 'numero', v_ruta.numero, 'fecha', v_ruta.fecha, 'placa', v_ruta.placa,
              'conductor', v_ruta.conductor, 'conductor_dni', v_ruta.conductor_dni, 'auxiliar', v_ruta.auxiliar) end,
    'bultos', coalesce(s.bultos_conformidad, (select count(*)::integer from wms.bultos where salida_id = p_salida and estado = 'EMBALADO')),
    'lineas', wms._lineas_de_guia(p_salida),
    'parametros', v_par);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Registrar la guía
-- ─────────────────────────────────────────────────────────────────────────────

-- A mano (contingencia) o la GRE que trae el cliente de almacenamiento (tipo B: el WMS no emite guía): número con formato, líneas de lo confirmado.
do $$ begin if to_regprocedure('wms.registrar_gre(uuid,text,text)') is not null then drop function wms.registrar_gre(uuid, text, text); end if; end $$;
create or replace function wms.registrar_gre(p_salida uuid, p_numero text, p_nota text default null, p_archivo_ref text default null) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.salidas; v_num text := upper(btrim(coalesce(p_numero, ''))); v_id uuid := gen_random_uuid(); v_placa text; v_fecha date;
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para registrar la guía de remisión');
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La salida ya no está abierta' using errcode = 'P0001'; end if;
  if v_num !~ '^[A-Z][A-Z0-9]{3}-[0-9]{1,8}$' then raise exception 'El número de la guía se escribe como T001-00001234 (serie, guion y número)' using errcode = 'P0001'; end if;
  if not wms._salida_conforme(p_salida) then raise exception 'La guía se registra cuando todo el pedido tiene la conformidad: sus lotes salen de lo confirmado' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.guias_remision where salida_id = p_salida and estado = 'VIGENTE') then
    raise exception 'Este pedido ya tiene una guía registrada. Para cambiarla, anúlala con el motivo y registra la nueva' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.guias_remision where numero = v_num and estado = 'VIGENTE') then
    raise exception 'La guía % ya está registrada en otra salida', v_num using errcode = 'P0001';
  end if;
  select ve.placa, r.fecha into v_placa, v_fecha
    from wms.ruta_paradas pa join wms.rutas r on r.id = pa.ruta_id left join wms.vehiculos ve on ve.id = r.vehiculo_id
   where pa.salida_id = p_salida and pa.activa order by r.fecha desc limit 1;
  insert into wms.guias_remision (id, salida_id, numero, lineas, placa, fecha_traslado, nota, registrada_por, origen, archivo_ref, bultos)
  values (v_id, p_salida, v_num, wms._lineas_de_guia(p_salida), v_placa, v_fecha, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(),
          case when s.tipo = 'CLIENTE' then 'CLIENTE' else 'MANUAL' end, nullif(btrim(coalesce(p_archivo_ref, '')), ''), s.bultos_conformidad);
  perform wms._encolar_evento_guia(v_id, 'GUIA_EMITIDA');
  perform wms.registrar_audit('gre_registrada', 'guias_remision', v_id::text, null, jsonb_build_object('numero', v_num, 'salida', s.numero, 'origen', case when s.tipo = 'CLIENTE' then 'CLIENTE' else 'MANUAL' end), null);
  return v_id;
end $$;

-- Electrónica: la aplicación ya la emitió con Nubefact (simulador, prueba o producción) y aquí se guarda el resultado, no se edita.
-- La ruta va antes que la guía: sin ruta con vehículo y conductor no se registra. Solo pedidos (el tipo B usa la GRE del cliente).
create or replace function wms.registrar_guia_electronica(
  p_salida uuid, p_numero text, p_enlace text, p_hash text, p_entorno text, p_fecha_inicio date, p_peso numeric, p_payload jsonb, p_respuesta jsonb,
  p_enlace_xml text default null, p_estado_sunat text default 'ACEPTADA'
) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.salidas; v_num text := upper(btrim(coalesce(p_numero, ''))); v_id uuid := gen_random_uuid(); v_ruta record;
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para emitir la guía de remisión');
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La salida ya no está abierta' using errcode = 'P0001'; end if;
  if s.tipo <> 'DISTRIBUCION' then
    raise exception 'La guía de una orden de un cliente de almacenamiento la trae el cliente: registra su GRE, el WMS no la emite' using errcode = 'P0001';
  end if;
  if v_num !~ '^[A-Z][A-Z0-9]{3}-[0-9]{1,8}$' then raise exception 'Nubefact devolvió un número de guía que no tiene el formato esperado (%)', v_num using errcode = 'P0001'; end if;
  if p_entorno is null or p_entorno not in ('SIMULADOR', 'PRUEBA', 'PRODUCCION') then raise exception 'Falta el entorno de Nubefact con el que se emitió' using errcode = 'P0001'; end if;
  if nullif(btrim(coalesce(p_enlace, '')), '') is null then raise exception 'Falta el enlace de la guía que devolvió Nubefact' using errcode = 'P0001'; end if;
  if not wms._salida_conforme(p_salida) then raise exception 'La guía se emite cuando todo el pedido tiene la conformidad: sus lotes salen de lo confirmado' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.guias_remision where salida_id = p_salida and estado = 'VIGENTE') then
    raise exception 'Este pedido ya tiene una guía. Para cambiarla, anúlala con el motivo y emite la nueva' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.guias_remision where numero = v_num and estado = 'VIGENTE') then
    raise exception 'La guía % ya está registrada en otra salida', v_num using errcode = 'P0001';
  end if;
  select r.id, r.fecha, ve.placa, r.conductor_id into v_ruta
    from wms.ruta_paradas pa join wms.rutas r on r.id = pa.ruta_id left join wms.vehiculos ve on ve.id = r.vehiculo_id
   where pa.salida_id = p_salida and pa.activa and r.estado <> 'CANCELADA' order by r.fecha desc limit 1;
  if v_ruta.id is null then raise exception 'Asigna primero el pedido a una ruta: la guía toma el vehículo, el conductor y la fecha de la ruta' using errcode = 'P0001'; end if;
  if v_ruta.placa is null or v_ruta.conductor_id is null then raise exception 'La ruta todavía no tiene vehículo y conductor: complétalos antes de emitir la guía' using errcode = 'P0001'; end if;
  if p_fecha_inicio is null then raise exception 'Indica la fecha de inicio del traslado' using errcode = 'P0001'; end if;
  if p_estado_sunat is null or p_estado_sunat not in ('ACEPTADA', 'PENDIENTE') then raise exception 'Una guía rechazada por SUNAT no se registra: se corrige y se vuelve a enviar' using errcode = 'P0001'; end if;
  if p_peso is not null and p_peso <= 0 then raise exception 'El peso tiene que ser mayor que cero' using errcode = 'P0001'; end if;
  insert into wms.guias_remision (id, salida_id, numero, lineas, placa, fecha_traslado, registrada_por, origen, entorno, enlace, hash_nubefact, fecha_inicio_traslado, peso_kg, bultos, payload, respuesta, enlace_xml, estado_sunat)
  values (v_id, p_salida, v_num, wms._lineas_de_guia(p_salida), v_ruta.placa, v_ruta.fecha, auth.uid(), 'NUBEFACT', p_entorno, btrim(p_enlace), nullif(btrim(coalesce(p_hash, '')), ''),
          p_fecha_inicio, p_peso, s.bultos_conformidad, p_payload, p_respuesta, nullif(btrim(coalesce(p_enlace_xml, '')), ''), p_estado_sunat);
  perform wms._encolar_evento_guia(v_id, 'GUIA_EMITIDA');
  perform wms.registrar_audit('guia_electronica_emitida', 'guias_remision', v_id::text, null, jsonb_build_object('numero', v_num, 'salida', s.numero, 'entorno', p_entorno), null);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Reapertura de la conformidad (caso 2): el stock vuelve de Despacho al rack por el ledger y la Orden vuelve a conformidad
-- ─────────────────────────────────────────────────────────────────────────────

select wms._ampliar_check_in('wms.salida_movimientos', 'salida_movimientos_tipo_check', 'tipo', array['REVERSA_STAGING']);

-- El ledger solo acepta un MOVIMIENTO de salida si coincide con el paso que dejó escrito el flujo de salidas (STAGING); la reversa tiene su propio paso.
do $$
declare v_oid oid; v_def text; v_viejo text := '(p_tipo = ''MOVIMIENTO'' and m.tipo = ''STAGING'')'; v_nuevo text := '(p_tipo = ''MOVIMIENTO'' and m.tipo in (''STAGING'', ''REVERSA_STAGING''))';
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'postear_movimiento' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position(v_viejo in v_def) = 0 then
    if position(v_nuevo in v_def) > 0 then return; end if;            -- ya aplicada (re-ejecución)
    raise exception 'No se encontró el texto esperado en wms.postear_movimiento: %', v_viejo;
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

-- Invariante por línea: lo que está en staging es lo que pasó menos lo que se devolvió al rack al reabrir la conformidad.
do $$
declare v_oid oid; v_def text; v_viejo text := 'coalesce(sum(cantidad) filter (where tipo = ''STAGING''), 0), coalesce(sum(cantidad) filter (where tipo = ''SALIDA''), 0)';
        v_nuevo text := 'coalesce(sum(cantidad) filter (where tipo = ''STAGING''), 0) - coalesce(sum(cantidad) filter (where tipo = ''REVERSA_STAGING''), 0), coalesce(sum(cantidad) filter (where tipo = ''SALIDA''), 0)';
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'trg_invariantes_salida_movimientos' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position(v_viejo in v_def) = 0 then
    if position(v_nuevo in v_def) > 0 then return; end if;
    raise exception 'No se encontró el texto esperado en wms.trg_invariantes_salida_movimientos: %', v_viejo;
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

create or replace function wms._reabrir_conformidad(p_salida uuid, p_motivo text) returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.salidas; o wms.ordenes_picking; ol wms.ordenes_picking_lineas; r wms.reservas; v_paso uuid; v_mov uuid; v_origen text; v_n integer := 0;
begin
  select * into s from wms.salidas where id = p_salida for update;
  select * into o from wms.ordenes_picking where salida_id = p_salida and estado <> 'CANCELADA' order by id limit 1 for update;
  if not found then raise exception 'Esa salida no tiene Orden de Salida' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.carga_bultos cb join wms.bultos b on b.id = cb.bulto_id where b.salida_id = p_salida and cb.estado = 'CARGADO') then
    raise exception 'Ya hay bultos de este pedido cargados en el vehículo: retíralos de la carga antes de corregir el contenido' using errcode = 'P0001';
  end if;
  for ol in select * from wms.ordenes_picking_lineas where orden_id = o.id and conformidad = 'CONFORME' and cantidad > 0 order by id for update loop
    select * into r from wms.reservas where id = ol.reserva_id for update;
    if r.estado <> 'EN_STAGING' then raise exception 'Esas unidades ya no están en Despacho: no se puede reabrir la conformidad' using errcode = 'P0001'; end if;
    select origen into v_origen from wms.partidas where procedencia_id = r.procedencia_id and lote_id = r.lote_id order by id limit 1;
    insert into wms.salida_movimientos (salida_id, linea_id, orden_linea_id, tipo, cantidad, actor_id, preparador_id)
    values (p_salida, ol.linea_id, ol.id, 'REVERSA_STAGING', ol.cantidad, auth.uid(), o.picker_id) returning id into v_paso;
    perform set_config('wms.salida_ctx', jsonb_build_object('paso', v_paso)::text, true);
    v_mov := wms.postear_movimiento('MOVIMIENTO', 'Se reabrió la conformidad de ' || s.numero || ': ' || p_motivo,
      jsonb_build_array(
        jsonb_build_object('posicion_id', r.posicion_id, 'producto_id', r.producto_id, 'lote_id', r.lote_id, 'propietario_id', r.propietario_id,
                           'estado', r.estado_stock, 'origen', v_origen, 'procedencia_id', r.procedencia_id, 'delta', -r.cantidad),
        jsonb_build_object('posicion_id', r.posicion_origen_id, 'producto_id', r.producto_id, 'lote_id', r.lote_id, 'propietario_id', r.propietario_id,
                           'estado', r.estado_stock, 'origen', v_origen, 'procedencia_id', r.procedencia_id, 'delta', r.cantidad)),
      'salida_linea', ol.linea_id::text);
    perform set_config('wms.salida_ctx', '', true);
    update wms.salida_movimientos set movimiento_id = v_mov where id = v_paso;
    update wms.reservas set estado = 'ACTIVA', posicion_id = r.posicion_origen_id, actualizada_en = now() where id = r.id;
    update wms.ordenes_picking_lineas set conformidad = 'PENDIENTE', verificador_id = null, verificada_en = null, nota_conformidad = null where id = ol.id;
    v_n := v_n + 1;
  end loop;
  update wms.bultos set estado = 'ANULADO', anulado_por = auth.uid(), anulado_en = now(), motivo_anulacion = 'Se reabrió la conformidad: ' || p_motivo
   where salida_id = p_salida and estado = 'EMBALADO';
  update wms.salida_lineas set estado = 'PICKEADA' where salida_id = p_salida and estado = 'CONFORME';
  update wms.ordenes_picking set estado = 'EN_CURSO' where id = o.id;
  update wms.salidas set bultos_conformidad = null, conformada_por = null, conformada_en = null where id = p_salida;
  return v_n;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Anular la guía (D-90): tres casos, solo el Jefe de Transporte y con motivo. Una guía nunca se borra ni se edita.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.anular_guia(p_guia uuid, p_caso integer, p_motivo text) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare g wms.guias_remision; s wms.salidas; v_mot text := nullif(btrim(coalesce(p_motivo, '')), ''); v_reabierta boolean := false; v_baja text;
begin
  perform wms._exigir_accion('anular_guia', 'Solo el Jefe de Transporte puede anular una guía');
  if p_caso is null or p_caso not in (1, 2, 3) then raise exception 'Elige qué se equivocó: los datos del traslado, el contenido, o la guía ya salió' using errcode = 'P0001'; end if;
  if v_mot is null then raise exception 'Cuenta por qué se anula la guía' using errcode = 'P0001'; end if;
  select * into g from wms.guias_remision where id = p_guia for update;
  if not found then raise exception 'No encontramos esa guía' using errcode = 'P0001'; end if;
  if g.estado = 'ANULADA' then raise exception 'Esa guía ya está anulada' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = g.salida_id for update;
  if p_caso = 3 or s.estado <> 'ABIERTA' then
    raise exception 'Después de la salida confirmada la guía no se anula desde el WMS: se corrige con el retorno como devolución y una nueva Orden de Salida con su guía' using errcode = 'P0001';
  end if;
  if p_caso = 2 then
    perform wms._reabrir_conformidad(g.salida_id, v_mot);
    v_reabierta := true;
  end if;
  v_baja := case when g.origen = 'NUBEFACT' then 'PENDIENTE' else 'NO_APLICA' end;
  update wms.guias_remision set estado = 'ANULADA', anulada_por = auth.uid(), anulada_en = now(), motivo_anulacion = v_mot, caso_anulacion = p_caso, baja_sunat = v_baja where id = p_guia;
  perform wms._encolar_evento_guia(p_guia, 'GUIA_ANULADA');
  perform wms.registrar_audit('gre_anulada', 'guias_remision', p_guia::text, jsonb_build_object('numero', g.numero), jsonb_build_object('caso', p_caso, 'reabierta', v_reabierta, 'baja_sunat', v_baja), v_mot);
  return jsonb_build_object('caso', p_caso, 'conformidad_reabierta', v_reabierta, 'baja_sunat', v_baja);
end $$;

-- La función de la S6b se conserva como el caso 1 (datos del traslado) para no romper lo que ya la usa.
create or replace function wms.anular_gre(p_guia uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  perform wms.anular_guia(p_guia, 1, p_motivo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.contexto_guia(uuid), wms.registrar_gre(uuid, text, text, text), wms.registrar_guia_electronica(uuid, text, text, text, text, date, numeric, jsonb, jsonb, text, text),
  wms.anular_guia(uuid, integer, text), wms.anular_gre(uuid, text), wms.marcar_evento_pedidos(uuid, boolean, text) to authenticated;
revoke execute on all functions in schema wms from public;
