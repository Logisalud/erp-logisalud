-- Servicios: falta el campo para que el área usuaria suba la factura del
-- proveedor de servicio. `servicios.conformidad_servicio.storage_path` es
-- un documento aparte (evidencia de que el servicio se cumplió, no la
-- factura) — mismo criterio de "herencia de documentos" que
-- almacen.recepciones (regla 4): el archivo se sube una vez acá, y
-- Contabilidad lo hereda al registrar la obligación, sin volver a pedirlo.
--
-- Re-ejecutable.
alter table servicios.ordenes_servicio add column if not exists storage_path_factura_proveedor text;
