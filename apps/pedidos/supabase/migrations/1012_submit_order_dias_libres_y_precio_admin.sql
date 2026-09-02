-- submit_order con las dos reglas nuevas. Se reescribe entera porque las
-- dos caen dentro de su cuerpo:
--
-- 1) Días de crédito escritos a mano (1010) ⇒ SIEMPRE excepción
--    administrativa. No hay condición habitual del cliente contra la cual
--    puedan coincidir: por definición no son una condición estándar.
--
-- 2) Precio fijado por el administrador (1011) ⇒ la línea NO se
--    resincroniza con el precio de lista. Este era el punto que rompía la
--    función anterior: al enviar, el bucle sobrescribía precio_unitario con
--    el precio de lista vigente de TODAS las líneas, así que el precio que
--    el administrador acababa de fijar se perdía justo al enviar el pedido.
--    Tampoco cuenta como "el precio cambió desde que armaste el borrador"
--    (priceDrift): no cambió solo, lo cambió él.
--
-- El resto es idéntico a 0051.
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
  v_precio_lista numeric;
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
    select pli.precio into v_precio_lista
    from pedidos.price_list_items pli
    where pli.product_id = v_item.product_id
      and pli.sales_channel_id = v_customer.canal_id
      and pli.vigente_hasta is null;

    if v_precio_lista is null then
      raise exception 'Sin precio vigente para el producto % en el canal del cliente', v_item.product_id;
    end if;

    select tp.afectacion_tributaria, tp.tasa_aplicable into v_afectacion, v_tasa
    from pedidos.product_tax_profiles tp
    where tp.product_id = v_item.product_id and tp.vigente_hasta is null;

    if v_afectacion is null then
      raise exception 'Sin perfil tributario vigente para el producto %', v_item.product_id;
    end if;

    -- Un precio que fijó el administrador se respeta: es una decisión, no
    -- un borrador desactualizado. Igual se refresca el precio de lista de
    -- referencia, para que el correo y el Excel comparen contra el vigente.
    if v_item.precio_fijado_por_admin then
      v_precio := v_item.precio_unitario;
    else
      v_precio := v_precio_lista;
      if v_precio_lista <> v_item.precio_unitario then
        v_drift := v_drift || jsonb_build_object(
          'orderItemId', v_item.id, 'precioAnterior', v_item.precio_unitario, 'precioNuevo', v_precio_lista);
      end if;
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
      precio_lista_original = case when v_item.precio_fijado_por_admin then v_precio_lista
                                   else null end,
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
  -- Días de crédito escritos a mano: no coinciden con ninguna condición
  -- habitual predefinida, así que Administración tiene que verlos siempre.
  elsif v_order.dias_credito_solicitados is not null then
    v_estado_resultado := 'ADMINISTRATIVE_EXCEPTION';
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
