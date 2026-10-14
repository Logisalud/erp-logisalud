-- WMS Logisalud — migración 0012 (Salidas, PR S2): NÚCLEO DE STOCK DE SALIDAS. Sin pantallas.
--
-- Plan: docs/wms/salidas/diagnostico-y-plan.md (§2.2, §2.4, §4.2, §4.3, §4.9, §6 S2). Decisiones: D-51, D-62, D-63, D-67, D-69, D-70, D-71.
-- Requiere la 0011 (roles, zonas, SALIDA/RETORNO, aislamiento).
--
--   1. UNA SOLA FUENTE de «comprometido» y «disponible», por propietario: `wms._comprometido()` suma las reservas de salidas
--      y los movimientos internos abiertos; la usan Mover (`ejecutar_movimiento`), la asignación y la disponibilidad. Así un
--      Mover no se lleva unidades prometidas a un pedido.
--   2. `salidas` y `salida_lineas` (tres tipos: DISTRIBUCION de Logissa, CLIENTE por cuenta de un cliente de almacenamiento,
--      MUESTRA de Logissa), `reservas` (la asignación física: celda + lote + cantidad) y `cambios_lote_asignado` (la excepción).
--   3. Dos modos de asignación: A = FEFO entre lotes Aprobados, sin bloqueo, no vencidos y con ≥ 60 días (parámetro; las muestras
--      no exigen los 60 días); B = el lote que indica el cliente, con validación completa.
--      En A una línea puede repartirse en varios lotes (D-76): se toma lo que haya del lote FEFO válido y se completa con el siguiente;
--      en B una línea = un lote (si el cliente necesita dos lotes, usa dos líneas).
--      Vencidos: el stock de Logissa NUNCA sale vencido; el de un cliente solo con motivo pesquisa DIGEMID, destrucción o
--      devolución al proveedor y con aprobación de Dirección Técnica (D-69).
--   4. Cambio de lote por la ÚNICA excepción (D-62): Jefe de Almacén / reemplazo / Jefe de Transporte, antes del picking, con un
--      único motivo fijo; el lote nuevo debe vencer DESPUÉS. Alerta de stock insuficiente al Jefe de Transporte ANTES del picking.
--      Propuesta de reemplazo cuando el picker no encuentra el lote (solo en A).
--   5. Orden de picking (por orden de recorrido) y los escalones de §4.3: picking confirmado (sin tocar el ledger) → conformidad
--      de OTRA persona = MOVIMIENTO rack → staging (D-51) → SALIDA desde staging → RETORNO. Invariantes en la base: nunca negativo,
--      RETORNO ≤ SALIDA, idempotencia, y SALIDA/RETORNO/staging solo por el flujo de salidas (contexto verificado, como Mover).
--   6. SALIDA y RETORNO pasan a estar HABILITADOS; las zonas «Pendiente de conformidad» y «Retorno reservado» admiten Aprobado (siguen
--      sin posiciones físicas hasta que Katia y Charlie las definan, D-52; «Observado» sigue apagada). Kardex incluye salidas y retornos.
--
-- NO SE APLICA SOLA: se aplica a mano, con aprobación. Re-ejecutable. RLS desde el `create table`. Nada a `anon`.
-- Termina con el `revoke execute … from public` de las funciones (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Permisos, parámetros, alertas, tipos de movimiento y zonas
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'wms.permisos_rol'::regclass and conname = 'permisos_rol_accion_check') then
    alter table wms.permisos_rol drop constraint permisos_rol_accion_check;
  end if;
  alter table wms.permisos_rol add constraint permisos_rol_accion_check check (accion in (
    'ver', 'ejecutar', 'verificar', 'aprobar', 'ajustar', 'configurar', 'exportar', 'auditar',
    'dar_conformidad', 'cambiar_lote_asignado', 'imprimir_paquete_documental',
    'gestionar_documentos_regulatorios', 'autorizar_salida_sin_venta', 'preparar_salidas', 'confirmar_salida'));
end $$;

insert into wms.permisos_rol (rol, accion) values
  ('jefe_transporte', 'preparar_salidas'), ('jefe_transporte', 'confirmar_salida'),
  ('jefe_almacen', 'preparar_salidas'), ('reemplazo_jefe', 'preparar_salidas')
on conflict (rol, accion) do nothing;

insert into wms.parametros (clave, valor, nota) values
  ('vida_util_minima_venta_dias', '60',
   'D-71: un pedido de venta de Logissa solo toma lotes con al menos estos días de vida útil (inclusive). Las muestras y las salidas de clientes no lo exigen.')
on conflict (clave) do nothing;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'alertas_tipo_check' and conrelid = 'wms.alertas'::regclass) then
    alter table wms.alertas drop constraint alertas_tipo_check;
  end if;
  alter table wms.alertas add constraint alertas_tipo_check check (tipo in (
    'TEMPERATURA', 'RS_VENCIDO', 'DIVERGENCIA_COMPRAS', 'POR_TRASLADAR_VENCIDO', 'LOTE_POR_VENCER', 'LOTE_VENCIDO',
    'SOLICITUD_AJUSTADA', 'EXCEDE_OC', 'POR_REGISTRAR_EN_COMPRAS', 'NO_COINCIDE_CON_COMPRAS',
    'MOVIMIENTO_CON_DIFERENCIA', 'MOVIMIENTO_SIN_VERIFICAR', 'CONTEO_CON_DIFERENCIA', 'AJUSTE_POR_AUTORIZAR', 'PENDIENTE_AFECTA_PRODUCTO',
    'STOCK_INSUFICIENTE'));
end $$;

update wms.tipos_movimiento set habilitado = true where codigo in ('SALIDA', 'RETORNO');

-- Las zonas de conformidad y de retorno reservado admiten Aprobado. Sin posiciones físicas no entra nada (D-52); «Observado» sigue apagada.
insert into wms.area_estado_admitido (tipo_area, estado, origen_requerido) values
  ('PENDIENTE_CONFORMIDAD', 'APROBADO', null),
  ('RETORNO_RESERVADO', 'APROBADO', null)
on conflict (tipo_area, estado) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tablas
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.salidas (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,                       -- SAL-AAAA-NNNNN
  tipo text not null check (tipo in ('DISTRIBUCION', 'CLIENTE', 'MUESTRA')),
  motivo text not null check (motivo in ('VENTA', 'PESQUISA_DIGEMID', 'DESTRUCCION', 'DEVOLUCION_PROVEEDOR', 'MUESTRA')),
  propietario_id uuid not null references wms.propietarios(id),
  referencia_tipo text,                              -- 'pedido' (Pedidos), 'orden_cliente', …
  referencia_id text,
  estado text not null default 'ABIERTA' check (estado in ('ABIERTA', 'CONFIRMADA', 'CANCELADA')),
  aprobada_dt_por uuid,                              -- lote vencido de un cliente: aprobación de Dirección Técnica (D-69)
  aprobada_dt_en timestamptz,
  autorizada_por uuid,                               -- muestra de Logissa: quien tiene «autoriza salidas sin venta» (D-70)
  token text,
  creada_por uuid not null,
  creada_en timestamptz not null default now(),
  -- Distribución = venta; muestra = muestra; el cliente elige cualquiera de los cinco motivos.
  check ((tipo = 'DISTRIBUCION' and motivo = 'VENTA') or (tipo = 'MUESTRA' and motivo = 'MUESTRA') or tipo = 'CLIENTE')
);
alter table wms.salidas enable row level security;
create unique index if not exists salidas_token_uk on wms.salidas (creada_por, token) where token is not null;
create index if not exists salidas_referencia_idx on wms.salidas (referencia_tipo, referencia_id);

create table if not exists wms.salida_lineas (
  id uuid primary key default gen_random_uuid(),
  salida_id uuid not null references wms.salidas(id),
  producto_id uuid not null,
  cantidad integer not null check (cantidad > 0),
  lote_indicado_id uuid references wms.lotes(id),    -- modo B: el lote que indica el cliente
  lote_fefo_id uuid references wms.lotes(id),        -- el lote que asignó la regla (A) o el indicado (B): el ORIGINAL
  lote_id uuid references wms.lotes(id),             -- el lote vigente (distinto del original solo tras la excepción)
  estado text not null default 'PENDIENTE' check (estado in
    ('PENDIENTE', 'ASIGNADA', 'SIN_STOCK', 'EN_PICKING', 'PICKEADA', 'CONFORME', 'OBSERVADA', 'CONFIRMADA', 'CANCELADA')),
  nota_stock text,
  creada_en timestamptz not null default now()
);
alter table wms.salida_lineas enable row level security;
create index if not exists salida_lineas_salida_idx on wms.salida_lineas (salida_id);

-- La asignación física (§4.2). «Comprometido» de una celda = reservas ACTIVA + EN_TRANSITO + EN_STAGING en esa celda.
create table if not exists wms.reservas (
  id uuid primary key default gen_random_uuid(),
  linea_id uuid not null references wms.salida_lineas(id),
  posicion_id uuid not null references wms.posiciones(id),          -- dónde están las unidades AHORA (rack, y staging tras la conformidad)
  posicion_origen_id uuid not null references wms.posiciones(id),
  producto_id uuid not null,
  lote_id uuid not null references wms.lotes(id),
  propietario_id uuid not null references wms.propietarios(id),
  estado_stock text not null default 'APROBADO' references wms.estados_sanitarios(codigo),
  procedencia_id uuid not null,
  cantidad integer not null check (cantidad > 0),
  cantidad_retornada integer not null default 0 check (cantidad_retornada >= 0 and cantidad_retornada <= cantidad),
  estado text not null default 'ACTIVA' check (estado in ('ACTIVA', 'EN_TRANSITO', 'EN_STAGING', 'CONSUMIDA', 'LIBERADA')),
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);
alter table wms.reservas enable row level security;
create index if not exists reservas_celda_idx on wms.reservas (posicion_id, lote_id, estado_stock, procedencia_id) where estado in ('ACTIVA', 'EN_TRANSITO', 'EN_STAGING');
create index if not exists reservas_linea_idx on wms.reservas (linea_id);

