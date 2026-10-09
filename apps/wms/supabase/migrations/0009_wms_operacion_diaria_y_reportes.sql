-- WMS Logisalud — migración 0009 (Batch 3b):
--   · Revisión diaria del almacén (INV-04): recorrido con 4 focos; solo registra pendientes, siempre con responsable.
--   · Programación de los 3 inventarios cíclicos semanales (INV-05) con rotación de ubicaciones y conteo extra por incidencia.
--   · Vistas guardadas de reportes (por persona) y la lectura de exactitud de inventario (conteos cerrados).
--
-- NO SE APLICA SOLA: se aplica a mano con el resto de la salida a producción (docs/wms/plan-aplicacion-produccion.md).
-- Re-ejecutable. Sin `drop … if exists`: las comprobaciones de existencia son explícitas. Todo dentro de `wms`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Alertas: tipo nuevo (un pendiente de la revisión diaria que puede afectar producto avisa a Dirección Técnica)
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'alertas_tipo_check' and conrelid = 'wms.alertas'::regclass) then
    alter table wms.alertas drop constraint alertas_tipo_check;
  end if;
  alter table wms.alertas add constraint alertas_tipo_check check (tipo in (
    'TEMPERATURA', 'RS_VENCIDO', 'DIVERGENCIA_COMPRAS', 'POR_TRASLADAR_VENCIDO', 'LOTE_POR_VENCER', 'LOTE_VENCIDO',
    'SOLICITUD_AJUSTADA', 'EXCEDE_OC', 'POR_REGISTRAR_EN_COMPRAS', 'NO_COINCIDE_CON_COMPRAS',
    'MOVIMIENTO_CON_DIFERENCIA', 'MOVIMIENTO_SIN_VERIFICAR', 'CONTEO_CON_DIFERENCIA', 'AJUSTE_POR_AUTORIZAR', 'PENDIENTE_AFECTA_PRODUCTO'));
end $$;

insert into wms.parametros (clave, valor, nota) values
  ('conteo_ubicaciones_por_conteo', '4', 'Cuántas ubicaciones lleva cada uno de los 3 conteos cíclicos semanales (INV-05, rotación simple)'),
  ('conteos_ciclicos_por_semana', '3', 'INV-05: tres conteos pequeños por semana')
on conflict (clave) do nothing;

create or replace function wms._hoy_lima() returns date
language sql stable as $$ select (now() at time zone 'America/Lima')::date $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Revisión diaria del almacén (INV-04)
--    Un recorrido de 10–15 minutos con 4 focos. NO mueve stock, NO decide estados, NO es una inspección de calidad:
--    solo registra pendientes (qué pasó, quién lo resuelve, estado). Todo traslado se hace con un Movimiento (INV-02).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists wms.revisiones_diarias (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,                       -- RD-AAAAMMDD
  fecha date not null unique,                        -- una por día (hora de Lima)
  responsable_id uuid not null,                      -- quien hizo el recorrido
  estado text not null default 'ABIERTA' check (estado in ('ABIERTA', 'CERRADA')),
  creada_en timestamptz not null default now(),
  cerrada_por uuid,
  cerrada_en timestamptz,
  nota_cierre text,
  check (estado = 'ABIERTA' or (cerrada_por is not null and cerrada_en is not null))
);
alter table wms.revisiones_diarias enable row level security;

create table if not exists wms.revision_focos (
  revision_id uuid not null references wms.revisiones_diarias(id),
  foco text not null check (foco in ('ORDEN', 'LIMPIEZA', 'UBICACIONES', 'ANORMAL')),
  resultado text not null check (resultado in ('SIN_PROBLEMAS', 'CON_PENDIENTES')),
  revisado_por uuid not null,
  revisado_en timestamptz not null default now(),
  primary key (revision_id, foco)
);
alter table wms.revision_focos enable row level security;

