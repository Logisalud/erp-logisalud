-- Aplicado directamente en Supabase el 2026-08-14; este archivo documenta la migración.
-- Distingue el voucher del cobro en efectivo (voucher_path, ya existente) del
-- voucher del depósito bancario (nuevo), para mostrar el historial completo
-- del pago en efectivo en /registrar-pago y /efectivo-por-depositar.

alter table pagos add column voucher_deposito_path text;
