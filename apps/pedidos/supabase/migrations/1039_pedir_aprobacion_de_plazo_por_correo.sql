-- Un pedido frenado por plazo tiene que PEDIR la aprobación por correo.
--
-- Hasta acá, un pedido que caía en excepción administrativa mandaba el
-- correo genérico de "pedido enviado": el estado aparecía en letra chica
-- ("Estado: Excepción administrativa") y nada decía que había algo que
-- decidir. Los otros dos frenos sí avisan bien —el cliente nuevo saca un
-- recuadro ámbar "hay que revisarlo y aprobarlo", y el descuento saca
-- "Descuento por aprobar"—, así que Administración era la única que tenía
-- que darse cuenta sola mirando la bandeja.
--
-- Acá va la mitad de base: `submit_order` devuelve el motivo que calculó,
-- para que el correo pueda decir los números concretos ("pide 60 días y el
-- cliente tiene 30 aprobados") en vez de que la aplicación vuelva a
-- calcular la regla por su cuenta y las dos se desincronicen.
--
-- La otra mitad es el correo nuevo, en services/order-notifications.ts.

begin;

-- El pedido de aprobación de plazo es un tipo de notificación nuevo.
alter table pedidos.notification_logs drop constraint if exists notification_logs_tipo_check;
alter table pedidos.notification_logs add constraint notification_logs_tipo_check
  check (tipo = any (array[
    'pedido_enviado', 'descuento_solicitado', 'descuento_resuelto',
    'observacion_agregada', 'cliente_aprobado', 'cliente_rechazado',
    'excepcion_administrativa_resuelta', 'aprobacion_plazo_solicitada'
  ]));

-- El cuerpo se copio de produccion y se verifico por md5 (9c4e5f62...)
-- antes de tocarlo. Lo unico que cambia es el jsonb de retorno.

create or replace function pedidos.submit_order(p_order_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = pedidos, public
as $fn$
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
  v_dias_pedido int;
  v_dias_habitual int;
  v_motivo text := 'Validacion automatica';
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
    -- La linea gratis la genera el motor de promociones o la marca una
    -- persona: refrescarle el precio de lista seria cobrarla.
    if v_item.es_linea_gratis then
      continue;
    end if;

    select pli.precio into v_precio_lista
    from pedidos.price_list_items pli
    where pli.product_id = v_item.product_id
      and pli.sales_channel_id = v_customer.canal_id
      and pli.vigente_hasta is null;

    -- Una bonificacion se entrega gratis y casi nunca tiene precio propio en
    -- la lista del canal. Antes de este cambio, el envio entero reventaba
    -- por una linea de bonificacion cargada a mano: aca vale S/ 0.00
    -- explicito. Para cualquier otro producto, sin precio no hay pedido.
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

    -- Un precio que fijo el administrador se respeta: es una decision, no
    -- un borrador desactualizado. Igual se refresca el precio de lista de
    -- referencia, para que el correo y el Excel comparen contra el vigente.
    if v_item.precio_fijado_por_admin then
      v_precio := v_item.precio_unitario;
    else
      v_precio := v_precio_lista;
      -- Una linea con promocion no "cambio de precio": vale menos porque
      -- el motor se lo bajo, y en dos lineas mas se lo va a volver a
      -- bajar. Solo se compara contra el precio que el vendedor vio.
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

  -- Una bonificacion manual es un descuento del 100%: mas grande que
  -- cualquier precio especial. Si la marco un vendedor, pasa por el mismo
  -- control -una solicitud por linea- y el pedido no avanza hasta que
  -- alguien decida. Si la marco un administrador, se aplica directo: es la
  -- misma autoridad que ya tiene para fijar precio.
  --
  -- La solicitud se crea aca, en el envio, y no al marcar la linea: hasta
  -- que el pedido no se envia no hay nada que aprobar, y el vendedor puede
  -- corregir la cantidad las veces que quiera sin generar ruido en la
  -- bandeja del aprobador.
  if not pedidos.is_admin() then
    insert into pedidos.approval_requests (
      order_id, order_item_id, solicitado_por, precio_solicitado, cantidad, motivo, precio_original)
    select p_order_id, oi.id, coalesce(auth.uid(), v_order.creado_por), 0, oi.cantidad,
           'Bonificación manual (100% de descuento): ' || coalesce(oi.motivo_precio_especial, 'sin motivo'),
           oi.precio_lista_original
    from pedidos.order_items oi
    where oi.order_id = p_order_id
      and oi.origen_precio = 'BONIFICACION_MANUAL'
      and not exists (
        select 1 from pedidos.approval_requests ar where ar.order_item_id = oi.id);
  end if;

  -- Las promociones del catalogo, sobre los precios ya refrescados. El
  -- pedido sigue en DRAFT: el motor inserta y borra lineas.
  perform pedidos.aplicar_promociones(p_order_id);

  update pedidos.orders set
    -- Un pedido que vuelve a borrador y se reenvia se juzga desde cero: la
    -- aprobacion anterior era sobre el pedido anterior.
    excepcion_administrativa_aprobada_por = null,
    excepcion_administrativa_aprobada_en = null,
    razon_social_snapshot = v_customer.razon_social,
    direccion_snapshot = (select direccion from pedidos.customer_addresses where id = v_order.customer_address_id),
    ubigeo_snapshot = (select ubigeo from pedidos.customer_addresses where id = v_order.customer_address_id),
    canal_snapshot = (select nombre from pedidos.sales_channels where id = v_customer.canal_id),
    zona_snapshot = (select nombre from pedidos.zones where id = v_customer.zona_id),
    vendedor_snapshot = (select nombre_completo from pedidos.sellers where id = v_order.seller_id)
  where id = p_order_id;

  perform pedidos.apply_order_transition(p_order_id, 'SUBMITTED', p_motivo);

  -- Dias de plazo, para poder comparar "mas" y no solo "distinto".
  v_dias_pedido := pedidos.dias_de_condicion(
    v_order.payment_terms_id, v_order.dias_credito_solicitados);
  v_dias_habitual := pedidos.dias_de_condicion(
    v_customer.condicion_pago_habitual_id, null);

  if v_customer.estado = 'PENDIENTE_DE_VALIDACION' then
    v_estado_resultado := 'NEW_CUSTOMER_VALIDATION';
  -- Excepcion administrativa SOLO si se pide MAS plazo del aprobado.
  -- Pedir menos -o contado, que son 0 dias- nunca frena un pedido: es una
  -- concesion a favor de la empresa. Ver docs/business-rules.md.
  elsif v_dias_habitual is not null
        and v_dias_pedido is not null
        and v_dias_pedido > v_dias_habitual then
    v_estado_resultado := 'ADMINISTRATIVE_EXCEPTION';
    v_motivo := format('Pide %s días de plazo y el cliente tiene %s aprobados',
                       v_dias_pedido, v_dias_habitual);
  -- Una condicion sin dias conocidos no se puede verificar: la mira una
  -- persona en vez de pasar por no poder compararla.
  elsif v_dias_habitual is not null and v_dias_pedido is null then
    v_estado_resultado := 'ADMINISTRATIVE_EXCEPTION';
    v_motivo := 'No se pudo determinar cuántos días de plazo pide el pedido';
  elsif exists (
    select 1 from pedidos.approval_requests ar
    join pedidos.order_items oi on oi.id = ar.order_item_id
    where oi.order_id = p_order_id and ar.estado = 'PENDIENTE'
  ) then
    v_estado_resultado := 'COMMERCIAL_EXCEPTION';
    v_motivo := 'Queda un descuento por aprobar';
  else
    v_estado_resultado := 'READY_FOR_OPERATIONS';
  end if;

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, v_motivo);

  -- El motivo sale en la respuesta para que el correo pueda decir POR QUE
  -- se freno el pedido con los numeros concretos, en vez de repetir la
  -- regla desde la aplicacion y arriesgarse a que se desincronicen.
  return jsonb_build_object('estadoResultado', v_estado_resultado,
                            'motivo', v_motivo,
                            'priceDrift', v_drift);
end;
$fn$;

commit;
