-- Campos que vienen de la lista de precios del proveedor pero no
-- tenían columna todavía. codigo_bonificacion no se usa aún (llega
-- con promociones/bonificaciones en un paso posterior) pero se guarda
-- desde ya para no perder el dato en cada reimportación.

begin;

alter table pedidos.products add column codigo_bonificacion text;
alter table pedidos.products add column principio_activo text;

commit;
