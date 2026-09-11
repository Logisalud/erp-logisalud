-- Descartar un pedido en borrador.
--
-- Hasta acá `orders` no tenía ninguna policy de DELETE, y con RLS activado
-- eso significa que nadie podía borrar nada: los borradores abandonados se
-- acumulaban en la lista del vendedor y el único que podía limpiarlos era
-- alguien entrando a la base a mano.
--
-- El permiso es exactamente el mismo que ya rige para EDITAR el borrador
-- (`orders_update_draft`): el vendedor dueño o un administrador, y solo
-- mientras el pedido esté en DRAFT. Un pedido enviado no se borra nunca —
-- ya salió por correo y tiene número, así que borrarlo dejaría a la oficina
-- con un correo que no corresponde a nada. Para eso están los estados de
-- excepción, no el DELETE.
--
-- Las líneas, observaciones, historial y solicitudes de aprobación se van
-- solas: sus FK a `orders` son `on delete cascade`. `fulfillments` es
-- `on delete restrict`, pero un borrador no puede tener despacho.
--
-- Un borrador no consume número de pedido (migración 1030), así que
-- descartarlo no deja hueco en la numeración.

drop policy if exists orders_delete_draft on pedidos.orders;

create policy orders_delete_draft
  on pedidos.orders
  for delete
  to authenticated
  using (
    estado = 'DRAFT'
    and (
      pedidos.is_admin()
      or (pedidos.has_role('vendedor') and seller_id = pedidos.current_seller_id())
    )
  );
