-- Listas de precios por proveedor, versionadas: reimportar el mismo
-- proveedor NUNCA sobrescribe una lista ya publicada — cierra la
-- vigente (fecha_fin) y crea una nueva. Mismo patrón de "cerrar la
-- anterior antes de insertar" que product_tax_profiles/zone_assignments.
--
-- Una lista cubre TODOS los canales del proveedor en una sola
-- importación (el Excel trae columnas para los 6 canales a la vez);
-- price_list_items es lo que diferencia por canal.

begin;

create table pedidos.price_lists (
  id uuid primary key default gen_random_uuid(),
  supplier_id smallint not null references pedidos.suppliers (id),
  fecha_inicio date not null default current_date,
  fecha_fin date,
  archivo_nombre text not null,
  archivo_storage_path text,
  importado_por uuid not null references auth.users (id),
  publicado_en timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint price_lists_vigencia_check check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create unique index price_lists_one_active_per_supplier
  on pedidos.price_lists (supplier_id)
  where fecha_fin is null;

create function pedidos.close_previous_price_list()
returns trigger
language plpgsql
security definer
set search_path = pedidos, public
as $$
begin
  update pedidos.price_lists
  set fecha_fin = new.fecha_inicio - 1
  where supplier_id = new.supplier_id
    and fecha_fin is null;
  return new;
end;
$$;

create trigger price_lists_close_previous
  before insert on pedidos.price_lists
  for each row execute function pedidos.close_previous_price_list();

create table pedidos.price_list_items (
  id bigint generated always as identity primary key,
  price_list_id uuid not null references pedidos.price_lists (id) on delete cascade,
  product_id uuid not null references pedidos.products (id),
  sales_channel_id smallint not null references pedidos.sales_channels (id),
  precio numeric(12, 4) not null,
  created_at timestamptz not null default now(),
  unique (price_list_id, product_id, sales_channel_id)
);

create index price_list_items_price_list_idx on pedidos.price_list_items (price_list_id);
create index price_list_items_product_idx on pedidos.price_list_items (product_id);

alter table pedidos.price_lists enable row level security;
alter table pedidos.price_list_items enable row level security;

create policy "price_lists_select_all"
  on pedidos.price_lists for select
  to authenticated
  using (true);

create policy "price_lists_admin_write"
  on pedidos.price_lists for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());

create policy "price_list_items_select_all"
  on pedidos.price_list_items for select
  to authenticated
  using (true);

create policy "price_list_items_admin_write"
  on pedidos.price_list_items for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());

commit;
