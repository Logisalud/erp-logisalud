-- Historial de transiciones de estado y observaciones libres sobre un
-- pedido (usadas por las bandejas de control_pedidos/aprobador_comercial).

create table pedidos.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references pedidos.orders (id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  usuario uuid not null references auth.users (id),
  motivo text,
  fecha timestamptz not null default now()
);

create index order_status_history_order_idx on pedidos.order_status_history (order_id);

create table pedidos.order_observations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pedidos.orders (id) on delete cascade,
  autor uuid not null references auth.users (id),
  comentario text not null,
  contexto text,
  fecha timestamptz not null default now()
);

create index order_observations_order_idx on pedidos.order_observations (order_id);

alter table pedidos.order_status_history enable row level security;
alter table pedidos.order_observations enable row level security;

-- Sin policy de insert para authenticated: solo escribe
-- pedidos.apply_order_transition() (0036), SECURITY DEFINER.
create policy "order_status_history_select"
  on pedidos.order_status_history for select
  to authenticated
  using (exists (
    select 1 from pedidos.orders o where o.id = order_id
    and (
      pedidos.is_admin()
      or pedidos.has_role('control_pedidos')
      or pedidos.has_role('aprobador_comercial')
      or (pedidos.has_role('operaciones') and o.estado = 'READY_FOR_OPERATIONS')
      or (pedidos.has_role('vendedor') and o.seller_id = pedidos.current_seller_id())
    )
  ));

create policy "order_observations_select"
  on pedidos.order_observations for select
  to authenticated
  using (exists (
    select 1 from pedidos.orders o where o.id = order_id
    and (
      pedidos.is_admin()
      or pedidos.has_role('control_pedidos')
      or pedidos.has_role('aprobador_comercial')
      or (pedidos.has_role('vendedor') and o.seller_id = pedidos.current_seller_id())
    )
  ));

create policy "order_observations_insert"
  on pedidos.order_observations for insert
  to authenticated
  with check (
    autor = auth.uid()
    and exists (
      select 1 from pedidos.orders o where o.id = order_id
      and (
        pedidos.is_admin()
        or pedidos.has_role('control_pedidos')
        or pedidos.has_role('aprobador_comercial')
        or (pedidos.has_role('vendedor') and o.seller_id = pedidos.current_seller_id())
      )
    )
  );
