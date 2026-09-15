-- 0057 — Rastro de reemplazo de la constancia de un pago.
--
-- Sebas subió la foto equivocada en un pago del backlog ya registrado. No
-- hay ningún camino hoy para corregirlo: `cuentas_x_pagar.pagos` NUNCA se
-- actualiza — el código solo hace INSERT (services/pagos.ts,
-- services/pago-historico.ts) y un DELETE de rollback. La única salida
-- habría sido SQL directo en producción.
--
-- POR QUÉ EL RASTRO NO ES OPCIONAL: el voucher es la evidencia de que ese
-- desembolso ocurrió. Cambiar el archivo de un pago ya registrado es
-- reemplazar el respaldo documental de una salida de dinero. Es un caso
-- legítimo —subir la foto equivocada pasa— pero la diferencia entre
-- "corregir" y "alterar" es exactamente si queda registrado quién y cuándo.
-- `pagos` no tenía NINGUNA columna de auditoría, a diferencia de
-- `obligaciones` (que tiene editado_por/en desde la 0052).
--
-- El archivo viejo NO se borra: queda huérfano en Storage pero presente.
-- Borrar la evidencia anterior sería lo contrario de lo que busca el rastro.
-- (Además la policy de borrado de `legajos-pagos` es de contabilidad/admin
-- mientras que la de escritura es de tesoreria/admin: quien sube no
-- necesariamente puede borrar.)
--
-- Re-ejecutable: `if not exists`.

alter table cuentas_x_pagar.pagos
  add column if not exists voucher_reemplazado_por uuid references public.perfiles(id),
  add column if not exists voucher_reemplazado_en timestamptz,
  -- Obligatorio en la aplicación, no en la base: una fila vieja sin
  -- reemplazos tiene las tres columnas en null, y un NOT NULL las rompería.
  add column if not exists voucher_reemplazado_motivo text,
  -- CUÁL de los dos archivos se reemplazó. El botón cubre el voucher y el
  -- comprobante de detracción, y "Constancia reemplazada" a secas dejaría
  -- sin saber a cuál se refiere — que es justo lo que un rastro no debe
  -- hacer.
  add column if not exists voucher_reemplazado_cual text
    check (voucher_reemplazado_cual in ('voucher', 'detraccion'));
