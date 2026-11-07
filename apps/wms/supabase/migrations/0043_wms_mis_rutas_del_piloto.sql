-- 0043 · WMS · Piloto (Fase 4, P4): «Mis rutas» para el conductor y el auxiliar de transporte (S9 y S10), en el celular
--
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0017, 0021, 0027, 0030, 0038 y 0042 (usa su ayudante ) (NO requiere la 0008).
--
--   1. Permiso `mis_rutas` (conductor y auxiliar de transporte; el Jefe de Transporte supervisa desde Rutas). Estos roles NO leen el inventario (no son `es_usuario`): solo
--      llegan a lo suyo por dos funciones que reconocen a la persona por `personal_transporte.usuario_id`.
--   2. `ruta_paradas_eventos` (solo se agregan filas): por parada, «llegué», «entregado» (con quién recibió —nombre y DNI— y la FOTO: referencia + hash del archivo en el bucket
--      privado), «no entregado», «rechazado» e «incidencia» (con motivo). Alimenta el LS-FR.43.03 (hora de entrega y observaciones) y el cierre de ruta que ya existen.
--   3. `mis_rutas_del_dia(fecha)` y `registrar_evento_parada(parada, evento, datos)`. Rechazado y No entregado NO inventan un flujo: avisan al Jefe de Transporte (alerta
--      `RETORNO_POR_ORIGINAR`) para que origine el retorno con el flujo que ya existe (Orden de Salida → Devoluciones). Cuando todas las paradas de una ruta tienen su resultado,
--      la ruta pasa a «Pendiente de cierre» y el Jefe de Transporte la cierra como siempre.

select wms._ampliar_check_in('wms.permisos_rol', 'permisos_rol_accion_check', 'accion', array['mis_rutas']);
select wms._ampliar_check_in('wms.alertas', 'alertas_tipo_check', 'tipo', array['RETORNO_POR_ORIGINAR']);

insert into wms.permisos_rol (rol, accion) values ('conductor', 'mis_rutas'), ('auxiliar_transporte', 'mis_rutas')
on conflict (rol, accion) do nothing;

create table if not exists wms.ruta_paradas_eventos (
  id uuid primary key default gen_random_uuid(),
  parada_id uuid not null references wms.ruta_paradas(id),
  ruta_id uuid not null references wms.rutas(id),
  evento text not null check (evento in ('LLEGUE', 'ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO', 'INCIDENCIA')),
  motivo text,
  recibio_nombre text,
  recibio_documento text,
  foto_ref text,
  foto_nombre text,
  foto_hash text check (foto_hash is null or foto_hash ~ '^[0-9a-f]{64}$'),
  foto_bytes integer check (foto_bytes is null or foto_bytes > 0),
  foto_tipo text,
  hora timestamptz not null default now(),
  por uuid not null,
  creado_en timestamptz not null default now(),
  check (evento <> 'ENTREGADO' or (nullif(btrim(coalesce(recibio_nombre, '')), '') is not null and recibio_documento ~ '^[0-9]{8}$' and foto_ref is not null and foto_hash is not null)),
  check (evento not in ('NO_ENTREGADO', 'RECHAZADO', 'INCIDENCIA') or nullif(btrim(coalesce(motivo, '')), '') is not null)
);
alter table wms.ruta_paradas_eventos enable row level security;
create index if not exists ruta_paradas_eventos_parada_idx on wms.ruta_paradas_eventos (parada_id, creado_en);
create index if not exists ruta_paradas_eventos_ruta_idx on wms.ruta_paradas_eventos (ruta_id);
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'ruta_paradas_eventos' and policyname = 'lectura') then
    create policy lectura on wms.ruta_paradas_eventos for select to authenticated using (wms.es_usuario());
  end if;
end $$;
grant select on wms.ruta_paradas_eventos to authenticated;
drop trigger if exists ruta_paradas_eventos_solo_agregar on wms.ruta_paradas_eventos;
create trigger ruta_paradas_eventos_solo_agregar before update or delete on wms.ruta_paradas_eventos for each row execute function wms._solo_agregar();

-- ¿Es esta persona (conductor o auxiliar) de esta ruta?
create or replace function wms._es_de_la_ruta(p_ruta uuid) returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (
    select 1 from wms.rutas r
    left join wms.personal_transporte c on c.id = r.conductor_id
    left join wms.personal_transporte a on a.id = r.auxiliar_id
    where r.id = p_ruta and (c.usuario_id = auth.uid() or a.usuario_id = auth.uid()))
