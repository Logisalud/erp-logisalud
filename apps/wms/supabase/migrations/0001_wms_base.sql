-- WMS Logisalud — migración 0001: schema, roles, topología, propietarios,
-- asignaciones con vigencia, maestro regulatorio y auditoría.
--
-- NO SE APLICA SOLA: en la base consolidada las migraciones se aplican a mano.
-- Re-ejecutable (if not exists / drop policy if exists / on conflict). RLS activo
-- desde el `create table`. Nada se concede a `anon`.
--
-- Requisitos del entorno (Supabase): función auth.uid(), roles authenticated y
-- service_role. Para el schema `wms` hay que exponerlo en Data API y agregarlo a
-- public.schemas_compras_y_pagos() (ver docs/wms/gate-0.md, A.4.5).

create extension if not exists btree_gist;
create schema if not exists wms;

-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogos de reglas (datos, no código)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.estados_sanitarios (
  codigo text primary key,
  nombre text not null,
  orden  int  not null
);
alter table wms.estados_sanitarios enable row level security;
insert into wms.estados_sanitarios (codigo, nombre, orden) values
  ('CUARENTENA', 'Cuarentena', 1),
  ('APROBADO', 'Aprobado', 2),
  ('BAJAS_RECHAZADOS', 'Bajas/Rechazados', 3)
on conflict (codigo) do nothing;

-- Transiciones permitidas. Aprobado→Cuarentena NO existe y no se puede crear:
-- el trigger de más abajo lo rechaza aunque alguien inserte la fila.
create table if not exists wms.transiciones_estado (
  desde text not null references wms.estados_sanitarios(codigo),
  hasta text not null references wms.estados_sanitarios(codigo),
  requiere_sustento boolean not null default true,
  primary key (desde, hasta),
  check (desde <> hasta)
);
alter table wms.transiciones_estado enable row level security;
insert into wms.transiciones_estado (desde, hasta, requiere_sustento) values
  ('CUARENTENA', 'APROBADO', true),
  ('CUARENTENA', 'BAJAS_RECHAZADOS', true),
  ('APROBADO', 'BAJAS_RECHAZADOS', true)
on conflict (desde, hasta) do nothing;

create or replace function wms.trg_prohibir_aprobado_a_cuarentena()
returns trigger language plpgsql as $$
begin
  if new.desde = 'APROBADO' and new.hasta = 'CUARENTENA' then
    raise exception 'Aprobado → Cuarentena está prohibido siempre' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists prohibir_aprobado_a_cuarentena on wms.transiciones_estado;
create trigger prohibir_aprobado_a_cuarentena
  before insert or update on wms.transiciones_estado
  for each row execute function wms.trg_prohibir_aprobado_a_cuarentena();

create table if not exists wms.tipos_area (
  codigo text primary key,
  nombre text not null,
  es_compartida boolean not null default false,  -- varios propietarios a la vez
  es_transito boolean not null default false,
  en_alcance boolean not null default true
);
alter table wms.tipos_area enable row level security;
insert into wms.tipos_area (codigo, nombre, es_compartida, es_transito, en_alcance) values
  ('RECEPCION', 'Recepción', true, true, true),
  ('CUARENTENA', 'Cuarentena', true, false, true),
  ('DEVOLUCIONES', 'Devoluciones', false, false, true),
  ('APROBADOS', 'Aprobados', false, false, true),
  ('BAJAS_RECHAZADOS', 'Bajas/Rechazados', false, false, true),
  ('CONTRAMUESTRA', 'Contramuestra', false, false, true),
  ('EMBALAJE', 'Embalaje', true, false, false),
  ('DESPACHO', 'Despacho', true, false, false)
on conflict (codigo) do nothing;

-- Orígenes de las unidades (dimensión separada del estado). Importación y
-- traslado existen deshabilitados: puntos de extensión.
create table if not exists wms.origenes (
  codigo text primary key,
  nombre text not null,
  habilitado boolean not null default true
);
alter table wms.origenes enable row level security;
insert into wms.origenes (codigo, nombre, habilitado) values
  ('COMPRA_LOCAL', 'Compra local', true),
  ('DEVOLUCION', 'Devolución', true),
  ('INGRESO_CLIENTE', 'Ingreso de cliente', true),
  ('CARGA_INICIAL', 'Carga inicial', true),
  ('AJUSTE', 'Ajuste autorizado', true),
  ('IMPORTACION', 'Importación', false),
  ('TRASLADO', 'Traslado', false)
