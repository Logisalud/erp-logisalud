-- Proveedores. Mismo patrón que sales_channels: lectura abierta,
-- escritura solo administrador.

create table pedidos.suppliers (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pedidos.suppliers enable row level security;

create policy "suppliers_select_all"
  on pedidos.suppliers for select
  to authenticated
  using (true);

create policy "suppliers_admin_write"
  on pedidos.suppliers for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());
