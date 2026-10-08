-- WMS Logisalud — migración 0004: entradas y calidad (Batch 2).
--
-- Ingresos (compra local, devolución, ingreso de cliente) → solicitud de ingreso
-- con historial → lotes → Acta de Recepción (generada, firmada, inmutable) →
-- confirmación (el inventario nace en Cuarentena) → Acta Organoléptica por
-- producto y lote (decide Katia) → expediente con faltantes.
--
-- Principios (los mismos del ledger):
--  · Nada se escribe con DML directo: solo con las funciones de este archivo
--    (security definer, con chequeo de rol adentro). Las policies solo dan lectura.
--  · Actas firmadas: inmutables. La de recepción solo pasa a ANULADA (con motivo)
--    y se emite otra vinculada; la organoléptica no se anula (lo que decidió ya
--    movió el estado: se corrige con un nuevo cambio hacia Bajas/Rechazados).
--  · Cada firma guarda el hash SHA-256 del contenido canónico del acta.
--  · Compras es la fuente de verdad de la compra local: el WMS guarda una COPIA de
--    lo consumido (snapshot) y avisa si después cambia (D-19: alerta, no cambio solo).
--
-- Re-ejecutable. Se aplica a mano (después de 0001–0003).

-- ─────────────────────────────────────────────────────────────────────────────
-- Parámetros nuevos
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.parametros (clave, valor, nota) values
  ('plazo_por_trasladar_horas', '24', 'D-28b: horas máximas de "Aprobado · por trasladar"; pasado el plazo se alerta al Jefe de Almacén. Valor definitivo: Katia y Charlie.'),
  ('muestreo_constante', '1', 'Muestra organoléptica = techo(raíz(unidades)) + esta constante (reglas-negocio.md; D-17 pendiente 6)'),
  ('kardex_codigo_formato', '', 'D-29: código controlado del formato de Kardex de Logisalud (vacío = por asignar)'),
  ('lote_dias_alerta_vencimiento', '90', 'D-30: días antes del vencimiento de un lote en que se alerta (valor definitivo: Katia)')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Correlativos (sin huecos: el incremento se deshace si la transacción falla)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.correlativos (
  clave text primary key,
  ultimo integer not null default 0
);
alter table wms.correlativos enable row level security;

create or replace function wms.siguiente_correlativo(p_clave text)
returns integer language plpgsql security definer set search_path = wms, pg_temp as $$
declare v integer;
begin
  insert into wms.correlativos (clave, ultimo) values (p_clave, 1)
  on conflict (clave) do update set ultimo = wms.correlativos.ultimo + 1
  returning ultimo into v;
  return v;
end $$;

create or replace function wms.muestra_organoleptica(p_unidades integer)
returns integer language sql stable set search_path = wms, pg_temp as $$
  select ceil(sqrt(greatest(p_unidades, 0)))::int
         + coalesce((select valor::int from wms.parametros where clave = 'muestreo_constante'), 1)
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Ingresos
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.ingresos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null references wms.origenes(codigo)
    check (tipo in ('COMPRA_LOCAL', 'DEVOLUCION', 'INGRESO_CLIENTE')),
  propietario_id uuid not null references wms.propietarios(id),
  estado text not null default 'BORRADOR' check (estado in ('BORRADOR', 'CONFIRMADO')),
  -- Compra local: la recepción de Compras que lo originó (única: una recepción = un ingreso).
  compra_recepcion_id uuid unique,
  oc_codigo text,
  contraparte_nombre text,                    -- proveedor o cliente
  contraparte_ruc text check (contraparte_ruc is null or contraparte_ruc ~ '^[0-9]{11}$'),
  guia_numero text,
  factura_numero text,
  -- Devolución: factura o boleta ORIGINAL (obligatoria).
  doc_original_tipo text check (doc_original_tipo in ('FACTURA', 'BOLETA')),
  doc_original_numero text,
  motivo text,
  snapshot_compras jsonb,                     -- copia de lo consumido de Compras
  -- Datos del acta que Compras no tiene (reglas-negocio.md, Recepción 7).
  temperatura_c numeric(4, 1),
  alerta_temperatura boolean not null default false,
  bultos integer check (bultos is null or bultos >= 0),
  paletas integer check (paletas is null or paletas >= 0),
  placa text,
  marca_vehiculo text,
  tipo_conteo text check (tipo_conteo in ('MUESTREO', 'TOTAL', 'OTROS')),
  hora_inicio timestamptz,
  hora_fin timestamptz,
  verificaciones jsonb not null default '{}'::jsonb,
  observaciones text,
  expediente_id uuid,
  movimiento_id uuid references wms.movimientos(id),
  creado_por uuid,
  creado_en timestamptz not null default now(),
  confirmado_en timestamptz,
  -- La devolución sin factura o boleta original no existe (test 3).
  check (tipo <> 'DEVOLUCION' or (doc_original_tipo is not null and nullif(trim(doc_original_numero), '') is not null)),
  check (tipo <> 'COMPRA_LOCAL' or compra_recepcion_id is not null),
  check (tipo <> 'INGRESO_CLIENTE' or nullif(trim(guia_numero), '') is not null)
);
alter table wms.ingresos enable row level security;
create index if not exists ingresos_estado_idx on wms.ingresos (estado, creado_en desc);

create table if not exists wms.ingreso_lineas (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null references wms.ingresos(id),
  producto_id uuid not null,
  cantidad_referencia integer not null check (cantidad_referencia > 0),
  observaciones text,
  unique (ingreso_id, producto_id)
);
alter table wms.ingreso_lineas enable row level security;

-- Cada fila de ingreso_lotes es UNA ENTREGA con su propio estado sanitario:
-- su id es la procedencia_id del ledger (gate-0 C.7).
create table if not exists wms.ingreso_lotes (
  id uuid primary key default gen_random_uuid(),
  linea_id uuid not null references wms.ingreso_lineas(id),
  ingreso_id uuid not null references wms.ingresos(id),
  producto_id uuid not null,
  lote_id uuid not null references wms.lotes(id),
  cantidad integer not null check (cantidad > 0),
  vence date,
  vence_texto_original text,
  posicion_id uuid not null references wms.posiciones(id),
  creado_en timestamptz not null default now(),
  unique (linea_id, lote_id)
);
alter table wms.ingreso_lotes enable row level security;

-- Nota: saldos.procedencia_id NO lleva FK a ingreso_lotes: la carga inicial y los ajustes
-- usan procedencias propias. Para entradas, ingreso_lotes.id ES la procedencia.

-- Mientras el ingreso está en borrador sus filas de trabajo se pueden rehacer
-- (queda en auditoría); confirmado, nada se toca.
create or replace function wms.trg_ingreso_confirmado_inmutable()
returns trigger language plpgsql as $$
declare v_estado text; v_ing uuid;
begin
  v_ing := coalesce((to_jsonb(coalesce(new, old))->>'ingreso_id')::uuid, (to_jsonb(coalesce(new, old))->>'id')::uuid);
  select estado into v_estado from wms.ingresos where id = v_ing;
  if v_estado = 'CONFIRMADO' then
    raise exception 'El ingreso ya está confirmado: sus lotes y cantidades no se editan' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists ingreso_lotes_congelado on wms.ingreso_lotes;
create trigger ingreso_lotes_congelado before update or delete on wms.ingreso_lotes
  for each row execute function wms.trg_ingreso_confirmado_inmutable();
drop trigger if exists ingreso_lineas_congelado on wms.ingreso_lineas;
create trigger ingreso_lineas_congelado before update or delete on wms.ingreso_lineas
  for each row execute function wms.trg_ingreso_confirmado_inmutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- Solicitud de Ingreso (LS-FR.05.05): editable, con historial de versiones inmutables
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.solicitudes_ingreso (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null unique references wms.ingresos(id),
  version_actual integer not null default 1,
  creado_en timestamptz not null default now()
);
alter table wms.solicitudes_ingreso enable row level security;

create table if not exists wms.solicitud_ingreso_versiones (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references wms.solicitudes_ingreso(id),
  version integer not null,
  datos jsonb not null,
  motivo text,
  editado_por uuid,
  editado_en timestamptz not null default now(),
  unique (solicitud_id, version)
);
alter table wms.solicitud_ingreso_versiones enable row level security;
drop trigger if exists solicitud_versiones_inmutable on wms.solicitud_ingreso_versiones;
create trigger solicitud_versiones_inmutable before update or delete on wms.solicitud_ingreso_versiones
  for each row execute function wms.trg_inmutable();
drop trigger if exists solicitud_versiones_inmutable_tr on wms.solicitud_ingreso_versiones;
create trigger solicitud_versiones_inmutable_tr before truncate on wms.solicitud_ingreso_versiones
  for each statement execute function wms.trg_inmutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- Actas: recepción (LS-FR.03.05) y organoléptica (LS-FR.55.02)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.actas_recepcion (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null references wms.ingresos(id),
  numero text not null unique,                                -- I-AAAAMM-NNNN
  estado text not null default 'BORRADOR' check (estado in ('BORRADOR', 'FIRMADA', 'ANULADA')),
  contenido jsonb not null,                                   -- contenido canónico congelado
  hash_contenido text not null,
  reemplaza_a uuid references wms.actas_recepcion(id),
  generada_por uuid,
  generada_en timestamptz not null default now(),
  firmada_en timestamptz,
  anulada_por uuid,
  anulada_en timestamptz,
  motivo_anulacion text,
  check (estado <> 'ANULADA' or (anulada_por is not null and anulada_en is not null
                                 and nullif(trim(motivo_anulacion), '') is not null))
);
alter table wms.actas_recepcion enable row level security;
-- Una sola acta vigente (borrador o firmada) por ingreso.
create unique index if not exists actas_recepcion_una_vigente
  on wms.actas_recepcion (ingreso_id) where estado in ('BORRADOR', 'FIRMADA');
-- Una acta solo puede ser reemplazada una vez.
create unique index if not exists actas_recepcion_un_reemplazo
  on wms.actas_recepcion (reemplaza_a) where reemplaza_a is not null;

