-- 0030 · WMS · Salidas · SA-6: las órdenes manuales siguen el flujo normal hasta el despacho (ruta de Logisalud o entrega al transportista del cliente)
--
-- Sebas (GM, 2026-10-19): las tres clases de orden manual «siguen después el flujo normal: hoja de picking, conformidad, bultos, guía (A y C) y ruta de Logisalud o
-- entrega al transportista del cliente». Hasta la 0029 la ruta solo aceptaba pedidos de la bandeja: una venta manual (A) cuyo pedido aún no llegó, una muestra o una
-- devolución al proveedor (C) llegaban a conformidad y ahí se quedaban. Decisiones D-135 a D-140 (docs/wms/decisiones-pendientes.md):
--   1. `ruta_paradas` admite una PARADA POR ORDEN: `salida_id` sin `pedido_despacho_id` (ni `pedido_id`). Una orden no puede estar en dos rutas vivas (índice único parcial
--      sobre `salida_id`, igual que ya pasaba con el pedido). El destinatario sale de `salidas.cliente_manual` (A: el cliente; C: a quién va la muestra o el proveedor).
--   2. Tipo C: la orden pide su destinatario (RUC, nombre, dirección y ubigeo, lo mínimo que exige la guía). `crear_orden_salida_manual` se parchea por texto (como la 0029)
--      y lo guarda en `cliente_manual`, que ya leen la lista, el picking y la guía.
--   3. `planificar_ruta` se reescribe completa: cada parada es `{pedido_id}` (pedido de la bandeja, como siempre) o `{salida_id}` (orden manual). Quitar una parada de una
--      orden manual NO cancela la orden: solo libera la parada. Con corte, personal, vehículo y «una sola ruta viva» igual que antes. Si el pedido de una orden manual
--      llega después por la bandeja y se une (SA-2), la parada pasa a ser también del pedido (`_vincular_orden_manual` se parchea) y la ruta y la guía siguen valiendo.
--      `cancelar_ruta` (0028) ya no cancela una orden que no nació en la ruta: no necesita cambio. `confirmar_ruta` y `conciliacion_carga` dejan de exigir pedido.
--   4. Tipo B (por cuenta de un cliente de almacenamiento): NO va en una ruta de Logisalud ni lleva guía del WMS: se ENTREGA AL TRANSPORTISTA DEL CLIENTE. Tabla
--      `entregas_transportista_cliente` (append-only: transportista, placa o DNI de quien recoge, hora, quién entrega por el almacén y, si hay, la foto o el PDF del cargo)
--      y `registrar_entrega_transportista_cliente`, que además confirma la salida (baja el stock) con el MISMO núcleo que `confirmar_salida`: ese núcleo se separa en
--      `_confirmar_salida_nucleo` y `confirmar_salida` queda como envoltorio con su permiso de siempre. Permiso nuevo `entregar_al_transportista_cliente`
--      (Jefe de Transporte y Jefe de Almacén; una fila de `permisos_rol` lo cambia).
--   5. `_ruc_de_salida` toma también el RUC de la orden manual (para el perfil documental del cliente).
-- Requiere 0017, 0021, 0028 y 0029. Re-ejecutable. Se aplica a mano (nunca al mergear). RLS desde el `create table`. Termina con el `revoke execute … from public`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Permiso nuevo
-- ─────────────────────────────────────────────────────────────────────────────

select wms._ampliar_check_in('wms.permisos_rol', 'permisos_rol_accion_check', 'accion', array['entregar_al_transportista_cliente']);
insert into wms.permisos_rol (rol, accion) values ('jefe_transporte', 'entregar_al_transportista_cliente'), ('jefe_almacen', 'entregar_al_transportista_cliente')
on conflict (rol, accion) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Parada por orden
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.ruta_paradas alter column pedido_id drop not null;
alter table wms.ruta_paradas alter column pedido_despacho_id drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'wms.ruta_paradas'::regclass and conname = 'ruta_paradas_pedido_o_orden_check') then
    -- Lo anterior siempre trae pedido (y casi siempre su orden): el CHECK se valida contra la tabla entera y ahí se cumple.
    alter table wms.ruta_paradas add constraint ruta_paradas_pedido_o_orden_check check (pedido_despacho_id is not null or salida_id is not null);
  end if;
end $$;

