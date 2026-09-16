-- Carga masiva de la rendición de Caja Chica desde el Excel que Roberto ya
-- mantiene, en vez de registrar factura por factura.
--
-- Casi todo lo que hacía falta YA ESTABA en el esquema:
--   · `movimientos.placa_vehiculo` existe desde el diseño original — la
--     columna UNIDAD del Excel tiene casa sin agregar nada.
--   · La obligación se genera POR REPOSICIÓN, no por movimiento
--     (services/caja-chica.ts), así que una rendición entera ya aparece como
--     UNA sola línea en la propuesta de pago. Sin cambios.
--   · `caja_chica` ya es fuente de "Pendientes de aprobar", así que la
--     rendición cargada por Excel aparece ahí sola.
--
-- Solo faltan dos cosas.
--
-- Re-ejecutable.

-- ── 1. El Excel original, como respaldo dentro del ERP ───────────────────
-- Las facturas individuales viven en OneDrive y no se duplican acá, pero
-- quien revise la rendición en el ERP tiene que poder ver de dónde salieron
-- los números sin salir del sistema.
alter table caja_chica.reposiciones
  add column if not exists storage_path_excel text;

comment on column caja_chica.reposiciones.storage_path_excel is
  'El .xlsx de la rendición, si se cargó por importador. Null si los '
  'movimientos se registraron uno por uno.';

-- ── 2. Las dos categorías que el Excel usa y el catálogo no tenía ────────
-- PEAJE y COCHERA son 8 de las 13 filas del archivo real. Mandarlas a "Otros
-- gastos autorizados" perdería justo lo que se quiere analizar (gasto por
-- vehículo). DIESEL/GAS/GASOLINA ya tenían destino: "Combustible".
--
-- Va con `where not exists` y no con `on conflict (nombre)`:
-- `gastos.categorias_gasto` NO tiene índice único sobre `nombre` — solo la PK
-- sobre `id` — así que `on conflict (nombre)` falla con 42P10. Distinto de
-- `cuentas_x_pagar.categorias_pago_directo`, que sí lo tiene.
insert into gastos.categorias_gasto (nombre)
select v.nombre
from (values ('Peajes'), ('Cocheras y estacionamientos')) as v(nombre)
where not exists (
  select 1 from gastos.categorias_gasto c where c.nombre = v.nombre
);
