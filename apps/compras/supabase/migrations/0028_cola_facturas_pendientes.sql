-- Cola de facturas de proveedor que llegan ANTES que la mercadería, y
-- también el registro crudo de TODA factura de compra registrada por el
-- flujo nuevo de "Registrar factura" (app/facturas/nueva), sea que concilie
-- de una o quede esperando (ver services/facturas-pendientes.ts).
--
-- Contexto de negocio (decidido con el usuario, no renegociable): una Orden
-- de Compra puede generar VARIAS obligaciones de pago — una por cada
-- factura parcial que factura el proveedor — y una factura puede cubrir
-- VARIAS recepciones/guías físicas (no es 1:1 factura↔recepción). Cuando
-- llega la factura y ya hay recepción(es) que la respaldan, concilia de
-- inmediato (services/facturas-pendientes.ts::registrarFacturaCompra crea
-- la obligación ahí mismo). Si llega antes que la mercadería, esta fila
-- queda en 'esperando_mercaderia' sin obligación — cuando Almacén registra
-- la recepción correspondiente, services/recepciones.ts dispara la
-- conciliación sola (mismo backend en TypeScript, nunca un trigger SQL,
-- siguiendo el patrón ya establecido en este módulo — sección 8 del
-- documento maestro).
--
-- 'excepcion' es el tercer estado: la conciliación SÍ corrió (con o sin
-- espera previa) pero lo facturado en alguna línea superó lo verificado
-- (`ordenes_compra_items.cantidad_recibida`, que ya excluye rechazados/
-- dañados/producto equivocado — ver el comentario de esa columna en
-- 0001_compras_pagos_schemas.sql y services/recepciones.ts). Eso NO bloquea
-- la creación de la obligación (se crea igual por el monto verificado,
-- min(facturado, recibido) × precio de la OC) — la fila queda en
-- 'excepcion' con `obligacion_id` ya seteado, como bandeja de revisión para
-- Contabilidad (aprobar el monto verificado, o dejarla pendiente).
--
-- `lineas` guarda las cantidades/precios facturados por línea de OC tal
-- como los tipeó (o pre-llenó el OCR) quien registró la factura — hace
-- falta guardarlas crudas porque si la fila queda 'esperando_mercaderia' la
-- conciliación real recién corre después, cuando llegue la recepción.
-- Formato: [{ "ocItemId": uuid, "cantidadFacturada": number, "precioFacturado": number }, ...]
--
-- Prospectivo, sin backfill: arranca vacía. Las obligaciones YA EXISTENTES
-- (creadas con el flujo viejo, un recepcion_id directo vía
-- registrarObligacionDesdeRecepcion) no generan fila acá ni se tocan.

create table if not exists cuentas_x_pagar.facturas_pendientes (
  id uuid primary key default gen_random_uuid(),
  oc_id uuid not null references compras.ordenes_compra(id),
  numero_factura text,
  fecha_factura date,
  ruc text,
  proveedor_nombre_leido text,
  base_imponible numeric(14,2),
  igv numeric(14,2),
  total numeric(14,2),
  porcentaje_detraccion numeric(5,2),
  monto_detraccion numeric(14,2),
  tasa_detraccion_id uuid references cuentas_x_pagar.tasas_detraccion(id),
  tipo_cambio numeric(8,4),
  -- informativa: NO participa del cálculo de fecha_vencimiento_real (esa
  -- sale de la fecha de conformidad de la(s) recepción(es), regla 3).
  fecha_recepcion_factura date,
  lineas jsonb not null default '[]'::jsonb,
  storage_path text,
  estado text not null default 'esperando_mercaderia' check (estado in (
    'esperando_mercaderia', 'conciliada', 'excepcion'
  )),
  motivo_excepcion text,
  obligacion_id uuid references cuentas_x_pagar.obligaciones(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists facturas_pendientes_oc_estado_idx
  on cuentas_x_pagar.facturas_pendientes (oc_id, estado);

alter table cuentas_x_pagar.facturas_pendientes enable row level security;

-- Mismo criterio que el resto del módulo bajo acceso abierto temporal
-- (0025_acceso_temporal_abierto.sql): cualquier usuario interno autenticado
-- con fila en public.perfiles puede ver y usar esta tabla mientras
-- `compras.flags.acceso_abierto_temporal` siga en true.
drop policy if exists facturas_pendientes_acceso_temporal on cuentas_x_pagar.facturas_pendientes;
create policy facturas_pendientes_acceso_temporal on cuentas_x_pagar.facturas_pendientes
  for all to authenticated
  using (public.compras_acceso_abierto())
  with check (public.compras_acceso_abierto());
