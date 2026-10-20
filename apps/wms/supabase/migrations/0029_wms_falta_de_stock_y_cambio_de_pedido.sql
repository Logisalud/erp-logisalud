-- 0029 · WMS · Salidas · SA-3: cuando falta stock, cuando el pedido cambia y cuando se cancela
--
-- Pedido de Sebas (bloque «Salidas: cómo iniciar», sección 3). Decisiones D-123 a D-130 (docs/wms/decisiones-pendientes.md):
--   · Con falta de stock decide el VENDEDOR del pedido, en Pedidos (quitar o reducir la línea —lo que falta se cancela, sin pendientes— o cancelar el pedido).
--     El WMS no cambia cantidades de un pedido de Pedidos.
--   · `wms.explicar_faltante(linea)` dice POR QUÉ falta, por línea y con cantidades: sin stock / en Cuarentena / en Reserva / con vencimiento menor a 60 días.
--     La alerta STOCK_INSUFICIENTE usa ese texto (espejo de `domain/faltante.ts`, que una prueba compara).
--   · Cuando llega la versión nueva del pedido (o su cancelación), la Orden de Salida se actualiza sola: línea quitada → se cancela y libera sus reservas;
--     cantidad reducida → libera lo sobrante (primero lo que vence después, así lo que queda sigue siendo FEFO); línea agregada o aumentada → se asigna;
--     se recalcula la falta de stock. Un disparador sobre `pedidos_despacho` lo hace dentro de `registrar_importacion_pedidos` (que ahora también acepta
--     `estado = 'CANCELLED'` con `motivoCancelacion`). Auditoría y alertas en cada cambio.
--   · Con el picking ya iniciado, lo picado NO se libera solo: queda «por devolver a su ubicación» (`devoluciones_picking`). El auxiliar lo devuelve
--     (`ejecutar_devolucion_picking`: crea la orden de Movimientos internos DESPACHO → ubicación original, o solo la marca si aún estaba en el rack) y OTRA persona
--     lo verifica (`verificar_devolucion_picking` o la verificación normal del movimiento). Hasta entonces la orden no sigue (ni staging, ni guía, ni embalaje,
--     ni carga) y, si el pedido se canceló, no se cierra. Estado intermedio: `POR_DEVOLVER_PICKING` (derivado: hay devoluciones sin verificar).
--   · `wms.quiebres_stock` (append-only): cada faltante detectado y cada decisión del vendedor, con su causa, para el reporte futuro de quiebres de stock
--     (la vista `wms.v_quiebres_stock` ya queda lista; el reporte queda pendiente).
-- No cambia `crear_salida` (SA-2 la toca en la 0028). Re-ejecutable. Se aplica a mano, después de la 0028. Termina con el `revoke execute … from public`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Alertas nuevas y columnas
-- ─────────────────────────────────────────────────────────────────────────────

select wms._ampliar_check_in('wms.alertas', 'alertas_tipo_check', 'tipo', array['PEDIDO_CANCELADO', 'DEVOLUCION_PICKING']);

-- A cada línea de la orden se le anota de qué línea del pedido viene (para saber qué línea quitó, redujo o agregó Pedidos). Las órdenes que ya existían la
-- completan solas al llegar el primer cambio (por producto y cantidad). `cantidad_nueva`: la línea tiene lo picado por devolver y, al verificarse, quedará en
-- esa cantidad (0 = se quitó la línea).
alter table wms.salida_lineas add column if not exists pedido_linea_id text;
alter table wms.salida_lineas add column if not exists cantidad_nueva integer;
alter table wms.salidas add column if not exists motivo_cancelacion text;
alter table wms.salidas add column if not exists cancelada_en timestamptz;
alter table wms.salidas add column if not exists cancelacion_pendiente boolean not null default false;   -- Pedidos canceló y falta devolver lo picado

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tablas: devoluciones de lo picado y quiebres de stock
-- ─────────────────────────────────────────────────────────────────────────────

-- Cada reserva ya picada (EN_TRANSITO) o ya en Despacho (EN_STAGING) que un cambio o una cancelación del pedido dejó sin pedido: hay que devolverla a su ubicación
-- original con un movimiento verificado. La reserva sigue comprometida hasta que se verifica.
create table if not exists wms.devoluciones_picking (
  id uuid primary key default gen_random_uuid(),
  salida_id uuid not null references wms.salidas(id),
  linea_id uuid not null references wms.salida_lineas(id),
  reserva_id uuid not null references wms.reservas(id),
  cantidad integer not null check (cantidad > 0),
  estado_reserva text not null check (estado_reserva in ('EN_TRANSITO', 'EN_STAGING')),   -- dónde estaban las unidades al pedir la devolución
  desde_posicion_id uuid not null references wms.posiciones(id),
  hasta_posicion_id uuid not null references wms.posiciones(id),
  causa text not null check (causa in ('CAMBIO_PEDIDO', 'PEDIDO_CANCELADO')),
  pedido_version integer,
  estado text not null default 'POR_DEVOLVER' check (estado in ('POR_DEVOLVER', 'DEVUELTA', 'VERIFICADA')),
  orden_movimiento_id uuid references wms.ordenes_movimiento(id),
  orden_movimiento_linea_id uuid references wms.ordenes_movimiento_lineas(id),
  creada_por uuid,
  creada_en timestamptz not null default now(),
  devuelta_por uuid,
  devuelta_en timestamptz,
  verificada_por uuid,
  verificada_en timestamptz,
  check (verificada_por is null or verificada_por is distinct from devuelta_por)    -- D-15: quien devuelve no verifica
);
alter table wms.devoluciones_picking enable row level security;
create index if not exists devoluciones_picking_salida_idx on wms.devoluciones_picking (salida_id) where estado <> 'VERIFICADA';
create index if not exists devoluciones_picking_reserva_idx on wms.devoluciones_picking (reserva_id);
create index if not exists devoluciones_picking_mov_idx on wms.devoluciones_picking (orden_movimiento_id) where orden_movimiento_id is not null;

create table if not exists wms.quiebres_stock (
  id uuid primary key default gen_random_uuid(),
  salida_id uuid references wms.salidas(id),
  pedido_id text,
  pedido_numero text,
  linea_id uuid references wms.salida_lineas(id),
  producto_id uuid not null,
  cantidad_pedida integer not null,
  cantidad_faltante integer not null,        -- lo que faltaba de la línea en total
  cantidad_causa integer not null,           -- la parte que corresponde a esta causa (la suma por causa da el faltante)
  causa text not null check (causa in ('SIN_STOCK', 'CUARENTENA', 'RESERVA', 'VENCIMIENTO_MENOR_60',
                                       'CANCELADO_POR_VENDEDOR', 'LINEA_QUITADA_POR_VENDEDOR', 'LINEA_REDUCIDA_POR_VENDEDOR')),
  detalle jsonb not null default '{}'::jsonb,      -- las cantidades por causa, lo que existía y, si decidió el vendedor, su motivo y la versión del pedido
  origen text not null check (origen in ('DETECCION', 'PEDIDOS')),   -- el WMS detectó el faltante / Pedidos decidió (quitar, reducir, cancelar)
  vendedor text,
  creado_por uuid,
  creado_en timestamptz not null default now()
);
alter table wms.quiebres_stock enable row level security;
create index if not exists quiebres_stock_linea_idx on wms.quiebres_stock (linea_id, creado_en);
create index if not exists quiebres_stock_causa_idx on wms.quiebres_stock (causa, creado_en);

do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'quiebres_stock_inmutable' and tgrelid = 'wms.quiebres_stock'::regclass and not tgisinternal) then
    drop trigger quiebres_stock_inmutable on wms.quiebres_stock;
  end if;
end $$;
create trigger quiebres_stock_inmutable before update or delete on wms.quiebres_stock for each row execute function wms.trg_inmutable();

