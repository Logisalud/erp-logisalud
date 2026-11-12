-- 0065 · WMS · Correcciones de la auditoría de salidas (12-nov-2026)
--
--   1. Envío incierto a Nubefact: al adoptar la pre-guía, `reservar_numero_guia` ahora devuelve `reintento = true` y deja anotado el intento (`guia_numeros.enviado_en`): el envío consulta primero a Nubefact
--      (si ya la tiene, la registra en vez de duplicarla). Una pre-guía con intento anotado no se intercambia de número, y cuando sí se intercambian dos pre-guías el envío devuelve el cambio
--      para avisar a quien factura. Si Nubefact no la recibió, `liberar_numero_guia` borra el intento.
--   2. «Dejar fuera de la salida» y «Ya no sale» sacan la parada del PLAN (queda libre para otra ruta: un pedido reprogramado puede planificarse otro día) pero la exclusión queda registrada y la hoja de la ruta
--      y la pantalla de carga siguen mostrando la fila, marcada. «Ya no sale» también marca las rutas PLANIFICADAS (el estado real de carga) y no cancela de una vez si quedan devoluciones abiertas.
--   3. Cancelar la orden porque el pedido se canceló en Pedidos también cancela su pre-guía (el número pasa a «Números sin usar»).
--   4. «Editar» no cambia las líneas de una orden con lote indicado (se duplicaban las reservas).
--   5. `dar_conformidad` (por línea) respeta lo mismo que `conformar_orden`: quien picó no la da y una orden tomada por otra persona queda bloqueada.
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0055, 0059, 0060 y 0064.

alter table wms.guia_numeros add column if not exists enviado_en timestamptz;

do $$ begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'reservar_numero_guia' and pg_get_functiondef(p.oid) like '%enviado_en%') then return; end if;
  perform wms._parchar_funcion('reservar_numero_guia',
    $q$      select * into v_menor from wms.guia_numeros where serie = v_serie and estado = 'RESERVADO' and pre_guia and not archivado and id <> n.id order by numero limit 1 for update;
      if found and v_menor.numero < v_mio then$q$,
    $q$      select * into v_menor from wms.guia_numeros where serie = v_serie and estado = 'RESERVADO' and pre_guia and not archivado and id <> n.id and enviado_en is null order by numero limit 1 for update;
      if found and v_menor.numero < v_mio and n.enviado_en is null then$q$);
  perform wms._parchar_funcion('reservar_numero_guia',
    $q$        select * into n from wms.guia_numeros where id = n.id;
      end if;
    end;
    return jsonb_build_object('numero', n.numero, 'reintento', false);$q$,
    $q$        perform set_config('wms.intercambio', jsonb_build_object('salida', v_menor.salida_id, 'numero_anterior', v_menor.numero, 'numero_nuevo', v_mio, 'mi_numero_anterior', v_mio, 'mi_numero_nuevo', v_menor.numero)::text, true);
        select * into n from wms.guia_numeros where id = n.id;
      end if;
    end;
    update wms.guia_numeros set enviado_en = now() where id = n.id;
    return jsonb_build_object('numero', n.numero, 'reintento', true, 'intercambio', nullif(current_setting('wms.intercambio', true), '')::jsonb);$q$);
end $$;

do $$ begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'liberar_numero_guia' and pg_get_functiondef(p.oid) like '%enviado_en%') then return; end if;
  perform wms._parchar_funcion('liberar_numero_guia',
    $q$  if not found or n.estado <> 'RESERVADO' or n.pre_guia then return false; end if;$q$,
    $q$  if found and n.pre_guia and n.estado = 'RESERVADO' then update wms.guia_numeros set enviado_en = null where id = n.id; return false; end if;
  if not found or n.estado <> 'RESERVADO' then return false; end if;$q$);
end $$;

-- Escanear o contar un bulto de un pedido que salió del plan por una exclusión dice «se dejó fuera de esta salida» (no «no está en esta ruta»).
do $$ begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'cargar_bulto' and pg_get_functiondef(p.oid) like '%and not exists (select 1 from wms.carga_exclusiones where ruta_id = p_ruta and salida_id = b.salida_id)%') then return; end if;
  perform wms._parchar_funcion('cargar_bulto',
    $q$  if not exists (select 1 from wms.ruta_paradas where ruta_id = p_ruta and activa and salida_id = b.salida_id) then$q$,
    $q$  if not exists (select 1 from wms.ruta_paradas where ruta_id = p_ruta and activa and salida_id = b.salida_id) and not exists (select 1 from wms.carga_exclusiones where ruta_id = p_ruta and salida_id = b.salida_id) then$q$);
