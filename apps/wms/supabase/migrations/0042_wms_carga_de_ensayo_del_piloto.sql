-- 0042 · WMS · Piloto (Fase 4, P3): carga de ENSAYO del stock, con informe de validación obligatorio
--
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0007, 0027 y 0038 (NO requiere la 0008).
--
--   1. `cargas_iniciales.piloto`: toda carga que nace con `modo_piloto = si` queda marcada «piloto» (la marca la pone un trigger; nadie la elige ni la quita). La pantalla de la carga
--      y el Kardex la muestran, y el reinicio del 1 de diciembre la lista entre lo que borra.
--   2. El informe de validación es OBLIGATORIO antes de cargar: `registrar_informe_carga(lineas, veredicto)` deja constancia (en `cargas_informes`, solo se agregan filas) de que ESTE
--      archivo, con estas mismas líneas, se revisó y quedó LISTO; `crear_carga_ensayo(lineas, nota)` solo crea la carga si existe ese informe de la misma persona en las últimas 24 horas.
--      La huella la calcula la base de datos (md5 del jsonb normalizado), no la aplicación. `crear_carga_inicial` deja de ser llamable por `authenticated` (solo la usa `crear_carga_ensayo`).
--   El flujo es el mismo de la carga definitiva (validar → informe → guardar como borrador → confirmación de Dirección Técnica).

alter table wms.cargas_iniciales add column if not exists piloto boolean not null default false;

create or replace function wms._carga_marca_piloto() returns trigger language plpgsql set search_path = wms, pg_temp as $$
begin
  new.piloto := coalesce(wms._modo_piloto(), true);
  return new;
end $$;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'cargas_iniciales_marca_piloto' and tgrelid = 'wms.cargas_iniciales'::regclass and not tgisinternal) then drop trigger cargas_iniciales_marca_piloto on wms.cargas_iniciales; end if; end $$;
create trigger cargas_iniciales_marca_piloto before insert on wms.cargas_iniciales for each row execute function wms._carga_marca_piloto();

-- La marca no se cambia después
create or replace function wms._carga_piloto_inmutable() returns trigger language plpgsql set search_path = wms, pg_temp as $$
begin
  if new.piloto is distinct from old.piloto then raise exception 'La marca «piloto» de una carga no se cambia' using errcode = 'P0001'; end if;
  return new;
end $$;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'cargas_iniciales_piloto_inmutable' and tgrelid = 'wms.cargas_iniciales'::regclass and not tgisinternal) then drop trigger cargas_iniciales_piloto_inmutable on wms.cargas_iniciales; end if; end $$;
create trigger cargas_iniciales_piloto_inmutable before update on wms.cargas_iniciales for each row execute function wms._carga_piloto_inmutable();

-- Constancia de los informes de validación (solo se agregan filas)
create table if not exists wms.cargas_informes (
  id uuid primary key default gen_random_uuid(),
  huella text not null,
  veredicto text not null check (veredicto in ('LISTA', 'NO_LISTA')),
  filas integer not null check (filas >= 0),
  por uuid not null,
  en timestamptz not null default now()
);
alter table wms.cargas_informes enable row level security;
create index if not exists cargas_informes_huella_idx on wms.cargas_informes (huella, por, en);
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'cargas_informes' and policyname = 'lectura') then
    create policy lectura on wms.cargas_informes for select to authenticated using (wms.es_usuario());
  end if;
end $$;
grant select on wms.cargas_informes to authenticated;

create or replace function wms._solo_agregar() returns trigger language plpgsql set search_path = wms, pg_temp as $$
begin raise exception 'Esta tabla solo admite agregar filas' using errcode = 'P0001'; end $$;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'cargas_informes_solo_agregar' and tgrelid = 'wms.cargas_informes'::regclass and not tgisinternal) then drop trigger cargas_informes_solo_agregar on wms.cargas_informes; end if; end $$;
create trigger cargas_informes_solo_agregar before update or delete on wms.cargas_informes for each row execute function wms._solo_agregar();

create or replace function wms._huella_carga(p_lineas jsonb) returns text language sql immutable set search_path = pg_catalog as $$
  select md5(coalesce(p_lineas, '[]'::jsonb)::text)
$$;

create or replace function wms.registrar_informe_carga(p_lineas jsonb, p_veredicto text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_ver text := upper(btrim(coalesce(p_veredicto, '')));
begin
  if auth.uid() is null or not (wms.tiene_permiso('configurar') or wms.tiene_rol('direccion_tecnica')) then raise exception 'No tienes permiso para la carga inicial' using errcode = '42501'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then raise exception 'El archivo no tiene filas' using errcode = 'P0001'; end if;
  if v_ver not in ('LISTA', 'NO_LISTA') then raise exception 'El veredicto del informe es LISTA o NO_LISTA' using errcode = 'P0001'; end if;
  -- el veredicto «LISTA» solo se asienta si la validación de siempre no encuentra errores (la base manda)
  if v_ver = 'LISTA' and (jsonb_array_length(p_lineas) = 0 or exists (select 1 from wms.validar_carga_inicial(p_lineas))) then v_ver := 'NO_LISTA'; end if;
  insert into wms.cargas_informes (id, huella, veredicto, filas, por) values (v_id, wms._huella_carga(p_lineas), v_ver, jsonb_array_length(p_lineas), auth.uid());
  return v_id;
end $$;

create or replace function wms.crear_carga_ensayo(p_lineas jsonb, p_nota text default null) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if auth.uid() is null or not (wms.tiene_permiso('configurar') or wms.tiene_rol('direccion_tecnica')) then raise exception 'No tienes permiso para la carga inicial' using errcode = '42501'; end if;
  if not exists (select 1 from wms.cargas_informes i where i.huella = wms._huella_carga(p_lineas) and i.por = auth.uid() and i.veredicto = 'LISTA' and i.en > now() - interval '24 hours') then
    raise exception 'Primero arma el informe de la carga y que salga «Lista para cargar»: sin informe de este mismo archivo no se carga' using errcode = 'P0001';
  end if;
  return wms.crear_carga_inicial(p_lineas, p_nota);
end $$;

-- Default-deny: la aplicación llama a crear_carga_ensayo; crear_carga_inicial queda solo para ella.
revoke execute on all functions in schema wms from public;
revoke execute on function wms.crear_carga_inicial(jsonb, text) from authenticated;
grant execute on function wms.registrar_informe_carga(jsonb, text), wms.crear_carga_ensayo(jsonb, text) to authenticated;
