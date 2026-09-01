-- decide_approval_request: que APROBAR aplique de verdad el precio pedido.
--
-- Bug encontrado en producción con el pedido #22: el vendedor pidió S/ 2.00
-- para un ítem de S/ 80.00, el aprobador eligió APROBAR, la solicitud quedó
-- RESUELTA, el pedido avanzó a READY_FOR_OPERATIONS... y el ítem siguió
-- costando S/ 80.00. El descuento se "aprobaba" sin aplicarse: el vendedor
-- creía haber vendido a S/ 2.00 y al cliente se le iba a facturar S/ 400.
--
-- La causa: sólo la rama APROBAR_OTRO_PRECIO escribía en order_items.
-- APROBAR marcaba la solicitud como resuelta y desbloqueaba el pedido sin
-- tocar el precio.
--
-- Ahora las dos ramas calculan un precio efectivo y lo aplican con la misma
-- aritmética de IGV:
--   APROBAR              -> lo que pidió el vendedor (precio, o el
--                           porcentaje aplicado sobre el precio del ítem;
--                           el formulario acepta cualquiera de los dos).
--   APROBAR_OTRO_PRECIO  -> el precio que puso el aprobador.
--
-- Ese precio efectivo además queda grabado en approval_decisions.precio_aprobado,
-- que hasta ahora quedaba en null cuando se elegía APROBAR — o sea que ni
-- siquiera en la auditoría se podía ver a cuánto se había aprobado.
--
-- APROBAR_OTRO_PRECIO sin precio pasa a ser un error explícito en vez de
-- resolver la solicitud dejando el precio original.

create or replace function pedidos.decide_approval_request(
  p_request_id uuid,
  p_decision text,
  p_precio_aprobado numeric,
  p_comentario text
)
returns void
language plpgsql
security definer
set search_path to 'pedidos', 'public'
as $function$
declare
  v_order_id uuid;
  v_item_id uuid;
  v_precio_solicitado numeric;
  v_porcentaje numeric;
  v_item record;
  v_precio_efectivo numeric;
  v_igv numeric;
  v_subtotal numeric;
  v_total numeric;
begin
  if not (pedidos.is_admin() or pedidos.has_role('aprobador_comercial')) then
    raise exception 'Rol no autorizado para decidir solicitudes de descuento';
  end if;

  select order_id, order_item_id, precio_solicitado, porcentaje_descuento
    into v_order_id, v_item_id, v_precio_solicitado, v_porcentaje
  from pedidos.approval_requests
  where id = p_request_id and estado = 'PENDIENTE'
  for update;

  if v_order_id is null then
    raise exception 'Solicitud % no existe o ya fue resuelta', p_request_id;
  end if;

  if p_decision in ('APROBAR', 'APROBAR_OTRO_PRECIO') then
    select * into v_item from pedidos.order_items where id = v_item_id;

    if p_decision = 'APROBAR_OTRO_PRECIO' then
      if p_precio_aprobado is null then
        raise exception 'APROBAR_OTRO_PRECIO requiere un precio aprobado';
      end if;
      v_precio_efectivo := p_precio_aprobado;
    elsif v_precio_solicitado is not null then
      v_precio_efectivo := v_precio_solicitado;
    elsif v_porcentaje is not null then
      v_precio_efectivo := round(v_item.precio_unitario * (1 - v_porcentaje / 100), 4);
    else
      raise exception 'La solicitud % no indica precio ni porcentaje: no hay nada que aprobar', p_request_id;
    end if;

    -- El precio efectivo viene con IGV incluido, igual que el de lista.
    v_total := round(v_item.cantidad * v_precio_efectivo, 2);
    v_subtotal := case when v_item.afectacion_tributaria = 'GRAVADO'
                       then round(v_total / (1 + v_item.tasa_igv / 100), 2)
                       else v_total end;
    v_igv := round(v_total - v_subtotal, 2);

    update pedidos.order_items set
      precio_unitario = v_precio_efectivo,
      subtotal = v_subtotal,
      igv = v_igv,
      total = v_total,
      updated_at = now()
    where id = v_item_id;

    insert into pedidos.approval_decisions
      (approval_request_id, decidido_por, decision, precio_aprobado, comentario)
    values (p_request_id, auth.uid(), p_decision, v_precio_efectivo, p_comentario);

    update pedidos.approval_requests set estado = 'RESUELTO' where id = p_request_id;

    perform pedidos.reevaluate_order(v_order_id, 'Solicitud de descuento aprobada');

  elsif p_decision = 'RECHAZAR' then
    insert into pedidos.approval_decisions
      (approval_request_id, decidido_por, decision, precio_aprobado, comentario)
    values (p_request_id, auth.uid(), p_decision, null, p_comentario);

    update pedidos.approval_requests set estado = 'RESUELTO' where id = p_request_id;
    perform pedidos.apply_order_transition(
      v_order_id, 'DRAFT',
      'Solicitud de descuento rechazada: ' || coalesce(p_comentario, ''));

  else
    -- SOLICITAR_INFO: no cambia el estado de nada; services/approvals.ts
    -- agrega el order_observations correspondiente por su cuenta.
    insert into pedidos.approval_decisions
      (approval_request_id, decidido_por, decision, precio_aprobado, comentario)
    values (p_request_id, auth.uid(), p_decision, p_precio_aprobado, p_comentario);
  end if;
end;
$function$;