-- Una orden, una sola ruta viva. Si hubiera datos viejos repetidos (no debería), queda viva la parada más reciente: la otra pasa a historia (inactiva) antes del índice.
update wms.ruta_paradas a set activa = false
 where a.activa and a.salida_id is not null
   and exists (select 1 from wms.ruta_paradas b where b.salida_id = a.salida_id and b.activa and (b.creada_en, b.id) > (a.creada_en, a.id));
create unique index if not exists ruta_paradas_salida_uk on wms.ruta_paradas (salida_id) where activa and salida_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tipo C: el destinatario (a quién va la muestra o qué proveedor recibe la devolución)
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_oid oid; v_def text;
  v_ancla text := E'  -- Tipo B: la GRE del cliente (número con formato y el PDF)\n';
  v_nuevo text := E'  -- Tipo C (0030): el destinatario. La guía exige RUC, nombre, dirección y ubigeo; se guardan en `cliente_manual` (lo que ya leen la lista, el picking y la guía).\n'
    || E'  if p_clase = ''C'' then\n'
    || E'    v_ruc := btrim(coalesce(p_cliente->>''ruc'', ''''));\n'
    || E'    if nullif(btrim(coalesce(p_cliente->>''razon_social'', '''')), '''') is null then\n'
    || E'      raise exception ''%'', case when p_motivo = ''DEVOLUCION_PROVEEDOR'' then ''Escribe el nombre del proveedor'' else ''Escribe a quién va la muestra'' end using errcode = ''P0001'';\n'
    || E'    end if;\n'
    || E'    if v_ruc !~ ''^[0-9]{11}$'' then raise exception ''El RUC tiene 11 números'' using errcode = ''P0001''; end if;\n'
    || E'    if nullif(btrim(coalesce(p_cliente->>''direccion'', '''')), '''') is null then raise exception ''Escribe la dirección de entrega'' using errcode = ''P0001''; end if;\n'
    || E'    v_ubigeo := btrim(coalesce(p_cliente->>''ubigeo'', ''''));\n'
    || E'    if v_ubigeo !~ ''^[0-9]{6}$'' then raise exception ''El ubigeo tiene 6 números (el código del distrito de entrega)'' using errcode = ''P0001''; end if;\n'
    || E'    v_cliente := jsonb_build_object(''ruc'', v_ruc, ''razon_social'', btrim(p_cliente->>''razon_social''), ''direccion'', btrim(p_cliente->>''direccion''), ''ubigeo'', v_ubigeo);\n'
    || E'    select valor into v_lima from wms.parametros where clave = ''ubigeos_lima_metropolitana'';\n'
    || E'    v_embala := not exists (select 1 from unnest(string_to_array(coalesce(v_lima, ''''), '','')) pre where nullif(btrim(pre), '''') is not null and v_ubigeo like btrim(pre) || ''%'');\n'
    || E'  end if;\n\n';
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'crear_orden_salida_manual' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position('Tipo C (0030)' in v_def) > 0 then return; end if;     -- ya aplicada (re-ejecución)
  if position(v_ancla in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.crear_orden_salida_manual: %', v_ancla; end if;
  execute replace(v_def, v_ancla, v_nuevo || v_ancla);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Si el pedido de una orden manual llega por la bandeja y se une, la parada de su ruta pasa a ser también del pedido
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_oid oid; v_def text;
  v_ancla text := E'  update wms.pedidos_despacho set salida_id = p_salida.id where id = p_pd.id and salida_id is null;\n';
  v_nuevo text := v_ancla
    || E'  -- 0030: si la orden ya estaba en una ruta (parada por orden), la parada pasa a ser también del pedido: la ruta, la carga y la guía siguen valiendo y la guía usa los datos del pedido\n'
    || E'  update wms.ruta_paradas set pedido_id = p_pd.pedido_id, pedido_despacho_id = p_pd.id where salida_id = p_salida.id and activa and pedido_despacho_id is null;\n';
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = '_vincular_orden_manual' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position('0030: si la orden ya estaba en una ruta' in v_def) > 0 then return; end if;     -- ya aplicada (re-ejecución)
  if position(v_ancla in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms._vincular_orden_manual: %', v_ancla; end if;
  execute replace(v_def, v_ancla, v_nuevo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. planificar_ruta (0028): paradas por pedido o por orden
-- ─────────────────────────────────────────────────────────────────────────────

-- p_paradas = [{pedido_id, excepcion_corte?, motivo_excepcion?}] (pedido de la bandeja) o [{salida_id, …}] (orden manual) en el orden de visita.
create or replace function wms.planificar_ruta(
  p_ruta uuid, p_fecha date, p_vehiculo uuid, p_conductor uuid, p_auxiliar uuid, p_paradas jsonb, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare
  r wms.rutas; v wms.vehiculos; x jsonb; pd wms.pedidos_despacho; so wms.salidas; v_seq integer := 0; v_salida uuid; v_exc boolean; v_mot text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), ''); v_nueva integer; v_snapshot jsonb := '[]'::jsonb; v_bloqueados jsonb := '[]'::jsonb;
  v_claves text[] := array[]::text[]; v_pid text; v_sid uuid; v_viva wms.ruta_paradas; v_clave text; v_otra text; v_numero text;
begin
  perform wms._exigir_accion('planificar_ruta', 'No tienes permiso para planificar rutas');
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if r.estado not in ('BORRADOR', 'PLANIFICADA') then raise exception 'La ruta ya no se puede cambiar (está %)', lower(replace(r.estado, '_', ' ')) using errcode = 'P0001'; end if;
  if p_fecha is null or p_fecha < wms._hoy_lima() then raise exception 'La fecha de la ruta no puede ser anterior a hoy' using errcode = 'P0001'; end if;
  if r.estado = 'PLANIFICADA' and v_motivo is null then raise exception 'La ruta ya estaba planificada: indica por qué cambia' using errcode = 'P0001'; end if;
  if p_paradas is null or jsonb_typeof(p_paradas) <> 'array' then raise exception 'Las paradas deben ser una lista' using errcode = 'P0001'; end if;

  if p_vehiculo is not null then
    select * into v from wms.vehiculos where id = p_vehiculo;
    if not found then raise exception 'No encontramos ese vehículo' using errcode = 'P0001'; end if;
    if not v.activo then raise exception 'El vehículo % está inactivo', v.placa using errcode = 'P0001'; end if;
  end if;
  if p_conductor is not null and not exists (select 1 from wms.personal_transporte where id = p_conductor and funcion = 'CONDUCTOR' and activo) then
    raise exception 'El conductor elegido no está disponible' using errcode = 'P0001';
  end if;
  if p_auxiliar is not null and not exists (select 1 from wms.personal_transporte where id = p_auxiliar and funcion = 'AUXILIAR' and activo) then
    raise exception 'El auxiliar elegido no está disponible' using errcode = 'P0001';
  end if;
  if p_conductor is not null and p_conductor is not distinct from p_auxiliar then raise exception 'El conductor y el auxiliar deben ser personas distintas' using errcode = 'P0001'; end if;
  -- Un vehículo o una persona no puede estar en dos rutas vivas del mismo día
  if p_vehiculo is not null and exists (select 1 from wms.rutas o where o.id <> p_ruta and o.fecha = p_fecha and o.vehiculo_id = p_vehiculo and o.estado not in ('CERRADA', 'CANCELADA')) then
    raise exception 'El vehículo ya está en otra ruta de ese día' using errcode = 'P0001';
  end if;
  if p_conductor is not null and exists (select 1 from wms.rutas o where o.id <> p_ruta and o.fecha = p_fecha and (o.conductor_id = p_conductor or o.auxiliar_id = p_conductor) and o.estado not in ('CERRADA', 'CANCELADA')) then
    raise exception 'El conductor ya está en otra ruta de ese día' using errcode = 'P0001';
  end if;
  if p_auxiliar is not null and exists (select 1 from wms.rutas o where o.id <> p_ruta and o.fecha = p_fecha and (o.conductor_id = p_auxiliar or o.auxiliar_id = p_auxiliar) and o.estado not in ('CERRADA', 'CANCELADA')) then
    raise exception 'El auxiliar ya está en otra ruta de ese día' using errcode = 'P0001';
  end if;

  -- Paradas que salen del plan. Una parada es del pedido (`pedido_id`) o de la orden (`salida_id`); la que trae las dos (orden manual unida a su pedido) se reconoce por cualquiera.
  -- Solo se libera la orden si nació en esta ruta (y tiene pedido); una orden creada desde la bandeja o a mano sigue viva: la parada sale de la ruta, la orden no se cancela.
  for v_viva in select * from wms.ruta_paradas pa where pa.ruta_id = p_ruta and pa.activa and not exists (
      select 1 from jsonb_array_elements(p_paradas) e
       where (nullif(btrim(coalesce(e->>'pedido_id', '')), '') is not null and e->>'pedido_id' = pa.pedido_id)
          or (nullif(e->>'salida_id', '') is not null and pa.salida_id is not null and e->>'salida_id' = pa.salida_id::text)) loop
    if v_viva.salida_id is not null and v_viva.pedido_despacho_id is not null and coalesce((select creada_desde from wms.salidas where id = v_viva.salida_id), 'RUTA') = 'RUTA' then
      if exists (select 1 from wms.ordenes_picking where salida_id = v_viva.salida_id and estado <> 'CANCELADA') then
        raise exception 'El pedido % ya tiene picking generado: no se puede sacar de la ruta', (select numero from wms.pedidos_despacho where id = v_viva.pedido_despacho_id) using errcode = 'P0001';
      end if;
      perform wms.cancelar_salida(v_viva.salida_id, coalesce(v_motivo, 'El pedido salió de la ruta'));
      update wms.pedidos_despacho set salida_id = null where id = v_viva.pedido_despacho_id;
    end if;
    update wms.ruta_paradas set activa = false where id = v_viva.id;
  end loop;
  -- Las demás se vuelven a numerar: primero inactivas, después se insertan en el orden nuevo
  update wms.ruta_paradas set activa = false where ruta_id = p_ruta and activa;

  for x in select * from jsonb_array_elements(p_paradas) loop
    v_pid := nullif(btrim(coalesce(x->>'pedido_id', '')), '');
    v_sid := nullif(x->>'salida_id', '')::uuid;
    if v_pid is null and v_sid is null then raise exception 'Hay una parada sin pedido ni orden' using errcode = 'P0001'; end if;
    -- Una orden manual que ya tiene su pedido en la bandeja se planifica como pedido: así la parada usa los datos del pedido ya conciliado
    if v_pid is null then
      select * into pd from wms.pedidos_despacho where salida_id = v_sid and vigente limit 1;
      if found then v_pid := pd.pedido_id; end if;
    end if;
    v_clave := coalesce(v_pid, 'orden:' || v_sid::text);
    if v_clave = any (v_claves) then raise exception 'Hay un pedido repetido o sin identificador en la ruta' using errcode = 'P0001'; end if;
    v_claves := v_claves || v_clave;
    v_exc := coalesce((x->>'excepcion_corte')::boolean, false);
    v_mot := nullif(btrim(coalesce(x->>'motivo_excepcion', '')), '');

    if v_pid is not null then
      select * into pd from wms.pedidos_despacho where pedido_id = v_pid and vigente for update;
      if not found then raise exception 'No encontramos uno de los pedidos en la bandeja' using errcode = 'P0001'; end if;
      if pd.cambio_pendiente then raise exception 'El pedido % cambió en Pedidos: revisa el cambio antes de planificarlo', pd.numero using errcode = 'P0001'; end if;
      select * into v_viva from wms.ruta_paradas where pedido_id = v_pid and activa;
      if found then raise exception 'El pedido % ya está en otra ruta', pd.numero using errcode = 'P0001'; end if;
      if nullif(btrim(coalesce(pd.snapshot->'cliente'->>'vehiculoCalificado', '')), '') is not null and (p_vehiculo is null or not v.calificado) then
        raise exception 'El cliente de % exige un vehículo calificado', pd.numero using errcode = 'P0001';
      end if;
      if wms._fuera_de_corte(pd.importado_en, p_fecha) and not v_exc then
        raise exception 'El pedido % llegó después del corte de las % de la víspera: para incluirlo marca la excepción y escribe el motivo',
          pd.numero, coalesce((select valor from wms.parametros where clave = 'hora_corte_planificacion'), '16:00') using errcode = 'P0001';
      end if;
      if v_exc and v_mot is null then raise exception 'La excepción del pedido % necesita un motivo', pd.numero using errcode = 'P0001'; end if;
      v_numero := pd.numero;
      -- La orden del pedido (una sola vez): la que ya se creó desde la bandeja, la orden manual con ese número de pedido o, si no hay, una nueva que nace en esta ruta (SA-2)
      v_salida := wms._orden_del_pedido(pd, 'RUTA');
      v_seq := v_seq + 1;
      insert into wms.ruta_paradas (ruta_id, secuencia, pedido_id, pedido_despacho_id, salida_id, excepcion_corte, motivo_excepcion)
      values (p_ruta, v_seq, pd.pedido_id, pd.id, v_salida, v_exc, v_mot);
      v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('secuencia', v_seq, 'pedido_id', pd.pedido_id, 'salida_id', v_salida, 'numero', pd.numero, 'cliente', pd.cliente_nombre,
        'excepcion_corte', v_exc, 'motivo_excepcion', v_mot));
    else
      -- Parada por orden (SA-6): una venta manual (A) cuyo pedido aún no llegó, una muestra o una devolución al proveedor (C)
      select * into so from wms.salidas where id = v_sid for update;
      if not found then raise exception 'No encontramos una de las órdenes' using errcode = 'P0001'; end if;
      if so.estado <> 'ABIERTA' then raise exception 'La orden % ya no está abierta (está %)', so.numero, lower(so.estado) using errcode = 'P0001'; end if;
      if so.tipo = 'CLIENTE' then
        raise exception 'La orden % es por cuenta de un cliente de almacenamiento: no va en una ruta de Logisalud, se entrega al transportista del cliente', so.numero using errcode = 'P0001';
      end if;
      if so.origen <> 'MANUAL' then
        raise exception 'La orden % nace de un pedido de la bandeja: agrégala a la ruta desde «Pedidos por despachar»', so.numero using errcode = 'P0001';
      end if;
      if so.cliente_manual is null or nullif(btrim(coalesce(so.cliente_manual->>'razon_social', '')), '') is null then
        raise exception 'A la orden % le falta el destinatario: sin él no se puede planificar su entrega', so.numero using errcode = 'P0001';
      end if;
      select r2.numero into v_otra from wms.ruta_paradas pa join wms.rutas r2 on r2.id = pa.ruta_id where pa.salida_id = so.id and pa.activa limit 1;
      if found then raise exception 'La orden % ya está en la ruta %', so.numero, v_otra using errcode = 'P0001'; end if;
      if wms._fuera_de_corte(so.creada_en, p_fecha) and not v_exc then
        raise exception 'La orden % se creó después del corte de las % de la víspera: para incluirla marca la excepción y escribe el motivo',
          so.numero, coalesce((select valor from wms.parametros where clave = 'hora_corte_planificacion'), '16:00') using errcode = 'P0001';
      end if;
      if v_exc and v_mot is null then raise exception 'La excepción de la orden % necesita un motivo', so.numero using errcode = 'P0001'; end if;
      v_numero := coalesce(so.pedido_numero, so.numero);
      v_salida := so.id;
      v_seq := v_seq + 1;
      insert into wms.ruta_paradas (ruta_id, secuencia, pedido_id, pedido_despacho_id, salida_id, excepcion_corte, motivo_excepcion)
      values (p_ruta, v_seq, null, null, so.id, v_exc, v_mot);
      v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('secuencia', v_seq, 'pedido_id', null, 'salida_id', so.id, 'numero', v_numero, 'cliente', so.cliente_manual->>'razon_social',
        'excepcion_corte', v_exc, 'motivo_excepcion', v_mot));
    end if;
    if exists (select 1 from wms.salida_lineas where salida_id = v_salida and estado = 'SIN_STOCK') then
      v_bloqueados := v_bloqueados || jsonb_build_array(v_numero);
    end if;
  end loop;

  v_nueva := r.version + 1;
  update wms.rutas set fecha = p_fecha, vehiculo_id = p_vehiculo, conductor_id = p_conductor, auxiliar_id = p_auxiliar, version = v_nueva where id = p_ruta;
  insert into wms.ruta_versiones (ruta_id, version, fecha, vehiculo_id, conductor_id, auxiliar_id, paradas, motivo, por)
  values (p_ruta, v_nueva, p_fecha, p_vehiculo, p_conductor, p_auxiliar, v_snapshot, coalesce(v_motivo, 'Plan guardado'), auth.uid());
  perform wms.registrar_audit('ruta_planificada', 'rutas', p_ruta::text, null, v_snapshot, v_motivo);
  return jsonb_build_object('version', v_nueva, 'paradas', v_seq, 'bloqueados_por_stock', v_bloqueados);
