-- 0023 · WMS · Orden de Salida · OS-2: la Orden de Salida (OS-AAAA-NNNNN), quién picó, la conformidad en una sola tabla y el número de bultos
--
-- Respuestas de Dirección Técnica del 2026-10-17 (docs/wms/respuestas-dt-2026-10.md, §1 pasos 1–5 y 7, y §7):
--   1. Las dos salidas (pedido de Logissa y orden de un cliente de almacenamiento) se llaman ORDEN DE SALIDA y su correlativo es OS-AAAA-NNNNN.
--   2. Se imprime la orden y se pica con la hoja o con el celular. Queda registrado QUIÉN PICÓ: se elige al imprimir o al iniciar (`generar_orden_picking`, `designar_picker`).
--      El auxiliar no confirma nada en el sistema: la conformidad cubre lo picado.
--   3. CONFORMIDAD de toda la orden de una vez (`conformar_orden`): «Conforme» con un click o, por línea, otro lote (el vencimiento se actualiza solo), menos cantidad
--      o no encontrado; registra el NÚMERO DE BULTOS (caja master). Quien picó no puede dar la conformidad. Al conformar, el stock pasa a Despacho.
--   4. Embalaje solo para pedidos a provincia: la Orden lleva `requiere_embalaje` (según el ubigeo de entrega del pedido; sin dato, se embala). Los pedidos a Lima
--      quedan con sus bultos desde la conformidad (sin detalle de contenido) para cargarlos por QR.
--   5. Motivos (§7): devolución al proveedor es una salida normal de Logissa (solo antes del vencimiento, parámetro de la política de canje); lo vencido no sale
--      de Aprobados nunca (solo a Bajas); un cliente de almacenamiento usa venta, pesquisa DIGEMID (nunca vencidos) y muestra.
--      (La destrucción desde Bajas llega con el PR de Bajas; todavía no se puede crear una orden de destrucción.)
-- Re-ejecutable. Se aplica a mano, después de la 0022. Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Parámetros
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.parametros (clave, valor, nota) values
  ('ubigeos_lima_metropolitana', '1501,0701',
   'Prefijos de ubigeo (provincia) que se entregan en Lima Metropolitana y Callao: no necesitan embalaje. Cualquier otro destino es provincia y se embala. Sin ubigeo en el pedido, se embala. DT puede ajustarlo.'),
  ('devolucion_proveedor_dias_minimos', '0',
   'PENDIENTE de la política de canje de cada proveedor (Biosana, Prades Lab…): días de vida útil que debe tener un lote para devolverlo al proveedor. Hoy: cualquier lote no vencido.')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columnas y tablas
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.salidas add column if not exists requiere_embalaje boolean not null default true;
alter table wms.salidas add column if not exists bultos_conformidad integer;
alter table wms.salidas add column if not exists conformada_por uuid;
alter table wms.salidas add column if not exists conformada_en timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'salidas_bultos_conformidad_check' and conrelid = 'wms.salidas'::regclass) then
    alter table wms.salidas add constraint salidas_bultos_conformidad_check check (bultos_conformidad is null or (bultos_conformidad >= 1 and bultos_conformidad <= 99));
  end if;
end $$;

alter table wms.ordenes_picking add column if not exists picker_id uuid;
alter table wms.ordenes_picking add column if not exists picker_designado_por uuid;
alter table wms.ordenes_picking add column if not exists picker_designado_en timestamptz;

-- Una línea que no se encontró, o que se reemplazó por otro lote, queda con cantidad 0 (la historia no se borra).
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid = 'wms.ordenes_picking_lineas'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%cantidad > 0%' loop
    execute format('alter table wms.ordenes_picking_lineas drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'ordenes_picking_lineas_cantidad_check' and conrelid = 'wms.ordenes_picking_lineas'::regclass) then
    alter table wms.ordenes_picking_lineas add constraint ordenes_picking_lineas_cantidad_check check (cantidad >= 0);
  end if;
end $$;

-- Cada ajuste que la conformidad hizo a una línea (otro lote, menos cantidad, no encontrado). Inmutable.
create table if not exists wms.ajustes_conformidad (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references wms.ordenes_picking(id),
  linea_id uuid not null references wms.salida_lineas(id),
  orden_linea_id uuid not null,
  tipo text not null check (tipo in ('OTRO_LOTE', 'MENOS', 'NO_ENCONTRADO')),
  lote_antes_id uuid references wms.lotes(id),
  lote_despues_id uuid references wms.lotes(id),
  cantidad_antes integer not null,
  cantidad_despues integer not null,
  nota text,
  por uuid not null,
  en timestamptz not null default now()
);
alter table wms.ajustes_conformidad enable row level security;
create index if not exists ajustes_conformidad_orden_idx on wms.ajustes_conformidad (orden_id);
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'ajustes_conformidad' and policyname = 'lectura') then drop policy lectura on wms.ajustes_conformidad; end if;
  create policy lectura on wms.ajustes_conformidad for select to authenticated using (wms.es_usuario());
  revoke all on wms.ajustes_conformidad from anon, authenticated;
  grant select on wms.ajustes_conformidad to authenticated;
  if exists (select 1 from pg_trigger where tgname = 'ajustes_conformidad_inmutable' and tgrelid = 'wms.ajustes_conformidad'::regclass and not tgisinternal) then
    drop trigger ajustes_conformidad_inmutable on wms.ajustes_conformidad;
  end if;
