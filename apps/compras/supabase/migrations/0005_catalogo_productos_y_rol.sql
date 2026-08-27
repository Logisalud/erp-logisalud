-- Unificación de Pedidos, parte 1: catálogo de productos compartido y
-- helper de rol. Ver docs/plan-unificacion-pedidos.md
--
-- Esta migración es la única de la unificación que MODIFICA objetos que ya
-- existen en producción (compras.productos y public.perfiles). Se hace ahora
-- porque compras tiene 0 filas — es el momento más barato posible.
--
-- Re-ejecutable.

-- ===================================================================
-- catalogo.productos — un solo catálogo para Compras y Pedidos
-- ===================================================================
-- Vive en su propio schema a propósito: el producto no le pertenece ni a
-- Compras ni a Pedidos, lo comparten. Meterlo en uno haría que el otro
-- dependa de un contexto ajeno.
--
-- La estructura sale de pedidos.products (el maestro real, poblado desde las
-- listas de precios de proveedores) más meses_vida_util_minima_recepcion, que
-- es lo único que aportaba compras.productos y que Almacén necesita para
-- clasificar discrepancias de vencimiento.
--
-- NO guarda precios. El precio de compra es de Compras y el de venta es de
-- Pedidos: son conceptos distintos y viven en el contexto de cada uno.
create schema if not exists catalogo;

create table if not exists catalogo.productos (
  id uuid primary key default gen_random_uuid(),

  -- Identidad. Se unifica en `codigo` a secas, por consistencia con el resto
  -- del ERP (compras.proveedores.ruc, vendedores.codigo, zonas por código).
  -- El `codigo_interno` de pedidos y el `codigo` de compras eran los dos
  -- unique y ninguno tenía datos reales que preservar.
  codigo text not null unique,
  codigo_proveedor text,
  codigo_bonificacion text,

  descripcion text not null,
  presentacion text,
  marca text,
  principio_activo text,
  unidad_medida text not null default 'UND',

  proveedor_id uuid references compras.proveedores (id),

  -- Trazabilidad farmacéutica: la necesita Almacén al recibir.
  controla_lote boolean not null default false,
  controla_vencimiento boolean not null default false,
  -- Mínimo de meses hasta vencer exigido al recibir. Debajo de esto la
  -- recepción marca la línea como 'por_vencer'.
  meses_vida_util_minima_recepcion int not null default 12,

  peso_unitario numeric(10, 3),

  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  nota_estado text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists productos_estado_idx on catalogo.productos (estado);
create index if not exists productos_proveedor_idx on catalogo.productos (proveedor_id);
-- Búsqueda por descripción: el catálogo no cabe en un <select> y la UI usa
-- combobox con búsqueda en el servidor.
create index if not exists productos_descripcion_trgm_idx
  on catalogo.productos using gin (descripcion gin_trgm_ops);

alter table catalogo.productos enable row level security;

drop policy if exists productos_lectura on catalogo.productos;
create policy productos_lectura on catalogo.productos
  for select to authenticated using (public.mi_area() is not null);

-- Quien mantiene el catálogo: Compras lo carga desde las listas de precios,
-- Dirección Técnica valida lo farmacéutico.
drop policy if exists productos_escritura on catalogo.productos;
create policy productos_escritura on catalogo.productos
  for all to authenticated
  using (public.area_en('compras', 'direccion_tecnica', 'admin'))
  with check (public.area_en('compras', 'direccion_tecnica', 'admin'));

-- ===================================================================
-- Fusión de compras.productos en catalogo.productos
-- ===================================================================
-- compras.productos tiene 0 filas, así que no hay datos que migrar: se
-- reapunta la FK y se retira la tabla. El copy de datos igual va escrito por
-- si esta migración corre contra un entorno donde alguien alcanzó a cargar
-- algo.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'compras' and table_name = 'productos') then

    insert into catalogo.productos
      (codigo, descripcion, unidad_medida, meses_vida_util_minima_recepcion, estado)
    select p.codigo, p.nombre, p.unidad_medida, p.meses_vida_util_minima_recepcion,
           case when p.activo then 'activo' else 'inactivo' end
    from compras.productos p
    on conflict (codigo) do nothing;

    -- Reapuntar la FK de las líneas de orden de compra.
    alter table compras.ordenes_compra_items
      drop constraint if exists ordenes_compra_items_producto_id_fkey;
    alter table compras.ordenes_compra_items
      add constraint ordenes_compra_items_producto_id_fkey
      foreign key (producto_id) references catalogo.productos (id);

    drop table compras.productos;
  end if;
end $$;

-- ===================================================================
-- Un solo sistema de permisos: perfiles.rol con valores cerrados
-- ===================================================================
-- Hasta ahora `rol` era texto libre con default 'operativo'. Un typo en un rol
-- es una policy que falla en silencio, así que se cierra con un check.
--
-- El área sigue siendo la unidad organizacional de la persona; el rol es su
-- función dentro de ella. Eso permite distinguir al vendedor de campo del
-- administrador de pedidos, los dos en área 'ventas', y darle
-- 'control_pedidos' a Arlette aunque su área sea gestion_humana.

-- Normalizar antes del constraint: un CHECK nuevo se valida contra la tabla
-- entera al crearse, y cualquier fila fuera de la lista lo hace fallar.
update public.perfiles
   set rol = 'operativo'
 where rol not in ('operativo', 'admin', 'control_pedidos', 'vendedor', 'operaciones');

alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles
  add constraint perfiles_rol_check
  check (rol in ('operativo', 'admin', 'control_pedidos', 'vendedor', 'operaciones'));

-- ¿La persona actual tiene alguno de estos roles?
-- Complementa area_en(): el área sola no alcanza para separar dos funciones
-- dentro de la misma área.
create or replace function public.tiene_rol(variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select rol = any(p_roles) from public.perfiles where id = auth.uid()
  ), false);
$$;

-- ¿Puede registrar operaciones en nombre de otra persona?
-- Andrés (admin) y Arlette (control_pedidos) registran pedidos por un
-- vendedor; el vendedor solo registra los suyos.
create or replace function public.puede_actuar_por_otro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tiene_rol('admin', 'control_pedidos') or public.es_admin();
$$;
