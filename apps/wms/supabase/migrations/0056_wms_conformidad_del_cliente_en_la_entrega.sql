-- 0056 piloto: (1) la conformidad del cliente en la entrega (formato CONFORMIDAD): «¿el cliente recibió conforme?» Sí / No y, si no, qué no coincidió; (2) la foto del pedido con la caja abierta, que toma quien carga antes de cargarlo.
--
-- Quien conduce ya registra la entrega (quién recibió, DNI y foto). Ahora también marca si el cliente quedó conforme; si no, el tipo de diferencia (cantidad, descripción, lote o documento)
-- y, opcional, una línea de detalle. Lo que el sistema ya sabe (fecha, hora, propietario, guía, cliente) no se vuelve a pedir. Sin marcar nada la entrega cuenta como conforme (es lo normal).
-- No cambia el resultado de la parada ni el flujo de la ruta. Las filas anteriores quedan con `conforme` vacío.
-- La foto del pedido es un evento más de la parada (`FOTO_PEDIDO`, con la foto y su huella): se toma con la ruta liberada (mientras se carga) o en ruta; puede haber varias; no es un resultado. Re-ejecutable.

alter table wms.ruta_paradas_eventos add column if not exists conforme boolean;
alter table wms.ruta_paradas_eventos add column if not exists tipo_diferencia text;
alter table wms.ruta_paradas_eventos add column if not exists detalle_diferencia text;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'ruta_paradas_eventos_evento_check' and conrelid = 'wms.ruta_paradas_eventos'::regclass) then
    alter table wms.ruta_paradas_eventos drop constraint ruta_paradas_eventos_evento_check;
  end if;
  alter table wms.ruta_paradas_eventos add constraint ruta_paradas_eventos_evento_check check (evento in ('LLEGUE', 'ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO', 'INCIDENCIA', 'FOTO_PEDIDO'));
  if not exists (select 1 from pg_constraint where conname = 'ruta_paradas_eventos_foto_pedido_check') then
    alter table wms.ruta_paradas_eventos add constraint ruta_paradas_eventos_foto_pedido_check check (evento <> 'FOTO_PEDIDO' or (foto_ref is not null and foto_hash is not null));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ruta_paradas_eventos_diferencia_check') then
    alter table wms.ruta_paradas_eventos add constraint ruta_paradas_eventos_diferencia_check check (
      (tipo_diferencia is null or tipo_diferencia in ('CANTIDAD', 'DESCRIPCION', 'LOTE', 'DOCUMENTO'))
      and (conforme is distinct from false or evento <> 'ENTREGADO' or tipo_diferencia is not null)
      and (tipo_diferencia is null or conforme = false)
    );
  end if;
end $$;

create or replace function wms.mis_rutas_del_dia(p_fecha date default null) returns jsonb
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Lima')::date);
begin
  if auth.uid() is null or not wms.tiene_permiso('mis_rutas') then raise exception 'No tienes permiso para ver Mis rutas' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'numero', r.numero, 'fecha', r.fecha, 'estado', r.estado, 'vehiculo', v.placa, 'conductor', c.nombre, 'auxiliar', a.nombre,
      'paradas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'secuencia', p.secuencia,
          'pedido_numero', coalesce(pd.numero, sa.cliente_manual->>'pedido_numero'), 'orden_numero', sa.numero,
          'cliente', coalesce(pd.cliente_nombre, sa.cliente_manual->>'razon_social', 'Cliente'),
          'direccion', coalesce(pd.snapshot->'cliente'->>'direccion', sa.cliente_manual->>'direccion'),
          'distrito', pd.snapshot->'cliente'->>'distrito', 'ventana', pd.snapshot->'cliente'->>'ventanaCita',
          'unidades', coalesce((select sum((l->>'cantidad')::int) from jsonb_array_elements(coalesce(pd.snapshot->'lineas', '[]'::jsonb)) l), 0),
          'eventos', coalesce((
            select jsonb_agg(jsonb_build_object('id', e.id, 'evento', e.evento, 'motivo', e.motivo, 'recibio_nombre', e.recibio_nombre, 'recibio_documento', e.recibio_documento,
                                                'foto_nombre', e.foto_nombre, 'hora', e.hora,
                                                'conforme', e.conforme, 'tipo_diferencia', e.tipo_diferencia, 'detalle_diferencia', e.detalle_diferencia) order by e.creado_en)
            from wms.ruta_paradas_eventos e where e.parada_id = p.id), '[]'::jsonb)
        ) order by p.secuencia)
        from wms.ruta_paradas p
        left join wms.pedidos_despacho pd on pd.id = p.pedido_despacho_id
        left join wms.salidas sa on sa.id = p.salida_id
        where p.ruta_id = r.id and p.activa), '[]'::jsonb)
    ) order by r.numero)
    from wms.rutas r
    left join wms.vehiculos v on v.id = r.vehiculo_id
    left join wms.personal_transporte c on c.id = r.conductor_id
    left join wms.personal_transporte a on a.id = r.auxiliar_id
    where r.fecha = v_fecha and r.estado in ('LIBERADA', 'EN_RUTA', 'PENDIENTE_CIERRE', 'CERRADA')
      and (c.usuario_id = auth.uid() or a.usuario_id = auth.uid())), '[]'::jsonb);
