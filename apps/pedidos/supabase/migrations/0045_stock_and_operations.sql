-- Stock y Operaciones: el punto donde un pedido READY_FOR_OPERATIONS se
-- prepara y despacha.
--
-- NO incluye documentación electrónica (NubeFact, GRE, factura, boleta).
-- El punto exacto donde eso se engancha es la confirmación de despacho —
-- ver el TODO en pedidos.confirm_dispatch (0046) y docs/business-rules.md.
--
-- Regla de negocio que atraviesa todo este archivo: el stock de fuentes
-- distintas (central vs. regional) NO se mezcla automáticamente. La
-- fuente la elige Operaciones al confirmar el despacho, nunca el
-- vendedor al tomar el pedido. Por eso inventory_source_id vive en
-- fulfillments y no en orders.

begin;

-- ---------------------------------------------------------------------
-- 1. Nuevo estado de pedido: DISPATCHED
-- ---------------------------------------------------------------------

alter table pedidos.orders drop constraint if exists orders_estado_check;

alter table pedidos.orders
  add constraint orders_estado_check
  check (estado in (
    'DRAFT', 'SUBMITTED', 'NEW_CUSTOMER_VALIDATION',
    'ADMINISTRATIVE_EXCEPTION', 'COMMERCIAL_EXCEPTION', 'READY_FOR_OPERATIONS',
    'DISPATCHED'
  ));

-- Operaciones veía el pedido solo mientras estaba en READY_FOR_OPERATIONS,
-- así que al despacharlo lo perdía de vista — incluido el que acaba de
-- despachar. Se extiende a DISPATCHED (lectura; la escritura sigue
-- cerrada porque orders_update_draft solo abre en DRAFT).
drop policy if exists "orders_select" on pedidos.orders;
create policy "orders_select"
  on pedidos.orders for select
  to authenticated
  using (
    pedidos.is_admin()
    or pedidos.has_role('control_pedidos')
    or pedidos.has_role('aprobador_comercial')
    or (pedidos.has_role('operaciones') and estado in ('READY_FOR_OPERATIONS', 'DISPATCHED'))
    or (pedidos.has_role('vendedor') and seller_id = pedidos.current_seller_id())
  );

drop policy if exists "order_items_select" on pedidos.order_items;
create policy "order_items_select"
  on pedidos.order_items for select
  to authenticated
  using (exists (
    select 1 from pedidos.orders o where o.id = order_id
    and (
      pedidos.is_admin()
      or pedidos.has_role('control_pedidos')
      or pedidos.has_role('aprobador_comercial')
      or (pedidos.has_role('operaciones') and o.estado in ('READY_FOR_OPERATIONS', 'DISPATCHED'))
      or (pedidos.has_role('vendedor') and o.seller_id = pedidos.current_seller_id())
    )
  ));

-- ---------------------------------------------------------------------
-- 2. Fuentes de stock
-- ---------------------------------------------------------------------

