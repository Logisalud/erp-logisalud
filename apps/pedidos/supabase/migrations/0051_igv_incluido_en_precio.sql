-- Corrige el calculo de IGV: los precios de canal YA lo incluyen.
--
-- Las listas de precios importadas (PVF Farma/Horizontal, PVF Mayorista/Top,
-- PVF Instituciones/Clinicas, PVF Subdistribuidores, PVF Minicadenas) son
-- precio final al publico, no base imponible. La logica anterior tomaba
-- price_list_items.precio como base y le sumaba 18% encima, asi que todo
-- pedido con productos GRAVADO salia con el total inflado un 18%.
--
-- Correccion: total = cantidad * precio. La base se deriva hacia atras
-- (total / (1 + tasa/100)) y el IGV por resta, para que subtotal + igv de
-- exactamente el total y no quede un centimo suelto por redondear las dos
-- partes por separado.
--
-- `subtotal` no cambia de significado: sigue siendo la base imponible, que
-- es lo que el comprobante necesita como total_gravada.
--
-- Se reemplazan las dos funciones que calculaban lineas. `reevaluate_order`
-- no las recalcula, asi que no se toca. El espejo en TypeScript vive en
-- domain/orders.ts (calculateLineItem) y quedo alineado en el mismo commit.

CREATE OR REPLACE FUNCTION pedidos.submit_order(p_order_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pedidos', 'public'
AS $function$
declare
  v_order record;
  v_customer record;
  v_item record;
  v_precio numeric;
  v_tasa numeric;
  v_afectacion text;
  v_igv numeric;
  v_subtotal numeric;
  v_total numeric;
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

    -- El precio de lista YA INCLUYE IGV: el total es cantidad x precio y el
    -- desglose se deriva hacia atras. El IGV sale por resta para que
    -- subtotal + igv de exactamente el total.
    v_total := round(v_item.cantidad * v_precio, 2);
    v_subtotal := case when v_afectacion = 'GRAVADO'
                       then round(v_total / (1 + v_tasa / 100), 2)
                       else v_total end;
    v_igv := round(v_total - v_subtotal, 2);

    update pedidos.order_items set
      precio_unitario = v_precio,
      afectacion_tributaria = v_afectacion,
      tasa_igv = v_tasa,
      subtotal = v_subtotal,
      igv = v_igv,
      total = v_total,
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
  -- Sin condición habitual definida no hay contra qué comparar: no es
  -- excepción administrativa.
  elsif v_customer.condicion_pago_habitual_id is not null
        and v_order.payment_terms_id <> v_customer.condicion_pago_habitual_id then
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
$function$;



CREATE OR REPLACE FUNCTION pedidos.decide_approval_request(p_request_id uuid, p_decision text, p_precio_aprobado numeric, p_comentario text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pedidos', 'public'
AS $function$
declare
  v_order_id uuid;
  v_item_id uuid;
  v_item record;
  v_igv numeric;
  v_subtotal numeric;
  v_total numeric;
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
      -- Mismo criterio: el precio aprobado tambien viene con IGV incluido.
      v_total := round(v_item.cantidad * p_precio_aprobado, 2);
      v_subtotal := case when v_item.afectacion_tributaria = 'GRAVADO'
                         then round(v_total / (1 + v_item.tasa_igv / 100), 2)
                         else v_total end;
      v_igv := round(v_total - v_subtotal, 2);
      update pedidos.order_items set
        precio_unitario = p_precio_aprobado,
        subtotal = v_subtotal,
        igv = v_igv,
        total = v_total,
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
$function$;



-- Auditoria de lo ya grabado. NO corrige nada: solo informa, para que el
-- usuario decida que hacer con los pedidos afectados.
do $auditoria$
declare
  v_afectados integer;
  v_pedidos integer;
begin
  select count(*), count(distinct order_id) into v_afectados, v_pedidos
  from pedidos.order_items
  where afectacion_tributaria = 'GRAVADO'
    and tasa_igv > 0
    -- Firma de la formula vieja: el total guardado equivale a
    -- cantidad * precio * (1 + tasa/100) en vez de cantidad * precio.
    and abs(total - round(cantidad * precio_unitario * (1 + tasa_igv / 100), 2)) < 0.02
    and abs(total - round(cantidad * precio_unitario, 2)) >= 0.02;

  if v_afectados > 0 then
    raise notice 'IGV DUPLICADO: % linea(s) en % pedido(s) tienen el total inflado con la formula anterior. No se corrigieron: revisar y decidir.', v_afectados, v_pedidos;
  else
    raise notice 'IGV duplicado: ninguna linea grabada con la formula anterior.';
  end if;
end $auditoria$;
