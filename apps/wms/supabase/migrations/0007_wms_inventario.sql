-- WMS · 0007 — Inventario en operación (Batch 3): Kardex e historia del lote, movimientos internos (INV-02),
-- conteos cíclicos y ajustes (INV-05) y carga inicial.
--
-- Re-ejecutable. Se aplica a mano, después de 0006. No usa `drop … if exists` sobre objetos que pueden no existir
-- (la herramienta MCP de Supabase se colgó con ese patrón): verifica con pg_constraint / pg_policies / pg_trigger antes.
-- Todo es aditivo dentro del schema `wms`; no toca catalogo, compras ni public.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Parámetros y tipos de alerta nuevos
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.parametros (clave, valor, nota) values
  ('vencimiento_tramos_dias', '30,60,90,180', 'D-30: tramos (en días) del reporte de vencimientos; se agregan «vencido» y «más de N días»'),
  ('conteos_por_semana', '3', 'INV-05: cuántos conteos cíclicos se programan por semana')
on conflict (clave) do nothing;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'alertas_tipo_check' and conrelid = 'wms.alertas'::regclass) then
    alter table wms.alertas drop constraint alertas_tipo_check;
  end if;
  alter table wms.alertas add constraint alertas_tipo_check check (tipo in (
    'TEMPERATURA', 'RS_VENCIDO', 'DIVERGENCIA_COMPRAS', 'POR_TRASLADAR_VENCIDO', 'LOTE_POR_VENCER', 'LOTE_VENCIDO',
    'SOLICITUD_AJUSTADA', 'EXCEDE_OC', 'POR_REGISTRAR_EN_COMPRAS', 'NO_COINCIDE_CON_COMPRAS',
    'MOVIMIENTO_CON_DIFERENCIA', 'MOVIMIENTO_SIN_VERIFICAR', 'CONTEO_CON_DIFERENCIA', 'AJUSTE_POR_AUTORIZAR'));
end $$;

insert into wms.parametros (clave, valor, nota) values
  ('movimiento_sin_verificar_horas', '24', 'Horas desde que se ejecuta un movimiento interno sin verificar antes de alertar al Jefe de Almacén')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Kardex (solo entradas y salidas) e historia completa del lote
-- ─────────────────────────────────────────────────────────────────────────────

-- Kardex: una fila por partida con saldo corrido, por producto (todos sus lotes) o por lote, con saldo inicial al comienzo del rango.
-- Entra todo lo que cambia la cantidad del propietario: ingresos, carga inicial, ajustes y reversas de esos.
-- NO entran los movimientos internos ni los cambios de estado (no cambian la cantidad total); sí salen en la historia completa.
create or replace function wms.kardex_filas(
  p_producto uuid, p_lote uuid default null, p_propietario uuid default null,
  p_desde date default null, p_hasta date default null)
returns table (
  orden integer, es_saldo_inicial boolean, partida_id bigint, fecha timestamptz, tipo_documento text,
  numero_acta text, fecha_acta timestamptz, lote text, contraparte text, ruc text, tipo_doc_ref text, numero_doc_ref text,
  posicion text, entrada integer, salida integer, saldo integer, tipo_ingreso text, propietario text, producto text,
  movimiento_id uuid, es_reversa boolean, motivo text)
language sql stable set search_path = wms, pg_temp as $$
  with base as (
    select p.id as partida_id, p.ts, m.id as movimiento_id, m.tipo, m.motivo, m.reversa_de, l.codigo as lote_codigo,
           o.codigo as propietario, ps.codigo as posicion, p.delta, p.origen, i.tipo as tipo_ingreso,
           i.contraparte_nombre, i.contraparte_ruc, i.guia_numero, i.factura_numero, i.doc_original_tipo, i.doc_original_numero,
           a.numero as acta_numero, coalesce(a.firmada_en, a.generada_en) as acta_fecha, mo.tipo as tipo_original
      from wms.partidas p
      join wms.movimientos m on m.id = p.movimiento_id
      left join wms.movimientos mo on mo.id = m.reversa_de
      join wms.lotes l on l.id = p.lote_id
      join wms.propietarios o on o.id = l.propietario_id
      join wms.posiciones ps on ps.id = p.posicion_id
      left join wms.ingreso_lotes il on il.id = p.procedencia_id
      left join wms.ingresos i on i.id = il.ingreso_id
      left join lateral (select ar.numero, ar.firmada_en, ar.generada_en from wms.actas_recepcion ar
                          where ar.ingreso_id = i.id and ar.estado = 'FIRMADA' order by ar.generada_en desc limit 1) a on true
     where p.producto_id = p_producto
       and (p_lote is null or p.lote_id = p_lote)
       and (p_propietario is null or l.propietario_id = p_propietario)
       and coalesce(mo.tipo, m.tipo) in ('INGRESO', 'CARGA_INICIAL', 'AJUSTE', 'CAMBIO_PROPIETARIO')
  ), prod as (select codigo || ' · ' || descripcion as nombre from catalogo.productos where id = p_producto),
  inicial as (
    select coalesce(sum(delta), 0)::integer as saldo from base
     where p_desde is not null and (ts at time zone 'America/Lima')::date < p_desde),
  rango as (
    select * from base
     where (p_desde is null or (ts at time zone 'America/Lima')::date >= p_desde)
       and (p_hasta is null or (ts at time zone 'America/Lima')::date <= p_hasta))
  select 0, true, null::bigint, null::timestamptz, 'Saldo inicial', null, null::timestamptz, null, null, null, null, null, null,
         null::integer, null::integer, (select saldo from inicial), null, null, (select nombre from prod), null::uuid, false, null
   where p_desde is not null
  union all
  select (row_number() over (order by r.ts, r.partida_id))::integer, false, r.partida_id, r.ts,
         case when r.tipo = 'REVERSA' then 'Reversa de ' || case r.tipo_original when 'INGRESO' then 'acta de recepción' when 'AJUSTE' then 'ajuste'
                                                                  when 'CARGA_INICIAL' then 'carga inicial' else lower(r.tipo_original) end
              when r.tipo = 'INGRESO' then 'Acta de Recepción' when r.tipo = 'CARGA_INICIAL' then 'Carga inicial'
              when r.tipo = 'AJUSTE' then 'Ajuste autorizado' else 'Cambio de propietario' end,
         r.acta_numero, r.acta_fecha, r.lote_codigo, r.contraparte_nombre, r.contraparte_ruc,
         case when r.guia_numero is not null then 'GUÍA DE REMISIÓN' when r.factura_numero is not null then 'FACTURA' else r.doc_original_tipo end,
         coalesce(r.guia_numero, r.factura_numero, r.doc_original_numero),
         r.posicion, greatest(r.delta, 0), greatest(-r.delta, 0),
         ((select saldo from inicial) + sum(r.delta) over (order by r.ts, r.partida_id))::integer,
         r.tipo_ingreso, r.propietario, (select nombre from prod), r.movimiento_id, r.tipo = 'REVERSA', r.motivo
    from rango r
   order by 1
$$;

-- Historia completa del lote: TODO lo que lo tocó (ingresos, movimientos internos, cambios de estado, ajustes, reversas),
-- con quién preparó, ejecutó y verificó, de lo más antiguo a lo más reciente.
create or replace function wms.historia_lote(p_lote uuid)
returns table (
  partida_id bigint, fecha timestamptz, tipo text, motivo text, posicion text, estado text, origen text, delta integer,
  ejecutor_id uuid, preparador_id uuid, verificador_id uuid, movimiento_id uuid, reversa_de uuid,
  referencia_tipo text, referencia_id text, sustento_tipo text, sustento_id text, saldo_lote integer)
language sql stable set search_path = wms, pg_temp as $$
  select p.id, p.ts, m.tipo, m.motivo, ps.codigo, p.estado, p.origen, p.delta, m.ejecutor_id, m.preparador_id, m.verificador_id,
         m.id, m.reversa_de, m.referencia_tipo, m.referencia_id, m.sustento_tipo, m.sustento_id,
         (sum(p.delta) over (order by p.id))::integer
    from wms.partidas p
    join wms.movimientos m on m.id = p.movimiento_id
    join wms.posiciones ps on ps.id = p.posicion_id
   where p.lote_id = p_lote
   order by p.id
$$;