-- La excepción única a FEFO (D-62): quién, cuándo, lote anterior, lote nuevo y un motivo fijo. Inmutable.
create table if not exists wms.cambios_lote_asignado (
  id uuid primary key default gen_random_uuid(),
  linea_id uuid not null references wms.salida_lineas(id),
  lote_anterior_id uuid not null references wms.lotes(id),
  lote_nuevo_id uuid not null references wms.lotes(id),
  motivo text not null check (motivo = 'CLIENTE_SOLICITA_VENCIMIENTO_MAS_LARGO'),
  por uuid not null,
  en timestamptz not null default now()
);
alter table wms.cambios_lote_asignado enable row level security;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'cambios_lote_inmutable' and tgrelid = 'wms.cambios_lote_asignado'::regclass and not tgisinternal) then
    drop trigger cambios_lote_inmutable on wms.cambios_lote_asignado;
  end if;
end $$;
create trigger cambios_lote_inmutable before update or delete on wms.cambios_lote_asignado
  for each row execute function wms.trg_inmutable();

create table if not exists wms.ordenes_picking (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,                       -- OP-AAAA-NNNNN
  salida_id uuid not null references wms.salidas(id),
  estado text not null default 'GENERADA' check (estado in ('GENERADA', 'EN_CURSO', 'COMPLETA', 'CON_DISCREPANCIA', 'CANCELADA')),
  generada_por uuid not null,
  generada_en timestamptz not null default now()
);
alter table wms.ordenes_picking enable row level security;
create unique index if not exists ordenes_picking_una_viva on wms.ordenes_picking (salida_id) where estado <> 'CANCELADA';

create table if not exists wms.ordenes_picking_lineas (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references wms.ordenes_picking(id),
  linea_id uuid not null references wms.salida_lineas(id),
  reserva_id uuid not null references wms.reservas(id),
  posicion_id uuid not null references wms.posiciones(id),
  orden_recorrido int,                               -- foto del recorrido al generar la orden
  producto_id uuid not null,
  lote_id uuid not null references wms.lotes(id),
  vence date,
  cantidad integer not null check (cantidad > 0),
  picking text not null default 'PENDIENTE' check (picking in ('PENDIENTE', 'PICKEADA', 'DISCREPANCIA')),
  picker_id uuid,
  pickeada_en timestamptz,
  nota_picking text,
  conformidad text not null default 'PENDIENTE' check (conformidad in ('PENDIENTE', 'CONFORME', 'OBSERVADA')),
  verificador_id uuid,
  verificada_en timestamptz,
  nota_conformidad text,
  check (conformidad = 'PENDIENTE' or picking = 'PICKEADA'),
  check (verificador_id is null or verificador_id <> picker_id)       -- la conformidad la da OTRA persona
);
alter table wms.ordenes_picking_lineas enable row level security;
create index if not exists ordenes_picking_lineas_orden_idx on wms.ordenes_picking_lineas (orden_id);

-- Un paso del ledger ligado a una línea de salida. Se inserta ANTES de postear (es lo que autoriza el movimiento); el movimiento
-- se enlaza al terminar. Es la base de las invariantes (RETORNO ≤ SALIDA) y de la idempotencia.
create table if not exists wms.salida_movimientos (
  id uuid primary key default gen_random_uuid(),
  salida_id uuid not null references wms.salidas(id),
  linea_id uuid not null references wms.salida_lineas(id),
  orden_linea_id uuid references wms.ordenes_picking_lineas(id),
  tipo text not null check (tipo in ('STAGING', 'SALIDA', 'RETORNO')),
  cantidad integer not null check (cantidad > 0),
  actor_id uuid not null,                            -- quien lo registra (en STAGING, el verificador de la conformidad)
  preparador_id uuid,                                -- en STAGING, el picker
  token text,
  movimiento_id uuid references wms.movimientos(id),
  creado_en timestamptz not null default now()
);
alter table wms.salida_movimientos enable row level security;
create unique index if not exists salida_movimientos_token_uk on wms.salida_movimientos (token) where token is not null;
create index if not exists salida_movimientos_linea_idx on wms.salida_movimientos (linea_id);

-- Invariantes por línea, al confirmar la transacción (no dependen de la función que las escriba):
--   (a) lo que pasa a staging no supera lo pedido;  (b) lo que salió, neto de retornos, no supera lo que pasó a staging;
--   (c) nunca vuelve más de lo que salió (RETORNO ≤ SALIDA).
create or replace function wms.trg_invariantes_salida_movimientos()
returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_cant integer; v_st integer; v_sa integer; v_re integer;
begin
  select cantidad into v_cant from wms.salida_lineas where id = new.linea_id;
  select coalesce(sum(cantidad) filter (where tipo = 'STAGING'), 0), coalesce(sum(cantidad) filter (where tipo = 'SALIDA'), 0),
         coalesce(sum(cantidad) filter (where tipo = 'RETORNO'), 0)
    into v_st, v_sa, v_re from wms.salida_movimientos where linea_id = new.linea_id;
  if v_st > v_cant then
    raise exception 'No se puede pasar a staging más de lo pedido (pedido %, en staging %)', v_cant, v_st using errcode = 'P0001';
  end if;
  if v_re > v_sa then
    raise exception 'Un retorno no puede superar lo que salió (salió %, retorno %)', v_sa, v_re using errcode = 'P0001';
  end if;
  if v_sa - v_re > v_st then
    raise exception 'Lo que sale no puede superar lo que pasó por conformidad (conforme %, sale %)', v_st, v_sa - v_re using errcode = 'P0001';
  end if;
  return null;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'invariantes_salida_movimientos' and tgrelid = 'wms.salida_movimientos'::regclass and not tgisinternal) then
    drop trigger invariantes_salida_movimientos on wms.salida_movimientos;
  end if;
end $$;
create constraint trigger invariantes_salida_movimientos after insert or update on wms.salida_movimientos
  deferrable initially deferred for each row execute function wms.trg_invariantes_salida_movimientos();

