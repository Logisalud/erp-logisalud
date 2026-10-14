-- 0014 · WMS · Salidas · S3: la bandeja de pedidos
--
-- Los pedidos que Pedidos deja listos para operaciones (READY_FOR_OPERATIONS) entran al WMS como un SNAPSHOT versionado:
--   · `pedidos_despacho`: una fila por (pedido, versión), con el cliente y las líneas tal como estaban al importarse. Importar es idempotente:
--     la misma versión no duplica y una versión más vieja que la vigente no pisa nada. Una versión nueva deja la anterior como historia y
--     avisa al Jefe de Transporte (alerta PEDIDO_CAMBIADO): no se pisa en silencio.
--   · `importaciones_pedidos`: cada intento de importar (también los fallidos) para mostrar «última actualización hace X»; si Pedidos no responde,
--     el WMS sigue con lo ya importado.
-- No toca Pedidos ni el stock. La conexión con Pedidos (HTTP firmado con HMAC) vive en la aplicación; aquí solo se guarda lo que llega.
-- Re-ejecutable. Se aplica a mano, después de la 0013. Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Alerta nueva
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'alertas_tipo_check' and conrelid = 'wms.alertas'::regclass) then
    alter table wms.alertas drop constraint alertas_tipo_check;
  end if;
  alter table wms.alertas add constraint alertas_tipo_check check (tipo in (
    'TEMPERATURA', 'RS_VENCIDO', 'DIVERGENCIA_COMPRAS', 'POR_TRASLADAR_VENCIDO', 'LOTE_POR_VENCER', 'LOTE_VENCIDO',
    'SOLICITUD_AJUSTADA', 'EXCEDE_OC', 'POR_REGISTRAR_EN_COMPRAS', 'NO_COINCIDE_CON_COMPRAS',
    'MOVIMIENTO_CON_DIFERENCIA', 'MOVIMIENTO_SIN_VERIFICAR', 'CONTEO_CON_DIFERENCIA', 'AJUSTE_POR_AUTORIZAR', 'PENDIENTE_AFECTA_PRODUCTO',
    'STOCK_INSUFICIENTE', 'PEDIDO_CAMBIADO'));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tablas
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.importaciones_pedidos (
  id uuid primary key default gen_random_uuid(),
  en timestamptz not null default now(),
  por uuid not null,
  origen text not null,
  ok boolean not null,
  mensaje text,                                      -- por qué falló (si no se pudo importar)
  recibidos integer not null default 0,
  nuevos integer not null default 0,
  nuevas_versiones integer not null default 0,
  iguales integer not null default 0,
  antiguas integer not null default 0,
  descartados jsonb not null default '[]'::jsonb     -- [{referencia, motivo}]
);
alter table wms.importaciones_pedidos enable row level security;
create index if not exists importaciones_pedidos_en_idx on wms.importaciones_pedidos (en desc);

create table if not exists wms.pedidos_despacho (
  id uuid primary key default gen_random_uuid(),
  pedido_id text not null,                           -- el id del pedido en Pedidos
  version integer not null check (version >= 1),
  numero text not null,
  fecha date not null,
  cliente_id text not null,
  cliente_nombre text not null,
  cliente_ruc text,
  snapshot jsonb not null,                           -- el pedido completo tal como llegó (cliente, líneas, cita, vehículo, condición de pago)
  cambios jsonb not null default '[]'::jsonb,        -- en palabras, lo que cambió respecto de la versión anterior
  vigente boolean not null default true,             -- la versión que se trabaja; las anteriores quedan como historia
  cambio_pendiente boolean not null default false,   -- llegó una versión nueva y nadie del WMS la revisó todavía
  salida_id uuid references wms.salidas(id),         -- la salida que lo tomó (la crea la planificación de rutas, S4)
  importado_por uuid not null,
  importado_en timestamptz not null default now(),
  unique (pedido_id, version)
);
alter table wms.pedidos_despacho enable row level security;
create unique index if not exists pedidos_despacho_vigente_uk on wms.pedidos_despacho (pedido_id) where vigente;
create index if not exists pedidos_despacho_salida_idx on wms.pedidos_despacho (salida_id) where salida_id is not null;

-- El snapshot no se edita: de una fila solo cambian «vigente», «cambio_pendiente» y «salida_id». Nada se borra.
create or replace function wms.trg_pedidos_despacho_snapshot()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un pedido importado no se borra' using errcode = 'P0001';
  end if;
  if (new.pedido_id, new.version, new.numero, new.fecha, new.cliente_id, new.cliente_nombre, new.cliente_ruc, new.snapshot, new.cambios, new.importado_por, new.importado_en)
     is distinct from
     (old.pedido_id, old.version, old.numero, old.fecha, old.cliente_id, old.cliente_nombre, old.cliente_ruc, old.snapshot, old.cambios, old.importado_por, old.importado_en) then
    raise exception 'El snapshot de un pedido importado no se edita: una versión nueva es una fila nueva' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'pedidos_despacho_snapshot' and tgrelid = 'wms.pedidos_despacho'::regclass and not tgisinternal) then
    drop trigger pedidos_despacho_snapshot on wms.pedidos_despacho;
  end if;
