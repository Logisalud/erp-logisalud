-- 0018 · WMS · Salidas · S5: picking y conformidad (lo que faltaba sobre el núcleo de la 0012)
--
-- El picking, la conformidad y el movimiento rack → staging ya existen desde la 0012 (`generar_orden_picking`, `registrar_picking`, `dar_conformidad`). Esta migración agrega:
--   · Discrepancia de picking ≠ «no hay stock»: el picker no encuentra el lote (o no alcanzan las unidades) y la línea queda bloqueada hasta que se resuelve.
--     `resolver_discrepancia_picking` aplica el reemplazo que propone `proponer_reemplazo` (el MISMO lote en otra ubicación o el siguiente FEFO válido), rehace la reserva
--     y la línea de la orden de picking, deja el historial en `discrepancias_picking` y, si el lote cambió respecto de FEFO, lo registra en «Cambios a FEFO».
--   · Catálogo de no conformidades de la conformidad (cantidad, producto, lote, vencimiento, daño, documento, otro): `dar_conformidad` ahora lo recibe al observar.
--   · Zona «Observado»: una línea observada se corrige con `reabrir_observada` (vuelve a picking y a conformidad, por otra persona); la observación queda en `observaciones_conformidad`.
-- Re-ejecutable. Se aplica a mano, después de la 0017. Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tablas y columnas
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.ordenes_picking_lineas add column if not exists no_conformidad text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ordenes_picking_lineas_no_conformidad_check' and conrelid = 'wms.ordenes_picking_lineas'::regclass) then
    alter table wms.ordenes_picking_lineas add constraint ordenes_picking_lineas_no_conformidad_check
      check (no_conformidad is null or no_conformidad in ('CANTIDAD', 'PRODUCTO', 'LOTE', 'VENCIMIENTO', 'DANO', 'DOCUMENTO', 'OTRO'));
  end if;
end $$;

-- Historia de cada discrepancia resuelta (la línea de la orden se rehace; esto conserva lo que pasó).
create table if not exists wms.discrepancias_picking (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references wms.ordenes_picking(id),
  linea_id uuid not null references wms.salida_lineas(id),
  lote_id uuid not null references wms.lotes(id),             -- el lote que el picker no encontró
  posicion_id uuid not null references wms.posiciones(id),
  cantidad integer not null check (cantidad > 0),
  nota text not null,
  picker_id uuid,
  reportada_en timestamptz,
  nuevo_lote_id uuid references wms.lotes(id),                -- con qué se resolvió
  nueva_posicion_id uuid references wms.posiciones(id),
  resuelta_por uuid not null,
  resuelta_en timestamptz not null default now()
);
alter table wms.discrepancias_picking enable row level security;

-- Cada observación de la conformidad (la línea se corrige y vuelve a empezar; la observación se conserva).
create table if not exists wms.observaciones_conformidad (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references wms.ordenes_picking(id),
  linea_id uuid not null references wms.salida_lineas(id),
  orden_linea_id uuid not null,
  tipo text,
  nota text not null,
  observada_por uuid not null,
  observada_en timestamptz,
  corregida_por uuid not null,
  corregida_en timestamptz not null default now(),
  nota_correccion text
);
alter table wms.observaciones_conformidad enable row level security;