end $$;
create trigger ajustes_conformidad_inmutable before update or delete on wms.ajustes_conformidad for each row execute function wms.trg_inmutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tipos y motivos de la Orden de Salida
-- ─────────────────────────────────────────────────────────────────────────────

-- Distribución: venta o devolución al proveedor (las dos son stock de Logissa que sale por la puerta).
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid = 'wms.salidas'::regclass and contype = 'c'
            and pg_get_constraintdef(oid) ilike '%DISTRIBUCION%' and pg_get_constraintdef(oid) ilike '%MUESTRA%' and pg_get_constraintdef(oid) ilike '%tipo%motivo%' loop
    execute format('alter table wms.salidas drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'salidas_tipo_motivo_check' and conrelid = 'wms.salidas'::regclass) then
    alter table wms.salidas add constraint salidas_tipo_motivo_check check (
      (tipo = 'DISTRIBUCION' and motivo in ('VENTA', 'DEVOLUCION_PROVEEDOR')) or (tipo = 'MUESTRA' and motivo = 'MUESTRA') or tipo = 'CLIENTE');
  end if;
end $$;

-- ¿Puede este lote salir de Aprobados en esta orden? Lo vencido NUNCA sale de Aprobados (solo a Bajas). Una venta de Logissa pide 60 días de vida útil; una devolución al
-- proveedor solo se permite antes del vencimiento (y con los días que pida la política de canje, parámetro).
create or replace function wms._lote_apto(p_vence date, p_tipo text, p_motivo text, p_hoy date, p_min_dias integer)
returns table (apto boolean, requiere_aprobacion_dt boolean, razon text)
language plpgsql stable as $$
declare v_canje integer;
begin
  if p_vence is not null and p_vence < p_hoy then
    return query select false, false,
      case when p_motivo = 'DEVOLUCION_PROVEEDOR' then 'El lote está vencido: la devolución al proveedor solo se permite antes del vencimiento. Lo vencido va a Bajas.'
           else 'El lote está vencido: lo vencido no sale de Aprobados, va a Bajas.' end::text;
    return;
  end if;
  if p_tipo = 'DISTRIBUCION' and p_motivo = 'DEVOLUCION_PROVEEDOR' then
    select coalesce((select valor::integer from wms.parametros where clave = 'devolucion_proveedor_dias_minimos'), 0) into v_canje;
    if p_vence is not null and (p_vence - p_hoy) < v_canje then
      return query select false, false, format('El lote vence en %s días: la política de canje pide al menos %s para devolverlo al proveedor.', p_vence - p_hoy, v_canje);
      return;
    end if;
  elsif p_tipo = 'DISTRIBUCION' and p_vence is not null and (p_vence - p_hoy) < p_min_dias then
    return query select false, false, format('El lote vence en %s días: un pedido de venta pide al menos %s.', p_vence - p_hoy, p_min_dias);
    return;
  end if;
  return query select true, false, null::text;
end $$;

-- ¿A provincia? Según el ubigeo del cliente en el pedido. Sin pedido o sin ubigeo se embala (lo más prudente).
create or replace function wms._requiere_embalaje(p_referencia_tipo text, p_referencia_id text) returns boolean
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_ubigeo text; v_lima text;
begin
  if p_referencia_tipo is distinct from 'pedido' or p_referencia_id is null then return true; end if;
  select nullif(btrim(coalesce(d.snapshot->'cliente'->>'ubigeo', '')), '') into v_ubigeo from wms.pedidos_despacho d where d.pedido_id = p_referencia_id and d.vigente;
  if v_ubigeo is null then return true; end if;
  select valor into v_lima from wms.parametros where clave = 'ubigeos_lima_metropolitana';
  return not exists (select 1 from unnest(string_to_array(coalesce(v_lima, ''), ',')) pre where nullif(btrim(pre), '') is not null and v_ubigeo like btrim(pre) || '%');
end $$;

-- crear_salida (de la 0012): el correlativo pasa a OS-AAAA-NNNNN, la devolución al proveedor es una salida de distribución, el cliente ya no «devuelve» ni «destruye» desde
-- Aprobados, y la orden nace sabiendo si necesita embalaje. Se reescribe el texto exacto que cambia; si no está, la migración falla en voz alta.
do $$
declare v_oid oid; v_def text; c record;
begin
  for c in
    select * from (values
      ('''SAL-'' || to_char(now(), ''YYYY'') || ''-'' || lpad(wms.siguiente_correlativo(''SAL-'' || to_char(now(), ''YYYY''))::text, 5, ''0'')',
       '''OS-'' || to_char(now(), ''YYYY'') || ''-'' || lpad(wms.siguiente_correlativo(''OS-'' || to_char(now(), ''YYYY''))::text, 5, ''0'')'),
      ('(p_tipo = ''DISTRIBUCION'' and p_motivo is distinct from ''VENTA'')', '(p_tipo = ''DISTRIBUCION'' and p_motivo not in (''VENTA'', ''DEVOLUCION_PROVEEDOR''))'),
      ('p_motivo not in (''VENTA'', ''PESQUISA_DIGEMID'', ''DESTRUCCION'', ''DEVOLUCION_PROVEEDOR'', ''MUESTRA'')', 'p_motivo not in (''VENTA'', ''PESQUISA_DIGEMID'', ''MUESTRA'')'),
      ('  perform wms.registrar_audit(''salida_creada'',',
       '  update wms.salidas set requiere_embalaje = wms._requiere_embalaje(p_referencia_tipo, p_referencia_id) where id = v_id;' || chr(10) || '  perform wms.registrar_audit(''salida_creada'',')
    ) as t(viejo, nuevo)
  loop
    select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'crear_salida' order by p.oid desc limit 1;
    v_def := pg_get_functiondef(v_oid);
    if position(c.viejo in v_def) = 0 then
      if position(c.nuevo in v_def) > 0 then continue; end if;          -- ya aplicada (re-ejecución)
      raise exception 'No se encontró el texto esperado en wms.crear_salida: %', c.viejo;
    end if;
    execute replace(v_def, c.viejo, c.nuevo);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Lo confirmado ya no cuenta las líneas en cero; el embalaje respeta los bultos de la conformidad
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare v_oid oid; v_def text; c record;
begin
  for c in
    select * from (values
      ('_confirmado_por_lote', 'and l.conformidad = ''CONFORME''', 'and l.conformidad = ''CONFORME'' and l.cantidad > 0'),
      ('_lineas_de_guia', 'and l.conformidad = ''CONFORME''', 'and l.conformidad = ''CONFORME'' and l.cantidad > 0'),
      ('embalar_salida', '  if v_total < 1 or v_total > 99 then raise exception ''Un pedido se embala en 1 a 99 bultos'' using errcode = ''P0001''; end if;',
       '  if v_total < 1 or v_total > 99 then raise exception ''Un pedido se embala en 1 a 99 bultos'' using errcode = ''P0001''; end if;' || chr(10)
       || '  if not s.requiere_embalaje then raise exception ''Este pedido va a Lima: no necesita embalaje, sus bultos ya quedaron registrados en la conformidad'' using errcode = ''P0001''; end if;' || chr(10)
       || '  if s.bultos_conformidad is not null and v_total <> s.bultos_conformidad then' || chr(10)
       || '    raise exception ''La conformidad registró % bultos: el embalaje tiene que repartir lo confirmado en esos %'', s.bultos_conformidad, s.bultos_conformidad using errcode = ''P0001'';' || chr(10)
       || '  end if;'),
      ('reabrir_embalaje', '  if not wms._salida_embalada(p_salida) then raise exception ''Este pedido no está embalado'' using errcode = ''P0001''; end if;',
       '  if not wms._salida_embalada(p_salida) then raise exception ''Este pedido no está embalado'' using errcode = ''P0001''; end if;' || chr(10)
       || '  if not s.requiere_embalaje then raise exception ''Este pedido va a Lima: sus bultos son los de la conformidad y no se reabren desde el embalaje'' using errcode = ''P0001''; end if;')
    ) as t(fn, viejo, nuevo)
  loop
    select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = c.fn order by p.oid desc limit 1;
    v_def := pg_get_functiondef(v_oid);
    if position(c.viejo in v_def) = 0 then
      if position(c.nuevo in v_def) > 0 then continue; end if;
      raise exception 'No se encontró el texto esperado en wms.%: %', c.fn, c.viejo;
    end if;
    execute replace(v_def, c.viejo, c.nuevo);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Imprimir la orden y quién pica
-- ─────────────────────────────────────────────────────────────────────────────

-- ¿Puede esa persona hacer el picking? Auxiliares, Jefe de Almacén y Jefe de Transporte (vigentes hoy).
create or replace function wms._puede_pickear(p_persona uuid) returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (select 1 from wms.usuario_roles r
                  where r.user_id = p_persona and r.rol in ('auxiliar', 'jefe_almacen', 'jefe_transporte')
                    and r.desde <= current_date and (r.hasta is null or r.hasta >= current_date))
$$;

-- Quiénes pueden pickear hoy (para elegir al imprimir la orden). Solo ids: los nombres los pone la aplicación.
create or replace function wms.personal_de_picking() returns setof uuid
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  return query select distinct r.user_id from wms.usuario_roles r
                where r.rol in ('auxiliar', 'jefe_almacen', 'jefe_transporte') and r.desde <= current_date and (r.hasta is null or r.hasta >= current_date);
end $$;

-- Genera (= «imprime») la Orden de Salida: una línea por reserva, en el orden del recorrido. Idempotente. `p_picker` es quien va a pickear (se puede elegir después).
do $$ begin
  if to_regprocedure('wms.generar_orden_picking(uuid)') is not null then drop function wms.generar_orden_picking(uuid); end if;
end $$;
create or replace function wms.generar_orden_picking(p_salida uuid, p_picker uuid default null) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.salidas; v_id uuid;
begin
  perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para preparar salidas');
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa Orden de Salida' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La Orden de Salida ya no está abierta' using errcode = 'P0001'; end if;
  select id into v_id from wms.ordenes_picking where salida_id = p_salida and estado <> 'CANCELADA';
  if found then
    if p_picker is not null then perform wms.designar_picker(v_id, p_picker); end if;
    return v_id;
  end if;
  if exists (select 1 from wms.salida_lineas where salida_id = p_salida and estado in ('PENDIENTE', 'SIN_STOCK')) then
    raise exception 'Hay líneas sin stock o sin asignar: resuélvelas antes de imprimir la orden' using errcode = 'P0001';
  end if;
  if not exists (select 1 from wms.salida_lineas where salida_id = p_salida and estado = 'ASIGNADA') then
    raise exception 'La Orden de Salida no tiene líneas asignadas' using errcode = 'P0001';
  end if;
  if s.tipo = 'CLIENTE' and s.aprobada_dt_por is null
     and exists (select 1 from wms.reservas r join wms.salida_lineas sl on sl.id = r.linea_id join wms.lotes lt on lt.id = r.lote_id
                  where sl.salida_id = p_salida and r.estado = 'ACTIVA' and lt.vence is not null and lt.vence < wms._hoy_lima()) then
    raise exception 'Hay lotes vencidos: lo vencido no sale de Aprobados' using errcode = 'P0001';
  end if;
  if p_picker is not null and not wms._puede_pickear(p_picker) then
    raise exception 'Quien pica tiene que ser auxiliar, Jefe de Almacén o Jefe de Transporte' using errcode = 'P0001';
  end if;
  v_id := gen_random_uuid();
  insert into wms.ordenes_picking (id, numero, salida_id, generada_por, picker_id, picker_designado_por, picker_designado_en)
  values (v_id, 'OP-' || to_char(now(), 'YYYY') || '-' || lpad(wms.siguiente_correlativo('OP-' || to_char(now(), 'YYYY'))::text, 5, '0'), p_salida, auth.uid(),
          p_picker, case when p_picker is not null then auth.uid() end, case when p_picker is not null then now() end);
  insert into wms.ordenes_picking_lineas (orden_id, linea_id, reserva_id, posicion_id, orden_recorrido, producto_id, lote_id, vence, cantidad)
  select v_id, r.linea_id, r.id, r.posicion_id, ps.orden_recorrido, r.producto_id, r.lote_id, lt.vence, r.cantidad
    from wms.reservas r
    join wms.salida_lineas sl on sl.id = r.linea_id
    join wms.posiciones ps on ps.id = r.posicion_id
    join wms.lotes lt on lt.id = r.lote_id
   where sl.salida_id = p_salida and r.estado = 'ACTIVA' and sl.estado = 'ASIGNADA'
   order by ps.orden_recorrido nulls last, ps.codigo, lt.vence nulls last, r.id;
  update wms.salida_lineas set estado = 'EN_PICKING' where salida_id = p_salida and estado = 'ASIGNADA';
  perform wms.registrar_audit('orden_de_salida_impresa', 'ordenes_picking', v_id::text, null, jsonb_build_object('picker', p_picker), null);
  return v_id;
end $$;

-- Quién pica: se elige al imprimir o al iniciar el picking. No cambia una vez que empezó la conformidad.
create or replace function wms.designar_picker(p_orden uuid, p_picker uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare o wms.ordenes_picking;
begin
  perform wms._exigir_accion('cambiar_lote_asignado', 'No tienes permiso para indicar quién hace el picking');
  select * into o from wms.ordenes_picking where id = p_orden for update;
  if not found then raise exception 'No encontramos esa Orden de Salida' using errcode = 'P0001'; end if;
  if o.estado = 'CANCELADA' then raise exception 'Esa orden está cancelada' using errcode = 'P0001'; end if;
  if p_picker is null or not wms._puede_pickear(p_picker) then raise exception 'Quien pica tiene que ser auxiliar, Jefe de Almacén o Jefe de Transporte' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.ordenes_picking_lineas where orden_id = p_orden and conformidad <> 'PENDIENTE') then
    raise exception 'La conformidad ya empezó: quien pica no se cambia' using errcode = 'P0001';
  end if;
  update wms.ordenes_picking set picker_id = p_picker, picker_designado_por = auth.uid(), picker_designado_en = now() where id = p_orden;
  perform wms.registrar_audit('picker_designado', 'ordenes_picking', p_orden::text, to_jsonb(o.picker_id), to_jsonb(p_picker), null);
end $$;

-- Con el celular, quien pickea queda como el picker de la orden si nadie lo había indicado.
create or replace function wms._tr_picker_de_la_orden() returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if new.picking = 'PICKEADA' and old.picking is distinct from 'PICKEADA' and new.picker_id is not null then
    update wms.ordenes_picking set picker_id = new.picker_id, picker_designado_por = new.picker_id, picker_designado_en = now() where id = new.orden_id and picker_id is null;
  end if;
  return null;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'ordenes_picking_lineas_picker' and tgrelid = 'wms.ordenes_picking_lineas'::regclass and not tgisinternal) then
    drop trigger ordenes_picking_lineas_picker on wms.ordenes_picking_lineas;
  end if;
end $$;
create trigger ordenes_picking_lineas_picker after update of picking on wms.ordenes_picking_lineas for each row execute function wms._tr_picker_de_la_orden();

-- Un lote en Reserva no se pickea (OS-1); lo que no se encontró o se reemplazó (cantidad 0) no cuenta.
create or replace function wms._picking_no_lote_en_reserva() returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if new.cantidad > 0 and wms.lote_bloqueado(new.lote_id) and (tg_op = 'INSERT' or (new.picking <> 'PENDIENTE' and old.picking = 'PENDIENTE')) then
    raise exception 'El lote % está en Reserva: no se puede pickear. Cambia el lote en la Orden de Salida.', (select codigo from wms.lotes where id = new.lote_id) using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Conformidad de toda la orden
-- ─────────────────────────────────────────────────────────────────────────────

-- La asignación vigente de una línea con lo ya pickeado o en Despacho incluido (la de `_asignacion_json` solo ve lo todavía activo).
create or replace function wms._asignacion_json_vigente(p_linea uuid) returns jsonb
language sql stable security definer set search_path = wms, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('lote_id', x.lote_id, 'lote', x.codigo, 'vence', x.vence, 'cantidad', x.cantidad) order by x.vence nulls last, x.codigo), '[]'::jsonb)
    from (select r.lote_id, lt.codigo, lt.vence, sum(r.cantidad)::integer as cantidad
            from wms.reservas r join wms.lotes lt on lt.id = r.lote_id
           where r.linea_id = p_linea and r.estado in ('ACTIVA', 'EN_TRANSITO', 'EN_STAGING')
           group by r.lote_id, lt.codigo, lt.vence) x