grant execute on function wms.kardex_filas(uuid, uuid, uuid, date, date), wms.historia_lote(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Movimientos internos (INV-02): ejecutar → verificar. Solo DOS personas: quien lo CREA y mueve (ejecutor, la misma persona) y
--    quien lo verifica (otro auxiliar, el Jefe o su reemplazo; nunca el ejecutor). No hay autorización previa en el sistema (la indicación es verbal).
--    Desde que se ejecuta, sus unidades quedan reservadas. El ledger solo se escribe al verificar cada línea; con diferencia, esa línea queda
--    abierta (nunca se «cuadra» una cantidad) y la resuelve el Jefe.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.ordenes_movimiento (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,                    -- MI-AAAA-NNNNN (el correlativo se reinicia cada año)
  estado text not null default 'EJECUTADO'
    check (estado in ('EJECUTADO', 'CONFIRMADO', 'CON_DIFERENCIA', 'ANULADO')),
  motivo text not null check (nullif(trim(motivo), '') is not null),
  ejecutor_id uuid not null,                      -- quien lo crea en el sistema y mueve la mercadería: la misma persona
  ejecutado_en timestamptz not null default now(),
  -- Llave de idempotencia del borrador: si la conexión se corta y se reintenta, el mismo borrador no crea dos movimientos.
  token text unique,
  verificador_id uuid,
  verificado_en timestamptz,
  nota_diferencia text,
  movimiento_id uuid references wms.movimientos(id),
  anulado_por uuid,
  anulado_en timestamptz,
  motivo_anulacion text,
  -- D-15: quien hace un movimiento no lo verifica.
  check (verificador_id is null or verificador_id <> ejecutor_id),
  check (estado <> 'ANULADO' or nullif(trim(motivo_anulacion), '') is not null)
);
alter table wms.ordenes_movimiento enable row level security;

create table if not exists wms.ordenes_movimiento_lineas (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references wms.ordenes_movimiento(id),
  producto_id uuid not null,
  lote_id uuid not null references wms.lotes(id),
  propietario_id uuid not null references wms.propietarios(id),
  estado text not null references wms.estados_sanitarios(codigo),
  origen text not null references wms.origenes(codigo),
  procedencia_id uuid not null,
  desde_posicion_id uuid not null references wms.posiciones(id),
  hasta_posicion_id uuid not null references wms.posiciones(id),
  cantidad integer not null check (cantidad > 0),
  -- Cada línea se verifica por separado: una diferencia deja abierta solo esa línea; las demás se confirman.
  verificacion text not null default 'PENDIENTE' check (verificacion in ('PENDIENTE', 'CONFIRMADA', 'CON_DIFERENCIA', 'ANULADA')),
  nota_diferencia text,
  verificador_id uuid,
  verificada_en timestamptz,
  movimiento_id uuid references wms.movimientos(id),    -- el movimiento del libro que confirmó esta línea
  check (desde_posicion_id <> hasta_posicion_id),
  check (verificacion <> 'CON_DIFERENCIA' or nullif(trim(nota_diferencia), '') is not null)
);
alter table wms.ordenes_movimiento_lineas enable row level security;
create index if not exists ordenes_mov_lineas_orden_idx on wms.ordenes_movimiento_lineas (orden_id);

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'ordenes_movimiento' and policyname = 'lectura') then
    create policy lectura on wms.ordenes_movimiento for select to authenticated using (wms.es_usuario());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'ordenes_movimiento_lineas' and policyname = 'lectura') then
    create policy lectura on wms.ordenes_movimiento_lineas for select to authenticated using (wms.es_usuario());
  end if;
end $$;
grant select on wms.ordenes_movimiento, wms.ordenes_movimiento_lineas to authenticated;

