-- Cotización adjunta en una OC de bien: el sustento del monto (igual criterio
-- que pago directo/gastos, ver 0037/0004) cuando la persona que registra la
-- orden no tiene todavía una factura o solo cuenta con la cotización del
-- proveedor.
alter table compras.ordenes_compra
  add column if not exists cotizacion_storage_path text;

-- La escritura del bucket legajos-compras (0004) quedó restringida a
-- almacen/compras/contabilidad/admin y nunca se sumó a la decisión de
-- "acceso abierto temporal" de 0025 (esa migración solo tocó tablas, no
-- storage.objects). Cualquier persona con perfil ya puede crear una OC de
-- bien mientras el flag siga activo — tiene que poder subir la cotización
-- de esa misma OC, si no, la subida best-effort del adjunto siempre falla
-- en silencio para quien no sea de esas cuatro áreas.
drop policy if exists legajos_compras_escritura_abierta on storage.objects;
create policy legajos_compras_escritura_abierta on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'legajos-compras'
    and public.path_legajo_valido(name)
    and public.compras_acceso_abierto()
  );