-- Lectura: quien trabaja las salidas y quien audita (el reporte futuro lo usa). Nadie escribe con DML directo: todo por funciones.
do $$ declare t text; begin
  foreach t in array array['devoluciones_picking', 'quiebres_stock'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then
      execute format('drop policy lectura on wms.%I', t);
    end if;
    execute format($p$create policy lectura on wms.%I for select to authenticated
      using (wms.es_usuario() and wms.tiene_rol('jefe_transporte', 'jefe_almacen', 'auxiliar', 'direccion_tecnica', 'asistente_dt', 'admin_wms', 'auditoria_lectura', 'conformidad_despacho'))$p$, t);
    execute format('revoke all on wms.%I from anon, authenticated', t);
    execute format('grant select on wms.%I to authenticated', t);
  end loop;
end $$;

create or replace view wms.v_quiebres_stock with (security_invoker = true) as
select q.id, q.creado_en, (q.creado_en at time zone 'America/Lima')::date as fecha, q.origen, q.causa,
       q.salida_id, s.numero as salida_numero, q.pedido_id, q.pedido_numero, q.linea_id,
       q.producto_id, p.codigo as producto_codigo, p.descripcion as producto,
       q.cantidad_pedida, q.cantidad_faltante, q.cantidad_causa, q.vendedor, q.detalle, q.creado_por
  from wms.quiebres_stock q
  left join wms.salidas s on s.id = q.salida_id
  left join catalogo.productos p on p.id = q.producto_id;
grant select on wms.v_quiebres_stock to authenticated;

-- «salida_movimientos» aprende un paso más: la devolución de lo que estaba en Despacho (resta de lo que pasó a staging, para que las invariantes sigan valiendo).
select wms._ampliar_check_in('wms.salida_movimientos', 'salida_movimientos_tipo_check', 'tipo', array['DEVOLUCION_PICKING']);

-- Las invariantes (0012, y la 0024 ya le restó la reversa de la conformidad) restan también la devolución de lo picado. Se agrega UNA línea sin tocar el resto
-- (así la 0024 sigue encontrando su texto si se vuelve a aplicar) y falla en voz alta si el texto esperado no está.
do $$
declare v_oid oid; v_def text; v_viejo text := E'  if v_st > v_cant then'; v_nuevo text;
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'trg_invariantes_salida_movimientos' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position('DEVOLUCION_PICKING' in v_def) > 0 then return; end if;     -- ya aplicada (re-ejecución)
  if position(v_viejo in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.trg_invariantes_salida_movimientos: %', v_viejo; end if;
  v_nuevo := E'  v_st := v_st - coalesce((select sum(cantidad) from wms.salida_movimientos where linea_id = new.linea_id and tipo = ''DEVOLUCION_PICKING''), 0);\n' || v_viejo;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

-- Un movimiento interno manual no entra ni sale de Despacho… salvo la devolución de lo picado que una orden de Salida pidió (SA-3): esa línea tiene su devolución.
create or replace function wms.trg_mover_no_toca_zonas_de_salida()
returns trigger language plpgsql set search_path = wms, pg_temp as $$
begin
  if exists (select 1 from wms.posiciones p where p.id in (new.desde_posicion_id, new.hasta_posicion_id) and p.tipo_area = 'DESPACHO') then
    if exists (select 1 from wms.devoluciones_picking d join wms.reservas r on r.id = d.reserva_id
                where d.orden_movimiento_id = new.orden_id and d.estado = 'DEVUELTA' and r.lote_id = new.lote_id
                  and d.desde_posicion_id = new.desde_posicion_id and d.hasta_posicion_id = new.hasta_posicion_id and d.cantidad = new.cantidad) then
      return new;
    end if;
    raise exception 'Despacho se usa solo en las salidas: no se mueve a mano' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. «Por qué falta»
-- ─────────────────────────────────────────────────────────────────────────────

-- Lo que la línea pide, lo que hay disponible hoy y, de lo que falta, cuánto es «en Cuarentena», «en Reserva», «con vencimiento menor a 60 días» y «sin stock».
-- Una unidad existente se clasifica una sola vez: Cuarentena → lote en Reserva → no apto por vencimiento → en conteo → disponible. Lo que falta se atribuye por ese
-- orden (Cuarentena, Reserva, vencimiento) y el resto es «sin stock». Mismo cálculo y mismo texto que `explicarFaltante` (domain/faltante.ts).
create or replace function wms._explicar_faltante(p_linea uuid, p_pedido integer default null) returns jsonb
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare
  l wms.salida_lineas; s wms.salidas; v_hoy date := wms._hoy_lima(); v_min integer; v_pedido integer;
  v_disp integer := 0; v_cuar integer := 0; v_res integer := 0; v_venc integer := 0; v_cont integer := 0;
  v_faltan integer; v_resto integer; v_a_cuar integer; v_a_res integer; v_a_venc integer; v_sin integer; v_partes text[] := array[]::text[]; v_lista text; v_n integer; v_texto text;
begin
  select * into l from wms.salida_lineas where id = p_linea;
  if not found then raise exception 'No encontramos esa línea' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = l.salida_id;
  v_min := case when s.tipo = 'DISTRIBUCION' then coalesce((select p.valor::integer from wms.parametros p where p.clave = 'vida_util_minima_venta_dias'), 60) else 0 end;
  v_pedido := coalesce(p_pedido, l.cantidad);

  select coalesce(sum(c.disponible) filter (where not wms.lote_bloqueado(c.lote_id) and a.apto and not c.en_conteo), 0)::integer,
         coalesce(sum(c.disponible) filter (where wms.lote_bloqueado(c.lote_id)), 0)::integer,
         coalesce(sum(c.disponible) filter (where not wms.lote_bloqueado(c.lote_id) and not a.apto), 0)::integer,
         coalesce(sum(c.disponible) filter (where not wms.lote_bloqueado(c.lote_id) and a.apto and c.en_conteo), 0)::integer
    into v_disp, v_res, v_venc, v_cont
    from wms._candidatos(s.propietario_id, l.producto_id) c
    cross join lateral wms._lote_apto(c.vence, s.tipo, s.motivo, v_hoy, v_min) a
   where c.disponible > 0 and (l.lote_indicado_id is null or c.lote_id = l.lote_indicado_id);

  select coalesce(sum(x.cantidad - wms._comprometido(x.posicion_id, x.lote_id, x.estado, x.procedencia_id)) filter (where x.cantidad - wms._comprometido(x.posicion_id, x.lote_id, x.estado, x.procedencia_id) > 0), 0)::integer
    into v_cuar
    from wms.saldos x
   where x.propietario_id = s.propietario_id and x.producto_id = l.producto_id and x.estado = 'CUARENTENA' and x.cantidad > 0
     and (l.lote_indicado_id is null or x.lote_id = l.lote_indicado_id);

  v_faltan := greatest(0, v_pedido - v_disp);
  v_resto := v_faltan;
  v_a_cuar := least(v_resto, v_cuar); v_resto := v_resto - v_a_cuar;
  v_a_res := least(v_resto, v_res); v_resto := v_resto - v_a_res;
  v_a_venc := least(v_resto, v_venc); v_resto := v_resto - v_a_venc;
  v_sin := v_resto;

  if v_a_cuar > 0 then v_partes := v_partes || (v_a_cuar || ' en Cuarentena'); end if;
  if v_a_res > 0 then v_partes := v_partes || (v_a_res || ' en Reserva'); end if;
  if v_a_venc > 0 then v_partes := v_partes || (v_a_venc || ' con vencimiento menor a 60 días'); end if;
  if v_sin > 0 then v_partes := v_partes || (v_sin || ' sin stock'); end if;
  v_n := coalesce(array_length(v_partes, 1), 0);
  v_lista := case when v_n <= 1 then coalesce(v_partes[1], '')
                  else array_to_string(v_partes[1:v_n - 1], ', ') || ' y ' || v_partes[v_n] end;
  v_texto := case when v_faltan <= 0 then format('Hay stock suficiente: pide %s y hay %s disponibles.', v_pedido, v_disp)
                  else format('Stock insuficiente: pide %s y hay %s disponibles. Faltan %s: %s.', v_pedido, v_disp, v_faltan, v_lista)
                       || case when v_cont > 0 then format(' Hay %s en ubicaciones en conteo: no se usan hasta cerrar el conteo.', v_cont) else '' end end;
  return jsonb_build_object('pedido', v_pedido, 'disponibles', v_disp, 'faltan', v_faltan,
    'causas', jsonb_build_object('SIN_STOCK', v_sin, 'CUARENTENA', v_a_cuar, 'RESERVA', v_a_res, 'VENCIMIENTO_MENOR_60', v_a_venc),
    'existentes', jsonb_build_object('cuarentena', v_cuar, 'reserva', v_res, 'vencimiento', v_venc, 'enConteo', v_cont),
    'hayFaltante', v_faltan > 0, 'texto', v_texto);
end $$;

-- La lectura pública: solo quien trabaja las salidas. Una línea que ya tiene su stock asignado no tiene faltante.
create or replace function wms.explicar_faltante(p_linea uuid) returns jsonb
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare l wms.salida_lineas; v_vivo integer;
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  select * into l from wms.salida_lineas where id = p_linea;
  if not found then raise exception 'No encontramos esa línea' using errcode = 'P0001'; end if;
  select coalesce(sum(cantidad), 0)::integer into v_vivo from wms.reservas where linea_id = p_linea and estado in ('ACTIVA', 'EN_TRANSITO', 'EN_STAGING');
  if l.estado not in ('SIN_STOCK', 'PENDIENTE') and v_vivo >= l.cantidad then
    return jsonb_build_object('pedido', l.cantidad, 'disponibles', l.cantidad, 'faltan', 0,
      'causas', jsonb_build_object('SIN_STOCK', 0, 'CUARENTENA', 0, 'RESERVA', 0, 'VENCIMIENTO_MENOR_60', 0),
      'existentes', jsonb_build_object('cuarentena', 0, 'reserva', 0, 'vencimiento', 0, 'enConteo', 0),
      'hayFaltante', false, 'texto', format('Hay stock suficiente: pide %s y hay %s disponibles.', l.cantidad, l.cantidad));
  end if;
  return wms._explicar_faltante(p_linea, l.cantidad - v_vivo);
end $$;

-- Un quiebre: lo que faltó (o lo que decidió Pedidos). Los de detección no se repiten si nada cambió desde el último de esa línea y causa.
create or replace function wms._registrar_quiebre(p_linea uuid, p_causa text, p_pedido integer, p_faltante integer, p_cantidad_causa integer, p_detalle jsonb, p_origen text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare l wms.salida_lineas; s wms.salidas; pd wms.pedidos_despacho; v_ult timestamptz;
begin
  select * into l from wms.salida_lineas where id = p_linea;
  select * into s from wms.salidas where id = l.salida_id;
  select * into pd from wms.pedidos_despacho where salida_id = s.id and vigente limit 1;
  if not found then
    select * into pd from wms.pedidos_despacho x where s.referencia_tipo = 'pedido' and x.vigente and (x.pedido_id = s.referencia_id or x.numero = s.referencia_id) limit 1;
  end if;
  if p_origen = 'DETECCION' then
    select max(creado_en) into v_ult from wms.quiebres_stock where linea_id = p_linea and origen = 'PEDIDOS';
    if exists (select 1 from wms.quiebres_stock q where q.linea_id = p_linea and q.causa = p_causa and q.origen = 'DETECCION' and q.cantidad_pedida = p_pedido
                  and q.cantidad_causa = p_cantidad_causa and (v_ult is null or q.creado_en > v_ult)) then
      return;
    end if;
  end if;
  insert into wms.quiebres_stock (salida_id, pedido_id, pedido_numero, linea_id, producto_id, cantidad_pedida, cantidad_faltante, cantidad_causa, causa, detalle, origen, vendedor, creado_por)
  values (s.id, pd.pedido_id, pd.numero, p_linea, l.producto_id, p_pedido, p_faltante, p_cantidad_causa, p_causa, coalesce(p_detalle, '{}'::jsonb), p_origen, pd.snapshot->>'vendedor', auth.uid());
end $$;

-- Escribe los quiebres de una explicación (uno por causa con cantidad).
create or replace function wms._registrar_quiebres_de(p_linea uuid, p_exp jsonb) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare c text;
begin
  for c in select unnest(array['CUARENTENA', 'RESERVA', 'VENCIMIENTO_MENOR_60', 'SIN_STOCK']) loop
    if (p_exp->'causas'->>c)::integer > 0 then
      perform wms._registrar_quiebre(p_linea, c, (p_exp->>'pedido')::integer, (p_exp->>'faltan')::integer, (p_exp->'causas'->>c)::integer, p_exp - 'texto', 'DETECCION');
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Asignar una línea (0012) con el texto nuevo y con «lo que falta asignar»
-- ─────────────────────────────────────────────────────────────────────────────

-- Igual que la de la 0012 en todo, salvo: (a) asigna solo lo que falta asignar de la línea (con reservas previas por un aumento del pedido; sin ellas, es toda la
-- cantidad), (b) el motivo del faltante de una venta o muestra es el de `_explicar_faltante` y queda registrado como quiebre, (c) la alerta dice quién decide.
create or replace function wms._asignar_linea(p_linea uuid) returns text
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  l wms.salida_lineas; s wms.salidas;
  v_hoy date := wms._hoy_lima(); v_min integer; v_lote uuid; v_primero uuid; v_restante integer; v_tomar integer; c record;
  v_apto integer; v_total integer; v_conteo integer; v_noapto integer; v_msg text; v_prod text; v_cod text; v_ya integer; v_falta integer; v_exp jsonb;
begin
  select * into l from wms.salida_lineas where id = p_linea for update;
  select * into s from wms.salidas where id = l.salida_id;
  perform wms._candado_stock(l.producto_id, s.propietario_id);
  v_min := case when s.tipo = 'DISTRIBUCION'
                then coalesce((select p.valor::integer from wms.parametros p where p.clave = 'vida_util_minima_venta_dias'), 60) else 0 end;
  select coalesce(sum(r.cantidad), 0)::integer into v_ya from wms.reservas r where r.linea_id = p_linea and r.estado in ('ACTIVA', 'EN_TRANSITO', 'EN_STAGING');
  v_falta := l.cantidad - v_ya;
  if v_falta <= 0 and l.lote_indicado_id is null then
    update wms.salida_lineas set estado = case when estado in ('SIN_STOCK', 'PENDIENTE') then 'ASIGNADA' else estado end, nota_stock = null where id = p_linea;
    update wms.alertas set estado = 'ATENDIDA', atendida_en = now(), nota_atencion = 'La línea quedó asignada' where clave = 'stock:' || p_linea and estado = 'ABIERTA';
    return null;
  end if;

  if l.lote_indicado_id is not null then
    -- Tipo B: una línea, un lote, el que indica el cliente, con toda la cantidad.
    select x.lote_id into v_lote from (
      select c2.lote_id, c2.vence, c2.lote, sum(c2.disponible) as total
        from wms._candidatos(s.propietario_id, l.producto_id) c2
        cross join lateral wms._lote_apto(c2.vence, s.tipo, s.motivo, v_hoy, v_min) a
       where c2.disponible > 0 and not c2.en_conteo and a.apto and not wms.lote_bloqueado(c2.lote_id) and c2.lote_id = l.lote_indicado_id
       group by c2.lote_id, c2.vence, c2.lote
      having sum(c2.disponible) >= l.cantidad
       limit 1) x;
    if v_lote is not null then
      perform wms._reservar_en_lote(p_linea, v_lote, l.cantidad);
      v_primero := v_lote;
    end if;
  else
    -- Tipo A y muestras: FEFO lote por lote hasta cubrir lo que falta asignar (todo o nada).
    select coalesce(sum(c2.disponible), 0)::integer into v_apto
      from wms._candidatos(s.propietario_id, l.producto_id) c2
      cross join lateral wms._lote_apto(c2.vence, s.tipo, s.motivo, v_hoy, v_min) a
     where c2.disponible > 0 and not c2.en_conteo and a.apto and not wms.lote_bloqueado(c2.lote_id);
    if v_apto >= v_falta then
      v_restante := v_falta;
      for c in select c2.lote_id, sum(c2.disponible)::integer as total
                 from wms._candidatos(s.propietario_id, l.producto_id) c2
                 cross join lateral wms._lote_apto(c2.vence, s.tipo, s.motivo, v_hoy, v_min) a
                where c2.disponible > 0 and not c2.en_conteo and a.apto and not wms.lote_bloqueado(c2.lote_id)
                group by c2.lote_id, c2.vence, c2.lote
                order by c2.vence nulls last, c2.lote loop
        exit when v_restante <= 0;
        v_tomar := least(c.total, v_restante);
        perform wms._reservar_en_lote(p_linea, c.lote_id, v_tomar);
        v_primero := coalesce(v_primero, c.lote_id);
        v_restante := v_restante - v_tomar;
      end loop;
    end if;
  end if;

  if v_primero is not null then
    update wms.salida_lineas set lote_id = coalesce(lote_id, v_primero), lote_fefo_id = coalesce(lote_fefo_id, v_primero), estado = 'ASIGNADA', nota_stock = null,
           asignacion_fefo = coalesce(asignacion_fefo, wms._asignacion_json(p_linea))
     where id = p_linea;
    update wms.alertas set estado = 'ATENDIDA', atendida_en = now(), nota_atencion = 'La línea quedó asignada'
     where clave = 'stock:' || p_linea and estado = 'ABIERTA';
    return null;
  end if;

  select codigo into v_prod from catalogo.productos where id = l.producto_id;
  select codigo into v_cod from wms.lotes where id = l.lote_indicado_id;
  if l.lote_indicado_id is null then
    -- Venta o muestra: el aviso explica POR QUÉ falta (D-125) y se registra el quiebre.
    v_exp := wms._explicar_faltante(p_linea, v_falta);
    v_msg := v_exp->>'texto';
    perform wms._registrar_quiebres_de(p_linea, v_exp);
  else
    select coalesce(sum(c2.disponible) filter (where c2.disponible > 0), 0), coalesce(sum(c2.disponible) filter (where c2.disponible > 0 and c2.en_conteo), 0),
           coalesce(sum(c2.disponible) filter (where c2.disponible > 0 and not c2.en_conteo and not a.apto), 0),
           coalesce(sum(c2.disponible) filter (where c2.disponible > 0 and not c2.en_conteo and a.apto and not wms.lote_bloqueado(c2.lote_id)), 0)
      into v_total, v_conteo, v_noapto, v_apto
      from wms._candidatos(s.propietario_id, l.producto_id) c2
      cross join lateral wms._lote_apto(c2.vence, s.tipo, s.motivo, v_hoy, v_min) a
     where c2.lote_id = l.lote_indicado_id;
    v_msg := format('No hay en el lote %s con %s unidades disponibles (hay %s)', v_cod, l.cantidad, v_apto)
          || format(' (hay %s en total', v_total)
          || case when v_conteo > 0 then format(', %s en ubicaciones en conteo', v_conteo) else '' end
          || case when v_noapto > 0 then format(', %s de lotes que no cumplen vencimiento o vida útil', v_noapto) else '' end || ')';
  end if;
  update wms.salida_lineas set estado = 'SIN_STOCK', nota_stock = v_msg where id = p_linea;
  if s.tipo <> 'CLIENTE' then
    perform wms._alertar('STOCK_INSUFICIENTE', 'jefe_transporte', null, l.producto_id, 'stock:' || p_linea,
      format('Salida %s, producto %s: %s Decide el vendedor del pedido, en Pedidos: quitar o reducir la línea, o cancelar el pedido. Copia el aviso para el vendedor en la orden.', s.numero, coalesce(v_prod, '?'), v_msg), v_cod);
    update wms.alertas set mensaje = format('Salida %s, producto %s: %s Decide el vendedor del pedido, en Pedidos: quitar o reducir la línea, o cancelar el pedido. Copia el aviso para el vendedor en la orden.', s.numero, coalesce(v_prod, '?'), v_msg)
     where clave = 'stock:' || p_linea and estado = 'ABIERTA';
  end if;
  return v_msg;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Lo que cambió entre dos versiones (con la cancelación) y el texto de la alerta
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._cambios_de_pedido(p_antes jsonb, p_nuevo jsonb) returns jsonb
language plpgsql immutable set search_path = wms, pg_temp as $$
declare r jsonb := '[]'::jsonb; l jsonb; a jsonb;
begin
  if (p_nuevo->>'estado') = 'CANCELLED' and (p_antes->>'estado') is distinct from 'CANCELLED' then
    return jsonb_build_array(format('El pedido se canceló en Pedidos: %s', coalesce(nullif(btrim(p_nuevo->>'motivoCancelacion'), ''), 'sin motivo')));
  end if;
  for l in select * from jsonb_array_elements(p_nuevo->'lineas') loop
    select x into a from jsonb_array_elements(p_antes->'lineas') x where x->>'lineaId' = l->>'lineaId' limit 1;
    if a is null then
      r := r || to_jsonb(format('Se agregó %s (%s u.)', coalesce(l->>'descripcion', l->>'productoCodigo'), l->>'cantidad'));
    elsif (a->>'cantidad') <> (l->>'cantidad') then
      r := r || to_jsonb(format('%s: la cantidad pasó de %s a %s', coalesce(l->>'descripcion', l->>'productoCodigo'), a->>'cantidad', l->>'cantidad'));
    end if;
  end loop;
  for a in select * from jsonb_array_elements(p_antes->'lineas') loop
    if not exists (select 1 from jsonb_array_elements(p_nuevo->'lineas') x where x->>'lineaId' = a->>'lineaId') then
      r := r || to_jsonb(format('Se quitó %s (%s u.)', coalesce(a->>'descripcion', a->>'productoCodigo'), a->>'cantidad'));
    end if;
  end loop;
  if (p_antes->'cliente'->>'nombre') is distinct from (p_nuevo->'cliente'->>'nombre') then r := r || to_jsonb('Cambió el nombre del cliente'::text); end if;
  if coalesce(p_antes->'cliente'->>'direccion', '') <> coalesce(p_nuevo->'cliente'->>'direccion', '') then r := r || to_jsonb('Cambió la dirección de entrega'::text); end if;
  if coalesce(p_antes->'cliente'->>'ventanaCita', '') <> coalesce(p_nuevo->'cliente'->>'ventanaCita', '') then r := r || to_jsonb('Cambió la ventana de cita'::text); end if;
  if coalesce(p_antes->'cliente'->>'vehiculoCalificado', '') <> coalesce(p_nuevo->'cliente'->>'vehiculoCalificado', '') then r := r || to_jsonb('Cambió el vehículo calificado'::text); end if;
  if coalesce(p_antes->>'condicionPago', '') <> coalesce(p_nuevo->>'condicionPago', '') then r := r || to_jsonb('Cambió la condición de pago'::text); end if;
  if coalesce(p_antes->>'factura', '') <> coalesce(p_nuevo->>'factura', '') and coalesce(p_nuevo->>'factura', '') <> '' then r := r || to_jsonb(format('Pedidos registró la factura %s', p_nuevo->>'factura')); end if;
  return r;
end $$;

-- El texto de la alerta para el Jefe de Transporte (espejo de `textoAlertaCambio`, domain/cambio-pedido.ts). `p_cambios` ya viene en palabras («se quitó X (5 u.)»).
create or replace function wms._texto_alerta_cambio(p_numero text, p_cambios text[], p_liberadas integer, p_por_devolver integer, p_ya_no_falta integer, p_con_falta integer,
                                                    p_cancelado boolean default false, p_motivo text default null, p_ya_salio boolean default false, p_hoja boolean default false)
returns text language plpgsql immutable set search_path = wms, pg_temp as $$
declare t text;
begin
  if p_cancelado then
    t := format('El pedido %s se canceló en Pedidos%s.', p_numero, case when coalesce(p_motivo, '') <> '' then ': ' || p_motivo else '' end);
    if p_ya_salio then return t || ' La orden ya salió: coordina el retorno con el transportista.'; end if;
    if p_por_devolver > 0 then
      return t || format(' La orden se cancela cuando se devuelvan y verifiquen las %s unidades ya picadas%s.', p_por_devolver,
                         case when p_liberadas > 0 then format('; se liberaron %s unidades', p_liberadas) else '' end);
    end if;
    return t || format(' Se canceló la orden y se liberaron %s unidades.', p_liberadas);
  end if;
  t := format('El pedido %s cambió', p_numero);
  if coalesce(array_length(p_cambios, 1), 0) > 0 then t := t || ': ' || array_to_string(p_cambios, '; '); end if;
  if p_liberadas > 0 then t := t || format('; se liberaron %s unidades', p_liberadas); end if;
  t := t || '.';
  if p_por_devolver > 0 then t := t || format(' Hay %s unidades ya picadas que se devuelven a su ubicación: otra persona lo verifica antes de seguir.', p_por_devolver); end if;
  if p_ya_no_falta > 0 and p_con_falta = 0 then t := t || ' Ya no falta stock: la orden sigue su flujo.';
  elsif p_con_falta > 0 then t := t || ' Todavía falta stock en alguna línea: el vendedor decide en Pedidos.'; end if;
  if p_hoja then t := t || ' Vuelve a imprimir la hoja de picking.'; end if;
  return t;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Soltar lo reservado de una línea (liberar lo que nadie picó; pedir devolver lo picado)
-- ─────────────────────────────────────────────────────────────────────────────

-- Una línea de la orden de picking que ya no cuenta (la reserva se liberó o se devolvió): queda en cero, como cuando la conformidad no encuentra el producto.
create or replace function wms._anular_linea_de_picking(p_reserva uuid, p_nota text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  update wms.ordenes_picking_lineas
     set cantidad = 0, picking = 'PICKEADA', pickeada_en = coalesce(pickeada_en, now()), conformidad = 'CONFORME', verificada_en = coalesce(verificada_en, now()),
         nota_conformidad = p_nota
   where reserva_id = p_reserva and cantidad > 0;
end $$;

-- Suelta `p_unidades` de la línea (null = todas). Orden: primero lo que nadie picó (ACTIVA) y, dentro de cada grupo, lo que vence DESPUÉS (así lo que queda es lo FEFO).
-- Lo no picado vuelve al stock libre. Lo picado o en Despacho NO se libera: se parte la reserva si hace falta y queda una devolución «por devolver».
-- Devuelve {liberadas, por_devolver}. Espejo de `repartirLiberacion` (domain/cambio-pedido.ts).
create or replace function wms._soltar_linea(p_linea uuid, p_unidades integer, p_causa text, p_version integer) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  r record; v_resto integer; v_t integer; v_lib integer := 0; v_dev integer := 0; v_nueva uuid; l wms.salida_lineas; ol wms.ordenes_picking_lineas; v_nid uuid;
begin
  select * into l from wms.salida_lineas where id = p_linea;
  v_resto := coalesce(p_unidades, 2147483647);
  for r in select rs.id, rs.cantidad, rs.estado, rs.posicion_id, rs.posicion_origen_id
             from wms.reservas rs join wms.lotes lt on lt.id = rs.lote_id
            where rs.linea_id = p_linea and rs.estado in ('ACTIVA', 'EN_TRANSITO', 'EN_STAGING')
              and not exists (select 1 from wms.devoluciones_picking d where d.reserva_id = rs.id and d.estado <> 'VERIFICADA')
            order by case rs.estado when 'ACTIVA' then 0 when 'EN_TRANSITO' then 1 else 2 end, lt.vence desc nulls first, rs.id
            for update of rs loop
    exit when v_resto <= 0;
    v_t := least(r.cantidad, v_resto);
    if r.estado = 'ACTIVA' then
      if v_t = r.cantidad then
        update wms.reservas set estado = 'LIBERADA', actualizada_en = now() where id = r.id;
        perform wms._anular_linea_de_picking(r.id, 'Quitado por un cambio del pedido');
      else
        update wms.reservas set cantidad = cantidad - v_t, actualizada_en = now() where id = r.id;
        update wms.ordenes_picking_lineas set cantidad = cantidad - v_t where reserva_id = r.id and cantidad >= v_t;
      end if;
      v_lib := v_lib + v_t;
    else
      v_nueva := r.id;
      if v_t < r.cantidad then
        -- se parte: queda r (lo que sigue en la orden) y una reserva nueva con lo que se devuelve
        update wms.reservas set cantidad = cantidad - v_t, actualizada_en = now() where id = r.id;
        insert into wms.reservas (linea_id, posicion_id, posicion_origen_id, producto_id, lote_id, propietario_id, estado_stock, procedencia_id, cantidad, cantidad_retornada, estado)
        select linea_id, posicion_id, posicion_origen_id, producto_id, lote_id, propietario_id, estado_stock, procedencia_id, v_t, 0, estado from wms.reservas where id = r.id
        returning id into v_nueva;
        select * into ol from wms.ordenes_picking_lineas where reserva_id = r.id and cantidad > 0 order by id limit 1;
        if found then
          update wms.ordenes_picking_lineas set cantidad = cantidad - v_t where id = ol.id;
          insert into wms.ordenes_picking_lineas (orden_id, linea_id, reserva_id, posicion_id, orden_recorrido, producto_id, lote_id, vence, cantidad, picking, picker_id, pickeada_en, nota_picking,
                                                  conformidad, verificador_id, verificada_en, nota_conformidad)
          values (ol.orden_id, ol.linea_id, v_nueva, ol.posicion_id, ol.orden_recorrido, ol.producto_id, ol.lote_id, ol.vence, v_t, ol.picking, ol.picker_id, ol.pickeada_en, ol.nota_picking,
                  ol.conformidad, ol.verificador_id, ol.verificada_en, ol.nota_conformidad);
        end if;
      end if;
      insert into wms.devoluciones_picking (salida_id, linea_id, reserva_id, cantidad, estado_reserva, desde_posicion_id, hasta_posicion_id, causa, pedido_version, creada_por)
      values (l.salida_id, p_linea, v_nueva, v_t, r.estado, r.posicion_id, r.posicion_origen_id, p_causa, p_version, auth.uid());
      v_dev := v_dev + v_t;
    end if;
    v_resto := v_resto - v_t;
  end loop;
  return jsonb_build_object('liberadas', v_lib, 'por_devolver', v_dev);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Cerrar: lo que ocurre cuando ya no queda nada por devolver
-- ─────────────────────────────────────────────────────────────────────────────

-- La orden se cancela por completo (Pedidos canceló, o quitó todas las líneas): libera todo y cierra. Solo se llama sin devoluciones pendientes.
create or replace function wms._cancelar_salida_por_pedido(p_salida uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  update wms.reservas set estado = 'LIBERADA', actualizada_en = now()
   where estado = 'ACTIVA' and linea_id in (select id from wms.salida_lineas where salida_id = p_salida);
  update wms.ordenes_picking set estado = 'CANCELADA' where salida_id = p_salida and estado <> 'CANCELADA';
  update wms.alertas set estado = 'ATENDIDA', atendida_en = now(), nota_atencion = 'La orden se canceló'
   where estado = 'ABIERTA' and clave in (select 'stock:' || id from wms.salida_lineas where salida_id = p_salida);
  update wms.salida_lineas set estado = 'CANCELADA', cantidad_nueva = null where salida_id = p_salida;
  update wms.salidas set estado = 'CANCELADA', motivo_cancelacion = p_motivo, cancelada_en = now(), cancelacion_pendiente = false where id = p_salida;
  update wms.ruta_paradas pa set activa = false from wms.rutas r where r.id = pa.ruta_id and pa.salida_id = p_salida and pa.activa and r.estado in ('BORRADOR', 'PLANIFICADA');
  perform wms.registrar_audit('salida_cancelada_por_pedido', 'salidas', p_salida::text, null, jsonb_build_object('motivo', p_motivo), p_motivo);
end $$;

create or replace function wms._cerrar_tras_devolucion(p_salida uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.salidas;
begin
  if exists (select 1 from wms.devoluciones_picking where salida_id = p_salida and estado <> 'VERIFICADA') then return; end if;
  select * into s from wms.salidas where id = p_salida for update;
  update wms.alertas set estado = 'ATENDIDA', atendida_en = now(), nota_atencion = 'Lo picado ya volvió a su ubicación y se verificó' where clave = 'devolucion:' || p_salida and estado = 'ABIERTA';
  if s.cancelacion_pendiente then
    perform wms._cancelar_salida_por_pedido(p_salida, coalesce(s.motivo_cancelacion, 'Pedido cancelado en Pedidos'));
    perform wms._alertar('PEDIDO_CANCELADO', 'jefe_transporte', null, null, 'orden-cancelada:' || p_salida,
      format('La orden %s se canceló: lo picado ya volvió a su ubicación y se verificó.', s.numero));
    return;
  end if;
  update wms.salida_lineas set estado = 'CANCELADA', cantidad_nueva = null where salida_id = p_salida and cantidad_nueva = 0;
  update wms.salida_lineas set cantidad_nueva = null where salida_id = p_salida and cantidad_nueva is not null;
  if not exists (select 1 from wms.salida_lineas where salida_id = p_salida and estado <> 'CANCELADA') then
    perform wms._cancelar_salida_por_pedido(p_salida, 'Pedidos quitó todas las líneas del pedido');
  end if;
  perform wms.registrar_audit('devolucion_picking_cerrada', 'salidas', p_salida::text, null, null, null);
end $$;

-- Una devolución verificada: la reserva se libera, la línea de picking queda en cero y, si la unidad estaba en Despacho, se anota el paso (resta de lo que pasó a staging).
create or replace function wms._completar_devolucion(p_dev uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare d wms.devoluciones_picking; v_mov uuid; v_ol uuid;
begin
  select * into d from wms.devoluciones_picking where id = p_dev for update;
  if not found or d.estado = 'VERIFICADA' then return; end if;
  update wms.reservas set estado = 'LIBERADA', actualizada_en = now() where id = d.reserva_id;
  select id into v_ol from wms.ordenes_picking_lineas where reserva_id = d.reserva_id order by id limit 1;
  perform wms._anular_linea_de_picking(d.reserva_id, 'Devuelto a su ubicación por un cambio del pedido');
  if d.estado_reserva = 'EN_STAGING' then
    select movimiento_id into v_mov from wms.ordenes_movimiento_lineas where id = d.orden_movimiento_linea_id;
    insert into wms.salida_movimientos (salida_id, linea_id, orden_linea_id, tipo, cantidad, actor_id, movimiento_id)
    values (d.salida_id, d.linea_id, v_ol, 'DEVOLUCION_PICKING', d.cantidad, auth.uid(), v_mov);
  end if;
  update wms.devoluciones_picking set estado = 'VERIFICADA', verificada_por = auth.uid(), verificada_en = now() where id = p_dev;
  perform wms.registrar_audit('devolucion_picking_verificada', 'devoluciones_picking', p_dev::text, null, jsonb_build_object('cantidad', d.cantidad), null);
  perform wms._cerrar_tras_devolucion(d.salida_id);
end $$;

-- La verificación normal del movimiento (Movimientos internos) completa la devolución; si el movimiento se anula, la devolución vuelve a «por devolver».
create or replace function wms._tr_linea_movimiento_devolucion() returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
declare d record;
begin
  if new.verificacion = 'CONFIRMADA' and old.verificacion is distinct from 'CONFIRMADA' then
    for d in select id from wms.devoluciones_picking where orden_movimiento_linea_id = new.id and estado = 'DEVUELTA' loop
      perform wms._completar_devolucion(d.id);
    end loop;
  elsif new.verificacion = 'ANULADA' and old.verificacion is distinct from 'ANULADA' then
    update wms.devoluciones_picking set estado = 'POR_DEVOLVER', orden_movimiento_id = null, orden_movimiento_linea_id = null, devuelta_por = null, devuelta_en = null
     where orden_movimiento_linea_id = new.id and estado = 'DEVUELTA';
  end if;
  return null;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'ordenes_movimiento_lineas_devolucion' and tgrelid = 'wms.ordenes_movimiento_lineas'::regclass and not tgisinternal) then
    drop trigger ordenes_movimiento_lineas_devolucion on wms.ordenes_movimiento_lineas;
  end if;
end $$;
create trigger ordenes_movimiento_lineas_devolucion after update of verificacion on wms.ordenes_movimiento_lineas
  for each row execute function wms._tr_linea_movimiento_devolucion();

create or replace function wms._tr_movimiento_anulado_devolucion() returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if new.estado = 'ANULADO' and old.estado is distinct from 'ANULADO' then
    update wms.devoluciones_picking set estado = 'POR_DEVOLVER', orden_movimiento_id = null, orden_movimiento_linea_id = null, devuelta_por = null, devuelta_en = null
     where orden_movimiento_id = new.id and estado = 'DEVUELTA';
  end if;
  return null;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'ordenes_movimiento_devolucion_anulada' and tgrelid = 'wms.ordenes_movimiento'::regclass and not tgisinternal) then
    drop trigger ordenes_movimiento_devolucion_anulada on wms.ordenes_movimiento;
  end if;
end $$;
create trigger ordenes_movimiento_devolucion_anulada after update of estado on wms.ordenes_movimiento
  for each row execute function wms._tr_movimiento_anulado_devolucion();

-- El auxiliar devuelve lo picado a su ubicación. Lo que ya estaba en Despacho se mueve con una orden de Movimientos internos (DESPACHO → ubicación original) que
-- otra persona verifica; lo que solo estaba picado (aún en el rack) no mueve el libro, pero también lo verifica otra persona.
create or replace function wms.ejecutar_devolucion_picking(p_salida uuid) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  s wms.salidas; d record; v_mi uuid; v_ml uuid; v_origen text; v_anio text := to_char(now(), 'YYYY'); v_ped text;
begin
  perform wms._exigir_accion('ejecutar', 'No tienes permiso para registrar movimientos');
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa Orden de Salida' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.devoluciones_picking where salida_id = p_salida and estado = 'POR_DEVOLVER') then
    raise exception 'No hay nada por devolver en esta Orden de Salida' using errcode = 'P0001';
  end if;
  select numero into v_ped from wms.pedidos_despacho where salida_id = p_salida and vigente limit 1;
  if exists (select 1 from wms.devoluciones_picking where salida_id = p_salida and estado = 'POR_DEVOLVER' and estado_reserva = 'EN_STAGING') then
    v_mi := gen_random_uuid();
    insert into wms.ordenes_movimiento (id, numero, motivo, ejecutor_id)
    values (v_mi, 'MI-' || v_anio || '-' || lpad(wms.siguiente_correlativo('MI-' || v_anio)::text, 5, '0'),
            format('Devolución de lo picado de %s: el pedido%s cambió o se canceló en Pedidos', s.numero, coalesce(' ' || v_ped || ' ', ' ')), auth.uid());
    for d in select dp.*, r.lote_id, r.producto_id, r.propietario_id, r.estado_stock, r.procedencia_id
               from wms.devoluciones_picking dp join wms.reservas r on r.id = dp.reserva_id
              where dp.salida_id = p_salida and dp.estado = 'POR_DEVOLVER' and dp.estado_reserva = 'EN_STAGING' order by dp.id loop
      select origen into v_origen from wms.partidas where procedencia_id = d.procedencia_id and lote_id = d.lote_id order by id limit 1;
      update wms.devoluciones_picking set estado = 'DEVUELTA', orden_movimiento_id = v_mi, devuelta_por = auth.uid(), devuelta_en = now() where id = d.id;
      insert into wms.ordenes_movimiento_lineas (orden_id, producto_id, lote_id, propietario_id, estado, origen, procedencia_id, desde_posicion_id, hasta_posicion_id, cantidad)
      values (v_mi, d.producto_id, d.lote_id, d.propietario_id, d.estado_stock, v_origen, d.procedencia_id, d.desde_posicion_id, d.hasta_posicion_id, d.cantidad)
      returning id into v_ml;
      update wms.devoluciones_picking set orden_movimiento_linea_id = v_ml where id = d.id;
    end loop;
  end if;
  update wms.devoluciones_picking set estado = 'DEVUELTA', devuelta_por = auth.uid(), devuelta_en = now() where salida_id = p_salida and estado = 'POR_DEVOLVER';
  perform wms.registrar_audit('devolucion_picking_ejecutada', 'salidas', p_salida::text, null, jsonb_build_object('movimiento', v_mi), null);
  return v_mi;
end $$;

-- Otra persona (no quien devolvió) verifica que lo picado volvió a su ubicación. Si hay una orden de Movimientos internos, se confirma esa (queda en el libro con las dos
-- personas); lo que solo estaba picado se da por verificado aquí.
create or replace function wms.verificar_devolucion_picking(p_salida uuid) returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare d record; v_n integer := 0; v_mi uuid;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_rol('auxiliar', 'jefe_almacen', 'reemplazo_jefe') then raise exception 'Solo el personal de almacén verifica movimientos' using errcode = '42501'; end if;
  perform 1 from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa Orden de Salida' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.devoluciones_picking where salida_id = p_salida and estado = 'DEVUELTA') then
    raise exception 'Todavía no se devolvió nada: primero el auxiliar devuelve lo picado a su ubicación' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.devoluciones_picking where salida_id = p_salida and estado = 'DEVUELTA' and devuelta_por = auth.uid()) then
    raise exception 'El verificador no puede ser quien devolvió lo picado' using errcode = 'P0001';
  end if;
  for v_mi in select distinct orden_movimiento_id from wms.devoluciones_picking where salida_id = p_salida and estado = 'DEVUELTA' and orden_movimiento_id is not null loop
    perform wms.confirmar_movimiento(v_mi);
  end loop;
  for d in select id from wms.devoluciones_picking where salida_id = p_salida and estado = 'DEVUELTA' and orden_movimiento_id is null order by id loop
    perform wms._completar_devolucion(d.id);
    v_n := v_n + 1;
  end loop;
  return (select count(*)::integer from wms.devoluciones_picking where salida_id = p_salida and estado = 'VERIFICADA');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Mientras haya algo por devolver (o una línea sin stock) la orden no avanza
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._tr_orden_bloqueada_por_cambio() returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_salida uuid;
begin
  if tg_table_name = 'carga_bultos' then
    select b.salida_id into v_salida from wms.bultos b where b.id = new.bulto_id;
  elsif tg_table_name = 'salida_movimientos' then
    if new.tipo not in ('STAGING', 'SALIDA') then return new; end if;
    v_salida := new.salida_id;
  else
    v_salida := new.salida_id;
  end if;
  if v_salida is null then return new; end if;
  if exists (select 1 from wms.devoluciones_picking where salida_id = v_salida and estado <> 'VERIFICADA') then
    raise exception 'La orden tiene unidades picadas por devolver a su ubicación (por un cambio o la cancelación del pedido): primero se devuelven y otra persona lo verifica' using errcode = 'P0001';
  end if;
  if tg_table_name <> 'carga_bultos' and exists (select 1 from wms.salida_lineas where salida_id = v_salida and estado = 'SIN_STOCK') then
    raise exception 'Hay líneas con falta de stock: el vendedor decide en Pedidos si quita o reduce lo que falta, o cancela el pedido, antes de seguir' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['salida_movimientos', 'guias_remision', 'bultos', 'carga_bultos'] loop
    if exists (select 1 from pg_trigger where tgname = t || '_cambio_pedido' and tgrelid = ('wms.' || t)::regclass and not tgisinternal) then
      execute format('drop trigger %I on wms.%I', t || '_cambio_pedido', t);
    end if;
    execute format('create trigger %I before insert on wms.%I for each row execute function wms._tr_orden_bloqueada_por_cambio()', t || '_cambio_pedido', t);
  end loop;
end $$;

-- Un pedido cancelado en Pedidos no se planifica: no entra a una ruta.
create or replace function wms._tr_parada_pedido_cancelado() returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_snap jsonb; v_num text;
begin
  select snapshot, numero into v_snap, v_num from wms.pedidos_despacho where id = new.pedido_despacho_id;
  if v_snap->>'estado' = 'CANCELLED' then
    raise exception 'El pedido % se canceló en Pedidos: no se puede planificar', v_num using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'ruta_paradas_pedido_cancelado' and tgrelid = 'wms.ruta_paradas'::regclass and not tgisinternal) then
    drop trigger ruta_paradas_pedido_cancelado on wms.ruta_paradas;
  end if;
end $$;
create trigger ruta_paradas_pedido_cancelado before insert on wms.ruta_paradas for each row execute function wms._tr_parada_pedido_cancelado();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. La versión nueva del pedido actualiza la Orden de Salida
-- ─────────────────────────────────────────────────────────────────────────────

-- ¿Cuál es la Orden de Salida de este pedido? La que lo tomó la bandeja (`pedidos_despacho.salida_id`) o, para una orden manual de venta, la que referencia el pedido
-- por su id o por su número (`referencia_tipo = 'pedido'`). Una orden cancelada no cuenta si hay otra viva.
create or replace function wms._salida_de_pedido(p_pedido_id text, p_numero text, p_salida_id uuid default null) returns uuid
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v uuid;
begin
  if p_salida_id is not null then return p_salida_id; end if;
  select id into v from wms.salidas where referencia_tipo = 'pedido' and referencia_id in (p_pedido_id, p_numero) order by (estado = 'CANCELADA'), creada_en desc limit 1;
  return v;
end $$;

-- Completa `pedido_linea_id` de las líneas que nacieron antes de esta migración, mirando la versión anterior del pedido (mismo producto y, si hay varias, misma cantidad).
create or replace function wms._enlazar_lineas_pedido(p_salida uuid, p_anterior jsonb) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare sl record; pl jsonb; v_usados text[] := array[]::text[]; v_cod text; v_match jsonb;
begin
  if p_anterior is null then return; end if;
  select coalesce(array_agg(pedido_linea_id), array[]::text[]) into v_usados from wms.salida_lineas where salida_id = p_salida and pedido_linea_id is not null;
  for sl in select * from wms.salida_lineas where salida_id = p_salida and pedido_linea_id is null order by creada_en, id loop
    select upper(codigo) into v_cod from catalogo.productos where id = sl.producto_id;
    v_match := null;
    for pl in select x from jsonb_array_elements(p_anterior->'lineas') x loop
      continue when pl->>'lineaId' = any (v_usados) or upper(pl->>'productoCodigo') is distinct from v_cod;
      if (pl->>'cantidad')::integer = sl.cantidad then v_match := pl; exit; end if;
      v_match := coalesce(v_match, pl);
    end loop;
    if v_match is not null then
      update wms.salida_lineas set pedido_linea_id = v_match->>'lineaId' where id = sl.id;
      v_usados := v_usados || (v_match->>'lineaId');
    end if;
  end loop;
end $$;

-- Si la hoja de picking ya existe, las reservas nuevas de la línea entran a ella (la hoja cambió: hay que volver a imprimirla).
create or replace function wms._enganchar_a_orden(p_linea uuid) returns boolean
language plpgsql security definer set search_path = wms, pg_temp as $$
declare l wms.salida_lineas; o wms.ordenes_picking; v_n integer;
begin
  select * into l from wms.salida_lineas where id = p_linea;
  select * into o from wms.ordenes_picking where salida_id = l.salida_id and estado <> 'CANCELADA';
  if not found then return false; end if;
  insert into wms.ordenes_picking_lineas (orden_id, linea_id, reserva_id, posicion_id, orden_recorrido, producto_id, lote_id, vence, cantidad)
  select o.id, r.linea_id, r.id, r.posicion_id, ps.orden_recorrido, r.producto_id, r.lote_id, lt.vence, r.cantidad
    from wms.reservas r join wms.posiciones ps on ps.id = r.posicion_id join wms.lotes lt on lt.id = r.lote_id
   where r.linea_id = p_linea and r.estado = 'ACTIVA' and not exists (select 1 from wms.ordenes_picking_lineas z where z.reserva_id = r.id);
  get diagnostics v_n = row_count;
  if l.estado = 'ASIGNADA' then update wms.salida_lineas set estado = 'EN_PICKING' where id = p_linea; end if;
  if v_n > 0 and o.estado = 'COMPLETA' then update wms.ordenes_picking set estado = 'EN_CURSO' where id = o.id; end if;
  return true;
end $$;

-- Aplica una versión nueva (o la cancelación) del pedido a su Orden de Salida. Lo llama el disparador de `pedidos_despacho`; SA-2 puede llamarla al unir una orden
-- manual con un pedido que llega por la bandeja. `p_anterior` = el snapshot de la versión anterior (null si no la hay).
create or replace function wms._aplicar_cambio_pedido(p_salida uuid, p_pedido wms.pedidos_despacho, p_anterior jsonb) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare
  s wms.salidas; v_nuevo jsonb := p_pedido.snapshot; v_cancel boolean := (p_pedido.snapshot->>'estado') = 'CANCELLED'; v_motivo text;
  sl record; nl jsonb; al jsonb; v_prod uuid; v_lib integer := 0; v_dev integer := 0; v_r jsonb; v_x jsonb; v_cambios text[] := array[]::text[]; v_exp jsonb;
  v_antes_sin uuid[]; v_ya_no integer := 0; v_con integer := 0; v_hoja boolean; v_nueva integer; v_vivas integer; v_exceso integer; v_texto text; v_desc text; v_msg text; v_id uuid;
  v_tenia_lineas boolean;
begin
  select * into s from wms.salidas where id = p_salida for update;
  if not found then return jsonb_build_object('aplicado', false, 'motivo', 'SIN_ORDEN'); end if;
  if s.estado <> 'ABIERTA' then
    if s.estado = 'CONFIRMADA' then
      v_texto := wms._texto_alerta_cambio(p_pedido.numero, array[]::text[], 0, 0, 0, 0, v_cancel, v_nuevo->>'motivoCancelacion', true, false);
      if not v_cancel then v_texto := format('El pedido %s cambió en Pedidos, pero su orden %s ya salió: coordina el cambio con el transportista.', p_pedido.numero, s.numero); end if;
      perform wms._alertar(case when v_cancel then 'PEDIDO_CANCELADO' else 'PEDIDO_CAMBIADO' end, 'jefe_transporte', null, null, 'pedido-cambiado:' || p_pedido.pedido_id || ':' || p_pedido.version, v_texto);
    end if;
    return jsonb_build_object('aplicado', false, 'motivo', s.estado);
  end if;
  -- «la hoja cambió, vuelve a imprimirla» solo importa si todavía nadie empezó a picar con ella
  v_hoja := exists (select 1 from wms.ordenes_picking where salida_id = p_salida and estado <> 'CANCELADA')
        and not exists (select 1 from wms.ordenes_picking_lineas ol join wms.ordenes_picking o on o.id = ol.orden_id
                         where o.salida_id = p_salida and o.estado <> 'CANCELADA' and ol.cantidad > 0 and ol.picking <> 'PENDIENTE');
  v_tenia_lineas := exists (select 1 from wms.salida_lineas where salida_id = p_salida and estado <> 'CANCELADA');
  perform wms._enlazar_lineas_pedido(p_salida, p_anterior);
  select coalesce(array_agg(id), array[]::uuid[]) into v_antes_sin from wms.salida_lineas where salida_id = p_salida and estado = 'SIN_STOCK';

  if v_cancel then
    v_motivo := coalesce(nullif(btrim(v_nuevo->>'motivoCancelacion'), ''), 'sin motivo');
    for sl in select * from wms.salida_lineas where salida_id = p_salida and estado = 'SIN_STOCK' loop
      v_exp := wms._explicar_faltante(sl.id);
      perform wms._registrar_quiebre(sl.id, 'CANCELADO_POR_VENDEDOR', sl.cantidad, coalesce((v_exp->>'faltan')::integer, sl.cantidad), coalesce((v_exp->>'faltan')::integer, sl.cantidad),
        (v_exp - 'texto') || jsonb_build_object('motivo', v_motivo, 'canceladoPor', v_nuevo->>'canceladoPor', 'version', p_pedido.version), 'PEDIDOS');
    end loop;
    for sl in select * from wms.salida_lineas where salida_id = p_salida and estado <> 'CANCELADA' order by creada_en, id loop
      v_r := wms._soltar_linea(sl.id, null, 'PEDIDO_CANCELADO', p_pedido.version);
      v_lib := v_lib + (v_r->>'liberadas')::integer; v_dev := v_dev + (v_r->>'por_devolver')::integer;
    end loop;
    if v_dev = 0 then
      perform wms._cancelar_salida_por_pedido(p_salida, v_motivo);
    else
      update wms.salidas set cancelacion_pendiente = true, motivo_cancelacion = v_motivo where id = p_salida;
      update wms.alertas set estado = 'ATENDIDA', atendida_en = now(), nota_atencion = 'El pedido se canceló en Pedidos'
       where estado = 'ABIERTA' and clave in (select 'stock:' || id from wms.salida_lineas where salida_id = p_salida);
    end if;
    v_texto := wms._texto_alerta_cambio(p_pedido.numero, array[]::text[], v_lib, v_dev, 0, 0, true, v_motivo, false, false);
    perform wms._alertar('PEDIDO_CANCELADO', 'jefe_transporte', null, null, 'pedido-cambiado:' || p_pedido.pedido_id || ':' || p_pedido.version, v_texto);
  else
    -- 1) líneas quitadas
    for sl in select * from wms.salida_lineas where salida_id = p_salida and pedido_linea_id is not null and estado <> 'CANCELADA' and cantidad_nueva is null order by creada_en, id loop
      continue when exists (select 1 from jsonb_array_elements(v_nuevo->'lineas') x where x->>'lineaId' = sl.pedido_linea_id);
      select x into al from jsonb_array_elements(coalesce(p_anterior->'lineas', '[]'::jsonb)) x where x->>'lineaId' = sl.pedido_linea_id limit 1;
      v_desc := coalesce(al->>'descripcion', (select descripcion from catalogo.productos where id = sl.producto_id));
      if sl.estado = 'SIN_STOCK' then
        v_exp := wms._explicar_faltante(sl.id);
        perform wms._registrar_quiebre(sl.id, 'LINEA_QUITADA_POR_VENDEDOR', sl.cantidad, (v_exp->>'faltan')::integer, (v_exp->>'faltan')::integer,
          (v_exp - 'texto') || jsonb_build_object('version', p_pedido.version), 'PEDIDOS');
      end if;
      v_r := wms._soltar_linea(sl.id, null, 'CAMBIO_PEDIDO', p_pedido.version);
      v_lib := v_lib + (v_r->>'liberadas')::integer; v_dev := v_dev + (v_r->>'por_devolver')::integer;
      if (v_r->>'por_devolver')::integer > 0 then
        update wms.salida_lineas set cantidad_nueva = 0 where id = sl.id;
      else
        update wms.salida_lineas set estado = 'CANCELADA' where id = sl.id;
        update wms.alertas set estado = 'ATENDIDA', atendida_en = now(), nota_atencion = 'La línea se quitó del pedido' where clave = 'stock:' || sl.id and estado = 'ABIERTA';
      end if;
      v_cambios := v_cambios || format('se quitó %s (%s u.)', v_desc, sl.cantidad);
    end loop;
    -- 2) líneas reducidas
    for nl in select x from jsonb_array_elements(v_nuevo->'lineas') x loop
      select * into sl from wms.salida_lineas where salida_id = p_salida and pedido_linea_id = nl->>'lineaId' and estado <> 'CANCELADA' and cantidad_nueva is null;
      continue when not found or (nl->>'cantidad')::integer >= sl.cantidad;
      v_nueva := (nl->>'cantidad')::integer;
      if sl.estado = 'SIN_STOCK' then
        v_exp := wms._explicar_faltante(sl.id);
        perform wms._registrar_quiebre(sl.id, 'LINEA_REDUCIDA_POR_VENDEDOR', sl.cantidad, (v_exp->>'faltan')::integer, (v_exp->>'faltan')::integer,
          (v_exp - 'texto') || jsonb_build_object('de', sl.cantidad, 'a', v_nueva, 'version', p_pedido.version), 'PEDIDOS');
      end if;
      select coalesce(sum(r.cantidad), 0)::integer into v_vivas from wms.reservas r
       where r.linea_id = sl.id and r.estado in ('ACTIVA', 'EN_TRANSITO', 'EN_STAGING') and not exists (select 1 from wms.devoluciones_picking d where d.reserva_id = r.id and d.estado <> 'VERIFICADA');
      v_exceso := greatest(0, v_vivas - v_nueva);
      update wms.salida_lineas set cantidad = v_nueva where id = sl.id;
      if v_exceso > 0 then
        v_r := wms._soltar_linea(sl.id, v_exceso, 'CAMBIO_PEDIDO', p_pedido.version);
        v_lib := v_lib + (v_r->>'liberadas')::integer; v_dev := v_dev + (v_r->>'por_devolver')::integer;
      end if;
      -- la propuesta FEFO de la cantidad nueva es lo que queda asignado
      update wms.salida_lineas set asignacion_fefo = wms._asignacion_json_vigente(sl.id) where id = sl.id and v_vivas > 0;
      if v_vivas < v_nueva or sl.estado in ('SIN_STOCK', 'PENDIENTE') then
        update wms.salida_lineas set estado = 'PENDIENTE', nota_stock = null where id = sl.id and estado = 'SIN_STOCK';
        v_msg := wms._asignar_linea(sl.id);
        if v_msg is null then perform wms._enganchar_a_orden(sl.id); end if;
      end if;
      select descripcion into v_desc from jsonb_to_record(nl) as t(descripcion text);
      v_cambios := v_cambios || format('se redujo %s de %s a %s', coalesce(v_desc, nl->>'productoCodigo'), sl.cantidad, v_nueva);
    end loop;
    -- 3) líneas aumentadas
    for nl in select x from jsonb_array_elements(v_nuevo->'lineas') x loop
      select * into sl from wms.salida_lineas where salida_id = p_salida and pedido_linea_id = nl->>'lineaId' and estado <> 'CANCELADA' and cantidad_nueva is null;
      continue when not found or (nl->>'cantidad')::integer <= sl.cantidad;
      v_nueva := (nl->>'cantidad')::integer;
      update wms.salida_lineas set cantidad = v_nueva where id = sl.id;
      v_msg := wms._asignar_linea(sl.id);
      if v_msg is null then
        perform wms._enganchar_a_orden(sl.id);
        update wms.salida_lineas set asignacion_fefo = wms._asignacion_json_vigente(sl.id) where id = sl.id;
      end if;
      v_cambios := v_cambios || format('se aumentó %s de %s a %s', coalesce(nl->>'descripcion', nl->>'productoCodigo'), sl.cantidad, v_nueva);
    end loop;
    -- 4) líneas agregadas
    for nl in select x from jsonb_array_elements(v_nuevo->'lineas') x loop
      continue when exists (select 1 from wms.salida_lineas where salida_id = p_salida and pedido_linea_id = nl->>'lineaId');
      select id into v_prod from catalogo.productos where upper(codigo) = upper(nl->>'productoCodigo') limit 1;
      if v_prod is null then
        perform wms._alertar('PEDIDO_CAMBIADO', 'jefe_transporte', null, null, 'pedido-linea-sin-catalogo:' || p_pedido.pedido_id || ':' || (nl->>'lineaId'),
          format('El pedido %s agregó un producto que el WMS no conoce (%s): Dirección Técnica debe darlo de alta.', p_pedido.numero, nl->>'productoCodigo'));
        continue;
      end if;
      v_id := gen_random_uuid();
      insert into wms.salida_lineas (id, salida_id, producto_id, cantidad, pedido_linea_id) values (v_id, p_salida, v_prod, (nl->>'cantidad')::integer, nl->>'lineaId');
      v_msg := wms._asignar_linea(v_id);
      if v_msg is null then perform wms._enganchar_a_orden(v_id); end if;
      v_cambios := v_cambios || format('se agregó %s (%s u.)', coalesce(nl->>'descripcion', nl->>'productoCodigo'), nl->>'cantidad');
    end loop;

    -- ¿Quedó alguna línea viva? Si no, la orden se cancela (o espera la devolución)
    if v_tenia_lineas and not exists (select 1 from wms.salida_lineas where salida_id = p_salida and estado <> 'CANCELADA' and coalesce(cantidad_nueva, 1) > 0) then
      if v_dev = 0 then
        perform wms._cancelar_salida_por_pedido(p_salida, 'Pedidos quitó todas las líneas del pedido');
      else
        update wms.salidas set cancelacion_pendiente = true, motivo_cancelacion = 'Pedidos quitó todas las líneas del pedido' where id = p_salida;
      end if;
    end if;
    if coalesce(array_length(v_cambios, 1), 0) = 0 then
      -- solo cambió algo que no son líneas (dirección, cita, factura…): la orden no cambia; si fue solo la factura no hay nada que revisar
      if jsonb_array_length(p_pedido.cambios) = 1 and (p_pedido.cambios->>0) like 'Pedidos registró la factura%' then
        update wms.pedidos_despacho set cambio_pendiente = false where id = p_pedido.id;
      end if;
      return jsonb_build_object('aplicado', true, 'sin_cambios_de_lineas', true);
    end if;
    select count(*)::integer into v_con from wms.salida_lineas where salida_id = p_salida and estado = 'SIN_STOCK';
    select count(*)::integer into v_ya_no from wms.salida_lineas where id = any (v_antes_sin) and estado <> 'SIN_STOCK';
    v_texto := wms._texto_alerta_cambio(p_pedido.numero, v_cambios, v_lib, v_dev, v_ya_no, v_con, false, null, false, v_hoja and array_length(v_cambios, 1) > 0);
    perform wms._alertar('PEDIDO_CAMBIADO', 'jefe_transporte', null, null, 'pedido-cambiado:' || p_pedido.pedido_id || ':' || p_pedido.version, v_texto);
  end if;

  if v_dev > 0 then
    perform wms._alertar('DEVOLUCION_PICKING', 'jefe_almacen', null, null, 'devolucion:' || p_salida,
      format('La orden %s tiene %s unidades ya picadas por devolver a su ubicación (el pedido %s %s): el auxiliar las devuelve y otra persona lo verifica.', s.numero, v_dev, p_pedido.numero,
             case when v_cancel then 'se canceló en Pedidos' else 'cambió en Pedidos' end));
  end if;
  update wms.pedidos_despacho set cambio_pendiente = false where id = p_pedido.id;
  perform wms.registrar_audit(case when v_cancel then 'pedido_cancelado_aplicado' else 'pedido_cambio_aplicado' end, 'salidas', p_salida::text, null,
    jsonb_build_object('pedido', p_pedido.numero, 'version', p_pedido.version, 'cambios', v_cambios, 'liberadas', v_lib, 'por_devolver', v_dev), v_texto);
  return jsonb_build_object('aplicado', true, 'liberadas', v_lib, 'por_devolver', v_dev, 'ya_no_falta', v_ya_no, 'con_falta', v_con, 'texto', v_texto);
