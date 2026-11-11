-- 0058 piloto: inspecciones de la unidad de transporte (formatos LS-FR.49.03 «Inspección de la unidad de transporte (vehículo)» y LS-FR.52.03 «Control de limpieza de la unidad vehicular»).
--
-- Una inspección por vehículo, por tipo y por día. La hace un conductor o auxiliar de transporte (la lista completa, Sí / No / No aplica) y OTRO conductor la supervisa
-- (nunca quien la hizo). Si algo no es conforme, la nota es obligatoria. NO bloquea la salida de ninguna ruta: es un registro (la descarga del mes en Word sale de aquí).
-- Quien conduce no lee tablas: solo estas funciones, que reconocen a la persona. Nada se borra ni se edita: lo único que cambia después es la supervisión (una vez). Re-ejecutable.

select wms._ampliar_check_in('wms.permisos_rol', 'permisos_rol_accion_check', 'accion', array['inspeccion_unidad']);
insert into wms.permisos_rol (rol, accion) values ('conductor', 'inspeccion_unidad'), ('auxiliar_transporte', 'inspeccion_unidad'), ('jefe_transporte', 'inspeccion_unidad'),
  ('admin_wms', 'inspeccion_unidad'), ('direccion_tecnica', 'inspeccion_unidad')
on conflict (rol, accion) do nothing;

create table if not exists wms.inspecciones_unidad (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('VEHICULO', 'LIMPIEZA')),
  vehiculo_id uuid not null references wms.vehiculos(id),
  fecha date not null,
  items jsonb not null,
  conforme boolean not null,
  observaciones text,
  realizada_por uuid not null,
  realizada_en timestamptz not null default now(),
  supervisada_por uuid,
  supervisada_en timestamptz,
  unique (tipo, vehiculo_id, fecha),
  check ((supervisada_por is null) = (supervisada_en is null)),
  check (supervisada_por is null or supervisada_por <> realizada_por),
  check (conforme or length(btrim(coalesce(observaciones, ''))) >= 5)
);
alter table wms.inspecciones_unidad enable row level security;
create index if not exists inspecciones_unidad_mes_idx on wms.inspecciones_unidad (tipo, vehiculo_id, fecha);
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'inspecciones_unidad' and policyname = 'lectura') then
    create policy lectura on wms.inspecciones_unidad for select to authenticated using (wms.es_usuario());
  end if;
end $$;
revoke all on wms.inspecciones_unidad from anon, authenticated;
grant select on wms.inspecciones_unidad to authenticated;

-- Solo se puede agregar; lo único que cambia después es la supervisión, y una sola vez.
create or replace function wms._inspeccion_inmutable() returns trigger language plpgsql set search_path = wms, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'Las inspecciones no se borran'; end if;
  if old.supervisada_por is not null then raise exception 'Esta inspección ya fue supervisada: no se cambia'; end if;
  if (new.tipo, new.vehiculo_id, new.fecha, new.items, new.conforme, new.observaciones, new.realizada_por, new.realizada_en)
     is distinct from (old.tipo, old.vehiculo_id, old.fecha, old.items, old.conforme, old.observaciones, old.realizada_por, old.realizada_en) then
    raise exception 'Una inspección registrada no se edita: solo se supervisa';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'inspecciones_unidad_inmutable' and tgrelid = 'wms.inspecciones_unidad'::regclass and not tgisinternal) then
    drop trigger inspecciones_unidad_inmutable on wms.inspecciones_unidad;
  end if;
end $$;
create trigger inspecciones_unidad_inmutable before update or delete on wms.inspecciones_unidad for each row execute function wms._inspeccion_inmutable();

-- Los puntos de cada formato (espejo de domain/inspecciones.ts).
create or replace function wms._inspeccion_claves(p_tipo text) returns text[] language sql immutable set search_path = wms, pg_temp as $$
  select case p_tipo
    when 'VEHICULO' then array[
      'cabina_cerrada', 'sin_olores', 'sin_objetos_daninos', 'cabina_limpia', 'sin_agujeros', 'conservacion_externa', 'conservacion_interna', 'embalaje_protegido',
      'kit_antiderrame', 'climatizado', 'botiquin', 'kit_seguridad', 'nivel_aceite', 'nivel_agua', 'presion_llantas', 'combustible',
      'licencia', 'tarjeta_propiedad', 'soat', 'tarjeta_circulacion', 'certificado_inspeccion', 'certificado_fumigacion', 'programa_mantenimiento', 'instructivos',
      'luces', 'herramientas_linterna', 'claxon', 'limpiaparabrisas', 'llanta_repuesto', 'cinturon', 'faros', 'llaves_candados', 'espejos', 'datalogger']
    when 'LIMPIEZA' then array['piso', 'paredes', 'techos', 'luminarias', 'llantas', 'aros', 'tapices', 'faros', 'lunas', 'puertas', 'chasis', 'derrame']
  end
$$;

create or replace function wms.vehiculos_para_inspeccion() returns jsonb
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if auth.uid() is null or not wms.tiene_permiso('inspeccion_unidad') then raise exception 'No tienes permiso para ver las inspecciones de la unidad' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'placa', v.placa, 'descripcion', v.descripcion) order by v.placa) from wms.vehiculos v where v.activo), '[]'::jsonb);
end $$;

