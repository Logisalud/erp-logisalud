-- submit_order aplica las promociones automáticas.
--
-- El motor vive en `pedidos.aplicar_promociones` (migración 1017), y esta
-- es la mitad que importa: si el envío no lo llamara, borraría lo que el
-- motor hizo mientras el vendedor armaba el pedido. El bucle de abajo
-- reescribe cada precio con el de lista vigente, y eso es correcto para el
-- borrador (un precio de hace tres días no vale hoy) — pero deja el pedido
-- sin promociones. Es el mismo bug que ya tuvimos con el precio fijado por
-- el administrador en la migración 1012.
--
-- Tres cambios sobre 1015, todos dentro del cuerpo de la función:
--
--   1. Las líneas gratis del motor se saltean en el bucle. Una
--      bonificación de Vitamina E es una línea del MISMO producto, que sí
--      tiene precio de lista: sin este salto, el envío le pondría S/ 16.00
--      a lo que se entrega gratis. El motor las borra y las vuelve a
--      generar igual, así que no hay nada que refrescar.
--   2. El drift de precio sólo se reporta para líneas a precio de lista.
--      Comparar el precio promocional contra el de lista y avisar "el
--      precio cambió" es ruido: no cambió, tiene promoción.
--   3. `pedidos.aplicar_promociones(p_order_id)` se llama después del
--      bucle y antes de las transiciones de estado — con el pedido todavía
--      en DRAFT, que es cuando se puede tocar order_items.
--
-- Lo demás es idéntico a 1015. Se reescribe la función entera porque los
-- cambios caen dentro de su cuerpo.

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
  v_codigo text;
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
    -- La línea gratis la genera el motor de promociones, no una persona:
    -- refrescarle el precio de lista sería cobrarla.
    if v_item.es_linea_gratis then
      continue;
    end if;

    select pli.precio into v_precio_lista
    from pedidos.price_list_items pli
    where pli.product_id = v_item.product_id
      and pli.sales_channel_id = v_customer.canal_id
      and pli.vigente_hasta is null;

    -- Una bonificación se entrega gratis y casi nunca tiene precio propio en
    -- la lista del canal. Antes de este cambio, el envío entero reventaba
    -- por una línea de bonificación cargada a mano: acá vale S/ 0.00
    -- explícito. Para cualquier otro producto, sin precio no hay pedido.
    if v_precio_lista is null then
      select p.codigo_interno into v_codigo
      from pedidos.products p where p.id = v_item.product_id;

      if upper(btrim(coalesce(v_codigo, ''))) like 'BO%'
         and length(btrim(v_codigo)) > 2 then
        v_precio_lista := 0;
      else
        raise exception 'Sin precio vigente para el producto % en el canal del cliente', v_item.product_id;
      end if;
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
      -- Una línea con promoción no "cambió de precio": vale menos porque
      -- el motor se lo bajó, y en dos líneas más se lo va a volver a
      -- bajar. Sólo se compara contra el precio que el vendedor vio.
      if v_precio_lista <> v_item.precio_unitario and v_item.origen_precio = 'LISTA' then
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
      -- Vuelve a precio de lista puro; el motor decide de nuevo abajo.
      origen_precio = case when v_item.precio_fijado_por_admin then 'FIJADO_POR_ADMIN'
                           else 'LISTA' end,
      promocion_ref = case when v_item.precio_fijado_por_admin then v_item.promocion_ref
                           else null end,
      afectacion_tributaria = v_afectacion,
      tasa_igv = v_tasa,
      subtotal = v_subtotal,
      igv = v_igv,
      total = v_total,
      updated_at = now()
    where id = v_item.id;
  end loop;

  -- Las promociones del catálogo, sobre los precios ya refrescados. El
  -- pedido sigue en DRAFT: el motor inserta y borra líneas.
  perform pedidos.aplicar_promociones(p_order_id);

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
