-- Un cliente sin condición de pago habitual definida NO debe caer en
-- excepción administrativa.
--
-- La bifurcación automática dispara ADMINISTRATIVE_EXCEPTION cuando la
-- condición de pago del pedido difiere de la habitual del cliente. Si el
-- cliente no tiene habitual (condicion_pago_habitual_id is null) no hay
-- nada con qué comparar, así que cualquier condición que elija el
-- vendedor es válida y el pedido debe seguir su curso normal.
--
-- Esto importa ahora porque la cartera real migrada (3.399 clientes)
-- entra con condicion_pago_habitual_id en null a propósito: el dato no
-- viene en el archivo de origen y se completará cliente por cliente.
-- Ver docs/business-rules.md.
--
-- Por qué esta migración no cambia el comportamiento observable en SQL,
-- y aun así hace falta:
--
--   `v_order.payment_terms_id <> v_customer.condicion_pago_habitual_id`
--
-- con la habitual en null evalúa a NULL, no a true, y un elsif trata
-- NULL como falso — así que hoy ya cae en READY_FOR_OPERATIONS. Pero eso
-- es un accidente de la lógica ternaria de Postgres, no una decisión
-- escrita: cualquiera que envuelva la condición en un coalesce, la
-- niegue, o la mueva a un CASE la rompe sin darse cuenta. Acá queda
-- explícita.
--
-- El espejo en TypeScript (domain/orders.ts) SÍ estaba mal: en JS
-- `5 !== null` es true, así que devolvía ADMINISTRATIVE_EXCEPTION y
-- divergía de lo que hace el servidor. Se corrige en el mismo commit.

begin;

create or replace function pedidos.submit_order(p_order_id uuid, p_motivo text)
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
$$;

create or replace function pedidos.reevaluate_order(p_order_id uuid, p_motivo text)
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
  -- Mismo criterio que submit_order: sin habitual, no hay excepción.
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

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, p_motivo);
  return v_estado_resultado;
end;
$$;

commit;
