-- Catálogo de zonas. La asignación de vendedores a cada zona vive en
-- zone_assignments / zone_assignment_participants (siguiente
-- migración), no acá.

create table pedidos.zones (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pedidos.zones enable row level security;

create policy "zones_select_all"
  on pedidos.zones for select
  to authenticated
  using (true);

create policy "zones_admin_write"
  on pedidos.zones for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());
