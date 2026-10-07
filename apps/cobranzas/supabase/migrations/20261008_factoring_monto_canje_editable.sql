-- Aplicado directamente en Supabase el 2026-10-08; este archivo documenta la
-- migración (igual que 20260813_pagos_medio_cobro_efectivo.sql).
--
-- Feedback de Mariela (Finanzas): el canje a factoring (Paso 1) no siempre
-- es el 100% de la factura — a veces se resta la retención o el factor
-- solo cubre un % del total. Se necesita un valor editable por factura al
-- momento de canjear ("valor nominal a factorizar"), no asumir siempre el
-- saldo_pendiente completo.
--
-- Tablas vacías al momento de aplicar (0 canjes reales registrados aún),
-- así que se agrega NOT NULL directo, sin backfill.
alter table factoring_canje_facturas
  add column monto_canje numeric not null default 0 check (monto_canje > 0);
alter table factoring_canje_facturas alter column monto_canje drop default;
