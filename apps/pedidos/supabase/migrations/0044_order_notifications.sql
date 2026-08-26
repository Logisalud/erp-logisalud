-- Notificación por correo al enviar un pedido (DRAFT -> SUBMITTED).
-- Reemplaza la idea del PDF descargable: el mismo contenido viaja por
-- correo a una lista de destinatarios administrada por el administrador.
--
-- Incluye además el número de pedido legible, que el modelo no tenía:
-- `orders` solo se identificaba por uuid, y un uuid no sirve como
-- referencia en el asunto de un correo ni para que Operaciones o
-- Facturación hablen del pedido por teléfono.

begin;

-- ---------------------------------------------------------------------
-- 1. Número de pedido legible
-- ---------------------------------------------------------------------

-- `generated always as identity` numera también las filas que ya existen
-- al aplicar la migración, así que no hace falta backfill aparte. Es
-- `always` y no `by default` a propósito: el número lo asigna la BD,
-- nunca el caller.
alter table pedidos.orders
  add column numero bigint generated always as identity;

alter table pedidos.orders
  add constraint orders_numero_key unique (numero);

comment on column pedidos.orders.numero is
  'Número de pedido legible para humanos. Correlativo global asignado por '
  'la BD al crear el pedido (incluido el borrador). No es un número de '
  'comprobante fiscal — ese lo emite el proveedor de facturación al despachar.';

-- ---------------------------------------------------------------------
-- 2. Destinatarios de la notificación
-- ---------------------------------------------------------------------

create table pedidos.order_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nombre_referencial text,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  -- Validación mínima de forma; la de verdad la hace el proveedor de
  -- correo al intentar entregar. No se pretende validar RFC 5322 con un
  -- check constraint.
  constraint order_notification_recipients_email_forma
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

-- Case-insensitive: "Facturacion@logisalud.com" y el mismo en minúsculas
-- son el mismo buzón, y duplicarlo mandaría el correo dos veces.
create unique index order_notification_recipients_email_key
  on pedidos.order_notification_recipients (lower(email));

create index order_notification_recipients_activo_idx
  on pedidos.order_notification_recipients (activo)
  where activo;

alter table pedidos.order_notification_recipients enable row level security;

-- Solo el administrador gestiona la lista. No hay policy para otros
-- roles ni de lectura: quién recibe copia de los pedidos es
-- configuración administrativa. El envío en sí lee la tabla con la
-- service role key, que no pasa por RLS.
create policy "order_notification_recipients_admin"
  on pedidos.order_notification_recipients for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());

-- ---------------------------------------------------------------------
-- 3. Bitácora de notificaciones
-- ---------------------------------------------------------------------

-- Separada de audit_logs a propósito: audit_logs registra acciones de
-- negocio de un actor humano, y esto es el resultado de un efecto
-- externo (la llamada al proveedor de correo) que puede fallar sin que
-- nadie haya hecho nada mal. Tener la tabla aparte permite listar
-- "qué correos fallaron" sin filtrar por texto dentro de un jsonb.
create table pedidos.notification_logs (
  id bigint generated always as identity primary key,
  order_id uuid references pedidos.orders (id) on delete set null,
  tipo text not null default 'pedido_enviado'
    check (tipo in ('pedido_enviado')),
  estado text not null
    check (estado in ('enviado', 'fallido', 'sin_destinatarios')),
  destinatarios text[] not null default '{}',
  proveedor text,
  proveedor_message_id text,
  error_mensaje text,
  created_at timestamptz not null default now()
);

create index notification_logs_order_idx on pedidos.notification_logs (order_id);
create index notification_logs_estado_idx on pedidos.notification_logs (estado, created_at desc);

alter table pedidos.notification_logs enable row level security;

-- Solo lectura, y solo para administrador. La escritura la hace el
-- servicio con la service role key: si un fallo de envío dependiera de
-- una policy, el propio registro del fallo podría fallar.
create policy "notification_logs_select_admin"
  on pedidos.notification_logs for select
  to authenticated
  using (pedidos.is_admin());

commit;
