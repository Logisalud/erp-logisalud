-- ===================================================================
-- 0064 — Varias guías de remisión por recepción, cada una con SU archivo
--
-- La 0062 dejó una asimetría: `numeros_guia text[]` acepta varios números,
-- pero `storage_path_guia_recibida text` guarda un solo archivo. Así que
-- Almacén podía escribir "G-001, G-002" y subir una sola foto — el legajo
-- quedaba incompleto sin que nada avisara.
--
-- POR QUÉ UNA TABLA HIJA Y NO UN SEGUNDO ARRAY: una guía es un PAR
-- (número + su archivo). Con dos arrays paralelos alineados por índice, el
-- día que alguien deja 3 números y 2 archivos ya no se sabe qué archivo es
-- de qué guía, y nada en la base lo impide. Acá cada fila es una guía
-- completa o no existe.
--
-- Riesgo de datos: ninguno. `almacen.recepciones` tiene 0 filas — nunca se
-- registró una recepción en producción.
--
-- `numeros_guia` y `storage_path_guia_recibida` quedan en la tabla SIN USO
-- (ver el comment de abajo). Retirarlas es una migración aparte: borrar
-- columnas es lo único de esto que no es reversible con un deploy.
-- ===================================================================

create table if not exists almacen.recepciones_guias (
  id uuid primary key default gen_random_uuid(),
  recepcion_id uuid not null references almacen.recepciones(id) on delete cascade,
  numero text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  -- Dos guías con el mismo número en una misma recepción es un error de
  -- tipeo, no un caso real.
  constraint recepciones_guias_numero_unico unique (recepcion_id, numero)
);

create index if not exists recepciones_guias_recepcion_idx
  on almacen.recepciones_guias (recepcion_id);

comment on table almacen.recepciones_guias is
  'Una fila por guía de remisión recibida: su número y su archivo escaneado. '
  'Reemplaza a recepciones.numeros_guia + storage_path_guia_recibida (0064), '
  'que quedaron sin uso porque no podían representar varias guías CON sus '
  'archivos.';

comment on column almacen.recepciones.numeros_guia is
  'SIN USO desde 0064 — las guías viven en almacen.recepciones_guias, cada '
  'una con su archivo.';

comment on column almacen.recepciones.storage_path_guia_recibida is
  'SIN USO desde 0064 — ver almacen.recepciones_guias.storage_path.';

-- RLS: mismas reglas que almacen.recepciones_items — lee cualquiera con
-- área (Contabilidad tiene que poder ver el legajo), escribe Almacén.
-- Una tabla nueva sin policies queda bloqueada salvo para admin, así que
-- esto no es opcional (ver CLAUDE.md).
alter table almacen.recepciones_guias enable row level security;

drop policy if exists recepciones_guias_lectura on almacen.recepciones_guias;
create policy recepciones_guias_lectura on almacen.recepciones_guias
  for select to authenticated using (public.mi_area() is not null);

drop policy if exists recepciones_guias_escritura on almacen.recepciones_guias;
create policy recepciones_guias_escritura on almacen.recepciones_guias
  for all to authenticated
  using (public.area_en('almacen','admin'))
  with check (public.area_en('almacen','admin'));

-- Grants al rol `authenticated`: sin esto PostgREST responde 403
-- `permission denied for schema/table`, aunque la policy esté bien.
select public.aplicar_grants_del_modulo();
