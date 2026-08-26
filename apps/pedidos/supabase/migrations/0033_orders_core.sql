-- Fase 4: pedidos. `orders.estado` no se edita nunca con un UPDATE
-- directo del cliente — la policy de UPDATE (orders_update_draft) solo
-- permite escribir mientras el pedido sigue en DRAFT (WITH CHECK exige
-- que la fila nueva también quede en DRAFT), así que ningún cliente
-- puede sacar un pedido de DRAFT por su cuenta. La única forma de
-- avanzar de estado es pedidos.apply_order_transition() (0036),
-- SECURITY DEFINER, que hace su propia verificación de rol/pertenencia
-- y por eso puede escribir a través de esa frontera.

create table pedidos.orders (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references pedidos.sellers (id),
  creado_por uuid not null references auth.users (id),
  customer_id uuid not null references pedidos.customers (id),
  customer_address_id uuid not null references pedidos.customer_addresses (id),
  payment_terms_id smallint not null references pedidos.payment_terms (id),
  estado text not null default 'DRAFT'
    check (estado in (
      'DRAFT', 'SUBMITTED', 'NEW_CUSTOMER_VALIDATION',
      'ADMINISTRATIVE_EXCEPTION', 'COMMERCIAL_EXCEPTION', 'READY_FOR_OPERATIONS'
    )),
  fecha_creacion timestamptz not null default now(),
  fecha_envio timestamptz,
  -- Snapshot al momento del envío (0036), nunca antes: un cambio
  -- posterior en customers/customer_addresses/sales_channels/zones/
  -- sellers no debe alterar pedidos ya enviados (ver docs/data-model.md,
  -- sección "Snapshot histórico").
  razon_social_snapshot text,
  direccion_snapshot text,
  ubigeo_snapshot text,
  canal_snapshot text,
  zona_snapshot text,
  vendedor_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_seller_idx on pedidos.orders (seller_id);
create index orders_customer_idx on pedidos.orders (customer_id);
create index orders_estado_idx on pedidos.orders (estado);

create table pedidos.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pedidos.orders (id) on delete cascade,
  product_id uuid not null references pedidos.products (id),
  cantidad numeric(12, 2) not null check (cantidad > 0),
  -- Snapshot, nunca referencia en vivo a price_list_items/product_tax_profiles.
  precio_unitario numeric(12, 4) not null default 0,
  afectacion_tributaria text not null default 'GRAVADO' check (afectacion_tributaria in ('GRAVADO', 'INAFECTO')),
  tasa_igv numeric(5, 2) not null default 0,
  subtotal numeric(14, 2) not null default 0,
  igv numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_items_order_idx on pedidos.order_items (order_id);

alter table pedidos.orders enable row level security;
alter table pedidos.order_items enable row level security;

create policy "orders_select"
  on pedidos.orders for select
  to authenticated
  using (
    pedidos.is_admin()
    or pedidos.has_role('control_pedidos')
    or pedidos.has_role('aprobador_comercial')
    or (pedidos.has_role('operaciones') and estado = 'READY_FOR_OPERATIONS')
    or (pedidos.has_role('vendedor') and seller_id = pedidos.current_seller_id())
  );

-- El vendedor solo crea a su propio seller_id; el admin puede elegir
-- cualquier seller activo (selector "a nombre de qué vendedor").
create policy "orders_insert_vendedor"
  on pedidos.orders for insert
  to authenticated
  with check (
    pedidos.has_role('vendedor')
    and seller_id = pedidos.current_seller_id()
    and creado_por = auth.uid()
    and estado = 'DRAFT'
  );

create policy "orders_insert_admin"
  on pedidos.orders for insert
  to authenticated
  with check (
    pedidos.is_admin()
    and creado_por = auth.uid()
    and estado = 'DRAFT'
    and exists (select 1 from pedidos.sellers s where s.id = seller_id and s.estado = 'activo')
  );

create policy "orders_update_draft"
  on pedidos.orders for update
  to authenticated
  using (
    estado = 'DRAFT'
    and (
      pedidos.is_admin()
      or (pedidos.has_role('vendedor') and seller_id = pedidos.current_seller_id())
    )
  )
  with check (
    estado = 'DRAFT'
    and (
      pedidos.is_admin()
      or (pedidos.has_role('vendedor') and seller_id = pedidos.current_seller_id())
    )
  );

create policy "order_items_select"
  on pedidos.order_items for select
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

create policy "order_items_write_draft"
  on pedidos.order_items for all
  to authenticated
  using (exists (
    select 1 from pedidos.orders o where o.id = order_id and o.estado = 'DRAFT'
    and (pedidos.is_admin() or (pedidos.has_role('vendedor') and o.seller_id = pedidos.current_seller_id()))
  ))
  with check (exists (
    select 1 from pedidos.orders o where o.id = order_id and o.estado = 'DRAFT'
    and (pedidos.is_admin() or (pedidos.has_role('vendedor') and o.seller_id = pedidos.current_seller_id()))
  ));