end $$;

create or replace function wms.registrar_evento_parada(p_parada uuid, p_evento text, p_datos jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  p wms.ruta_paradas; r wms.rutas; v_id uuid := gen_random_uuid(); v_ev text := upper(btrim(coalesce(p_evento, '')));
  v_motivo text := nullif(btrim(coalesce(p_datos->>'motivo', '')), ''); v_nombre text := nullif(btrim(coalesce(p_datos->>'recibio_nombre', '')), '');
  v_doc text := nullif(btrim(coalesce(p_datos->>'recibio_documento', '')), ''); v_conforme boolean; v_tipo text := nullif(upper(btrim(coalesce(p_datos->>'tipo_diferencia', ''))), ''); v_detalle text := nullif(btrim(coalesce(p_datos->>'detalle_diferencia', '')), ''); v_terminal boolean; v_llego boolean; v_cliente text; v_pendientes integer;
begin
  v_conforme := coalesce(nullif(p_datos->>'conforme', '')::boolean, true);
  if auth.uid() is null or not wms.tiene_permiso('mis_rutas') then raise exception 'No tienes permiso para registrar entregas' using errcode = '42501'; end if;
  select * into p from wms.ruta_paradas where id = p_parada;
  if not found or not p.activa then raise exception 'No encontramos esa parada' using errcode = 'P0001'; end if;
  select * into r from wms.rutas where id = p.ruta_id for update;
  if not wms._es_de_la_ruta(r.id) then raise exception 'Esa parada no es de una ruta tuya' using errcode = '42501'; end if;
  if v_ev not in ('LLEGUE', 'ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO', 'INCIDENCIA', 'FOTO_PEDIDO') then raise exception 'Evento no válido' using errcode = 'P0001'; end if;
  if v_ev = 'FOTO_PEDIDO' then
    if r.estado not in ('LIBERADA', 'EN_RUTA') then raise exception 'La foto del pedido se toma cuando la ruta está liberada (al cargar la unidad)' using errcode = 'P0001'; end if;
  elsif r.estado not in ('EN_RUTA', 'PENDIENTE_CIERRE') then raise exception 'La ruta todavía no salió: las entregas se registran cuando está en ruta' using errcode = 'P0001';
  end if;
  select exists (select 1 from wms.ruta_paradas_eventos where parada_id = p.id and evento in ('ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO')),
         exists (select 1 from wms.ruta_paradas_eventos where parada_id = p.id and evento = 'LLEGUE')
    into v_terminal, v_llego;
  if v_ev <> 'INCIDENCIA' and v_terminal then raise exception 'Esta parada ya tiene su resultado: no se cambia (si hubo un error, avisa al Jefe de Transporte)' using errcode = 'P0001'; end if;
  if v_ev = 'LLEGUE' and v_llego then raise exception 'Ya marcaste que llegaste a esta parada' using errcode = 'P0001'; end if;
  if v_ev in ('ENTREGADO', 'RECHAZADO') and not v_llego then raise exception 'Primero marca «Llegué» en esta parada' using errcode = 'P0001'; end if;
  if v_ev = 'ENTREGADO' then
    if v_nombre is null or length(v_nombre) < 3 then raise exception 'Escribe el nombre de quien recibió' using errcode = 'P0001'; end if;
    if v_doc is null or v_doc !~ '^[0-9]{8}$' then raise exception 'El DNI de quien recibió tiene 8 números' using errcode = 'P0001'; end if;
    if nullif(p_datos->>'foto_ref', '') is null or nullif(p_datos->>'foto_hash', '') is null then raise exception 'Falta la foto de la entrega' using errcode = 'P0001'; end if;
    if not v_conforme and (v_tipo is null or v_tipo not in ('CANTIDAD', 'DESCRIPCION', 'LOTE', 'DOCUMENTO')) then raise exception 'Elige qué no coincidió: cantidad, descripción, lote o documento' using errcode = 'P0001'; end if;
  elsif v_ev = 'FOTO_PEDIDO' then
    if nullif(p_datos->>'foto_ref', '') is null or nullif(p_datos->>'foto_hash', '') is null then raise exception 'Falta la foto del pedido con la caja abierta' using errcode = 'P0001'; end if;
  elsif v_ev in ('NO_ENTREGADO', 'RECHAZADO', 'INCIDENCIA') and (v_motivo is null or length(v_motivo) < 5) then
    raise exception 'Cuéntanos el motivo (al menos 5 letras)' using errcode = 'P0001';
  end if;
  insert into wms.ruta_paradas_eventos (id, parada_id, ruta_id, evento, motivo, recibio_nombre, recibio_documento, foto_ref, foto_nombre, foto_hash, foto_bytes, foto_tipo, por, conforme, tipo_diferencia, detalle_diferencia)
  values (v_id, p.id, r.id, v_ev, v_motivo, case when v_ev = 'ENTREGADO' then v_nombre end, case when v_ev = 'ENTREGADO' then v_doc end,
          case when v_ev in ('ENTREGADO', 'FOTO_PEDIDO') then p_datos->>'foto_ref' end, case when v_ev in ('ENTREGADO', 'FOTO_PEDIDO') then p_datos->>'foto_nombre' end,
          case when v_ev in ('ENTREGADO', 'FOTO_PEDIDO') then p_datos->>'foto_hash' end, case when v_ev in ('ENTREGADO', 'FOTO_PEDIDO') then nullif(p_datos->>'foto_bytes', '')::integer end,
          case when v_ev in ('ENTREGADO', 'FOTO_PEDIDO') then p_datos->>'foto_tipo' end, auth.uid(),
          case when v_ev = 'ENTREGADO' then v_conforme end, case when v_ev = 'ENTREGADO' and not v_conforme then v_tipo end, case when v_ev = 'ENTREGADO' and not v_conforme then v_detalle end);
  if v_ev in ('NO_ENTREGADO', 'RECHAZADO') then
    select coalesce(pd.cliente_nombre, sa.cliente_manual->>'razon_social', 'el cliente') into v_cliente
      from wms.ruta_paradas pp left join wms.pedidos_despacho pd on pd.id = pp.pedido_despacho_id left join wms.salidas sa on sa.id = pp.salida_id where pp.id = p.id;
    perform wms._alertar('RETORNO_POR_ORIGINAR', 'jefe_transporte', null, null, 'retorno-parada:' || p.id,
      format('%s en la ruta %s (%s): %s. Origina el retorno desde su Orden de Salida (Devoluciones).', case v_ev when 'RECHAZADO' then 'Rechazado' else 'No entregado' end, r.numero, v_cliente, v_motivo));
  end if;
  -- todas las paradas con resultado: la ruta queda pendiente de cierre (el Jefe de Transporte la cierra como siempre)
  if v_ev in ('ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO') and r.estado = 'EN_RUTA' then
    select count(*) into v_pendientes from wms.ruta_paradas pp where pp.ruta_id = r.id and pp.activa
      and not exists (select 1 from wms.ruta_paradas_eventos e where e.parada_id = pp.id and e.evento in ('ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO'));
    if v_pendientes = 0 then update wms.rutas set estado = 'PENDIENTE_CIERRE' where id = r.id; end if;
  end if;
  perform wms.registrar_audit('parada_evento', 'ruta_paradas', p.id::text, null, jsonb_build_object('evento', v_ev, 'ruta', r.numero, 'conforme', case when v_ev = 'ENTREGADO' then v_conforme end, 'tipo_diferencia', case when v_ev = 'ENTREGADO' and not v_conforme then v_tipo end), v_motivo);
  return v_id;
end $$;

-- Permisos (default-deny): la función conserva su nombre y firma.
revoke execute on all functions in schema wms from public;
grant execute on function wms.mis_rutas_del_dia(date), wms.registrar_evento_parada(uuid, text, jsonb) to authenticated;
