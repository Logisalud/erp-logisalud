-- Confirmación de despacho: READY_FOR_OPERATIONS -> DISPATCHED.
--
-- Igual que el resto del workflow (0036), la autoridad real vive acá en
-- SQL y no en la capa de servicio: la función es SECURITY DEFINER y hace
-- su propia verificación de rol, así que la garantía se sostiene incluso
-- si alguien llama el RPC directamente sin pasar por la app.
-- domain/fulfillment.ts es un espejo en TypeScript para dar feedback en
-- la UI y tests rápidos sin Postgres — si divergen, gana SQL.

begin;

-- ---------------------------------------------------------------------
-- 1. Habilitar la transición a DISPATCHED
-- ---------------------------------------------------------------------

create or replace function pedidos.apply_order_transition(p_order_id uuid, p_estado_nuevo text, p_motivo text)
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
    -- Nuevo: Operaciones despacha. Es un estado terminal por ahora — de
    -- DISPATCHED no sale ninguna transición hasta que exista anulación
    -- de despacho, que hoy no está en alcance.
    or (v_order.estado = 'READY_FOR_OPERATIONS' and p_estado_nuevo = 'DISPATCHED'
      and (pedidos.is_admin() or pedidos.has_role('operaciones')))
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

-- ---------------------------------------------------------------------
-- 2. Confirmar despacho
-- ---------------------------------------------------------------------

