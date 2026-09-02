-- El administrador fija precio sin pedirle permiso a nadie.
--
-- Hasta acá, cualquier precio distinto al de lista se cargaba como
-- solicitud de descuento (approval_requests) y frenaba el pedido en
-- COMMERCIAL_EXCEPTION hasta que alguien la resolviera. Para un vendedor
-- eso es el control que corresponde; para el administrador es pedirse
-- permiso a sí mismo.
--
-- Se agrega la otra vía: el precio se aplica directo a la línea, se marca
-- de dónde viene y se guarda contra qué precio se cambió. El pedido no
-- espera a nadie. La traza queda en pedidos.audit_logs (la escribe la capa
-- de servicio) y, para que se vea en el correo y en el Excel, también en
-- la línea misma.

alter table pedidos.order_items
  add column if not exists precio_fijado_por_admin boolean not null default false;

alter table pedidos.order_items
  add column if not exists precio_lista_original numeric(12, 4);

alter table pedidos.order_items
  add column if not exists motivo_precio_especial text;

comment on column pedidos.order_items.precio_fijado_por_admin is
  'true si un administrador fijó el precio de esta línea a mano. submit_order NO lo sobrescribe con el precio de lista vigente.';

comment on column pedidos.order_items.precio_lista_original is
  'Precio de lista del canal en el momento en que el administrador lo cambió. Sin esto, después del cambio no queda contra qué comparar.';

-- ---------------------------------------------------------------------
-- El RPC
-- ---------------------------------------------------------------------

-- SECURITY DEFINER con el chequeo de rol adentro: la autoridad es del rol
-- administrador, no de quien llame a la función. `is_admin()` mira los
-- roles reales del usuario de la sesión, así que una Server Action armada
-- a mano por un vendedor no puede usar este camino.
create or replace function pedidos.set_item_special_price(
  p_order_item_id uuid,
  p_precio numeric,
  p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path to 'pedidos', 'public'
as $$
declare
  v_item record;
  v_order record;
  v_tasa numeric;
  v_afectacion text;
  v_precio_lista numeric;
  v_total numeric;
  v_subtotal numeric;
  v_igv numeric;
begin
  if not pedidos.is_admin() then
    raise exception 'Solo un administrador puede fijar un precio especial directo';
  end if;

  if p_precio is null or p_precio <= 0 then
    raise exception 'El precio tiene que ser mayor que cero';
  end if;

  select * into v_item from pedidos.order_items where id = p_order_item_id;
  if v_item is null then
    raise exception 'La línea no existe';
  end if;

  select * into v_order from pedidos.orders where id = v_item.order_id for update;
  if v_order.estado <> 'DRAFT' then
    raise exception 'Solo se puede fijar el precio mientras el pedido está en borrador';
  end if;

  select tp.afectacion_tributaria, tp.tasa_aplicable into v_afectacion, v_tasa
  from pedidos.product_tax_profiles tp
  where tp.product_id = v_item.product_id and tp.vigente_hasta is null;

  if v_afectacion is null then
    raise exception 'Sin perfil tributario vigente para el producto %', v_item.product_id;
  end if;

  -- El precio de lista se guarda una sola vez: si el administrador corrige
  -- su propio precio especial dos veces, la referencia sigue siendo el
  -- precio de lista, no su intento anterior.
  v_precio_lista := coalesce(v_item.precio_lista_original, v_item.precio_unitario);

  -- Mismo desglose que submit_order: el precio incluye IGV, la base se
  -- deriva hacia atrás y el IGV sale por resta.
  v_total := round(v_item.cantidad * p_precio, 2);
  v_subtotal := case when v_afectacion = 'GRAVADO'
                     then round(v_total / (1 + v_tasa / 100), 2)
                     else v_total end;
  v_igv := round(v_total - v_subtotal, 2);

  update pedidos.order_items set
    precio_unitario = p_precio,
    precio_fijado_por_admin = true,
    precio_lista_original = v_precio_lista,
    motivo_precio_especial = nullif(btrim(coalesce(p_motivo, '')), ''),
    afectacion_tributaria = v_afectacion,
    tasa_igv = v_tasa,
    subtotal = v_subtotal,
    igv = v_igv,
    total = v_total,
    updated_at = now()
  where id = p_order_item_id;

  return jsonb_build_object(
    'orderId', v_item.order_id,
    'orderItemId', p_order_item_id,
    'precioAnterior', v_item.precio_unitario,
    'precioLista', v_precio_lista,
    'precioNuevo', p_precio,
    'total', v_total
  );
end;
$$;

revoke all on function pedidos.set_item_special_price(uuid, numeric, text) from public;
grant execute on function pedidos.set_item_special_price(uuid, numeric, text) to authenticated;
