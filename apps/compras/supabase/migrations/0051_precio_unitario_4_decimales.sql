-- Precios unitarios con 4 decimales.
--
-- Los formularios ya aceptaban 4 (`step="0.0001"` en los cinco: OC
-- mercadería, OC bien, editar OC, registrar factura y obligación desde
-- recepción), pero las columnas eran `numeric(14,2)`: Postgres redondeaba a
-- 2 al guardar, EN SILENCIO. Quien escribía 12.3456 obtenía 12.35 y no se
-- enteraba — el precio de compra de un producto fraccionado (una tableta de
-- una caja de 30) necesita los 4.
--
-- Se sube la escala a 4 y la precisión total a 16 para NO perder rango: con
-- (14,4) quedarían 10 dígitos enteros en vez de los 12 que hay hoy, que es
-- una restricción silenciosa en la otra punta. Con (16,4) los 12 se
-- conservan.
--
-- `compras.ordenes_compra_items.subtotal` es una columna GENERADA sobre
-- (cantidad_pedida * precio_unitario), y Postgres no permite alterar el tipo
-- de una columna de la que depende una generada. Así que hay que soltarla,
-- cambiar el tipo y recrearla. El dato no se pierde: es generada, se
-- recalcula sola desde las columnas base.
--
-- `subtotal` también sube a escala 4: cantidad(3) × precio(4) puede dar más
-- de 2 decimales, y dejarlo en (14,2) volvería a redondear el importe de
-- línea aunque el precio ya fuera exacto.

-- ── compras.ordenes_compra_items ─────────────────────────────────────
alter table compras.ordenes_compra_items drop column if exists subtotal;

alter table compras.ordenes_compra_items
  alter column precio_unitario type numeric(16,4);

alter table compras.ordenes_compra_items
  add column subtotal numeric(16,4) generated always as (cantidad_pedida * precio_unitario) stored;

-- ── cuentas_x_pagar.obligaciones_items ───────────────────────────────
-- Sin columnas generadas encima, así que va directo.
alter table cuentas_x_pagar.obligaciones_items
  alter column precio_facturado type numeric(16,4);

comment on column compras.ordenes_compra_items.precio_unitario is
  'Precio unitario con 4 decimales — necesario para productos fraccionados (ver migración 0051).';
comment on column cuentas_x_pagar.obligaciones_items.precio_facturado is
  'Precio facturado con 4 decimales, para poder conciliar contra precio_unitario sin redondeos (ver migración 0051).';
