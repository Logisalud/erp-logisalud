-- 1029 — Se vacía el historial de PEDIDOS para arrancar en producción.
--
-- Cierre de la etapa de pruebas: se probaron promociones, bonificación
-- manual, aprobaciones, despachos, correos y stock, y todo ese historial
-- —pedidos de prueba con clientes reales— no debe quedar mezclado con la
-- operación real que arranca ahora.
--
-- Se borra SÓLO el historial transaccional. El catálogo y los maestros
-- quedan intactos: products, product_tax_profiles, price_lists,
-- price_list_items, promo_bonificaciones, promo_escalas,
-- promo_descuentos_condicionados, customers, customer_addresses, sellers,
-- ubigeos, stock_lotes, inventory_sources y las cuentas de usuario.
--
-- Respaldo previo en docs/backups/2026-09-10/ (un JSON por tabla, más
-- RESUMEN.md con los conteos). Sin ese respaldo esto NO se corre.
--
-- El orden respeta las claves foráneas que NO son cascade y por lo tanto
-- bloquearían el borrado:
--   * fulfillments.order_id        → orders        ON DELETE RESTRICT
--   * fulfillment_items.order_item_id → order_items ON DELETE RESTRICT
-- Por eso el despacho se borra antes que el pedido, y sus líneas antes que
-- las líneas del pedido. El resto es cascade o set null, pero se borra
-- explícito igual: que el borrado dependa de lo que hagan las FK es cómodo
-- hasta el día en que una cambia.

begin;

delete from pedidos.notification_logs;
delete from pedidos.electronic_document_drafts;

delete from pedidos.approval_decisions;
delete from pedidos.approval_requests;

delete from pedidos.fulfillment_items;
delete from pedidos.fulfillments;

delete from pedidos.order_status_history;
delete from pedidos.order_observations;

delete from pedidos.order_items;
delete from pedidos.orders;

-- `orders.numero` es `generated always as identity`: reiniciar la identidad
-- hace que el próximo pedido real sea el #1. Se puede porque la tabla queda
-- vacía; con filas, reiniciar el contador chocaría contra los números ya
-- usados.
alter table pedidos.orders alter column numero restart with 1;

commit;

-- Lo que NO se toca y conviene tener presente:
--
-- * `pedidos.audit_logs` conserva la traza de la etapa de pruebas. Sus
--   `entidad_id` van a apuntar a pedidos que ya no existen (es texto, no
--   una FK), y eso es a propósito: la auditoría es el registro de lo que
--   pasó, incluido este borrado.
-- * `pedidos.order_notification_recipients` es configuración, no
--   historial: la lista de la oficina sigue igual.
-- * `pedidos.facturas_emitidas` tiene `pedido_id` SIN clave foránea. Si
--   quedó alguna fila de prueba, no se borra acá: no estaba en la lista y
--   un comprobante emitido no se tira sin decidirlo aparte.