create table if not exists wms.revision_pendientes (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references wms.revisiones_diarias(id),
  foco text not null check (foco in ('ORDEN', 'LIMPIEZA', 'UBICACIONES', 'ANORMAL')),
  descripcion text not null check (nullif(trim(descripcion), '') is not null),
  responsable_id uuid not null,                      -- SIEMPRE hay un responsable
  critico boolean not null default false,
  afecta_producto boolean not null default false,    -- si puede afectar producto, se avisa a Dirección Técnica
  ubicacion text,                                    -- referencia libre (A-12.1…), no mueve nada
  estado text not null default 'ABIERTO' check (estado in ('ABIERTO', 'RESUELTO', 'VERIFICADO')),
  creado_por uuid not null,
  creado_en timestamptz not null default now(),
  resuelto_por uuid,
  resuelto_en timestamptz,
  nota_resolucion text,
  verificado_por uuid,
  verificado_en timestamptz,
  check (estado = 'ABIERTO' or (resuelto_por is not null and resuelto_en is not null)),
  check (estado <> 'VERIFICADO' or (verificado_por is not null and verificado_en is not null))
);
alter table wms.revision_pendientes enable row level security;
create index if not exists revision_pendientes_rev_idx on wms.revision_pendientes (revision_id);
create index if not exists revision_pendientes_abiertos_idx on wms.revision_pendientes (estado) where estado <> 'VERIFICADO';

do $$ declare t text; begin
  foreach t in array array['revisiones_diarias', 'revision_focos', 'revision_pendientes'] loop
    if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then
      execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
    end if;
  end loop;
end $$;
grant select on wms.revisiones_diarias, wms.revision_focos, wms.revision_pendientes to authenticated;

-- Empieza (o retoma) la revisión de hoy. Una por día: llamarla otra vez devuelve la misma.
create or replace function wms.iniciar_revision_diaria() returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_hoy date := wms._hoy_lima(); v_id uuid;
begin
  perform wms._exigir_jefe();
  select id into v_id from wms.revisiones_diarias where fecha = v_hoy;
  if v_id is not null then return v_id; end if;
  insert into wms.revisiones_diarias (numero, fecha, responsable_id) values ('RD-' || to_char(v_hoy, 'YYYYMMDD'), v_hoy, auth.uid())
  returning id into v_id;
  perform wms.registrar_audit('revision_diaria_iniciada', 'revisiones_diarias', v_id::text, null, jsonb_build_object('fecha', v_hoy), null);
  return v_id;
end $$;

create or replace function wms._revision_abierta(p_revision uuid) returns wms.revisiones_diarias
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare r wms.revisiones_diarias;
begin
  select * into r from wms.revisiones_diarias where id = p_revision;
  if r.id is null then raise exception 'No encontramos esa revisión' using errcode = 'P0001'; end if;
  if r.estado = 'CERRADA' then raise exception 'La revisión de ese día ya está cerrada' using errcode = 'P0001'; end if;
  return r;
end $$;

