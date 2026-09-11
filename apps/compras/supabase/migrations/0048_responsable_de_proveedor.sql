-- Responsable de cada proveedor: UNA PERSONA, no un área.
--
-- Un área fija sería dato muerto — un mismo proveedor lo usan varias áreas
-- distintas, así que "el proveedor pertenece a Compras" no dice nada útil.
-- Lo que sí sirve es saber a quién preguntarle por ese proveedor.
--
-- Nullable a propósito: "sin responsable" es un estado legítimo y es
-- justamente lo que busca el reporte. El día uno quedan todos así.

alter table compras.proveedores
  add column if not exists responsable_id uuid references public.perfiles(id);

alter table servicios.proveedores_servicio
  add column if not exists responsable_id uuid references public.perfiles(id);

comment on column compras.proveedores.responsable_id is
  'Persona a cargo de la relación con este proveedor. Asignable y reasignable; null = sin responsable.';
comment on column servicios.proveedores_servicio.responsable_id is
  'Persona a cargo de la relación con este proveedor. Asignable y reasignable; null = sin responsable.';
