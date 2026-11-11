-- 0057 piloto: vehículo de contingencia. El Jefe de Transporte marca en la ficha del vehículo que es «de contingencia» (el que se usa cuando falla el habitual).
-- Una ruta que sale con ese vehículo no se confirma sin una nota que diga por qué (queda en la ruta y en la auditoría). No cambia nada para los demás vehículos. Re-ejecutable.

alter table wms.vehiculos add column if not exists contingencia boolean not null default false;
alter table wms.rutas add column if not exists motivo_contingencia text;

create or replace function wms.registrar_motivo_contingencia(p_ruta uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform wms._exigir_accion('planificar_ruta', 'No tienes permiso para planificar rutas');
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if r.estado not in ('BORRADOR', 'PLANIFICADA') then raise exception 'La ruta ya no se puede cambiar (está %)', lower(replace(r.estado, '_', ' ')) using errcode = 'P0001'; end if;
  if r.vehiculo_id is null or not exists (select 1 from wms.vehiculos where id = r.vehiculo_id and contingencia) then
    raise exception 'El vehículo de esta ruta no es de contingencia' using errcode = 'P0001';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then raise exception 'Cuéntanos por qué sale el vehículo de contingencia (al menos 5 letras)' using errcode = 'P0001'; end if;
  update wms.rutas set motivo_contingencia = v_motivo where id = p_ruta;
  perform wms.registrar_audit('ruta_contingencia', 'rutas', p_ruta::text, null, jsonb_build_object('ruta', r.numero), v_motivo);
end $$;

-- No se confirma una ruta con vehículo de contingencia sin su nota.
do $$ begin
  perform wms._parchar_funcion('confirmar_ruta',
    $q$  if r.conductor_id is null then raise exception 'Elige el conductor' using errcode = 'P0001'; end if;$q$,
    $q$  if r.conductor_id is null then raise exception 'Elige el conductor' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.vehiculos where id = r.vehiculo_id and contingencia) and nullif(btrim(coalesce(r.motivo_contingencia, '')), '') is null then
    raise exception 'Usaste el vehículo de contingencia: escribe por qué antes de confirmar la ruta' using errcode = 'P0001';
  end if;$q$);
end $$;

grant execute on function wms.registrar_motivo_contingencia(uuid, text) to authenticated;
revoke execute on all functions in schema wms from public;
