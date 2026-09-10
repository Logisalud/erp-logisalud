-- Categoría de Pago Directo que faltaba: "Servicios de alquiler" (alquiler
-- de local, depósito, cochera). Pedida en producción — hoy esos pagos
-- caían en "Otros gastos autorizados", que no dice nada al mirarlos
-- después en la sábana o en el reporte por categoría.
--
-- `where not exists` en vez de un unique: la tabla no tiene constraint de
-- unicidad en `nombre` (ver 0024), así que la migración se protege sola
-- para poder reejecutarse.

insert into cuentas_x_pagar.categorias_pago_directo (nombre, activo)
select 'Servicios de alquiler', true
where not exists (
  select 1 from cuentas_x_pagar.categorias_pago_directo
   where lower(trim(nombre)) = 'servicios de alquiler'
);
