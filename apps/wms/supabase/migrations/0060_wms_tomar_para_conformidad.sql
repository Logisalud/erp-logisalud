-- 0060 · «Tomar para conformidad» (reunión del 10-nov, punto 3).
--
-- La conformidad la pueden dar todos los auxiliares de almacén, Sandra y los jefes, repartidos por guía: cada quien TOMA una orden y, mientras la tenga tomada, nadie más puede
-- darle la conformidad. El Jefe puede ASIGNARLA a otra persona o SOLTARLA. Regla vigente: quien picó una orden no la conforma (ni la toma). Todo queda en la auditoría.
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0023 (usa `_parchar_funcion`).

-- Todos los auxiliares de almacén y los jefes pueden dar la conformidad (Sandra ya la tenía por su rol). La regla de que quien picó no la conforma sigue en la base.
insert into wms.permisos_rol (rol, accion) values ('auxiliar', 'dar_conformidad'), ('jefe_almacen', 'dar_conformidad'), ('jefe_transporte', 'dar_conformidad')
on conflict (rol, accion) do nothing;

alter table wms.ordenes_picking add column if not exists conformidad_tomada_por uuid;
alter table wms.ordenes_picking add column if not exists conformidad_tomada_en timestamptz;
alter table wms.ordenes_picking add column if not exists conformidad_asignada_por uuid;

-- ¿Puede esta persona dar la conformidad de esta orden? (tiene el permiso y no picó). Ayudante interno.
create or replace function wms._puede_conformar(p_orden uuid, p_persona uuid) returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (select 1 from wms.usuario_roles ur join wms.permisos_rol pr on pr.rol = ur.rol where ur.user_id = p_persona and pr.accion = 'dar_conformidad')
     and not exists (select 1 from wms.ordenes_picking o where o.id = p_orden and o.picker_id = p_persona)
     and not exists (select 1 from wms.ordenes_picking_lineas ol where ol.orden_id = p_orden and ol.picker_id = p_persona)
$$;

create or replace function wms.tomar_para_conformidad(p_orden uuid) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare o wms.ordenes_picking; s wms.salidas;
begin
  perform wms._exigir_accion('dar_conformidad', 'No tienes permiso para dar la conformidad');
  select * into o from wms.ordenes_picking where id = p_orden for update;
  if not found then raise exception 'No encontramos esa Orden de Salida' using errcode = 'P0001'; end if;
  if o.estado = 'CANCELADA' then raise exception 'Esa orden está cancelada' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = o.salida_id;
  if s.estado <> 'ABIERTA' then raise exception 'La Orden de Salida ya no está abierta' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.ordenes_picking_lineas where orden_id = p_orden and conformidad = 'PENDIENTE') then raise exception 'Esta Orden de Salida ya tiene su conformidad' using errcode = 'P0001'; end if;
  if not wms._puede_conformar(p_orden, auth.uid()) then raise exception 'La conformidad la da otra persona, no quien hizo el picking' using errcode = 'P0001'; end if;
  if o.conformidad_tomada_por is not null and o.conformidad_tomada_por <> auth.uid() then
    raise exception 'Esta orden ya la tomó otra persona para la conformidad: pídele al Jefe que la reasigne' using errcode = 'P0001';
  end if;
  if o.conformidad_tomada_por is null then
    update wms.ordenes_picking set conformidad_tomada_por = auth.uid(), conformidad_tomada_en = now(), conformidad_asignada_por = null where id = p_orden;
    perform wms.registrar_audit('conformidad_tomada', 'ordenes_picking', p_orden::text, null, jsonb_build_object('orden', o.numero), null);
  end if;
  return jsonb_build_object('tomada_por', auth.uid());
end $$;

