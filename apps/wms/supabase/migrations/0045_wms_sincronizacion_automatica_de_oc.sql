-- 0045 · WMS · Piloto (Fase 4, P6): sincronización automática de las órdenes de compra (A.1)
--
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0038 (`sincronizar_ocs_abiertas`).
-- `wms.sincronizar_ocs_si_toca(minutos)` la llama la aplicación al abrir «Entradas» y «Órdenes de compra del piloto»: si la última sincronización que funcionó tiene más de N minutos
-- (30 por defecto) corre `sincronizar_ocs_abiertas()`; si no, no hace nada. Candado: `pg_try_advisory_xact_lock` impide que dos personas la corran a la vez (la segunda ve «en curso»).
-- Queda en `wms.oc_sincronizacion` (una sola fila) cuándo fue la última que funcionó, el último intento y, si falló, el motivo en lenguaje llano. Cada versión nueva de una OC
-- ya queda en `audit_events` (`oc_version_creada`, 0038); aquí además se audita cada sincronización automática que creó o cambió algo. «Revisar Compras ahora» usa la misma
-- función con 0 minutos. No es un cron ni toca vercel.json: solo corre cuando alguien abre la pantalla.

create table if not exists wms.oc_sincronizacion (
  id boolean primary key default true check (id),
  ultima_en timestamptz,             -- la última sincronización que funcionó
  ultimo_intento_en timestamptz,
  ultimo_error text,                 -- en lenguaje llano; null si el último intento funcionó
  ultimo_detalle text,               -- el detalle técnico, para quien administra
  ultimo_resumen jsonb,
  ultima_por uuid
);
insert into wms.oc_sincronizacion (id) values (true) on conflict (id) do nothing;
alter table wms.oc_sincronizacion enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'oc_sincronizacion' and policyname = 'lectura') then
    create policy lectura on wms.oc_sincronizacion for select to authenticated using (wms.es_usuario());
  end if;
end $$;
revoke all on wms.oc_sincronizacion from anon, authenticated;
grant select on wms.oc_sincronizacion to authenticated;

create or replace function wms.sincronizar_ocs_si_toca(p_minutos integer default 30) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  s wms.oc_sincronizacion; r jsonb; v_msg constant text := 'No pudimos revisar Compras ahora. Ves la última copia guardada; vuelve a intentar con «Revisar Compras ahora» y, si sigue igual, avisa a quien administra el WMS.';
  v_det text;
begin
  if auth.uid() is null or not wms.tiene_permiso('ejecutar') then
    select * into s from wms.oc_sincronizacion; return jsonb_build_object('estado', 'SIN_PERMISO', 'ultima_en', s.ultima_en, 'error', s.ultimo_error);
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('wms.sincronizacion_ocs', 0)) then
    select * into s from wms.oc_sincronizacion; return jsonb_build_object('estado', 'EN_CURSO', 'ultima_en', s.ultima_en, 'error', s.ultimo_error);
  end if;
  select * into s from wms.oc_sincronizacion for update;
  if coalesce(p_minutos, 30) > 0 and s.ultima_en is not null and s.ultima_en > now() - make_interval(mins => coalesce(p_minutos, 30)) then
    return jsonb_build_object('estado', 'AL_DIA', 'ultima_en', s.ultima_en);
  end if;
  -- si el último intento falló hace poco, no se insiste en cada apertura de pantalla
  if coalesce(p_minutos, 30) > 0 and s.ultimo_error is not null and s.ultimo_intento_en > now() - interval '5 minutes' then
    return jsonb_build_object('estado', 'ERROR', 'ultima_en', s.ultima_en, 'error', s.ultimo_error, 'reciente', true);
  end if;
  begin
    if to_regclass('wms.v_oc_lineas') is null then raise exception 'Compras no está conectado a esta base' using errcode = 'P0001'; end if;
    r := wms.sincronizar_ocs_abiertas();
    update wms.oc_sincronizacion set ultima_en = now(), ultimo_intento_en = now(), ultimo_error = null, ultimo_detalle = null, ultimo_resumen = r, ultima_por = auth.uid();
    if coalesce((r->>'nuevas')::int, 0) + coalesce((r->>'cambiadas')::int, 0) + coalesce((r->>'eliminadas')::int, 0) > 0 then
      perform wms.registrar_audit('oc_sincronizacion', 'oc_sincronizacion', 'true', null, r, case when p_minutos = 0 then 'manual' else 'automatica' end);
    end if;
    return jsonb_build_object('estado', 'SINCRONIZADA', 'ultima_en', now(), 'resumen', r);
  exception when others then
    get stacked diagnostics v_det = message_text;
    update wms.oc_sincronizacion set ultimo_intento_en = now(), ultimo_error = v_msg, ultimo_detalle = left(v_det, 500);
    return jsonb_build_object('estado', 'ERROR', 'ultima_en', s.ultima_en, 'error', v_msg);
  end;
end $$;

revoke execute on all functions in schema wms from public;
grant execute on function wms.sincronizar_ocs_si_toca(integer) to authenticated;