-- p_items: array de objetos
--   { orderItemId, cantidadPreparada, lote, fechaVencimiento,
--     motivoDiferencia, pendienteDeStock, comentarioStock }
--
-- Todo o nada: si una sola línea no cumple, no se crea el despacho ni se
-- mueve el pedido.
create or replace function pedidos.confirm_dispatch(
  p_order_id uuid,
  p_inventory_source_id smallint,
  p_warehouse_id smallint,
  p_vehicle_id smallint,
  p_driver_id smallint,
  p_transporter_id smallint,
  p_items jsonb,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = pedidos, public
as $$
declare
  v_order record;
  v_fulfillment_id uuid;
  v_item jsonb;
  v_order_item record;
  v_product record;
  v_cantidad numeric;
  v_lote text;
  v_vencimiento date;
  v_motivo_dif text;
  v_pendiente boolean;
  v_comentario text;
  v_items_esperados integer;
  v_items_recibidos integer;
  v_diferencias jsonb := '[]'::jsonb;
begin
  if not (pedidos.is_admin() or pedidos.has_role('operaciones')) then
    raise exception 'Solo Operaciones o un administrador pueden confirmar un despacho';
  end if;

  select * into v_order from pedidos.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'Pedido % no existe', p_order_id;
  end if;
  if v_order.estado <> 'READY_FOR_OPERATIONS' then
    raise exception 'Solo se puede despachar un pedido en READY_FOR_OPERATIONS (este está en %)', v_order.estado;
  end if;

  -- Caso legacy: desde Fase 4 un pedido no puede enviarse sin dirección
  -- de entrega activa, así que todo lo que llegue acá ya debería tenerla.
  -- Si un pedido viejo se colara, se bloquea con un mensaje que dice qué
  -- hacer, en vez de despachar a ninguna parte.
  if not exists (
    select 1 from pedidos.customer_addresses ca
    where ca.id = v_order.customer_address_id and ca.estado = 'activo'
  ) then
    raise exception 'El pedido no tiene una dirección de entrega activa; registra o reactiva la dirección del cliente antes de preparar el despacho';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No se recibió ninguna línea preparada';
  end if;

  select count(*) into v_items_esperados from pedidos.order_items where order_id = p_order_id;
  v_items_recibidos := jsonb_array_length(p_items);
  if v_items_recibidos <> v_items_esperados then
    raise exception 'Se esperaban % líneas del pedido y se recibieron %', v_items_esperados, v_items_recibidos;
  end if;

  insert into pedidos.fulfillments (
    order_id, inventory_source_id, warehouse_id,
    vehicle_id, driver_id, transporter_id,
    estado, fecha_despacho, usuario_confirmo
  ) values (
    p_order_id, p_inventory_source_id, p_warehouse_id,
    p_vehicle_id, p_driver_id, p_transporter_id,
    'DESPACHADO', now(), auth.uid()
  )
  returning id into v_fulfillment_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select oi.*, p.controla_lote, p.controla_vencimiento, p.descripcion, p.codigo_interno
      into v_order_item
    from pedidos.order_items oi
    join pedidos.products p on p.id = oi.product_id
    where oi.id = (v_item->>'orderItemId')::uuid
      and oi.order_id = p_order_id;

    if v_order_item is null then
      raise exception 'La línea % no pertenece a este pedido', v_item->>'orderItemId';
    end if;

    v_cantidad := coalesce((v_item->>'cantidadPreparada')::numeric, 0);
    v_lote := nullif(btrim(coalesce(v_item->>'lote', '')), '');
    v_vencimiento := nullif(btrim(coalesce(v_item->>'fechaVencimiento', '')), '')::date;
    v_motivo_dif := nullif(btrim(coalesce(v_item->>'motivoDiferencia', '')), '');
    v_pendiente := coalesce((v_item->>'pendienteDeStock')::boolean, false);
    v_comentario := nullif(btrim(coalesce(v_item->>'comentarioStock', '')), '');

    if v_cantidad < 0 then
      raise exception '% : la cantidad preparada no puede ser negativa', v_order_item.codigo_interno;
    end if;

    -- Diferencia contra lo pedido exige motivo, y queda registrada.
    if v_cantidad <> v_order_item.cantidad then
      if v_motivo_dif is null then
        raise exception '% : la cantidad preparada (%) difiere de la pedida (%); indica el motivo',
          v_order_item.codigo_interno, v_cantidad, v_order_item.cantidad;
      end if;
      v_diferencias := v_diferencias || jsonb_build_object(
        'orderItemId', v_order_item.id,
        'codigo', v_order_item.codigo_interno,
        'cantidadPedida', v_order_item.cantidad,
        'cantidadPreparada', v_cantidad,
        'motivo', v_motivo_dif
      );
    end if;

    if v_order_item.controla_lote and v_lote is null then
      raise exception '% : este producto controla lote; captura el lote antes de confirmar el despacho',
        v_order_item.codigo_interno;
    end if;

    if v_order_item.controla_vencimiento and v_vencimiento is null then
      raise exception '% : este producto controla vencimiento; captura la fecha de vencimiento antes de confirmar el despacho',
        v_order_item.codigo_interno;
    end if;

    if v_pendiente and v_comentario is null then
      raise exception '% : una línea marcada como pendiente de stock necesita un comentario',
        v_order_item.codigo_interno;
    end if;

    insert into pedidos.fulfillment_items (
      fulfillment_id, order_item_id, cantidad_preparada,
      lote, fecha_vencimiento, motivo_diferencia,
      pendiente_de_stock, comentario_stock
    ) values (
      v_fulfillment_id, v_order_item.id, v_cantidad,
      v_lote, v_vencimiento, v_motivo_dif,
      v_pendiente, v_comentario
    );
  end loop;

  perform pedidos.apply_order_transition(p_order_id, 'DISPATCHED', coalesce(p_motivo, 'Despacho confirmado'));

  -- TODO Fase 6 — documentación electrónica: ESTE es el punto donde se
  -- dispara la generación de GRE (guía de remisión) y del comprobante
  -- (factura o boleta, según customers.tipo_comprobante_permitido) vía
  -- NubeFact. Va después de que el despacho quedó grabado y el pedido
  -- pasó a DISPATCHED, para que un fallo del proveedor no revierta un
  -- despacho físico ya hecho — el mismo criterio que la notificación por
  -- correo al enviar (ver services/order-notifications.ts). La emisión
  -- debe quedar registrada con su estado propio, reintentable.
  -- Ver docs/business-rules.md.

  return jsonb_build_object(
    'fulfillmentId', v_fulfillment_id,
    'diferencias', v_diferencias
  );
end;
$$;

revoke all on function pedidos.confirm_dispatch(uuid, smallint, smallint, smallint, smallint, smallint, jsonb, text) from public;
grant execute on function pedidos.confirm_dispatch(uuid, smallint, smallint, smallint, smallint, smallint, jsonb, text) to authenticated;

commit;