-- La suelta quien la tomó o un Jefe (quien prepara salidas): la orden vuelve a estar libre para todos.
create or replace function wms.soltar_conformidad(p_orden uuid) returns boolean
language plpgsql security definer set search_path = wms, pg_temp as $$
declare o wms.ordenes_picking;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  select * into o from wms.ordenes_picking where id = p_orden for update;
  if not found then raise exception 'No encontramos esa Orden de Salida' using errcode = 'P0001'; end if;
  if o.conformidad_tomada_por is null then return false; end if;
  if o.conformidad_tomada_por <> auth.uid() and not wms.tiene_permiso('preparar_salidas') then raise exception 'Solo quien la tomó o un Jefe puede soltarla' using errcode = '42501'; end if;
  update wms.ordenes_picking set conformidad_tomada_por = null, conformidad_tomada_en = null, conformidad_asignada_por = null where id = p_orden;
  perform wms.registrar_audit('conformidad_soltada', 'ordenes_picking', p_orden::text, jsonb_build_object('tomada_por', o.conformidad_tomada_por), null, null);
  return true;
end $$;

-- El Jefe la asigna a una persona que pueda conformarla (con el permiso y que no haya picado).
create or replace function wms.asignar_conformidad(p_orden uuid, p_persona uuid) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare o wms.ordenes_picking;
begin
  perform wms._exigir_accion('preparar_salidas', 'Solo un Jefe asigna la conformidad');
  select * into o from wms.ordenes_picking where id = p_orden for update;
  if not found then raise exception 'No encontramos esa Orden de Salida' using errcode = 'P0001'; end if;
  if o.estado = 'CANCELADA' then raise exception 'Esa orden está cancelada' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.ordenes_picking_lineas where orden_id = p_orden and conformidad = 'PENDIENTE') then raise exception 'Esta Orden de Salida ya tiene su conformidad' using errcode = 'P0001'; end if;
  if p_persona is null or not wms._puede_conformar(p_orden, p_persona) then raise exception 'Esa persona no puede dar esta conformidad (necesita el permiso y no haber hecho el picking)' using errcode = 'P0001'; end if;
  update wms.ordenes_picking set conformidad_tomada_por = p_persona, conformidad_tomada_en = now(), conformidad_asignada_por = auth.uid() where id = p_orden;
  perform wms.registrar_audit('conformidad_asignada', 'ordenes_picking', p_orden::text, jsonb_build_object('tomada_por', o.conformidad_tomada_por), jsonb_build_object('tomada_por', p_persona), null);
  return jsonb_build_object('tomada_por', p_persona);
end $$;

-- Quiénes pueden dar la conformidad (para que el Jefe elija a quién asignarla). La ve quien da o asigna la conformidad.
create or replace function wms.personal_para_conformidad() returns jsonb
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if auth.uid() is null or not (wms.tiene_permiso('dar_conformidad') or wms.tiene_permiso('preparar_salidas')) then raise exception 'No tienes permiso para ver quién da la conformidad' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(distinct ur.user_id) from wms.usuario_roles ur join wms.permisos_rol pr on pr.rol = ur.rol where pr.accion = 'dar_conformidad'), '[]'::jsonb);
end $$;

-- Mientras otra persona la tenga tomada, nadie más da la conformidad.
do $$ begin
  perform wms._parchar_funcion('conformar_orden',
    $q$  if o.picker_id = auth.uid() or exists (select 1 from wms.ordenes_picking_lineas where orden_id = p_orden and picker_id = auth.uid()) then$q$,
    $q$  if o.conformidad_tomada_por is not null and o.conformidad_tomada_por <> auth.uid() then
    raise exception 'Esta orden la tomó otra persona para la conformidad: pídele al Jefe que la reasigne' using errcode = 'P0001';
  end if;
  if o.picker_id = auth.uid() or exists (select 1 from wms.ordenes_picking_lineas where orden_id = p_orden and picker_id = auth.uid()) then$q$);
end $$;

grant execute on function wms.tomar_para_conformidad(uuid), wms.soltar_conformidad(uuid), wms.asignar_conformidad(uuid, uuid), wms.personal_para_conformidad() to authenticated;
revoke execute on all functions in schema wms from public;