on conflict (codigo) do nothing;

-- La matriz de "Zonas BPA y compatibilidad" (reglas-negocio.md) como datos.
-- Recepción, Contramuestra, Embalaje y Despacho no admiten ningún estado.
create table if not exists wms.area_estado_admitido (
  tipo_area text not null references wms.tipos_area(codigo),
  estado text not null references wms.estados_sanitarios(codigo),
  origen_requerido text references wms.origenes(codigo),
  primary key (tipo_area, estado)
);
alter table wms.area_estado_admitido enable row level security;
insert into wms.area_estado_admitido (tipo_area, estado, origen_requerido) values
  ('CUARENTENA', 'CUARENTENA', null),
  ('DEVOLUCIONES', 'CUARENTENA', 'DEVOLUCION'),
  ('APROBADOS', 'APROBADO', null),
  ('BAJAS_RECHAZADOS', 'BAJAS_RECHAZADOS', null)
on conflict (tipo_area, estado) do nothing;

create table if not exists wms.parametros (
  clave text primary key,
  valor text not null,
  nota text
);
alter table wms.parametros enable row level security;
insert into wms.parametros (clave, valor, nota) values
  ('temperatura_min_c', '15', 'Rango de recepción (reglas-negocio.md)'),
  ('temperatura_max_c', '25', 'Rango de recepción (reglas-negocio.md)')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Personas y permisos
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.usuario_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  rol text not null check (rol in (
    'direccion_tecnica', 'asistente_dt', 'jefe_almacen', 'reemplazo_jefe',
    'auxiliar', 'auditoria_lectura', 'admin_wms')),
  desde date not null default current_date,
  hasta date,
  creado_por uuid,
  creado_en timestamptz not null default now(),
  unique (user_id, rol, desde)
);
alter table wms.usuario_roles enable row level security;
create index if not exists usuario_roles_user_idx on wms.usuario_roles (user_id);

create table if not exists wms.permisos_rol (
  rol text not null,
  accion text not null check (accion in
    ('ver', 'ejecutar', 'verificar', 'aprobar', 'ajustar', 'configurar', 'exportar', 'auditar')),
  primary key (rol, accion)
);
alter table wms.permisos_rol enable row level security;
insert into wms.permisos_rol (rol, accion) values
  ('direccion_tecnica','ver'),('direccion_tecnica','aprobar'),('direccion_tecnica','ajustar'),
  ('direccion_tecnica','verificar'),('direccion_tecnica','exportar'),('direccion_tecnica','auditar'),
  ('asistente_dt','ver'),('asistente_dt','ejecutar'),('asistente_dt','exportar'),
  ('jefe_almacen','ver'),('jefe_almacen','ejecutar'),('jefe_almacen','verificar'),('jefe_almacen','exportar'),
  ('reemplazo_jefe','ver'),('reemplazo_jefe','ejecutar'),('reemplazo_jefe','verificar'),
  ('auxiliar','ver'),('auxiliar','ejecutar'),('auxiliar','verificar'),
  ('auditoria_lectura','ver'),('auditoria_lectura','exportar'),('auditoria_lectura','auditar'),
  ('admin_wms','ver'),('admin_wms','configurar'),('admin_wms','exportar'),('admin_wms','auditar')
on conflict (rol, accion) do nothing;

-- ¿Tiene la persona logueada alguno de estos roles hoy? (security definer para
-- poder leer usuario_roles desde las policies sin recursión.)
create or replace function wms.tiene_rol(variadic p_roles text[])
returns boolean language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (
    select 1 from wms.usuario_roles r
    where r.user_id = auth.uid()
      and r.rol = any (p_roles)
      and r.desde <= current_date
      and (r.hasta is null or r.hasta >= current_date))