-- Marca un foco como revisado. «Sin problemas» no se puede si el foco ya tiene pendientes abiertos en esta revisión.
create or replace function wms.marcar_foco(p_revision uuid, p_foco text, p_resultado text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  perform wms._exigir_jefe();
  perform wms._revision_abierta(p_revision);
  if p_foco is null or p_foco not in ('ORDEN', 'LIMPIEZA', 'UBICACIONES', 'ANORMAL') then
    raise exception 'Ese foco no existe' using errcode = 'P0001';
  end if;
  if p_resultado is null or p_resultado not in ('SIN_PROBLEMAS', 'CON_PENDIENTES') then
    raise exception 'El resultado del foco debe ser «sin problemas» o «con pendientes»' using errcode = 'P0001';
  end if;
  if p_resultado = 'SIN_PROBLEMAS' and exists (
       select 1 from wms.revision_pendientes where revision_id = p_revision and foco = p_foco and estado = 'ABIERTO') then
    raise exception 'Ese foco tiene pendientes abiertos: no puede quedar «sin problemas»' using errcode = 'P0001';
  end if;
  insert into wms.revision_focos (revision_id, foco, resultado, revisado_por) values (p_revision, p_foco, p_resultado, auth.uid())
  on conflict (revision_id, foco) do update set resultado = excluded.resultado, revisado_por = excluded.revisado_por, revisado_en = now();
end $$;

-- Registra un pendiente: qué pasó, quién lo resuelve y estado. El responsable es obligatorio y debe ser alguien del equipo.
create or replace function wms.registrar_pendiente(
  p_revision uuid, p_foco text, p_descripcion text, p_responsable uuid,
  p_critico boolean default false, p_afecta_producto boolean default false, p_ubicacion text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_rev wms.revisiones_diarias;
begin
  perform wms._exigir_jefe();
  v_rev := wms._revision_abierta(p_revision);
  if p_foco is null or p_foco not in ('ORDEN', 'LIMPIEZA', 'UBICACIONES', 'ANORMAL') then
    raise exception 'Ese foco no existe' using errcode = 'P0001';
  end if;
  if nullif(trim(p_descripcion), '') is null then raise exception 'Cuenta qué pasó' using errcode = 'P0001'; end if;
  if p_responsable is null then raise exception 'Todo pendiente necesita un responsable' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.usuario_roles r where r.user_id = p_responsable and r.desde <= current_date and (r.hasta is null or r.hasta >= current_date)) then
    raise exception 'El responsable debe ser una persona del equipo del WMS' using errcode = 'P0001';
  end if;
  insert into wms.revision_pendientes (id, revision_id, foco, descripcion, responsable_id, critico, afecta_producto, ubicacion, creado_por)
  values (v_id, p_revision, p_foco, trim(p_descripcion), p_responsable, coalesce(p_critico, false), coalesce(p_afecta_producto, false), nullif(trim(p_ubicacion), ''), auth.uid());
  insert into wms.revision_focos (revision_id, foco, resultado, revisado_por) values (p_revision, p_foco, 'CON_PENDIENTES', auth.uid())
  on conflict (revision_id, foco) do update set resultado = 'CON_PENDIENTES', revisado_por = excluded.revisado_por, revisado_en = now();
  if coalesce(p_afecta_producto, false) then
    perform wms._alertar('PENDIENTE_AFECTA_PRODUCTO', 'direccion_tecnica', null, null, 'rd-pend:' || v_id::text,
                         'Revisión diaria ' || v_rev.numero || ': ' || trim(p_descripcion) || ' (puede afectar producto)');
  end if;
  perform wms.registrar_audit('pendiente_registrado', 'revision_pendientes', v_id::text, null,
                              jsonb_build_object('foco', p_foco, 'responsable', p_responsable, 'critico', coalesce(p_critico, false)), p_descripcion);
  return v_id;
end $$;

-- Lo resuelve su responsable (o el Jefe). Sigue visible en las revisiones siguientes hasta que se verifique.
create or replace function wms.resolver_pendiente(p_pendiente uuid, p_nota text default null) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare p wms.revision_pendientes;
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  select * into p from wms.revision_pendientes where id = p_pendiente for update;
  if p.id is null then raise exception 'No encontramos ese pendiente' using errcode = 'P0001'; end if;
  if auth.uid() <> p.responsable_id and not wms.tiene_rol('jefe_almacen', 'reemplazo_jefe') then
    raise exception 'Solo su responsable o el Jefe de Almacén resuelven este pendiente' using errcode = '42501';
  end if;
  if p.estado <> 'ABIERTO' then raise exception 'Ese pendiente ya no está abierto' using errcode = 'P0001'; end if;
  update wms.revision_pendientes set estado = 'RESUELTO', resuelto_por = auth.uid(), resuelto_en = now(), nota_resolucion = nullif(trim(p_nota), '')
   where id = p_pendiente;
  perform wms.registrar_audit('pendiente_resuelto', 'revision_pendientes', p_pendiente::text, null, null, p_nota);
end $$;

-- «Volver a revisar solo los pendientes importantes»: el Jefe comprueba que quedó resuelto (o lo reabre con su nota).
create or replace function wms.verificar_pendiente(p_pendiente uuid, p_conforme boolean, p_nota text default null) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare p wms.revision_pendientes;
begin
  perform wms._exigir_jefe();
  select * into p from wms.revision_pendientes where id = p_pendiente for update;
  if p.id is null then raise exception 'No encontramos ese pendiente' using errcode = 'P0001'; end if;
  if p.estado <> 'RESUELTO' then raise exception 'Solo se verifica un pendiente que ya está resuelto' using errcode = 'P0001'; end if;
  if p_conforme then
    update wms.revision_pendientes set estado = 'VERIFICADO', verificado_por = auth.uid(), verificado_en = now() where id = p_pendiente;
  else
    if nullif(trim(p_nota), '') is null then raise exception 'Cuenta qué falta para reabrirlo' using errcode = 'P0001'; end if;
    update wms.revision_pendientes set estado = 'ABIERTO', resuelto_por = null, resuelto_en = null,
           nota_resolucion = 'Reabierto: ' || trim(p_nota) where id = p_pendiente;
  end if;
  perform wms.registrar_audit(case when p_conforme then 'pendiente_verificado' else 'pendiente_reabierto' end, 'revision_pendientes', p_pendiente::text, null, null, p_nota);
end $$;

-- Cierra la revisión del día: los 4 focos revisados y ningún pendiente sin responsable (no puede haberlo: es obligatorio).
create or replace function wms.cerrar_revision_diaria(p_revision uuid, p_nota text default null) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_faltan text;
begin
  perform wms._exigir_jefe();
  perform wms._revision_abierta(p_revision);
  select string_agg(f.nombre, ', ' order by f.ord) into v_faltan
    from (values (1, 'ORDEN', 'orden y circulación'), (2, 'LIMPIEZA', 'limpieza'), (3, 'UBICACIONES', 'ubicaciones'), (4, 'ANORMAL', 'situaciones anormales')) f(ord, foco, nombre)
   where not exists (select 1 from wms.revision_focos x where x.revision_id = p_revision and x.foco = f.foco);
  if v_faltan is not null then raise exception 'Falta revisar: %', v_faltan using errcode = 'P0001'; end if;
  if exists (select 1 from wms.revision_pendientes where revision_id = p_revision and responsable_id is null) then
    raise exception 'No puede quedar un pendiente sin responsable' using errcode = 'P0001';
  end if;
  update wms.revisiones_diarias set estado = 'CERRADA', cerrada_por = auth.uid(), cerrada_en = now(), nota_cierre = nullif(trim(p_nota), '')
   where id = p_revision;
  perform wms.registrar_audit('revision_diaria_cerrada', 'revisiones_diarias', p_revision::text, null,
    jsonb_build_object('pendientes', (select count(*) from wms.revision_pendientes where revision_id = p_revision)), p_nota);
end $$;

-- Personas a las que se puede asignar un pendiente (con su rol), para el selector de responsable.
create or replace function wms.personas_del_equipo() returns table (user_id uuid, rol text)
language sql stable security definer set search_path = wms, pg_temp as $$
  select distinct on (r.user_id) r.user_id, r.rol
    from wms.usuario_roles r
   where wms.es_usuario() and r.desde <= current_date and (r.hasta is null or r.hasta >= current_date)
     and r.rol in ('jefe_almacen', 'reemplazo_jefe', 'auxiliar', 'asistente_dt', 'direccion_tecnica')
   order by r.user_id, r.desde desc
$$;

grant execute on function
  wms.iniciar_revision_diaria(), wms.marcar_foco(uuid, text, text), wms.registrar_pendiente(uuid, text, text, uuid, boolean, boolean, text),
  wms.resolver_pendiente(uuid, text), wms.verificar_pendiente(uuid, boolean, text), wms.cerrar_revision_diaria(uuid, text),
  wms.personas_del_equipo() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Programación de los inventarios cíclicos (INV-05): 3 conteos pequeños por semana + extra por incidencia
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists wms.programacion_conteos (
  id uuid primary key default gen_random_uuid(),
  semana date not null check (extract(isodow from semana) = 1),        -- lunes de la semana
  tipo text not null check (tipo in ('ROTATIVO', 'EXTRA')),
  orden smallint check (orden is null or orden between 1 and 3),
  posiciones uuid[] not null check (cardinality(posiciones) > 0),
  nota text,
  estado text not null default 'PROGRAMADO' check (estado in ('PROGRAMADO', 'GENERADO', 'CANCELADO')),
  conteo_id uuid references wms.conteos(id),
  motivo_cancelacion text,
  creado_por uuid not null,
  creado_en timestamptz not null default now(),
  check ((tipo = 'ROTATIVO' and orden is not null) or (tipo = 'EXTRA' and orden is null and nullif(trim(nota), '') is not null)),
  check (estado <> 'GENERADO' or conteo_id is not null),
  check (estado <> 'CANCELADO' or nullif(trim(motivo_cancelacion), '') is not null)
);
alter table wms.programacion_conteos enable row level security;
create unique index if not exists programacion_conteos_slot_idx on wms.programacion_conteos (semana, orden) where tipo = 'ROTATIVO' and estado <> 'CANCELADO';

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'programacion_conteos' and policyname = 'lectura') then
    create policy lectura on wms.programacion_conteos for select to authenticated using (wms.es_usuario());
  end if;