create table if not exists pedidos.inventory_sources (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  tipo text not null check (tipo in ('central', 'regional')),
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table pedidos.inventory_sources is
  'Fuentes de stock. El stock de una fuente NO se mezcla con el de otra '
  'automáticamente: Operaciones elige la fuente al confirmar el despacho.';

-- ---------------------------------------------------------------------
-- 3. Stock registrado (manual, por ahora)
-- ---------------------------------------------------------------------

-- REGISTRO MANUAL: Operaciones lo mantiene a mano. No hay integración en
-- tiempo real con un ERP de inventario todavía. La tabla está lista para
-- que esa integración escriba acá después (de ahí fecha_actualizacion y
-- la PK por producto+fuente), pero HOY el número puede estar desfasado
-- respecto del almacén físico.
--
-- Por eso el flujo de despacho NO bloquea por falta de stock: ver
-- fulfillment_items.pendiente_de_stock y el TODO en
-- docs/business-rules.md.
create table if not exists pedidos.stock_levels (
  product_id uuid not null references pedidos.products (id) on delete cascade,
  inventory_source_id smallint not null references pedidos.inventory_sources (id) on delete restrict,
  cantidad_disponible numeric(14, 2) not null default 0 check (cantidad_disponible >= 0),
  fecha_actualizacion timestamptz not null default now(),
  primary key (product_id, inventory_source_id)
);

create index if not exists stock_levels_source_idx on pedidos.stock_levels (inventory_source_id);

-- ---------------------------------------------------------------------
-- 4. Catálogos de despacho
-- ---------------------------------------------------------------------

create table if not exists pedidos.warehouses (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  descripcion text,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pedidos.vehicles (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  descripcion text,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pedidos.drivers (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  descripcion text,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pedidos.transporters (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  descripcion text,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Despachos
-- ---------------------------------------------------------------------

create table if not exists pedidos.fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pedidos.orders (id) on delete restrict,
  inventory_source_id smallint not null references pedidos.inventory_sources (id) on delete restrict,
  warehouse_id smallint not null references pedidos.warehouses (id) on delete restrict,
  -- Transporte propio (vehículo + chofer) O transportista externo. Los
  -- tres son nullable porque la combinación válida depende de cuál se
  -- use; el check de abajo exige que haya al menos una de las dos.
  vehicle_id smallint references pedidos.vehicles (id) on delete restrict,
  driver_id smallint references pedidos.drivers (id) on delete restrict,
  transporter_id smallint references pedidos.transporters (id) on delete restrict,
  estado text not null default 'PREPARADO'
    check (estado in ('PREPARADO', 'DESPACHADO')),
  fecha_preparacion timestamptz not null default now(),
  fecha_despacho timestamptz,
  usuario_confirmo uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fulfillments_transporte_check check (
    (vehicle_id is not null and driver_id is not null)
    or transporter_id is not null
  ),
  constraint fulfillments_despacho_fecha_check check (
    (estado = 'DESPACHADO' and fecha_despacho is not null)
    or (estado <> 'DESPACHADO' and fecha_despacho is null)
  )
);

create index if not exists fulfillments_order_idx on pedidos.fulfillments (order_id);
create index if not exists fulfillments_estado_idx on pedidos.fulfillments (estado, fecha_preparacion desc);

-- Un pedido despachado no se vuelve a despachar. Índice único parcial en
-- vez de unique(order_id): deja espacio a un futuro despacho parcial
-- (varias entregas por pedido) sin rehacer el modelo, pero hoy impide el
-- doble despacho, que es el error real a evitar.
create unique index if not exists fulfillments_un_despacho_por_pedido
  on pedidos.fulfillments (order_id)
  where estado = 'DESPACHADO';

create table if not exists pedidos.fulfillment_items (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references pedidos.fulfillments (id) on delete cascade,
  order_item_id uuid not null references pedidos.order_items (id) on delete restrict,
  cantidad_preparada numeric(12, 2) not null check (cantidad_preparada >= 0),
  -- Solo si products.controla_lote / controla_vencimiento lo exigen; la
  -- validación de "es obligatorio" vive en confirm_dispatch (0046),
  -- porque depende del producto y no se puede expresar en un check de
  -- esta tabla sin duplicar el join.
  lote text,
  fecha_vencimiento date,
  -- Diferencia respecto de lo pedido: exige motivo (validado en
  -- confirm_dispatch) y queda en auditoría.
  motivo_diferencia text,
  -- No hay integración real de inventario todavía, así que una línea sin
  -- stock no bloquea el despacho: se marca y se comenta.
  pendiente_de_stock boolean not null default false,
  comentario_stock text,
  created_at timestamptz not null default now(),
  constraint fulfillment_items_pendiente_comentario_check check (
    pendiente_de_stock = false or comentario_stock is not null
  ),
  constraint fulfillment_items_un_item_por_despacho unique (fulfillment_id, order_item_id)
);

create index if not exists fulfillment_items_fulfillment_idx
  on pedidos.fulfillment_items (fulfillment_id);

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------

alter table pedidos.inventory_sources enable row level security;
alter table pedidos.stock_levels enable row level security;
alter table pedidos.warehouses enable row level security;
alter table pedidos.vehicles enable row level security;
alter table pedidos.drivers enable row level security;
alter table pedidos.transporters enable row level security;
alter table pedidos.fulfillments enable row level security;
alter table pedidos.fulfillment_items enable row level security;

-- Catálogos de despacho: los lee cualquier autenticado (Operaciones los
-- necesita en los selectores), los gestiona solo el administrador.
do $$
declare
  t text;
begin
  foreach t in array array['inventory_sources', 'warehouses', 'vehicles', 'drivers', 'transporters']
  loop
    execute format('drop policy if exists %I on pedidos.%I', t || '_select_all', t);
    execute format(
      'create policy %I on pedidos.%I for select to authenticated using (true)',
      t || '_select_all', t);

    execute format('drop policy if exists %I on pedidos.%I', t || '_admin_write', t);
    execute format(
      'create policy %I on pedidos.%I for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin())',
      t || '_admin_write', t);
  end loop;
end $$;

-- Stock: lo leen operaciones y administrador (el vendedor no ve stock —
-- no toma decisiones de fuente). Lo escriben los mismos dos, porque es
-- un registro manual que mantiene Operaciones.
drop policy if exists "stock_levels_select" on pedidos.stock_levels;
create policy "stock_levels_select"
  on pedidos.stock_levels for select
  to authenticated
  using (pedidos.is_admin() or pedidos.has_role('operaciones'));

drop policy if exists "stock_levels_write" on pedidos.stock_levels;
create policy "stock_levels_write"
  on pedidos.stock_levels for all
  to authenticated
  using (pedidos.is_admin() or pedidos.has_role('operaciones'))
  with check (pedidos.is_admin() or pedidos.has_role('operaciones'));

-- Despachos: los gestionan operaciones y administrador. El vendedor solo
-- LEE los de sus propios pedidos, para ver que fue despachado y cuándo —
-- sin poder editar nada (no hay policy de escritura para él).
drop policy if exists "fulfillments_select" on pedidos.fulfillments;
create policy "fulfillments_select"
  on pedidos.fulfillments for select
  to authenticated
  using (
    pedidos.is_admin()
    or pedidos.has_role('operaciones')
    or pedidos.has_role('control_pedidos')
    or exists (
      select 1 from pedidos.orders o
      where o.id = order_id
        and pedidos.has_role('vendedor')
        and o.seller_id = pedidos.current_seller_id()
    )
  );

drop policy if exists "fulfillments_write" on pedidos.fulfillments;
create policy "fulfillments_write"
  on pedidos.fulfillments for all
  to authenticated
  using (pedidos.is_admin() or pedidos.has_role('operaciones'))
  with check (pedidos.is_admin() or pedidos.has_role('operaciones'));

drop policy if exists "fulfillment_items_select" on pedidos.fulfillment_items;
create policy "fulfillment_items_select"
  on pedidos.fulfillment_items for select
  to authenticated
  using (exists (
    select 1 from pedidos.fulfillments f
    where f.id = fulfillment_id
      and (
        pedidos.is_admin()
        or pedidos.has_role('operaciones')
        or pedidos.has_role('control_pedidos')
        or exists (
          select 1 from pedidos.orders o
          where o.id = f.order_id
            and pedidos.has_role('vendedor')
            and o.seller_id = pedidos.current_seller_id()
        )
      )
  ));

drop policy if exists "fulfillment_items_write" on pedidos.fulfillment_items;
create policy "fulfillment_items_write"
  on pedidos.fulfillment_items for all
  to authenticated
  using (pedidos.is_admin() or pedidos.has_role('operaciones'))
  with check (pedidos.is_admin() or pedidos.has_role('operaciones'));

-- ---------------------------------------------------------------------
-- 7. Catálogo inicial
-- ---------------------------------------------------------------------

-- Mínimo para que la bandeja de Operaciones sea usable el primer día. El
-- administrador extiende estos catálogos desde /admin.
insert into pedidos.inventory_sources (nombre, tipo) values
  ('Almacén Central Lima', 'central'),
  ('Almacén Regional Trujillo', 'regional')
on conflict (nombre) do nothing;

insert into pedidos.warehouses (nombre, descripcion) values
  ('Almacén Central Lima', 'Almacén principal en Lima'),
  ('Almacén Regional Trujillo', 'Almacén regional norte')
on conflict (nombre) do nothing;

insert into pedidos.transporters (nombre, descripcion) values
  ('Transporte propio', 'Flota propia de LOGISALUD — usar vehículo y chofer')
on conflict (nombre) do nothing;

commit;