create or replace function wms.trg_acta_recepcion_guardia()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un acta no se borra: se anula con motivo y se emite otra vinculada' using errcode = 'P0001';
  end if;
  if old.estado = 'ANULADA' then
    raise exception 'El acta ya está anulada' using errcode = 'P0001';
  end if;
  if old.estado = 'FIRMADA' then
    if new.estado <> 'ANULADA' then
      raise exception 'Un acta firmada no se edita: solo se anula con motivo y se emite otra vinculada' using errcode = 'P0001';
    end if;
    if (to_jsonb(new) - 'estado' - 'anulada_por' - 'anulada_en' - 'motivo_anulacion')
       is distinct from (to_jsonb(old) - 'estado' - 'anulada_por' - 'anulada_en' - 'motivo_anulacion') then
      raise exception 'Al anular un acta no se puede cambiar su contenido' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists acta_recepcion_guardia on wms.actas_recepcion;
create trigger acta_recepcion_guardia before update or delete on wms.actas_recepcion
  for each row execute function wms.trg_acta_recepcion_guardia();

create table if not exists wms.acta_firmas (
  id uuid primary key default gen_random_uuid(),
  acta_tipo text not null check (acta_tipo in ('RECEPCION', 'ORGANOLEPTICA')),
  acta_id uuid not null,
  rol_firma text not null check (rol_firma in
    ('JEFE_ALMACEN', 'DIRECCION_TECNICA', 'RESPONSABLE_CONTEO', 'TRANSPORTISTA', 'ASISTENTE_DT')),
  user_id uuid,                                   -- persona logueada (todas menos el transportista)
  nombre text not null,
  dni text check (dni is null or dni ~ '^[0-9]{8}$'),
  placa text,
  imagen_firma text,                              -- PNG en data URL (firma táctil del transportista)
  firmado_en timestamptz not null default now(),
  registrado_por uuid not null,                   -- quien tenía la sesión abierta
  hash_contenido text not null,
  unique (acta_tipo, acta_id, rol_firma),
  check (rol_firma <> 'TRANSPORTISTA' or (dni is not null and nullif(trim(placa), '') is not null
                                          and imagen_firma is not null)),
  check (rol_firma = 'TRANSPORTISTA' or user_id is not null)
);
alter table wms.acta_firmas enable row level security;
drop trigger if exists acta_firmas_inmutable on wms.acta_firmas;
create trigger acta_firmas_inmutable before update or delete on wms.acta_firmas
  for each row execute function wms.trg_inmutable();
drop trigger if exists acta_firmas_inmutable_tr on wms.acta_firmas;
create trigger acta_firmas_inmutable_tr before truncate on wms.acta_firmas
  for each statement execute function wms.trg_inmutable();

create table if not exists wms.actas_organolepticas (
  id uuid primary key default gen_random_uuid(),
  ingreso_lote_id uuid not null unique references wms.ingreso_lotes(id),
  ingreso_id uuid not null references wms.ingresos(id),
  numero text not null unique,                    -- O-AAAAMM-NNNN (D-13: correlativo interno propuesto)
  estado text not null default 'BORRADOR' check (estado in ('BORRADOR', 'PENDIENTE_DT', 'FIRMADA')),
  cantidad_lote integer not null,
  cantidad_muestra integer not null,
  cert_analisis boolean,
  checklist jsonb not null default '{}'::jsonb,   -- ítem → 'C' conforme · 'NC' no conforme · 'NA'
  observacion text,
  destino_sugerido text check (destino_sugerido in ('APROBADO', 'DEVOLUCION', 'BAJA')),
  conclusion text check (conclusion in ('CONFORME', 'NO_CONFORME')),
  revisado_por uuid,
  revisado_en timestamptz,
  decision text check (decision in ('APROBADO', 'BAJAS_RECHAZADOS')),
  decidido_por uuid,
  decidido_en timestamptz,
  observacion_dt text,
  contenido jsonb,
  hash_contenido text,
  movimiento_id uuid references wms.movimientos(id),
  creado_en timestamptz not null default now(),
  check (estado <> 'FIRMADA' or (decision is not null and decidido_por is not null and hash_contenido is not null))
);
alter table wms.actas_organolepticas enable row level security;

create or replace function wms.trg_acta_org_guardia()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un acta no se borra' using errcode = 'P0001';
  end if;
  if old.estado = 'FIRMADA' then
    raise exception 'El acta organoléptica firmada no se edita: lo que decidió ya cambió el estado del lote. Una corrección se hace con un nuevo cambio de estado hacia Bajas/Rechazados, con su sustento.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists acta_org_guardia on wms.actas_organolepticas;
create trigger acta_org_guardia before update or delete on wms.actas_organolepticas
  for each row execute function wms.trg_acta_org_guardia();

-- ─────────────────────────────────────────────────────────────────────────────
-- Alertas
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.alertas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('TEMPERATURA', 'RS_VENCIDO', 'DIVERGENCIA_COMPRAS', 'POR_TRASLADAR_VENCIDO', 'LOTE_POR_VENCER', 'LOTE_VENCIDO')),
  destinatario_rol text not null check (destinatario_rol in ('direccion_tecnica', 'jefe_almacen')),
  ingreso_id uuid references wms.ingresos(id),
  producto_id uuid,
  lote_codigo text,                               -- para llevar al mapa (búsqueda por lote)
  mensaje text not null,
  clave text not null,                            -- evita duplicar la misma alerta abierta
  estado text not null default 'ABIERTA' check (estado in ('ABIERTA', 'ATENDIDA')),
  creada_en timestamptz not null default now(),
  atendida_por uuid,
  atendida_en timestamptz,
  nota_atencion text
);
alter table wms.alertas enable row level security;
-- (re-ejecutable: si la tabla ya existía con la lista corta de tipos, se amplía)
alter table wms.alertas add column if not exists lote_codigo text;
alter table wms.alertas drop constraint if exists alertas_tipo_check;
alter table wms.alertas add constraint alertas_tipo_check
  check (tipo in ('TEMPERATURA', 'RS_VENCIDO', 'DIVERGENCIA_COMPRAS', 'POR_TRASLADAR_VENCIDO', 'LOTE_POR_VENCER', 'LOTE_VENCIDO'));
create unique index if not exists alertas_clave_abierta on wms.alertas (clave) where estado = 'ABIERTA';

-- ─────────────────────────────────────────────────────────────────────────────
-- Expediente por OC (o por acta si no hay compra)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.expedientes (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,                     -- código de OC, o N° de acta si no hay compra
  tipo text not null check (tipo in ('OC', 'ACTA')),
  estado text not null default 'ABIERTO' check (estado in ('ABIERTO', 'CERRADO')),
  creado_en timestamptz not null default now(),
  cerrado_por uuid,
  cerrado_en timestamptz
);
alter table wms.expedientes enable row level security;
do $$ begin
  alter table wms.ingresos add constraint ingresos_expediente_fk
    foreign key (expediente_id) references wms.expedientes(id);
exception when duplicate_object then null; end $$;

create table if not exists wms.expediente_documentos (
  id uuid primary key default gen_random_uuid(),
  expediente_id uuid not null references wms.expedientes(id),
  tipo text not null,                             -- GUIA_REMISION · FACTURA · ACTA_RECEPCION · ACTA_ORGANOLEPTICA · …
  descripcion text not null,
  referencia_tipo text,                           -- a dónde apunta (enlaza, no duplica)
  referencia_id text,
  agregado_por uuid,
  agregado_en timestamptz not null default now()
);
alter table wms.expediente_documentos enable row level security;
create unique index if not exists expediente_documentos_ref
  on wms.expediente_documentos (expediente_id, referencia_tipo, referencia_id) where referencia_id is not null;

create table if not exists wms.expediente_faltantes (
  id uuid primary key default gen_random_uuid(),
  expediente_id uuid not null references wms.expedientes(id),
  tipo text not null,
  documento text not null,
  responsable text not null,
  estado text not null default 'ABIERTO' check (estado in ('ABIERTO', 'RESUELTO')),
  creado_por uuid,
  creado_en timestamptz not null default now(),
  resuelto_por uuid,
  resuelto_en timestamptz,
  nota text
);
alter table wms.expediente_faltantes enable row level security;
create index if not exists expediente_faltantes_exp_idx on wms.expediente_faltantes (expediente_id, estado);

-- ─────────────────────────────────────────────────────────────────────────────
-- Vista de integración con Compras (solo lectura, aditiva)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cantidad física por producto de cada recepción de Compras. Se crea solo si
-- existen las tablas de Compras (en una base sin ellas el WMS sigue funcionando
-- con devoluciones e ingresos de cliente).

do $$ begin
  if to_regclass('almacen.recepciones') is not null and to_regclass('almacen.recepciones_items') is not null
     and to_regclass('compras.ordenes_compra') is not null and to_regclass('compras.ordenes_compra_items') is not null
     and to_regclass('compras.proveedores') is not null and to_regclass('catalogo.productos') is not null then
    execute $v$
      create or replace view wms.v_recepciones_compra with (security_invoker = true) as
      select r.id as recepcion_id, r.oc_id, oc.codigo as oc_codigo,
             pv.id as proveedor_id, pv.razon_social as proveedor_nombre, pv.ruc as proveedor_ruc,
             r.fecha_recepcion, r.estado as estado_recepcion,
             (select string_agg(g.numero, ', ' order by g.numero) from almacen.recepciones_guias g where g.recepcion_id = r.id) as guias,
             oi.producto_id, p.codigo as producto_codigo, p.descripcion as producto_descripcion,
             sum(ri.cantidad_fisica) as cantidad_fisica
        from almacen.recepciones r
        join compras.ordenes_compra oc on oc.id = r.oc_id
        join compras.proveedores pv on pv.id = oc.proveedor_id
        join almacen.recepciones_items ri on ri.recepcion_id = r.id
        join compras.ordenes_compra_items oi on oi.id = ri.oc_item_id
        join catalogo.productos p on p.id = oi.producto_id
       group by r.id, r.oc_id, oc.codigo, pv.id, pv.razon_social, pv.ruc, r.fecha_recepcion, r.estado,
                oi.producto_id, p.codigo, p.descripcion
    $v$;
    execute 'grant select on wms.v_recepciones_compra to authenticated';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Funciones: ingreso, solicitud, lotes
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._exigir_ejecutar() returns void
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_permiso('ejecutar') then
    raise exception 'No tienes permiso para registrar entradas' using errcode = '42501';
  end if;
