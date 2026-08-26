-- Costos de referencia que vienen en la lista de precios del
-- proveedor, versionados junto con el tratamiento tributario (mismo
-- ciclo de vida: cambian cada vez que se reimporta la lista).
--
-- costo_referencial_distribuidora = columna "PVF A DISTRIBUIDORA" del
-- Excel. Es costo de referencia, NUNCA un precio de venta a cliente —
-- por eso vive acá y no en price_list_items.
--
-- fecha_vigencia_proveedor = columna "FECHA V." del Excel, tal como la
-- entrega el proveedor. NO se asume que sea vencimiento de lote físico
-- (eso lo maneja Operaciones con lotes reales en Fase 5) — ver
-- docs/business-rules.md para el supuesto completo.

begin;

alter table pedidos.product_tax_profiles add column vvf_sin_igv numeric(12, 4);
alter table pedidos.product_tax_profiles add column vvd_sin_igv numeric(12, 4);
alter table pedidos.product_tax_profiles add column costo_referencial_distribuidora numeric(12, 4);
alter table pedidos.product_tax_profiles add column fecha_vigencia_proveedor date;

commit;
