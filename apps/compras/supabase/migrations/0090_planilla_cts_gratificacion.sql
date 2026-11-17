-- CTS y Gratificación como conceptos de Planilla.
-- (Pedido de Sebas para Arlette, 2026-11-17.)
--
-- Hasta hoy una CTS o una gratificación se cargaban como "Pago 3 del mes" de
-- la planilla: Tesorería no sabía que era una CTS —que no va a la cuenta
-- sueldo sino a la cuenta CTS de cada trabajador— y el reporte no las
-- distinguía de un reintegro.
--
-- Las dos son transferencias masivas como la planilla, pero UNA por mes (la
-- CTS en mayo y noviembre, la gratificación en julio y diciembre): no tienen
-- quincena (secuencia) ni trabajador. Su único es (concepto, periodo).
--
-- Re-ejecutable.

alter table planilla.pagos_planilla
  drop constraint if exists pagos_planilla_concepto_check;
alter table planilla.pagos_planilla
  add constraint pagos_planilla_concepto_check
    check (concepto in ('planilla', 'cts', 'gratificacion', 'lbs'));

-- Las formas válidas de una fila. Las existentes son planilla o lbs y
-- cumplen sin normalizar.
alter table planilla.pagos_planilla
  drop constraint if exists pagos_planilla_forma_check;
alter table planilla.pagos_planilla
  add constraint pagos_planilla_forma_check check (
    (concepto = 'planilla' and secuencia is not null and trabajador is null)
    or
    (concepto in ('cts', 'gratificacion') and secuencia is null and trabajador is null)
    or
    (concepto = 'lbs' and secuencia is null and nullif(btrim(trabajador), '') is not null)
  );

-- Una CTS y una gratificación por mes, como la quincena de la planilla. Una
-- anulada o rechazada no ocupa el lugar: se vuelve a cargar corregida.
create unique index if not exists pagos_planilla_periodo_concepto_unico
  on planilla.pagos_planilla (concepto, periodo)
  where concepto in ('cts', 'gratificacion') and estado not in ('anulada', 'rechazada');

comment on column planilla.pagos_planilla.concepto is
  'planilla = transferencia masiva (usa secuencia). cts / gratificacion = masivas, una por mes (0090). lbs = liquidación de beneficios sociales a UNA persona (usa trabajador).';