end $$;

-- Confirma la ruta: BORRADOR → PLANIFICADA. Necesita vehículo, conductor y al menos una parada, y todas con su stock asignado (la parada por orden no tiene pedido: se nombra por su
-- número de pedido o de orden).
create or replace function wms.confirmar_ruta(p_ruta uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas; v_sin text;
begin
  perform wms._exigir_accion('planificar_ruta', 'No tienes permiso para planificar rutas');
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if r.estado <> 'BORRADOR' then raise exception 'La ruta ya está confirmada o cerrada' using errcode = 'P0001'; end if;
  if r.vehiculo_id is null then raise exception 'Elige el vehículo' using errcode = 'P0001'; end if;
  if r.conductor_id is null then raise exception 'Elige el conductor' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.ruta_paradas where ruta_id = p_ruta and activa) then raise exception 'La ruta no tiene pedidos' using errcode = 'P0001'; end if;
  select string_agg(distinct coalesce(pd.numero, s.pedido_numero, s.numero), ', ') into v_sin
    from wms.ruta_paradas pa left join wms.pedidos_despacho pd on pd.id = pa.pedido_despacho_id left join wms.salidas s on s.id = pa.salida_id
   where pa.ruta_id = p_ruta and pa.activa and exists (select 1 from wms.salida_lineas sl where sl.salida_id = pa.salida_id and sl.estado = 'SIN_STOCK');
  if v_sin is not null then raise exception 'Estos pedidos no tienen stock suficiente: %. Quítalos de la ruta o espera el ingreso de stock', v_sin using errcode = 'P0001'; end if;
  update wms.rutas set estado = 'PLANIFICADA', confirmada_por = auth.uid(), confirmada_en = now() where id = p_ruta;
  insert into wms.registros_ls_fr_43_03 (ruta_id, codigo, version_formato, creado_por)
  values (p_ruta, coalesce((select valor from wms.parametros where clave = 'ls_fr_43_03_codigo'), 'LS-FR.43.03'),
          coalesce((select valor from wms.parametros where clave = 'ls_fr_43_03_version'), '01'), auth.uid())
  on conflict (ruta_id) do nothing;
  perform wms.registrar_audit('ruta_confirmada', 'rutas', p_ruta::text, null, null, null);