do $$ declare t text; begin
  foreach t in array array['discrepancias_picking', 'observaciones_conformidad'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then execute format('drop policy lectura on wms.%I', t); end if;
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
    execute format('grant select on wms.%I to authenticated', t);
    if exists (select 1 from pg_trigger where tgname = t || '_inmutable' and tgrelid = ('wms.' || t)::regclass and not tgisinternal) then execute format('drop trigger %I on wms.%I', t || '_inmutable', t); end if;
    execute format('create trigger %I before update or delete on wms.%I for each row execute function wms.trg_inmutable()', t || '_inmutable', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Conformidad con el tipo de no conformidad (reemplaza la firma de la 0012)
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if to_regprocedure('wms.dar_conformidad(uuid, text, text, uuid)') is not null then drop function wms.dar_conformidad(uuid, text, text, uuid); end if;
end $$;
create or replace function wms.dar_conformidad(p_orden_linea uuid, p_resultado text, p_nota text default null, p_staging uuid default null, p_tipo text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  ol wms.ordenes_picking_lineas; r wms.reservas; o wms.ordenes_picking; v_stg uuid; v_paso uuid; v_mov uuid; v_origen text; v_pend integer;
begin
  perform wms._exigir_accion('dar_conformidad', 'No tienes permiso para dar la conformidad');
  select * into ol from wms.ordenes_picking_lineas where id = p_orden_linea for update;
  if not found then raise exception 'No encontramos esa línea de picking' using errcode = 'P0001'; end if;
  if ol.picking <> 'PICKEADA' then raise exception 'Esa línea todavía no se pickeó' using errcode = 'P0001'; end if;
  if ol.conformidad <> 'PENDIENTE' then raise exception 'Esa línea ya tiene su conformidad' using errcode = 'P0001'; end if;
  if ol.picker_id = auth.uid() then raise exception 'La conformidad la da otra persona, no quien hizo el picking' using errcode = 'P0001'; end if;
  select * into o from wms.ordenes_picking where id = ol.orden_id;

  if p_resultado = 'OBSERVADA' then
    if nullif(trim(p_nota), '') is null then raise exception 'Cuéntanos qué observas (producto, lote, cantidad, estado del embalaje…)' using errcode = 'P0001'; end if;
    if p_tipo is not null and p_tipo not in ('CANTIDAD', 'PRODUCTO', 'LOTE', 'VENCIMIENTO', 'DANO', 'DOCUMENTO', 'OTRO') then
      raise exception 'Ese tipo de no conformidad no existe' using errcode = 'P0001';
    end if;
    update wms.ordenes_picking_lineas set conformidad = 'OBSERVADA', verificador_id = auth.uid(), verificada_en = now(), nota_conformidad = trim(p_nota), no_conformidad = p_tipo where id = p_orden_linea;
    update wms.salida_lineas set estado = 'OBSERVADA' where id = ol.linea_id;
    perform wms.registrar_audit('conformidad_observada', 'ordenes_picking_lineas', p_orden_linea::text, null, jsonb_build_object('tipo', p_tipo), p_nota);
    return null;
  elsif p_resultado is distinct from 'CONFORME' then
    raise exception 'La conformidad es CONFORME u OBSERVADA' using errcode = 'P0001';
  end if;

  v_stg := wms._posicion_de_zona('PENDIENTE_CONFORMIDAD', p_staging);
  select * into r from wms.reservas where id = ol.reserva_id for update;
  if r.estado <> 'EN_TRANSITO' then raise exception 'Esas unidades no están en tránsito a conformidad' using errcode = 'P0001'; end if;
  select origen into v_origen from wms.partidas where procedencia_id = r.procedencia_id and lote_id = r.lote_id order by id limit 1;

  insert into wms.salida_movimientos (salida_id, linea_id, orden_linea_id, tipo, cantidad, actor_id, preparador_id)
  values (o.salida_id, ol.linea_id, ol.id, 'STAGING', ol.cantidad, auth.uid(), ol.picker_id) returning id into v_paso;
  perform set_config('wms.salida_ctx', jsonb_build_object('paso', v_paso)::text, true);
  v_mov := wms.postear_movimiento('MOVIMIENTO', 'Conformidad de picking ' || o.numero,
    jsonb_build_array(
      jsonb_build_object('posicion_id', r.posicion_origen_id, 'producto_id', r.producto_id, 'lote_id', r.lote_id, 'propietario_id', r.propietario_id,
                         'estado', r.estado_stock, 'origen', v_origen, 'procedencia_id', r.procedencia_id, 'delta', -r.cantidad),
      jsonb_build_object('posicion_id', v_stg, 'producto_id', r.producto_id, 'lote_id', r.lote_id, 'propietario_id', r.propietario_id,
                         'estado', r.estado_stock, 'origen', v_origen, 'procedencia_id', r.procedencia_id, 'delta', r.cantidad)),
    'salida_linea', ol.linea_id::text);
  perform set_config('wms.salida_ctx', '', true);
  update wms.salida_movimientos set movimiento_id = v_mov where id = v_paso;
  update wms.reservas set estado = 'EN_STAGING', posicion_id = v_stg, actualizada_en = now() where id = r.id;
  update wms.ordenes_picking_lineas set conformidad = 'CONFORME', verificador_id = auth.uid(), verificada_en = now(), nota_conformidad = nullif(trim(p_nota), ''), no_conformidad = null where id = p_orden_linea;
  select count(*) into v_pend from wms.ordenes_picking_lineas where linea_id = ol.linea_id and conformidad <> 'CONFORME';
  if v_pend = 0 then update wms.salida_lineas set estado = 'CONFORME' where id = ol.linea_id; end if;
  perform wms.registrar_audit('conformidad_dada', 'ordenes_picking_lineas', p_orden_linea::text, null, jsonb_build_object('movimiento', v_mov), p_nota);
  return v_mov;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Discrepancia de picking: reemplazo
-- ─────────────────────────────────────────────────────────────────────────────

-- El picker no encontró el lote (línea en DISCREPANCIA). Se resuelve con el reemplazo que propone `proponer_reemplazo`: el MISMO lote en otra ubicación
-- (p_lote = el lote original y p_posicion = la ubicación) o OTRO lote válido (p_lote). Quien puede cambiar lotes (D-79) lo aplica.
create or replace function wms.resolver_discrepancia_picking(p_orden_linea uuid, p_lote uuid, p_posicion uuid default null, p_nota text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare
  ol wms.ordenes_picking_lineas; l wms.salida_lineas; s wms.salidas; o wms.ordenes_picking; lt wms.lotes; v_hoy date := wms._hoy_lima(); v_min integer; v_apto record;
  v_ant jsonb; v_nueva jsonb; v_cand record; v_distinto boolean; v_nueva_pos uuid; v_reservas uuid[];
begin
  perform wms._exigir_accion('cambiar_lote_asignado', 'No tienes permiso para cambiar el lote asignado');
  select * into ol from wms.ordenes_picking_lineas where id = p_orden_linea for update;
  if not found then raise exception 'No encontramos esa línea de picking' using errcode = 'P0001'; end if;
  if ol.picking <> 'DISCREPANCIA' then raise exception 'Esa línea no tiene una discrepancia por resolver' using errcode = 'P0001'; end if;
  select * into o from wms.ordenes_picking where id = ol.orden_id;
  select * into l from wms.salida_lineas where id = ol.linea_id for update;
  select * into s from wms.salidas where id = l.salida_id;
  if s.tipo = 'CLIENTE' then raise exception 'En una salida de cliente el lote lo indica el cliente: no hay reemplazo' using errcode = 'P0001'; end if;
  if p_lote is null then raise exception 'Elige el lote de reemplazo' using errcode = 'P0001'; end if;
  perform wms._candado_stock(l.producto_id, s.propietario_id);
  v_min := case when s.tipo = 'DISTRIBUCION' then coalesce((select p.valor::integer from wms.parametros p where p.clave = 'vida_util_minima_venta_dias'), 60) else 0 end;
  select * into lt from wms.lotes where id = p_lote;
  if not found or lt.producto_id <> l.producto_id or lt.propietario_id <> s.propietario_id then raise exception 'Ese lote no corresponde al producto de la línea' using errcode = 'P0001'; end if;
  select * into v_apto from wms._lote_apto(lt.vence, s.tipo, s.motivo, v_hoy, v_min);
  if not v_apto.apto then raise exception 'Lote %: %', lt.codigo, v_apto.razon using errcode = 'P0001'; end if;
  if wms.lote_bloqueado(lt.id) then raise exception 'El lote % está bloqueado', lt.codigo using errcode = 'P0001'; end if;

  v_ant := wms._asignacion_json(l.id);
  update wms.reservas set estado = 'LIBERADA', actualizada_en = now() where id = ol.reserva_id;   -- las unidades que el picker no encontró dejan de estar comprometidas

  if p_lote = ol.lote_id then
    -- el mismo lote en otra ubicación
    if p_posicion is null or p_posicion = ol.posicion_id then raise exception 'Elige otra ubicación para el mismo lote' using errcode = 'P0001'; end if;
    select * into v_cand from wms._candidatos(s.propietario_id, l.producto_id) c where c.lote_id = p_lote and c.posicion_id = p_posicion;
    if not found or v_cand.disponible < ol.cantidad or v_cand.en_conteo then
      raise exception 'Esa ubicación no tiene % unidades disponibles de ese lote', ol.cantidad using errcode = 'P0002';
    end if;
    insert into wms.reservas (linea_id, posicion_id, posicion_origen_id, producto_id, lote_id, propietario_id, procedencia_id, cantidad)
    values (l.id, p_posicion, p_posicion, l.producto_id, p_lote, s.propietario_id, v_cand.procedencia_id, ol.cantidad);
  else
    if (select coalesce(sum(c.disponible) filter (where c.disponible > 0 and not c.en_conteo), 0) from wms._candidatos(s.propietario_id, l.producto_id) c where c.lote_id = p_lote) < ol.cantidad then
      raise exception 'El lote % no tiene % unidades disponibles', lt.codigo, ol.cantidad using errcode = 'P0002';
    end if;
    perform wms._reservar_en_lote(l.id, p_lote, ol.cantidad);
  end if;

  -- Las reservas nuevas de la línea (las que todavía no están en la orden) pasan a la orden de picking en el orden del recorrido
  select array_agg(r.id) into v_reservas from wms.reservas r where r.linea_id = l.id and r.estado = 'ACTIVA' and not exists (select 1 from wms.ordenes_picking_lineas x where x.reserva_id = r.id);
  insert into wms.discrepancias_picking (orden_id, linea_id, lote_id, posicion_id, cantidad, nota, picker_id, reportada_en, nuevo_lote_id, nueva_posicion_id, resuelta_por)
  values (ol.orden_id, l.id, ol.lote_id, ol.posicion_id, ol.cantidad, coalesce(ol.nota_picking, 'Sin nota'), ol.picker_id, ol.pickeada_en, p_lote,
          (select r.posicion_id from wms.reservas r where r.id = v_reservas[1]), auth.uid());
  delete from wms.ordenes_picking_lineas where id = p_orden_linea;
  insert into wms.ordenes_picking_lineas (orden_id, linea_id, reserva_id, posicion_id, orden_recorrido, producto_id, lote_id, vence, cantidad)
  select ol.orden_id, r.linea_id, r.id, r.posicion_id, ps.orden_recorrido, r.producto_id, r.lote_id, lt2.vence, r.cantidad
    from wms.reservas r join wms.posiciones ps on ps.id = r.posicion_id join wms.lotes lt2 on lt2.id = r.lote_id
   where r.id = any (v_reservas) order by ps.orden_recorrido nulls last, ps.codigo, r.id;

  -- «Cambios a FEFO»: si la asignación vigente se aparta de la propuesta original, queda registrado (quién y cuándo)
  v_nueva := wms._asignacion_json(l.id);
  select coalesce((select jsonb_agg(jsonb_build_array(f.lote_id, f.cantidad) order by f.lote_id) from jsonb_to_recordset(l.asignacion_fefo) as f(lote_id uuid, cantidad integer)), '[]'::jsonb)
         is distinct from coalesce((select jsonb_agg(jsonb_build_array(n.lote_id, n.cantidad) order by n.lote_id) from jsonb_to_recordset(v_nueva) as n(lote_id uuid, cantidad integer)), '[]'::jsonb)
    into v_distinto;
  -- (lo ya pickeado de la línea cuenta como asignado: la asignación completa es lo ya reservado + lo nuevo)
  if v_distinto then
    insert into wms.cambios_lote_asignado (linea_id, motivo, asignacion_fefo, asignacion_anterior, asignacion_nueva, distinto_de_fefo, por)
    values (l.id, nullif(trim(p_nota), ''), l.asignacion_fefo, v_ant, v_nueva, true, auth.uid());
  end if;
  update wms.salida_lineas set lote_id = coalesce((select (e->>'lote_id')::uuid from jsonb_array_elements(v_nueva) e limit 1), lote_id) where id = l.id;
  update wms.ordenes_picking set estado = case when exists (select 1 from wms.ordenes_picking_lineas x where x.orden_id = o.id and x.picking = 'DISCREPANCIA') then 'CON_DISCREPANCIA' else 'EN_CURSO' end
   where id = o.id and estado in ('GENERADA', 'EN_CURSO', 'CON_DISCREPANCIA');
  perform wms.registrar_audit('discrepancia_picking_resuelta', 'ordenes_picking_lineas', p_orden_linea::text, v_ant, v_nueva, p_nota);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Zona «Observado»: corregir una línea observada
-- ─────────────────────────────────────────────────────────────────────────────

-- La línea observada vuelve a picking y a conformidad (otra persona la verifica). La observación queda en `observaciones_conformidad`.
create or replace function wms.reabrir_observada(p_orden_linea uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare ol wms.ordenes_picking_lineas;
begin
  perform wms._exigir_accion('ejecutar', 'No tienes permiso para corregir una línea observada');
  select * into ol from wms.ordenes_picking_lineas where id = p_orden_linea for update;
  if not found then raise exception 'No encontramos esa línea de picking' using errcode = 'P0001'; end if;
  if ol.conformidad <> 'OBSERVADA' then raise exception 'Esa línea no está observada' using errcode = 'P0001'; end if;
  insert into wms.observaciones_conformidad (orden_id, linea_id, orden_linea_id, tipo, nota, observada_por, observada_en, corregida_por, nota_correccion)
  values (ol.orden_id, ol.linea_id, ol.id, ol.no_conformidad, coalesce(ol.nota_conformidad, ''), ol.verificador_id, ol.verificada_en, auth.uid(), nullif(trim(p_nota), ''));
  update wms.ordenes_picking_lineas set picking = 'PENDIENTE', picker_id = null, pickeada_en = null, nota_picking = null,
         conformidad = 'PENDIENTE', verificador_id = null, verificada_en = null, nota_conformidad = null, no_conformidad = null where id = p_orden_linea;
  update wms.salida_lineas set estado = 'EN_PICKING' where id = ol.linea_id and estado = 'OBSERVADA';
  update wms.ordenes_picking set estado = 'EN_CURSO' where id = ol.orden_id and estado = 'COMPLETA';
  perform wms.registrar_audit('observacion_corregida', 'ordenes_picking_lineas', p_orden_linea::text, null, null, p_nota);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function
  wms.dar_conformidad(uuid, text, text, uuid, text), wms.resolver_discrepancia_picking(uuid, uuid, uuid, text), wms.reabrir_observada(uuid, text)
  to authenticated;
revoke execute on all functions in schema wms from public;
