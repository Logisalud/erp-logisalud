-- 0053 · WMS · Rankings mensuales de picking y conformidad + «Diferencia detectada en la carga» (decisión de Sebas, 2026-11-11; docs/wms/salidas/ranking-auxiliares.md)
--
--   1. `wms.diferencias_carga`: el transportista (o quien carga) anota que un pedido tenía una diferencia cuando lo cargó. Con motivo; no se borra: el Jefe de Transporte la puede DESCARTAR con motivo.
--      Quien la anota NO puede ser quien picó ni quien dio la conformidad de ese pedido (el tercer filtro es independiente).
--   2. `wms.registrar_diferencia_carga(salida, motivo)` y `wms.descartar_diferencia_carga(id, motivo)`.
--   3. `wms.pedidos_del_mes(mes)`: una fila por pedido conformado en el mes, con lo que el ranking necesita (quién picó, quién conformó, productos, bultos, si va a provincia, si tuvo errores de
--      picking o un error posterior a la conformidad). Los puntos y el ranking se calculan en la aplicación (domain/ranking.ts): aquí solo están los hechos.
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). No toca Compras, Pedidos ni Cobranzas.

create table if not exists wms.diferencias_carga (
  id uuid primary key default gen_random_uuid(),
  salida_id uuid not null references wms.salidas(id),
  motivo text not null check (length(btrim(motivo)) > 0),
  detectada_por uuid not null,
  detectada_en timestamptz not null default now(),
  estado text not null default 'VIGENTE' check (estado in ('VIGENTE', 'DESCARTADA')),
  descartada_por uuid,
  descartada_en timestamptz,
  motivo_descarte text
);
alter table wms.diferencias_carga enable row level security;
create index if not exists diferencias_carga_salida_idx on wms.diferencias_carga (salida_id);
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'diferencias_carga' and policyname = 'lectura') then drop policy lectura on wms.diferencias_carga; end if;
  create policy lectura on wms.diferencias_carga for select to authenticated using (wms.es_usuario());
  revoke all on wms.diferencias_carga from anon, authenticated;
  grant select on wms.diferencias_carga to authenticated;
end $$;

create or replace function wms.registrar_diferencia_carga(p_salida uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform wms._exigir_accion('cargar_ruta', 'No tienes permiso para cargar la unidad');
  if v_motivo is null then raise exception 'Escribe qué diferencia encontraste' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.salidas where id = p_salida) then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.ordenes_picking where salida_id = p_salida and estado <> 'CANCELADA' and picker_id = auth.uid())
     or exists (select 1 from wms.salidas where id = p_salida and conformada_por = auth.uid()) then
    raise exception 'La diferencia de la carga la registra otra persona: no quien picó ni quien dio la conformidad de este pedido' using errcode = 'P0001';
  end if;
  insert into wms.diferencias_carga (salida_id, motivo, detectada_por) values (p_salida, v_motivo, auth.uid()) returning id into v_id;
  perform wms.registrar_audit('diferencia_carga_registrada', 'diferencias_carga', v_id::text, null, jsonb_build_object('salida_id', p_salida), v_motivo);
  return v_id;
end $$;

create or replace function wms.descartar_diferencia_carga(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform wms._exigir_accion('liberar_unidad', 'Solo el Jefe de Transporte descarta una diferencia de la carga');
  if v_motivo is null then raise exception 'Escribe por qué se descarta' using errcode = 'P0001'; end if;
  update wms.diferencias_carga set estado = 'DESCARTADA', descartada_por = auth.uid(), descartada_en = now(), motivo_descarte = v_motivo where id = p_id and estado = 'VIGENTE';
  if not found then raise exception 'No encontramos esa diferencia, o ya estaba descartada' using errcode = 'P0001'; end if;
  perform wms.registrar_audit('diferencia_carga_descartada', 'diferencias_carga', p_id::text, null, null, v_motivo);
end $$;

-- Los hechos del ranking: una fila por pedido conformado en el mes (hora de Lima). Quien no es personal del WMS no la llama.
create or replace function wms.pedidos_del_mes(p_mes date default null)
returns table (salida_id uuid, salida_numero text, picker_id uuid, conformador_id uuid, productos integer, bultos integer, provincia boolean, error_picking boolean, error_posterior boolean, picker_es_jefe boolean, conformador_es_jefe boolean)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_ini timestamptz; v_fin timestamptz; v_jefes text[] := array['jefe_almacen', 'reemplazo_jefe', 'jefe_transporte', 'direccion_tecnica', 'admin_wms'];
begin
  if auth.uid() is null or not wms.es_usuario() then raise exception 'No tienes permiso para ver el ranking' using errcode = '42501'; end if;
  v_ini := (date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Lima')::date)::date)::timestamp) at time zone 'America/Lima';
  v_fin := ((date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Lima')::date)::date) + interval '1 month')::timestamp) at time zone 'America/Lima';
  return query
  select s.id, s.numero::text, op.picker_id, s.conformada_por,
         coalesce((select count(distinct sl.producto_id) from wms.salida_lineas sl where sl.salida_id = s.id and sl.estado <> 'CANCELADA'), 0)::integer,
         coalesce(s.bultos_conformidad, 1),
         coalesce(s.requiere_embalaje, false),
         exists (select 1 from wms.ajustes_conformidad a where a.orden_id = op.id),
         exists (select 1 from wms.diferencias_carga d where d.salida_id = s.id and d.estado = 'VIGENTE'),
         exists (select 1 from wms.usuario_roles r where r.user_id = op.picker_id and r.rol = any (v_jefes) and r.desde <= current_date and (r.hasta is null or r.hasta >= current_date)),
         exists (select 1 from wms.usuario_roles r where r.user_id = s.conformada_por and r.rol = any (v_jefes) and r.desde <= current_date and (r.hasta is null or r.hasta >= current_date))
    from wms.salidas s
    join wms.ordenes_picking op on op.salida_id = s.id and op.estado <> 'CANCELADA'
   where s.estado <> 'CANCELADA' and s.conformada_en >= v_ini and s.conformada_en < v_fin
   order by s.conformada_en, s.id;
end $$;

grant execute on function wms.registrar_diferencia_carga(uuid, text), wms.descartar_diferencia_carga(uuid, text), wms.pedidos_del_mes(date) to authenticated;
revoke execute on all functions in schema wms from public;
