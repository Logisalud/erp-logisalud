-- LBS — Liquidación de Beneficios Sociales — como concepto de Planilla.
-- (Pedido de Arlette vía Sebas, 2026-09-30.)
--
-- Hasta ahora un pago de planilla era siempre la transferencia masiva a
-- todos los trabajadores, identificada por `secuencia` (1ra quincena, fin de
-- mes, pago 3…). Una LBS es otra cosa en dos sentidos que el modelo no
-- podía expresar:
--
--   1. Se le paga a UNA persona — la que se fue —, no a todos. Sin el nombre,
--      Tesorería vería "Planilla · setiembre" y no sabría a quién pagarle.
--   2. En un mismo mes puede haber varias (dos personas que se van). Con el
--      único por (periodo, secuencia), la segunda chocaría con la primera o
--      habría que numerarlas como "Pago 3", "Pago 4" y perder qué eran.
--
-- Por eso: `concepto` distingue planilla de LBS, `trabajador` guarda a quién,
-- y `secuencia` pasa a ser solo de la planilla (null en una LBS, donde no
-- significa nada). Un CHECK amarra las dos formas válidas, así una fila a
-- medio camino no puede existir.
--
-- Re-ejecutable.

alter table planilla.pagos_planilla
  add column if not exists concepto text not null default 'planilla';

alter table planilla.pagos_planilla
  drop constraint if exists pagos_planilla_concepto_check;
alter table planilla.pagos_planilla
  add constraint pagos_planilla_concepto_check check (concepto in ('planilla', 'lbs'));

-- A quién se le paga la LBS. Texto libre y no una FK a perfiles: el que se
-- va casi nunca tuvo usuario en el ERP (la mayoría son de almacén o ventas
-- de calle), y quien sí lo tuvo lo pierde al irse.
alter table planilla.pagos_planilla
  add column if not exists trabajador text;

alter table planilla.pagos_planilla
  alter column secuencia drop not null;

-- Las dos formas válidas de una fila. Las filas existentes son todas
-- `planilla` con secuencia (el default de arriba las marca así), así que el
-- CHECK valida contra la tabla entera sin tener que normalizar nada antes.
alter table planilla.pagos_planilla
  drop constraint if exists pagos_planilla_forma_check;
alter table planilla.pagos_planilla
  add constraint pagos_planilla_forma_check check (
    (concepto = 'planilla' and secuencia is not null)
    or
    (concepto = 'lbs' and secuencia is null and nullif(btrim(trabajador), '') is not null)
  );

-- ── El índice único, rehecho ────────────────────────────────────────────
-- Dos cambios:
--
-- (a) Ahora es solo para la planilla. Una LBS no tiene secuencia, y dos LBS
--     del mismo mes a personas distintas son normales — no hay par que
--     proteger.
--
-- (b) Excluye también `rechazada`, no solo `anulada`. La 0069 agregó el
--     rechazo pero no tocó este índice, así que una quincena rechazada por
--     Contabilidad quedaba ocupando el par y Arlette no podía volver a
--     cargarla corregida: justo lo que el rechazo le pide que haga. Nadie lo
--     pisó todavía (a la fecha no hay ninguna carga rechazada).
drop index if exists planilla.pagos_planilla_periodo_secuencia_unico;
create unique index if not exists pagos_planilla_periodo_secuencia_unico
  on planilla.pagos_planilla (periodo, secuencia)
  where concepto = 'planilla' and estado not in ('anulada', 'rechazada');

comment on column planilla.pagos_planilla.concepto is
  'planilla = transferencia masiva a todos (usa secuencia). lbs = liquidación de beneficios sociales a UNA persona (usa trabajador). Migración 0076.';
comment on column planilla.pagos_planilla.trabajador is
  'Solo LBS: a quién se le liquida. Texto libre, no FK — el que se va casi nunca tuvo usuario en el ERP.';
