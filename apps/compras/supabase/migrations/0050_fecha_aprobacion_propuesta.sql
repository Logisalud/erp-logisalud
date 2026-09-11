-- Cuándo se aprobó un lote de pago.
--
-- `propuestas_pago` solo tenía `created_at`, así que "Pagos por ejecutar"
-- medía la espera desde que Tesorería armó el lote y la pantalla decía
-- "Creada hace N días" para no afirmar un dato que no existía. La espera que
-- de verdad le importa a Tesorería arranca cuando Contabilidad aprueba: los
-- días que el lote pasó esperando aprobación no son su demora.
--
-- Nullable y SIN backfill a propósito. Las propuestas ya aprobadas antes de
-- esta migración no tienen forma de saber cuándo se aprobaron —no hay
-- historial de cambios de estado en esta tabla—, y rellenarlas con
-- `created_at` inventaría una fecha que parecería real. Se quedan en null y
-- la pantalla cae a "Creada hace…" solo para esas; las nuevas muestran
-- "Aprobada hace…".

alter table cuentas_x_pagar.propuestas_pago
  add column if not exists fecha_aprobacion timestamptz;

comment on column cuentas_x_pagar.propuestas_pago.fecha_aprobacion is
  'Cuándo Contabilidad aprobó el lote. La escribe aprobarPropuesta(). Null en las propuestas aprobadas antes de la migración 0050 — no se rellena con created_at para no inventar la fecha.';
