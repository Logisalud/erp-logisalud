-- Funciones de negocio del workflow de pedidos. Las 3 son SECURITY
-- DEFINER: escriben a través de la frontera que orders_update_draft/
-- order_items_write_draft cierran en cuanto el pedido deja DRAFT, y
-- por eso cada una hace su propia verificación explícita de rol y
-- pertenencia (nunca asumen que una policy externa ya filtró al
-- caller). auth.uid()/is_admin()/has_role()/current_seller_id() siguen
-- reflejando al usuario real que llamó, no al dueño de la función.

-- Único punto de escritura de orders.estado + order_status_history.
-- La tabla de permisos de abajo es la autoridad real de seguridad;
-- domain/orders.ts::canTransition (TS) es solo un espejo para dar
-- mejor UX/tests rápidos sin Postgres — si alguna vez divergen, esta
-- función manda.
create function pedidos.apply_order_transition(p_order_id uuid, p_estado_nuevo text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = pedidos, public
as $$
declare
  v_order record;
begin
  select * into v_order from pedidos.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'Pedido % no existe', p_order_id;
  end if;

  if not (
    (v_order.estado = 'DRAFT' and p_estado_nuevo = 'SUBMITTED'
      and (pedidos.is_admin() or (pedidos.has_role('vendedor') and v_order.seller_id = pedidos.current_seller_id())))
    or (v_order.estado = 'SUBMITTED'
      and p_estado_nuevo in ('NEW_CUSTOMER_VALIDATION', 'ADMINISTRATIVE_EXCEPTION', 'COMMERCIAL_EXCEPTION', 'READY_FOR_OPERATIONS')
      and (pedidos.is_admin() or (pedidos.has_role('vendedor') and v_order.seller_id = pedidos.current_seller_id())))
    or (v_order.estado = 'NEW_CUSTOMER_VALIDATION'
      and p_estado_nuevo in ('DRAFT', 'NEW_CUSTOMER_VALIDATION', 'ADMINISTRATIVE_EXCEPTION', 'COMMERCIAL_EXCEPTION', 'READY_FOR_OPERATIONS')
      and (pedidos.is_admin() or pedidos.has_role('control_pedidos')))
    or (v_order.estado = 'ADMINISTRATIVE_EXCEPTION'
      and p_estado_nuevo in ('DRAFT', 'NEW_CUSTOMER_VALIDATION', 'ADMINISTRATIVE_EXCEPTION', 'COMMERCIAL_EXCEPTION', 'READY_FOR_OPERATIONS')
      and (pedidos.is_admin() or pedidos.has_role('control_pedidos')))
    or (v_order.estado = 'COMMERCIAL_EXCEPTION'
      and p_estado_nuevo in ('DRAFT', 'NEW_CUSTOMER_VALIDATION', 'ADMINISTRATIVE_EXCEPTION', 'COMMERCIAL_EXCEPTION', 'READY_FOR_OPERATIONS')
      and (pedidos.is_admin() or pedidos.has_role('aprobador_comercial')))
  ) then
    raise exception 'Transición % -> % no permitida para este usuario/estado', v_order.estado, p_estado_nuevo;
  end if;

  update pedidos.orders set
    estado = p_estado_nuevo,
    updated_at = now(),
    fecha_envio = case when fecha_envio is null and p_estado_nuevo <> 'DRAFT' then now() else fecha_envio end
  where id = p_order_id;

  insert into pedidos.order_status_history (order_id, estado_anterior, estado_nuevo, usuario, motivo)
  values (p_order_id, v_order.estado, p_estado_nuevo, auth.uid(), p_motivo);
end;
$$;

-- Recalcula precios de las líneas UNA sola vez (solo en DRAFT->SUBMITTED)
-- y decide la primera bifurcación. Nunca acepta precios como parámetro:
-- los busca ella misma en price_list_items/product_tax_profiles, para
-- que la garantía "el servidor recalcula, nunca confía en el navegador"
-- sea real incluso contra alguien que llame este RPC directamente (no
-- solo a través de la app). Devuelve el estado resultante y qué líneas
-- cambiaron de precio vs. el snapshot tomado en DRAFT (price drift).
create function pedidos.submit_order(p_order_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = pedidos, public
as $$
declare
  v_order record;
  v_customer record;
  v_item record;
  v_precio numeric;
  v_tasa numeric;
  v_afectacion text;
  v_igv numeric;
  v_drift jsonb := '[]'::jsonb;
  v_estado_resultado text;
begin
  select * into v_order from pedidos.orders where id = p_order_id for update;
  if v_order is null or v_order.estado <> 'DRAFT' then
    raise exception 'Solo se puede enviar un pedido en DRAFT';
  end if;
  if not (pedidos.is_admin() or (pedidos.has_role('vendedor') and v_order.seller_id = pedidos.current_seller_id())) then
    raise exception 'No autorizado para enviar este pedido';
  end if;
  if not exists (select 1 from pedidos.order_items where order_id = p_order_id) then
    raise exception 'El pedido no tiene productos';
  end if;

  select * into v_customer from pedidos.customers where id = v_order.customer_id;
  if v_customer.canal_id is null then
    raise exception 'El cliente no tiene canal de venta asignado; no se puede calcular precio';
  end if;

  for v_item in select * from pedidos.order_items where order_id = p_order_id loop
    select pli.precio into v_precio
    from pedidos.price_list_items pli
    where pli.product_id = v_item.product_id
      and pli.sales_channel_id = v_customer.canal_id
      and pli.vigente_hasta is null;

    if v_precio is null then
      raise exception 'Sin precio vigente para el producto % en el canal del cliente', v_item.product_id;
    end if;

    select tp.afectacion_tributaria, tp.tasa_aplicable into v_afectacion, v_tasa
    from pedidos.product_tax_profiles tp
    where tp.product_id = v_item.product_id and tp.vigente_hasta is null;

    if v_afectacion is null then
      raise exception 'Sin perfil tributario vigente para el producto %', v_item.product_id;
    end if;

    if v_precio <> v_item.precio_unitario then
      v_drift := v_drift || jsonb_build_object(
        'orderItemId', v_item.id, 'precioAnterior', v_item.precio_unitario, 'precioNuevo', v_precio);
    end if;

    v_igv := case when v_afectacion = 'GRAVADO' then round(v_item.cantidad * v_precio * v_tasa / 100, 2) else 0 end;

    update pedidos.order_items set
      precio_unitario = v_precio,
      afectacion_tributaria = v_afectacion,
      tasa_igv = v_tasa,
      subtotal = v_item.cantidad * v_precio,
      igv = v_igv,
      total = v_item.cantidad * v_precio + v_igv,
      updated_at = now()
    where id = v_item.id;
  end loop;

  update pedidos.orders set
    razon_social_snapshot = v_customer.razon_social,
    direccion_snapshot = (select direccion from pedidos.customer_addresses where id = v_order.customer_address_id),
    ubigeo_snapshot = (select ubigeo from pedidos.customer_addresses where id = v_order.customer_address_id),
    canal_snapshot = (select nombre from pedidos.sales_channels where id = v_customer.canal_id),
    zona_snapshot = (select nombre from pedidos.zones where id = v_customer.zona_id),
    vendedor_snapshot = (select nombre_completo from pedidos.sellers where id = v_order.seller_id)
  where id = p_order_id;

  perform pedidos.apply_order_transition(p_order_id, 'SUBMITTED', p_motivo);

  if v_customer.estado = 'PENDIENTE_DE_VALIDACION' then
    v_estado_resultado := 'NEW_CUSTOMER_VALIDATION';
  elsif v_order.payment_terms_id <> v_customer.condicion_pago_habitual_id then
    v_estado_resultado := 'ADMINISTRATIVE_EXCEPTION';
  elsif exists (
    select 1 from pedidos.approval_requests ar
    join pedidos.order_items oi on oi.id = ar.order_item_id
    where oi.order_id = p_order_id and ar.estado = 'PENDIENTE'
  ) then
    v_estado_resultado := 'COMMERCIAL_EXCEPTION';
  else
    v_estado_resultado := 'READY_FOR_OPERATIONS';
  end if;

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, 'Validación automática');

  return jsonb_build_object('estadoResultado', v_estado_resultado, 'priceDrift', v_drift);
end;
$$;

-- Solo re-decide la bifurcación (tras resolver una excepción o validar
-- un cliente nuevo). NUNCA toca order_items/precios: si lo hiciera,
-- sobrescribiría un precio que un aprobador_comercial acaba de aprobar
-- manualmente (APROBAR_OTRO_PRECIO).
create function pedidos.reevaluate_order(p_order_id uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = pedidos, public
as $$
declare
  v_order record;
  v_customer record;
  v_estado_resultado text;
begin
  if not (pedidos.is_admin() or pedidos.has_role('control_pedidos') or pedidos.has_role('aprobador_comercial')) then
    raise exception 'No autorizado para reevaluar pedidos';
  end if;

  select * into v_order from pedidos.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'Pedido % no existe', p_order_id;
  end if;
  select * into v_customer from pedidos.customers where id = v_order.customer_id;

  if v_customer.estado = 'PENDIENTE_DE_VALIDACION' then
    v_estado_resultado := 'NEW_CUSTOMER_VALIDATION';
  elsif v_order.payment_terms_id <> v_customer.condicion_pago_habitual_id then
    v_estado_resultado := 'ADMINISTRATIVE_EXCEPTION';
  elsif exists (
    select 1 from pedidos.approval_requests ar
    join pedidos.order_items oi on oi.id = ar.order_item_id
    where oi.order_id = p_order_id and ar.estado = 'PENDIENTE'
  ) then
    v_estado_resultado := 'COMMERCIAL_EXCEPTION';
  else
    v_estado_resultado := 'READY_FOR_OPERATIONS';
  end if;

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, p_motivo);
  return v_estado_resultado;
end;
$$;

-- Decide una solicitud de descuento (aprobador_comercial/admin). El
-- precio aprobado en APROBAR_OTRO_PRECIO SÍ viene del caller — a
-- diferencia de submit_order, acá el caller es la autoridad humana que
-- decide el override, verificada por rol, no un precio que el
-- navegador "recalculó" por su cuenta.
create function pedidos.decide_approval_request(
  p_request_id uuid, p_decision text, p_precio_aprobado numeric, p_comentario text
)
returns void
language plpgsql
security definer
set search_path = pedidos, public
as $$
declare
  v_order_id uuid;
  v_item_id uuid;
  v_item record;
  v_igv numeric;
begin
  if not (pedidos.is_admin() or pedidos.has_role('aprobador_comercial')) then
    raise exception 'Rol no autorizado para decidir solicitudes de descuento';
  end if;

  select order_id, order_item_id into v_order_id, v_item_id
  from pedidos.approval_requests where id = p_request_id and estado = 'PENDIENTE'
  for update;
  if v_order_id is null then
    raise exception 'Solicitud % no existe o ya fue resuelta', p_request_id;
  end if;

  insert into pedidos.approval_decisions (approval_request_id, decidido_por, decision, precio_aprobado, comentario)
  values (p_request_id, auth.uid(), p_decision, p_precio_aprobado, p_comentario);

  if p_decision in ('APROBAR', 'APROBAR_OTRO_PRECIO') then
    update pedidos.approval_requests set estado = 'RESUELTO' where id = p_request_id;

    if p_decision = 'APROBAR_OTRO_PRECIO' then
      select * into v_item from pedidos.order_items where id = v_item_id;
      v_igv := case when v_item.afectacion_tributaria = 'GRAVADO' then round(v_item.cantidad * p_precio_aprobado * v_item.tasa_igv / 100, 2) else 0 end;
      update pedidos.order_items set
        precio_unitario = p_precio_aprobado,
        subtotal = v_item.cantidad * p_precio_aprobado,
        igv = v_igv,
        total = v_item.cantidad * p_precio_aprobado + v_igv,
        updated_at = now()
      where id = v_item_id;
    end if;

    perform pedidos.reevaluate_order(v_order_id, 'Solicitud de descuento aprobada');
  elsif p_decision = 'RECHAZAR' then
    update pedidos.approval_requests set estado = 'RESUELTO' where id = p_request_id;
    perform pedidos.apply_order_transition(v_order_id, 'DRAFT', 'Solicitud de descuento rechazada: ' || coalesce(p_comentario, ''));
  end if;
  -- SOLICITAR_INFO: no cambia estado de nada; services/approvals.ts
  -- agrega el order_observations correspondiente por su cuenta.
end;
$$;

revoke all on function pedidos.apply_order_transition from public;
revoke all on function pedidos.submit_order from public;
revoke all on function pedidos.reevaluate_order from public;
revoke all on function pedidos.decide_approval_request from public;

grant execute on function pedidos.apply_order_transition to authenticated;
grant execute on function pedidos.submit_order to authenticated;
grant execute on function pedidos.reevaluate_order to authenticated;
grant execute on function pedidos.decide_approval_request to authenticated;
