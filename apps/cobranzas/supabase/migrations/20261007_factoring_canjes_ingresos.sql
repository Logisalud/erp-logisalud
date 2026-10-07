-- Aplicado directamente en Supabase el 2026-10-07; este archivo documenta la
-- migración (igual que 20260813_pagos_medio_cobro_efectivo.sql).
--
-- Rediseño de factoring en 2 pasos (reemplaza el diseño de
-- 20261005_factoring.sql, que quedó sin usar — ver abajo):
--
--   Paso 1 (factoring_canjes/factoring_canje_facturas): canjear facturas a
--   factoring es solo una etiqueta — NO toca saldo_pendiente. Por eso estas
--   tablas no aparecen en v_cobros/v_saldos (verificado: ninguna las
--   referencia).
--
--   Paso 2 (factoring_ingresos/factoring_ingreso_facturas/factoring_gastos):
--   el ingreso real al banco SÍ crea un pago real en `pagos` por cada
--   factura — el saldo baja a 0 por el mecanismo normal de pagos, no por
--   una rama especial de v_cobros. factoring_ingreso_facturas.pago_id
--   identifica sin ambigüedad qué pagos vienen de factoring.
--
-- Las tablas viejas (factoring_operaciones/factoring_facturas, de
-- 20261005_factoring.sql) quedan huérfanas sin usar — solo tenían 1
-- registro de prueba ya anulado, nada real que migrar. La rama de
-- "saldada" que agregó esa migración a v_cobros/v_saldos (columnas
-- factorizado/factoring_entidad/factoring_fecha) tampoco se tocó: queda
-- inerte (nunca más se inserta en esas tablas), sin riesgo porque no se
-- recreó ninguna vista en este cambio.
create table factoring_canjes (
  id              uuid primary key default gen_random_uuid(),
  cliente_ruc     text not null references clientes(ruc),
  fecha_canje     date not null,
  observaciones   text,
  registrado_por  text,
  anulado         boolean not null default false,
  anulado_motivo  text,
  anulado_en      timestamptz,
  created_at      timestamptz not null default now()
);

create table factoring_canje_facturas (
  id            uuid primary key default gen_random_uuid(),
  canje_id      uuid not null references factoring_canjes(id) on delete cascade,
  documento_id  uuid not null references documentos(id),
  created_at    timestamptz not null default now()
);
create index idx_factoring_canje_facturas_documento on factoring_canje_facturas(documento_id);
create index idx_factoring_canje_facturas_canje on factoring_canje_facturas(canje_id);

create table factoring_ingresos (
  id                    uuid primary key default gen_random_uuid(),
  entidad               text not null,
  fecha_ingreso         date not null,
  monto_neto_recibido   numeric not null check (monto_neto_recibido >= 0),
  referencia            text,
  observaciones         text,
  registrado_por        text,
  anulado               boolean not null default false,
  anulado_motivo        text,
  anulado_en            timestamptz,
  created_at            timestamptz not null default now()
);

create table factoring_ingreso_facturas (
  id                  uuid primary key default gen_random_uuid(),
  ingreso_id          uuid not null references factoring_ingresos(id) on delete cascade,
  documento_id        uuid not null references documentos(id),
  monto_factorizado   numeric not null check (monto_factorizado > 0),
  -- El pago real creado en `pagos`. ON DELETE SET NULL: al anular el
  -- ingreso se borra el pago (el saldo vuelve), el registro de la factura
  -- no desaparece.
  pago_id             uuid references pagos(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index idx_factoring_ingreso_facturas_documento on factoring_ingreso_facturas(documento_id);
create index idx_factoring_ingreso_facturas_ingreso on factoring_ingreso_facturas(ingreso_id);

create table factoring_gastos (
  id              uuid primary key default gen_random_uuid(),
  ingreso_id      uuid not null references factoring_ingresos(id) on delete cascade,
  tipo            text not null check (tipo in ('garantia', 'comision', 'otros')),
  monto           numeric not null check (monto > 0),
  -- Solo aplica a 'comision'
  incluye_igv     boolean,
  numero_factura  text,
  -- Solo aplica a 'garantia'
  recuperado      boolean not null default false,
  observaciones   text,
  created_at      timestamptz not null default now()
);
create index idx_factoring_gastos_ingreso on factoring_gastos(ingreso_id);