-- postear_movimiento con el contexto de una orden verificada (ejecutor y verificador explícitos)
create or replace function wms.postear_movimiento(
  p_tipo text,
  p_motivo text,
  p_partidas jsonb,
  p_referencia_tipo text default null,
  p_referencia_id text default null,
  p_sustento_tipo text default null,
  p_sustento_id text default null,
  p_reversa_de uuid default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v_id uuid := gen_random_uuid();
  v_actor uuid := auth.uid();
  v_constraint text;
  r record;
  v_ctx jsonb := nullif(current_setting('wms.orden_ctx', true), '')::jsonb;
  v_ejecutor uuid;
  v_verificador uuid;
begin
  if v_actor is null then
    raise exception 'Sesión requerida' using errcode = '42501';
  end if;
  if p_partidas is null or jsonb_array_length(p_partidas) = 0 then
    raise exception 'El movimiento no tiene partidas' using errcode = 'P0001';
  end if;

  v_ejecutor := v_actor;
  -- Movimiento interno confirmado por su verificador (INV-02): el ledger guarda a las dos personas (D-15).
  -- Solo lo fija wms.confirmar_movimiento, dentro de su transacción; aquí se vuelve a comprobar contra la orden.
  if v_ctx is not null then
    select o.ejecutor_id, o.verificador_id into v_ejecutor, v_verificador
      from wms.ordenes_movimiento o
     where o.id = (v_ctx->>'orden')::uuid and o.verificador_id = v_actor and o.estado = 'EJECUTADO';
    if not found or p_tipo <> 'MOVIMIENTO' then
      raise exception 'Contexto de movimiento interno inválido' using errcode = '42501';
    end if;
  end if;

  -- Permisos por tipo (además, las policies bloquean todo DML directo).
  if p_tipo = 'CAMBIO_ESTADO' and not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica registra cambios de estado sanitario' using errcode = '42501';
  elsif p_tipo = 'AJUSTE' and not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica aprueba ajustes' using errcode = '42501';
  elsif p_tipo = 'CARGA_INICIAL' and not wms.tiene_permiso('configurar') then
    raise exception 'No tienes permiso para la carga inicial' using errcode = '42501';
  elsif p_tipo in ('INGRESO', 'MOVIMIENTO', 'REVERSA') and v_ctx is null and not wms.tiene_permiso('ejecutar') then
    raise exception 'No tienes permiso para registrar movimientos' using errcode = '42501';
  end if;
  if not exists (select 1 from wms.tipos_movimiento where codigo = p_tipo and habilitado) then
    raise exception 'Tipo de movimiento no habilitado: %', p_tipo using errcode = 'P0001';
  end if;

  -- Candados por celda, en orden determinista (sin interbloqueos): dos personas
  -- que tocan las mismas unidades se serializan y la segunda ve el saldo real.
  for r in
    select distinct (x->>'posicion_id') as pos, (x->>'lote_id') as lote, (x->>'estado') as est,
           (x->>'procedencia_id') as proc
      from jsonb_array_elements(p_partidas) x
     order by 1, 2, 3, 4
  loop
    perform pg_advisory_xact_lock(hashtextextended(r.pos || '|' || r.lote || '|' || r.est || '|' || r.proc, 0));
  end loop;

  insert into wms.movimientos (id, tipo, motivo, referencia_tipo, referencia_id, sustento_tipo, sustento_id,
                               ejecutor_id, preparador_id, verificador_id, reversa_de)
  values (v_id, p_tipo, p_motivo, p_referencia_tipo, p_referencia_id, p_sustento_tipo, p_sustento_id,
          v_ejecutor, v_ejecutor, v_verificador, p_reversa_de);

  insert into wms.partidas (movimiento_id, posicion_id, producto_id, lote_id, propietario_id, estado,
                            origen, procedencia_id, delta)
  select v_id, (x->>'posicion_id')::uuid, (x->>'producto_id')::uuid, (x->>'lote_id')::uuid,
         (x->>'propietario_id')::uuid, x->>'estado', x->>'origen', (x->>'procedencia_id')::uuid,
         (x->>'delta')::int
    from jsonb_array_elements(p_partidas) x;

  perform wms.validar_movimiento(v_id);
  perform wms.registrar_audit('movimiento_' || lower(p_tipo), 'movimientos', v_id::text, null,
                              jsonb_build_object('partidas', p_partidas), p_motivo);
  return v_id;
exception when check_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint = 'saldos_cantidad_check' then
    -- La interfaz arma el mensaje humano a partir de este código.
    raise exception 'Saldo insuficiente: alguien más ya movió esas unidades o no hay stock suficiente'
      using errcode = 'P0002';
  end if;
  raise;
end $$;


-- Una ubicación en conteo no se mueve hasta cerrarlo (INV-05, paso 3). Los ajustes del propio conteo sí pasan.
create or replace function wms.trg_pausa_por_conteo()
returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_tipo text; v_pos text;
begin
  select tipo into v_tipo from wms.movimientos where id = new.movimiento_id;
  if v_tipo = 'AJUSTE' then return new; end if;
  select ps.codigo into v_pos
    from wms.conteo_lineas l join wms.conteos c on c.id = l.conteo_id join wms.posiciones ps on ps.id = l.posicion_id
   where l.posicion_id = new.posicion_id and c.estado <> 'CERRADO' limit 1;
  if v_pos is not null then
    raise exception 'La ubicación % está en conteo: no se mueve hasta cerrarlo', v_pos using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ─── funciones de movimientos internos ───────────────────────────────────────

create or replace function wms._exigir_jefe() returns void
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_rol('jefe_almacen', 'reemplazo_jefe') then
    raise exception 'Solo el Jefe de Almacén (o su reemplazo) hace esto' using errcode = '42501';
  end if;
end $$;

-- Crea el movimiento: quien lo registra es quien lo mueve. Queda EJECUTADO y reserva sus unidades hasta que otra persona lo verifique.
create or replace function wms.ejecutar_movimiento(p_lineas jsonb, p_motivo text, p_token text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v_id uuid := gen_random_uuid();
  v_anio text := to_char(now(), 'YYYY');
  x jsonb;
  v_lote wms.lotes;
  v_origen text;
  v_area text;
  v_disp bigint;
  v_reservado bigint;
  v_desde uuid;
  v_hasta uuid;
  v_cant integer;
  v_estado text;
  v_proc uuid;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_permiso('ejecutar') then
    raise exception 'No tienes permiso para registrar movimientos' using errcode = '42501';
  end if;
  -- Reintento del mismo borrador (por ejemplo, tras cortarse la conexión): devuelve el movimiento ya creado, nunca uno nuevo.
  if nullif(trim(p_token), '') is not null then
    select id into v_id from wms.ordenes_movimiento where token = trim(p_token) and ejecutor_id = auth.uid();
    if found then return v_id; end if;
    v_id := gen_random_uuid();
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Cuéntanos por qué se mueve: el motivo es obligatorio' using errcode = 'P0001';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El movimiento no tiene líneas' using errcode = 'P0001';
  end if;

  insert into wms.ordenes_movimiento (id, numero, motivo, ejecutor_id, token)
  values (v_id, 'MI-' || v_anio || '-' || lpad(wms.siguiente_correlativo('MI-' || v_anio)::text, 5, '0'), trim(p_motivo), auth.uid(), nullif(trim(p_token), ''));

  for x in select * from jsonb_array_elements(p_lineas) loop
    v_desde := (x->>'desde_posicion_id')::uuid;
    v_hasta := (x->>'hasta_posicion_id')::uuid;
    v_cant := (x->>'cantidad')::integer;
    v_estado := x->>'estado';
    v_proc := (x->>'procedencia_id')::uuid;
    if v_desde = v_hasta then raise exception 'El origen y el destino son el mismo lugar' using errcode = 'P0001'; end if;
    if v_cant is null or v_cant <= 0 then raise exception 'La cantidad debe ser mayor que cero' using errcode = 'P0001'; end if;
    select * into v_lote from wms.lotes where id = (x->>'lote_id')::uuid;
    if not found then raise exception 'No encontramos ese lote' using errcode = 'P0001'; end if;
    select origen into v_origen from wms.partidas where procedencia_id = v_proc and lote_id = v_lote.id order by id limit 1;
    if v_origen is null then raise exception 'Esas unidades no tienen procedencia conocida' using errcode = 'P0001'; end if;

    select coalesce(sum(cantidad), 0) into v_disp from wms.saldos
     where posicion_id = v_desde and lote_id = v_lote.id and estado = v_estado and procedencia_id = v_proc;
    select coalesce(sum(l.cantidad), 0) into v_reservado
      from wms.ordenes_movimiento_lineas l join wms.ordenes_movimiento o on o.id = l.orden_id
     where o.estado in ('EJECUTADO', 'CON_DIFERENCIA')   -- incluye las líneas ya cargadas de ESTA orden
       and l.verificacion in ('PENDIENTE', 'CON_DIFERENCIA')
       and l.desde_posicion_id = v_desde and l.lote_id = v_lote.id and l.estado = v_estado and l.procedencia_id = v_proc;
    if v_cant > v_disp - v_reservado then
      raise exception 'No hay suficientes unidades en ese lugar (hay %, otros movimientos ya reservan %)', v_disp, v_reservado using errcode = 'P0002';
    end if;

    select tipo_area into v_area from wms.posiciones where id = v_hasta;
    if not exists (select 1 from wms.area_estado_admitido where tipo_area = v_area and estado = v_estado
                    and (origen_requerido is null or origen_requerido = v_origen)) then
      raise exception 'La zona de destino (%) no admite unidades en estado %', v_area, v_estado using errcode = 'P0001';
    end if;
    if not wms.posicion_acepta(v_hasta, v_lote.propietario_id, current_date) then
      raise exception 'La posición de destino no acepta stock de ese propietario (sin asignación vigente)' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.conteo_lineas cl join wms.conteos c on c.id = cl.conteo_id
                where cl.posicion_id in (v_desde, v_hasta) and c.estado <> 'CERRADO') then
      raise exception 'Una de las ubicaciones está en conteo: no se mueve hasta cerrarlo' using errcode = 'P0001';
    end if;

    insert into wms.ordenes_movimiento_lineas (orden_id, producto_id, lote_id, propietario_id, estado, origen, procedencia_id,
                                               desde_posicion_id, hasta_posicion_id, cantidad)
    values (v_id, v_lote.producto_id, v_lote.id, v_lote.propietario_id, v_estado, v_origen, v_proc, v_desde, v_hasta, v_cant);
  end loop;
  perform wms.registrar_audit('movimiento_ejecutado', 'ordenes_movimiento', v_id::text, null, p_lineas, p_motivo);
  return v_id;
end $$;

-- Quien verifica es otra persona: nunca quien ejecutó (D-15).
create or replace function wms._exigir_verificador(o wms.ordenes_movimiento) returns void
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if not wms.tiene_permiso('verificar') or not wms.tiene_rol('auxiliar', 'jefe_almacen', 'reemplazo_jefe') then
    raise exception 'Solo el personal de almacén verifica movimientos' using errcode = '42501';
  end if;
  if auth.uid() = o.ejecutor_id then raise exception 'El verificador no puede ser quien ejecutó el movimiento' using errcode = 'P0001'; end if;
end $$;

-- Revisión del verificador, línea por línea. p_revision = [{linea_id, resultado: 'COINCIDE' | 'DIFERENCIA', nota}].
-- Las líneas que coinciden se confirman JUNTAS en un solo movimiento del libro; cada línea con diferencia queda abierta (con su nota y su alerta)
-- y no frena a las demás. Nadie cuadra una cantidad: la línea con diferencia no mueve stock.
create or replace function wms.revisar_movimiento(p_orden uuid, p_revision jsonb)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  o wms.ordenes_movimiento;
  x jsonb;
  l wms.ordenes_movimiento_lineas;
  v_ok uuid[] := '{}';
  v_dif integer := 0;
  v_mov uuid;
  v_partidas jsonb;
  v_pend integer;
  v_cod text;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  select * into o from wms.ordenes_movimiento where id = p_orden for update;
  if not found then raise exception 'No encontramos ese movimiento' using errcode = 'P0001'; end if;
  if o.estado <> 'EJECUTADO' then raise exception 'El movimiento todavía no se movió o ya no está por verificar' using errcode = 'P0001'; end if;
  perform wms._exigir_verificador(o);
  if p_revision is null or jsonb_typeof(p_revision) <> 'array' then raise exception 'Falta la revisión de las líneas' using errcode = 'P0001'; end if;
  -- Todas las líneas por verificar necesitan una decisión (ni una de más, ni una de menos).
  select count(*) into v_pend from wms.ordenes_movimiento_lineas where orden_id = p_orden and verificacion = 'PENDIENTE';
  if v_pend <> jsonb_array_length(p_revision) then
    raise exception 'Revisa las % líneas por verificar: cada una necesita decir si coincide o qué no coincide', v_pend using errcode = 'P0001';
  end if;
  for x in select * from jsonb_array_elements(p_revision) loop
    select * into l from wms.ordenes_movimiento_lineas where id = (x->>'linea_id')::uuid and orden_id = p_orden for update;
    if not found or l.verificacion <> 'PENDIENTE' then raise exception 'Una de las líneas no está por verificar' using errcode = 'P0001'; end if;
    if x->>'resultado' = 'COINCIDE' then
      v_ok := v_ok || l.id;
    elsif x->>'resultado' = 'DIFERENCIA' then
      if nullif(trim(x->>'nota'), '') is null then
        raise exception 'Cuéntanos qué no coincide (producto, lote, cantidad o ubicación)' using errcode = 'P0001';
      end if;
    else
      raise exception 'Cada línea coincide o tiene una diferencia' using errcode = 'P0001';
    end if;
  end loop;

  update wms.ordenes_movimiento set verificador_id = auth.uid(), verificado_en = now() where id = p_orden;

  if cardinality(v_ok) > 0 then
    select jsonb_agg(p order by ord, lid) into v_partidas from (
      select 1 as ord, id as lid, jsonb_build_object('posicion_id', desde_posicion_id, 'producto_id', producto_id, 'lote_id', lote_id,
               'propietario_id', propietario_id, 'estado', estado, 'origen', origen, 'procedencia_id', procedencia_id, 'delta', -cantidad) as p
        from wms.ordenes_movimiento_lineas where id = any (v_ok)
      union all
      select 2, id, jsonb_build_object('posicion_id', hasta_posicion_id, 'producto_id', producto_id, 'lote_id', lote_id,
               'propietario_id', propietario_id, 'estado', estado, 'origen', origen, 'procedencia_id', procedencia_id, 'delta', cantidad)
        from wms.ordenes_movimiento_lineas where id = any (v_ok)) t;
    perform set_config('wms.orden_ctx', jsonb_build_object('orden', p_orden)::text, true);
    v_mov := wms.postear_movimiento('MOVIMIENTO', o.motivo, v_partidas, 'orden_movimiento', o.numero);
    perform set_config('wms.orden_ctx', '', true);
    update wms.ordenes_movimiento_lineas set verificacion = 'CONFIRMADA', verificador_id = auth.uid(), verificada_en = now(), movimiento_id = v_mov where id = any (v_ok);
  end if;

  for x in select * from jsonb_array_elements(p_revision) where value->>'resultado' = 'DIFERENCIA' loop
    v_dif := v_dif + 1;
    update wms.ordenes_movimiento_lineas set verificacion = 'CON_DIFERENCIA', nota_diferencia = trim(x->>'nota'), verificador_id = auth.uid(), verificada_en = now()
     where id = (x->>'linea_id')::uuid returning * into l;
    select lt.codigo into v_cod from wms.lotes lt where lt.id = l.lote_id;
    perform wms._alertar('MOVIMIENTO_CON_DIFERENCIA', 'jefe_almacen', null, l.producto_id, 'mov-dif:' || l.id,
      format('En el movimiento %s la línea del lote %s no coincide con lo que dice el sistema: %s. Esa línea sigue abierta; las demás ya se confirmaron. No cambies cantidades para que «cuadre».', o.numero, v_cod, trim(x->>'nota')), v_cod);
  end loop;

  update wms.ordenes_movimiento set estado = case when v_dif > 0 then 'CON_DIFERENCIA' else 'CONFIRMADO' end,
         movimiento_id = coalesce(v_mov, movimiento_id), nota_diferencia = case when v_dif > 0 then 'Hay ' || v_dif || ' línea(s) con diferencia' end
   where id = p_orden;
  perform wms.registrar_audit('movimiento_revisado', 'ordenes_movimiento', p_orden::text, null,
    jsonb_build_object('confirmadas', cardinality(v_ok), 'con_diferencia', v_dif), null);
  return v_mov;
end $$;

-- Atajo: «todo coincide» (equivale a revisar todas las líneas por verificar como conformes).
create or replace function wms.confirmar_movimiento(p_orden uuid)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_rev jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('linea_id', id, 'resultado', 'COINCIDE')), '[]'::jsonb) into v_rev
    from wms.ordenes_movimiento_lineas where orden_id = p_orden and verificacion = 'PENDIENTE';
  return wms.revisar_movimiento(p_orden, v_rev);