end $$;
do $$ begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'registrar_conteo_carga' and pg_get_functiondef(p.oid) like '%and not exists (select 1 from wms.carga_exclusiones where ruta_id = p_ruta and salida_id = p_salida)%') then return; end if;
  perform wms._parchar_funcion('registrar_conteo_carga',
    $q$  if not exists (select 1 from wms.ruta_paradas where ruta_id = p_ruta and activa and salida_id = p_salida) then raise exception 'Ese pedido no está en esta ruta' using errcode = 'P0001'; end if;$q$,
    $q$  if not exists (select 1 from wms.ruta_paradas where ruta_id = p_ruta and activa and salida_id = p_salida) and not exists (select 1 from wms.carga_exclusiones where ruta_id = p_ruta and salida_id = p_salida) then raise exception 'Ese pedido no está en esta ruta' using errcode = 'P0001'; end if;$q$);
end $$;

-- Las paradas que salieron del plan por una exclusión se siguen mostrando (marcadas) en la pantalla de carga.
do $$ begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'conciliacion_carga' and pg_get_functiondef(p.oid) like '%carga_exclusiones x where x.ruta_id = p.ruta_id%') then return; end if;
  perform wms._parchar_funcion('conciliacion_carga',
    $q$     where p.ruta_id = p_ruta and p.activa order by p.secuencia$q$,
    $q$     where p.ruta_id = p_ruta and (p.activa or exists (select 1 from wms.carga_exclusiones x where x.ruta_id = p.ruta_id and x.salida_id = p.salida_id)) order by p.secuencia$q$);
end $$;

create or replace function wms.excluir_pedido_de_carga(p_ruta uuid, p_salida uuid, p_motivo text, p_tipo text default 'FUERA') returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_mot text := nullif(btrim(coalesce(p_motivo, '')), ''); v_id uuid := gen_random_uuid(); v_tipo text := upper(btrim(coalesce(p_tipo, 'FUERA')));
begin
  perform wms._exigir_accion('liberar_unidad', 'No tienes permiso para dejar un pedido fuera de la salida');
  perform wms._exigir_ruta_en_carga(p_ruta);
  if v_mot is null then raise exception 'Cuenta por qué el pedido se deja fuera de la salida' using errcode = 'P0001'; end if;
  if v_tipo not in ('FUERA', 'ANULADO', 'REPROGRAMADO') then raise exception 'Elige si el pedido se anula o se reprograma' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.carga_exclusiones where ruta_id = p_ruta and salida_id = p_salida) then raise exception 'Ese pedido ya se dejó fuera de la salida' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.ruta_paradas where ruta_id = p_ruta and activa and salida_id = p_salida) then raise exception 'Ese pedido no está en esta ruta' using errcode = 'P0001'; end if;
  insert into wms.carga_exclusiones (id, ruta_id, salida_id, motivo, por, tipo) values (v_id, p_ruta, p_salida, v_mot, auth.uid(), v_tipo);
  update wms.carga_bultos c set estado = 'RETIRADO', retirado_por = auth.uid(), retirado_en = now(), motivo_retiro = 'El pedido se dejó fuera de la salida: ' || v_mot
   where c.ruta_id = p_ruta and c.estado = 'CARGADO' and exists (select 1 from wms.bultos b where b.id = c.bulto_id and b.salida_id = p_salida);
  -- el pedido sale del plan de esta ruta (queda libre para planificarlo en otra); su fila se sigue mostrando, marcada, porque la exclusión queda registrada
  update wms.ruta_paradas set activa = false where ruta_id = p_ruta and salida_id = p_salida and activa;
  perform wms.registrar_audit('pedido_fuera_de_la_salida', 'rutas', p_ruta::text, null, jsonb_build_object('salida', p_salida, 'tipo', v_tipo), v_mot);
end $$;

