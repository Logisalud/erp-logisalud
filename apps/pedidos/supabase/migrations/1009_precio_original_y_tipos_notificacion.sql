-- Dos cosas que el flujo de excepción comercial necesitaba y no tenía.

-- 1) El precio de lista se perdía al aprobar un descuento.
--
-- decide_approval_request sobrescribe order_items.precio_unitario con el
-- precio aprobado, y order_items no guarda de dónde venía. Después de
-- aprobar, el precio de lista ya no existe en ninguna parte: ni el correo ni
-- el Excel pueden mostrar "antes S/ 80.00, ahora S/ 2.00" porque el 80 se
-- fue. Se captura en la solicitud, que es el momento en que todavía se sabe.
--
-- Nullable a propósito: las solicitudes que ya existen no pueden recuperar su
-- precio original, y el correo lo muestra sólo cuando está.
alter table pedidos.approval_requests
  add column if not exists precio_original numeric(12, 4);

comment on column pedidos.approval_requests.precio_original is
  'Precio unitario del ítem cuando se pidió el descuento (el de lista del canal). Se graba al crear la solicitud porque al aprobarla order_items.precio_unitario se sobrescribe. Null en solicitudes anteriores a esta columna.';

-- 2) notification_logs sólo admitía un tipo de aviso.
--
-- El CHECK fijaba tipo = 'pedido_enviado', así que no se podía registrar el
-- correo de la excepción comercial ni el de su resolución: el insert del log
-- reventaba. Se amplía a los tres tipos que hoy manda el sistema.
--
-- Ampliar un CHECK es seguro sobre la tabla llena (el conjunto nuevo contiene
-- al viejo), pero igual se hace drop + add porque Postgres no permite
-- redefinirlo en un solo paso.
alter table pedidos.notification_logs
  drop constraint if exists notification_logs_tipo_check;

alter table pedidos.notification_logs
  add constraint notification_logs_tipo_check
  check (tipo in ('pedido_enviado', 'descuento_solicitado', 'descuento_resuelto'));