end $$;

-- El disparador: cada versión nueva (o cancelación) del pedido se aplica a su Orden de Salida, dentro de la misma transacción de la importación.
create or replace function wms._tr_pedido_nueva_version() returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_prev wms.pedidos_despacho; v_hay boolean; v_salida uuid;
begin
  select * into v_prev from wms.pedidos_despacho where pedido_id = new.pedido_id and version < new.version order by version desc limit 1;
  v_hay := found;
  if not v_hay and (new.snapshot->>'estado') is distinct from 'CANCELLED' then return null; end if;
  v_salida := wms._salida_de_pedido(new.pedido_id, new.numero, new.salida_id);
  if v_salida is null then
    -- un pedido cancelado sin orden no tiene nada que revisar: queda cancelado en la bandeja
    if (new.snapshot->>'estado') = 'CANCELLED' then update wms.pedidos_despacho set cambio_pendiente = false where id = new.id; end if;
    return null;
  end if;
  perform wms._aplicar_cambio_pedido(v_salida, new, case when v_hay then v_prev.snapshot end);
  return null;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'pedidos_despacho_aplicar' and tgrelid = 'wms.pedidos_despacho'::regclass and not tgisinternal) then
    drop trigger pedidos_despacho_aplicar on wms.pedidos_despacho;
  end if;