$$;

create or replace function wms.tiene_permiso(p_accion text)
returns boolean language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (
    select 1 from wms.usuario_roles r
    join wms.permisos_rol p on p.rol = r.rol
    where r.user_id = auth.uid()
      and p.accion = p_accion
      and r.desde <= current_date
      and (r.hasta is null or r.hasta >= current_date))
$$;

create or replace function wms.es_usuario()
returns boolean language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (
    select 1 from wms.usuario_roles r
    where r.user_id = auth.uid()
      and r.desde <= current_date
      and (r.hasta is null or r.hasta >= current_date))
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Topología, propietarios y asignaciones
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.propietarios (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  razon_social text not null,
  ruc text,
  es_dueno_almacen boolean not null default false,
  proveedor_id uuid,           -- → compras.proveedores (FK en el Batch 2, si aplica)
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table wms.propietarios enable row level security;

create table if not exists wms.posiciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,            -- A-10.2 · E-8.1.3 · B-1 · A-M1
  rack text not null,
  posicion int,
  nivel int,
  subnivel int,
  forma text not null check (forma in ('RACK', 'PISO', 'MESA', 'SUBRACK')),
  tipo_area text not null references wms.tipos_area(codigo),
  activa boolean not null default true,
  por_verificar boolean not null default false,
  nota_verificacion text,
  capacidad_pallets int,
  creado_en timestamptz not null default now()
);
alter table wms.posiciones enable row level security;
create index if not exists posiciones_rack_idx on wms.posiciones (rack, posicion);

-- Geometría aproximada para el mapa (los planos no tienen escala exacta).
create table if not exists wms.posicion_geometria (
  posicion_id uuid primary key references wms.posiciones(id) on delete cascade,
  x numeric not null, y numeric not null,
  ancho numeric not null default 1, alto numeric not null default 1,
  rotacion numeric not null default 0,
  aproximada boolean not null default true,
  plano_ref text
);
alter table wms.posicion_geometria enable row level security;

create table if not exists wms.documentos_sustento (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('CONTRATO', 'ADENDA', 'PLANO', 'OTRO')),
  titulo text not null,
  fecha_documento date,
  vigente_desde date,
  vigente_hasta date,
  archivo_ref text,                       -- ruta del archivo en el repo/bucket
  estado_confirmacion text not null default 'CONFIRMADO'
    check (estado_confirmacion in ('CONFIRMADO', 'POR_CONFIRMAR')),
  nota text,
  unique (titulo)
);
alter table wms.documentos_sustento enable row level security;

create table if not exists wms.asignaciones_posicion (
  id uuid primary key default gen_random_uuid(),
  posicion_id uuid not null references wms.posiciones(id),
  propietario_id uuid not null references wms.propietarios(id),
  desde date not null,
  hasta date,
  documento_id uuid references wms.documentos_sustento(id),
  exclusiva boolean not null default true,  -- la fija el trigger según el área
  nota text,
  creado_en timestamptz not null default now(),
  check (hasta is null or hasta > desde)
);
alter table wms.asignaciones_posicion enable row level security;

-- Una posición NO compartida tiene un solo propietario a la vez: los rangos
-- [desde, hasta) de sus asignaciones no se pueden solapar.
do $$ begin
  alter table wms.asignaciones_posicion
    add constraint asignaciones_sin_solape
    exclude using gist (posicion_id with =, daterange(desde, hasta) with &&)
    where (exclusiva);
exception when duplicate_object or duplicate_table then null; end $$;

create or replace function wms.trg_asignacion_exclusiva()
returns trigger language plpgsql as $$
begin
  select not a.es_compartida into new.exclusiva
  from wms.posiciones p join wms.tipos_area a on a.codigo = p.tipo_area
  where p.id = new.posicion_id;
  return new;
end $$;
drop trigger if exists asignacion_exclusiva on wms.asignaciones_posicion;
create trigger asignacion_exclusiva
  before insert or update on wms.asignaciones_posicion
  for each row execute function wms.trg_asignacion_exclusiva();

