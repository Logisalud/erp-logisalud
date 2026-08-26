-- Catálogo de vendedores, deliberadamente desacoplado de auth.users:
-- un vendedor puede existir en el catálogo del negocio (con su código
-- de representante y zona) antes de tener una cuenta en la app. Cuando
-- se registre en Fase 4, se completa user_id.

begin;

create table pedidos.sellers (
  id uuid primary key default gen_random_uuid(),
  codigo_representante text not null unique,
  nombre_completo text not null,
  zone_id smallint references pedidos.zones (id),
  user_id uuid references auth.users (id),
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un usuario de la app no puede estar ligado a más de un vendedor del
-- catálogo (defensivo; solo aplica una vez exista user_id en Fase 4).
create unique index sellers_user_id_key on pedidos.sellers (user_id) where user_id is not null;

create index sellers_zone_id_idx on pedidos.sellers (zone_id);

alter table pedidos.sellers enable row level security;

create policy "sellers_select_all"
  on pedidos.sellers for select
  to authenticated
  using (true);

create policy "sellers_admin_write"
  on pedidos.sellers for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());

commit;
