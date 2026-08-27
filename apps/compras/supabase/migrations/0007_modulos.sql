-- Pantalla de módulos: la capa de navegación por encima de todas las apps.
--
-- "Módulo" no es un Bounded Context de negocio — es una app del ERP a la que
-- una persona llega según su área. Quién ve qué vive en datos y no en código
-- a propósito: ajustar el acceso tiene que ser un insert/delete, no un
-- deploy. Eso importa especialmente para Cobranzas, cuya lista todavía
-- depende de la tarea pendiente de autorización de sus rutas.

create table if not exists public.modulos (
  id          text primary key,
  nombre      text not null,
  descripcion text not null,
  ruta        text not null,
  icono       text not null,
  -- Un módulo que todavía no funciona se muestra en gris, sin botón. Es
  -- mejor que una tarjeta que promete y deja a la persona en una pantalla
  -- rota o en un segundo login.
  disponible  boolean not null default true,
  orden       int not null default 0
);

create table if not exists public.modulo_areas_permitidas (
  modulo_id text not null references public.modulos(id) on delete cascade,
  area      text not null,
  primary key (modulo_id, area)
);

insert into public.modulos (id, nombre, descripcion, ruta, icono, disponible, orden) values
  ('cobranzas', 'Cobranzas',       'Cuentas por cobrar, pagos y conciliación bancaria.', '/cobranzas', 'billetera', true,  1),
  ('pedidos',   'Pedidos',         'Toma de pedidos, despacho y facturación.',           '/pedidos',   'caja',      false, 2),
  ('compras',   'Compras y Pagos', 'Órdenes de compra, gastos, anticipos y pagos.',      '/compras',   'carrito',   true,  3)
on conflict (id) do update set
  nombre = excluded.nombre, descripcion = excluded.descripcion,
  ruta = excluded.ruta, icono = excluded.icono, orden = excluded.orden;

-- `disponible` NO se pisa en el on conflict: activar Pedidos es un update
-- puntual el día que funcione de punta a punta, y no lo revierte un
-- re-run de esta migración.

insert into public.modulo_areas_permitidas (modulo_id, area) values
  ('cobranzas','admin'), ('cobranzas','contabilidad'), ('cobranzas','tesoreria'), ('cobranzas','gerencia'),
  ('pedidos','admin'), ('pedidos','ventas'), ('pedidos','gerencia'), ('pedidos','almacen'),
  -- Compras lo ve todo el mundo: cualquier empleado puede necesitar un
  -- reembolso, un anticipo o una Orden de Servicio desde su área.
  ('compras','admin'), ('compras','compras'), ('compras','almacen'), ('compras','contabilidad'),
  ('compras','tesoreria'), ('compras','gerencia'), ('compras','gestion_humana'), ('compras','legal'),
  ('compras','direccion_tecnica'), ('compras','ventas'), ('compras','otro')
on conflict do nothing;

alter table public.modulos                 enable row level security;
alter table public.modulo_areas_permitidas enable row level security;

-- Catálogo de navegación: cualquiera con sesión lo lee. No hay nada
-- sensible acá, y el filtrado por área lo hace la consulta de la pantalla.
-- Escribir es tarea de administración, por service role o desde el SQL
-- editor — no hay policy de insert/update/delete a propósito.
drop policy if exists modulos_lectura on public.modulos;
create policy modulos_lectura on public.modulos
  for select to authenticated using (true);

drop policy if exists modulo_areas_lectura on public.modulo_areas_permitidas;
create policy modulo_areas_lectura on public.modulo_areas_permitidas
  for select to authenticated using (true);