create or replace function wms.registrar_inspeccion_unidad(p_tipo text, p_vehiculo uuid, p_fecha date, p_items jsonb, p_observaciones text default null) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_hoy date := wms._hoy_lima(); v_claves text[]; k text; v_conforme boolean := true; v_obs text := nullif(btrim(coalesce(p_observaciones, '')), '');
begin
  if auth.uid() is null or not wms.tiene_permiso('inspeccion_unidad') then raise exception 'No tienes permiso para registrar inspecciones de la unidad' using errcode = '42501'; end if;
  if p_tipo is null or p_tipo not in ('VEHICULO', 'LIMPIEZA') then raise exception 'Elige qué inspección es' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.vehiculos where id = p_vehiculo and activo) then raise exception 'Elige un vehículo disponible' using errcode = 'P0001'; end if;
  if p_fecha is null or p_fecha > v_hoy then raise exception 'La fecha de la inspección no puede ser futura' using errcode = 'P0001'; end if;
  if p_fecha < v_hoy - 3 then raise exception 'Solo se registran inspecciones de hoy y de los últimos 3 días' using errcode = 'P0001'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'object' then raise exception 'Faltan los puntos de la inspección' using errcode = 'P0001'; end if;
  v_claves := wms._inspeccion_claves(p_tipo);
  foreach k in array v_claves loop
    if coalesce(p_items->>k, '') not in ('SI', 'NO', 'NA') then raise exception 'Falta marcar un punto de la inspección (Sí, No o No aplica)' using errcode = 'P0001'; end if;
    if p_items->>k = 'NO' and not (p_tipo = 'LIMPIEZA' and k = 'derrame') then v_conforme := false; end if;
  end loop;
  if exists (select 1 from jsonb_object_keys(p_items) j where j <> all (v_claves)) then raise exception 'Hay puntos que no son de esta inspección' using errcode = 'P0001'; end if;
  if not v_conforme and (v_obs is null or length(v_obs) < 5) then raise exception 'Hay puntos no conformes: cuéntanos qué pasó (al menos 5 letras)' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.inspecciones_unidad where tipo = p_tipo and vehiculo_id = p_vehiculo and fecha = p_fecha) then raise exception 'Ya hay una inspección de este vehículo en esa fecha' using errcode = 'P0001'; end if;
  insert into wms.inspecciones_unidad (id, tipo, vehiculo_id, fecha, items, conforme, observaciones, realizada_por) values (v_id, p_tipo, p_vehiculo, p_fecha, p_items, v_conforme, v_obs, auth.uid());
  perform wms.registrar_audit('inspeccion_unidad', 'inspecciones_unidad', v_id::text, null, jsonb_build_object('tipo', p_tipo, 'fecha', p_fecha, 'conforme', v_conforme), v_obs);
  return v_id;
end $$;

create or replace function wms.supervisar_inspeccion_unidad(p_id uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare i wms.inspecciones_unidad;
begin
  if auth.uid() is null or not wms.tiene_permiso('inspeccion_unidad') then raise exception 'No tienes permiso para supervisar inspecciones' using errcode = '42501'; end if;
  select * into i from wms.inspecciones_unidad where id = p_id for update;
  if not found then raise exception 'No encontramos esa inspección' using errcode = 'P0001'; end if;
  if i.supervisada_por is not null then raise exception 'Esta inspección ya fue supervisada' using errcode = 'P0001'; end if;
  if i.realizada_por = auth.uid() then raise exception 'La supervisa otra persona, no quien la hizo' using errcode = 'P0001'; end if;
  update wms.inspecciones_unidad set supervisada_por = auth.uid(), supervisada_en = now() where id = p_id;
  perform wms.registrar_audit('inspeccion_supervisada', 'inspecciones_unidad', p_id::text, null, jsonb_build_object('tipo', i.tipo, 'fecha', i.fecha), null);
end $$;

-- Las inspecciones de un vehículo en un mes (el primer día del mes). Quien conduce las lee solo por aquí.
create or replace function wms.inspecciones_del_mes(p_tipo text, p_vehiculo uuid, p_mes date) returns jsonb
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_ini date := date_trunc('month', p_mes)::date;
begin
  if auth.uid() is null or not wms.tiene_permiso('inspeccion_unidad') then raise exception 'No tienes permiso para ver las inspecciones de la unidad' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'fecha', i.fecha, 'items', i.items, 'conforme', i.conforme, 'observaciones', i.observaciones,
            'realizada_por', i.realizada_por, 'realizada_en', i.realizada_en, 'supervisada_por', i.supervisada_por, 'supervisada_en', i.supervisada_en,
            'realizada_nombre', (select pt.nombre from wms.personal_transporte pt where pt.usuario_id = i.realizada_por limit 1),
            'supervisada_nombre', (select pt.nombre from wms.personal_transporte pt where pt.usuario_id = i.supervisada_por limit 1)) order by i.fecha)
          from wms.inspecciones_unidad i where i.tipo = p_tipo and i.vehiculo_id = p_vehiculo and i.fecha >= v_ini and i.fecha < v_ini + interval '1 month'), '[]'::jsonb);
end $$;

grant execute on function wms.vehiculos_para_inspeccion(), wms.registrar_inspeccion_unidad(text, uuid, date, jsonb, text), wms.supervisar_inspeccion_unidad(uuid),
  wms.inspecciones_del_mes(text, uuid, date) to authenticated;
revoke execute on all functions in schema wms from public;