end $$;

-- Alerta idempotente: la misma alerta abierta no se duplica.
create or replace function wms._alertar(p_tipo text, p_rol text, p_ingreso uuid, p_producto uuid, p_clave text, p_mensaje text, p_lote text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  insert into wms.alertas (tipo, destinatario_rol, ingreso_id, producto_id, clave, mensaje, lote_codigo)
  values (p_tipo, p_rol, p_ingreso, p_producto, p_clave, p_mensaje, p_lote)
  on conflict (clave) where estado = 'ABIERTA' do nothing;
end $$;

-- ¿Está el acta (o el ingreso) bloqueado por tener firmas?
create or replace function wms._ingreso_con_firmas(p_ingreso uuid) returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (
    select 1 from wms.actas_recepcion a join wms.acta_firmas f on f.acta_tipo = 'RECEPCION' and f.acta_id = a.id
     where a.ingreso_id = p_ingreso and a.estado in ('BORRADOR', 'FIRMADA'))
$$;

create or replace function wms._solicitud_datos(p_ingreso uuid) returns jsonb
language sql stable security definer set search_path = wms, pg_temp as $$
  select jsonb_build_object(
    'tipo', i.tipo, 'propietario_id', i.propietario_id, 'contraparte_nombre', i.contraparte_nombre,
    'contraparte_ruc', i.contraparte_ruc, 'oc_codigo', i.oc_codigo, 'guia_numero', i.guia_numero,
    'factura_numero', i.factura_numero, 'doc_original_tipo', i.doc_original_tipo,
    'doc_original_numero', i.doc_original_numero, 'motivo', i.motivo, 'observaciones', i.observaciones,
    'fecha_ingreso', coalesce(i.confirmado_en, i.creado_en)::date,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'producto_id', l.producto_id, 'producto', p.descripcion, 'codigo', p.codigo,
               'registro_sanitario', pr.registro_sanitario, 'cantidad_referencia', l.cantidad_referencia,
               'lotes', coalesce((select jsonb_agg(jsonb_build_object('lote', lt.codigo, 'vence', il.vence, 'cantidad', il.cantidad) order by lt.codigo)
                                    from wms.ingreso_lotes il join wms.lotes lt on lt.id = il.lote_id where il.linea_id = l.id), '[]'::jsonb))
             order by p.descripcion)
        from wms.ingreso_lineas l
        join catalogo.productos p on p.id = l.producto_id
        left join wms.producto_regulatorio pr on pr.producto_id = l.producto_id
       where l.ingreso_id = i.id), '[]'::jsonb))
    from wms.ingresos i where i.id = p_ingreso
$$;