$$;

-- Las unidades de una línea de la orden pasan del rack a Despacho (movimiento del libro, hecho por quien da la conformidad; el picker ejecutó).
create or replace function wms._pasar_a_despacho(p_orden_linea uuid, p_nota text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare ol wms.ordenes_picking_lineas; r wms.reservas; o wms.ordenes_picking; v_stg uuid; v_paso uuid; v_mov uuid; v_origen text;
begin
  select * into ol from wms.ordenes_picking_lineas where id = p_orden_linea for update;
  select * into o from wms.ordenes_picking where id = ol.orden_id;
  v_stg := wms._posicion_de_zona('DESPACHO', null);
  select * into r from wms.reservas where id = ol.reserva_id for update;
  if r.estado = 'ACTIVA' then update wms.reservas set estado = 'EN_TRANSITO', actualizada_en = now() where id = r.id; r.estado := 'EN_TRANSITO'; end if;
  if r.estado <> 'EN_TRANSITO' then raise exception 'Esas unidades no están disponibles para pasar a Despacho' using errcode = 'P0001'; end if;
  select origen into v_origen from wms.partidas where procedencia_id = r.procedencia_id and lote_id = r.lote_id order by id limit 1;
  insert into wms.salida_movimientos (salida_id, linea_id, orden_linea_id, tipo, cantidad, actor_id, preparador_id)
  values (o.salida_id, ol.linea_id, ol.id, 'STAGING', ol.cantidad, auth.uid(), o.picker_id) returning id into v_paso;
  perform set_config('wms.salida_ctx', jsonb_build_object('paso', v_paso)::text, true);
  v_mov := wms.postear_movimiento('MOVIMIENTO', 'Conformidad de la Orden de Salida ' || (select numero from wms.salidas where id = o.salida_id),
    jsonb_build_array(
      jsonb_build_object('posicion_id', r.posicion_origen_id, 'producto_id', r.producto_id, 'lote_id', r.lote_id, 'propietario_id', r.propietario_id,
                         'estado', r.estado_stock, 'origen', v_origen, 'procedencia_id', r.procedencia_id, 'delta', -r.cantidad),
      jsonb_build_object('posicion_id', v_stg, 'producto_id', r.producto_id, 'lote_id', r.lote_id, 'propietario_id', r.propietario_id,
                         'estado', r.estado_stock, 'origen', v_origen, 'procedencia_id', r.procedencia_id, 'delta', r.cantidad)),
    'salida_linea', ol.linea_id::text);
  perform set_config('wms.salida_ctx', '', true);
  update wms.salida_movimientos set movimiento_id = v_mov where id = v_paso;
  update wms.reservas set estado = 'EN_STAGING', posicion_id = v_stg, actualizada_en = now() where id = r.id;
  return v_mov;
end $$;

-- p_lineas = [{"orden_linea_id": …, "resultado": "CONFORME" | "OTRO_LOTE" | "MENOS" | "NO_ENCONTRADO", "lote_id": …, "cantidad": n, "nota": "…"}]; lo que no se menciona es CONFORME.
-- Todo o nada: si algo no cierra, no se registra nada. Devuelve un resumen.
create or replace function wms.conformar_orden(p_orden uuid, p_lineas jsonb default null, p_bultos integer default null, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare
  o wms.ordenes_picking; s wms.salidas; ol wms.ordenes_picking_lineas; l wms.salida_lineas; lt wms.lotes; x jsonb; v_res text; v_cant integer; v_lote uuid; v_nota text;
  v_hoy date := wms._hoy_lima(); v_min integer; v_apto record; v_ant jsonb; v_nueva jsonb; v_distinto boolean; v_nuevas uuid[]; v_nid uuid; v_nid2 uuid;
  v_unidades integer; v_movs integer := 0; v_ajustes integer := 0; i integer; v_ids uuid[];
begin
  perform wms._exigir_accion('dar_conformidad', 'No tienes permiso para dar la conformidad');
  select * into o from wms.ordenes_picking where id = p_orden for update;
  if not found then raise exception 'No encontramos esa Orden de Salida' using errcode = 'P0001'; end if;
  if o.estado = 'CANCELADA' then raise exception 'Esa orden está cancelada' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = o.salida_id for update;
  if s.estado <> 'ABIERTA' then raise exception 'La Orden de Salida ya no está abierta' using errcode = 'P0001'; end if;
  if o.picker_id is null then raise exception 'Antes de la conformidad se indica quién hizo el picking (al imprimir la orden o al iniciarla)' using errcode = 'P0001'; end if;
  if o.picker_id = auth.uid() or exists (select 1 from wms.ordenes_picking_lineas where orden_id = p_orden and picker_id = auth.uid()) then
    raise exception 'La conformidad la da otra persona, no quien hizo el picking' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.ordenes_picking_lineas where orden_id = p_orden and picking = 'DISCREPANCIA') then
    raise exception 'Hay una línea con discrepancia de picking: resuélvela antes de la conformidad' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.ordenes_picking_lineas where orden_id = p_orden and conformidad = 'OBSERVADA') then
    raise exception 'Hay una línea observada: corrígela antes de la conformidad' using errcode = 'P0001';
  end if;
  if not exists (select 1 from wms.ordenes_picking_lineas where orden_id = p_orden and conformidad = 'PENDIENTE') then
    raise exception 'Esta Orden de Salida ya tiene su conformidad' using errcode = 'P0001';
  end if;
  if p_lineas is not null and jsonb_typeof(p_lineas) <> 'array' then raise exception 'Las líneas de la conformidad no tienen el formato esperado' using errcode = 'P0001'; end if;
  if p_lineas is not null then
    for x in select * from jsonb_array_elements(p_lineas) loop
      if not exists (select 1 from wms.ordenes_picking_lineas where id = nullif(x->>'orden_linea_id', '')::uuid and orden_id = p_orden and conformidad = 'PENDIENTE') then
        raise exception 'Una de las líneas no es de esta Orden de Salida o ya tiene su conformidad' using errcode = 'P0001';
      end if;
    end loop;
  end if;

  select array_agg(id order by orden_recorrido nulls last, id) into v_ids from wms.ordenes_picking_lineas where orden_id = p_orden and conformidad = 'PENDIENTE';
  foreach v_nid in array v_ids loop
    select * into ol from wms.ordenes_picking_lineas where id = v_nid for update;
    select * into l from wms.salida_lineas where id = ol.linea_id for update;
    select e into x from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) e where nullif(e->>'orden_linea_id', '')::uuid = ol.id limit 1;
    v_res := coalesce(x->>'resultado', 'CONFORME');
    v_nota := nullif(btrim(coalesce(x->>'nota', '')), '');
    v_cant := nullif(x->>'cantidad', '')::integer;
    v_lote := nullif(x->>'lote_id', '')::uuid;

    if v_res = 'CONFORME' then
      null;
    elsif v_res = 'MENOS' then
      if v_cant is null or v_cant < 1 or v_cant >= ol.cantidad then
        raise exception 'Cuántas unidades encontraste: tiene que ser más de cero y menos de las %. Si no hay ninguna, elige «No lo encontré»', ol.cantidad using errcode = 'P0001';
      end if;
      insert into wms.ajustes_conformidad (orden_id, linea_id, orden_linea_id, tipo, lote_antes_id, lote_despues_id, cantidad_antes, cantidad_despues, nota, por)
      values (p_orden, ol.linea_id, ol.id, 'MENOS', ol.lote_id, ol.lote_id, ol.cantidad, v_cant, v_nota, auth.uid());
      update wms.reservas set cantidad = v_cant, actualizada_en = now() where id = ol.reserva_id;
      update wms.ordenes_picking_lineas set cantidad = v_cant where id = ol.id;
      ol.cantidad := v_cant; v_ajustes := v_ajustes + 1;
    elsif v_res = 'NO_ENCONTRADO' then
      insert into wms.ajustes_conformidad (orden_id, linea_id, orden_linea_id, tipo, lote_antes_id, cantidad_antes, cantidad_despues, nota, por)
      values (p_orden, ol.linea_id, ol.id, 'NO_ENCONTRADO', ol.lote_id, ol.cantidad, 0, v_nota, auth.uid());
      update wms.reservas set estado = 'LIBERADA', actualizada_en = now() where id = ol.reserva_id;
      update wms.ordenes_picking_lineas set cantidad = 0, picking = 'PICKEADA', picker_id = coalesce(picker_id, o.picker_id), pickeada_en = coalesce(pickeada_en, now()),
             conformidad = 'CONFORME', verificador_id = auth.uid(), verificada_en = now(), nota_conformidad = coalesce(v_nota, 'No se encontró') where id = ol.id;
      v_ajustes := v_ajustes + 1;
      continue;
    elsif v_res = 'OTRO_LOTE' then
      if v_lote is null then raise exception 'Elige el lote que encontraste' using errcode = 'P0001'; end if;
      v_cant := coalesce(v_cant, ol.cantidad);
      if v_cant < 1 or v_cant > ol.cantidad then raise exception 'La cantidad del otro lote tiene que estar entre 1 y %', ol.cantidad using errcode = 'P0001'; end if;
      if s.tipo = 'CLIENTE' then raise exception 'En una orden de un cliente de almacenamiento el lote lo indica el cliente: no hay otro lote' using errcode = 'P0001'; end if;
      select * into lt from wms.lotes where id = v_lote;
      if not found or lt.producto_id <> l.producto_id or lt.propietario_id <> s.propietario_id then raise exception 'Ese lote no corresponde al producto de la línea' using errcode = 'P0001'; end if;
      if v_lote = ol.lote_id then raise exception 'Es el mismo lote: usa «Menos cantidad» o «No lo encontré»' using errcode = 'P0001'; end if;
      v_min := case when s.tipo = 'DISTRIBUCION' and s.motivo = 'VENTA' then coalesce((select p.valor::integer from wms.parametros p where p.clave = 'vida_util_minima_venta_dias'), 60) else 0 end;
      select * into v_apto from wms._lote_apto(lt.vence, s.tipo, s.motivo, v_hoy, v_min);
      if not v_apto.apto then raise exception 'Lote %: %', lt.codigo, v_apto.razon using errcode = 'P0001'; end if;
      if wms.lote_bloqueado(lt.id) then raise exception 'El lote % está en Reserva: no se puede usar', lt.codigo using errcode = 'P0001'; end if;
      perform wms._candado_stock(l.producto_id, s.propietario_id);
      v_ant := wms._asignacion_json_vigente(l.id);     -- lo vigente ANTES del cambio
      update wms.reservas set estado = 'LIBERADA', actualizada_en = now() where id = ol.reserva_id;
      if (select coalesce(sum(c.disponible) filter (where c.disponible > 0 and not c.en_conteo), 0) from wms._candidatos(s.propietario_id, l.producto_id) c where c.lote_id = v_lote) < v_cant then
        raise exception 'El lote % no tiene % unidades disponibles', lt.codigo, v_cant using errcode = 'P0002';
      end if;
      perform wms._reservar_en_lote(l.id, v_lote, v_cant);
      insert into wms.ajustes_conformidad (orden_id, linea_id, orden_linea_id, tipo, lote_antes_id, lote_despues_id, cantidad_antes, cantidad_despues, nota, por)
      values (p_orden, ol.linea_id, ol.id, 'OTRO_LOTE', ol.lote_id, v_lote, ol.cantidad, v_cant, v_nota, auth.uid());
      -- la línea original queda en cero (historia) y las reservas nuevas pasan a la orden, ya pickeadas por quien picó
      update wms.ordenes_picking_lineas set cantidad = 0, picking = 'PICKEADA', picker_id = coalesce(picker_id, o.picker_id), pickeada_en = coalesce(pickeada_en, now()),
             conformidad = 'CONFORME', verificador_id = auth.uid(), verificada_en = now(), nota_conformidad = 'Reemplazada por el lote ' || lt.codigo where id = ol.id;
      select array_agg(r.id) into v_nuevas from wms.reservas r where r.linea_id = l.id and r.estado = 'ACTIVA' and not exists (select 1 from wms.ordenes_picking_lineas z where z.reserva_id = r.id);
      for i in 1 .. coalesce(array_length(v_nuevas, 1), 0) loop
        insert into wms.ordenes_picking_lineas (orden_id, linea_id, reserva_id, posicion_id, orden_recorrido, producto_id, lote_id, vence, cantidad, picking, picker_id, pickeada_en)
        select p_orden, r.linea_id, r.id, r.posicion_id, ps.orden_recorrido, r.producto_id, r.lote_id, lt.vence, r.cantidad, 'PICKEADA', o.picker_id, now()
          from wms.reservas r join wms.posiciones ps on ps.id = r.posicion_id where r.id = v_nuevas[i] returning id into v_nid2;
        v_movs := v_movs + 1;
        perform wms._pasar_a_despacho(v_nid2, v_nota);
        update wms.ordenes_picking_lineas set conformidad = 'CONFORME', verificador_id = auth.uid(), verificada_en = now(), nota_conformidad = v_nota where id = v_nid2;
      end loop;
      -- «Cambios a FEFO»: si lo vigente se aparta de la propuesta original, queda registrado (quién y cuándo)
      v_nueva := wms._asignacion_json_vigente(l.id);
      select coalesce((select jsonb_agg(jsonb_build_array(f.lote_id, f.cantidad) order by f.lote_id) from jsonb_to_recordset(l.asignacion_fefo) as f(lote_id uuid, cantidad integer)), '[]'::jsonb)
             is distinct from coalesce((select jsonb_agg(jsonb_build_array(n.lote_id, n.cantidad) order by n.lote_id) from jsonb_to_recordset(v_nueva) as n(lote_id uuid, cantidad integer)), '[]'::jsonb)
        into v_distinto;
      if v_distinto then
        insert into wms.cambios_lote_asignado (linea_id, motivo, asignacion_fefo, asignacion_anterior, asignacion_nueva, distinto_de_fefo, por)
        values (l.id, coalesce(v_nota, 'Otro lote en la conformidad'), l.asignacion_fefo, v_ant, v_nueva, true, auth.uid());
      end if;
      update wms.salida_lineas set lote_id = coalesce((select (e->>'lote_id')::uuid from jsonb_array_elements(v_nueva) e limit 1), lote_id) where id = l.id;
      v_ajustes := v_ajustes + 1;
      continue;
    else
      raise exception 'Cada línea es Conforme, Otro lote, Menos cantidad o No lo encontré' using errcode = 'P0001';
    end if;

    -- Conforme (o con menos cantidad): las unidades pasan a Despacho
    update wms.ordenes_picking_lineas set picking = 'PICKEADA', picker_id = coalesce(picker_id, o.picker_id), pickeada_en = coalesce(pickeada_en, now()) where id = ol.id;
    perform wms._pasar_a_despacho(ol.id, v_nota);
    v_movs := v_movs + 1;
    update wms.ordenes_picking_lineas set conformidad = 'CONFORME', verificador_id = auth.uid(), verificada_en = now(), nota_conformidad = v_nota where id = ol.id;
  end loop;

  select coalesce(sum(cantidad), 0)::integer into v_unidades from wms.ordenes_picking_lineas where orden_id = p_orden and conformidad = 'CONFORME';
  if v_unidades = 0 then
    raise exception 'Ninguna línea quedó conforme: cancela la Orden de Salida o corrige el picking' using errcode = 'P0001';
  end if;
  if p_bultos is null or p_bultos < 1 or p_bultos > 99 then
    raise exception 'Registra el número de bultos (cajas master): de 1 a 99' using errcode = 'P0001';
  end if;

  update wms.salida_lineas sl set estado = 'CONFORME'
   where sl.salida_id = s.id and sl.estado in ('EN_PICKING', 'PICKEADA', 'OBSERVADA')
     and not exists (select 1 from wms.ordenes_picking_lineas z where z.linea_id = sl.id and z.conformidad <> 'CONFORME');
  update wms.ordenes_picking set estado = 'COMPLETA' where id = p_orden;
  update wms.salidas set bultos_conformidad = p_bultos, conformada_por = auth.uid(), conformada_en = now() where id = s.id;
  if not s.requiere_embalaje then
    for i in 1 .. p_bultos loop
      insert into wms.bultos (salida_id, secuencia, total, codigo, embalado_por) values (s.id, i, p_bultos, s.numero || '-B' || i, auth.uid());
    end loop;
  end if;
  perform wms.registrar_audit('orden_de_salida_conformada', 'ordenes_picking', p_orden::text, null,
    jsonb_build_object('unidades', v_unidades, 'bultos', p_bultos, 'ajustes', v_ajustes, 'movimientos', v_movs), p_nota);
  return jsonb_build_object('unidades', v_unidades, 'bultos', p_bultos, 'ajustes', v_ajustes, 'movimientos', v_movs, 'requiere_embalaje', s.requiere_embalaje);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.generar_orden_picking(uuid, uuid), wms.designar_picker(uuid, uuid), wms.conformar_orden(uuid, jsonb, integer, text), wms.personal_de_picking() to authenticated;
revoke execute on all functions in schema wms from public;
