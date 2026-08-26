-- Condiciones de pago. Mismo patrón de catálogo simple.

create table pedidos.payment_terms (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  descripcion text,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pedidos.payment_terms enable row level security;

create policy "payment_terms_select_all"
  on pedidos.payment_terms for select
  to authenticated
  using (true);

create policy "payment_terms_admin_write"
  on pedidos.payment_terms for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());
