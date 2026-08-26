-- Solicitudes de descuento/precio especial (sección 10 del PRD) y sus
-- decisiones. El estado de una approval_request (PENDIENTE -> RESUELTO)
-- solo lo cambia pedidos.decide_approval_request() (0036), nunca un
-- UPDATE directo del aprobador.

create table pedidos.approval_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pedidos.orders (id) on delete cascade,
  order_item_id uuid not null references pedidos.order_items (id) on delete cascade,
  solicitado_por uuid not null references auth.users (id),
  precio_solicitado numeric(12, 4),
  porcentaje_descuento numeric(5, 2),
  cantidad numeric(12, 2) not null,
  motivo text not null,
  competencia_negociacion text,
  comentario text,
  evidencia_url text,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'RESUELTO')),
  created_at timestamptz not null default now(),
  constraint approval_requests_precio_o_pct check (
    (precio_solicitado is not null)::int + (porcentaje_descuento is not null)::int = 1
  )
);

create index approval_requests_order_idx on pedidos.approval_requests (order_id);
create index approval_requests_pendientes_idx on pedidos.approval_requests (estado) where estado = 'PENDIENTE';

create table pedidos.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references pedidos.approval_requests (id) on delete cascade,
  decidido_por uuid not null references auth.users (id),
  decision text not null check (decision in ('APROBAR', 'RECHAZAR', 'APROBAR_OTRO_PRECIO', 'SOLICITAR_INFO')),
  precio_aprobado numeric(12, 4),
  comentario text,
  fecha timestamptz not null default now(),
  constraint approval_decisions_precio_requerido check (
    decision <> 'APROBAR_OTRO_PRECIO' or precio_aprobado is not null
  )
);

create index approval_decisions_request_idx on pedidos.approval_decisions (approval_request_id);

alter table pedidos.approval_requests enable row level security;
alter table pedidos.approval_decisions enable row level security;

create policy "approval_requests_select"
  on pedidos.approval_requests for select
  to authenticated
  using (
    pedidos.is_admin()
    or pedidos.has_role('aprobador_comercial')
    or exists (
      select 1 from pedidos.orders o
      where o.id = order_id and pedidos.has_role('vendedor') and o.seller_id = pedidos.current_seller_id()
    )
  );

create policy "approval_requests_insert_vendedor"
  on pedidos.approval_requests for insert
  to authenticated
  with check (
    solicitado_por = auth.uid()
    and exists (
      select 1 from pedidos.orders o where o.id = order_id and o.estado = 'DRAFT'
      and (pedidos.is_admin() or (pedidos.has_role('vendedor') and o.seller_id = pedidos.current_seller_id()))
    )
  );

create policy "approval_decisions_select"
  on pedidos.approval_decisions for select
  to authenticated
  using (
    pedidos.is_admin()
    or pedidos.has_role('aprobador_comercial')
    or exists (
      select 1 from pedidos.approval_requests ar
      join pedidos.orders o on o.id = ar.order_id
      where ar.id = approval_request_id
        and pedidos.has_role('vendedor') and o.seller_id = pedidos.current_seller_id()
    )
  );
-- Sin insert directo para authenticated: solo pedidos.decide_approval_request() (0036).