end $$;

-- El Jefe resuelve una LÍNEA con diferencia: se vuelve a mover (REINTENTAR) o se anula esa línea. El resto de la orden no se toca.
create or replace function wms.resolver_movimiento(p_linea uuid, p_accion text, p_nota text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  l wms.ordenes_movimiento_lineas;
  o wms.ordenes_movimiento;
  v_hay_dif boolean; v_hay_pend boolean; v_hay_ok boolean;
begin
  perform wms._exigir_jefe();
  select * into l from wms.ordenes_movimiento_lineas where id = p_linea for update;
  if not found then raise exception 'No encontramos esa línea' using errcode = 'P0001'; end if;
  select * into o from wms.ordenes_movimiento where id = l.orden_id for update;
  if l.verificacion <> 'CON_DIFERENCIA' then raise exception 'Esta línea no tiene una diferencia abierta' using errcode = 'P0001'; end if;
  if nullif(trim(p_nota), '') is null then raise exception 'Cuéntanos qué se encontró y qué se decidió' using errcode = 'P0001'; end if;
  if p_accion = 'REINTENTAR' then
    update wms.ordenes_movimiento_lineas set verificacion = 'PENDIENTE', nota_diferencia = null, verificador_id = null, verificada_en = null where id = p_linea;
  elsif p_accion = 'ANULAR' then
    update wms.ordenes_movimiento_lineas set verificacion = 'ANULADA', nota_diferencia = trim(p_nota) where id = p_linea;
  else
    raise exception 'Acción desconocida' using errcode = 'P0001';
  end if;
  update wms.alertas set estado = 'ATENDIDA', atendida_por = auth.uid(), atendida_en = now(), nota_atencion = trim(p_nota)
   where clave = 'mov-dif:' || p_linea and estado = 'ABIERTA';
  select exists (select 1 from wms.ordenes_movimiento_lineas where orden_id = o.id and verificacion = 'CON_DIFERENCIA'),
         exists (select 1 from wms.ordenes_movimiento_lineas where orden_id = o.id and verificacion = 'PENDIENTE'),
         exists (select 1 from wms.ordenes_movimiento_lineas where orden_id = o.id and verificacion = 'CONFIRMADA')
    into v_hay_dif, v_hay_pend, v_hay_ok;
  if v_hay_dif then
    null;                                           -- quedan diferencias por resolver
  elsif v_hay_pend then
    -- Las líneas reintentadas se vuelven a mover y las verifica otra revisión (distinta del ejecutor); las confirmadas no se tocan.
    update wms.ordenes_movimiento set estado = 'EJECUTADO', verificador_id = null, verificado_en = null, nota_diferencia = null where id = o.id;
  elsif v_hay_ok then
    update wms.ordenes_movimiento set estado = 'CONFIRMADO', nota_diferencia = null where id = o.id;
  else
    update wms.ordenes_movimiento set estado = 'ANULADO', anulado_por = auth.uid(), anulado_en = now(), motivo_anulacion = trim(p_nota) where id = o.id;
  end if;
  perform wms.registrar_audit('movimiento_diferencia_resuelta', 'ordenes_movimiento', o.id::text, null, jsonb_build_object('linea', p_linea, 'accion', p_accion), p_nota);
end $$;

create or replace function wms.anular_movimiento(p_orden uuid, p_motivo text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare o wms.ordenes_movimiento;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  select * into o from wms.ordenes_movimiento where id = p_orden for update;
  if not found then raise exception 'No encontramos ese movimiento' using errcode = 'P0001'; end if;
  if o.estado <> 'EJECUTADO' or exists (select 1 from wms.ordenes_movimiento_lineas where orden_id = p_orden and verificacion <> 'PENDIENTE') then
    raise exception 'Solo se anula un movimiento que todavía no se verificó' using errcode = 'P0001';
  end if;
  if auth.uid() <> o.ejecutor_id and not wms.tiene_rol('jefe_almacen', 'reemplazo_jefe') then
    raise exception 'Solo quien lo ejecutó o el Jefe de Almacén lo anula' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Cuéntanos por qué se anula' using errcode = 'P0001'; end if;
  update wms.ordenes_movimiento set estado = 'ANULADO', anulado_por = auth.uid(), anulado_en = now(), motivo_anulacion = trim(p_motivo) where id = p_orden;
  perform wms.registrar_audit('movimiento_anulado', 'ordenes_movimiento', p_orden::text, null, null, p_motivo);
end $$;

-- Un movimiento ejecutado que lleva más de N horas sin verificar (parámetro, 24 por defecto) avisa al Jefe de Almacén. Una alerta por movimiento.
create or replace function wms.revisar_movimientos_sin_verificar() returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  r record; v_n int := 0;
  v_horas numeric := coalesce((select valor::numeric from wms.parametros where clave = 'movimiento_sin_verificar_horas'), 24);
begin
  if not wms.es_usuario() then raise exception 'Sin permiso' using errcode = '42501'; end if;
  for r in
    select o.id, o.numero, o.ejecutado_en,
           (select count(*) from wms.ordenes_movimiento_lineas l where l.orden_id = o.id and l.verificacion = 'PENDIENTE') as pendientes
      from wms.ordenes_movimiento o
     where o.estado = 'EJECUTADO' and o.ejecutado_en < now() - make_interval(secs => v_horas * 3600)
       and exists (select 1 from wms.ordenes_movimiento_lineas l where l.orden_id = o.id and l.verificacion = 'PENDIENTE')
  loop
    perform wms._alertar('MOVIMIENTO_SIN_VERIFICAR', 'jefe_almacen', null, null, 'mov-sin-verificar:' || r.id,
      format('El movimiento %s lleva más de %s horas sin verificar (%s líneas pendientes). Sus unidades siguen reservadas y en tránsito: pide a otra persona que lo verifique.',
             r.numero, trim(to_char(v_horas, 'FM999990.##')), r.pendientes));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

grant execute on function
  wms.ejecutar_movimiento(jsonb, text, text), wms.confirmar_movimiento(uuid), wms.revisar_movimientos_sin_verificar(),
  wms.revisar_movimiento(uuid, jsonb), wms.resolver_movimiento(uuid, text, text), wms.anular_movimiento(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Conteos cíclicos (INV-05) y ajustes autorizados
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.conteos (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,                    -- CT-AAAA-NNNNN
  estado text not null default 'PROGRAMADO'
    check (estado in ('PROGRAMADO', 'EN_CONTEO', 'POR_RECONTAR', 'EN_REVISION', 'CERRADO')),
  nota text,
  programado_por uuid not null,
  programado_en timestamptz not null default now(),
  cerrado_por uuid,
  cerrado_en timestamptz,
  causa text,
  accion text,
  resultado text check (resultado is null or resultado in ('COINCIDE', 'CORREGIDO', 'ESCALADO')),
  check (estado <> 'CERRADO' or (cerrado_por is not null and resultado is not null))
);
alter table wms.conteos enable row level security;

create table if not exists wms.conteo_lineas (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references wms.conteos(id),
  posicion_id uuid not null references wms.posiciones(id),
  producto_id uuid not null,
  lote_id uuid not null references wms.lotes(id),
  propietario_id uuid not null references wms.propietarios(id),
  estado text not null references wms.estados_sanitarios(codigo),
  origen text not null references wms.origenes(codigo),
  procedencia_id uuid not null,
  cantidad_sistema integer not null check (cantidad_sistema >= 0),   -- OCULTA al contador (solo se lee por wms.conteo_lineas_para)
  conteo1 integer check (conteo1 is null or conteo1 >= 0),
  contador1_id uuid,
  conteo1_en timestamptz,
  conteo2 integer check (conteo2 is null or conteo2 >= 0),
  contador2_id uuid,
  conteo2_en timestamptz,
  resultado text check (resultado is null or resultado in
    ('COINCIDE', 'COINCIDE_EN_RECONTEO', 'DIFERENCIA_CONFIRMADA', 'NO_CONCLUYENTE', 'AJUSTADA', 'ESCALADA')),
  causa text,
  nota text,
  -- El segundo conteo lo hace otra persona (INV-05, paso 6).
  check (contador2_id is null or contador2_id <> contador1_id)
);
alter table wms.conteo_lineas enable row level security;
create index if not exists conteo_lineas_conteo_idx on wms.conteo_lineas (conteo_id);
create index if not exists conteo_lineas_pos_idx on wms.conteo_lineas (posicion_id);

create table if not exists wms.ajustes_inventario (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,                    -- AJ-AAAA-NNNNN
  conteo_linea_id uuid not null references wms.conteo_lineas(id),
  delta integer not null check (delta <> 0),
  causa text not null check (nullif(trim(causa), '') is not null),
  motivo text not null check (nullif(trim(motivo), '') is not null),
  estado text not null default 'PROPUESTO' check (estado in ('PROPUESTO', 'AUTORIZADO', 'RECHAZADO')),
  propuesto_por uuid not null,
  propuesto_en timestamptz not null default now(),
  decidido_por uuid,
  decidido_en timestamptz,
  nota_decision text,
  movimiento_id uuid references wms.movimientos(id),
  check (decidido_por is null or decidido_por <> propuesto_por)
);
alter table wms.ajustes_inventario enable row level security;
create unique index if not exists ajustes_una_propuesta_abierta on wms.ajustes_inventario (conteo_linea_id) where estado in ('PROPUESTO', 'AUTORIZADO');

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'conteos' and policyname = 'lectura') then
    create policy lectura on wms.conteos for select to authenticated using (wms.es_usuario());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'ajustes_inventario' and policyname = 'lectura') then
    create policy lectura on wms.ajustes_inventario for select to authenticated using (wms.es_usuario());
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'pausa_por_conteo' and tgrelid = to_regclass('wms.partidas') and not tgisinternal) then
    create trigger pausa_por_conteo before insert on wms.partidas for each row execute function wms.trg_pausa_por_conteo();
  end if;
