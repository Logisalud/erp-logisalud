-- 0013 · WMS · Salidas · Edición libre de lotes (D-79, reemplaza D-77 (a) y D-78)
--
-- Cambio de decisión de Sebas (2026-10-14): quien prepara la salida puede elegir el lote que quiera para una línea de venta, antes del picking.
--   · Quién: Jefe de Almacén, Jefe de Transporte y auxiliares de almacén (`cambiar_lote_asignado`). El rol «reemplazo del Jefe» no existe: no se
--     le da nada nuevo.
--   · Se elimina el motivo obligatorio y la regla «debe vencer después del lote FEFO». FEFO sigue siendo la propuesta por defecto.
--   · Siguen, en base de datos y dominio: lote Aprobado, sin bloqueo, del mismo producto y propietario, 60 días de vida útil en ventas,
--     cantidad suficiente (nunca negativo) y suma de las asignaciones = cantidad de la línea.
--   · Un lote que no es el que vence primero NO bloquea: `avisos_fefo` dice cuál vence antes y se puede continuar.
--   · Trazabilidad automática: asignación FEFO original, anterior, final, quién y cuándo (motivo opcional).
--   · Reporte «Cambios a FEFO»: `reporte_cambios_fefo(desde, hasta)`.
-- Re-ejecutable. No toca datos. Se aplica a mano, después de la 0012. Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Permisos: los auxiliares también editan lotes; el «reemplazo del Jefe» no existe y no recibe lo nuevo
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.permisos_rol (rol, accion) values ('auxiliar', 'cambiar_lote_asignado')
on conflict (rol, accion) do nothing;
delete from wms.permisos_rol where rol = 'reemplazo_jefe' and accion in ('cambiar_lote_asignado', 'preparar_salidas');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trazabilidad: el motivo pasa a ser opcional y cada cambio guarda la asignación FEFO original
-- ─────────────────────────────────────────────────────────────────────────────

do $$ declare c record; begin
  for c in select conname from pg_constraint
            where conrelid = 'wms.cambios_lote_asignado'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%CLIENTE_SOLICITA_VENCIMIENTO_MAS_LARGO%' loop
    execute format('alter table wms.cambios_lote_asignado drop constraint %I', c.conname);
  end loop;
end $$;
alter table wms.cambios_lote_asignado alter column motivo drop not null;
alter table wms.cambios_lote_asignado add column if not exists asignacion_fefo jsonb;
alter table wms.cambios_lote_asignado add column if not exists distinto_de_fefo boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'wms.cambios_lote_asignado'::regclass and conname = 'cambios_lote_motivo_largo') then
    alter table wms.cambios_lote_asignado add constraint cambios_lote_motivo_largo check (motivo is null or char_length(motivo) <= 500);
  end if;
end $$;
create index if not exists cambios_lote_en_idx on wms.cambios_lote_asignado (en) where distinto_de_fefo;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Editar la asignación de una línea (libre, con las reglas de seguridad)
-- ─────────────────────────────────────────────────────────────────────────────

-- p_asignaciones: [{"lote_id": uuid, "cantidad": n}, …]. p_motivo es opcional (texto libre, hasta 500 caracteres).
create or replace function wms.editar_asignacion(p_linea uuid, p_asignaciones jsonb, p_motivo text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  l wms.salida_lineas; s wms.salidas; v_hoy date := wms._hoy_lima(); v_min integer; x record;
  v_suma integer := 0; v_ant jsonb; v_nueva jsonb; v_lote wms.lotes; v_apto record; v_disp integer; v_ord uuid; v_n integer;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), ''); v_distinto boolean;
