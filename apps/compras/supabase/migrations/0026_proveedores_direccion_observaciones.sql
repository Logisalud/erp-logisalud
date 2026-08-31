-- Unificación de proveedores (compras.proveedores + servicios.proveedores_servicio)
-- en una sola pantalla de búsqueda/detalle (app/proveedores). Agrega dos
-- columnas de texto libre a ambas tablas — aditivo, reversible, sin default
-- que rompa nada existente. No se toca la banca: compras.proveedor_cuentas_bancarias
-- y servicios.proveedor_servicio_cuentas_bancarias ya soportan multi-cuenta +
-- es_principal desde 0001, esta migración no las toca.

alter table compras.proveedores
  add column if not exists direccion_fiscal text,
  add column if not exists observaciones text;

alter table servicios.proveedores_servicio
  add column if not exists direccion_fiscal text,
  add column if not exists observaciones text;

-- Ambas tablas heredan las RLS policies existentes de la tabla — columnas
-- nuevas en una tabla ya con policy no necesitan policy propia (ver
-- CLAUDE.md, "RLS: este módulo tiene compras.flags/compras_acceso_abierto()
-- otorgando lectura/escritura amplia a todos los roles autenticados en los
-- 8 schemas").