end $$;

-- Cada parada viva con salida: sus bultos (cargado o no), o una fila sola si todavía no está embalada o se dejó fuera de la salida. La parada por orden no tiene pedido: se nombra por su
-- número de pedido (venta manual) o por el de la orden (muestra, devolución al proveedor).
create or replace function wms.conciliacion_carga(p_ruta uuid)
returns table (salida_id uuid, salida_numero text, pedido_numero text, secuencia integer, bulto_id uuid, codigo text, bulto_secuencia integer, bulto_total integer,
               cargado boolean, listo boolean, excluida boolean)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare pa record; b record; v_listo boolean; v_excl boolean;
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  if not exists (select 1 from wms.rutas where id = p_ruta) then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  for pa in
    select p.secuencia as sec, p.salida_id as sid, s.numero as snum, coalesce(d.numero, s.pedido_numero) as pnum
      from wms.ruta_paradas p join wms.salidas s on s.id = p.salida_id left join wms.pedidos_despacho d on d.id = p.pedido_despacho_id
     where p.ruta_id = p_ruta and p.activa order by p.secuencia
  loop
    v_excl := exists (select 1 from wms.carga_exclusiones x where x.ruta_id = p_ruta and x.salida_id = pa.sid);
    v_listo := not v_excl and wms.listo_para_carga(pa.sid);
    if v_excl or not exists (select 1 from wms.bultos where salida_id = pa.sid and estado = 'EMBALADO') then
      return query select pa.sid, pa.snum, pa.pnum, pa.sec, null::uuid, null::text, null::integer, null::integer, false, v_listo, v_excl;
    else
      for b in select bu.id, bu.codigo, bu.secuencia, bu.total,
                      exists (select 1 from wms.carga_bultos c where c.bulto_id = bu.id and c.ruta_id = p_ruta and c.estado = 'CARGADO') as cg
                 from wms.bultos bu where bu.salida_id = pa.sid and bu.estado = 'EMBALADO' order by bu.secuencia
      loop
        return query select pa.sid, pa.snum, pa.pnum, pa.sec, b.id, b.codigo, b.secuencia, b.total, b.cg, v_listo, false;
      end loop;
    end if;
  end loop;