create or replace function wms.ya_no_sale(p_salida uuid, p_motivo text, p_rehacer boolean default false) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  s wms.salidas; sl record; v_r jsonb; v_lib integer := 0; v_dev integer := 0; v_mot text := nullif(btrim(coalesce(p_motivo, '')), ''); v_ruta record; n wms.guia_numeros;
begin
  perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para cancelar una salida');
  if v_mot is null or length(v_mot) < 5 then raise exception 'Cuenta por qué ya no sale (al menos 5 letras)' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa orden' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La orden ya no está abierta: si ya salió, el transportista marca el pedido como no entregado o rechazado' using errcode = 'P0001'; end if;
  if s.cancelacion_pendiente then raise exception 'Esta orden ya está por cancelarse: falta devolver lo picado a su ubicación' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.guias_remision g where g.salida_id = p_salida and g.estado = 'VIGENTE') then
    raise exception 'La orden ya tiene su guía: anula la guía primero y después usa «Ya no sale»' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.carga_bultos cb join wms.bultos b on b.id = cb.bulto_id where b.salida_id = p_salida and cb.estado = 'CARGADO') then
    raise exception 'Ya hay bultos de este pedido cargados en el vehículo: retíralos de la carga primero' using errcode = 'P0001';
  end if;
  select r.id, r.numero, r.estado into v_ruta from wms.ruta_paradas pa join wms.rutas r on r.id = pa.ruta_id where pa.salida_id = p_salida and pa.activa and r.estado <> 'CANCELADA' limit 1;
  if found and v_ruta.estado in ('EN_RUTA', 'PENDIENTE_CIERRE', 'CERRADA') then
    raise exception 'La ruta % ya salió: el transportista marca el pedido como no entregado o rechazado', v_ruta.numero using errcode = 'P0001';
  end if;

  -- 1. la pre-guía (si la hay) se cancela: su número no se reutiliza, pasa a «Números sin usar»
  select * into n from wms.guia_numeros where salida_id = p_salida and pre_guia and estado = 'RESERVADO' and not archivado for update;
  if found then
    update wms.guia_numeros set estado = 'SIN_USAR', resuelto_en = now(), detalle = 'Ya no sale: ' || v_mot where id = n.id;
    perform wms.registrar_audit('pre_guia_cancelada', 'guia_numeros', n.serie || '-' || n.numero, null, jsonb_build_object('serie', n.serie, 'numero', n.numero, 'salida', p_salida), v_mot);
  end if;

  -- 2. en una ruta que todavía no sale, el pedido queda marcado «anulado» (su fila no se borra)
  if v_ruta.id is not null and v_ruta.estado in ('PLANIFICADA', 'LISTA_PARA_CARGA', 'LIBERADA') then
    if not exists (select 1 from wms.carga_exclusiones x where x.ruta_id = v_ruta.id and x.salida_id = p_salida) then
      insert into wms.carga_exclusiones (ruta_id, salida_id, motivo, por, tipo) values (v_ruta.id, p_salida, 'Ya no sale: ' || v_mot, auth.uid(), 'ANULADO');
    end if;
    update wms.ruta_paradas set activa = false where ruta_id = v_ruta.id and salida_id = p_salida and activa;
  end if;

  -- 3. lo que nadie pickeó se libera; lo pickeado (o ya en la zona de despacho) queda por devolver a su ubicación, con verificación de otra persona
  update wms.salidas set rehacer_al_cancelar = coalesce(p_rehacer, false), motivo_cancelacion = 'Ya no sale: ' || v_mot where id = p_salida;
  for sl in select * from wms.salida_lineas where salida_id = p_salida and estado <> 'CANCELADA' order by creada_en, id loop
    v_r := wms._soltar_linea(sl.id, null, 'PEDIDO_CANCELADO', null);
    v_lib := v_lib + (v_r->>'liberadas')::integer; v_dev := v_dev + (v_r->>'por_devolver')::integer;
  end loop;
  if v_dev = 0 and not exists (select 1 from wms.devoluciones_picking d where d.salida_id = p_salida and d.estado <> 'VERIFICADA') then
    perform wms._cancelar_salida_por_pedido(p_salida, 'Ya no sale: ' || v_mot);
  else
    update wms.salidas set cancelacion_pendiente = true where id = p_salida;
    v_dev := greatest(v_dev, (select coalesce(sum(cantidad), 0)::integer from wms.devoluciones_picking where salida_id = p_salida and estado <> 'VERIFICADA'));
    update wms.alertas set estado = 'ATENDIDA', atendida_en = now(), nota_atencion = 'Ya no sale'
     where estado = 'ABIERTA' and clave in (select 'stock:' || id from wms.salida_lineas where salida_id = p_salida);
    perform wms._alertar('DEVOLUCION_PICKING', 'jefe_almacen', null, null, 'devolucion:' || p_salida,
      format('La orden %s ya no sale: tiene %s unidades ya picadas por devolver a su ubicación. El auxiliar las devuelve y otra persona lo verifica; después la orden se cancela sola.', s.numero, v_dev));
  end if;
  if not coalesce(p_rehacer, false) then
    perform wms._alertar('PEDIDO_CANCELADO', 'jefe_transporte', null, null, 'ya-no-sale:' || p_salida,
      format('El pedido %s ya no sale (orden %s): avisa al área comercial para que lo cancele en Pedidos. Motivo: %s', coalesce(s.pedido_numero, '—'), s.numero, v_mot));
  end if;
  perform wms.registrar_audit('ya_no_sale', 'salidas', p_salida::text, null, jsonb_build_object('liberadas', v_lib, 'por_devolver', v_dev, 'rehacer', coalesce(p_rehacer, false)), v_mot);
  return jsonb_build_object('liberadas', v_lib, 'por_devolver', v_dev, 'cancelada', (select estado = 'CANCELADA' from wms.salidas where id = p_salida), 'rehacer', coalesce(p_rehacer, false), 'pre_guia', case when n.id is null then null else n.serie || '-' || lpad(n.numero::text, 8, '0') end);