end $$;
-- conteo_lineas NO tiene policy de lectura: el saldo del sistema no se le muestra al contador (solo por wms.conteo_lineas_para).
grant select on wms.conteos, wms.ajustes_inventario to authenticated;

create or replace function wms.programar_conteo(p_posiciones uuid[], p_nota text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_anio text := to_char(now(), 'YYYY'); v_n integer; v_pos text;
begin
  perform wms._exigir_jefe();
  if p_posiciones is null or cardinality(p_posiciones) = 0 then
    raise exception 'Elige al menos una ubicación para contar' using errcode = 'P0001';
  end if;
  select ps.codigo into v_pos from wms.conteo_lineas l join wms.conteos c on c.id = l.conteo_id join wms.posiciones ps on ps.id = l.posicion_id
   where l.posicion_id = any (p_posiciones) and c.estado <> 'CERRADO' limit 1;
  if v_pos is not null then raise exception 'La ubicación % ya está en otro conteo abierto', v_pos using errcode = 'P0001'; end if;
  if exists (select 1 from wms.ordenes_movimiento_lineas ml join wms.ordenes_movimiento o on o.id = ml.orden_id
              where o.estado in ('EJECUTADO', 'CON_DIFERENCIA') and ml.verificacion in ('PENDIENTE', 'CON_DIFERENCIA')
                and (ml.desde_posicion_id = any (p_posiciones) or ml.hasta_posicion_id = any (p_posiciones))) then
    raise exception 'Hay movimientos abiertos en esas ubicaciones: ciérralos antes de contar' using errcode = 'P0001';
  end if;
  insert into wms.conteos (id, numero, nota, programado_por)
  values (v_id, 'CT-' || v_anio || '-' || lpad(wms.siguiente_correlativo('CT-' || v_anio)::text, 5, '0'), nullif(trim(p_nota), ''), auth.uid());
  insert into wms.conteo_lineas (conteo_id, posicion_id, producto_id, lote_id, propietario_id, estado, origen, procedencia_id, cantidad_sistema)
  select v_id, s.posicion_id, s.producto_id, s.lote_id, s.propietario_id, s.estado,
         coalesce((select p.origen from wms.partidas p where p.procedencia_id = s.procedencia_id and p.lote_id = s.lote_id order by p.id limit 1), 'CARGA_INICIAL'),
         s.procedencia_id, s.cantidad
    from wms.saldos s where s.posicion_id = any (p_posiciones) and s.cantidad > 0;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Esas ubicaciones no tienen unidades para contar' using errcode = 'P0001'; end if;
  perform wms.registrar_audit('conteo_programado', 'conteos', v_id::text, null, jsonb_build_object('posiciones', p_posiciones, 'lineas', v_n), p_nota);
  return v_id;
end $$;

-- Lo que ve cada persona: el contador ve producto, lote, vencimiento y ubicación, NUNCA el saldo ni el conteo de otro.
-- El Jefe de Almacén, Dirección Técnica y administración ven el saldo recién cuando el primer conteo de esa línea terminó.
create or replace function wms.conteo_lineas_para(p_conteo uuid)
returns table (
  linea_id uuid, posicion text, producto_id uuid, producto text, lote text, vence date, propietario text, estado text,
  mi_conteo integer, conteo1 integer, conteo2 integer, cantidad_sistema integer, resultado text, causa text, nota text,
  puede_contar boolean, hay_ajuste text)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_gestiona boolean;
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  v_gestiona := wms.tiene_rol('jefe_almacen', 'reemplazo_jefe', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura');
  return query
  select l.id, ps.codigo, l.producto_id, p.codigo || ' · ' || p.descripcion, lt.codigo, lt.vence, o.codigo, l.estado,
         case when l.contador1_id = auth.uid() then l.conteo1 when l.contador2_id = auth.uid() then l.conteo2 end,
         case when v_gestiona then l.conteo1 end, case when v_gestiona then l.conteo2 end,
         case when v_gestiona and l.conteo1 is not null then l.cantidad_sistema end,
         l.resultado, case when v_gestiona then l.causa end, case when v_gestiona then l.nota end,
         (c.estado <> 'CERRADO' and wms.tiene_permiso('ejecutar')
          and ((l.conteo1 is null) or (l.conteo2 is null and l.conteo1 <> l.cantidad_sistema and l.contador1_id <> auth.uid()))),
         (select a.estado from wms.ajustes_inventario a where a.conteo_linea_id = l.id order by a.propuesto_en desc limit 1)
    from wms.conteo_lineas l
    join wms.conteos c on c.id = l.conteo_id
    join wms.posiciones ps on ps.id = l.posicion_id
    join catalogo.productos p on p.id = l.producto_id
    join wms.lotes lt on lt.id = l.lote_id
    join wms.propietarios o on o.id = l.propietario_id
   where l.conteo_id = p_conteo
   order by ps.codigo, lt.codigo;
end $$;

create or replace function wms._avanzar_conteo(p_conteo uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_sin1 integer; v_sin2 integer;
begin
  select count(*) filter (where conteo1 is null), count(*) filter (where conteo1 is not null and conteo1 <> cantidad_sistema and conteo2 is null)
    into v_sin1, v_sin2 from wms.conteo_lineas where conteo_id = p_conteo;
  update wms.conteos set estado = case when v_sin1 > 0 then 'EN_CONTEO' when v_sin2 > 0 then 'POR_RECONTAR' else 'EN_REVISION' end
   where id = p_conteo and estado <> 'CERRADO';
end $$;

create or replace function wms.registrar_conteo(p_linea uuid, p_cantidad integer)
returns text language plpgsql security definer set search_path = wms, pg_temp as $$
declare l wms.conteo_lineas; c wms.conteos; v_res text; v_cod text; v_lote text;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_permiso('ejecutar') then raise exception 'No tienes permiso para contar' using errcode = '42501'; end if;
  if p_cantidad is null or p_cantidad < 0 then raise exception 'Cuenta las unidades reales (0 o más)' using errcode = 'P0001'; end if;
  select * into l from wms.conteo_lineas where id = p_linea for update;
  if not found then raise exception 'No encontramos esa línea del conteo' using errcode = 'P0001'; end if;
  select * into c from wms.conteos where id = l.conteo_id;
  if c.estado = 'CERRADO' then raise exception 'Este conteo ya está cerrado' using errcode = 'P0001'; end if;
  if l.conteo1 is null then
    update wms.conteo_lineas set conteo1 = p_cantidad, contador1_id = auth.uid(), conteo1_en = now(),
           resultado = case when p_cantidad = l.cantidad_sistema then 'COINCIDE' end
     where id = p_linea;
    v_res := case when p_cantidad = l.cantidad_sistema then 'COINCIDE' else 'PENDIENTE_RECONTEO' end;
  elsif l.conteo2 is null and l.conteo1 <> l.cantidad_sistema then
    if l.contador1_id = auth.uid() then raise exception 'El segundo conteo lo hace otra persona' using errcode = 'P0001'; end if;
    v_res := case when p_cantidad = l.cantidad_sistema then 'COINCIDE_EN_RECONTEO' when p_cantidad = l.conteo1 then 'DIFERENCIA_CONFIRMADA' else 'NO_CONCLUYENTE' end;
    update wms.conteo_lineas set conteo2 = p_cantidad, contador2_id = auth.uid(), conteo2_en = now(), resultado = v_res where id = p_linea;
    if v_res in ('DIFERENCIA_CONFIRMADA', 'NO_CONCLUYENTE') then
      select p.codigo, lt.codigo into v_cod, v_lote from catalogo.productos p, wms.lotes lt where p.id = l.producto_id and lt.id = l.lote_id;
      perform wms._alertar('CONTEO_CON_DIFERENCIA', 'jefe_almacen', null, l.producto_id, 'ct-dif:' || p_linea,
        format('El conteo %s tiene una diferencia en %s lote %s. Busca la causa antes de corregir; no cambies una cantidad solo para que coincida.', c.numero, v_cod, v_lote), v_lote);
    end if;
  else
    raise exception 'Esta línea ya no necesita más conteos' using errcode = 'P0001';
  end if;
  perform wms._avanzar_conteo(l.conteo_id);
  return v_res;
end $$;

create or replace function wms.registrar_causa_conteo(p_linea uuid, p_causa text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare l wms.conteo_lineas;
begin
  perform wms._exigir_jefe();
  select * into l from wms.conteo_lineas where id = p_linea for update;
  if not found then raise exception 'No encontramos esa línea del conteo' using errcode = 'P0001'; end if;
  if l.resultado not in ('DIFERENCIA_CONFIRMADA', 'NO_CONCLUYENTE') then raise exception 'Esa línea no tiene una diferencia por explicar' using errcode = 'P0001'; end if;
  if nullif(trim(p_causa), '') is null then raise exception 'Escribe la causa encontrada' using errcode = 'P0001'; end if;
  update wms.conteo_lineas set causa = trim(p_causa) where id = p_linea;
end $$;

create or replace function wms.proponer_ajuste(p_linea uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare l wms.conteo_lineas; v_id uuid := gen_random_uuid(); v_anio text := to_char(now(), 'YYYY'); c wms.conteos;
begin
  perform wms._exigir_jefe();
  select * into l from wms.conteo_lineas where id = p_linea for update;
  if not found then raise exception 'No encontramos esa línea del conteo' using errcode = 'P0001'; end if;
  if l.resultado <> 'DIFERENCIA_CONFIRMADA' then
    raise exception 'Solo se propone un ajuste cuando dos personas confirman la misma diferencia' using errcode = 'P0001';
  end if;
  if nullif(trim(l.causa), '') is null then raise exception 'Registra primero la causa de la diferencia' using errcode = 'P0001'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Cuéntanos qué acción se toma' using errcode = 'P0001'; end if;
  select * into c from wms.conteos where id = l.conteo_id;
  insert into wms.ajustes_inventario (id, numero, conteo_linea_id, delta, causa, motivo, propuesto_por)
  values (v_id, 'AJ-' || v_anio || '-' || lpad(wms.siguiente_correlativo('AJ-' || v_anio)::text, 5, '0'), p_linea, l.conteo2 - l.cantidad_sistema, l.causa, trim(p_motivo), auth.uid());
  perform wms._alertar('AJUSTE_POR_AUTORIZAR', 'direccion_tecnica', null, l.producto_id, 'aj:' || v_id,
    format('El conteo %s propone un ajuste de %s unidades. Causa: %s. Necesita tu autorización.', c.numero, l.conteo2 - l.cantidad_sistema, l.causa), null);
  perform wms.registrar_audit('ajuste_propuesto', 'ajustes_inventario', v_id::text, null, jsonb_build_object('delta', l.conteo2 - l.cantidad_sistema), p_motivo);
  return v_id;
end $$;

create or replace function wms.decidir_ajuste(p_ajuste uuid, p_decision text, p_nota text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare a wms.ajustes_inventario; l wms.conteo_lineas; c wms.conteos; v_mov uuid;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_rol('direccion_tecnica') or not wms.tiene_permiso('ajustar') then
    raise exception 'Solo Dirección Técnica autoriza ajustes' using errcode = '42501';
  end if;
  select * into a from wms.ajustes_inventario where id = p_ajuste for update;
  if not found then raise exception 'No encontramos ese ajuste' using errcode = 'P0001'; end if;
  if a.estado <> 'PROPUESTO' then raise exception 'Este ajuste ya fue decidido' using errcode = 'P0001'; end if;
  if a.propuesto_por = auth.uid() then raise exception 'Quien propone un ajuste no lo autoriza' using errcode = 'P0001'; end if;
  select * into l from wms.conteo_lineas where id = a.conteo_linea_id for update;
  select * into c from wms.conteos where id = l.conteo_id;
  if p_decision = 'AUTORIZAR' then
    v_mov := wms.postear_movimiento('AJUSTE', 'Ajuste ' || a.numero || ' — ' || a.causa,
      jsonb_build_array(jsonb_build_object('posicion_id', l.posicion_id, 'producto_id', l.producto_id, 'lote_id', l.lote_id,
        'propietario_id', l.propietario_id, 'estado', l.estado, 'origen', l.origen, 'procedencia_id', l.procedencia_id, 'delta', a.delta)),
      'conteo', c.numero, 'ajuste', a.numero);
    update wms.ajustes_inventario set estado = 'AUTORIZADO', decidido_por = auth.uid(), decidido_en = now(), nota_decision = nullif(trim(p_nota), ''), movimiento_id = v_mov where id = p_ajuste;
    update wms.conteo_lineas set resultado = 'AJUSTADA' where id = l.id;
  elsif p_decision = 'RECHAZAR' then
    if nullif(trim(p_nota), '') is null then raise exception 'Cuéntanos por qué no se autoriza' using errcode = 'P0001'; end if;
    update wms.ajustes_inventario set estado = 'RECHAZADO', decidido_por = auth.uid(), decidido_en = now(), nota_decision = trim(p_nota) where id = p_ajuste;
    update wms.conteo_lineas set resultado = 'ESCALADA', nota = trim(p_nota) where id = l.id;
  else
    raise exception 'Decisión desconocida' using errcode = 'P0001';
  end if;
  update wms.alertas set estado = 'ATENDIDA', atendida_por = auth.uid(), atendida_en = now() where clave = 'aj:' || p_ajuste and estado = 'ABIERTA';
  perform wms.registrar_audit('ajuste_' || lower(p_decision), 'ajustes_inventario', p_ajuste::text, null, null, p_nota);
end $$;

create or replace function wms.escalar_linea_conteo(p_linea uuid, p_nota text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare l wms.conteo_lineas;
begin
  perform wms._exigir_jefe();
  select * into l from wms.conteo_lineas where id = p_linea for update;
  if not found then raise exception 'No encontramos esa línea del conteo' using errcode = 'P0001'; end if;
  if l.resultado not in ('DIFERENCIA_CONFIRMADA', 'NO_CONCLUYENTE') then raise exception 'Esa línea no tiene una diferencia sin explicar' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.ajustes_inventario where conteo_linea_id = p_linea and estado = 'PROPUESTO') then
    raise exception 'Esa línea tiene un ajuste esperando la decisión de Dirección Técnica' using errcode = 'P0001';
  end if;
  if nullif(trim(p_nota), '') is null then raise exception 'Adjunta lo que revisaste: qué se descartó y qué evidencia hay' using errcode = 'P0001'; end if;
  update wms.conteo_lineas set resultado = 'ESCALADA', nota = trim(p_nota) where id = p_linea;
  perform wms.registrar_audit('conteo_linea_escalada', 'conteo_lineas', p_linea::text, null, null, p_nota);
end $$;

create or replace function wms.cerrar_conteo(p_conteo uuid, p_causa text, p_accion text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare c wms.conteos; v_pend integer; v_ajustadas integer; v_escaladas integer; v_res text;
begin
  perform wms._exigir_jefe();
  select * into c from wms.conteos where id = p_conteo for update;
  if not found then raise exception 'No encontramos ese conteo' using errcode = 'P0001'; end if;
  if c.estado = 'CERRADO' then raise exception 'Este conteo ya está cerrado' using errcode = 'P0001'; end if;
  select count(*) filter (where resultado is null or resultado in ('DIFERENCIA_CONFIRMADA', 'NO_CONCLUYENTE')),
         count(*) filter (where resultado = 'AJUSTADA'), count(*) filter (where resultado = 'ESCALADA')
    into v_pend, v_ajustadas, v_escaladas from wms.conteo_lineas where conteo_id = p_conteo;
  if v_pend > 0 then
    raise exception 'Quedan % líneas sin resolver: cuéntalas, explica la causa y corrige, ajusta con autorización o escálalas', v_pend using errcode = 'P0001';
  end if;
  v_res := case when v_escaladas > 0 then 'ESCALADO' when v_ajustadas > 0 then 'CORREGIDO' else 'COINCIDE' end;
  if v_res <> 'COINCIDE' and (nullif(trim(p_causa), '') is null or nullif(trim(p_accion), '') is null) then
    raise exception 'Registra la causa y la acción para cerrar un conteo con diferencias' using errcode = 'P0001';
  end if;
  update wms.conteos set estado = 'CERRADO', cerrado_por = auth.uid(), cerrado_en = now(), resultado = v_res,
         causa = nullif(trim(p_causa), ''), accion = nullif(trim(p_accion), '') where id = p_conteo;
  perform wms.registrar_audit('conteo_cerrado', 'conteos', p_conteo::text, null, jsonb_build_object('resultado', v_res), p_accion);
end $$;

grant execute on function
  wms.programar_conteo(uuid[], text), wms.conteo_lineas_para(uuid), wms.registrar_conteo(uuid, integer),
  wms.registrar_causa_conteo(uuid, text), wms.proponer_ajuste(uuid, text), wms.decidir_ajuste(uuid, text, text),
  wms.escalar_linea_conteo(uuid, text), wms.cerrar_conteo(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Carga inicial (la hace administración; Dirección Técnica decide el estado del stock inicial: D-09)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.cargas_iniciales (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,                    -- CI-AAAA-NNNNN
  estado text not null default 'BORRADOR' check (estado in ('BORRADOR', 'CONFIRMADA', 'ANULADA')),
  nota text,
  creado_por uuid not null,
  creado_en timestamptz not null default now(),
  confirmado_por uuid,
  confirmado_en timestamptz,
  movimiento_id uuid references wms.movimientos(id)
);
alter table wms.cargas_iniciales enable row level security;
create table if not exists wms.cargas_iniciales_lineas (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references wms.cargas_iniciales(id),
  fila integer not null,
  producto_id uuid not null,
  lote_codigo text not null check (nullif(trim(lote_codigo), '') is not null),
  vence date,
  propietario_id uuid not null references wms.propietarios(id),
  posicion_id uuid not null references wms.posiciones(id),
  estado text not null references wms.estados_sanitarios(codigo),
  cantidad integer not null check (cantidad > 0)
);
alter table wms.cargas_iniciales_lineas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'cargas_iniciales' and policyname = 'lectura') then
    create policy lectura on wms.cargas_iniciales for select to authenticated using (wms.es_usuario());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'cargas_iniciales_lineas' and policyname = 'lectura') then
    create policy lectura on wms.cargas_iniciales_lineas for select to authenticated using (wms.es_usuario());
  end if;
end $$;
grant select on wms.cargas_iniciales, wms.cargas_iniciales_lineas to authenticated;

insert into wms.parametros (clave, valor, nota) values
  ('carga_inicial_estado', '', 'D-09: estado sanitario del stock inicial decidido por Dirección Técnica (vacío = sin decidir; la carga no se confirma)')
on conflict (clave) do nothing;

-- Vista previa (no escribe): qué filas están bien y cuáles no. p_lineas = [{producto, lote, vence, propietario, posicion, estado, cantidad}]
create or replace function wms.validar_carga_inicial(p_lineas jsonb)
returns table (fila integer, error text)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare x jsonb; i integer := 0; v_prod uuid; v_prop uuid; v_pos uuid; v_area text; v_estado text; v_cant integer; v_vence date;
begin
  if not wms.tiene_permiso('configurar') then raise exception 'No tienes permiso para la carga inicial' using errcode = '42501'; end if;
  for x in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    select id into v_prod from catalogo.productos where codigo = trim(x->>'producto');
    select id into v_prop from wms.propietarios where codigo = trim(x->>'propietario');
    select id, tipo_area into v_pos, v_area from wms.posiciones where codigo = trim(x->>'posicion');
    v_estado := upper(trim(x->>'estado'));
    begin v_cant := (x->>'cantidad')::integer; exception when others then v_cant := null; end;
    begin v_vence := nullif(trim(x->>'vence'), '')::date; exception when others then fila := i; error := 'La fecha de vencimiento no es válida'; return next; v_vence := null; end;
    if v_prod is null then fila := i; error := 'El producto «' || coalesce(x->>'producto', '') || '» no existe en el catálogo'; return next; end if;
    if v_prop is null then fila := i; error := 'El propietario «' || coalesce(x->>'propietario', '') || '» no existe'; return next; end if;
    if v_pos is null then fila := i; error := 'La ubicación «' || coalesce(x->>'posicion', '') || '» no existe'; return next; end if;
    if nullif(trim(x->>'lote'), '') is null then fila := i; error := 'Falta el lote'; return next; end if;
    if v_cant is null or v_cant <= 0 then fila := i; error := 'La cantidad debe ser un entero mayor que cero'; return next; end if;
    if not exists (select 1 from wms.estados_sanitarios where codigo = v_estado) then fila := i; error := 'El estado «' || coalesce(x->>'estado', '') || '» no existe'; return next;
    elsif v_pos is not null and not exists (select 1 from wms.area_estado_admitido where tipo_area = v_area and estado = v_estado and (origen_requerido is null or origen_requerido = 'CARGA_INICIAL')) then
      fila := i; error := 'La zona ' || v_area || ' no admite unidades en estado ' || v_estado; return next;
    end if;
    if v_pos is not null and v_prop is not null and not wms.posicion_acepta(v_pos, v_prop, current_date) then
      fila := i; error := 'La ubicación ' || (x->>'posicion') || ' no acepta stock de ese propietario'; return next;
    end if;
  end loop;
end $$;

create or replace function wms.crear_carga_inicial(p_lineas jsonb, p_nota text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_anio text := to_char(now(), 'YYYY'); v_errores integer; x jsonb; i integer := 0;
begin
  if not wms.tiene_permiso('configurar') then raise exception 'No tienes permiso para la carga inicial' using errcode = '42501'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El archivo no tiene filas' using errcode = 'P0001';
  end if;
  select count(*) into v_errores from wms.validar_carga_inicial(p_lineas);
  if v_errores > 0 then raise exception 'La carga tiene % filas con errores: corrígelas y vuelve a cargar', v_errores using errcode = 'P0001'; end if;
  insert into wms.cargas_iniciales (id, numero, nota, creado_por)
  values (v_id, 'CI-' || v_anio || '-' || lpad(wms.siguiente_correlativo('CI-' || v_anio)::text, 5, '0'), nullif(trim(p_nota), ''), auth.uid());
  for x in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    insert into wms.cargas_iniciales_lineas (carga_id, fila, producto_id, lote_codigo, vence, propietario_id, posicion_id, estado, cantidad)
    select v_id, i, (select id from catalogo.productos where codigo = trim(x->>'producto')), trim(x->>'lote'), nullif(trim(x->>'vence'), '')::date,
           (select id from wms.propietarios where codigo = trim(x->>'propietario')), (select id from wms.posiciones where codigo = trim(x->>'posicion')),
           upper(trim(x->>'estado')), (x->>'cantidad')::integer;
  end loop;
  perform wms.registrar_audit('carga_inicial_creada', 'cargas_iniciales', v_id::text, null, jsonb_build_object('filas', i), p_nota);
  return v_id;
end $$;

create or replace function wms.decidir_estado_carga_inicial(p_estado text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if auth.uid() is null or not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica decide el estado del stock inicial' using errcode = '42501';
  end if;
  if upper(trim(p_estado)) not in ('APROBADO', 'CUARENTENA') then
    raise exception 'El stock inicial se carga como Aprobado o como Cuarentena (lo rechazado se carga aparte, línea por línea)' using errcode = 'P0001';
  end if;
  update wms.parametros set valor = upper(trim(p_estado)) where clave = 'carga_inicial_estado';
  perform wms.registrar_audit('carga_inicial_estado_decidido', 'parametros', 'carga_inicial_estado', null, jsonb_build_object('estado', upper(trim(p_estado))), 'D-09');
end $$;

create or replace function wms.confirmar_carga_inicial(p_carga uuid)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  c wms.cargas_iniciales; v_dec text; v_partidas jsonb := '[]'::jsonb; r record; v_lote uuid; v_proc uuid; v_mov uuid;
begin
  if not wms.tiene_permiso('configurar') then raise exception 'No tienes permiso para la carga inicial' using errcode = '42501'; end if;
  select * into c from wms.cargas_iniciales where id = p_carga for update;
  if not found then raise exception 'No encontramos esa carga' using errcode = 'P0001'; end if;
  if c.estado <> 'BORRADOR' then raise exception 'Esta carga ya no está en borrador' using errcode = 'P0001'; end if;
  select valor into v_dec from wms.parametros where clave = 'carga_inicial_estado';
  if coalesce(v_dec, '') = '' then
    raise exception 'Falta la decisión de Dirección Técnica sobre el estado del stock inicial (D-09): la carga no se confirma sin ella' using errcode = 'P0001';
  end if;
  for r in select * from wms.cargas_iniciales_lineas where carga_id = p_carga order by fila loop
    if r.estado <> v_dec and r.estado <> 'BAJAS_RECHAZADOS' then
      raise exception 'La fila % está en estado %, pero Dirección Técnica decidió % para el stock inicial', r.fila, r.estado, v_dec using errcode = 'P0001';
    end if;
    v_lote := wms.asegurar_lote(r.producto_id, r.lote_codigo, r.vence, r.propietario_id);
    v_proc := r.id;
    v_partidas := v_partidas || jsonb_build_object('posicion_id', r.posicion_id, 'producto_id', r.producto_id, 'lote_id', v_lote,
      'propietario_id', r.propietario_id, 'estado', r.estado, 'origen', 'CARGA_INICIAL', 'procedencia_id', v_proc, 'delta', r.cantidad);
  end loop;
  v_mov := wms.postear_movimiento('CARGA_INICIAL', 'Carga inicial ' || c.numero, v_partidas, 'carga_inicial', c.numero);
  update wms.cargas_iniciales set estado = 'CONFIRMADA', confirmado_por = auth.uid(), confirmado_en = now(), movimiento_id = v_mov where id = p_carga;
  perform wms.registrar_audit('carga_inicial_confirmada', 'cargas_iniciales', p_carga::text, null, jsonb_build_object('filas', jsonb_array_length(v_partidas)), c.numero);
  return v_mov;
end $$;

grant execute on function
  wms.validar_carga_inicial(jsonb), wms.crear_carga_inicial(jsonb, text), wms.decidir_estado_carga_inicial(text), wms.confirmar_carga_inicial(uuid) to authenticated;

-- Ubicaciones que hoy no se pueden usar como origen ni destino: las que están en conteo (INV-05, paso 3).
-- Un movimiento abierto NO bloquea la ubicación: reserva solo sus unidades (disponible = saldo − reservado), para que otra persona
-- pueda mover el resto de lo que hay ahí. Lo inverso sí aplica: no se programa un conteo donde hay movimientos abiertos.
create or replace function wms.posiciones_bloqueadas()
returns table (posicion_id uuid, motivo text)
language sql stable security definer set search_path = wms, pg_temp as $$
  select distinct l.posicion_id, 'está en conteo ' || c.numero
    from wms.conteo_lineas l join wms.conteos c on c.id = l.conteo_id where c.estado <> 'CERRADO' and wms.es_usuario()
$$;
grant execute on function wms.posiciones_bloqueadas() to authenticated;