end $$;
grant select on wms.programacion_conteos to authenticated;

create or replace function wms._lunes(p_fecha date) returns date
language sql immutable as $$ select p_fecha - (extract(isodow from p_fecha)::int - 1) $$;

-- Cuándo se cubrió cada ubicación por última vez: el último conteo (de cualquier estado) o la última programación que la incluyó.
create or replace function wms.ultima_cobertura_por_posicion() returns table (posicion_id uuid, ultima date)
language sql stable security definer set search_path = wms, pg_temp as $$
  select x.posicion_id, max(x.fecha)::date
    from (
      select l.posicion_id, (c.programado_en at time zone 'America/Lima')::date as fecha
        from wms.conteo_lineas l join wms.conteos c on c.id = l.conteo_id
      union all
      select unnest(p.posiciones), p.semana from wms.programacion_conteos p where p.estado <> 'CANCELADO'
    ) x
   where wms.es_usuario()
   group by x.posicion_id
$$;

-- Programa UNO de los 3 conteos de la semana (orden 1 a 3).
create or replace function wms.programar_conteo_semanal(p_semana date, p_orden integer, p_posiciones uuid[], p_nota text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_lunes date := wms._lunes(p_semana); v_cod text;
begin
  perform wms._exigir_jefe();
  if p_orden is null or p_orden not between 1 and 3 then
    raise exception 'Son tres conteos por semana: elige el 1, el 2 o el 3' using errcode = 'P0001';
  end if;
  if p_posiciones is null or cardinality(p_posiciones) = 0 then
    raise exception 'Elige al menos una ubicación para contar' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.programacion_conteos where semana = v_lunes and tipo = 'ROTATIVO' and orden = p_orden and estado <> 'CANCELADO') then
    raise exception 'El conteo % de esa semana ya está programado', p_orden using errcode = 'P0001';
  end if;
  select ps.codigo into v_cod from wms.programacion_conteos p join wms.posiciones ps on ps.id = any (p.posiciones)
   where p.semana = v_lunes and p.tipo = 'ROTATIVO' and p.estado <> 'CANCELADO' and ps.id = any (p_posiciones) limit 1;
  if v_cod is not null then raise exception 'La ubicación % ya está en otro conteo de esa semana', v_cod using errcode = 'P0001'; end if;
  select x.id::text into v_cod from unnest(p_posiciones) x(id) where not exists (select 1 from wms.posiciones ps where ps.id = x.id and ps.activa) limit 1;
  if v_cod is not null then raise exception 'Una de las ubicaciones no existe o está inactiva' using errcode = 'P0001'; end if;
  insert into wms.programacion_conteos (id, semana, tipo, orden, posiciones, nota, creado_por)
  values (v_id, v_lunes, 'ROTATIVO', p_orden, p_posiciones, nullif(trim(p_nota), ''), auth.uid());
  perform wms.registrar_audit('conteo_semanal_programado', 'programacion_conteos', v_id::text, null,
                              jsonb_build_object('semana', v_lunes, 'orden', p_orden, 'ubicaciones', cardinality(p_posiciones)), p_nota);
  return v_id;
