-- El ancla del hilo es el Message-ID REAL de Resend, no uno propio.
--
-- La implementación anterior (1013) generaba un Message-ID nuestro y lo
-- mandaba en los headers. Comprobado contra el encabezado real de un
-- correo recibido en Outlook: **Resend reescribe el Message-ID de salida**
-- con su propio formato (`@…amazonses.com`) e ignora el valor
-- personalizado. `In-Reply-To` y `References`, en cambio, sí se respetan
-- tal cual se envían.
--
-- Consecuencia: el correo 2 referenciaba un id que nunca existió en el
-- correo 1, así que ningún cliente podía enlazarlos — exactamente el
-- síntoma reportado.
--
-- Ahora el Message-ID se LEE después de enviar, con GET /emails/{id} (la
-- respuesta de la API trae `message_id`), y se guarda ese. No hay cambio
-- de estructura: cambia qué valor va en las mismas dos columnas.

comment on column pedidos.orders.email_thread_message_id is
  'Message-ID REAL que Resend le asignó al primer correo del pedido (con ángulos): el ancla del hilo. Se lee con GET /emails/{id} después de enviar, porque Resend reescribe el Message-ID de salida e ignora cualquier valor propio. Los avisos siguientes lo referencian en In-Reply-To/References.';

comment on column pedidos.notification_logs.message_id is
  'Message-ID REAL de Resend de este envío (distinto de proveedor_message_id, que es el id interno de la API y no sirve como In-Reply-To). Null si el correo estaba en cola al registrarse: el aviso siguiente lo resuelve desde proveedor_message_id.';

-- ---------------------------------------------------------------------
-- Limpieza de los ids fabricados que quedaron de 1013
-- ---------------------------------------------------------------------

-- Se distinguen sin ambigüedad por el prefijo `<pedido-N.`, que era el
-- formato que armábamos nosotros. Dejarlos sería peor que no tener nada:
-- son referencias a correos que nadie recibió con ese id.
--
-- No se pierde el hilo: `proveedor_message_id` sigue guardado en cada
-- fila, así que el próximo aviso del pedido resuelve el Message-ID real
-- contra la API y reconstruye la cadena.
update pedidos.notification_logs
set message_id = null
where message_id like '<pedido-%';

update pedidos.orders
set email_thread_message_id = null
where email_thread_message_id like '<pedido-%';
