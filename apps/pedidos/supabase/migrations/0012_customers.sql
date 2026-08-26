-- Clientes. Flujo de "cliente nuevo" (ver docs/business-rules.md):
-- un vendedor solo puede insertar en estado PENDIENTE_DE_VALIDACION;
-- solo control_pedidos o administrador pueden cambiar el estado
-- (aprobar/rechazar), vía UPDATE — el vendedor no tiene policy de
-- update sobre esta tabla, así que no puede editar lo ya creado ni
-- aprobarlo él mismo, aunque sea el solicitante.
--
-- solicitado_por / validado_por / fecha_validacion no estaban en la
-- lista de columnas del PRD; se agregan porque el flujo de aprobación
-- descrito (punto g) no es rastreable sin saber quién solicitó y quién
-- validó. Ver resumen de supuestos.

create extension if not exists pgcrypto;

create table pedidos.customers (
  id uuid primary key default gen_random_uuid(),
  ruc_o_documento text not null unique,
  razon_social text not null,
  nombre_comercial text,
  tipo_comprobante_permitido text not null default 'FACTURA'
    check (tipo_comprobante_permitido in ('FACTURA', 'BOLETA', 'FACTURA_O_BOLETA')),
  canal_id smallint references pedidos.sales_channels (id),
  zona_id smallint references pedidos.zones (id),
  whatsapp text,
  condicion_pago_habitual_id smallint references pedidos.payment_terms (id),
  estado text not null default 'PENDIENTE_DE_VALIDACION'
    check (estado in ('PENDIENTE_DE_VALIDACION', 'ACTIVO', 'RECHAZADO', 'INACTIVO')),
  es_agente_retencion boolean not null default false,
  fecha_ultima_validacion_tributaria date,
  solicitado_por uuid references auth.users (id),
  validado_por uuid references auth.users (id),
  fecha_validacion timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_zona_idx on pedidos.customers (zona_id);
create index customers_estado_idx on pedidos.customers (estado);

alter table pedidos.customers enable row level security;

create policy "customers_select"
  on pedidos.customers for select
  to authenticated
  using (
    pedidos.is_admin()
    or pedidos.has_role('control_pedidos')
    or pedidos.has_role('operaciones')
    or pedidos.has_role('aprobador_comercial')
    or (zona_id in (select pedidos.current_user_zone_ids()))
  );

-- El vendedor solo puede crear solicitudes de cliente nuevo, siempre
-- en PENDIENTE_DE_VALIDACION y a su propio nombre.
create policy "customers_insert_vendedor"
  on pedidos.customers for insert
  to authenticated
  with check (
    pedidos.has_role('vendedor')
    and estado = 'PENDIENTE_DE_VALIDACION'
    and solicitado_por = auth.uid()
  );

create policy "customers_insert_control_o_admin"
  on pedidos.customers for insert
  to authenticated
  with check (pedidos.is_admin() or pedidos.has_role('control_pedidos'));

-- Solo control_pedidos o administrador pueden actualizar (incluye
-- aprobar/rechazar cambiando "estado"). El vendedor no tiene policy de
-- update: no puede editar libremente ni autoaprobar su solicitud.
create policy "customers_update_control_o_admin"
  on pedidos.customers for update
  to authenticated
  using (pedidos.is_admin() or pedidos.has_role('control_pedidos'))
  with check (pedidos.is_admin() or pedidos.has_role('control_pedidos'));