end $$;
create trigger pedidos_despacho_snapshot before update or delete on wms.pedidos_despacho
  for each row execute function wms.trg_pedidos_despacho_snapshot();

-- Un intento de importación tampoco se edita ni se borra.
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'importaciones_inmutable' and tgrelid = 'wms.importaciones_pedidos'::regclass and not tgisinternal) then
    drop trigger importaciones_inmutable on wms.importaciones_pedidos;
  end if;
end $$;
create trigger importaciones_inmutable before update or delete on wms.importaciones_pedidos
  for each row execute function wms.trg_inmutable();

-- Lectura: quien trabaja las salidas (la bandeja trae datos del cliente). Nadie escribe con DML directo: todo por funciones.
do $$ declare t text; begin
  foreach t in array array['pedidos_despacho', 'importaciones_pedidos'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then
      execute format('drop policy lectura on wms.%I', t);
    end if;
    execute format($p$create policy lectura on wms.%I for select to authenticated
      using (wms.es_usuario() and wms.tiene_rol('jefe_transporte', 'jefe_almacen', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura'))$p$, t);
    execute format('grant select on wms.%I to authenticated', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lo que cambió entre dos versiones (el mismo texto que arma el dominio: resumirCambios)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._cambios_de_pedido(p_antes jsonb, p_nuevo jsonb) returns jsonb
language plpgsql immutable set search_path = wms, pg_temp as $$
declare r jsonb := '[]'::jsonb; l jsonb; a jsonb;
begin
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
  return r;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Importar (idempotente) y revisar un cambio
-- ─────────────────────────────────────────────────────────────────────────────

-- p_pedidos: [{pedidoId, numero, version, estado, fecha, cliente:{id, nombre, ruc, direccion, ventanaCita, vehiculoCalificado}, vendedor, condicionPago,
--              factura, observaciones, lineas:[{lineaId, productoCodigo, descripcion, cantidad}]}, …] (lo que valida el dominio antes de llamar).
-- p_error: si no se pudo traer nada de Pedidos, el motivo; queda el intento y no se toca lo ya importado.
create or replace function wms.registrar_importacion_pedidos(p_origen text, p_pedidos jsonb, p_error text default null)
returns jsonb language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  e jsonb; v_imp uuid := gen_random_uuid(); v_desc jsonb := '[]'::jsonb;
  v_nuevos integer := 0; v_nv integer := 0; v_iguales integer := 0; v_ant integer := 0;
  v_vig wms.pedidos_despacho; v_ver integer; v_cambios jsonb; v_salida text; v_existe boolean; v_motivo text; v_l jsonb;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_rol('jefe_transporte', 'jefe_almacen') then
    raise exception 'No tienes permiso para actualizar la bandeja de pedidos' using errcode = '42501';
  end if;
  if p_error is not null and btrim(p_error) <> '' then
    insert into wms.importaciones_pedidos (id, por, origen, ok, mensaje) values (v_imp, auth.uid(), coalesce(nullif(btrim(p_origen), ''), 'desconocido'), false, left(p_error, 500));
    return jsonb_build_object('importacion_id', v_imp, 'ok', false, 'mensaje', left(p_error, 500));
  end if;
  if p_pedidos is null or jsonb_typeof(p_pedidos) <> 'array' then
    raise exception 'Los pedidos deben venir en una lista' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('importar_pedidos', 0));

  -- primero las versiones más bajas de cada pedido: la más alta queda vigente
  for e in select x from jsonb_array_elements(p_pedidos) x order by x->>'pedidoId', case when x->>'version' ~ '^[0-9]+$' then (x->>'version')::integer end nulls first loop
    v_motivo := null;
    if coalesce(e->>'pedidoId', '') = '' then v_motivo := 'Falta el identificador del pedido.';
    elsif coalesce(e->>'numero', '') = '' then v_motivo := 'Falta el número del pedido.';
    elsif coalesce(e->>'version', '') !~ '^[0-9]+$' or (e->>'version')::integer < 1 then v_motivo := 'La versión debe ser un entero desde 1.';
    elsif e->>'estado' is distinct from 'READY_FOR_OPERATIONS' then v_motivo := 'Solo se importan pedidos READY_FOR_OPERATIONS.';
    elsif coalesce(e->>'fecha', '') !~ '^\d{4}-\d{2}-\d{2}' then v_motivo := 'Falta la fecha del pedido (AAAA-MM-DD).';
    elsif coalesce(e->'cliente'->>'id', '') = '' or coalesce(e->'cliente'->>'nombre', '') = '' then v_motivo := 'Falta el cliente (id y nombre).';
    elsif jsonb_typeof(e->'lineas') is distinct from 'array' or jsonb_array_length(e->'lineas') = 0 then v_motivo := 'El pedido no trae líneas.';
    else
      for v_l in select * from jsonb_array_elements(e->'lineas') loop
        if coalesce(v_l->>'lineaId', '') = '' or coalesce(v_l->>'productoCodigo', '') = '' then v_motivo := 'Una línea no trae su id o el código del producto.'; exit; end if;
        if coalesce(v_l->>'cantidad', '') !~ '^[0-9]+$' or (v_l->>'cantidad')::integer <= 0 then v_motivo := format('La línea de %s debe pedir una cantidad entera mayor que cero.', v_l->>'productoCodigo'); exit; end if;
      end loop;
    end if;
    if v_motivo is not null then
      v_desc := v_desc || jsonb_build_array(jsonb_build_object('referencia', coalesce(e->>'numero', e->>'pedidoId'), 'motivo', v_motivo));
      continue;
    end if;
    v_ver := (e->>'version')::integer;
    select * into v_vig from wms.pedidos_despacho where pedido_id = e->>'pedidoId' and vigente;
    v_existe := found;
    if v_existe and v_vig.version = v_ver then v_iguales := v_iguales + 1; continue; end if;
    if v_existe and v_vig.version > v_ver then v_ant := v_ant + 1; continue; end if;
    if exists (select 1 from wms.pedidos_despacho where pedido_id = e->>'pedidoId' and version = v_ver) then v_ant := v_ant + 1; continue; end if;

    v_cambios := case when v_existe then wms._cambios_de_pedido(v_vig.snapshot, e) else '[]'::jsonb end;
    if v_existe then update wms.pedidos_despacho set vigente = false where id = v_vig.id; end if;
    insert into wms.pedidos_despacho (pedido_id, version, numero, fecha, cliente_id, cliente_nombre, cliente_ruc, snapshot, cambios, vigente,
                                      cambio_pendiente, salida_id, importado_por)
    values (e->>'pedidoId', v_ver, e->>'numero', (e->>'fecha')::date, e->'cliente'->>'id', e->'cliente'->>'nombre', nullif(e->'cliente'->>'ruc', ''), e, v_cambios, true,
            v_existe, case when v_existe then v_vig.salida_id end, auth.uid());
    if v_existe then
      v_nv := v_nv + 1;
      select numero into v_salida from wms.salidas where id = v_vig.salida_id;
      perform wms._alertar('PEDIDO_CAMBIADO', 'jefe_transporte', null, null, 'pedido-cambiado:' || (e->>'pedidoId') || ':' || v_ver,
        format('El pedido %s cambió en Pedidos (versión %s)%s%s', e->>'numero', v_ver,
               case when jsonb_array_length(v_cambios) > 0 then ': ' || (select string_agg(x #>> '{}', '; ') from jsonb_array_elements(v_cambios) x) else '' end,
               case when v_salida is not null then format('. Ya tiene la salida %s: revísala antes del picking.', v_salida) else '.' end));
    else
      v_nuevos := v_nuevos + 1;
    end if;
  end loop;

  insert into wms.importaciones_pedidos (id, por, origen, ok, recibidos, nuevos, nuevas_versiones, iguales, antiguas, descartados)
  values (v_imp, auth.uid(), coalesce(nullif(btrim(p_origen), ''), 'desconocido'), true, jsonb_array_length(p_pedidos), v_nuevos, v_nv, v_iguales, v_ant, v_desc);
  perform wms.registrar_audit('pedidos_importados', 'importaciones_pedidos', v_imp::text, null,
    jsonb_build_object('nuevos', v_nuevos, 'nuevas_versiones', v_nv, 'iguales', v_iguales, 'antiguas', v_ant, 'descartados', jsonb_array_length(v_desc)), p_origen);
  return jsonb_build_object('importacion_id', v_imp, 'ok', true, 'nuevos', v_nuevos, 'nuevas_versiones', v_nv, 'iguales', v_iguales, 'antiguas', v_ant, 'descartados', v_desc);
end $$;

-- Quien planifica da por revisado el cambio de un pedido (la alerta queda para su cierre normal).
create or replace function wms.revisar_cambio_pedido(p_pedido_id text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v wms.pedidos_despacho;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_rol('jefe_transporte', 'jefe_almacen') then
    raise exception 'No tienes permiso para revisar cambios de pedidos' using errcode = '42501';
  end if;
  select * into v from wms.pedidos_despacho where pedido_id = p_pedido_id and vigente for update;
  if not found then raise exception 'No encontramos ese pedido en la bandeja' using errcode = 'P0001'; end if;
  if not v.cambio_pendiente then raise exception 'Ese pedido no tiene cambios por revisar' using errcode = 'P0001'; end if;
  update wms.pedidos_despacho set cambio_pendiente = false where id = v.id;
  perform wms.registrar_audit('cambio_pedido_revisado', 'pedidos_despacho', v.id::text, null, jsonb_build_object('version', v.version), v.numero);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.registrar_importacion_pedidos(text, jsonb, text), wms.revisar_cambio_pedido(text) to authenticated;
revoke execute on all functions in schema wms from public;
