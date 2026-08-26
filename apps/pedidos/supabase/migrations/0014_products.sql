-- Productos. El tratamiento tributario NO vive acá — ver
-- product_tax_profiles en la siguiente migración.

create table pedidos.products (
  id uuid primary key default gen_random_uuid(),
  codigo_interno text not null unique,
  codigo_proveedor text,
  descripcion text not null,
  presentacion text,
  supplier_id smallint references pedidos.suppliers (id),
  marca text,
  unidad_medida text not null default 'UND',
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  peso_unitario_futuro numeric(10, 3),
  controla_lote boolean not null default false,
  controla_vencimiento boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_supplier_idx on pedidos.products (supplier_id);

alter table pedidos.products enable row level security;

create policy "products_select_all"
  on pedidos.products for select
  to authenticated
  using (true);

create policy "products_admin_write"
  on pedidos.products for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());
