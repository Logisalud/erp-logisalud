-- Fase 1.6 (parte 2/2): el registro de Fraccionamiento SUNAT pedía el
-- impuesto que se está fraccionando (IGV, Renta, ITAN — catálogo de
-- impuestos.tipos_impuesto, sembrado en la migración 0020) como desplegable,
-- distinto de `tipo` (que ya existe y es la MODALIDAD del fraccionamiento:
-- "IGV Justo", "REFT", texto libre) — son dos cosas distintas, no se
-- reutiliza esa columna. También faltaba la fecha de resolución OBLIGATORIA
-- (distinta de fecha_resolucion, que es la fecha de la resolución SUNAT en
-- sí) para la alerta de "cuota vencida en riesgo de perder el beneficio"
-- (regla 10 del documento maestro).

alter table financiamiento.fraccionamientos_sunat
  add column if not exists tipo_impuesto_id uuid references impuestos.tipos_impuesto(id);

alter table financiamiento.fraccionamientos_sunat
  add column if not exists fecha_resolucion_obligatoria date;