-- RLS: lectura para el personal; nadie escribe con DML directo (todo por funciones). El cliente verá lo suyo en B3.
do $$ declare t text; begin
  foreach t in array array['salidas', 'salida_lineas', 'reservas', 'cambios_lote_asignado', 'ordenes_picking', 'ordenes_picking_lineas', 'salida_movimientos'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then
      execute format('drop policy lectura on wms.%I', t);
    end if;
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
    execute format('grant select on wms.%I to authenticated', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Una sola fuente de «comprometido» y «disponible»
-- ─────────────────────────────────────────────────────────────────────────────

-- Lo que ya está prometido en una celda: reservas de salidas vivas + movimientos internos abiertos (incluye las líneas de la orden que se está creando).
create or replace function wms._comprometido(p_posicion uuid, p_lote uuid, p_estado text, p_procedencia uuid)
returns integer language sql stable security definer set search_path = wms, pg_temp as $$
  select (coalesce((select sum(r.cantidad) from wms.reservas r
                     where r.posicion_id = p_posicion and r.lote_id = p_lote and r.estado_stock = p_estado and r.procedencia_id = p_procedencia
                       and r.estado in ('ACTIVA', 'EN_TRANSITO', 'EN_STAGING')), 0)
        + coalesce((select sum(l.cantidad) from wms.ordenes_movimiento_lineas l join wms.ordenes_movimiento o on o.id = l.orden_id
                     where o.estado in ('EJECUTADO', 'CON_DIFERENCIA') and l.verificacion in ('PENDIENTE', 'CON_DIFERENCIA')
                       and l.desde_posicion_id = p_posicion and l.lote_id = p_lote and l.estado = p_estado and l.procedencia_id = p_procedencia), 0))::integer
$$;

-- Candado por producto y propietario: asignar y mover no se pisan.
create or replace function wms._candado_stock(p_producto uuid, p_propietario uuid) returns void
language sql security definer set search_path = wms, pg_temp as $$
  select pg_advisory_xact_lock(hashtextextended('stock|' || p_producto::text || '|' || p_propietario::text, 0))
$$;

-- El «hold» de un lote Aprobado sigue pendiente de Katia (D-17 n.° 3): aquí está el punto de consulta, sin forma de bloquear todavía.
create or replace function wms.lote_bloqueado(p_lote uuid) returns boolean
language sql stable as $$ select false $$;

-- ¿Puede este lote salir en este tipo de salida? (vencidos y vida útil, D-69, D-70, D-71). `requiere_aprobacion_dt` = vencido de un cliente.
create or replace function wms._lote_apto(p_vence date, p_tipo text, p_motivo text, p_hoy date, p_min_dias integer)
returns table (apto boolean, requiere_aprobacion_dt boolean, razon text)
language plpgsql stable as $$
begin
  if p_vence is not null and p_vence < p_hoy then
    if p_tipo = 'CLIENTE' and p_motivo in ('PESQUISA_DIGEMID', 'DESTRUCCION', 'DEVOLUCION_PROVEEDOR') then
      return query select true, true, null::text;
    elsif p_tipo = 'CLIENTE' then
      return query select false, false, 'El lote está vencido: solo puede salir por pesquisa DIGEMID, destrucción o devolución al proveedor.'::text;
    else
      return query select false, false, 'El lote está vencido: el stock de Logissa nunca sale vencido.'::text;
    end if;
    return;
  end if;
  if p_tipo = 'DISTRIBUCION' and p_vence is not null and (p_vence - p_hoy) < p_min_dias then
    return query select false, false, format('El lote vence en %s días: un pedido de venta pide al menos %s.', p_vence - p_hoy, p_min_dias);
    return;
  end if;
  return query select true, false, null::text;
end $$;

-- Las celdas del propietario que pueden alimentar una salida: Aprobado, en el área Aprobados, con su saldo, lo comprometido y lo disponible.
create or replace function wms._candidatos(p_propietario uuid, p_producto uuid)
returns table (posicion_id uuid, posicion text, orden_recorrido integer, lote_id uuid, lote text, vence date, procedencia_id uuid,
               saldo integer, comprometido integer, disponible integer, en_conteo boolean)
language sql stable security definer set search_path = wms, pg_temp as $$
  select s.posicion_id, ps.codigo, ps.orden_recorrido, s.lote_id, l.codigo, l.vence, s.procedencia_id, s.cantidad,
         wms._comprometido(s.posicion_id, s.lote_id, s.estado, s.procedencia_id),
         s.cantidad - wms._comprometido(s.posicion_id, s.lote_id, s.estado, s.procedencia_id),
         exists (select 1 from wms.conteo_lineas cl join wms.conteos c on c.id = cl.conteo_id
                  where cl.posicion_id = s.posicion_id and c.estado <> 'CERRADO')
    from wms.saldos s
    join wms.posiciones ps on ps.id = s.posicion_id and ps.tipo_area = 'APROBADOS' and ps.activa
    join wms.lotes l on l.id = s.lote_id
   where s.propietario_id = p_propietario and s.producto_id = p_producto and s.estado = 'APROBADO' and s.cantidad > 0
$$;

-- Disponible y vendible por lote, en una sola fuente (saldo − comprometido). `vendible` = lo que un pedido de venta de Logissa puede tomar hoy.
create or replace function wms.disponibilidad_por_lote(p_propietario uuid, p_producto uuid default null)
returns table (producto_id uuid, lote_id uuid, lote text, vence date, dias_de_vida integer, vencido boolean,
               saldo integer, comprometido integer, disponible integer, en_conteo integer, vendible integer)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare v_hoy date := wms._hoy_lima(); v_min integer; v_dueno boolean;
begin
  if not (coalesce(wms.es_usuario(), false) or coalesce(p_propietario = wms.propietario_cliente(), false)) then
    raise exception 'Sin acceso' using errcode = '42501';
  end if;
  select coalesce((select valor::integer from wms.parametros where clave = 'vida_util_minima_venta_dias'), 60) into v_min;
  select o.es_dueno_almacen into v_dueno from wms.propietarios o where o.id = p_propietario;
  return query
  select s.producto_id, s.lote_id, l.codigo, l.vence, (l.vence - v_hoy)::integer, coalesce(l.vence < v_hoy, false),
         sum(s.cantidad)::integer,
         sum(wms._comprometido(s.posicion_id, s.lote_id, s.estado, s.procedencia_id))::integer,
         sum(s.cantidad - wms._comprometido(s.posicion_id, s.lote_id, s.estado, s.procedencia_id))::integer,
         coalesce(sum(s.cantidad - wms._comprometido(s.posicion_id, s.lote_id, s.estado, s.procedencia_id))
                  filter (where exists (select 1 from wms.conteo_lineas cl join wms.conteos c on c.id = cl.conteo_id
                                         where cl.posicion_id = s.posicion_id and c.estado <> 'CERRADO')), 0)::integer,
         case when coalesce(v_dueno, false) and not wms.lote_bloqueado(s.lote_id)
                   and (select a.apto from wms._lote_apto(l.vence, 'DISTRIBUCION', 'VENTA', v_hoy, v_min) a)
              then greatest(coalesce(sum(s.cantidad - wms._comprometido(s.posicion_id, s.lote_id, s.estado, s.procedencia_id))
                      filter (where not exists (select 1 from wms.conteo_lineas cl join wms.conteos c on c.id = cl.conteo_id
                                                 where cl.posicion_id = s.posicion_id and c.estado <> 'CERRADO')), 0), 0)::integer
              else 0 end
    from wms.saldos s
    join wms.posiciones ps on ps.id = s.posicion_id and ps.tipo_area = 'APROBADOS'
    join wms.lotes l on l.id = s.lote_id
   where s.propietario_id = p_propietario and s.estado = 'APROBADO' and s.cantidad > 0
     and (p_producto is null or s.producto_id = p_producto)
   group by s.producto_id, s.lote_id, l.codigo, l.vence
   order by l.vence nulls last, l.codigo;
end $$;

-- Stock vendible de Logissa por producto (lo que hoy se carga a mano desde Odoo y publicará el WMS; D-50, §4.1).
create or replace function wms.stock_vendible(p_producto uuid default null)
returns table (producto_id uuid, vendible integer)
language sql stable security definer set search_path = wms, pg_temp as $$
  select d.producto_id, sum(d.vendible)::integer
    from wms.propietarios o, lateral wms.disponibilidad_por_lote(o.id, p_producto) d
   where o.es_dueno_almacen and wms.es_usuario()
   group by d.producto_id having sum(d.vendible) > 0
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Asignación (modos A y B), cambio de lote, reemplazo
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._exigir_accion(p_accion text, p_mensaje text) returns void
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_permiso(p_accion) then raise exception '%', p_mensaje using errcode = '42501'; end if;
end $$;

-- Reserva `p_cantidad` unidades de UN lote para la línea, celda por celda en orden de recorrido. Quien la llama ya verificó que alcanza.
-- Una línea puede tener varias reservas de lotes distintos (D-76, tipo A); cada una lleva su lote, su celda y su cantidad.
create or replace function wms._reservar_en_lote(p_linea uuid, p_lote uuid, p_cantidad integer) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare l wms.salida_lineas; s wms.salidas; c record; v_restante integer; v_tomar integer;
begin
  select * into l from wms.salida_lineas where id = p_linea;
  select * into s from wms.salidas where id = l.salida_id;
  v_restante := p_cantidad;
  for c in select * from wms._candidatos(s.propietario_id, l.producto_id) x
            where x.lote_id = p_lote and x.disponible > 0 and not x.en_conteo
            order by x.orden_recorrido nulls last, x.posicion, x.disponible desc, x.procedencia_id loop
    exit when v_restante <= 0;
    v_tomar := least(c.disponible, v_restante);
    insert into wms.reservas (linea_id, posicion_id, posicion_origen_id, producto_id, lote_id, propietario_id, procedencia_id, cantidad)
    values (p_linea, c.posicion_id, c.posicion_id, l.producto_id, p_lote, s.propietario_id, c.procedencia_id, v_tomar);
    v_restante := v_restante - v_tomar;
  end loop;
  if v_restante > 0 then
    raise exception 'No alcanzaron las unidades al reservar (faltan %): otra persona las tomó', v_restante using errcode = 'P0002';
  end if;
end $$;

-- Asigna UNA línea. Tipo B (por cuenta de un cliente): un solo lote, el que indica el cliente, con toda la cantidad.
-- Tipo A (distribución) y muestras: el pedido no trae lote (D-76); se toma lo que haya del lote FEFO válido y se completa, automáticamente,
-- con el siguiente lote FEFO válido, y así hasta cubrir la cantidad. La línea queda con una reserva por lote y celda (cada una con su ubicación
-- en la orden de picking). Solo entran lotes aptos (no vencidos; 60 días de vida útil en distribución), sin bloqueo, fuera de conteo y con
-- saldo disponible positivo: nunca se toma más de lo disponible. Si ni sumando los lotes alcanza, no se reserva nada: la línea queda
-- SIN_STOCK y se alerta al Jefe de Transporte. Devuelve null si quedó asignada, o el motivo por el que no hay stock.
create or replace function wms._asignar_linea(p_linea uuid) returns text
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  l wms.salida_lineas; s wms.salidas;
  v_hoy date := wms._hoy_lima(); v_min integer; v_lote uuid; v_primero uuid; v_restante integer; v_tomar integer; c record;
  v_apto integer; v_total integer; v_conteo integer; v_noapto integer; v_msg text; v_prod text; v_cod text;
begin
  select * into l from wms.salida_lineas where id = p_linea for update;
  select * into s from wms.salidas where id = l.salida_id;
  perform wms._candado_stock(l.producto_id, s.propietario_id);
  v_min := case when s.tipo = 'DISTRIBUCION'
                then coalesce((select p.valor::integer from wms.parametros p where p.clave = 'vida_util_minima_venta_dias'), 60) else 0 end;

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
    -- Tipo A y muestras: FEFO lote por lote hasta cubrir la cantidad (todo o nada).
    select coalesce(sum(c2.disponible), 0)::integer into v_apto
      from wms._candidatos(s.propietario_id, l.producto_id) c2
      cross join lateral wms._lote_apto(c2.vence, s.tipo, s.motivo, v_hoy, v_min) a
     where c2.disponible > 0 and not c2.en_conteo and a.apto and not wms.lote_bloqueado(c2.lote_id);
    if v_apto >= l.cantidad then
      v_restante := l.cantidad;
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
    -- lote_id / lote_fefo_id guardan el lote principal (el primero en FEFO); el detalle por lote está en las reservas.
    update wms.salida_lineas set lote_id = v_primero, lote_fefo_id = coalesce(lote_fefo_id, v_primero), estado = 'ASIGNADA', nota_stock = null
     where id = p_linea;
    update wms.alertas set estado = 'ATENDIDA', atendida_en = now(), nota_atencion = 'La línea quedó asignada'
     where clave = 'stock:' || p_linea and estado = 'ABIERTA';
    return null;
  end if;

  -- No alcanzó: se explica por qué (poco stock, ubicaciones en conteo o lotes que no cumplen vencimiento/vida útil).
  select coalesce(sum(c2.disponible) filter (where c2.disponible > 0), 0), coalesce(sum(c2.disponible) filter (where c2.disponible > 0 and c2.en_conteo), 0),
         coalesce(sum(c2.disponible) filter (where c2.disponible > 0 and not c2.en_conteo and not a.apto), 0),
         coalesce(sum(c2.disponible) filter (where c2.disponible > 0 and not c2.en_conteo and a.apto and not wms.lote_bloqueado(c2.lote_id)), 0)
    into v_total, v_conteo, v_noapto, v_apto
    from wms._candidatos(s.propietario_id, l.producto_id) c2
    cross join lateral wms._lote_apto(c2.vence, s.tipo, s.motivo, v_hoy, v_min) a
   where l.lote_indicado_id is null or c2.lote_id = l.lote_indicado_id;
  select codigo into v_prod from catalogo.productos where id = l.producto_id;
  select codigo into v_cod from wms.lotes where id = l.lote_indicado_id;
  if l.lote_indicado_id is null then
    v_msg := format('Stock insuficiente: la línea pide %s y, sumando todos los lotes aptos, hay %s', l.cantidad, v_apto);
  else
    v_msg := format('No hay en el lote %s con %s unidades disponibles (hay %s)', v_cod, l.cantidad, v_apto);
  end if;
  v_msg := v_msg || format(' (hay %s en total', v_total)
        || case when v_conteo > 0 then format(', %s en ubicaciones en conteo', v_conteo) else '' end
        || case when v_noapto > 0 then format(', %s de lotes que no cumplen vencimiento o vida útil', v_noapto) else '' end || ')';
  update wms.salida_lineas set estado = 'SIN_STOCK', nota_stock = v_msg where id = p_linea;
  if s.tipo <> 'CLIENTE' then
    perform wms._alertar('STOCK_INSUFICIENTE', 'jefe_transporte', null, l.producto_id, 'stock:' || p_linea,
      format('Salida %s, producto %s: %s. Resuélvelo antes del picking.', s.numero, coalesce(v_prod, '?'), v_msg), v_cod);
  end if;
  return v_msg;
end $$;

-- Crea una salida y sus líneas. A (distribución) y muestras quedan PENDIENTES de asignar; B (por cuenta de un cliente) valida y reserva AL CREAR:
-- si algo no cumple, la orden no se crea y el mensaje dice por qué.
create or replace function wms.crear_salida(
  p_tipo text, p_motivo text, p_propietario uuid, p_lineas jsonb,
  p_referencia_tipo text default null, p_referencia_id text default null, p_token text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v_id uuid; v_dueno boolean; v_activo boolean; x jsonb; v_prod uuid; v_cant integer; v_lote uuid; lt wms.lotes; v_linea uuid; v_msg text; r record;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if p_tipo = 'MUESTRA' then
    perform wms._exigir_accion('autorizar_salida_sin_venta', 'Solo quien autoriza salidas sin venta registra una muestra');
  else
    perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para preparar salidas');
  end if;
  if nullif(trim(p_token), '') is not null then
    select id into v_id from wms.salidas where creada_por = auth.uid() and token = trim(p_token);
    if found then return v_id; end if;
  end if;
  if p_tipo not in ('DISTRIBUCION', 'CLIENTE', 'MUESTRA') then raise exception 'Tipo de salida desconocido' using errcode = 'P0001'; end if;
  if (p_tipo = 'DISTRIBUCION' and p_motivo is distinct from 'VENTA') or (p_tipo = 'MUESTRA' and p_motivo is distinct from 'MUESTRA')
     or (p_tipo = 'CLIENTE' and p_motivo not in ('VENTA', 'PESQUISA_DIGEMID', 'DESTRUCCION', 'DEVOLUCION_PROVEEDOR', 'MUESTRA')) or p_motivo is null then
    raise exception 'El motivo no corresponde a este tipo de salida' using errcode = 'P0001';
  end if;
  select es_dueno_almacen, activo into v_dueno, v_activo from wms.propietarios where id = p_propietario;
  if not found then raise exception 'No encontramos ese propietario' using errcode = 'P0001'; end if;
  if not v_activo then raise exception 'Ese propietario está inactivo' using errcode = 'P0001'; end if;
  if p_tipo in ('DISTRIBUCION', 'MUESTRA') and not v_dueno then
    raise exception 'Las salidas de distribución y las muestras son del dueño del almacén' using errcode = 'P0001';
  end if;
  if p_tipo = 'CLIENTE' and v_dueno then
    raise exception 'Una salida por cuenta de un cliente es de un cliente de almacenamiento' using errcode = 'P0001';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La salida no tiene líneas' using errcode = 'P0001';
  end if;

  v_id := gen_random_uuid();
  insert into wms.salidas (id, numero, tipo, motivo, propietario_id, referencia_tipo, referencia_id, autorizada_por, token, creada_por)
  values (v_id, 'SAL-' || to_char(now(), 'YYYY') || '-' || lpad(wms.siguiente_correlativo('SAL-' || to_char(now(), 'YYYY'))::text, 5, '0'),
          p_tipo, p_motivo, p_propietario, p_referencia_tipo, p_referencia_id,
          case when p_tipo = 'MUESTRA' then auth.uid() end, nullif(trim(p_token), ''), auth.uid());

  for x in select * from jsonb_array_elements(p_lineas) loop
    v_prod := (x->>'producto_id')::uuid;
    v_cant := (x->>'cantidad')::integer;
    v_lote := nullif(x->>'lote_id', '')::uuid;
    if v_cant is null or v_cant <= 0 then raise exception 'La cantidad de cada línea debe ser mayor que cero' using errcode = 'P0001'; end if;
    if not exists (select 1 from catalogo.productos where id = v_prod) then raise exception 'No encontramos uno de los productos' using errcode = 'P0001'; end if;
    if p_tipo = 'CLIENTE' then
      if v_lote is null then raise exception 'Indica el lote de cada línea' using errcode = 'P0001'; end if;
      select * into lt from wms.lotes where id = v_lote;
      if not found then raise exception 'No encontramos uno de los lotes' using errcode = 'P0001'; end if;
      if lt.propietario_id <> p_propietario then raise exception 'El lote % no es de este propietario', lt.codigo using errcode = 'P0001'; end if;
      if lt.producto_id <> v_prod then raise exception 'El lote % no corresponde al producto de la línea', lt.codigo using errcode = 'P0001'; end if;
    elsif v_lote is not null then
      raise exception 'En una salida de distribución o una muestra el sistema elige el lote por FEFO' using errcode = 'P0001';
    end if;
    insert into wms.salida_lineas (salida_id, producto_id, cantidad, lote_indicado_id) values (v_id, v_prod, v_cant, v_lote);
  end loop;

  if p_tipo = 'CLIENTE' then
    for r in select id from wms.salida_lineas where salida_id = v_id order by creada_en, id loop
      v_msg := wms._asignar_linea(r.id);
      if v_msg is not null then raise exception '%', v_msg using errcode = 'P0002'; end if;
    end loop;
  end if;
  perform wms.registrar_audit('salida_creada', 'salidas', v_id::text, null, p_lineas, p_tipo || ' / ' || p_motivo);
  return v_id;
end $$;

-- Asigna las líneas pendientes (A: cuando el pedido entra en una ruta planificada). Sin stock → SIN_STOCK + alerta; nunca falla por falta de stock.
create or replace function wms.asignar_salida(p_salida uuid)
returns table (linea_id uuid, estado text, lote_id uuid, mensaje text)
language plpgsql security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare s wms.salidas; r record; v_msg text;
begin
  perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para preparar salidas');
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La salida ya no está abierta' using errcode = 'P0001'; end if;
  for r in select id from wms.salida_lineas where salida_id = p_salida and estado in ('PENDIENTE', 'SIN_STOCK') order by creada_en, id loop
    v_msg := wms._asignar_linea(r.id);
    if v_msg is not null and s.tipo = 'CLIENTE' then raise exception '%', v_msg using errcode = 'P0002'; end if;
  end loop;
  perform wms.registrar_audit('salida_asignada', 'salidas', p_salida::text, null, null, null);
  return query select sl.id, sl.estado, sl.lote_id, sl.nota_stock from wms.salida_lineas sl where sl.salida_id = p_salida order by sl.creada_en, sl.id;
end $$;

-- Dirección Técnica aprueba una salida de cliente que lleva lotes vencidos (D-69). Sin esta aprobación no se genera la orden de picking.
create or replace function wms.aprobar_salida_vencida(p_salida uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.salidas;
begin
  perform wms._exigir_accion('aprobar', 'Solo Dirección Técnica aprueba la salida de lotes vencidos');
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  if s.tipo <> 'CLIENTE' then raise exception 'Solo las salidas de clientes pueden llevar lotes vencidos' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La salida ya no está abierta' using errcode = 'P0001'; end if;
  update wms.salidas set aprobada_dt_por = auth.uid(), aprobada_dt_en = now() where id = p_salida;
  perform wms.registrar_audit('salida_vencida_aprobada', 'salidas', p_salida::text, null, null, p_nota);
end $$;

-- La ÚNICA excepción a FEFO (D-62): antes del picking, con un motivo fijo; el lote nuevo debe vencer DESPUÉS, estar Aprobado, sin bloqueo y alcanzar.
create or replace function wms.cambiar_lote_asignado(p_linea uuid, p_lote_nuevo uuid, p_motivo text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  l wms.salida_lineas; s wms.salidas; v_old wms.lotes; v_new wms.lotes; v_hoy date := wms._hoy_lima(); v_min integer; v_apto record;
  v_disp integer; v_ord uuid;
begin
  perform wms._exigir_accion('cambiar_lote_asignado', 'Solo el Jefe de Almacén (o su reemplazo) o el Jefe de Transporte cambian el lote asignado');
  if p_motivo is distinct from 'CLIENTE_SOLICITA_VENCIMIENTO_MAS_LARGO' then
    raise exception 'El único motivo permitido es «Cliente solicita vencimiento más largo»' using errcode = 'P0001';
  end if;
  select * into l from wms.salida_lineas where id = p_linea for update;
  if not found then raise exception 'No encontramos esa línea' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = l.salida_id;
  if s.tipo <> 'DISTRIBUCION' then
    raise exception 'El lote solo se cambia en un pedido de venta (en una salida de cliente, el lote lo indica el cliente)' using errcode = 'P0001';
  end if;
  if l.estado not in ('ASIGNADA', 'EN_PICKING') then
    raise exception 'La línea no está asignada o ya salió del picking: no se cambia el lote' using errcode = 'P0001';
  end if;
  if (select count(distinct r.lote_id) from wms.reservas r where r.linea_id = p_linea and r.estado = 'ACTIVA') > 1 then
    raise exception 'La línea está repartida en varios lotes (no alcanzaba un solo lote): el cambio de lote solo aplica a líneas de un lote' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.ordenes_picking_lineas ol where ol.linea_id = p_linea and ol.picking <> 'PENDIENTE') then
    raise exception 'Ya empezó el picking de esta línea: no se cambia el lote' using errcode = 'P0001';
  end if;
  select * into v_old from wms.lotes where id = l.lote_id;
  select * into v_new from wms.lotes where id = p_lote_nuevo;
  if not found then raise exception 'No encontramos ese lote' using errcode = 'P0001'; end if;
  if v_new.producto_id <> l.producto_id or v_new.propietario_id <> s.propietario_id then
    raise exception 'El lote nuevo no corresponde al producto o al propietario de la línea' using errcode = 'P0001';
  end if;
  if v_new.id = v_old.id then raise exception 'Ese ya es el lote asignado' using errcode = 'P0001'; end if;
  if v_new.vence is null or v_old.vence is null or v_new.vence <= v_old.vence then
    raise exception 'El lote nuevo debe vencer después del asignado (asignado: %, nuevo: %)', coalesce(v_old.vence::text, 'sin fecha'), coalesce(v_new.vence::text, 'sin fecha')
      using errcode = 'P0001';
  end if;
  perform wms._candado_stock(l.producto_id, s.propietario_id);
  v_min := coalesce((select p.valor::integer from wms.parametros p where p.clave = 'vida_util_minima_venta_dias'), 60);
  select * into v_apto from wms._lote_apto(v_new.vence, s.tipo, s.motivo, v_hoy, v_min);
  if not v_apto.apto then raise exception '%', v_apto.razon using errcode = 'P0001'; end if;
  if wms.lote_bloqueado(v_new.id) then raise exception 'Ese lote está bloqueado' using errcode = 'P0001'; end if;
  -- Las unidades de esta misma línea no cuentan como disponibles del lote nuevo (son del lote anterior).
  select coalesce(sum(c.disponible) filter (where c.disponible > 0 and not c.en_conteo), 0) into v_disp
    from wms._candidatos(s.propietario_id, l.producto_id) c where c.lote_id = v_new.id;
  if v_disp < l.cantidad then
    raise exception 'El lote % no tiene suficientes unidades disponibles (hay %, la línea pide %)', v_new.codigo, v_disp, l.cantidad using errcode = 'P0002';
  end if;

  update wms.reservas set estado = 'LIBERADA', actualizada_en = now() where linea_id = p_linea and estado = 'ACTIVA';
  perform wms._reservar_en_lote(p_linea, v_new.id, l.cantidad);
  update wms.salida_lineas set lote_id = v_new.id where id = p_linea;
  insert into wms.cambios_lote_asignado (linea_id, lote_anterior_id, lote_nuevo_id, motivo, por) values (p_linea, v_old.id, v_new.id, p_motivo, auth.uid());
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
  perform wms.registrar_audit('lote_cambiado', 'salida_lineas', p_linea::text,
    jsonb_build_object('lote', v_old.id), jsonb_build_object('lote', v_new.id), p_motivo);
end $$;

-- El picker no encuentra el lote asignado (solo en A): primero el MISMO lote en otra ubicación; si no, el siguiente FEFO válido
-- (y, si la línea tenía la excepción, uno que también venza después del lote original).
create or replace function wms.proponer_reemplazo(p_linea uuid, p_lote uuid default null)
returns table (posicion_id uuid, posicion text, lote_id uuid, lote text, vence date, disponible integer, motivo text)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare l wms.salida_lineas; s wms.salidas; v_hoy date := wms._hoy_lima(); v_min integer; v_orig date; v_lote uuid; v_cant integer;
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  select * into l from wms.salida_lineas where id = p_linea;
  if not found then raise exception 'No encontramos esa línea' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = l.salida_id;
  if s.tipo = 'CLIENTE' then raise exception 'En una salida de cliente el lote lo indica el cliente: no hay reemplazo' using errcode = 'P0001'; end if;
  v_min := case when s.tipo = 'DISTRIBUCION' then coalesce((select p.valor::integer from wms.parametros p where p.clave = 'vida_util_minima_venta_dias'), 60) else 0 end;
  select lt.vence into v_orig from wms.lotes lt where lt.id = l.lote_fefo_id;
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
   where x.total >= v_cant and (v_orig is null or v_lote = l.lote_fefo_id or x.vence > v_orig)
   order by x.vence nulls last, x.lote
   limit 5;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Orden de picking, picking, conformidad, salida confirmada y retorno (§4.3)
-- ─────────────────────────────────────────────────────────────────────────────

-- Genera la orden de picking de una salida: una línea por reserva, ordenada por el recorrido del almacén. Idempotente.
create or replace function wms.generar_orden_picking(p_salida uuid) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.salidas; v_id uuid;
begin
  perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para preparar salidas');
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La salida ya no está abierta' using errcode = 'P0001'; end if;
  select id into v_id from wms.ordenes_picking where salida_id = p_salida and estado <> 'CANCELADA';
  if found then return v_id; end if;
  if exists (select 1 from wms.salida_lineas where salida_id = p_salida and estado in ('PENDIENTE', 'SIN_STOCK')) then
    raise exception 'Hay líneas sin stock o sin asignar: resuélvelas antes del picking' using errcode = 'P0001';
  end if;
  if not exists (select 1 from wms.salida_lineas where salida_id = p_salida and estado = 'ASIGNADA') then
    raise exception 'La salida no tiene líneas asignadas' using errcode = 'P0001';
  end if;
  if s.tipo = 'CLIENTE' and s.aprobada_dt_por is null
     and exists (select 1 from wms.reservas r join wms.salida_lineas sl on sl.id = r.linea_id join wms.lotes lt on lt.id = r.lote_id
                  where sl.salida_id = p_salida and r.estado = 'ACTIVA' and lt.vence is not null and lt.vence < wms._hoy_lima()) then
    raise exception 'Hay lotes vencidos: Dirección Técnica debe aprobar la salida antes del picking' using errcode = 'P0001';
  end if;
  v_id := gen_random_uuid();
  insert into wms.ordenes_picking (id, numero, salida_id, generada_por)
  values (v_id, 'OP-' || to_char(now(), 'YYYY') || '-' || lpad(wms.siguiente_correlativo('OP-' || to_char(now(), 'YYYY'))::text, 5, '0'), p_salida, auth.uid());
  insert into wms.ordenes_picking_lineas (orden_id, linea_id, reserva_id, posicion_id, orden_recorrido, producto_id, lote_id, vence, cantidad)
  select v_id, r.linea_id, r.id, r.posicion_id, ps.orden_recorrido, r.producto_id, r.lote_id, lt.vence, r.cantidad
    from wms.reservas r
    join wms.salida_lineas sl on sl.id = r.linea_id
    join wms.posiciones ps on ps.id = r.posicion_id
    join wms.lotes lt on lt.id = r.lote_id
   where sl.salida_id = p_salida and r.estado = 'ACTIVA' and sl.estado = 'ASIGNADA'
   order by ps.orden_recorrido nulls last, ps.codigo, lt.vence nulls last, r.id;
  update wms.salida_lineas set estado = 'EN_PICKING' where salida_id = p_salida and estado = 'ASIGNADA';
  perform wms.registrar_audit('orden_picking_generada', 'ordenes_picking', v_id::text, null, null, null);
  return v_id;
end $$;

-- Picking confirmado por línea: NO toca el ledger (D-41/D-51). Las unidades quedan reservadas y «en tránsito» hasta la conformidad.
create or replace function wms.registrar_picking(p_orden_linea uuid, p_resultado text, p_cantidad integer default null, p_nota text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare ol wms.ordenes_picking_lineas; v_pend integer;
begin
  perform wms._exigir_accion('ejecutar', 'No tienes permiso para hacer picking');
  select * into ol from wms.ordenes_picking_lineas where id = p_orden_linea for update;
  if not found then raise exception 'No encontramos esa línea de picking' using errcode = 'P0001'; end if;
  if ol.picking <> 'PENDIENTE' then raise exception 'Esa línea ya se registró' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.ordenes_picking o where o.id = ol.orden_id and o.estado in ('GENERADA', 'EN_CURSO', 'CON_DISCREPANCIA')) then
    raise exception 'La orden de picking ya no está abierta' using errcode = 'P0001';
  end if;
  if p_resultado = 'PICKEADA' then
    if p_cantidad is distinct from ol.cantidad then
      raise exception 'Se pickean exactamente % unidades; si no encuentras todas, registra una discrepancia', ol.cantidad using errcode = 'P0001';
    end if;
    update wms.ordenes_picking_lineas set picking = 'PICKEADA', picker_id = auth.uid(), pickeada_en = now(), nota_picking = nullif(trim(p_nota), '') where id = p_orden_linea;
    update wms.reservas set estado = 'EN_TRANSITO', actualizada_en = now() where id = ol.reserva_id and estado = 'ACTIVA';
    select count(*) into v_pend from wms.ordenes_picking_lineas where linea_id = ol.linea_id and picking <> 'PICKEADA';
    if v_pend = 0 then update wms.salida_lineas set estado = 'PICKEADA' where id = ol.linea_id and estado = 'EN_PICKING'; end if;
    update wms.ordenes_picking set estado = case when not exists (select 1 from wms.ordenes_picking_lineas x where x.orden_id = ol.orden_id and x.picking <> 'PICKEADA')
                                                  then 'COMPLETA' else 'EN_CURSO' end
     where id = ol.orden_id and estado in ('GENERADA', 'EN_CURSO');
  elsif p_resultado = 'DISCREPANCIA' then
    if nullif(trim(p_nota), '') is null then raise exception 'Cuéntanos qué pasó (no encontré el lote, faltan unidades, otra ubicación…)' using errcode = 'P0001'; end if;
    update wms.ordenes_picking_lineas set picking = 'DISCREPANCIA', picker_id = auth.uid(), pickeada_en = now(), nota_picking = trim(p_nota) where id = p_orden_linea;
    update wms.ordenes_picking set estado = 'CON_DISCREPANCIA' where id = ol.orden_id;
  else
    raise exception 'Cada línea se pickea o tiene una discrepancia' using errcode = 'P0001';
  end if;
  perform wms.registrar_audit('picking_registrado', 'ordenes_picking_lineas', p_orden_linea::text, null, jsonb_build_object('resultado', p_resultado), p_nota);
end $$;

-- Una zona activa de un tipo (staging, retorno) o la que se indique; si hay varias o ninguna, se pide indicarla.
create or replace function wms._posicion_de_zona(p_tipo_area text, p_indicada uuid) returns uuid
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_id uuid; v_n integer;
begin
  if p_indicada is not null then
    select id into v_id from wms.posiciones where id = p_indicada and tipo_area = p_tipo_area and activa;
    if v_id is null then raise exception 'Esa ubicación no es una zona de % activa', p_tipo_area using errcode = 'P0001'; end if;
    return v_id;
  end if;
  select count(*), min(id::text)::uuid into v_n, v_id from wms.posiciones where tipo_area = p_tipo_area and activa;
  if v_n = 0 then
    raise exception 'La zona % todavía no tiene ubicación física: Dirección Técnica y el Jefe de Almacén deben definirla (D-52)', p_tipo_area using errcode = 'P0001';
  elsif v_n > 1 then
    raise exception 'Hay varias ubicaciones de la zona %: indica cuál usar', p_tipo_area using errcode = 'P0001';
  end if;
  return v_id;
end $$;

-- Conformidad (la da OTRA persona, D-57): CONFORME = el MOVIMIENTO rack → staging se registra AHORA en el libro (D-51); OBSERVADA = no mueve nada.
create or replace function wms.dar_conformidad(p_orden_linea uuid, p_resultado text, p_nota text default null, p_staging uuid default null)
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
    update wms.ordenes_picking_lineas set conformidad = 'OBSERVADA', verificador_id = auth.uid(), verificada_en = now(), nota_conformidad = trim(p_nota) where id = p_orden_linea;
    update wms.salida_lineas set estado = 'OBSERVADA' where id = ol.linea_id;
    perform wms.registrar_audit('conformidad_observada', 'ordenes_picking_lineas', p_orden_linea::text, null, null, p_nota);
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
  update wms.ordenes_picking_lineas set conformidad = 'CONFORME', verificador_id = auth.uid(), verificada_en = now(), nota_conformidad = nullif(trim(p_nota), '') where id = p_orden_linea;
  select count(*) into v_pend from wms.ordenes_picking_lineas where linea_id = ol.linea_id and conformidad <> 'CONFORME';
  if v_pend = 0 then update wms.salida_lineas set estado = 'CONFORME' where id = ol.linea_id; end if;
  perform wms.registrar_audit('conformidad_dada', 'ordenes_picking_lineas', p_orden_linea::text, null, jsonb_build_object('movimiento', v_mov), p_nota);
  return v_mov;
end $$;

-- Salida confirmada: SALIDA desde staging, definitiva (§4.3). Una SALIDA por reserva; idempotente (por token y por estado).
create or replace function wms.confirmar_salida(p_salida uuid, p_token text default null) returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.salidas; r wms.reservas; v_paso uuid; v_mov uuid; v_origen text; v_n integer := 0; v_tok text;
begin
  perform wms._exigir_accion('confirmar_salida', 'No tienes permiso para confirmar salidas');
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  if s.estado = 'CONFIRMADA' then return 0; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La salida no está abierta' using errcode = 'P0001'; end if;
  for r in select rs.* from wms.reservas rs join wms.salida_lineas sl on sl.id = rs.linea_id
            where sl.salida_id = p_salida and rs.estado = 'EN_STAGING' order by rs.id for update of rs loop
    v_tok := case when nullif(trim(p_token), '') is not null then trim(p_token) || ':' || r.id end;
    if v_tok is not null and exists (select 1 from wms.salida_movimientos where token = v_tok) then continue; end if;
    select origen into v_origen from wms.partidas where procedencia_id = r.procedencia_id and lote_id = r.lote_id order by id limit 1;
    insert into wms.salida_movimientos (salida_id, linea_id, tipo, cantidad, actor_id, token)
    values (p_salida, r.linea_id, 'SALIDA', r.cantidad, auth.uid(), v_tok) returning id into v_paso;
    perform set_config('wms.salida_ctx', jsonb_build_object('paso', v_paso)::text, true);
    v_mov := wms.postear_movimiento('SALIDA', 'Salida ' || s.numero,
      jsonb_build_array(jsonb_build_object('posicion_id', r.posicion_id, 'producto_id', r.producto_id, 'lote_id', r.lote_id, 'propietario_id', r.propietario_id,
                                           'estado', r.estado_stock, 'origen', v_origen, 'procedencia_id', r.procedencia_id, 'delta', -r.cantidad)),
      'salida_linea', r.linea_id::text);
    perform set_config('wms.salida_ctx', '', true);
    update wms.salida_movimientos set movimiento_id = v_mov where id = v_paso;
    update wms.reservas set estado = 'CONSUMIDA', actualizada_en = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  update wms.salida_lineas sl set estado = 'CONFIRMADA'
   where sl.salida_id = p_salida and sl.estado = 'CONFORME'
     and not exists (select 1 from wms.reservas x where x.linea_id = sl.id and x.estado in ('ACTIVA', 'EN_TRANSITO', 'EN_STAGING'));
  if not exists (select 1 from wms.salida_lineas where salida_id = p_salida and estado not in ('CONFIRMADA', 'CANCELADA')) then
    update wms.salidas set estado = 'CONFIRMADA' where id = p_salida;
  end if;
  perform wms.registrar_audit('salida_confirmada', 'salidas', p_salida::text, null, jsonb_build_object('reservas', v_n), null);
  return v_n;
end $$;

-- Retorno de un pedido no entregado: RETORNO a la zona Retorno reservado, con el mismo lote, propietario y procedencia. Tope: nunca más de lo que salió.
create or replace function wms.registrar_retorno(p_linea uuid, p_cantidad integer, p_destino uuid default null, p_token text default null, p_lote uuid default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  l wms.salida_lineas; s wms.salidas; r wms.reservas; v_dst uuid; v_paso uuid; v_mov uuid; v_origen text; v_pend integer; v_resto integer;
  v_partidas jsonb := '[]'::jsonb; v_tomar integer; v_tok text := nullif(trim(p_token), '');
begin
  perform wms._exigir_accion('ejecutar', 'No tienes permiso para registrar retornos');
  if v_tok is not null then
    select movimiento_id into v_mov from wms.salida_movimientos where token = v_tok and tipo = 'RETORNO';
    if found then return v_mov; end if;
  end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad que vuelve debe ser mayor que cero' using errcode = 'P0001'; end if;
  select * into l from wms.salida_lineas where id = p_linea for update;
  if not found then raise exception 'No encontramos esa línea' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = l.salida_id;
  select coalesce(sum(cantidad - cantidad_retornada), 0) into v_pend from wms.reservas where linea_id = p_linea and estado = 'CONSUMIDA' and (p_lote is null or lote_id = p_lote);
  if p_cantidad > v_pend then
    raise exception 'No puede volver más de lo que salió (salieron % sin retorno, se intenta devolver %)', v_pend, p_cantidad using errcode = 'P0001';
  end if;
  v_dst := wms._posicion_de_zona('RETORNO_RESERVADO', p_destino);
  v_resto := p_cantidad;
  for r in select * from wms.reservas where linea_id = p_linea and estado = 'CONSUMIDA' and cantidad_retornada < cantidad and (p_lote is null or lote_id = p_lote) order by id for update loop
    exit when v_resto <= 0;
    v_tomar := least(v_resto, r.cantidad - r.cantidad_retornada);
    select origen into v_origen from wms.partidas where procedencia_id = r.procedencia_id and lote_id = r.lote_id order by id limit 1;
    v_partidas := v_partidas || jsonb_build_object('posicion_id', v_dst, 'producto_id', r.producto_id, 'lote_id', r.lote_id, 'propietario_id', r.propietario_id,
                                                    'estado', r.estado_stock, 'origen', v_origen, 'procedencia_id', r.procedencia_id, 'delta', v_tomar);
    update wms.reservas set cantidad_retornada = cantidad_retornada + v_tomar, actualizada_en = now() where id = r.id;
    v_resto := v_resto - v_tomar;
  end loop;
  insert into wms.salida_movimientos (salida_id, linea_id, tipo, cantidad, actor_id, token)
  values (l.salida_id, p_linea, 'RETORNO', p_cantidad, auth.uid(), v_tok) returning id into v_paso;
  perform set_config('wms.salida_ctx', jsonb_build_object('paso', v_paso)::text, true);
  v_mov := wms.postear_movimiento('RETORNO', 'Retorno de ' || s.numero, v_partidas, 'salida_linea', p_linea::text);
  perform set_config('wms.salida_ctx', '', true);
  update wms.salida_movimientos set movimiento_id = v_mov where id = v_paso;
  perform wms.registrar_audit('retorno_registrado', 'salida_lineas', p_linea::text, null, jsonb_build_object('cantidad', p_cantidad, 'movimiento', v_mov), null);
  return v_mov;
end $$;

-- Cancela una salida que todavía no salió del rack: libera las reservas. Nada en el ledger.
create or replace function wms.cancelar_salida(p_salida uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.salidas;
begin
  perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para preparar salidas');
  if nullif(trim(p_motivo), '') is null then raise exception 'La cancelación necesita un motivo' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La salida ya no está abierta' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.reservas r join wms.salida_lineas sl on sl.id = r.linea_id
              where sl.salida_id = p_salida and r.estado in ('EN_TRANSITO', 'EN_STAGING', 'CONSUMIDA')) then
    raise exception 'Ya hay unidades pickeadas o en staging: se resuelve por conformidad y retorno, no se cancela' using errcode = 'P0001';
  end if;
  update wms.reservas set estado = 'LIBERADA', actualizada_en = now()
   where estado = 'ACTIVA' and linea_id in (select id from wms.salida_lineas where salida_id = p_salida);
  update wms.ordenes_picking set estado = 'CANCELADA' where salida_id = p_salida and estado <> 'CANCELADA';
  update wms.salida_lineas set estado = 'CANCELADA' where salida_id = p_salida;
  update wms.alertas set estado = 'ATENDIDA', atendida_en = now(), nota_atencion = 'La salida se canceló'
   where estado = 'ABIERTA' and clave in (select 'stock:' || id from wms.salida_lineas where salida_id = p_salida);
  update wms.salidas set estado = 'CANCELADA' where id = p_salida;
  perform wms.registrar_audit('salida_cancelada', 'salidas', p_salida::text, null, null, p_motivo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Ledger y Mover: ahora conocen las salidas (se vuelve a copiar el cuerpo completo de cada función)
-- ─────────────────────────────────────────────────────────────────────────────

-- postear_movimiento (de la 0007): + contexto de salidas verificado contra el paso escrito, SALIDA/RETORNO solo por el flujo de salidas,
-- y Mover manual fuera de las zonas de salida.
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
  v_preparador uuid;
  v_sctx jsonb := nullif(current_setting('wms.salida_ctx', true), '')::jsonb;
  v_paso wms.salida_movimientos;
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

  -- Salidas (S2): staging (MOVIMIENTO), SALIDA y RETORNO solo los registra el flujo de salidas, dentro de su transacción, y aquí se vuelve a
  -- comprobar contra el paso que esa función dejó escrito (misma idea que `orden_ctx`): quien llama no puede fabricar el contexto.
  if v_sctx is not null then
    if v_ctx is not null then raise exception 'Contexto de salida inválido' using errcode = '42501'; end if;
    select * into v_paso from wms.salida_movimientos m
     where m.id = (v_sctx->>'paso')::uuid and m.movimiento_id is null and m.actor_id = v_actor
       and ((p_tipo = 'MOVIMIENTO' and m.tipo = 'STAGING') or (p_tipo = 'SALIDA' and m.tipo = 'SALIDA') or (p_tipo = 'RETORNO' and m.tipo = 'RETORNO'));
    if not found then raise exception 'Contexto de salida inválido' using errcode = '42501'; end if;
    if p_tipo = 'MOVIMIENTO' then
      v_ejecutor := v_paso.preparador_id; v_verificador := v_actor;      -- el picker ejecutó; quien da la conformidad verifica (D-15)
    end if;
  elsif p_tipo in ('SALIDA', 'RETORNO') then
    raise exception 'Las salidas y los retornos solo se registran por el flujo de salidas' using errcode = '42501';
  elsif p_tipo = 'MOVIMIENTO' and v_ctx is null and exists (
          select 1 from jsonb_array_elements(p_partidas) x join wms.posiciones ps on ps.id = (x->>'posicion_id')::uuid
           where ps.tipo_area in ('EMBALAJE', 'DESPACHO', 'PENDIENTE_CONFORMIDAD', 'OBSERVADO', 'RETORNO_RESERVADO')) then
    raise exception 'Embalaje, Despacho y las zonas de salida se usan solo en las salidas: no se mueven a mano' using errcode = '42501';
  end if;

  -- Permisos por tipo (además, las policies bloquean todo DML directo).
  if p_tipo = 'CAMBIO_ESTADO' and not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica registra cambios de estado sanitario' using errcode = '42501';
  elsif p_tipo = 'AJUSTE' and not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica aprueba ajustes' using errcode = '42501';
  elsif p_tipo = 'CARGA_INICIAL' and not wms.tiene_permiso('configurar') then
    raise exception 'No tienes permiso para la carga inicial' using errcode = '42501';
  elsif p_tipo in ('INGRESO', 'MOVIMIENTO', 'REVERSA') and v_ctx is null and v_sctx is null and not wms.tiene_permiso('ejecutar') then
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

-- validar_movimiento (de la 0006): + reglas de SALIDA (solo resta, desde staging o Retorno reservado, Aprobado, con su línea) y de RETORNO.
create or replace function wms.validar_movimiento(p_mov uuid)
returns void language plpgsql set search_path = wms, pg_temp as $$
declare
  v wms.movimientos;
  r record;
begin
  select * into v from wms.movimientos where id = p_mov;
  if not found then return; end if;

  if v.tipo = 'INGRESO' then
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and delta < 0) then
      raise exception 'Un ingreso solo suma unidades' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and origen = 'DEVOLUCION' and estado <> 'DEVOLUCIONES') then
      raise exception 'Una devolución nace en el estado Devoluciones, nunca en Cuarentena' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and origen <> 'DEVOLUCION' and estado <> 'CUARENTENA') then
      raise exception 'Todo ingreso de compra o de cliente nace en Cuarentena' using errcode = 'P0001';
    end if;
  elsif v.tipo = 'CARGA_INICIAL' then
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and delta < 0) then
      raise exception 'La carga inicial solo suma unidades' using errcode = 'P0001';
    end if;
  elsif v.tipo = 'MOVIMIENTO' then
    for r in
      select producto_id, lote_id, propietario_id, procedencia_id, estado, sum(delta) as neto
        from wms.partidas where movimiento_id = p_mov
       group by 1, 2, 3, 4, 5 having sum(delta) <> 0
    loop
      raise exception 'Un movimiento interno no puede cambiar el estado ni la cantidad (estado %, neto %)', r.estado, r.neto
        using errcode = 'P0001';
    end loop;
  elsif v.tipo = 'CAMBIO_ESTADO' then
    for r in
      select posicion_id, producto_id, lote_id, propietario_id, procedencia_id, sum(delta) as neto
        from wms.partidas where movimiento_id = p_mov
       group by 1, 2, 3, 4, 5 having sum(delta) <> 0
    loop
      raise exception 'Un cambio de estado no puede cambiar la cantidad' using errcode = 'P0001';
    end loop;
    for r in
      select o.estado as desde, d.estado as hasta, o.producto_id, o.lote_id
        from wms.partidas o join wms.partidas d
          on d.movimiento_id = o.movimiento_id and d.posicion_id = o.posicion_id
         and d.producto_id = o.producto_id and d.lote_id = o.lote_id
         and d.propietario_id = o.propietario_id and d.procedencia_id = o.procedencia_id
       where o.movimiento_id = p_mov and o.delta < 0 and d.delta > 0
    loop
      if not exists (select 1 from wms.transiciones_estado t where t.desde = r.desde and t.hasta = r.hasta) then
        raise exception 'Transición no permitida: % → %', r.desde, r.hasta using errcode = 'P0001';
      end if;
      if r.hasta = 'APROBADO' then
        -- D-37: sin validación adicional; para aprobar, Dirección Técnica o su asistente dejaron cargado el registro y su vencimiento.
        if not exists (select 1 from wms.producto_regulatorio pr
                        where pr.producto_id = r.producto_id and nullif(trim(pr.registro_sanitario), '') is not null
                          and pr.rs_vence is not null) then
          raise exception 'El producto no tiene su registro sanitario y su vencimiento cargados: no se puede aprobar' using errcode = 'P0001';
        end if;
        if exists (select 1 from wms.producto_regulatorio pr
                    where pr.producto_id = r.producto_id and pr.rs_vence is not null and pr.rs_vence < current_date) then
          raise exception 'El registro sanitario está vencido: el lote no se puede aprobar hasta que Dirección Técnica lo resuelva'
            using errcode = 'P0001';
        end if;
      end if;
    end loop;
    if v.sustento_id is null then
      raise exception 'Un cambio de estado necesita su sustento (acta firmada)' using errcode = 'P0001';
    end if;
  elsif v.tipo = 'AJUSTE' then
    if v.sustento_id is null then
      raise exception 'Un ajuste necesita su sustento (evidencia y aprobación)' using errcode = 'P0001';
    end if;
  elsif v.tipo = 'SALIDA' then
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and delta > 0) then
      raise exception 'Una salida solo resta unidades' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.partidas p join wms.posiciones ps on ps.id = p.posicion_id
                where p.movimiento_id = p_mov and ps.tipo_area not in ('PENDIENTE_CONFORMIDAD', 'RETORNO_RESERVADO')) then
      raise exception 'Una salida sale de staging (o de la zona de retorno reservado), nunca directo del rack' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and estado <> 'APROBADO') then
      raise exception 'Solo sale stock Aprobado' using errcode = 'P0001';
    end if;
    if v.referencia_tipo is distinct from 'salida_linea' or v.referencia_id is null then
      raise exception 'Una salida referencia su línea de salida' using errcode = 'P0001';
    end if;
  elsif v.tipo = 'RETORNO' then
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and delta < 0) then
      raise exception 'Un retorno solo suma unidades' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.partidas p join wms.posiciones ps on ps.id = p.posicion_id
                where p.movimiento_id = p_mov and ps.tipo_area <> 'RETORNO_RESERVADO') then
      raise exception 'Un retorno entra a la zona Retorno reservado' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and estado <> 'APROBADO') then
      raise exception 'El retorno conserva el estado Aprobado' using errcode = 'P0001';
    end if;
    if v.referencia_tipo is distinct from 'salida_linea' or v.referencia_id is null then
      raise exception 'Un retorno referencia su línea de salida' using errcode = 'P0001';
    end if;
  end if;

  if v.verificador_id is not null and v.verificador_id = v.ejecutor_id then
    raise exception 'El verificador no puede ser quien ejecutó el movimiento' using errcode = 'P0001';
  end if;
  if v.verificador_id is not null and v.verificador_id = v.preparador_id then
    raise exception 'El verificador no puede ser quien preparó el movimiento' using errcode = 'P0001';
  end if;