$$;

create or replace function wms.mis_rutas_del_dia(p_fecha date default null) returns jsonb
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Lima')::date);
begin
  if auth.uid() is null or not wms.tiene_permiso('mis_rutas') then raise exception 'No tienes permiso para ver Mis rutas' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'numero', r.numero, 'fecha', r.fecha, 'estado', r.estado, 'vehiculo', v.placa, 'conductor', c.nombre, 'auxiliar', a.nombre,
      'paradas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'secuencia', p.secuencia,
          'pedido_numero', coalesce(pd.numero, sa.cliente_manual->>'pedido_numero'), 'orden_numero', sa.numero,
          'cliente', coalesce(pd.cliente_nombre, sa.cliente_manual->>'razon_social', 'Cliente'),
          'direccion', coalesce(pd.snapshot->'cliente'->>'direccion', sa.cliente_manual->>'direccion'),
          'distrito', pd.snapshot->'cliente'->>'distrito', 'ventana', pd.snapshot->'cliente'->>'ventanaCita',
          'unidades', coalesce((select sum((l->>'cantidad')::int) from jsonb_array_elements(coalesce(pd.snapshot->'lineas', '[]'::jsonb)) l), 0),
          'eventos', coalesce((
            select jsonb_agg(jsonb_build_object('id', e.id, 'evento', e.evento, 'motivo', e.motivo, 'recibio_nombre', e.recibio_nombre, 'recibio_documento', e.recibio_documento,
                                                'foto_nombre', e.foto_nombre, 'hora', e.hora) order by e.creado_en)
            from wms.ruta_paradas_eventos e where e.parada_id = p.id), '[]'::jsonb)
        ) order by p.secuencia)
        from wms.ruta_paradas p
        left join wms.pedidos_despacho pd on pd.id = p.pedido_despacho_id
        left join wms.salidas sa on sa.id = p.salida_id
        where p.ruta_id = r.id and p.activa), '[]'::jsonb)
    ) order by r.numero)
    from wms.rutas r
    left join wms.vehiculos v on v.id = r.vehiculo_id
    left join wms.personal_transporte c on c.id = r.conductor_id
    left join wms.personal_transporte a on a.id = r.auxiliar_id
    where r.fecha = v_fecha and r.estado in ('LIBERADA', 'EN_RUTA', 'PENDIENTE_CIERRE', 'CERRADA')
      and (c.usuario_id = auth.uid() or a.usuario_id = auth.uid())), '[]'::jsonb);
end $$;