create or replace function wms._nueva_version_solicitud(p_ingreso uuid, p_datos jsonb, p_motivo text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_sol wms.solicitudes_ingreso;
begin
  select * into v_sol from wms.solicitudes_ingreso where ingreso_id = p_ingreso for update;
  if not found then
    insert into wms.solicitudes_ingreso (ingreso_id) values (p_ingreso) returning * into v_sol;
    insert into wms.solicitud_ingreso_versiones (solicitud_id, version, datos, motivo, editado_por)
    values (v_sol.id, 1, p_datos, coalesce(p_motivo, 'Prellenada por el sistema'), auth.uid());
  else
    update wms.solicitudes_ingreso set version_actual = version_actual + 1 where id = v_sol.id;
    insert into wms.solicitud_ingreso_versiones (solicitud_id, version, datos, motivo, editado_por)
    values (v_sol.id, v_sol.version_actual + 1, p_datos, p_motivo, auth.uid());
  end if;
end $$;

-- Crea el ingreso. Compra local: p_datos.compra_recepcion_id; el WMS lee la
-- recepción de Compras y guarda su copia (no confía en cantidades del cliente).
-- Devolución / cliente: p_lineas = [{producto_id, cantidad_referencia}].
create or replace function wms.crear_ingreso(p_tipo text, p_propietario uuid, p_datos jsonb, p_lineas jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v_id uuid := gen_random_uuid();
  v_prop wms.propietarios;
  v_rec uuid;
  r record;
  v_snap jsonb;
  v_n int := 0;
begin
  perform wms._exigir_ejecutar();
  select * into v_prop from wms.propietarios where id = p_propietario and activo;
  if not found then raise exception 'Propietario inexistente o inactivo' using errcode = 'P0001'; end if;
  if p_tipo not in ('COMPRA_LOCAL', 'DEVOLUCION', 'INGRESO_CLIENTE') then
    raise exception 'Tipo de ingreso no habilitado: %', p_tipo using errcode = 'P0001';
  end if;
  if not exists (select 1 from wms.origenes where codigo = p_tipo and habilitado) then
    raise exception 'Tipo de ingreso no habilitado: %', p_tipo using errcode = 'P0001';
  end if;

  if p_tipo = 'COMPRA_LOCAL' then
    if not v_prop.es_dueno_almacen then
      raise exception 'Una compra local es stock propio: el propietario es Logissa' using errcode = 'P0001';
    end if;
    v_rec := nullif(p_datos->>'compra_recepcion_id', '')::uuid;
    if v_rec is null then raise exception 'Elige la recepción de Compras' using errcode = 'P0001'; end if;
    if to_regclass('wms.v_recepciones_compra') is null then
      raise exception 'Compras no está conectado a esta base: no se puede leer la recepción' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.ingresos where compra_recepcion_id = v_rec) then
      raise exception 'Esa recepción de Compras ya tiene su ingreso en el WMS' using errcode = '23505';
    end if;
    execute 'select jsonb_agg(to_jsonb(v)) from wms.v_recepciones_compra v where v.recepcion_id = $1' into v_snap using v_rec;
    if v_snap is null then raise exception 'La recepción de Compras no existe o no tiene líneas' using errcode = 'P0001'; end if;
    insert into wms.ingresos (id, tipo, propietario_id, compra_recepcion_id, oc_codigo, contraparte_nombre,
                              contraparte_ruc, guia_numero, snapshot_compras, creado_por)
    select v_id, p_tipo, p_propietario, v_rec, (x->>'oc_codigo'), (x->>'proveedor_nombre'), (x->>'proveedor_ruc'),
           (x->>'guias'), v_snap, auth.uid()
      from jsonb_array_elements(v_snap) x limit 1;
    for r in select (x->>'producto_id')::uuid as producto_id, (x->>'cantidad_fisica')::numeric as n
               from jsonb_array_elements(v_snap) x loop
      if r.n <> trunc(r.n) or r.n <= 0 then
        raise exception 'Compras registró una cantidad no entera (%): corrígela en Compras', r.n using errcode = 'P0001';
      end if;
      insert into wms.ingreso_lineas (ingreso_id, producto_id, cantidad_referencia) values (v_id, r.producto_id, r.n::int);
      v_n := v_n + 1;
    end loop;
  else
    if p_tipo = 'INGRESO_CLIENTE' and v_prop.es_dueno_almacen then
      raise exception 'Un ingreso de cliente queda a nombre del cliente, no de Logissa' using errcode = 'P0001';
    end if;
    if p_tipo = 'DEVOLUCION' and (nullif(trim(p_datos->>'doc_original_tipo'), '') is null
                                  or nullif(trim(p_datos->>'doc_original_numero'), '') is null) then
      raise exception 'La devolución necesita la factura o boleta original: sin ella no se puede registrar' using errcode = 'P0001';
    end if;
    if p_tipo = 'INGRESO_CLIENTE' and nullif(trim(p_datos->>'guia_numero'), '') is null then
      raise exception 'El ingreso de cliente necesita la guía del cliente' using errcode = 'P0001';
    end if;
    if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
      raise exception 'Agrega al menos un producto con su cantidad de la guía' using errcode = 'P0001';
    end if;
    insert into wms.ingresos (id, tipo, propietario_id, contraparte_nombre, contraparte_ruc, guia_numero,
                              doc_original_tipo, doc_original_numero, motivo, observaciones, creado_por)
    values (v_id, p_tipo, p_propietario, nullif(trim(p_datos->>'contraparte_nombre'), ''),
            nullif(trim(p_datos->>'contraparte_ruc'), ''), nullif(trim(p_datos->>'guia_numero'), ''),
            nullif(trim(p_datos->>'doc_original_tipo'), ''), nullif(trim(p_datos->>'doc_original_numero'), ''),
            nullif(trim(p_datos->>'motivo'), ''), nullif(trim(p_datos->>'observaciones'), ''), auth.uid());
    for r in select (x->>'producto_id')::uuid as producto_id, (x->>'cantidad_referencia')::int as n
               from jsonb_array_elements(p_lineas) x loop
      insert into wms.ingreso_lineas (ingreso_id, producto_id, cantidad_referencia) values (v_id, r.producto_id, r.n);
      v_n := v_n + 1;
    end loop;
  end if;

  -- Registro sanitario vencido: alerta inmediata a Katia (bloquea la aprobación, no la recepción).
  for r in select l.producto_id, p.descripcion, pr.rs_vence
             from wms.ingreso_lineas l join catalogo.productos p on p.id = l.producto_id
             join wms.producto_regulatorio pr on pr.producto_id = l.producto_id
            where l.ingreso_id = v_id and pr.rs_vence is not null and pr.rs_vence < current_date loop
    perform wms._alertar('RS_VENCIDO', 'direccion_tecnica', v_id, r.producto_id, 'rs:' || r.producto_id,
      format('El registro sanitario de %s venció el %s. Su lote no se puede aprobar hasta que lo resuelvas.',
             r.descripcion, to_char(r.rs_vence, 'DD/MM/YYYY')));
  end loop;

  perform wms._nueva_version_solicitud(v_id, wms._solicitud_datos(v_id), null);
  perform wms.registrar_audit('ingreso_creado', 'ingresos', v_id::text, null,
    jsonb_build_object('tipo', p_tipo, 'propietario_id', p_propietario, 'lineas', v_n));
  return v_id;
end $$;

-- Datos del acta que Compras no tiene, y encabezado editable. Mientras el acta
-- vigente no tenga firmas. Fuera de rango de temperatura: se recibe y se alerta.
create or replace function wms.editar_ingreso(p_ingreso uuid, p_datos jsonb)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v wms.ingresos;
  v_min numeric := coalesce((select valor::numeric from wms.parametros where clave = 'temperatura_min_c'), 15);
  v_max numeric := coalesce((select valor::numeric from wms.parametros where clave = 'temperatura_max_c'), 25);
  v_temp numeric;
  v_antes jsonb;
begin
  perform wms._exigir_ejecutar();
  select * into v from wms.ingresos where id = p_ingreso for update;
  if not found then raise exception 'Ingreso inexistente' using errcode = 'P0001'; end if;
  if wms._ingreso_con_firmas(p_ingreso) then
    raise exception 'El acta ya tiene firmas: para corregir algo, anúlala con motivo y emite otra' using errcode = 'P0001';
  end if;
  v_antes := to_jsonb(v);
  v_temp := case when p_datos ? 'temperatura_c' then nullif(p_datos->>'temperatura_c', '')::numeric else v.temperatura_c end;
  update wms.ingresos set
    temperatura_c = v_temp,
    alerta_temperatura = v_temp is not null and (v_temp < v_min or v_temp > v_max),
    bultos = case when p_datos ? 'bultos' then nullif(p_datos->>'bultos', '')::int else bultos end,
    paletas = case when p_datos ? 'paletas' then nullif(p_datos->>'paletas', '')::int else paletas end,
    placa = case when p_datos ? 'placa' then nullif(trim(p_datos->>'placa'), '') else placa end,
    marca_vehiculo = case when p_datos ? 'marca_vehiculo' then nullif(trim(p_datos->>'marca_vehiculo'), '') else marca_vehiculo end,
    tipo_conteo = case when p_datos ? 'tipo_conteo' then nullif(p_datos->>'tipo_conteo', '') else tipo_conteo end,
    hora_inicio = case when p_datos ? 'hora_inicio' then nullif(p_datos->>'hora_inicio', '')::timestamptz else hora_inicio end,
    hora_fin = case when p_datos ? 'hora_fin' then nullif(p_datos->>'hora_fin', '')::timestamptz else hora_fin end,
    verificaciones = case when p_datos ? 'verificaciones' then p_datos->'verificaciones' else verificaciones end,
    observaciones = case when p_datos ? 'observaciones' then nullif(trim(p_datos->>'observaciones'), '') else observaciones end,
    guia_numero = case when p_datos ? 'guia_numero' and v.tipo <> 'COMPRA_LOCAL' then nullif(trim(p_datos->>'guia_numero'), '') else guia_numero end,
    factura_numero = case when p_datos ? 'factura_numero' then nullif(trim(p_datos->>'factura_numero'), '') else factura_numero end,
    contraparte_nombre = case when p_datos ? 'contraparte_nombre' and v.tipo <> 'COMPRA_LOCAL' then nullif(trim(p_datos->>'contraparte_nombre'), '') else contraparte_nombre end,
    contraparte_ruc = case when p_datos ? 'contraparte_ruc' and v.tipo <> 'COMPRA_LOCAL' then nullif(trim(p_datos->>'contraparte_ruc'), '') else contraparte_ruc end,
    motivo = case when p_datos ? 'motivo' then nullif(trim(p_datos->>'motivo'), '') else motivo end
  where id = p_ingreso;

  if v_temp is not null and (v_temp < v_min or v_temp > v_max) then
    perform wms._alertar('TEMPERATURA', 'direccion_tecnica', p_ingreso, null, 'temp:' || p_ingreso,
      format('La mercadería llegó a %s °C, fuera del rango de %s a %s °C. Se recibió; revísala antes de aprobar.',
             v_temp, v_min, v_max));
  end if;
  perform wms.registrar_audit('ingreso_editado', 'ingresos', p_ingreso::text, v_antes, p_datos);
end $$;

-- Reemplaza los lotes de una línea mientras el ingreso está en borrador.
-- p_lotes = [{codigo, vence, vence_texto, cantidad, posicion_id}]
create or replace function wms.guardar_lotes(p_ingreso uuid, p_linea uuid, p_lotes jsonb)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v wms.ingresos;
  l wms.ingreso_lineas;
  x jsonb;
  v_lote uuid;
  v_area text;
  v_antes jsonb;
begin
  perform wms._exigir_ejecutar();
  select * into v from wms.ingresos where id = p_ingreso for update;
  if not found then raise exception 'Ingreso inexistente' using errcode = 'P0001'; end if;
  if v.estado = 'CONFIRMADO' then
    raise exception 'El ingreso ya está confirmado: sus lotes no se editan' using errcode = 'P0001';
  end if;
  if wms._ingreso_con_firmas(p_ingreso) then
    raise exception 'El acta ya tiene firmas: para corregir los lotes, anúlala con motivo y emite otra' using errcode = 'P0001';
  end if;
  select * into l from wms.ingreso_lineas where id = p_linea and ingreso_id = p_ingreso;
  if not found then raise exception 'La línea no pertenece a este ingreso' using errcode = 'P0001'; end if;

  select coalesce(jsonb_agg(to_jsonb(il)), '[]'::jsonb) into v_antes from wms.ingreso_lotes il where il.linea_id = p_linea;
  delete from wms.ingreso_lotes where linea_id = p_linea;
  for x in select * from jsonb_array_elements(coalesce(p_lotes, '[]'::jsonb)) loop
    if nullif(trim(x->>'codigo'), '') is null then raise exception 'Cada lote necesita su código' using errcode = 'P0001'; end if;
    if (x->>'cantidad')::int is null or (x->>'cantidad')::int <= 0 then
      raise exception 'La cantidad del lote % debe ser un entero mayor que cero', x->>'codigo' using errcode = 'P0001';
    end if;
    if nullif(x->>'vence', '') is null then
      raise exception 'El lote % necesita su fecha de vencimiento', x->>'codigo' using errcode = 'P0001';
    end if;
    select tipo_area into v_area from wms.posiciones where id = (x->>'posicion_id')::uuid;
    if v_area is null or v_area not in ('CUARENTENA', 'DEVOLUCIONES') then
      raise exception 'El inventario nuevo nace en Cuarentena: elige una posición de Cuarentena (A-6 a A-9)' using errcode = 'P0001';
    end if;
    v_lote := wms.asegurar_lote(l.producto_id, trim(x->>'codigo'), (x->>'vence')::date, v.propietario_id,
                                nullif(x->>'vence_texto', ''));
    insert into wms.ingreso_lotes (linea_id, ingreso_id, producto_id, lote_id, cantidad, vence, vence_texto_original, posicion_id)
    values (p_linea, p_ingreso, l.producto_id, v_lote, (x->>'cantidad')::int, (x->>'vence')::date,
            nullif(x->>'vence_texto', ''), (x->>'posicion_id')::uuid);
  end loop;
  perform wms.registrar_audit('ingreso_lotes_guardados', 'ingreso_lineas', p_linea::text, v_antes, p_lotes);
end $$;

create or replace function wms.editar_solicitud(p_ingreso uuid, p_datos jsonb, p_motivo text default null)
returns integer language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_ver integer;
begin
  perform wms._exigir_ejecutar();
  if not exists (select 1 from wms.ingresos where id = p_ingreso) then
    raise exception 'Ingreso inexistente' using errcode = 'P0001';
  end if;
  perform wms._nueva_version_solicitud(p_ingreso, p_datos, nullif(trim(p_motivo), ''));
  select version_actual into v_ver from wms.solicitudes_ingreso where ingreso_id = p_ingreso;
  perform wms.registrar_audit('solicitud_editada', 'solicitudes_ingreso', p_ingreso::text, null, p_datos, p_motivo);
  return v_ver;
end $$;

-- Invariante: SUM(lotes) = cantidad de referencia por producto. Devuelve las líneas que no cuadran.
create or replace function wms.lineas_descuadradas(p_ingreso uuid)
returns table (linea_id uuid, producto_id uuid, referencia integer, registrado bigint)
language sql stable set search_path = wms, pg_temp as $$
  select l.id, l.producto_id, l.cantidad_referencia, coalesce(sum(il.cantidad), 0)
    from wms.ingreso_lineas l left join wms.ingreso_lotes il on il.linea_id = l.id
   where l.ingreso_id = p_ingreso
   group by l.id, l.producto_id, l.cantidad_referencia
  having coalesce(sum(il.cantidad), 0) <> l.cantidad_referencia
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Acta de Recepción: generar → firmar → (anular y reemitir)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._contenido_acta_recepcion(p_ingreso uuid, p_numero text) returns jsonb
language sql stable security definer set search_path = wms, pg_temp as $$
  select jsonb_build_object(
    'numero', p_numero,
    'formato', 'LS-FR.03.05',
    'ingreso', jsonb_build_object(
      'id', i.id, 'tipo', i.tipo, 'propietario', o.razon_social, 'propietario_id', i.propietario_id,
      'contraparte_nombre', i.contraparte_nombre, 'contraparte_ruc', i.contraparte_ruc, 'oc_codigo', i.oc_codigo,
      'guia_numero', i.guia_numero, 'factura_numero', i.factura_numero,
      'doc_original_tipo', i.doc_original_tipo, 'doc_original_numero', i.doc_original_numero, 'motivo', i.motivo,
      'temperatura_c', i.temperatura_c, 'alerta_temperatura', i.alerta_temperatura, 'bultos', i.bultos,
      'paletas', i.paletas, 'placa', i.placa, 'marca_vehiculo', i.marca_vehiculo, 'tipo_conteo', i.tipo_conteo,
      'hora_inicio', i.hora_inicio, 'hora_fin', i.hora_fin, 'verificaciones', i.verificaciones,
      'observaciones', i.observaciones),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'producto_id', l.producto_id, 'codigo', p.codigo, 'descripcion', p.descripcion,
        'registro_sanitario', pr.registro_sanitario, 'cantidad_establecida', l.cantidad_referencia,
        'cantidad_recibida', coalesce((select sum(il.cantidad) from wms.ingreso_lotes il where il.linea_id = l.id), 0),
        'lotes', coalesce((select jsonb_agg(jsonb_build_object(
                    'ingreso_lote_id', il.id, 'lote', lt.codigo, 'vence', il.vence, 'vence_texto', il.vence_texto_original,
                    'cantidad', il.cantidad, 'posicion', ps.codigo) order by lt.codigo)
                   from wms.ingreso_lotes il join wms.lotes lt on lt.id = il.lote_id
                   join wms.posiciones ps on ps.id = il.posicion_id where il.linea_id = l.id), '[]'::jsonb))
        order by p.descripcion)
      from wms.ingreso_lineas l join catalogo.productos p on p.id = l.producto_id
      left join wms.producto_regulatorio pr on pr.producto_id = l.producto_id
      where l.ingreso_id = i.id), '[]'::jsonb))
  from wms.ingresos i join wms.propietarios o on o.id = i.propietario_id where i.id = p_ingreso
