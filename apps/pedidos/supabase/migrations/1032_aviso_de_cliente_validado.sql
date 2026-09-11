-- Aviso por correo cuando Control de Pedidos aprueba (o rechaza) un cliente.
--
-- Hasta ahora el vendedor registraba el cliente y no se enteraba nunca de
-- qué pasó con él: tenía que volver a la pantalla a probar. Y aprobar un
-- cliente no es un trámite aislado — destraba los pedidos que estaban
-- esperándolo, o los devuelve a borrador si se rechaza.
--
-- `notification_logs.order_id` ya era nullable, así que un aviso que no es
-- de un pedido entra sin tocar la tabla; lo que faltaba era poder decir de
-- QUÉ cliente es.

alter table pedidos.notification_logs
  add column if not exists customer_id uuid references pedidos.customers(id) on delete set null;

alter table pedidos.notification_logs
  drop constraint if exists notification_logs_tipo_check;

alter table pedidos.notification_logs
  add constraint notification_logs_tipo_check check (
    tipo = any (array[
      'pedido_enviado',
      'descuento_solicitado',
      'descuento_resuelto',
      'observacion_agregada',
      'cliente_aprobado',
      'cliente_rechazado'
    ])
  );

create index if not exists notification_logs_customer_idx
  on pedidos.notification_logs (customer_id);
