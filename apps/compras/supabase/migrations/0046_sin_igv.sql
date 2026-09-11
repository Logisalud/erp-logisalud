-- "Sin IGV": distinguir una operación que genuinamente no está gravada de
-- un IGV que quedó en 0 por otra razón.
--
-- Por qué un booleano y no alcanza con `igv = 0`: la columna `igv` es
-- `numeric not null default 0`, y ese default ya causó un bug real en este
-- módulo (ver el comentario "Pieza B2" en services/obligaciones.ts) — todo
-- Pago Directo quedaba con IGV 0 porque el insert no mandaba la columna, y
-- como `total` y `neto_a_pagar` son generadas sobre (base + igv), Tesorería
-- veía 18% de menos. O sea: en esta tabla un 0 es alcanzable por accidente,
-- así que hoy conviven tres significados en el mismo valor ("no aplica",
-- "no se cargó", "el insert se lo olvidó"). El dato "esto genuinamente no
-- lleva IGV" solo existe en el momento de la captura; si no se guarda ahí,
-- no se puede reconstruir después.
--
-- El idioma de esta tabla para "no aplica" es NULL (`porcentaje_detraccion`
-- es null cuando no hay detracción), pero `igv` no puede usarlo: es NOT NULL
-- y alimenta dos columnas generadas que habría que envolver en coalesce.

alter table cuentas_x_pagar.obligaciones
  add column if not exists sin_igv boolean not null default false;

comment on column cuentas_x_pagar.obligaciones.sin_igv is
  'La operación no está gravada con IGV (ej. alquiler a persona natural). Declarado por quien registra, no inferido de igv = 0.';

-- Que el flag y el número no puedan contradecirse. Seguro contra la trampa
-- del CHECK que se valida contra la tabla entera: con `default false` la
-- condición da verdadera para toda fila existente, así que no puede fallar.
alter table cuentas_x_pagar.obligaciones
  drop constraint if exists obligaciones_sin_igv_coherente;
alter table cuentas_x_pagar.obligaciones
  add constraint obligaciones_sin_igv_coherente check (not (sin_igv and igv <> 0));
