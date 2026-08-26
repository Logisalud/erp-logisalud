-- Canales de venta. Catálogo simple, lectura abierta a cualquier
-- usuario autenticado (se necesita en formularios de varias fases),
-- escritura solo administrador.

create table pedidos.sales_channels (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pedidos.sales_channels enable row level security;

create policy "sales_channels_select_all"
  on pedidos.sales_channels for select
  to authenticated
  using (true);

create policy "sales_channels_admin_write"
  on pedidos.sales_channels for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());
