-- Las salidas hacia atrás que faltaban: Caja Chica anular, Planilla
-- rechazar, Impuesto las dos (Sebas, 2026-09-19).
--
-- La bandeja de "Pendientes de aprobar" ofrece Rechazar y Anular, pero la
-- cobertura por tipo era despareja porque cada módulo se construyó por
-- separado y nadie la miró junta hasta ahora:
--
--            rechazar  anular
--   Caja Chica   sí      NO     -> el custodio no podía corregir su error
--   Planilla     NO      sí     -> Contabilidad no podía devolver la carga
--   Impuesto     NO      NO     -> el hueco más serio: sin vuelta atrás
--
-- Un impuesto con el periodo o el monto mal se quedaba ahí para siempre, o
-- se confirmaba y generaba una deuda falsa.
--
-- Recordatorio de qué es cada cosa, porque las columnas se parecen:
--   RECHAZAR  la autoridad revisó algo bien cargado y decide que no va.
--   ANULAR    el creador corrige un error de captura propio, antes de que
--             nadie lo haya revisado.
--
-- Ampliar un CHECK con un valor nuevo es seguro: ninguna fila existente
-- puede violarlo. La trampa del CHECK (se valida contra la tabla entera al
-- crearse) solo muerde cuando se RESTRINGE, no cuando se ensancha.
--
-- Re-ejecutable: columnas con `if not exists`, CHECKs con `drop constraint
-- if exists` antes de recrearlos.

-- ── Caja Chica: anular una reposición ────────────────────────────────────
alter table caja_chica.reposiciones
  drop constraint if exists reposiciones_estado_check;
alter table caja_chica.reposiciones
  add constraint reposiciones_estado_check check (estado = any (array[
    'pendiente_jefe', 'rechazada_jefe',
    'pendiente_contabilidad', 'rechazada_contabilidad',
    'aprobada', 'pagada', 'cerrada',
    'anulada'
  ]));

-- `creado_por` no existía: la tabla solo guardaba el fondo, y el custodio
-- se deducía de ahí. Para "nadie anula lo que no cargó" hace falta saber
-- quién la pidió. Las filas viejas quedan en null, y `puedeAnular` trata
-- null como "no sabemos quién fue" y deja pasar a la autoridad — es el
-- comportamiento correcto para datos previos a la columna.
alter table caja_chica.reposiciones add column if not exists creado_por uuid references auth.users(id);
alter table caja_chica.reposiciones add column if not exists anulado_por uuid references auth.users(id);
alter table caja_chica.reposiciones add column if not exists anulado_en timestamptz;
alter table caja_chica.reposiciones add column if not exists anulado_motivo text;

comment on column caja_chica.reposiciones.anulado_motivo is
  'Por que se anulo. Obligatorio al anular; lo escribe quien anula y viaja en el aviso.';

-- ── Planilla: rechazar una carga ─────────────────────────────────────────
alter table planilla.pagos_planilla
  drop constraint if exists pagos_planilla_estado_check;
alter table planilla.pagos_planilla
  add constraint pagos_planilla_estado_check check (estado = any (array[
    'pendiente_contabilidad', 'conforme', 'anulada',
    'rechazada'
  ]));

alter table planilla.pagos_planilla add column if not exists rechazado_por uuid references auth.users(id);
alter table planilla.pagos_planilla add column if not exists rechazado_en timestamptz;
alter table planilla.pagos_planilla add column if not exists rechazo_motivo text;

comment on column planilla.pagos_planilla.rechazo_motivo is
  'Por que Contabilidad devolvio la carga. Distinto de anulado_motivo: ahi Gestion Humana corrige lo suyo, aca Contabilidad decide que no procede.';

-- ── Impuestos: las dos ───────────────────────────────────────────────────
alter table impuestos.obligaciones_tributarias
  drop constraint if exists obligaciones_tributarias_estado_check;
alter table impuestos.obligaciones_tributarias
  add constraint obligaciones_tributarias_estado_check check (estado = any (array[
    'pendiente_contabilidad', 'conforme', 'en_propuesta', 'pagado',
    'rechazada', 'anulada'
  ]));

alter table impuestos.obligaciones_tributarias add column if not exists rechazado_por uuid references auth.users(id);
alter table impuestos.obligaciones_tributarias add column if not exists rechazado_en timestamptz;
alter table impuestos.obligaciones_tributarias add column if not exists rechazo_motivo text;
alter table impuestos.obligaciones_tributarias add column if not exists anulado_por uuid references auth.users(id);
alter table impuestos.obligaciones_tributarias add column if not exists anulado_en timestamptz;
alter table impuestos.obligaciones_tributarias add column if not exists anulado_motivo text;

comment on table impuestos.obligaciones_tributarias is
  'Cargas tributarias. Desde 0069 tienen salida hacia atras: rechazada (Contabilidad devuelve) y anulada (quien cargo corrige su error). Solo desde pendiente_contabilidad: despues ya hay obligacion y esa se anula desde su ficha.';