-- ¿Acepta esta posición stock de este propietario en esa fecha?
--  · área compartida → cualquier propietario activo;
--  · área exclusiva  → solo con una asignación vigente a su nombre.
-- Una asignación vencida NO mueve stock: solo deja de aceptar nuevo.
create or replace function wms.posicion_acepta(p_posicion uuid, p_propietario uuid, p_fecha date default current_date)
returns boolean language sql stable set search_path = wms, pg_temp as $$
  select case
    when not p.activa then false
    when a.es_compartida then exists (select 1 from wms.propietarios o where o.id = p_propietario and o.activo)
    else exists (
      select 1 from wms.asignaciones_posicion s
      where s.posicion_id = p.id and s.propietario_id = p_propietario
        and s.desde <= p_fecha and (s.hasta is null or p_fecha < s.hasta))
  end
  from wms.posiciones p join wms.tipos_area a on a.codigo = p.tipo_area
  where p.id = p_posicion
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Maestro regulatorio (1:1 con el producto del catálogo de Compras)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.producto_regulatorio (
  producto_id uuid primary key,           -- → catalogo.productos(id)
  registro_sanitario text,
  rs_vence date,
  fabricante text,
  forma_presentacion text,
  estado_validacion text not null default 'PENDIENTE'
    check (estado_validacion in ('PENDIENTE', 'VALIDADO', 'OBSERVADO')),
  observacion text,
  creado_por uuid,                        -- Sandra
  creado_en timestamptz not null default now(),
  validado_por uuid,                      -- Katia
  validado_en timestamptz,
  check (estado_validacion <> 'VALIDADO' or (validado_por is not null and validado_en is not null))
);
alter table wms.producto_regulatorio enable row level security;

-- FK al catálogo solo si existe (producción sí; es aditivo del lado de wms).
do $$ begin
  if to_regclass('catalogo.productos') is not null then
    begin
      alter table wms.producto_regulatorio
        add constraint producto_regulatorio_producto_fk
        foreign key (producto_id) references catalogo.productos(id);
    exception when duplicate_object then null; end;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría (append-only)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.audit_events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  actor uuid,
  evento text not null,
  entidad text not null,
  entidad_id text,
  antes jsonb,
  despues jsonb,
  motivo text,
  fuente text not null default 'wms'
);
alter table wms.audit_events enable row level security;
create index if not exists audit_events_entidad_idx on wms.audit_events (entidad, entidad_id);
create index if not exists audit_events_ts_idx on wms.audit_events (ts desc);

create or replace function wms.trg_inmutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Registro inmutable (%): no se edita ni se borra; se corrige con un registro nuevo vinculado', tg_table_name
    using errcode = 'P0001';
end $$;

drop trigger if exists audit_inmutable on wms.audit_events;
create trigger audit_inmutable before update or delete on wms.audit_events
  for each row execute function wms.trg_inmutable();
drop trigger if exists audit_inmutable_truncate on wms.audit_events;
create trigger audit_inmutable_truncate before truncate on wms.audit_events
  for each statement execute function wms.trg_inmutable();

create or replace function wms.registrar_audit(
  p_evento text, p_entidad text, p_entidad_id text,
  p_antes jsonb, p_despues jsonb, p_motivo text default null)
returns void language sql security definer set search_path = wms, pg_temp as $$
  insert into wms.audit_events (actor, evento, entidad, entidad_id, antes, despues, motivo)
  values (auth.uid(), p_evento, p_entidad, p_entidad_id, p_antes, p_despues, p_motivo)
$$;