$$;

create or replace function wms._hash(p jsonb) returns text language sql immutable as $$
  select encode(sha256(convert_to(p::text, 'UTF8')), 'hex')
$$;

create or replace function wms._validar_para_acta(p_ingreso uuid) returns void
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v wms.ingresos; r record;
begin
  select * into v from wms.ingresos where id = p_ingreso;
  if not found then raise exception 'Ingreso inexistente' using errcode = 'P0001'; end if;
  if v.tipo = 'DEVOLUCION' and (v.doc_original_tipo is null or nullif(trim(v.doc_original_numero), '') is null) then
    raise exception 'La devolución necesita la factura o boleta original' using errcode = 'P0001';
  end if;
  for r in select d.referencia, d.registrado, p.descripcion
             from wms.lineas_descuadradas(p_ingreso) d join catalogo.productos p on p.id = d.producto_id loop
    raise exception 'Los lotes de % suman % y la referencia es %: ajusta los lotes para que coincidan',
      r.descripcion, r.registrado, r.referencia using errcode = 'P0001';
  end loop;
  if v.temperatura_c is null then
    raise exception 'Falta la temperatura de recepción' using errcode = 'P0001';
  end if;
end $$;

create or replace function wms.generar_acta_recepcion(p_ingreso uuid)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v wms.ingresos;
  v_acta wms.actas_recepcion;
  v_num text;
  v_cont jsonb;
begin
  perform wms._exigir_ejecutar();
  select * into v from wms.ingresos where id = p_ingreso for update;
  if not found then raise exception 'Ingreso inexistente' using errcode = 'P0001'; end if;
  perform wms._validar_para_acta(p_ingreso);

  select * into v_acta from wms.actas_recepcion where ingreso_id = p_ingreso and estado in ('BORRADOR', 'FIRMADA');
  if found then
    if v_acta.estado = 'FIRMADA' then
      raise exception 'Este ingreso ya tiene su acta firmada (%)', v_acta.numero using errcode = 'P0001';
    end if;
    if wms._ingreso_con_firmas(p_ingreso) then
      raise exception 'El acta % ya tiene firmas: para corregir algo, anúlala con motivo y emite otra', v_acta.numero using errcode = 'P0001';
    end if;
    -- Borrador sin firmas: se regenera con los datos actuales (mismo número).
    v_cont := wms._contenido_acta_recepcion(p_ingreso, v_acta.numero);
    update wms.actas_recepcion set contenido = v_cont, hash_contenido = wms._hash(v_cont) where id = v_acta.id;
    return v_acta.id;
  end if;

  v_num := 'I-' || to_char(now(), 'YYYYMM') || '-' || lpad(wms.siguiente_correlativo('I-' || to_char(now(), 'YYYYMM'))::text, 4, '0');
  v_cont := wms._contenido_acta_recepcion(p_ingreso, v_num);
  insert into wms.actas_recepcion (ingreso_id, numero, contenido, hash_contenido, generada_por)
  values (p_ingreso, v_num, v_cont, wms._hash(v_cont), auth.uid())
  returning * into v_acta;
  perform wms.registrar_audit('acta_recepcion_generada', 'actas_recepcion', v_acta.id::text, null,
                              jsonb_build_object('numero', v_num, 'ingreso_id', p_ingreso));
  return v_acta.id;
end $$;

-- Firma del acta. Las tres firmas de personas salen del usuario logueado (con su
-- rol); la del transportista la registra quien tiene la sesión, con su nombre, DNI,
-- placa y la firma dibujada en pantalla.
create or replace function wms.firmar_acta_recepcion(
  p_acta uuid, p_rol_firma text, p_nombre text,
  p_dni text default null, p_placa text default null, p_imagen text default null)
returns jsonb language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  a wms.actas_recepcion;
  v_faltan text[];
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  select * into a from wms.actas_recepcion where id = p_acta for update;
  if not found then raise exception 'Acta inexistente' using errcode = 'P0001'; end if;
  if a.estado <> 'BORRADOR' then
    raise exception 'El acta % ya no admite firmas (%)', a.numero, lower(a.estado) using errcode = 'P0001';
  end if;
  if nullif(trim(p_nombre), '') is null then raise exception 'Falta el nombre de quien firma' using errcode = 'P0001'; end if;

  if p_rol_firma = 'JEFE_ALMACEN' then
    if not wms.tiene_rol('jefe_almacen', 'reemplazo_jefe') then
      raise exception 'Solo el Jefe de Almacén (o su reemplazo) firma como Jefe de Almacén' using errcode = '42501';
    end if;
  elsif p_rol_firma = 'DIRECCION_TECNICA' then
    if not wms.tiene_rol('direccion_tecnica') then
      raise exception 'Solo Dirección Técnica firma como Dirección Técnica' using errcode = '42501';
    end if;
  elsif p_rol_firma = 'RESPONSABLE_CONTEO' then
    if not wms.tiene_permiso('ejecutar') then
      raise exception 'Solo el personal de almacén firma como responsable de conteo' using errcode = '42501';
    end if;
  elsif p_rol_firma = 'TRANSPORTISTA' then
    if not wms.tiene_permiso('ejecutar') then
      raise exception 'Solo el personal de almacén registra la firma del transportista' using errcode = '42501';
    end if;
    if p_dni is null or p_dni !~ '^[0-9]{8}$' then
      raise exception 'El DNI del transportista debe tener 8 dígitos' using errcode = 'P0001';
    end if;
    if nullif(trim(p_placa), '') is null then raise exception 'Falta la placa del vehículo' using errcode = 'P0001'; end if;
    if p_imagen is null or length(p_imagen) < 100 then
      raise exception 'Falta la firma del transportista en pantalla' using errcode = 'P0001';
    end if;
  else
    raise exception 'Rol de firma inválido: %', p_rol_firma using errcode = 'P0001';
  end if;

  insert into wms.acta_firmas (acta_tipo, acta_id, rol_firma, user_id, nombre, dni, placa, imagen_firma, registrado_por, hash_contenido)
  values ('RECEPCION', p_acta, p_rol_firma,
          case when p_rol_firma = 'TRANSPORTISTA' then null else v_user end,
          trim(p_nombre), p_dni, nullif(trim(p_placa), ''), p_imagen, v_user, a.hash_contenido);

  select array_agg(r) into v_faltan from unnest(array['JEFE_ALMACEN', 'DIRECCION_TECNICA', 'RESPONSABLE_CONTEO', 'TRANSPORTISTA']) r
   where not exists (select 1 from wms.acta_firmas f where f.acta_tipo = 'RECEPCION' and f.acta_id = p_acta and f.rol_firma = r);
  if v_faltan is null then
    update wms.actas_recepcion set estado = 'FIRMADA', firmada_en = now() where id = p_acta;
  end if;
  perform wms.registrar_audit('acta_recepcion_firmada', 'actas_recepcion', p_acta::text, null,
    jsonb_build_object('rol', p_rol_firma, 'hash', a.hash_contenido, 'completa', v_faltan is null));
  return jsonb_build_object('completa', v_faltan is null, 'faltan', coalesce(to_jsonb(v_faltan), '[]'::jsonb));
exception when unique_violation then
  raise exception 'Ese rol ya firmó esta acta' using errcode = 'P0001';
end $$;

