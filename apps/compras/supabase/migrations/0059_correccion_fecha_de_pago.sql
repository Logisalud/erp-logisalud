-- Corregir la fecha de un pago ya registrado.
--
-- El caso real: Mariela registró un pago a las 22:50 del 11/09 y quedó con
-- fecha 12/09 por el bug de zona horaria (arreglado en 0058 / domain/fecha.ts).
-- El bug ya no ocurre, pero los pagos que quedaron con la fecha corrida
-- siguen ahí y hay que poder arreglarlos.
--
-- Por qué NO va como un campo más de `reemplazarConstanciaPago`, que es el
-- otro mecanismo de corrección de un pago: reemplazar un archivo es INERTE
-- para los números —ningún reporte lee el storage_path—, mientras que
-- cambiar `fecha_pago` RECLASIFICA PLATA EN EL TIEMPO. La leen:
--
--   services/dashboard.ts                        "Pagado este mes" (gte/lte)
--   services/reportes-cuentas-por-pagar-detalle   historial + filtros Desde/Hasta
--   services/reportes-sabana.ts                   columna de fecha y "último pago"
--   services/historial-orden.ts                   la línea de tiempo
--
-- Mover un pago del 01/10 al 30/09 cambia DOS cierres mensuales de forma
-- retroactiva. Eso merece su propio registro, y la firma de
-- reemplazarConstanciaPago se mantiene sin ningún campo financiero a
-- propósito: es una garantía legible de que esa función no puede tocar plata.
--
-- `fecha_pago_corregida_de` NUNCA se sobrescribe (decisión explícita de
-- Sebas, 2026-09-15): siempre muestra la fecha con la que NACIÓ el pago, que
-- es la pregunta que se hace quien audita. El costo aceptado es que, en una
-- segunda corrección, el por/en/motivo de la primera se pierden. No se crea
-- tabla de historial: el módulo no tiene ninguna hoy, y agregar la primera
-- por un caso que esperamos raro sería adelantarse. Si Contabilidad pide el
-- trail completo para sustentar algo ante SUNAT, se evalúa entonces.
--
-- Sobre la revalidación: los `add column` son nullable y no revalidan nada,
-- pero el CHECK del final SÍ se valida contra la tabla entera al crearse —
-- es la trampa conocida del proyecto. Pasa porque en toda fila existente las
-- cuatro columnas nacen en null, o sea satisfacen la primera rama. No hace
-- falta normalizar nada antes. Re-ejecutable.

alter table cuentas_x_pagar.pagos
  add column if not exists fecha_pago_corregida_de date,
  add column if not exists fecha_pago_corregida_por uuid references public.perfiles(id),
  add column if not exists fecha_pago_corregida_en timestamptz,
  add column if not exists fecha_pago_corregida_motivo text;

comment on column cuentas_x_pagar.pagos.fecha_pago_corregida_de is
  'La fecha con la que nació el pago. Se escribe UNA sola vez, en la primera '
  'corrección, y no se sobrescribe nunca más. Null = nunca se corrigió.';

-- El gate real está en el servicio (corregirFechaDePago) y en la policy de
-- UPDATE de `pagos`. Esto es la red de abajo: que una corrección no pueda
-- quedar a medias registrada, en ninguna ruta de escritura.
alter table cuentas_x_pagar.pagos
  drop constraint if exists pagos_correccion_fecha_completa;

alter table cuentas_x_pagar.pagos
  add constraint pagos_correccion_fecha_completa check (
    -- o no hay corrección, o está completa: fecha original, quién, cuándo y por qué
    (fecha_pago_corregida_de is null
      and fecha_pago_corregida_por is null
      and fecha_pago_corregida_en is null
      and fecha_pago_corregida_motivo is null)
    or
    (fecha_pago_corregida_de is not null
      and fecha_pago_corregida_por is not null
      and fecha_pago_corregida_en is not null
      and fecha_pago_corregida_motivo is not null
      and btrim(fecha_pago_corregida_motivo) <> '')
  );
