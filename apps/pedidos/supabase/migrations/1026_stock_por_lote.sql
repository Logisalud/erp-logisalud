-- 1026 — El stock se lleva por LOTE, no por producto.
--
-- El archivo real de stock diario trae el mismo producto en varias filas,
-- una por lote, cada una con su fecha de vencimiento y su cantidad
-- (DHP414 aparece con 5 lotes distintos). El modelo anterior —una fila por
-- producto+fuente con la cantidad agregada— perdía justamente lo que hace
-- falta para despachar: qué lote sale, y cuál vence primero.
--
-- `stock_levels` NO desaparece: pasa a ser una VISTA que suma los lotes de
-- cada producto+fuente. Todo lo que ya la consulta (el aviso de "sin
-- stock" al armar el pedido, la pantalla de Operaciones) sigue leyendo lo
-- mismo, con las mismas columnas, sin reescribir nada. Se puede porque
-- nadie escribía en ella salvo el importador, que ahora escribe en
-- stock_lotes.

create table if not exists pedidos.stock_lotes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references pedidos.products (id) on delete cascade,
  inventory_source_id smallint not null references pedidos.inventory_sources (id) on delete restrict,
  -- El lote es texto tal cual viene del archivo: son códigos del
  -- proveedor ('PT12502', 'B-190126', '2000146'), sin formato común.
  lote text not null,
  fecha_vencimiento date,
  cantidad_disponible numeric(14, 2) not null default 0 check (cantidad_disponible >= 0),
  -- Referencial, para leerlo: el proveedor real del producto vive en
  -- products.supplier_id y no se toca desde acá.
  proveedor text,
  fecha_actualizacion timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Reimportar el mismo lote ACTUALIZA su cantidad; nunca duplica.
create unique index if not exists stock_lotes_producto_fuente_lote_key
  on pedidos.stock_lotes (product_id, inventory_source_id, lote);

create index if not exists stock_lotes_source_idx on pedidos.stock_lotes (inventory_source_id);
create index if not exists stock_lotes_vencimiento_idx on pedidos.stock_lotes (fecha_vencimiento);

alter table pedidos.stock_lotes enable row level security;

-- Lo lee cualquier autenticado: el vendedor necesita saber cuánto hay
-- antes de ofrecerle un producto a un cliente, y eso hoy no lo podía ver.
drop policy if exists "stock_lotes_select_all" on pedidos.stock_lotes;
create policy "stock_lotes_select_all"
  on pedidos.stock_lotes for select to authenticated using (true);

-- Escribe sólo el administrador, que es quien corre el importador.
drop policy if exists "stock_lotes_admin_write" on pedidos.stock_lotes;
create policy "stock_lotes_admin_write"
  on pedidos.stock_lotes for all to authenticated
  using (pedidos.is_admin()) with check (pedidos.is_admin());

-- ---------------------------------------------------------------------
-- stock_levels: de tabla a vista
-- ---------------------------------------------------------------------
-- La tabla está vacía (0 filas al 2026-09-10, nunca se llegó a cargar),
-- así que no hay dato que migrar: se reemplaza directo.
drop table if exists pedidos.stock_levels;

create or replace view pedidos.stock_levels
with (security_invoker = true) as
  select
    l.product_id,
    l.inventory_source_id,
    sum(l.cantidad_disponible)::numeric(14, 2) as cantidad_disponible,
    max(l.fecha_actualizacion) as fecha_actualizacion,
    -- Lo que agrega el modelo por lote y antes no existía: cuántos lotes
    -- hay y cuál vence primero.
    count(*)::int as lotes,
    min(l.fecha_vencimiento) as vence_primero
  from pedidos.stock_lotes l
  group by l.product_id, l.inventory_source_id;

comment on view pedidos.stock_levels is
  'Suma de pedidos.stock_lotes por producto+fuente. Se mantiene con el '
  'mismo nombre y columnas que la tabla anterior para no reescribir lo '
  'que ya la consulta (aviso de sin stock, Operaciones). El detalle real '
  'está en stock_lotes.';

grant select on pedidos.stock_levels to authenticated;