end $$;

-- El RUC del cliente de la orden: el del pedido vigente o, en una venta manual aún sin pedido (o una muestra, o una devolución), el del destinatario escrito en la orden.
create or replace function wms._ruc_de_salida(p_salida uuid) returns text
language sql stable security definer set search_path = wms, pg_temp as $$
  select coalesce((select d.cliente_ruc from wms.pedidos_despacho d where s.referencia_tipo = 'pedido' and d.pedido_id = s.referencia_id and d.vigente),
                  nullif(btrim(coalesce(s.cliente_manual->>'ruc', '')), ''))
    from wms.salidas s where s.id = p_salida
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Tipo B: entrega al transportista del cliente (en vez de ruta y guía del WMS)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.entregas_transportista_cliente (
  id uuid primary key default gen_random_uuid(),
  salida_id uuid not null references wms.salidas(id),
  transportista text not null check (nullif(btrim(transportista), '') is not null),   -- nombre del transportista o de quien recoge
  placa text,
  documento_recoge text,                                                               -- DNI de quien recoge (8 números)
  entregado_en timestamptz not null,                                                   -- la hora real de la entrega
  entrega_almacen text not null check (nullif(btrim(entrega_almacen), '') is not null),   -- quién entrega por parte del almacén
  cargo_archivo text,                                                                  -- foto o PDF del cargo (referencia en el almacenamiento de archivos)
  cargo_nombre text,
  nota text,
  registrada_por uuid not null,
  registrada_en timestamptz not null default now(),
  check (nullif(btrim(coalesce(placa, '')), '') is not null or nullif(btrim(coalesce(documento_recoge, '')), '') is not null),
  check (documento_recoge is null or documento_recoge ~ '^[0-9]{8}$')
);
alter table wms.entregas_transportista_cliente enable row level security;
create unique index if not exists entregas_transportista_cliente_salida_uk on wms.entregas_transportista_cliente (salida_id);   -- una orden, una entrega

