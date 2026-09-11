-- Una reasignación de cliente puede venir de una actualización de cartera.
--
-- `customer_seller_reassignments.fuente` sólo admitía 'migracion_piloto' (la
-- carga inicial) y 'app' (un cambio hecho desde el sistema). Faltaba el caso
-- real y recurrente: Comercial entrega una planilla con la cartera
-- redistribuida y se aplica en bloque. Sin este valor, esas reasignaciones
-- tendrían que mentir sobre su origen.
--
-- Apareció al aplicar la reasignación del 2026-09-11 (479 clientes): el
-- INSERT rebotó contra el CHECK y la transacción entera se deshizo, que es
-- exactamente lo que tiene que pasar.

alter table pedidos.customer_seller_reassignments
  drop constraint if exists customer_seller_reassignments_fuente_check;

alter table pedidos.customer_seller_reassignments
  add constraint customer_seller_reassignments_fuente_check
  check (fuente = any (array['migracion_piloto', 'app', 'actualizacion_cartera']));
