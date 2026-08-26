-- Direcciones y contactos de cliente, múltiples por cliente.
-- La visibilidad y permisos de escritura siguen al cliente padre
-- (misma regla de zona para vendedor, mismo criterio de aprobación
-- para control_pedidos/administrador).

create table pedidos.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references pedidos.customers (id) on delete cascade,
  direccion text not null,
  ubigeo text,
  referencia text,
  es_principal boolean not null default false,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  solicitado_por uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table pedidos.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references pedidos.customers (id) on delete cascade,
  nombre text not null,
  cargo text,
  telefono text,
  email text,
  es_principal boolean not null default false,
  created_at timestamptz not null default now()
);

create index customer_addresses_customer_idx on pedidos.customer_addresses (customer_id);
create index customer_contacts_customer_idx on pedidos.customer_contacts (customer_id);

alter table pedidos.customer_addresses enable row level security;
alter table pedidos.customer_contacts enable row level security;

create policy "customer_addresses_select"
  on pedidos.customer_addresses for select
  to authenticated
  using (
    exists (
      select 1 from pedidos.customers c
      where c.id = customer_id
        and (
          pedidos.is_admin()
          or pedidos.has_role('control_pedidos')
          or pedidos.has_role('operaciones')
          or pedidos.has_role('aprobador_comercial')
          or c.zona_id in (select pedidos.current_user_zone_ids())
        )
    )
  );

create policy "customer_addresses_insert_vendedor"
  on pedidos.customer_addresses for insert
  to authenticated
  with check (
    pedidos.has_role('vendedor')
    and solicitado_por = auth.uid()
    and exists (
      select 1 from pedidos.customers c
      where c.id = customer_id
        and c.zona_id in (select pedidos.current_user_zone_ids())
    )
  );

create policy "customer_addresses_write_control_o_admin"
  on pedidos.customer_addresses for all
  to authenticated
  using (pedidos.is_admin() or pedidos.has_role('control_pedidos'))
  with check (pedidos.is_admin() or pedidos.has_role('control_pedidos'));

create policy "customer_contacts_select"
  on pedidos.customer_contacts for select
  to authenticated
  using (
    exists (
      select 1 from pedidos.customers c
      where c.id = customer_id
        and (
          pedidos.is_admin()
          or pedidos.has_role('control_pedidos')
          or pedidos.has_role('operaciones')
          or pedidos.has_role('aprobador_comercial')
          or c.zona_id in (select pedidos.current_user_zone_ids())
        )
    )
  );

create policy "customer_contacts_insert_vendedor"
  on pedidos.customer_contacts for insert
  to authenticated
  with check (
    pedidos.has_role('vendedor')
    and exists (
      select 1 from pedidos.customers c
      where c.id = customer_id
        and c.zona_id in (select pedidos.current_user_zone_ids())
    )
  );

create policy "customer_contacts_write_control_o_admin"
  on pedidos.customer_contacts for all
  to authenticated
  using (pedidos.is_admin() or pedidos.has_role('control_pedidos'))
  with check (pedidos.is_admin() or pedidos.has_role('control_pedidos'));
