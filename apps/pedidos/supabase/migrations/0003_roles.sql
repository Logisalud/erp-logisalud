-- Catálogo de roles y su asignación a usuarios.
-- Roles iniciales del módulo de Pedidos (ver docs/business-rules.md):
--   vendedor, control_pedidos, aprobador_comercial, operaciones, administrador

create table pedidos.roles (
  id smallint generated always as identity primary key,
  name text not null unique,
  description text
);

create table pedidos.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id smallint not null references pedidos.roles (id) on delete restrict,
  assigned_by uuid references auth.users (id),
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

alter table pedidos.roles enable row level security;
alter table pedidos.user_roles enable row level security;

-- Función security definer: evita recursión de RLS al chequear el rol
-- del usuario actual (se ejecuta con los privilegios del dueño de la
-- función, no del caller, por lo que no vuelve a evaluar RLS sobre
-- user_roles/roles).
create function pedidos.is_admin()
returns boolean
language sql
security definer
stable
set search_path = pedidos, public
as $$
  select exists (
    select 1
    from pedidos.user_roles ur
    join pedidos.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name = 'administrador'
  );
$$;

-- Todos los usuarios autenticados pueden leer el catálogo de roles
-- (necesario para mostrar nombres de rol en la UI); solo administrador
-- lo modifica.
create policy "roles_select_all"
  on pedidos.roles for select
  to authenticated
  using (true);

create policy "roles_admin_write"
  on pedidos.roles for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());

-- Un usuario puede ver sus propias asignaciones de rol; solo
-- administrador gestiona (lee/asigna/revoca) las de cualquier usuario.
create policy "user_roles_select_own_or_admin"
  on pedidos.user_roles for select
  to authenticated
  using (user_id = auth.uid() or pedidos.is_admin());

create policy "user_roles_admin_write"
  on pedidos.user_roles for insert
  to authenticated
  with check (pedidos.is_admin());

create policy "user_roles_admin_update"
  on pedidos.user_roles for update
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());

create policy "user_roles_admin_delete"
  on pedidos.user_roles for delete
  to authenticated
  using (pedidos.is_admin());