begin
  perform wms._exigir_accion('cambiar_lote_asignado', 'No tienes permiso para editar los lotes asignados');
  if v_motivo is not null and char_length(v_motivo) > 500 then
    raise exception 'El motivo es demasiado largo (máximo 500 caracteres)' using errcode = 'P0001';
  end if;
  select * into l from wms.salida_lineas where id = p_linea for update;
  if not found then raise exception 'No encontramos esa línea' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = l.salida_id;
  if s.tipo <> 'DISTRIBUCION' then
    raise exception 'Los lotes solo se editan en un pedido de venta: en una salida de cliente el lote lo indica el cliente' using errcode = 'P0001';
  end if;
  if l.estado not in ('ASIGNADA', 'EN_PICKING') then
    raise exception 'La línea no está asignada o ya salió del picking: no se editan los lotes' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.ordenes_picking_lineas ol where ol.linea_id = p_linea and ol.picking <> 'PENDIENTE') then
    raise exception 'Ya empezó el picking de esta línea: no se editan los lotes' using errcode = 'P0001';
  end if;
  if p_asignaciones is null or jsonb_typeof(p_asignaciones) <> 'array' or jsonb_array_length(p_asignaciones) = 0 then
    raise exception 'Indica al menos un lote con su cantidad' using errcode = 'P0001';
  end if;
  for x in select (e->>'lote_id')::uuid as lote_id, (e->>'cantidad')::integer as cantidad from jsonb_array_elements(p_asignaciones) e loop
    if x.lote_id is null or x.cantidad is null or x.cantidad <= 0 then
      raise exception 'Cada lote lleva su cantidad, mayor que cero' using errcode = 'P0001';
    end if;
    v_suma := v_suma + x.cantidad;
  end loop;
  select count(distinct (e->>'lote_id')) into v_n from jsonb_array_elements(p_asignaciones) e;
  if v_n <> jsonb_array_length(p_asignaciones) then raise exception 'Un lote aparece una sola vez' using errcode = 'P0001'; end if;
  if v_suma <> l.cantidad then
    raise exception 'La suma de los lotes (%) debe ser igual a la cantidad de la línea (%)', v_suma, l.cantidad using errcode = 'P0001';
  end if;
  perform wms._candado_stock(l.producto_id, s.propietario_id);
  v_min := coalesce((select p.valor::integer from wms.parametros p where p.clave = 'vida_util_minima_venta_dias'), 60);
  v_ant := wms._asignacion_json(p_linea);

  -- Se liberan las reservas vigentes de la línea (si algo no cumple, la transacción se deshace y vuelven a quedar como estaban).
  update wms.reservas set estado = 'LIBERADA', actualizada_en = now() where linea_id = p_linea and estado = 'ACTIVA';

  for x in select (e->>'lote_id')::uuid as lote_id, (e->>'cantidad')::integer as cantidad from jsonb_array_elements(p_asignaciones) e loop
    select * into v_lote from wms.lotes where id = x.lote_id;
    if not found then raise exception 'No encontramos uno de los lotes' using errcode = 'P0001'; end if;
    if v_lote.producto_id <> l.producto_id or v_lote.propietario_id <> s.propietario_id then
      raise exception 'El lote % no corresponde al producto o al propietario de la línea', v_lote.codigo using errcode = 'P0001';
    end if;
    select * into v_apto from wms._lote_apto(v_lote.vence, s.tipo, s.motivo, v_hoy, v_min);
    if not v_apto.apto then raise exception 'Lote %: %', v_lote.codigo, v_apto.razon using errcode = 'P0001'; end if;
    if wms.lote_bloqueado(v_lote.id) then raise exception 'El lote % está bloqueado', v_lote.codigo using errcode = 'P0001'; end if;
    select coalesce(sum(c.disponible) filter (where c.disponible > 0 and not c.en_conteo), 0) into v_disp
      from wms._candidatos(s.propietario_id, l.producto_id) c where c.lote_id = v_lote.id;
    if v_disp < x.cantidad then
      raise exception 'El lote % no tiene suficientes unidades disponibles (hay %, se piden %)', v_lote.codigo, v_disp, x.cantidad using errcode = 'P0002';
    end if;
    perform wms._reservar_en_lote(p_linea, v_lote.id, x.cantidad);
  end loop;

  v_nueva := wms._asignacion_json(p_linea);
  if v_nueva = v_ant then raise exception 'La asignación no cambió' using errcode = 'P0001'; end if;
  update wms.salida_lineas set lote_id = (select (e->>'lote_id')::uuid from jsonb_array_elements(v_nueva) e limit 1) where id = p_linea;
  -- ¿La asignación final se aparta de la propuesta FEFO original? (otro lote u otra distribución entre lotes)
  select coalesce((select jsonb_agg(jsonb_build_array(f.lote_id, f.cantidad) order by f.lote_id)
                     from jsonb_to_recordset(l.asignacion_fefo) as f(lote_id uuid, cantidad integer)), '[]'::jsonb)
         is distinct from
         coalesce((select jsonb_agg(jsonb_build_array(n.lote_id, n.cantidad) order by n.lote_id)
                     from jsonb_to_recordset(v_nueva) as n(lote_id uuid, cantidad integer)), '[]'::jsonb)
    into v_distinto;
  insert into wms.cambios_lote_asignado (linea_id, motivo, asignacion_fefo, asignacion_anterior, asignacion_nueva, distinto_de_fefo, por)
  values (p_linea, v_motivo, l.asignacion_fefo, v_ant, v_nueva, v_distinto, auth.uid());
  -- Si ya hay orden de picking, se reescriben sus líneas (ninguna se había pickeado).
  select ol.orden_id into v_ord from wms.ordenes_picking_lineas ol join wms.ordenes_picking o on o.id = ol.orden_id
   where ol.linea_id = p_linea and o.estado <> 'CANCELADA' limit 1;
  if v_ord is not null then
    delete from wms.ordenes_picking_lineas where linea_id = p_linea and orden_id = v_ord;
    insert into wms.ordenes_picking_lineas (orden_id, linea_id, reserva_id, posicion_id, orden_recorrido, producto_id, lote_id, vence, cantidad)
    select v_ord, r.linea_id, r.id, r.posicion_id, ps.orden_recorrido, r.producto_id, r.lote_id, lt.vence, r.cantidad
      from wms.reservas r join wms.posiciones ps on ps.id = r.posicion_id join wms.lotes lt on lt.id = r.lote_id
     where r.linea_id = p_linea and r.estado = 'ACTIVA';
  end if;
  perform wms.registrar_audit('asignacion_editada', 'salida_lineas', p_linea::text, v_ant, v_nueva, v_motivo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Lo que la pantalla necesita: lotes válidos para una línea y el aviso «hay un lote que vence antes»
-- ─────────────────────────────────────────────────────────────────────────────

-- Los lotes que se pueden elegir para una línea de venta: aptos (no vencidos, 60 días), sin bloqueo, con disponible. `disponible` cuenta lo que
-- la propia línea ya tiene reservado (se puede dejar igual). `ubicacion` es la primera ubicación en el recorrido del almacén; `sugerido` marca
-- los lotes de la propuesta FEFO original de la línea. Ordenados por vencimiento (FEFO).
create or replace function wms.lotes_para_editar(p_linea uuid)
returns table (lote_id uuid, lote text, vence date, dias_de_vida integer, ubicacion text, ubicaciones integer, disponible integer, asignado integer, sugerido boolean)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare l wms.salida_lineas; s wms.salidas; v_hoy date := wms._hoy_lima(); v_min integer;
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  select * into l from wms.salida_lineas where id = p_linea;
  if not found then raise exception 'No encontramos esa línea' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = l.salida_id;
  v_min := case when s.tipo = 'DISTRIBUCION' then coalesce((select p.valor::integer from wms.parametros p where p.clave = 'vida_util_minima_venta_dias'), 60) else 0 end;
  return query
  select x.lote_id, x.lote, x.vence, (x.vence - v_hoy)::integer, x.ubicacion, x.ubicaciones,
         (x.disp + x.asig)::integer, x.asig::integer,
         exists (select 1 from jsonb_to_recordset(l.asignacion_fefo) as f(lote_id uuid) where f.lote_id = x.lote_id)
    from (select c.lote_id, c.lote, c.vence,
                 (array_agg(c.posicion order by c.orden_recorrido nulls last, c.posicion))[1] as ubicacion,
                 count(distinct c.posicion_id)::integer as ubicaciones,
                 coalesce(sum(c.disponible) filter (where c.disponible > 0 and not c.en_conteo), 0) as disp,
                 coalesce((select sum(r.cantidad) from wms.reservas r where r.linea_id = p_linea and r.lote_id = c.lote_id and r.estado = 'ACTIVA'), 0) as asig
            from wms._candidatos(s.propietario_id, l.producto_id) c
           group by c.lote_id, c.lote, c.vence) x
    cross join lateral wms._lote_apto(x.vence, s.tipo, s.motivo, v_hoy, v_min) a
   where a.apto and not wms.lote_bloqueado(x.lote_id) and (x.disp + x.asig) > 0
   order by x.vence nulls last, x.lote;
end $$;

-- El aviso (no bloquea): por cada lote elegido, el lote válido que vence ANTES y todavía tiene unidades. Sin filas = es el FEFO.
create or replace function wms.avisos_fefo(p_linea uuid, p_asignaciones jsonb)
returns table (lote_id uuid, lote text, vence date, antes_lote_id uuid, antes_lote text, antes_vence date)
language sql stable security definer set search_path = wms, pg_temp as $$
  with elegidos as (
    select distinct (e->>'lote_id')::uuid as lote_id from jsonb_array_elements(p_asignaciones) e),
  validos as (select * from wms.lotes_para_editar(p_linea))
  select e.lote_id, el.lote, el.vence, a.lote_id, a.lote, a.vence
    from elegidos e
    join validos el on el.lote_id = e.lote_id
    cross join lateral (select v.lote_id, v.lote, v.vence from validos v
                         where v.vence < el.vence and v.lote_id not in (select lote_id from elegidos)
                         order by v.vence, v.lote limit 1) a
   order by el.vence nulls last, el.lote
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. El reemplazo en picking ya no exige vencer después del FEFO original
-- ─────────────────────────────────────────────────────────────────────────────

-- El picker no encuentra el lote asignado (solo en A): primero el MISMO lote en otra ubicación; si no, el siguiente FEFO válido.
create or replace function wms.proponer_reemplazo(p_linea uuid, p_lote uuid default null)
returns table (posicion_id uuid, posicion text, lote_id uuid, lote text, vence date, disponible integer, motivo text)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare l wms.salida_lineas; s wms.salidas; v_hoy date := wms._hoy_lima(); v_min integer; v_lote uuid; v_cant integer;
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  select * into l from wms.salida_lineas where id = p_linea;
  if not found then raise exception 'No encontramos esa línea' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = l.salida_id;
  if s.tipo = 'CLIENTE' then raise exception 'En una salida de cliente el lote lo indica el cliente: no hay reemplazo' using errcode = 'P0001'; end if;
  v_min := case when s.tipo = 'DISTRIBUCION' then coalesce((select p.valor::integer from wms.parametros p where p.clave = 'vida_util_minima_venta_dias'), 60) else 0 end;
  -- El lote que el picker no encuentra (por defecto, el principal de la línea) y cuántas unidades de ese lote lleva la línea.
  v_lote := coalesce(p_lote, l.lote_id);
  select coalesce(sum(r.cantidad), 0)::integer into v_cant from wms.reservas r
   where r.linea_id = l.id and r.lote_id = v_lote and r.estado in ('ACTIVA', 'EN_TRANSITO');
  if v_cant = 0 then raise exception 'Ese lote no está asignado a esta línea' using errcode = 'P0001'; end if;
  return query
  select c.posicion_id, c.posicion, c.lote_id, c.lote, c.vence, c.disponible, 'MISMO_LOTE_OTRA_UBICACION'::text
    from wms._candidatos(s.propietario_id, l.producto_id) c
   where c.lote_id = v_lote and c.disponible >= v_cant and not c.en_conteo
     and not exists (select 1 from wms.reservas r where r.linea_id = l.id and r.lote_id = v_lote and r.posicion_id = c.posicion_id and r.estado in ('ACTIVA', 'EN_TRANSITO'))
   order by c.orden_recorrido nulls last, c.posicion;
  if found then return; end if;
  return query
  select x.posicion_id, x.posicion, x.lote_id, x.lote, x.vence, x.total::integer, 'SIGUIENTE_FEFO'::text
    from (select distinct on (c.lote_id) c.lote_id, c.lote, c.vence, c.posicion_id, c.posicion,
                 sum(c.disponible) over (partition by c.lote_id) as total, c.orden_recorrido
            from wms._candidatos(s.propietario_id, l.producto_id) c
            cross join lateral wms._lote_apto(c.vence, s.tipo, s.motivo, v_hoy, v_min) a
           where c.lote_id <> v_lote and c.disponible > 0 and not c.en_conteo and a.apto and not wms.lote_bloqueado(c.lote_id)
           order by c.lote_id, c.orden_recorrido nulls last, c.posicion) x
   where x.total >= v_cant
   order by x.vence nulls last, x.lote
   limit 5;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Reporte «Cambios a FEFO»: cuántas veces y quién eligió un lote distinto al FEFO, por periodo
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.reporte_cambios_fefo(p_desde date default null, p_hasta date default null)
returns table (persona_id uuid, veces integer, lineas integer, unidades integer, primera_en timestamptz, ultima_en timestamptz)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if not wms.tiene_rol('jefe_almacen', 'jefe_transporte', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura') then
    raise exception 'No tienes permiso para ver este reporte' using errcode = '42501';
  end if;
  return query
  select c.por, count(*)::integer, count(distinct c.linea_id)::integer,
         sum(sl.cantidad)::integer,
         min(c.en), max(c.en)
    from wms.cambios_lote_asignado c join wms.salida_lineas sl on sl.id = c.linea_id
   where c.distinto_de_fefo
     and (p_desde is null or (c.en at time zone 'America/Lima')::date >= p_desde)
     and (p_hasta is null or (c.en at time zone 'America/Lima')::date <= p_hasta)
   group by c.por
   order by count(*) desc, max(c.en) desc;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grants (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function
  wms.editar_asignacion(uuid, jsonb, text), wms.lotes_para_editar(uuid), wms.avisos_fefo(uuid, jsonb), wms.proponer_reemplazo(uuid, uuid),
  wms.reporte_cambios_fefo(date, date) to authenticated;
revoke execute on all functions in schema wms from public;
