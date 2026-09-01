-- Tabla puente: una obligación de compra puede cubrir VARIAS recepciones
-- físicas (una factura no es 1:1 con una guía de recepción). El flujo
-- VIEJO (services/obligaciones.ts::registrarObligacionDesdeRecepcion) sigue
-- usando `cuentas_x_pagar.obligaciones.recepcion_id` directo, una sola
-- recepción por obligación — esa columna no se toca ni se borra. El flujo
-- NUEVO (services/facturas-pendientes.ts, vía
-- services/obligaciones.ts::crearObligacionCompraMultiRecepcion) deja
-- `recepcion_id` en null y en cambio inserta una fila acá por cada
-- recepción que la factura cubre.
--
-- Prospectivo, sin backfill: arranca vacía. No se crean filas para las
-- obligaciones ya existentes del flujo viejo.

create table if not exists cuentas_x_pagar.obligacion_recepciones (
  obligacion_id uuid not null references cuentas_x_pagar.obligaciones(id) on delete cascade,
  recepcion_id uuid not null references almacen.recepciones(id),
  created_at timestamptz not null default now(),
  primary key (obligacion_id, recepcion_id)
);

create index if not exists obligacion_recepciones_recepcion_idx
  on cuentas_x_pagar.obligacion_recepciones (recepcion_id);

alter table cuentas_x_pagar.obligacion_recepciones enable row level security;

drop policy if exists obligacion_recepciones_acceso_temporal on cuentas_x_pagar.obligacion_recepciones;
create policy obligacion_recepciones_acceso_temporal on cuentas_x_pagar.obligacion_recepciones
  for all to authenticated
  using (public.compras_acceso_abierto())
  with check (public.compras_acceso_abierto());