end $$;

-- ejecutar_movimiento (de la 0007): el «reservado» sale de wms._comprometido (movimientos abiertos + reservas de salidas) y toma el candado por producto.
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
    -- Una sola fuente de «comprometido»: movimientos internos abiertos (incluye las líneas ya cargadas de ESTA orden) y reservas de salidas.
    perform wms._candado_stock(v_lote.producto_id, v_lote.propietario_id);
    v_reservado := wms._comprometido(v_desde, v_lote.id, v_estado, v_proc);
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

-- revertir_movimiento (de la 0002): un movimiento de una salida no se revierte a mano.
create or replace function wms.revertir_movimiento(p_movimiento uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v wms.movimientos;
  v_partidas jsonb;
begin
  if not wms.tiene_rol('jefe_almacen', 'reemplazo_jefe', 'direccion_tecnica') then
    raise exception 'Solo el Jefe de Almacén (o su reemplazo) o Dirección Técnica revierten movimientos'
      using errcode = '42501';
  end if;
  select * into v from wms.movimientos where id = p_movimiento;
  if not found then raise exception 'Movimiento inexistente' using errcode = 'P0001'; end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'La reversa necesita un motivo' using errcode = 'P0001';
  end if;
  if v.tipo = 'CAMBIO_ESTADO' then
    raise exception 'Un cambio de estado no se revierte (Aprobado nunca vuelve a Cuarentena): se corrige con un nuevo cambio hacia Bajas/Rechazados'
      using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.salida_movimientos sm where sm.movimiento_id = p_movimiento) then
    raise exception 'Este movimiento pertenece a una salida: se corrige por el flujo de salidas (conformidad, retorno), no con una reversa' using errcode = 'P0001';
  end if;
  if v.reversa_de is not null then
    raise exception 'No se revierte una reversa' using errcode = 'P0001';
  end if;
  select jsonb_agg(jsonb_build_object(
           'posicion_id', posicion_id, 'producto_id', producto_id, 'lote_id', lote_id,
           'propietario_id', propietario_id, 'estado', estado, 'origen', origen,
           'procedencia_id', procedencia_id, 'delta', -delta))
    into v_partidas from wms.partidas where movimiento_id = p_movimiento;
  return wms.postear_movimiento('REVERSA', p_motivo, v_partidas, 'movimiento', p_movimiento::text,
                                null, null, p_movimiento);