-- Auditoría de respaldo para configuración y maestros (quién, qué, antes, después).
create or replace function wms.trg_audit()
returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id text;
begin
  v_id := coalesce((to_jsonb(coalesce(new, old))->>'id'), (to_jsonb(coalesce(new, old))->>'producto_id'),
                   (to_jsonb(coalesce(new, old))->>'codigo'));
  insert into wms.audit_events (actor, evento, entidad, entidad_id, antes, despues, motivo)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
          nullif(current_setting('wms.motivo', true), ''));
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['propietarios', 'posiciones', 'asignaciones_posicion',
                           'documentos_sustento', 'usuario_roles', 'producto_regulatorio'] loop
    execute format('drop trigger if exists audit_respaldo on wms.%I', t);
    execute format('create trigger audit_respaldo after insert or update or delete on wms.%I
                    for each row execute function wms.trg_audit()', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: lectura para cualquier persona con rol WMS; escritura solo de quien
-- corresponde. Las tablas del ledger no aceptan DML directo (migración 0002).
-- ─────────────────────────────────────────────────────────────────────────────

do $$ declare t text; begin
  foreach t in array array['estados_sanitarios', 'transiciones_estado', 'tipos_area', 'origenes',
      'area_estado_admitido', 'parametros', 'permisos_rol', 'propietarios', 'posiciones',
      'posicion_geometria', 'documentos_sustento', 'asignaciones_posicion', 'producto_regulatorio'] loop
    execute format('drop policy if exists lectura on wms.%I', t);
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
  end loop;
  -- Configuración: solo admin_wms escribe.
  foreach t in array array['estados_sanitarios', 'transiciones_estado', 'tipos_area', 'origenes',
      'area_estado_admitido', 'parametros', 'permisos_rol', 'propietarios', 'posiciones',
      'posicion_geometria', 'documentos_sustento', 'asignaciones_posicion'] loop
    execute format('drop policy if exists escritura on wms.%I', t);
    execute format('create policy escritura on wms.%I for all to authenticated
                    using (wms.tiene_rol(''admin_wms'')) with check (wms.tiene_rol(''admin_wms''))', t);
  end loop;
end $$;

-- Maestro regulatorio: Sandra (asistente_dt) crea y edita lo no validado; Katia valida.
drop policy if exists alta_sandra on wms.producto_regulatorio;
create policy alta_sandra on wms.producto_regulatorio for insert to authenticated
  with check (wms.tiene_rol('asistente_dt', 'direccion_tecnica') and estado_validacion = 'PENDIENTE'
              and creado_por = auth.uid());
drop policy if exists edita_sandra on wms.producto_regulatorio;
create policy edita_sandra on wms.producto_regulatorio for update to authenticated
  using (wms.tiene_rol('asistente_dt') and estado_validacion <> 'VALIDADO')
  with check (wms.tiene_rol('asistente_dt') and estado_validacion <> 'VALIDADO');
drop policy if exists valida_katia on wms.producto_regulatorio;
create policy valida_katia on wms.producto_regulatorio for update to authenticated
  using (wms.tiene_rol('direccion_tecnica')) with check (wms.tiene_rol('direccion_tecnica'));

-- Roles: cada quien ve los suyos; admin_wms los administra.
drop policy if exists lectura_propia on wms.usuario_roles;
create policy lectura_propia on wms.usuario_roles for select to authenticated
  using (user_id = auth.uid() or wms.tiene_rol('admin_wms', 'direccion_tecnica', 'auditoria_lectura'));
drop policy if exists admin on wms.usuario_roles;
create policy admin on wms.usuario_roles for all to authenticated
  using (wms.tiene_rol('admin_wms')) with check (wms.tiene_rol('admin_wms'));

-- Auditoría: la lee quien tiene permiso 'auditar'; no se escribe directo.
drop policy if exists lectura on wms.audit_events;
create policy lectura on wms.audit_events for select to authenticated
  using (wms.tiene_permiso('auditar'));

-- Grants: solo a authenticated; nada a anon.
revoke all on schema wms from public;
grant usage on schema wms to authenticated;
grant select on all tables in schema wms to authenticated;
grant insert, update, delete on
  wms.propietarios, wms.posiciones, wms.posicion_geometria, wms.documentos_sustento,
  wms.asignaciones_posicion, wms.usuario_roles, wms.parametros, wms.area_estado_admitido,
  wms.transiciones_estado, wms.tipos_area, wms.origenes, wms.estados_sanitarios,
  wms.permisos_rol to authenticated;
grant insert, update on wms.producto_regulatorio to authenticated;
grant execute on function wms.tiene_rol(text[]), wms.tiene_permiso(text), wms.es_usuario(),
  wms.posicion_acepta(uuid, uuid, date) to authenticated;
