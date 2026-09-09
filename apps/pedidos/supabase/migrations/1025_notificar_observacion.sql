-- 1025 — Un tipo de aviso más: la observación agregada a un pedido ya enviado.
--
-- El correo del pedido sale al enviarlo, así que una observación escrita
-- DESPUÉS ("entregar el lunes a las 2") no llegaba a ninguna bandeja: se
-- quedaba en la pantalla del pedido, que la oficina no mira. Ahora sale
-- como un aviso corto dentro del MISMO hilo de correo del pedido.
--
-- Mientras el pedido sigue en DRAFT no se avisa nada: la observación va a
-- salir en el correo de envío, que es el que lleva el detalle completo.
alter table pedidos.notification_logs
  drop constraint if exists notification_logs_tipo_check;

alter table pedidos.notification_logs
  add constraint notification_logs_tipo_check
  check (tipo in ('pedido_enviado', 'descuento_solicitado', 'descuento_resuelto',
                  'observacion_agregada'));
