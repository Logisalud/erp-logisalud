-- 1058 — Bonificar algo que no está en el pedido.
--
-- El panetón de Intipharma (BOI000) es el caso que lo trajo: se regala en
-- la campaña de fin de año y no se vende nunca, así que no tiene precio de
-- lista. Un producto sin precio no se puede agregar a un pedido —el
-- buscador lo muestra bloqueado, porque no se puede valorizar— y la
-- bonificación manual de la 1021 **se marca sobre una línea que ya existe**.
-- Entre las dos cosas, el panetón no tenía forma de entrar a un pedido.
--
-- Esto agrega el camino que faltaba: poner una línea gratis de un producto
-- que NO está en el pedido, con su motivo.
--
-- POR QUÉ UNA FUNCIÓN NUEVA Y NO UN PARÁMETRO EN LA DE LA 1021
--
-- `marcar_bonificacion_manual` recibe un `order_item_id` y de ahí saca el
-- pedido y el producto. Acá no hay línea de la cual sacarlos: hay que
-- recibir los dos. Meterle un modo alternativo a la otra función habría
-- dejado dos ramas que comparten nombre y poco más, y la de la 1021 es la
-- que corre en todos los pedidos.
--
-- Lo que sí comparten es TODO lo que importa: la línea sale con
-- `origen_precio = 'BONIFICACION_MANUAL'` y `es_linea_gratis`, así que el
-- envío le crea su `approval_request` igual, el pedido cae igual en
-- COMMERCIAL_EXCEPTION cuando lo pide un vendedor, se rechaza igual
-- (borrando la línea) y se ve igual en el correo y en el Excel. No hay un
-- segundo mecanismo de bonificación: hay una segunda puerta al mismo.
--
-- EL PRECIO DE LISTA QUEDA EN CERO CUANDO NO HAY
--
-- En la 1021 el precio de lista se guarda en la línea gratis porque es
-- "cuánto se está regalando", el dato que mira el aprobador. Para el
-- panetón no existe: no tiene fila en ninguna lista de precios. Se guarda
-- 0 y el aprobador ve el motivo, que acá es lo único que hay para decidir.
-- Inventarle un precio sería peor: aparecería como un descuento de S/ X que
-- nadie acordó.

create or replace function pedidos.agregar_bonificacion_suelta(
  p_order_id uuid,
  p_product_id uuid,
  p_cantidad numeric,
  p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path to 'pedidos', 'public'
as $$
declare
  v_order record;
  v_producto record;
  v_es_admin boolean;
  v_motivo text;
  v_precio_lista numeric;
  v_existente uuid;
  v_id uuid;
  v_afectacion text;
  v_tasa numeric;
begin
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception 'La bonificación manual necesita un motivo';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad bonificada tiene que ser mayor que cero';
  end if;

  select o.* into v_order from pedidos.orders o where o.id = p_order_id;
  if not found then
    raise exception 'El pedido no existe';
  end if;
  if v_order.estado <> 'DRAFT' then
    raise exception 'Solo se puede agregar una bonificación mientras el pedido está en borrador';
  end if;

  v_es_admin := pedidos.is_admin();
  if not v_es_admin and v_order.creado_por <> auth.uid() then
    raise exception 'No autorizado para agregar bonificaciones en este pedido';
  end if;

  select p.* into v_producto from pedidos.products p where p.id = p_product_id;
  if not found then
    raise exception 'El producto no existe';
  end if;
  if v_producto.estado <> 'activo' then
    raise exception 'El producto % no está activo', v_producto.codigo_interno;
  end if;

  select tp.afectacion_tributaria, tp.tasa_aplicable into v_afectacion, v_tasa
  from pedidos.product_tax_profiles tp
  where tp.product_id = p_product_id and tp.vigente_hasta is null;
  if v_afectacion is null then
    raise exception 'Sin perfil tributario vigente para el producto %', v_producto.codigo_interno;
  end if;

  -- Si el producto tiene precio en el canal del cliente, se guarda: es
  -- cuánto se está regalando. Si no tiene —el caso del panetón—, cero.
  select pli.precio into v_precio_lista
  from pedidos.price_list_items pli
  join pedidos.customers c on c.id = v_order.customer_id
  where pli.product_id = p_product_id
    and pli.sales_channel_id = c.canal_id
    and pli.vigente_hasta is null;
  v_precio_lista := coalesce(v_precio_lista, 0);

  -- Una sola línea manual por producto, igual que en la 1021: volver a
  -- agregarlo corrige la cantidad en vez de apilar otra línea gratis.
  select oi.id into v_existente
  from pedidos.order_items oi
  where oi.order_id = p_order_id
    and oi.product_id = p_product_id
    and oi.origen_precio = 'BONIFICACION_MANUAL'
  limit 1;

  if v_existente is not null then
    update pedidos.order_items set
      cantidad = p_cantidad,
      motivo_precio_especial = v_motivo,
      precio_unitario = 0,
      precio_lista_original = v_precio_lista,
      afectacion_tributaria = v_afectacion,
      tasa_igv = v_tasa,
      subtotal = 0,
      igv = 0,
      total = 0,
      updated_at = now()
    where id = v_existente;

    delete from pedidos.approval_requests
    where order_item_id = v_existente and estado = 'PENDIENTE';

    v_id := v_existente;
  else
    insert into pedidos.order_items (
      order_id, product_id, cantidad, precio_unitario, precio_lista_original,
      motivo_precio_especial, afectacion_tributaria, tasa_igv,
      subtotal, igv, total, origen_precio, es_linea_gratis)
    values (
      p_order_id, p_product_id, p_cantidad, 0, v_precio_lista,
      v_motivo, v_afectacion, v_tasa,
      0, 0, 0, 'BONIFICACION_MANUAL', true)
    returning id into v_id;
  end if;

  return jsonb_build_object(
    'orderId', p_order_id,
    'orderItemId', v_id,
    'productId', p_product_id,
    'codigoInterno', v_producto.codigo_interno,
    'cantidad', p_cantidad,
    'precioLista', v_precio_lista,
    'motivo', v_motivo,
    'requiereAprobacion', not v_es_admin);
end;
$$;

revoke all on function pedidos.agregar_bonificacion_suelta(uuid, uuid, numeric, text) from public;
grant execute on function pedidos.agregar_bonificacion_suelta(uuid, uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- El panetón, que estaba creado pero apagado
-- ---------------------------------------------------------------------
-- BOI000 "PANETON INTIPHARMA 900G" se cargó en algún momento y quedó en
-- `inactivo`, así que no aparecía ni como bloqueado. Ya tiene su perfil
-- tributario (GRAVADO 18%) desde entonces.
update pedidos.products
   set estado = 'activo', updated_at = now()
 where codigo_interno = 'BOI000' and estado <> 'activo';