end $$;
create trigger pedidos_despacho_aplicar after insert on wms.pedidos_despacho for each row execute function wms._tr_pedido_nueva_version();

-- `registrar_importacion_pedidos` (0014) acepta también `estado = 'CANCELLED'` con su `motivoCancelacion`. Se reescribe solo el texto que cambia (y falla en voz alta
-- si no está, para no dejar la función a medias; si SA-2 ya la tocó en la 0028 y conserva esa línea, sigue valiendo).
do $$
declare v_oid oid; v_def text; v_viejo text; v_nuevo text;
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'registrar_importacion_pedidos' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position('CANCELLED' in v_def) > 0 then return; end if;     -- ya aplicada (re-ejecución)
  v_viejo := $v$elsif e->>'estado' is distinct from 'READY_FOR_OPERATIONS' then v_motivo := 'Solo se importan pedidos READY_FOR_OPERATIONS.';$v$;
  v_nuevo := $v$elsif e->>'estado' is distinct from 'READY_FOR_OPERATIONS' and e->>'estado' is distinct from 'CANCELLED' then v_motivo := 'Solo se importan pedidos READY_FOR_OPERATIONS o CANCELLED.';
    elsif e->>'estado' = 'CANCELLED' and coalesce(nullif(btrim(coalesce(e->>'motivoCancelacion', e->>'motivo_cancelacion', '')), ''), '') = '' then v_motivo := 'Un pedido cancelado trae el motivo de la cancelación (motivoCancelacion).';$v$;
  if position(v_viejo in v_def) = 0 then
    raise exception 'No se encontró el texto esperado en wms.registrar_importacion_pedidos: %', v_viejo;
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

-- Las líneas de la hoja que un cambio dejó en cero (quedan «conformes» con cantidad 0, como las que la conformidad no encontró) no cuentan como «la conformidad ya
-- empezó»: sigue pudiéndose indicar quién pica. Se reescribe solo ese texto de `designar_picker` (0023).
do $$
declare v_oid oid; v_def text; v_viejo text := $v$where orden_id = p_orden and conformidad <> 'PENDIENTE')$v$; v_nuevo text := $v$where orden_id = p_orden and conformidad <> 'PENDIENTE' and cantidad > 0)$v$;
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'designar_picker' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position(v_nuevo in v_def) > 0 then return; end if;       -- ya aplicada (re-ejecución)
  if position(v_viejo in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.designar_picker: %', v_viejo; end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.explicar_faltante(uuid), wms.ejecutar_devolucion_picking(uuid), wms.verificar_devolucion_picking(uuid) to authenticated;
revoke execute on all functions in schema wms from public;