create or replace function wms.registrar_evento_parada(p_parada uuid, p_evento text, p_datos jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  p wms.ruta_paradas; r wms.rutas; v_id uuid := gen_random_uuid(); v_ev text := upper(btrim(coalesce(p_evento, '')));
  v_motivo text := nullif(btrim(coalesce(p_datos->>'motivo', '')), ''); v_nombre text := nullif(btrim(coalesce(p_datos->>'recibio_nombre', '')), '');
  v_doc text := nullif(btrim(coalesce(p_datos->>'recibio_documento', '')), ''); v_terminal boolean; v_llego boolean; v_cliente text; v_pendientes integer;
begin
  if auth.uid() is null or not wms.tiene_permiso('mis_rutas') then raise exception 'No tienes permiso para registrar entregas' using errcode = '42501'; end if;
  select * into p from wms.ruta_paradas where id = p_parada;
  if not found or not p.activa then raise exception 'No encontramos esa parada' using errcode = 'P0001'; end if;
  select * into r from wms.rutas where id = p.ruta_id for update;
  if not wms._es_de_la_ruta(r.id) then raise exception 'Esa parada no es de una ruta tuya' using errcode = '42501'; end if;
  if v_ev not in ('LLEGUE', 'ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO', 'INCIDENCIA') then raise exception 'Evento no válido' using errcode = 'P0001'; end if;
  if r.estado not in ('EN_RUTA', 'PENDIENTE_CIERRE') then raise exception 'La ruta todavía no salió: las entregas se registran cuando está en ruta' using errcode = 'P0001'; end if;
  select exists (select 1 from wms.ruta_paradas_eventos where parada_id = p.id and evento in ('ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO')),
         exists (select 1 from wms.ruta_paradas_eventos where parada_id = p.id and evento = 'LLEGUE')
    into v_terminal, v_llego;
  if v_ev <> 'INCIDENCIA' and v_terminal then raise exception 'Esta parada ya tiene su resultado: no se cambia (si hubo un error, avisa al Jefe de Transporte)' using errcode = 'P0001'; end if;
  if v_ev = 'LLEGUE' and v_llego then raise exception 'Ya marcaste que llegaste a esta parada' using errcode = 'P0001'; end if;
  if v_ev in ('ENTREGADO', 'RECHAZADO') and not v_llego then raise exception 'Primero marca «Llegué» en esta parada' using errcode = 'P0001'; end if;
  if v_ev = 'ENTREGADO' then
    if v_nombre is null or length(v_nombre) < 3 then raise exception 'Escribe el nombre de quien recibió' using errcode = 'P0001'; end if;
    if v_doc is null or v_doc !~ '^[0-9]{8}$' then raise exception 'El DNI de quien recibió tiene 8 números' using errcode = 'P0001'; end if;
    if nullif(p_datos->>'foto_ref', '') is null or nullif(p_datos->>'foto_hash', '') is null then raise exception 'Falta la foto de la entrega' using errcode = 'P0001'; end if;
  elsif v_ev in ('NO_ENTREGADO', 'RECHAZADO', 'INCIDENCIA') and (v_motivo is null or length(v_motivo) < 5) then
    raise exception 'Cuéntanos el motivo (al menos 5 letras)' using errcode = 'P0001';
  end if;
  insert into wms.ruta_paradas_eventos (id, parada_id, ruta_id, evento, motivo, recibio_nombre, recibio_documento, foto_ref, foto_nombre, foto_hash, foto_bytes, foto_tipo, por)
  values (v_id, p.id, r.id, v_ev, v_motivo, case when v_ev = 'ENTREGADO' then v_nombre end, case when v_ev = 'ENTREGADO' then v_doc end,
          case when v_ev = 'ENTREGADO' then p_datos->>'foto_ref' end, case when v_ev = 'ENTREGADO' then p_datos->>'foto_nombre' end,
          case when v_ev = 'ENTREGADO' then p_datos->>'foto_hash' end, case when v_ev = 'ENTREGADO' then nullif(p_datos->>'foto_bytes', '')::integer end,
          case when v_ev = 'ENTREGADO' then p_datos->>'foto_tipo' end, auth.uid());
  if v_ev in ('NO_ENTREGADO', 'RECHAZADO') then
    select coalesce(pd.cliente_nombre, sa.cliente_manual->>'razon_social', 'el cliente') into v_cliente
      from wms.ruta_paradas pp left join wms.pedidos_despacho pd on pd.id = pp.pedido_despacho_id left join wms.salidas sa on sa.id = pp.salida_id where pp.id = p.id;
    perform wms._alertar('RETORNO_POR_ORIGINAR', 'jefe_transporte', null, null, 'retorno-parada:' || p.id,
      format('%s en la ruta %s (%s): %s. Origina el retorno desde su Orden de Salida (Devoluciones).', case v_ev when 'RECHAZADO' then 'Rechazado' else 'No entregado' end, r.numero, v_cliente, v_motivo));
  end if;
  -- todas las paradas con resultado: la ruta queda pendiente de cierre (el Jefe de Transporte la cierra como siempre)
  if v_ev in ('ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO') and r.estado = 'EN_RUTA' then
    select count(*) into v_pendientes from wms.ruta_paradas pp where pp.ruta_id = r.id and pp.activa
      and not exists (select 1 from wms.ruta_paradas_eventos e where e.parada_id = pp.id and e.evento in ('ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO'));
    if v_pendientes = 0 then update wms.rutas set estado = 'PENDIENTE_CIERRE' where id = r.id; end if;
  end if;
  perform wms.registrar_audit('parada_evento', 'ruta_paradas', p.id::text, null, jsonb_build_object('evento', v_ev, 'ruta', r.numero), v_motivo);
  return v_id;
end $$;

-- Default-deny
revoke execute on all functions in schema wms from public;
grant execute on function wms.mis_rutas_del_dia(date), wms.registrar_evento_parada(uuid, text, jsonb) to authenticated;
