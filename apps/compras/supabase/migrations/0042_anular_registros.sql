-- Anular OC / OC bien / OS / Pago Directo / Anticipo / Reembolso por error de
-- captura (Mariela/Beatriz/Mily no tenían ninguna forma de rechazar un
-- registro ya creado). Diseño (sesión 2026-09-09, Opción A): el aviso de
-- creación sale síncrono en la misma Server Action que crea el registro, así
-- que la ventana de "antes del correo" es efectivamente cero — no hace falta
-- un hard delete condicional, solo un "Anular" (motivo obligatorio, estado
-- terminal, el registro queda) más un segundo correo avisando la anulación.
--
-- `compras.ordenes_compra` y `servicios.ordenes_servicio` ya tenían
-- 'anulada' en su CHECK de estado (sin usar) — acá se agregan las columnas
-- de auditoría y, para OS, las transiciones que faltaban.
--
-- `cuentas_x_pagar.obligaciones` y `gastos.solicitudes_gasto` son tablas
-- compartidas por muchos orígenes/flujos (9 y 3 respectivamente) — tocar su
-- CHECK de estado ahí es más riesgo del que justifica esta pieza, así que la
-- anulación de un Pago Directo y el rechazo de Anticipo/Reembolso se marcan
-- con columnas de auditoría sin cambiar `estado`.
--
-- `creador_correo` (en las 4 tablas de origen) es para poder mandarle copia
-- del correo de anulación a quien creó el registro sin necesitar la service
-- role key para resolver el email desde auth.users en un service de negocio.

alter table compras.ordenes_compra
  add column if not exists anulado_motivo text,
  add column if not exists anulado_por uuid references auth.users(id),
  add column if not exists anulado_en timestamptz,
  add column if not exists creador_correo text;

alter table servicios.ordenes_servicio
  add column if not exists anulado_motivo text,
  add column if not exists anulado_por uuid references auth.users(id),
  add column if not exists anulado_en timestamptz,
  add column if not exists creador_correo text;

alter table cuentas_x_pagar.obligaciones
  add column if not exists anulada_motivo text,
  add column if not exists anulada_por uuid references auth.users(id),
  add column if not exists anulada_en timestamptz,
  add column if not exists creador_correo text;

alter table gastos.solicitudes_gasto
  add column if not exists rechazo_motivo text,
  add column if not exists creador_correo text;