end $$;

-- Conteo extra por una incidencia: no cuenta entre los 3 de la semana y exige decir cuál fue la incidencia.
create or replace function wms.programar_conteo_extra(p_posiciones uuid[], p_incidencia text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid := gen_random_uuid();
begin
  perform wms._exigir_jefe();
  if nullif(trim(p_incidencia), '') is null then raise exception 'Cuenta cuál fue la incidencia que pide el conteo extra' using errcode = 'P0001'; end if;
  if p_posiciones is null or cardinality(p_posiciones) = 0 then raise exception 'Elige al menos una ubicación para contar' using errcode = 'P0001'; end if;
  insert into wms.programacion_conteos (id, semana, tipo, posiciones, nota, creado_por)
  values (v_id, wms._lunes(wms._hoy_lima()), 'EXTRA', p_posiciones, trim(p_incidencia), auth.uid());
  perform wms.registrar_audit('conteo_extra_programado', 'programacion_conteos', v_id::text, null, jsonb_build_object('ubicaciones', cardinality(p_posiciones)), p_incidencia);
  return v_id;
end $$;

create or replace function wms.cancelar_programacion(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare p wms.programacion_conteos;
begin
  perform wms._exigir_jefe();
  if nullif(trim(p_motivo), '') is null then raise exception 'Cuenta por qué se cancela' using errcode = 'P0001'; end if;
  select * into p from wms.programacion_conteos where id = p_id for update;
  if p.id is null then raise exception 'No encontramos esa programación' using errcode = 'P0001'; end if;
  if p.estado <> 'PROGRAMADO' then raise exception 'Solo se cancela un conteo que todavía no se generó' using errcode = 'P0001'; end if;
  update wms.programacion_conteos set estado = 'CANCELADO', motivo_cancelacion = trim(p_motivo) where id = p_id;
  perform wms.registrar_audit('conteo_programado_cancelado', 'programacion_conteos', p_id::text, null, null, p_motivo);
end $$;

-- Convierte una programación en el conteo real (con conteo a ciegas, pausa de ubicaciones, etc. de 0007).
create or replace function wms.generar_conteo_programado(p_id uuid) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare p wms.programacion_conteos; v_conteo uuid;
begin
  perform wms._exigir_jefe();
  select * into p from wms.programacion_conteos where id = p_id for update;
  if p.id is null then raise exception 'No encontramos esa programación' using errcode = 'P0001'; end if;
  if p.estado <> 'PROGRAMADO' then raise exception 'Ese conteo ya se generó o se canceló' using errcode = 'P0001'; end if;
  v_conteo := wms.programar_conteo(p.posiciones, coalesce(p.nota, case when p.tipo = 'ROTATIVO' then 'Conteo cíclico semanal ' || p.orden else null end));
  update wms.programacion_conteos set estado = 'GENERADO', conteo_id = v_conteo where id = p_id;
  return v_conteo;
end $$;

grant execute on function
  wms.ultima_cobertura_por_posicion(), wms.programar_conteo_semanal(date, integer, uuid[], text), wms.programar_conteo_extra(uuid[], text),
  wms.cancelar_programacion(uuid, text), wms.generar_conteo_programado(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Reportes: vistas guardadas por persona y exactitud del inventario
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists wms.vistas_guardadas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid(),
  reporte text not null check (reporte in ('INVENTARIO', 'OCUPACION', 'RECEPCIONES', 'CALIDAD', 'MOVIMIENTOS', 'EXACTITUD', 'AUDITORIA', 'VENCIMIENTOS')),
  nombre text not null check (nullif(trim(nombre), '') is not null),
  filtros jsonb not null default '{}'::jsonb,
  creada_en timestamptz not null default now(),
  unique (usuario_id, reporte, nombre)
);
alter table wms.vistas_guardadas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'vistas_guardadas' and policyname = 'propias_lectura') then
    create policy propias_lectura on wms.vistas_guardadas for select to authenticated using (usuario_id = auth.uid() and wms.es_usuario());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'vistas_guardadas' and policyname = 'propias_alta') then
    create policy propias_alta on wms.vistas_guardadas for insert to authenticated with check (usuario_id = auth.uid() and wms.es_usuario());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'vistas_guardadas' and policyname = 'propias_baja') then
    create policy propias_baja on wms.vistas_guardadas for delete to authenticated using (usuario_id = auth.uid() and wms.es_usuario());
  end if;
