-- Un pedido, un hilo de correo.
--
-- Los tres avisos de un pedido (enviado, cae en excepción comercial, se
-- resuelve la excepción) llegaban como tres conversaciones separadas. Para
-- que un cliente de correo los agrupe hacen falta los encabezados
-- Message-ID / In-Reply-To / References (RFC 5322), y para eso hay que
-- guardar el id del primer correo: es el ancla del hilo.
--
-- El Message-ID lo genera la aplicación (domain/email-threading.ts) y no
-- se lee del proveedor: la API de Resend al enviar devuelve sólo su id
-- interno, no el Message-ID del correo.

alter table pedidos.orders
  add column if not exists email_thread_message_id text;

comment on column pedidos.orders.email_thread_message_id is
  'Message-ID (RFC 5322, con ángulos) del PRIMER correo del pedido: el ancla del hilo. Los avisos siguientes lo referencian para que el cliente de correo los agrupe. Null si todavía no salió ningún correo.';

-- El historial completo de mensajes del hilo vive en notification_logs,
-- que ya tiene una fila por envío: sólo faltaba guardar con qué
-- Message-ID salió cada uno para poder armar la cadena de References.
alter table pedidos.notification_logs
  add column if not exists message_id text;

comment on column pedidos.notification_logs.message_id is
  'Message-ID que pusimos en el correo (distinto de proveedor_message_id, que es el id interno de Resend). La cadena de References de un aviso nuevo se arma con estos, en orden de envío.';

-- El asunto base NO se guarda: se recalcula del número del pedido y de la
-- razón social del snapshot, que quedan fijos al enviarse. Una columna más
-- sería otro lugar donde el dato puede quedar desincronizado.

-- La cadena se lee por pedido y en orden de envío en cada notificación.
create index if not exists notification_logs_order_fecha_idx
  on pedidos.notification_logs (order_id, created_at);
