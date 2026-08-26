-- Bug real encontrado al reimportar una lista de precios el mismo día
-- de la publicación anterior: el trigger de versionado cerraba la
-- fila previa con `fecha_fin = new.fecha_inicio - 1`. Si la fila
-- previa también empezó hoy (mismo día), eso deja `fecha_fin` un día
-- ANTES que su propio `fecha_inicio`, violando el CHECK
-- (`fecha_fin >= fecha_inicio`). Mismo patrón en las 3 tablas
-- versionadas con este mecanismo (price_lists, product_tax_profiles,
-- zone_assignments) — se corrige en las tres.
--
-- Fix: cerrar con `greatest(fecha_inicio_propia, nueva_fecha - 1)` —
-- en el caso normal (multi-día) sigue siendo el día antes de la
-- nueva; en el caso mismo-día, cierra el mismo día que empezó (ventana
-- de un día, en vez de violar el CHECK).

create or replace function pedidos.close_previous_price_list()
returns trigger
language plpgsql
security definer
set search_path = pedidos, public
as $$
begin
  update pedidos.price_lists
  set fecha_fin = greatest(fecha_inicio, new.fecha_inicio - 1)
  where supplier_id = new.supplier_id
    and fecha_fin is null;
  return new;
end;
$$;

create or replace function pedidos.close_previous_tax_profile()
returns trigger
language plpgsql
security definer
set search_path = pedidos, public
as $$
begin
  update pedidos.product_tax_profiles
  set vigente_hasta = greatest(vigente_desde, new.vigente_desde - 1)
  where product_id = new.product_id
    and vigente_hasta is null;
  return new;
end;
$$;

create or replace function pedidos.close_previous_zone_assignment()
returns trigger
language plpgsql
security definer
set search_path = pedidos, public
as $$
begin
  update pedidos.zone_assignments
  set vigencia_hasta = greatest(vigencia_desde, new.vigencia_desde - 1)
  where zone_id = new.zone_id
    and vigencia_hasta is null;
  return new;
end;
$$;