do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'entregas_transportista_cliente' and policyname = 'lectura') then
    drop policy lectura on wms.entregas_transportista_cliente;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'entregas_transportista_cliente_inmutable' and tgrelid = 'wms.entregas_transportista_cliente'::regclass and not tgisinternal) then
    drop trigger entregas_transportista_cliente_inmutable on wms.entregas_transportista_cliente;
  end if;
end $$;
create policy lectura on wms.entregas_transportista_cliente for select to authenticated using (wms.es_usuario());
revoke all on wms.entregas_transportista_cliente from anon, authenticated;
grant select on wms.entregas_transportista_cliente to authenticated;
-- Una entrega registrada no se edita ni se borra: si algo salió mal, vuelve como devolución (retorno) con su propia orden.
create trigger entregas_transportista_cliente_inmutable before update or delete on wms.entregas_transportista_cliente for each row execute function wms.trg_inmutable();

-- El núcleo de «confirmar la salida» (baja el stock, una sola transacción e idempotente) se separa de su permiso: `confirmar_salida` lo llama con el permiso de siempre y la
-- entrega al transportista del cliente lo llama con el suyo. Se hace una sola vez, copiando la función vigente sin su verificación de permiso (re-ejecutable: si ya existe, no se toca).
do $$
declare
  v_oid oid; v_def text;
  v_permiso text := E'  perform wms._exigir_accion(''confirmar_salida'', ''No tienes permiso para confirmar salidas'');\n';
  v_cabeza text := 'CREATE OR REPLACE FUNCTION wms.confirmar_salida(';