create or replace function wms.anular_acta_recepcion(p_acta uuid, p_motivo text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare a wms.actas_recepcion;
begin
  if not wms.tiene_rol('jefe_almacen', 'reemplazo_jefe', 'direccion_tecnica') then
    raise exception 'Solo el Jefe de Almacén (o su reemplazo) o Dirección Técnica anulan un acta' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'La anulación necesita un motivo' using errcode = 'P0001'; end if;
  select * into a from wms.actas_recepcion where id = p_acta for update;
  if not found then raise exception 'Acta inexistente' using errcode = 'P0001'; end if;
  if a.estado = 'ANULADA' then raise exception 'El acta ya está anulada' using errcode = 'P0001'; end if;
  if a.estado = 'BORRADOR' then
    raise exception 'Un borrador no se anula: se corrige o se vuelve a generar' using errcode = 'P0001';
  end if;
  update wms.actas_recepcion set estado = 'ANULADA', anulada_por = auth.uid(), anulada_en = now(),
         motivo_anulacion = trim(p_motivo) where id = p_acta;
  perform wms.registrar_audit('acta_recepcion_anulada', 'actas_recepcion', p_acta::text, null, null, p_motivo);
end $$;

-- Reemisión: una acta nueva (otro número) vinculada a la anulada, con los datos actuales.
create or replace function wms.reemitir_acta_recepcion(p_acta_anulada uuid)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare a wms.actas_recepcion; v_num text; v_cont jsonb; v_id uuid;
begin
  perform wms._exigir_ejecutar();
  select * into a from wms.actas_recepcion where id = p_acta_anulada;
  if not found or a.estado <> 'ANULADA' then
    raise exception 'Solo se reemite un acta anulada' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.actas_recepcion where reemplaza_a = p_acta_anulada) then
    raise exception 'Esa acta ya fue reemitida' using errcode = 'P0001';
  end if;
  v_num := 'I-' || to_char(now(), 'YYYYMM') || '-' || lpad(wms.siguiente_correlativo('I-' || to_char(now(), 'YYYYMM'))::text, 4, '0');
  v_cont := wms._contenido_acta_recepcion(a.ingreso_id, v_num);
  insert into wms.actas_recepcion (ingreso_id, numero, contenido, hash_contenido, reemplaza_a, generada_por)
  values (a.ingreso_id, v_num, v_cont, wms._hash(v_cont), p_acta_anulada, auth.uid())
  returning id into v_id;
  -- La acta nueva también entra al expediente (la anulada se conserva ahí, con su motivo en el acta).
  perform wms._agregar_doc((select expediente_id from wms.ingresos where id = a.ingreso_id), 'ACTA_RECEPCION',
                           'Acta de Recepción ' || v_num || ' (reemplaza a ' || a.numero || ')', 'acta_recepcion', v_id::text)
   where (select expediente_id from wms.ingresos where id = a.ingreso_id) is not null;
  perform wms.registrar_audit('acta_recepcion_reemitida', 'actas_recepcion', v_id::text, null,
    jsonb_build_object('reemplaza_a', p_acta_anulada, 'numero', v_num));
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Confirmación: el inventario nace en Cuarentena (con el acta firmada)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._agregar_doc(p_exp uuid, p_tipo text, p_desc text, p_ref_tipo text, p_ref text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  insert into wms.expediente_documentos (expediente_id, tipo, descripcion, referencia_tipo, referencia_id, agregado_por)
  values (p_exp, p_tipo, p_desc, p_ref_tipo, p_ref, auth.uid())
  on conflict (expediente_id, referencia_tipo, referencia_id) where referencia_id is not null do nothing;
  -- Un documento presente resuelve su faltante.
  update wms.expediente_faltantes set estado = 'RESUELTO', resuelto_por = auth.uid(), resuelto_en = now(),
         nota = 'Documento enlazado'
   where expediente_id = p_exp and tipo = p_tipo and estado = 'ABIERTO';
end $$;

create or replace function wms.confirmar_ingreso(p_ingreso uuid)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v wms.ingresos;
  a wms.actas_recepcion;
  v_mov uuid;
  v_partidas jsonb;
  v_exp uuid;
  v_clave text;
  r record;
  v_num_org text;
begin
  perform wms._exigir_ejecutar();
  select * into v from wms.ingresos where id = p_ingreso for update;
  if not found then raise exception 'Ingreso inexistente' using errcode = 'P0001'; end if;
  if v.estado = 'CONFIRMADO' then raise exception 'Este ingreso ya está confirmado' using errcode = 'P0001'; end if;
  perform wms._validar_para_acta(p_ingreso);
  select * into a from wms.actas_recepcion where ingreso_id = p_ingreso and estado = 'FIRMADA';
  if not found then
    raise exception 'Para confirmar el ingreso, el acta de recepción tiene que estar firmada por las cuatro partes' using errcode = 'P0001';
  end if;

  select jsonb_agg(jsonb_build_object(
           'posicion_id', il.posicion_id, 'producto_id', il.producto_id, 'lote_id', il.lote_id,
           'propietario_id', v.propietario_id, 'estado', 'CUARENTENA', 'origen', v.tipo,
           'procedencia_id', il.id, 'delta', il.cantidad))
    into v_partidas from wms.ingreso_lotes il where il.ingreso_id = p_ingreso;
  v_mov := wms.postear_movimiento('INGRESO', 'Ingreso ' || a.numero, v_partidas, 'ingreso', p_ingreso::text,
                                  'ACTA_RECEPCION', a.id::text, null);

  -- Expediente: por OC, o por N° de acta si no hay compra (varias recepciones de una OC lo comparten).
  v_clave := coalesce(v.oc_codigo, a.numero);
  insert into wms.expedientes (clave, tipo) values (v_clave, case when v.oc_codigo is null then 'ACTA' else 'OC' end)
  on conflict (clave) do nothing;
  select id into v_exp from wms.expedientes where clave = v_clave;
  update wms.expedientes set estado = 'ABIERTO', cerrado_por = null, cerrado_en = null where id = v_exp and estado = 'CERRADO';

  update wms.ingresos set estado = 'CONFIRMADO', confirmado_en = now(), movimiento_id = v_mov, expediente_id = v_exp
   where id = p_ingreso;

  perform wms._agregar_doc(v_exp, 'ACTA_RECEPCION', 'Acta de Recepción ' || a.numero, 'acta_recepcion', a.id::text);
  perform wms._agregar_doc(v_exp, 'SOLICITUD_INGRESO', 'Solicitud de Ingreso (LS-FR.05.05)', 'solicitud_ingreso', p_ingreso::text);

  -- Documentos requeridos por tipo: lo que falta queda como faltante con responsable.
  if nullif(trim(v.guia_numero), '') is not null then
    perform wms._agregar_doc(v_exp, 'GUIA_REMISION', 'Guía ' || v.guia_numero, 'guia', p_ingreso::text || ':' || v.guia_numero);
  else
    insert into wms.expediente_faltantes (expediente_id, tipo, documento, responsable, creado_por)
    select v_exp, 'GUIA_REMISION', 'Guía de remisión (' || a.numero || ')', 'Jefe de Almacén', auth.uid()
     where not exists (select 1 from wms.expediente_faltantes f where f.expediente_id = v_exp and f.tipo = 'GUIA_REMISION'
                          and f.estado = 'ABIERTO' and f.documento like '%(' || a.numero || ')');
  end if;
  if v.tipo = 'COMPRA_LOCAL' then
    if nullif(trim(v.factura_numero), '') is not null then
      perform wms._agregar_doc(v_exp, 'FACTURA', 'Factura ' || v.factura_numero, 'factura', p_ingreso::text || ':' || v.factura_numero);
    else
      insert into wms.expediente_faltantes (expediente_id, tipo, documento, responsable, creado_por)
      values (v_exp, 'FACTURA', 'Factura del proveedor (' || a.numero || ')', 'Contabilidad', auth.uid());
    end if;
  elsif v.tipo = 'DEVOLUCION' then
    perform wms._agregar_doc(v_exp, 'FACTURA_BOLETA_ORIGINAL', v.doc_original_tipo || ' original ' || v.doc_original_numero,
                             'doc_original', p_ingreso::text || ':' || v.doc_original_numero);
    insert into wms.expediente_faltantes (expediente_id, tipo, documento, responsable, creado_por)
    values (v_exp, 'FORMULARIO_DEVOLUCION', 'Formulario de devolución del transportista (' || a.numero || ')', 'Jefe de Almacén', auth.uid());
  end if;

  -- Un acta organoléptica por producto y lote (la llena Sandra; Katia decide).
  for r in select il.id as il_id, il.cantidad, il.ingreso_id, lt.codigo as lote, p.descripcion as producto
             from wms.ingreso_lotes il join wms.lotes lt on lt.id = il.lote_id
             join catalogo.productos p on p.id = il.producto_id where il.ingreso_id = p_ingreso loop
    v_num_org := 'O-' || to_char(now(), 'YYYYMM') || '-' || lpad(wms.siguiente_correlativo('O-' || to_char(now(), 'YYYYMM'))::text, 4, '0');
    insert into wms.actas_organolepticas (ingreso_lote_id, ingreso_id, numero, cantidad_lote, cantidad_muestra)
    values (r.il_id, p_ingreso, v_num_org, r.cantidad, wms.muestra_organoleptica(r.cantidad));
    insert into wms.expediente_faltantes (expediente_id, tipo, documento, responsable, creado_por)
    values (v_exp, 'ACTA_ORGANOLEPTICA', 'Acta organoléptica ' || v_num_org || ' · ' || r.producto || ' · lote ' || r.lote,
            'Dirección Técnica', auth.uid());
  end loop;

  -- Registro sanitario vencido → alerta (la aprobación queda bloqueada por la base).
  for r in select l.producto_id, p.descripcion, pr.rs_vence
             from wms.ingreso_lineas l join catalogo.productos p on p.id = l.producto_id
             join wms.producto_regulatorio pr on pr.producto_id = l.producto_id
            where l.ingreso_id = p_ingreso and pr.rs_vence is not null and pr.rs_vence < current_date loop
    perform wms._alertar('RS_VENCIDO', 'direccion_tecnica', p_ingreso, r.producto_id, 'rs:' || r.producto_id,
      format('El registro sanitario de %s venció el %s. Su lote no se puede aprobar hasta que lo resuelvas.',
             r.descripcion, to_char(r.rs_vence, 'DD/MM/YYYY')));
  end loop;

  perform wms.registrar_audit('ingreso_confirmado', 'ingresos', p_ingreso::text, null,
    jsonb_build_object('acta', a.numero, 'movimiento_id', v_mov));
  return v_mov;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Acta Organoléptica: la llena Sandra, decide y firma Katia
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.guardar_acta_organoleptica(p_acta uuid, p_datos jsonb, p_enviar boolean default false)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare o wms.actas_organolepticas;
begin
  if not wms.tiene_rol('asistente_dt', 'direccion_tecnica') then
    raise exception 'Solo Dirección Técnica y su asistente llenan el acta organoléptica' using errcode = '42501';
  end if;
  select * into o from wms.actas_organolepticas where id = p_acta for update;
  if not found then raise exception 'Acta inexistente' using errcode = 'P0001'; end if;
  if o.estado = 'FIRMADA' then raise exception 'El acta ya está firmada' using errcode = 'P0001'; end if;
  update wms.actas_organolepticas set
    cert_analisis = case when p_datos ? 'cert_analisis' then (p_datos->>'cert_analisis')::boolean else cert_analisis end,
    checklist = case when p_datos ? 'checklist' then p_datos->'checklist' else checklist end,
    observacion = case when p_datos ? 'observacion' then nullif(trim(p_datos->>'observacion'), '') else observacion end,
    destino_sugerido = case when p_datos ? 'destino_sugerido' then nullif(p_datos->>'destino_sugerido', '') else destino_sugerido end,
    conclusion = case when p_datos ? 'conclusion' then nullif(p_datos->>'conclusion', '') else conclusion end,
    revisado_por = auth.uid(), revisado_en = now()
  where id = p_acta;
  if p_enviar then
    select * into o from wms.actas_organolepticas where id = p_acta;
    if o.conclusion is null or o.destino_sugerido is null or o.cert_analisis is null
       or o.checklist = '{}'::jsonb then
      raise exception 'Para enviarla a Dirección Técnica completa el checklist, el certificado de análisis, el destino y la conclusión' using errcode = 'P0001';
    end if;
    update wms.actas_organolepticas set estado = 'PENDIENTE_DT' where id = p_acta;
  end if;
  perform wms.registrar_audit('acta_organoleptica_guardada', 'actas_organolepticas', p_acta::text, null,
                              p_datos || jsonb_build_object('enviada', p_enviar));
end $$;

create or replace function wms.decidir_acta_organoleptica(p_acta uuid, p_decision text, p_observacion text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  o wms.actas_organolepticas;
  i wms.ingresos;
  il wms.ingreso_lotes;
  v_partidas jsonb;
  v_hasta text;
  v_mov uuid;
  v_cont jsonb;
  v_n int;
begin
  if not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica decide Aprobado o Bajas/Rechazados' using errcode = '42501';
  end if;
  if p_decision not in ('APROBADO', 'BAJAS_RECHAZADOS') then
    raise exception 'Decisión inválida: %', p_decision using errcode = 'P0001';
  end if;
  select * into o from wms.actas_organolepticas where id = p_acta for update;
  if not found then raise exception 'Acta inexistente' using errcode = 'P0001'; end if;
  if o.estado = 'FIRMADA' then raise exception 'El acta ya está firmada' using errcode = 'P0001'; end if;
  if o.estado <> 'PENDIENTE_DT' then
    raise exception 'El acta todavía no está completa: falta que la envíen a Dirección Técnica' using errcode = 'P0001';
  end if;
  if p_decision = 'APROBADO' and o.conclusion <> 'CONFORME' then
    raise exception 'El acta concluye NO CONFORME: no se puede aprobar. Decide Bajas/Rechazados o pide que la corrijan.' using errcode = 'P0001';
  end if;
  select * into il from wms.ingreso_lotes where id = o.ingreso_lote_id;
  select * into i from wms.ingresos where id = o.ingreso_id;
  v_hasta := p_decision;

  -- Solo las unidades de ESTA entrega que siguen en Cuarentena (la aprobación no se hereda).
  select jsonb_agg(x) into v_partidas from (
    select jsonb_build_object('posicion_id', s.posicion_id, 'producto_id', s.producto_id, 'lote_id', s.lote_id,
             'propietario_id', s.propietario_id, 'estado', 'CUARENTENA', 'origen', i.tipo,
             'procedencia_id', s.procedencia_id, 'delta', -s.cantidad) as x
      from wms.saldos s where s.procedencia_id = il.id and s.estado = 'CUARENTENA' and s.cantidad > 0
    union all
    select jsonb_build_object('posicion_id', s.posicion_id, 'producto_id', s.producto_id, 'lote_id', s.lote_id,
             'propietario_id', s.propietario_id, 'estado', v_hasta, 'origen', i.tipo,
             'procedencia_id', s.procedencia_id, 'delta', s.cantidad)
      from wms.saldos s where s.procedencia_id = il.id and s.estado = 'CUARENTENA' and s.cantidad > 0
  ) t;
  if v_partidas is null then
    raise exception 'Estas unidades ya no están en Cuarentena: no hay nada que decidir' using errcode = 'P0001';
  end if;

  v_cont := jsonb_build_object(
    'numero', o.numero, 'formato', 'LS-FR.55.02',
    'ingreso_lote_id', o.ingreso_lote_id, 'cantidad_lote', o.cantidad_lote, 'cantidad_muestra', o.cantidad_muestra,
    'cert_analisis', o.cert_analisis, 'checklist', o.checklist, 'observacion', o.observacion,
    'destino_sugerido', o.destino_sugerido, 'conclusion', o.conclusion, 'decision', p_decision,
    'observacion_dt', nullif(trim(p_observacion), ''),
    'producto', (select jsonb_build_object('codigo', p.codigo, 'descripcion', p.descripcion, 'registro_sanitario', pr.registro_sanitario,
                                           'rs_vence', pr.rs_vence, 'fabricante', pr.fabricante, 'forma', pr.forma_presentacion)
                   from catalogo.productos p left join wms.producto_regulatorio pr on pr.producto_id = p.id where p.id = il.producto_id),
    'lote', (select jsonb_build_object('codigo', lt.codigo, 'vence', lt.vence) from wms.lotes lt where lt.id = il.lote_id));

  -- El cambio de estado se hace PRIMERO: si el registro sanitario está vencido, la base lo rechaza
  -- y el acta no queda firmada.
  v_mov := wms.postear_movimiento('CAMBIO_ESTADO', 'Acta organoléptica ' || o.numero || ': ' || p_decision, v_partidas,
                                  'acta_organoleptica', o.id::text, 'ACTA_ORGANOLEPTICA', o.id::text, null);
  update wms.actas_organolepticas set estado = 'FIRMADA', decision = p_decision, decidido_por = auth.uid(),
         decidido_en = now(), observacion_dt = nullif(trim(p_observacion), ''), contenido = v_cont,
         hash_contenido = wms._hash(v_cont), movimiento_id = v_mov
   where id = p_acta;
  insert into wms.acta_firmas (acta_tipo, acta_id, rol_firma, user_id, nombre, registrado_por, hash_contenido)
  values ('ORGANOLEPTICA', p_acta, 'DIRECCION_TECNICA', auth.uid(), 'Dirección Técnica', auth.uid(), wms._hash(v_cont));

  -- Documento en el expediente y faltante resuelto.
  if i.expediente_id is not null then
    insert into wms.expediente_documentos (expediente_id, tipo, descripcion, referencia_tipo, referencia_id, agregado_por)
    values (i.expediente_id, 'ACTA_ORGANOLEPTICA', 'Acta organoléptica ' || o.numero, 'acta_organoleptica', o.id::text, auth.uid())
    on conflict do nothing;
    update wms.expediente_faltantes set estado = 'RESUELTO', resuelto_por = auth.uid(), resuelto_en = now(), nota = 'Acta firmada'
     where expediente_id = i.expediente_id and tipo = 'ACTA_ORGANOLEPTICA' and documento like 'Acta organoléptica ' || o.numero || '%'
       and estado = 'ABIERTO';
  end if;
  perform wms.registrar_audit('acta_organoleptica_firmada', 'actas_organolepticas', p_acta::text, null,
    jsonb_build_object('decision', p_decision, 'hash', wms._hash(v_cont), 'movimiento_id', v_mov), p_observacion);
  return v_mov;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Alertas: atender y revisar
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.atender_alerta(p_alerta uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare a wms.alertas;
begin
  select * into a from wms.alertas where id = p_alerta for update;
  if not found then raise exception 'Alerta inexistente' using errcode = 'P0001'; end if;
  if not wms.tiene_rol(a.destinatario_rol, 'direccion_tecnica') then
    raise exception 'Esta alerta la atiende %', case a.destinatario_rol when 'jefe_almacen' then 'el Jefe de Almacén' else 'Dirección Técnica' end
      using errcode = '42501';
  end if;
  if a.estado = 'ATENDIDA' then return; end if;
  update wms.alertas set estado = 'ATENDIDA', atendida_por = auth.uid(), atendida_en = now(),
         nota_atencion = nullif(trim(p_nota), '') where id = p_alerta;
  perform wms.registrar_audit('alerta_atendida', 'alertas', p_alerta::text, null, null, p_nota);
end $$;

-- D-19: si Compras cambió la cantidad después de confirmar, no se cambia solo: se alerta.
create or replace function wms.revisar_divergencias() returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare r record; v_n int := 0; v_actual numeric;
begin
  if not wms.es_usuario() then raise exception 'Sin permiso' using errcode = '42501'; end if;
  if to_regclass('wms.v_recepciones_compra') is null then return 0; end if;
  for r in
    select i.id as ingreso_id, i.compra_recepcion_id, (x->>'producto_id')::uuid as producto_id,
           (x->>'cantidad_fisica')::numeric as copia, x->>'producto_descripcion' as producto
      from wms.ingresos i, jsonb_array_elements(i.snapshot_compras) x
     where i.estado = 'CONFIRMADO' and i.snapshot_compras is not null
  loop
    execute 'select sum(cantidad_fisica) from wms.v_recepciones_compra where recepcion_id = $1 and producto_id = $2'
      into v_actual using r.compra_recepcion_id, r.producto_id;
    if v_actual is distinct from r.copia then
      perform wms._alertar('DIVERGENCIA_COMPRAS', 'jefe_almacen', r.ingreso_id, r.producto_id,
        'div:' || r.ingreso_id || ':' || r.producto_id,
        format('Compras cambió la cantidad de %s: el WMS recibió %s y Compras ahora dice %s. Revísalo; el WMS no cambia solo.',
               r.producto, trim_scale(r.copia), coalesce(trim_scale(v_actual)::text, '0')));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- D-28: "Aprobado · por trasladar" más tiempo del permitido → alerta al Jefe de Almacén.
create or replace function wms.revisar_por_trasladar() returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  r record; v_n int := 0;
  v_horas numeric := coalesce((select valor::numeric from wms.parametros where clave = 'plazo_por_trasladar_horas'), 24);
begin
  if not wms.es_usuario() then raise exception 'Sin permiso' using errcode = '42501'; end if;
  for r in
    select s.posicion_id, ps.codigo as posicion, s.lote_id, lt.codigo as lote, p.descripcion as producto,
           s.procedencia_id, s.cantidad, max(pa.ts) as desde
      from wms.saldos s
      join wms.posiciones ps on ps.id = s.posicion_id and ps.tipo_area in ('CUARENTENA', 'DEVOLUCIONES')
      join wms.lotes lt on lt.id = s.lote_id
      join catalogo.productos p on p.id = s.producto_id
      join wms.partidas pa on pa.posicion_id = s.posicion_id and pa.lote_id = s.lote_id
                          and pa.procedencia_id = s.procedencia_id and pa.estado = 'APROBADO' and pa.delta > 0
     where s.estado = 'APROBADO' and s.cantidad > 0
     group by s.posicion_id, ps.codigo, s.lote_id, lt.codigo, p.descripcion, s.procedencia_id, s.cantidad
    having max(pa.ts) < now() - make_interval(secs => v_horas * 3600)
  loop
    perform wms._alertar('POR_TRASLADAR_VENCIDO', 'jefe_almacen', null, null,
      'traslado:' || r.posicion_id || ':' || r.lote_id || ':' || r.procedencia_id,
      format('%s (lote %s, %s unidades) está aprobado desde hace más de %s horas y sigue en %s. Hay que trasladarlo a su rack.',
             r.producto, r.lote, r.cantidad, trim(to_char(v_horas, 'FM999990.##')), r.posicion), r.lote);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Lotes por vencer o vencidos que SIGUEN en el inventario (todo estado salvo Bajas/Rechazados, que ya está fuera de circulación).
-- Por vencer → Jefe de Almacén (rotar / sacar primero). Vencido → Dirección Técnica (decide su baja). Una alerta por lote;
-- al vencerse, la de "por vencer" de ese lote se cierra sola. Una sola alerta por lote y tipo: atendida, no vuelve a abrirse.
create or replace function wms.revisar_vencimientos() returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  r record; v_n int := 0;
  v_dias int := coalesce((select valor::int from wms.parametros where clave = 'lote_dias_alerta_vencimiento'), 90);
begin
  if not wms.es_usuario() then raise exception 'Sin permiso' using errcode = '42501'; end if;
  for r in
    select l.id as lote_id, l.codigo as lote, l.vence, l.producto_id, p.descripcion as producto,
           sum(s.cantidad)::int as unidades,
           string_agg(distinct ps.codigo, ', ' order by ps.codigo) as posiciones,
           (l.vence - current_date) as dias
      from wms.saldos s
      join wms.lotes l on l.id = s.lote_id
      join catalogo.productos p on p.id = l.producto_id
      join wms.posiciones ps on ps.id = s.posicion_id
     where s.cantidad > 0 and s.estado <> 'BAJAS_RECHAZADOS' and l.vence is not null
       and l.vence <= current_date + v_dias
     group by l.id, l.codigo, l.vence, l.producto_id, p.descripcion
  loop
    if r.dias < 0 then
      update wms.alertas set estado = 'ATENDIDA', atendida_en = now(), nota_atencion = 'El lote venció'
       where clave = 'lote-por-vencer:' || r.lote_id and estado = 'ABIERTA';
      if not exists (select 1 from wms.alertas where clave = 'lote-vencido:' || r.lote_id) then
      perform wms._alertar('LOTE_VENCIDO', 'direccion_tecnica', null, r.producto_id, 'lote-vencido:' || r.lote_id,
        format('El lote %s de %s venció el %s (hace %s días) y sigue en el inventario: %s unidades en %s. Hay que separarlo y decidir su baja.',
               r.lote, r.producto, to_char(r.vence, 'DD/MM/YYYY'), -r.dias, r.unidades, r.posiciones), r.lote);
      end if;
    elsif not exists (select 1 from wms.alertas where clave = 'lote-por-vencer:' || r.lote_id) then
      perform wms._alertar('LOTE_POR_VENCER', 'jefe_almacen', null, r.producto_id, 'lote-por-vencer:' || r.lote_id,
        format('El lote %s de %s vence el %s (en %s días): %s unidades en %s. Sácalo primero o rótalo.',
               r.lote, r.producto, to_char(r.vence, 'DD/MM/YYYY'), r.dias, r.unidades, r.posiciones), r.lote);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Expediente: documentos, faltantes y cierre (Sandra)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.agregar_documento_expediente(p_exp uuid, p_tipo text, p_descripcion text, p_ref_tipo text default null, p_ref text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if not wms.tiene_rol('asistente_dt', 'direccion_tecnica', 'jefe_almacen', 'reemplazo_jefe', 'auxiliar') then
    raise exception 'No tienes permiso para el expediente' using errcode = '42501';
  end if;
  if nullif(trim(p_descripcion), '') is null then raise exception 'Describe el documento' using errcode = 'P0001'; end if;
  perform wms._agregar_doc(p_exp, p_tipo, trim(p_descripcion), p_ref_tipo, p_ref);
  perform wms.registrar_audit('expediente_documento_agregado', 'expedientes', p_exp::text, null,
    jsonb_build_object('tipo', p_tipo, 'descripcion', p_descripcion));
end $$;

create or replace function wms.agregar_faltante(p_exp uuid, p_tipo text, p_documento text, p_responsable text)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid;
begin
  if not wms.tiene_rol('asistente_dt', 'direccion_tecnica', 'jefe_almacen', 'reemplazo_jefe') then
    raise exception 'No tienes permiso para el expediente' using errcode = '42501';
  end if;
  if nullif(trim(p_documento), '') is null or nullif(trim(p_responsable), '') is null then
    raise exception 'Un faltante necesita el documento y su responsable' using errcode = 'P0001';
  end if;
  insert into wms.expediente_faltantes (expediente_id, tipo, documento, responsable, creado_por)
  values (p_exp, coalesce(nullif(trim(p_tipo), ''), 'OTRO'), trim(p_documento), trim(p_responsable), auth.uid())
  returning id into v_id;
  update wms.expedientes set estado = 'ABIERTO', cerrado_por = null, cerrado_en = null where id = p_exp and estado = 'CERRADO';
  perform wms.registrar_audit('expediente_faltante_agregado', 'expedientes', p_exp::text, null,
    jsonb_build_object('documento', p_documento, 'responsable', p_responsable));
  return v_id;
end $$;

create or replace function wms.resolver_faltante(p_faltante uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if not wms.tiene_rol('asistente_dt', 'direccion_tecnica', 'jefe_almacen', 'reemplazo_jefe') then
    raise exception 'No tienes permiso para el expediente' using errcode = '42501';
  end if;
  update wms.expediente_faltantes set estado = 'RESUELTO', resuelto_por = auth.uid(), resuelto_en = now(),
         nota = nullif(trim(p_nota), '')
   where id = p_faltante and estado = 'ABIERTO';
  perform wms.registrar_audit('expediente_faltante_resuelto', 'expediente_faltantes', p_faltante::text, null, null, p_nota);
end $$;

create or replace function wms.cerrar_expediente(p_exp uuid)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_n int;
begin
  if not wms.tiene_rol('asistente_dt', 'direccion_tecnica') then
    raise exception 'Solo Sandra (Asistente de Dirección Técnica) o Dirección Técnica cierran el expediente' using errcode = '42501';
  end if;
  select count(*) into v_n from wms.expediente_faltantes where expediente_id = p_exp and estado = 'ABIERTO';
  if v_n > 0 then
    raise exception 'Todavía hay % faltante(s) abiertos: resuélvelos antes de cerrar', v_n using errcode = 'P0001';
  end if;
  update wms.expedientes set estado = 'CERRADO', cerrado_por = auth.uid(), cerrado_en = now() where id = p_exp;
  perform wms.registrar_audit('expediente_cerrado', 'expedientes', p_exp::text, null, null);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS y grants: lectura para quien tiene un rol WMS; ninguna escritura directa
-- ─────────────────────────────────────────────────────────────────────────────

do $$ declare t text; begin
  foreach t in array array['ingresos', 'ingreso_lineas', 'ingreso_lotes', 'solicitudes_ingreso',
      'solicitud_ingreso_versiones', 'actas_recepcion', 'acta_firmas', 'actas_organolepticas', 'alertas',
      'expedientes', 'expediente_documentos', 'expediente_faltantes'] loop
    execute format('drop policy if exists lectura on wms.%I', t);
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
  end loop;
end $$;

grant select on all tables in schema wms to authenticated;
grant execute on function
  wms.crear_ingreso(text, uuid, jsonb, jsonb),
  wms.editar_ingreso(uuid, jsonb),
  wms.guardar_lotes(uuid, uuid, jsonb),
  wms.editar_solicitud(uuid, jsonb, text),
  wms.lineas_descuadradas(uuid),
  wms.generar_acta_recepcion(uuid),
  wms.firmar_acta_recepcion(uuid, text, text, text, text, text),
  wms.anular_acta_recepcion(uuid, text),
  wms.reemitir_acta_recepcion(uuid),
  wms.confirmar_ingreso(uuid),
  wms.guardar_acta_organoleptica(uuid, jsonb, boolean),
  wms.decidir_acta_organoleptica(uuid, text, text),
  wms.atender_alerta(uuid, text),
  wms.revisar_divergencias(),
  wms.revisar_por_trasladar(),
  wms.revisar_vencimientos(),
  wms.agregar_documento_expediente(uuid, text, text, text, text),
  wms.agregar_faltante(uuid, text, text, text),
  wms.resolver_faltante(uuid, text),
  wms.cerrar_expediente(uuid),
  wms.muestra_organoleptica(integer) to authenticated;
