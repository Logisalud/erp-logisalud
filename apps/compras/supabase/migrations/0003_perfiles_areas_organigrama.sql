-- Amplía las áreas válidas de public.perfiles con 3 que aparecieron al
-- mapear el organigrama real: legal, direccion_tecnica y ventas.
--
-- 0001 ya crea el constraint con la lista completa, así que en una
-- instalación nueva esta migración es un no-op que reescribe el mismo
-- constraint. Existe para la base que ya tenga 0001 aplicado con la lista
-- vieja (sin las 3 áreas nuevas), donde 18 de las 31 personas del
-- organigrama no pasarían la validación.
--
-- Re-ejecutable.

alter table public.perfiles
  drop constraint if exists perfiles_area_check;

alter table public.perfiles
  add constraint perfiles_area_check
  check (area in (
    'compras','almacen','contabilidad','tesoreria','gerencia',
    'gestion_humana','legal','direccion_tecnica','ventas','admin','otro'
  ));
