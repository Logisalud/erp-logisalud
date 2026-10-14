-- 0015 · WMS · Roles de los jefes y cargos (D-81)
--
-- Decisión de Sebas (2026-10-14):
--   · Un usuario puede tener varios roles; el CARGO se muestra aparte de los permisos.
--       Charlie (cargo: Jefe de Almacén)    → roles jefe_almacen y jefe_transporte
--       Roberto (cargo: Jefe de Transporte) → roles jefe_transporte y jefe_almacen
--       Jasury (reemplazante de Charlie)    → rol jefe_almacen, con todos sus permisos actuales y futuros
--   · El rol «reemplazo del Jefe» (reemplazo_jefe) NO EXISTE: se retira sin borrar historia. Cada persona que lo tenía vigente pasa a jefe_almacen
--     (mismos permisos) y su fila antigua queda cerrada (`hasta` = ayer): lo que firmó o hizo con ese rol sigue registrado tal cual. No se asignan más.
--   · La regla de dos personas es POR PERSONA (auth.uid()): nadie verifica ni da la conformidad de lo que él mismo hizo, aunque tenga varios roles.
-- Esta migración NO asigna roles a Charlie y Roberto (son datos de producción con personas concretas: se hacen aparte, con aprobación; ver
-- docs/wms/aplicar-migraciones.md). Re-ejecutable. Se aplica a mano. Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Cargo de cada persona (aparte de los roles)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.cargos_usuario (
  user_id uuid primary key,
  cargo text not null check (char_length(btrim(cargo)) between 2 and 80),
  actualizado_por uuid,
  actualizado_en timestamptz not null default now()
);
alter table wms.cargos_usuario enable row level security;

-- El personal ve los cargos (se muestran junto al nombre); solo se cambian por la función, que exige administración.
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'cargos_usuario' and policyname = 'lectura') then
    drop policy lectura on wms.cargos_usuario;
  end if;
end $$;
create policy lectura on wms.cargos_usuario for select to authenticated using (wms.es_usuario() or user_id = auth.uid());
grant select on wms.cargos_usuario to authenticated;

create or replace function wms.asignar_cargo(p_user uuid, p_cargo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_cargo text := btrim(coalesce(p_cargo, ''));
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_rol('admin_wms') then raise exception 'Solo administración asigna cargos' using errcode = '42501'; end if;
  if char_length(v_cargo) < 2 or char_length(v_cargo) > 80 then raise exception 'El cargo debe tener entre 2 y 80 caracteres' using errcode = 'P0001'; end if;
  insert into wms.cargos_usuario (user_id, cargo, actualizado_por) values (p_user, v_cargo, auth.uid())
  on conflict (user_id) do update set cargo = excluded.cargo, actualizado_por = excluded.actualizado_por, actualizado_en = now();
  perform wms.registrar_audit('cargo_asignado', 'cargos_usuario', p_user::text, null, jsonb_build_object('cargo', v_cargo), null);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Retirar el rol reemplazo_jefe sin borrar historia
-- ─────────────────────────────────────────────────────────────────────────────

-- Quien lo tenía vigente recibe jefe_almacen desde hoy (si no lo tenía ya vigente) y su fila antigua se cierra.
insert into wms.usuario_roles (user_id, rol, desde, creado_por)
select distinct r.user_id, 'jefe_almacen', current_date, r.creado_por
  from wms.usuario_roles r
 where r.rol = 'reemplazo_jefe' and r.desde <= current_date and (r.hasta is null or r.hasta >= current_date)
   and not exists (select 1 from wms.usuario_roles j
                    where j.user_id = r.user_id and j.rol = 'jefe_almacen' and j.desde <= current_date and (j.hasta is null or j.hasta >= current_date))
on conflict (user_id, rol, desde) do update set hasta = null;

do $$ declare v_n integer; begin
  update wms.usuario_roles set hasta = current_date - 1
   where rol = 'reemplazo_jefe' and (hasta is null or hasta >= current_date);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform wms.registrar_audit('rol_retirado', 'usuario_roles', 'reemplazo_jefe', null, jsonb_build_object('filas_cerradas', v_n), 'El rol «reemplazo del Jefe» no existe (D-81)');
  end if;
end $$;

-- El valor sigue permitido en las filas históricas, pero ya no se puede asignar (ni cambiar una fila a ese rol).
create or replace function wms.trg_sin_reemplazo_jefe()
returns trigger language plpgsql as $$
begin
  if new.rol = 'reemplazo_jefe' and (tg_op = 'INSERT' or old.rol is distinct from 'reemplazo_jefe') then
    raise exception 'El rol «reemplazo del Jefe» ya no existe: asigna Jefe de Almacén' using errcode = 'P0001';
  end if;
  if new.rol = 'reemplazo_jefe' and tg_op = 'UPDATE' and (new.hasta is null or new.hasta >= current_date) then
    raise exception 'El rol «reemplazo del Jefe» ya no existe: no se puede dejar vigente' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'sin_reemplazo_jefe' and tgrelid = 'wms.usuario_roles'::regclass and not tgisinternal) then
    drop trigger sin_reemplazo_jefe on wms.usuario_roles;
  end if;
end $$;
create trigger sin_reemplazo_jefe before insert or update on wms.usuario_roles
  for each row execute function wms.trg_sin_reemplazo_jefe();

-- Sus permisos ya no existen (jefe_almacen tiene todos los suyos); «personal» deja de nombrarlo.
delete from wms.permisos_rol where rol = 'reemplazo_jefe';

create or replace function wms.es_usuario()
returns boolean language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (
    select 1 from wms.usuario_roles r
    where r.user_id = auth.uid()
      and r.rol = any (array['direccion_tecnica', 'asistente_dt', 'jefe_almacen', 'auxiliar',
                             'auditoria_lectura', 'admin_wms', 'jefe_transporte', 'conformidad_despacho',
                             'autoriza_salidas_sin_venta'])
      and r.desde <= current_date
      and (r.hasta is null or r.hasta >= current_date))
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.asignar_cargo(uuid, text) to authenticated;
revoke execute on all functions in schema wms from public;