begin
  if to_regprocedure('wms._confirmar_salida_nucleo(uuid,text)') is not null then return; end if;
  v_oid := to_regprocedure('wms.confirmar_salida(uuid,text)');
  v_def := pg_get_functiondef(v_oid);
  if position(v_permiso in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.confirmar_salida: %', v_permiso; end if;
  if position(v_cabeza in v_def) <> 1 then raise exception 'No se encontró la cabecera esperada de wms.confirmar_salida'; end if;
  v_def := replace(v_def, v_permiso, '');
  v_def := 'CREATE OR REPLACE FUNCTION wms._confirmar_salida_nucleo(' || substr(v_def, length(v_cabeza) + 1);
  execute v_def;
end $$;

create or replace function wms.confirmar_salida(p_salida uuid, p_token text default null) returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  perform wms._exigir_accion('confirmar_salida', 'No tienes permiso para confirmar salidas');
  return wms._confirmar_salida_nucleo(p_salida, p_token);
end $$;

-- Registra la entrega al transportista del cliente y confirma la salida (el stock baja aquí, igual que al confirmar la salida de una ruta). Solo una orden por cuenta de un cliente (B),
-- ya conforme, con su GRE registrada, su paquete documental y su embalaje, y que no esté en una ruta. Repetir el envío devuelve la misma entrega.
create or replace function wms.registrar_entrega_transportista_cliente(
  p_salida uuid, p_transportista text, p_placa text, p_documento text, p_hora timestamptz, p_entrega_almacen text,
  p_cargo_ref text default null, p_cargo_nombre text default null, p_nota text default null) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  s wms.salidas; v_id uuid; v_trans text := nullif(btrim(coalesce(p_transportista, '')), ''); v_placa text := nullif(upper(btrim(coalesce(p_placa, ''))), '');
  v_dni text := nullif(btrim(coalesce(p_documento, '')), ''); v_entrega text := nullif(btrim(coalesce(p_entrega_almacen, '')), ''); v_ruta text;
begin
  perform wms._exigir_accion('entregar_al_transportista_cliente', 'Solo el Jefe de Transporte o el Jefe de Almacén entregan la mercadería al transportista del cliente');
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa orden' using errcode = 'P0001'; end if;
  if s.tipo <> 'CLIENTE' then
    raise exception 'La entrega al transportista del cliente es solo para una orden por cuenta de un cliente de almacenamiento' using errcode = 'P0001';
  end if;
  select id into v_id from wms.entregas_transportista_cliente where salida_id = p_salida;
  if found then return v_id; end if;
  if s.estado = 'CANCELADA' then raise exception 'La orden está cancelada' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La orden ya salió' using errcode = 'P0001'; end if;
  select r.numero into v_ruta from wms.ruta_paradas pa join wms.rutas r on r.id = pa.ruta_id where pa.salida_id = p_salida and pa.activa and r.estado <> 'CANCELADA' limit 1;
  if v_ruta is not null then raise exception 'La orden está en la ruta %: esta orden se entrega al transportista del cliente, no va en una ruta de Logisalud', v_ruta using errcode = 'P0001'; end if;
  if v_trans is null then raise exception 'Escribe el nombre del transportista (o de quien recoge)' using errcode = 'P0001'; end if;
  if v_placa is null and v_dni is null then raise exception 'Escribe la placa del vehículo o el DNI de quien recoge' using errcode = 'P0001'; end if;
  if v_dni is not null and v_dni !~ '^[0-9]{8}$' then raise exception 'El DNI tiene 8 números' using errcode = 'P0001'; end if;
  if p_hora is null then raise exception 'Indica la hora de la entrega' using errcode = 'P0001'; end if;
  if p_hora > now() + interval '5 minutes' then raise exception 'La hora de la entrega no puede ser futura' using errcode = 'P0001'; end if;
  if v_entrega is null then raise exception 'Escribe quién entrega por parte del almacén' using errcode = 'P0001'; end if;
  if not wms.listo_para_carga(p_salida) then
    raise exception 'La orden todavía no está lista para entregarse: faltan la conformidad, la GRE del cliente registrada, el paquete documental completo o el embalaje' using errcode = 'P0001';
  end if;
  v_id := gen_random_uuid();
  insert into wms.entregas_transportista_cliente (id, salida_id, transportista, placa, documento_recoge, entregado_en, entrega_almacen, cargo_archivo, cargo_nombre, nota, registrada_por)
  values (v_id, p_salida, v_trans, v_placa, v_dni, p_hora, v_entrega, nullif(btrim(coalesce(p_cargo_ref, '')), ''), nullif(btrim(coalesce(p_cargo_nombre, '')), ''),
          nullif(btrim(coalesce(p_nota, '')), ''), auth.uid());
  perform wms._confirmar_salida_nucleo(p_salida, 'entrega-cliente:' || p_salida::text);
  perform wms.registrar_audit('entrega_transportista_cliente', 'salidas', p_salida::text, null,
    jsonb_build_object('transportista', v_trans, 'placa', v_placa, 'documento', v_dni, 'hora', p_hora, 'entrega', v_entrega, 'orden', s.numero, 'cargo', nullif(btrim(coalesce(p_cargo_ref, '')), '') is not null), p_nota);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function
  wms.planificar_ruta(uuid, date, uuid, uuid, uuid, jsonb, text), wms.confirmar_ruta(uuid), wms.confirmar_salida(uuid, text),
  wms.registrar_entrega_transportista_cliente(uuid, text, text, text, timestamptz, text, text, text, text)
  to authenticated;
revoke execute on all functions in schema wms from public;
