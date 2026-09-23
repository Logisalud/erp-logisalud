-- Decidir un descuento de un pedido que sigue en DRAFT ya no rompe la pantalla.
--
-- Error real en producción (2026-09-23, 17:01):
--   Transición DRAFT -> READY_FOR_OPERATIONS no permitida para este usuario/estado
-- La pantalla /aprobador-comercial se caía entera, y con ella las OTRAS
-- solicitudes pendientes, que no tenían nada que ver.
--
-- Cómo se llegó: el vendedor arma el borrador, pide precio especial (eso crea
-- la solicitud con el pedido todavía en DRAFT) y recién después toca "Enviar
-- pedido". Esa ventana siempre existió, pero duraba segundos. Desde la
-- migración 1040 el pedido no sale sin celular del cliente, así que un
-- borrador puede quedar parado indefinidamente con su solicitud pendiente —
-- y ahí el aprobador se la encuentra y la aprueba.
--
-- Qué estaba mal: al aprobar, decide_approval_request llamaba a
-- reevaluate_order, que mueve el pedido a READY_FOR_OPERATIONS; y al
-- rechazar, lo mandaba a DRAFT. Las dos transiciones parten de que el pedido
-- YA SE ENVIÓ. Sobre un borrador no tienen sentido y apply_order_transition
-- las rechaza, con razón.
--
-- Qué hace ahora: si el pedido sigue en DRAFT, la decisión se aplica sobre la
-- línea (el precio, la decisión registrada, la solicitud resuelta) y el
-- pedido NO se mueve. Es lo correcto: todavía no se envió, y cuando el
-- vendedor lo mande, submit_order lo evalúa entero de cero. Para un pedido ya
-- enviado no cambia nada.

do $migracion$
declare
  v_def text;
  v_nueva text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pedidos' and p.proname = 'decide_approval_request';

  if v_def is null then
    raise exception 'No existe pedidos.decide_approval_request';
  end if;

  v_nueva := v_def;

  -- 1. La variable donde guardar el estado del pedido.
  v_nueva := replace(v_nueva,
    E'  v_total numeric;\nbegin\n',
    E'  v_total numeric;\n  v_estado_pedido text;\nbegin\n');

  -- 2. Leerlo junto con la línea.
  v_nueva := replace(v_nueva,
    E'  select * into v_item from pedidos.order_items where id = v_item_id;\n',
    E'  select * into v_item from pedidos.order_items where id = v_item_id;\n\n'
    || E'  -- Si el pedido sigue en DRAFT no hay nada que mover: todavia no se envio.\n'
    || E'  -- La decision queda aplicada sobre la linea y submit_order evalua el pedido\n'
    || E'  -- entero cuando el vendedor lo mande.\n'
    || E'  select estado into v_estado_pedido from pedidos.orders where id = v_order_id;\n');

  -- 3. Aprobar: reevaluar solo si el pedido ya salió.
  v_nueva := replace(v_nueva,
    E'    perform pedidos.reevaluate_order(v_order_id, \'Solicitud de descuento aprobada\');\n',
    E'    if v_estado_pedido <> \'DRAFT\' then\n'
    || E'      perform pedidos.reevaluate_order(v_order_id, \'Solicitud de descuento aprobada\');\n'
    || E'    end if;\n');

  -- 4. Rechazar: devolver a DRAFT solo si no estaba ya ahí.
  v_nueva := replace(v_nueva,
    E'    perform pedidos.apply_order_transition(\n      v_order_id, \'DRAFT\',\n      \'Solicitud de descuento rechazada: \' || coalesce(p_comentario, \'\'));\n',
    E'    if v_estado_pedido <> \'DRAFT\' then\n'
    || E'      perform pedidos.apply_order_transition(\n'
    || E'        v_order_id, \'DRAFT\',\n'
    || E'        \'Solicitud de descuento rechazada: \' || coalesce(p_comentario, \'\'));\n'
    || E'    end if;\n');

  if v_nueva = v_def then
    raise exception 'decide_approval_request no tiene los bloques esperados: revisar antes de aplicar';
  end if;
  if position('v_estado_pedido' in v_nueva) = 0 then
    raise exception 'La variable v_estado_pedido no quedo declarada: revisar';
  end if;

  execute v_nueva;
end
$migracion$;
