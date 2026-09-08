-- Agrega 'marketing' al CHECK de área de public.usuarios_esperados —
-- Renato Cruz (Marketing) había quedado en 'otro' por no tener un valor
-- real disponible. Aditiva y re-ejecutable: se recrea el mismo CHECK con
-- el valor nuevo agregado, no se toca ninguna fila existente.

alter table public.usuarios_esperados
  drop constraint if exists usuarios_esperados_area_check;

alter table public.usuarios_esperados
  add constraint usuarios_esperados_area_check check (area in (
    'compras', 'almacen', 'contabilidad', 'tesoreria', 'gerencia',
    'gestion_humana', 'legal', 'direccion_tecnica', 'ventas', 'admin',
    'otro', 'marketing'
  ));
