-- Historial de pagos eliminados.
--
-- En agosto de 2026 se decidió que borrar un pago fuera solo de admin, con
-- un argumento concreto: "un pago mal cargado se corrige con PATCH;
-- borrarlo lo saca del historial". El argumento sigue siendo cierto — esta
-- app no tiene bitácora de auditoría —, así que antes de ampliar el permiso
-- a Tesorería se le da al borrado la red que le faltaba.
--
-- Cada eliminación deja la fila completa acá, con quién la borró y cuándo.
-- Un pago borrado baja del historial pero no desaparece: el saldo de la
-- factura sube, y en esta tabla queda por qué.
--
-- `pago` guarda la fila entera como jsonb en vez de replicar las 20
-- columnas de `pagos`: si mañana se agrega una columna allá, esta tabla no
-- queda contando una historia incompleta sin que nadie se entere. Las tres
-- columnas planas son las que se consultan de verdad (qué factura, cuánto,
-- de cuándo) y así no hace falta abrir el jsonb para buscar.

create table if not exists public.pagos_eliminados (
  id bigint generated always as identity primary key,
  pago_id uuid not null,
  documento_id uuid,
  monto numeric(14,2),
  fecha_pago date,
  pago jsonb not null,
  eliminado_por text,
  eliminado_en timestamptz not null default now()
);

create index if not exists pagos_eliminados_documento_idx
  on public.pagos_eliminados (documento_id, eliminado_en desc);

create index if not exists pagos_eliminados_fecha_idx
  on public.pagos_eliminados (eliminado_en desc);

-- RLS activado y sin policies, igual que el resto de las tablas de esta
-- app: todo el acceso pasa por el service role desde las rutas.
alter table public.pagos_eliminados enable row level security;