end $$;
grant select, insert, delete on wms.vistas_guardadas to authenticated;

-- Exactitud del inventario: solo conteos CERRADOS (el saldo del sistema se conoce cuando el conteo terminó) y solo para quien gestiona.
-- La cantidad contada es la del reconteo si lo hubo; si no, la del primer conteo.
create or replace function wms.exactitud_conteos(p_desde date default null, p_hasta date default null)
returns table (
  conteo text, cerrado_en timestamptz, posicion text, producto text, lote text, propietario text, estado text,
  cantidad_sistema integer, cantidad_contada integer, diferencia integer, resultado text, causa text)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if not wms.tiene_rol('jefe_almacen', 'reemplazo_jefe', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura') then
    raise exception 'Solo quien gestiona el inventario ve la exactitud' using errcode = '42501';
  end if;
  return query
  select c.numero, c.cerrado_en, ps.codigo, pr.codigo || ' · ' || pr.descripcion, lt.codigo, o.codigo, l.estado,
         l.cantidad_sistema, coalesce(l.conteo2, l.conteo1), coalesce(l.conteo2, l.conteo1) - l.cantidad_sistema, l.resultado, l.causa
    from wms.conteo_lineas l
    join wms.conteos c on c.id = l.conteo_id
    join wms.posiciones ps on ps.id = l.posicion_id
    join catalogo.productos pr on pr.id = l.producto_id
    join wms.lotes lt on lt.id = l.lote_id
    join wms.propietarios o on o.id = l.propietario_id
   where c.estado = 'CERRADO' and l.conteo1 is not null
     and (p_desde is null or (c.cerrado_en at time zone 'America/Lima')::date >= p_desde)
     and (p_hasta is null or (c.cerrado_en at time zone 'America/Lima')::date <= p_hasta)
   order by c.cerrado_en desc, ps.codigo;
end $$;
grant execute on function wms.exactitud_conteos(date, date) to authenticated;