end $$;

-- kardex_filas (de la 0007): + SALIDA y RETORNO.
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
       and coalesce(mo.tipo, m.tipo) in ('INGRESO', 'CARGA_INICIAL', 'AJUSTE', 'CAMBIO_PROPIETARIO', 'SALIDA', 'RETORNO')
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
                                                                  when 'CARGA_INICIAL' then 'carga inicial' when 'SALIDA' then 'salida' when 'RETORNO' then 'retorno' else lower(r.tipo_original) end
              when r.tipo = 'INGRESO' then 'Acta de Recepción' when r.tipo = 'CARGA_INICIAL' then 'Carga inicial'
              when r.tipo = 'AJUSTE' then 'Ajuste autorizado' when r.tipo = 'SALIDA' then 'Salida'
              when r.tipo = 'RETORNO' then 'Retorno de pedido no entregado' else 'Cambio de propietario' end,
         r.acta_numero, r.acta_fecha, r.lote_codigo, r.contraparte_nombre, r.contraparte_ruc,
         case when r.guia_numero is not null then 'GUÍA DE REMISIÓN' when r.factura_numero is not null then 'FACTURA' else r.doc_original_tipo end,
         coalesce(r.guia_numero, r.factura_numero, r.doc_original_numero),
         r.posicion, greatest(r.delta, 0), greatest(-r.delta, 0),
         ((select saldo from inicial) + sum(r.delta) over (order by r.ts, r.partida_id))::integer,
         r.tipo_ingreso, r.propietario, (select nombre from prod), r.movimiento_id, r.tipo = 'REVERSA', r.motivo
    from rango r
   order by 1
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Conteos: no se programa un conteo donde hay unidades pickeadas o en staging (igual que donde hay movimientos abiertos)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.trg_conteo_sin_salidas_abiertas()
returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_pos text;
begin
  select ps.codigo into v_pos
    from wms.reservas r join wms.posiciones ps on ps.id = r.posicion_id
   where r.posicion_id = new.posicion_id and r.estado in ('EN_TRANSITO', 'EN_STAGING') limit 1;
  if v_pos is not null then
    raise exception 'La ubicación % tiene unidades de una salida en picking o en staging: no se cuenta hasta que salgan o vuelvan', v_pos using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'conteo_sin_salidas_abiertas' and tgrelid = 'wms.conteo_lineas'::regclass and not tgisinternal) then
    drop trigger conteo_sin_salidas_abiertas on wms.conteo_lineas;
  end if;
end $$;
create trigger conteo_sin_salidas_abiertas before insert on wms.conteo_lineas
  for each row execute function wms.trg_conteo_sin_salidas_abiertas();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Auditoría de respaldo, grants y funciones (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function
  wms.disponibilidad_por_lote(uuid, uuid), wms.stock_vendible(uuid), wms.lote_bloqueado(uuid),
  wms.crear_salida(text, text, uuid, jsonb, text, text, text), wms.asignar_salida(uuid), wms.aprobar_salida_vencida(uuid, text),
  wms.cambiar_lote_asignado(uuid, uuid, text), wms.proponer_reemplazo(uuid, uuid), wms.generar_orden_picking(uuid),
  wms.registrar_picking(uuid, text, integer, text), wms.dar_conformidad(uuid, text, text, uuid), wms.confirmar_salida(uuid, text),
  wms.registrar_retorno(uuid, integer, uuid, text, uuid), wms.cancelar_salida(uuid, text) to authenticated;
revoke execute on all functions in schema wms from public;