end $$;

-- Cancelar la orden (porque el pedido se canceló en Pedidos o por «Ya no sale») cancela también su pre-guía: el número no queda retenido.
do $$ begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = '_cancelar_salida_por_pedido' and pg_get_functiondef(p.oid) like '%orden cancelada: su pre-guía%') then return; end if;
  perform wms._parchar_funcion('_cancelar_salida_por_pedido',
    $q$  perform wms.registrar_audit('salida_cancelada_por_pedido',$q$,
    $q$  -- orden cancelada: su pre-guía (si la tenía) se cancela y su número pasa a «Números sin usar»
  update wms.guia_numeros set estado = 'SIN_USAR', resuelto_en = now(), detalle = 'La orden se canceló: ' || coalesce(p_motivo, '') where salida_id = p_salida and pre_guia and estado = 'RESERVADO' and not archivado;
  perform wms.registrar_audit('salida_cancelada_por_pedido',$q$);
end $$;

-- «Editar» no cambia las líneas de una orden con lote indicado (el cliente de almacenamiento indicó el lote): se cancela la orden y se crea otra.
do $$ begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'editar_orden_salida' and pg_get_functiondef(p.oid) like '%con lote indicado%') then return; end if;
  perform wms._parchar_funcion('editar_orden_salida',
    $q$  if v_cambia_estructura then
    if v_picking then$q$,
    $q$  if p_cambios ? 'lineas' and (s.tipo = 'CLIENTE' or exists (select 1 from wms.salida_lineas z where z.salida_id = p_salida and z.lote_indicado_id is not null)) then
    raise exception 'Las líneas de una orden con lote indicado no se cambian aquí: cancela la orden y crea otra' using errcode = 'P0001';
  end if;
  if v_cambia_estructura then
    if v_picking then$q$);
end $$;

-- `dar_conformidad` por línea: lo mismo que `conformar_orden` (quien picó la orden no la da; una orden tomada por otra persona queda bloqueada).
do $$ begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'dar_conformidad' and pg_get_functiondef(p.oid) like '%conformidad_tomada_por%') then return; end if;
  perform wms._parchar_funcion('dar_conformidad',
    $q$  select * into o from wms.ordenes_picking where id = ol.orden_id;$q$,
    $q$  select * into o from wms.ordenes_picking where id = ol.orden_id;
  if o.picker_id = auth.uid() then raise exception 'La conformidad la da otra persona, no quien hizo el picking' using errcode = 'P0001'; end if;
  if o.conformidad_tomada_por is not null and o.conformidad_tomada_por <> auth.uid() then
    raise exception 'Esta orden la tomó otra persona para la conformidad: pídele que la suelte (o avisa al Jefe si no está)' using errcode = 'P0001';
  end if;$q$);
end $$;

grant execute on function wms.excluir_pedido_de_carga(uuid, uuid, text, text), wms.ya_no_sale(uuid, text, boolean) to authenticated;
revoke execute on all functions in schema wms from public;
