-- 0028 · WMS · SA-2 · Cómo iniciar una Orden de Salida: desde la bandeja, desde la ruta o a mano (tipos A, B y C)
--
-- Sebas (GM, 2026-10-19): «no sé cómo iniciar una salida». Esta migración da las tres formas y las ata a una sola regla: un pedido no puede tener dos órdenes.
--   1. `salidas` guarda de dónde nació (`origen`, `creada_desde`), el número de pedido, si está «por conciliar con Pedidos» (D-80 todavía no existe), los datos del cliente que se
--      escribieron a mano, la GRE que trae un cliente de almacenamiento (número y PDF) y «en nombre de quién» se creó.
--   2. Índice único parcial por número de pedido normalizado (sin canceladas): la base rechaza la segunda orden de un pedido aunque la pantalla falle.
--   3. `crear_orden_de_pedido` / `crear_ordenes_pendientes`: crean la orden desde la bandeja (stock asignado por FEFO). La ruta, al planificar, reutiliza esa orden, y al quitar un pedido
--      de una ruta solo se libera la orden si nació en esa ruta (`planificar_ruta` y `cancelar_ruta` se reescriben con ese cambio y nada más).
--   4. `crear_orden_salida_manual`: tipo A (venta a un cliente de distribución, solo el Jefe de Transporte, con N.° de pedido obligatorio), tipo B (por cuenta de un cliente de
--      almacenamiento, con su GRE) y tipo C (muestra o devolución al proveedor). Exige el rol correcto por tipo antes de llamar a `crear_salida`; es idempotente por token.
--   5. Cuando el pedido llega después por la bandeja y ya hay una orden manual con ese número, un disparador la une al pedido (se vincula `pedidos_despacho.salida_id`, la
--      referencia pasa al id real, se quita «por conciliar» y queda en auditoría) sin crear otra y sin reiniciar lo ya avanzado. Va como disparador y no dentro de
--      `registrar_importacion_pedidos` para no reescribir esa función (otras migraciones la tocan en paralelo).
--   6. Códigos de un producto (barras, el del cliente de almacenamiento, el del proveedor): hasta hoy el WMS solo conocía el código interno. Tabla `producto_codigos` + función
--      para agregarlos; la búsqueda de la pantalla nueva los usa.
--
-- Requiere 0012, 0014, 0017, 0022 y 0026. Re-ejecutable. Se aplica a mano (nunca al mergear). RLS desde el `create table`. Termina con el `revoke execute … from public`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Permiso y alerta
-- ─────────────────────────────────────────────────────────────────────────────

select wms._ampliar_check_in('wms.permisos_rol', 'permisos_rol_accion_check', 'accion', array['crear_orden_venta_manual']);
select wms._ampliar_check_in('wms.alertas', 'alertas_tipo_check', 'tipo', array['ORDEN_MANUAL_UNIDA']);

-- La venta manual (tipo A) la crea solo el Jefe de Transporte (Sebas, 2026-10-19). Una fila de `permisos_rol` lo cambia.
insert into wms.permisos_rol (rol, accion) values ('jefe_transporte', 'crear_orden_venta_manual') on conflict (rol, accion) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Lo que una salida recuerda de su origen
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.salidas add column if not exists origen text not null default 'PEDIDO';                 -- PEDIDO = nació de un pedido de la bandeja; MANUAL = «Nueva Orden de Salida»
alter table wms.salidas add column if not exists creada_desde text;                                     -- BANDEJA | RUTA | MANUAL (vacío en lo anterior a esta migración que no era de un pedido)
alter table wms.salidas add column if not exists pedido_numero text;                                    -- el número del pedido en Pedidos (la venta manual lo exige)
alter table wms.salidas add column if not exists por_conciliar boolean not null default false;          -- venta manual cuyo pedido el WMS todavía no pudo comprobar contra Pedidos (D-80)
alter table wms.salidas add column if not exists cliente_manual jsonb;                                  -- {ruc, razon_social, direccion, ubigeo, vendedor?} escritos a mano mientras no haya conexión
alter table wms.salidas add column if not exists gre_numero text;                                       -- tipo B: el número de la GRE que trae el cliente
alter table wms.salidas add column if not exists gre_archivo text;                                      -- tipo B: el PDF de esa GRE (referencia en el almacenamiento de archivos)
alter table wms.salidas add column if not exists creada_en_nombre_de uuid references wms.propietarios(id);   -- tipo B: «creada por [usuario] en nombre de [cliente]»

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'wms.salidas'::regclass and conname = 'salidas_origen_check') then
    alter table wms.salidas add constraint salidas_origen_check check (origen in ('PEDIDO', 'MANUAL'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'wms.salidas'::regclass and conname = 'salidas_creada_desde_check') then
    alter table wms.salidas add constraint salidas_creada_desde_check check (creada_desde is null or creada_desde in ('BANDEJA', 'RUTA', 'MANUAL'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'wms.salidas'::regclass and conname = 'salidas_origen_manual_check') then
    alter table wms.salidas add constraint salidas_origen_manual_check check ((origen = 'MANUAL') = (coalesce(creada_desde, '') = 'MANUAL') and (not por_conciliar or origen = 'MANUAL'));
  end if;
end $$;

-- «ped 0012» y «PED0012» son el mismo pedido: mayúsculas y sin espacios (el mismo cálculo que el dominio: normalizarNumeroPedido).
create or replace function wms._numero_pedido_norm(p text) returns text
language sql immutable as $$ select nullif(upper(regexp_replace(btrim(coalesce(p, '')), '\s+', '', 'g')), '') $$;

-- Lo anterior a esta migración: toda salida de un pedido nació al armar una ruta. Se anota (solo donde falta) y, de cada número de pedido, solo la orden viva más reciente
-- toma el número (así el índice único nunca falla sobre datos viejos).
update wms.salidas s set creada_desde = 'RUTA'
 where s.creada_desde is null and s.referencia_tipo = 'pedido';
update wms.salidas s set pedido_numero = x.numero
  from (select distinct on (wms._numero_pedido_norm(pd.numero)) s2.id, pd.numero
          from wms.salidas s2 join wms.pedidos_despacho pd on pd.pedido_id = s2.referencia_id
         where s2.referencia_tipo = 'pedido' and s2.estado <> 'CANCELADA' and s2.pedido_numero is null
         order by wms._numero_pedido_norm(pd.numero), s2.creada_en desc) x
 where s.id = x.id
   and not exists (select 1 from wms.salidas o where o.estado <> 'CANCELADA' and o.id <> s.id and wms._numero_pedido_norm(o.pedido_numero) = wms._numero_pedido_norm(x.numero));

-- Un pedido, una sola Orden de Salida viva (las canceladas no cuentan).
create unique index if not exists salidas_pedido_numero_uk on wms.salidas (wms._numero_pedido_norm(pedido_numero)) where pedido_numero is not null and estado <> 'CANCELADA';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Códigos de un producto (barras, del cliente, del proveedor)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.producto_codigos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null,                                   -- catalogo.productos (maestro de Compras)
  tipo text not null check (tipo in ('BARRAS', 'CLIENTE', 'PROVEEDOR', 'OTRO')),
  codigo text not null check (btrim(codigo) <> ''),
  propietario_id uuid references wms.propietarios(id),         -- el cliente de almacenamiento al que pertenece su código propio
  creado_por uuid,
  creado_en timestamptz not null default now(),
  check (tipo <> 'CLIENTE' or propietario_id is not null)
);
alter table wms.producto_codigos enable row level security;
create unique index if not exists producto_codigos_uk on wms.producto_codigos (producto_id, tipo, upper(btrim(codigo)), coalesce(propietario_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists producto_codigos_buscar_idx on wms.producto_codigos (upper(btrim(codigo)));

do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'producto_codigos' and policyname = 'lectura') then
    drop policy lectura on wms.producto_codigos;
  end if;
end $$;
create policy lectura on wms.producto_codigos for select to authenticated using (wms.es_usuario());
grant select on wms.producto_codigos to authenticated;

create or replace function wms.agregar_codigo_producto(p_producto uuid, p_tipo text, p_codigo text, p_propietario uuid default null) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_codigo text := btrim(coalesce(p_codigo, ''));
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_rol('direccion_tecnica', 'asistente_dt', 'jefe_almacen') then
    raise exception 'Solo Dirección Técnica, su asistente y el Jefe de Almacén agregan códigos a un producto' using errcode = '42501';
  end if;
  if v_codigo = '' then raise exception 'Escribe el código' using errcode = 'P0001'; end if;
  if p_tipo not in ('BARRAS', 'CLIENTE', 'PROVEEDOR', 'OTRO') then raise exception 'El tipo de código es barras, del cliente, del proveedor u otro' using errcode = 'P0001'; end if;
  if not exists (select 1 from catalogo.productos where id = p_producto) then raise exception 'No encontramos ese producto' using errcode = 'P0001'; end if;
  if p_tipo = 'CLIENTE' and (p_propietario is null or not exists (select 1 from wms.propietarios where id = p_propietario and not es_dueno_almacen)) then
    raise exception 'El código del cliente es de un cliente de almacenamiento: elige cuál' using errcode = 'P0001';
  end if;
  begin
    insert into wms.producto_codigos (id, producto_id, tipo, codigo, propietario_id, creado_por)
    values (v_id, p_producto, p_tipo, v_codigo, case when p_tipo = 'CLIENTE' then p_propietario end, auth.uid());
  exception when unique_violation then
    raise exception 'Ese código ya está registrado para este producto' using errcode = 'P0001';
  end;
  perform wms.registrar_audit('codigo_producto_agregado', 'producto_codigos', v_id::text, null, jsonb_build_object('tipo', p_tipo, 'codigo', v_codigo), null);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Una orden por pedido: unir, reutilizar o crear
-- ─────────────────────────────────────────────────────────────────────────────

-- Une la orden manual con el pedido que acaba de llegar (o que ya estaba en la bandeja): el pedido toma la orden, la referencia pasa al id real, se quita «por conciliar»
-- y queda en auditoría. No toca lo ya avanzado (picking, conformidad…): solo vincula. Avisa al Jefe de Transporte y, si el cliente no coincide, lo dice.
create or replace function wms._vincular_orden_manual(p_pd wms.pedidos_despacho, p_salida wms.salidas) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_aviso text := ''; v_ruc_man text := nullif(btrim(coalesce(p_salida.cliente_manual->>'ruc', '')), ''); v_nuevo boolean;
begin
  update wms.pedidos_despacho set salida_id = p_salida.id where id = p_pd.id and salida_id is null;
  -- la orden todavía no se conformó: ahora que se conoce el cliente real, se decide si necesita embalaje con su ubigeo
  update wms.salidas set referencia_tipo = 'pedido', referencia_id = p_pd.pedido_id, por_conciliar = false,
         requiere_embalaje = case when conformada_en is null and bultos_conformidad is null then wms._requiere_embalaje('pedido', p_pd.pedido_id) else requiere_embalaje end
   where id = p_salida.id;
  if v_ruc_man is not null and p_pd.cliente_ruc is not null and v_ruc_man <> p_pd.cliente_ruc then
    v_aviso := format(' OJO: el RUC del cliente no coincide (orden %s, pedido %s).', v_ruc_man, p_pd.cliente_ruc);
  end if;
  select count(*) <> (select count(*) from jsonb_array_elements(p_pd.snapshot->'lineas')) into v_nuevo from wms.salida_lineas where salida_id = p_salida.id and estado <> 'CANCELADA';
  if v_nuevo then v_aviso := v_aviso || ' OJO: la cantidad de líneas del pedido no es la de la orden.'; end if;
  perform wms.registrar_audit('orden_manual_unida_a_pedido', 'salidas', p_salida.id::text, null,
    jsonb_build_object('pedido_id', p_pd.pedido_id, 'pedido', p_pd.numero, 'version', p_pd.version), 'El pedido llegó por la bandeja y se unió a la orden manual');
  perform wms._alertar('ORDEN_MANUAL_UNIDA', 'jefe_transporte', null, null, 'orden-manual-unida:' || p_salida.id,
    format('El pedido %s llegó por la bandeja y se unió a la orden manual %s: no se creó otra orden.%s', p_pd.numero, p_salida.numero, v_aviso));
end $$;

create or replace function wms.trg_unir_pedido_a_orden_manual() returns trigger
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.salidas;
begin
  if not new.vigente or new.salida_id is not null then return new; end if;
  select * into s from wms.salidas
   where origen = 'MANUAL' and por_conciliar and estado <> 'CANCELADA' and wms._numero_pedido_norm(pedido_numero) = wms._numero_pedido_norm(new.numero)
   order by creada_en limit 1 for update;
  if found then perform wms._vincular_orden_manual(new, s); end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'pedidos_despacho_unir_orden_manual' and tgrelid = 'wms.pedidos_despacho'::regclass and not tgisinternal) then
    drop trigger pedidos_despacho_unir_orden_manual on wms.pedidos_despacho;
  end if;
end $$;
create trigger pedidos_despacho_unir_orden_manual after insert on wms.pedidos_despacho
  for each row execute function wms.trg_unir_pedido_a_orden_manual();

-- La orden de un pedido de la bandeja: la que ya tiene; si no, la orden manual con ese número (se une, sin crear otra); si no, una nueva con el stock asignado por FEFO.
-- `p_desde` = BANDEJA (el botón «Crear orden de salida») o RUTA (al armar la ruta). Quien la llama ya exigió su permiso.
create or replace function wms._orden_del_pedido(p_pd wms.pedidos_despacho, p_desde text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v_viva uuid; s wms.salidas; v_dueno uuid; v_lineas jsonb := '[]'::jsonb; l jsonb; v_prod uuid; v_sin text; v_salida uuid; r record;
begin
  if p_pd.salida_id is not null then
    select id into v_viva from wms.salidas where id = p_pd.salida_id and estado <> 'CANCELADA';
    if found then return v_viva; end if;
  end if;
  select * into s from wms.salidas
   where origen = 'MANUAL' and estado <> 'CANCELADA' and wms._numero_pedido_norm(pedido_numero) = wms._numero_pedido_norm(p_pd.numero)
   order by creada_en limit 1 for update;
  if found then
    perform wms._vincular_orden_manual(p_pd, s);
    update wms.pedidos_despacho set salida_id = s.id where id = p_pd.id;
    return s.id;
  end if;
  if exists (select 1 from wms.salidas where estado <> 'CANCELADA' and wms._numero_pedido_norm(pedido_numero) = wms._numero_pedido_norm(p_pd.numero)) then
    raise exception 'El pedido % ya tiene una Orden de Salida', p_pd.numero using errcode = 'P0001';
  end if;
  select id into v_dueno from wms.propietarios where es_dueno_almacen and activo order by codigo limit 1;
  for l in select * from jsonb_array_elements(p_pd.snapshot->'lineas') loop
    select id into v_prod from catalogo.productos where upper(codigo) = upper(l->>'productoCodigo') limit 1;
    if v_prod is null then v_sin := coalesce(v_sin, l->>'productoCodigo'); else
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', (l->>'cantidad')::integer));
    end if;
  end loop;
  if v_sin is not null then raise exception 'El pedido % trae un producto que el WMS no conoce (%): Dirección Técnica debe darlo de alta', p_pd.numero, v_sin using errcode = 'P0001'; end if;
  v_salida := wms.crear_salida('DISTRIBUCION', 'VENTA', v_dueno, v_lineas, 'pedido', p_pd.pedido_id, null);
  begin
    update wms.salidas set origen = 'PEDIDO', creada_desde = p_desde, pedido_numero = p_pd.numero where id = v_salida;
  exception when unique_violation then
    raise exception 'El pedido % ya tiene una Orden de Salida', p_pd.numero using errcode = 'P0001';
  end;
  for r in select id from wms.salida_lineas where salida_id = v_salida order by creada_en, id loop
    perform wms._asignar_linea(r.id);
  end loop;
  update wms.pedidos_despacho set salida_id = v_salida where id = p_pd.id;
  return v_salida;
end $$;

-- El botón «Crear orden de salida» de un pedido de la bandeja. Idempotente: si el pedido ya tiene orden, devuelve esa.
create or replace function wms.crear_orden_de_pedido(p_pedido_id text) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare pd wms.pedidos_despacho; v_antes uuid; v_salida uuid; s wms.salidas; v_falta boolean;
begin
  perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para crear órdenes de salida');
  select * into pd from wms.pedidos_despacho where pedido_id = p_pedido_id and vigente for update;
  if not found then raise exception 'No encontramos ese pedido en la bandeja' using errcode = 'P0001'; end if;
  if pd.cambio_pendiente then raise exception 'El pedido % cambió en Pedidos: revisa el cambio antes de crear su orden', pd.numero using errcode = 'P0001'; end if;
  v_antes := pd.salida_id;
  v_salida := wms._orden_del_pedido(pd, 'BANDEJA');
  select * into s from wms.salidas where id = v_salida;
  select exists (select 1 from wms.salida_lineas where salida_id = v_salida and estado = 'SIN_STOCK') into v_falta;
  if v_antes is distinct from v_salida then
    perform wms.registrar_audit('orden_creada_desde_bandeja', 'salidas', v_salida::text, null, jsonb_build_object('pedido', pd.numero, 'orden', s.numero), null);
  end if;
  return jsonb_build_object('salida_id', v_salida, 'numero', s.numero, 'ya_existia', v_antes is not distinct from v_salida, 'falta_stock', v_falta, 'creada_desde', s.creada_desde);
end $$;

-- «Crear las órdenes de todos los pedidos por planificar»: cada pedido en su propio intento; el que falla (producto desconocido…) no frena a los demás y se informa por qué.
create or replace function wms.crear_ordenes_pendientes() returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  pd wms.pedidos_despacho; v_salida uuid; v_creadas integer := 0; v_unidas integer := 0; v_falta integer := 0; v_errores jsonb := '[]'::jsonb; v_ordenes jsonb := '[]'::jsonb;
  s wms.salidas; v_f boolean; v_origen text;
begin
  perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para crear órdenes de salida');
  perform pg_advisory_xact_lock(hashtextextended('crear_ordenes_pendientes', 0));
  for pd in select * from wms.pedidos_despacho d
             where d.vigente and not d.cambio_pendiente
               and (d.salida_id is null or exists (select 1 from wms.salidas x where x.id = d.salida_id and x.estado = 'CANCELADA'))
             order by d.fecha, d.numero loop
    begin
      v_salida := wms._orden_del_pedido(pd, 'BANDEJA');
      select * into s from wms.salidas where id = v_salida;
      select exists (select 1 from wms.salida_lineas where salida_id = v_salida and estado = 'SIN_STOCK') into v_f;
      if s.origen = 'MANUAL' then v_unidas := v_unidas + 1; else v_creadas := v_creadas + 1; end if;
      if v_f then v_falta := v_falta + 1; end if;
      v_ordenes := v_ordenes || jsonb_build_array(jsonb_build_object('pedido', pd.numero, 'orden', s.numero, 'falta_stock', v_f, 'unida', s.origen = 'MANUAL'));
      perform wms.registrar_audit('orden_creada_desde_bandeja', 'salidas', v_salida::text, null, jsonb_build_object('pedido', pd.numero, 'orden', s.numero), 'Todas las pendientes');
    exception when others then
      v_errores := v_errores || jsonb_build_array(jsonb_build_object('pedido', pd.numero, 'motivo', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('creadas', v_creadas, 'unidas', v_unidas, 'con_falta_stock', v_falta, 'errores', v_errores, 'ordenes', v_ordenes);
end $$;


-- Cancelar una orden que todavía no salió del rack (por ejemplo, un número de pedido mal digitado): libera lo reservado, queda con su motivo y el pedido de la bandeja vuelve a
-- estar «por planificar». Una orden que está en una ruta no se cancela desde aquí: primero se quita el pedido de la ruta. Nada se borra.
create or replace function wms.cancelar_orden_salida(p_salida uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_ruta text;
begin
  perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para preparar salidas');
  select r.numero into v_ruta from wms.ruta_paradas pa join wms.rutas r on r.id = pa.ruta_id where pa.salida_id = p_salida and pa.activa and r.estado <> 'CANCELADA' limit 1;
  if v_ruta is not null then raise exception 'La orden está en la ruta %: quita el pedido de la ruta antes de cancelarla', v_ruta using errcode = 'P0001'; end if;
  perform wms.cancelar_salida(p_salida, p_motivo);
  update wms.pedidos_despacho set salida_id = null where salida_id = p_salida;
end $$;

-- «¿Este número de pedido ya tiene orden?» para el aviso inmediato de la pantalla: la orden viva con ese número (mayúsculas y espacios no cuentan) o, si no hay, el pedido que
-- ya llegó por la bandeja sin orden. Solo lectura, para el personal.
create or replace function wms.orden_del_pedido(p_numero text) returns jsonb
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_norm text := wms._numero_pedido_norm(p_numero); s wms.salidas; pd wms.pedidos_despacho;
begin
  if not coalesce(wms.es_usuario(), false) then raise exception 'Sin acceso' using errcode = '42501'; end if;
  if v_norm is null then return null; end if;
  select * into s from wms.salidas where estado <> 'CANCELADA' and wms._numero_pedido_norm(pedido_numero) = v_norm limit 1;
  if found then return jsonb_build_object('tipo', 'ORDEN', 'id', s.id, 'numero', s.numero, 'estado', s.estado); end if;
  select * into pd from wms.pedidos_despacho where vigente and wms._numero_pedido_norm(numero) = v_norm limit 1;
  if found then return jsonb_build_object('tipo', 'EN_BANDEJA', 'pedido_numero', pd.numero); end if;
  return null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Nueva Orden de Salida manual (tipos A, B y C)
-- ─────────────────────────────────────────────────────────────────────────────

-- p_clase: 'A' venta a un cliente de distribución (solo el Jefe de Transporte; N.° de pedido obligatorio; cliente escrito a mano hasta que exista D-80), 'B' por cuenta de un
-- cliente de almacenamiento (con su GRE: número y PDF), 'C' sin venta de Logissa (p_motivo = MUESTRA o DEVOLUCION_PROVEEDOR).
-- p_lineas: [{producto_id, cantidad, lote_id?}]. En A, `lote_id` es el lote que se prefirió al que propone FEFO (opcional); en B y en la devolución al proveedor, el lote indicado.
-- p_cliente: {ruc, razon_social, direccion, ubigeo, vendedor?} (solo A). Devuelve el id de la orden (el mismo si se repite el token).
create or replace function wms.crear_orden_salida_manual(
  p_clase text, p_motivo text, p_propietario uuid, p_lineas jsonb,
  p_pedido_numero text default null, p_cliente jsonb default null, p_gre_numero text default null, p_gre_archivo text default null, p_token text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v_tipo text; v_motivo text; v_prop uuid; v_dueno uuid; v_id uuid; v_norm text; v_ya wms.salidas; v_gre text; v_ruc text; v_ubigeo text; v_lima text; v_embala boolean := true;
  x jsonb; v_prod uuid; v_cant integer; v_lote uuid; lt wms.lotes; v_hoy date := wms._hoy_lima(); v_apto record; r record; v_acum jsonb := '{}'::jsonb; v_ya_lote integer;
  v_disp integer; v_enbajas integer; v_cliente jsonb; v_pd wms.pedidos_despacho; v_actual jsonb;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if p_clase is null or p_clase not in ('A', 'B', 'C') then raise exception 'Elige el tipo de orden: A, B o C' using errcode = 'P0001'; end if;

  -- Quién puede crear cada tipo (el rol correcto va ANTES de cualquier otra cosa)
  if p_clase = 'A' then
    perform wms._exigir_accion('crear_orden_venta_manual', 'Solo el Jefe de Transporte crea una venta manual');
  elsif p_clase = 'B' then
    perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para crear una salida por cuenta de un cliente');
  elsif p_motivo = 'MUESTRA' then
    perform wms._exigir_accion('autorizar_salida_sin_venta', 'Solo quien autoriza salidas sin venta registra una muestra');
  elsif p_motivo = 'DEVOLUCION_PROVEEDOR' then
    perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para preparar salidas');
  else
    raise exception 'En una salida sin venta el motivo es muestra o devolución al proveedor' using errcode = 'P0001';
  end if;

  -- Repetir el mismo envío devuelve la misma orden
  if nullif(trim(p_token), '') is not null then
    select id into v_id from wms.salidas where creada_por = auth.uid() and token = trim(p_token);
    if found then return v_id; end if;
  end if;

  select id into v_dueno from wms.propietarios where es_dueno_almacen and activo order by codigo limit 1;
  if v_dueno is null then raise exception 'No hay un dueño del almacén activo' using errcode = 'P0001'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception 'La salida no tiene líneas' using errcode = 'P0001'; end if;

  v_tipo := case p_clase when 'A' then 'DISTRIBUCION' when 'B' then 'CLIENTE' else case p_motivo when 'MUESTRA' then 'MUESTRA' else 'PROVEEDOR' end end;
  v_motivo := case p_clase when 'A' then 'VENTA' when 'B' then p_motivo else p_motivo end;
  v_prop := case when p_clase = 'B' then p_propietario else v_dueno end;
  if p_clase = 'B' then
    if p_propietario is null then raise exception 'Elige el cliente de almacenamiento' using errcode = 'P0001'; end if;
    if p_motivo is null or p_motivo not in ('VENTA', 'PESQUISA_DIGEMID', 'MUESTRA', 'DESTRUCCION') then
      raise exception 'El motivo no corresponde a este tipo de salida' using errcode = 'P0001';
    end if;
  end if;

  -- Tipo A: el pedido es obligatorio, único y el cliente se escribe completo
  if p_clase = 'A' then
    v_norm := wms._numero_pedido_norm(p_pedido_numero);
    if v_norm is null then raise exception 'El número de pedido es obligatorio: la orden queda ligada a ese pedido' using errcode = 'P0001'; end if;
    select * into v_ya from wms.salidas where estado <> 'CANCELADA' and wms._numero_pedido_norm(pedido_numero) = v_norm limit 1;
    if found then raise exception 'El pedido % ya tiene la Orden de Salida %. Un pedido no puede tener dos órdenes', btrim(p_pedido_numero), v_ya.numero using errcode = 'P0001'; end if;
    select * into v_pd from wms.pedidos_despacho where vigente and wms._numero_pedido_norm(numero) = v_norm limit 1;
    if found then raise exception 'El pedido % ya llegó por la bandeja: créale la orden desde «Pedidos por despachar»', btrim(p_pedido_numero) using errcode = 'P0001'; end if;
    v_ruc := btrim(coalesce(p_cliente->>'ruc', ''));
    if v_ruc !~ '^[0-9]{11}$' then raise exception 'El RUC tiene 11 números' using errcode = 'P0001'; end if;
    if nullif(btrim(coalesce(p_cliente->>'razon_social', '')), '') is null then raise exception 'Escribe la razón social del cliente' using errcode = 'P0001'; end if;
    if nullif(btrim(coalesce(p_cliente->>'direccion', '')), '') is null then raise exception 'Escribe la dirección de entrega' using errcode = 'P0001'; end if;
    v_ubigeo := btrim(coalesce(p_cliente->>'ubigeo', ''));
    if v_ubigeo !~ '^[0-9]{6}$' then raise exception 'El ubigeo tiene 6 números (el código del distrito de entrega)' using errcode = 'P0001'; end if;
    if exists (select 1 from jsonb_array_elements(p_lineas) e group by e->>'producto_id' having count(*) > 1) then
      raise exception 'Un producto aparece una sola vez: junta sus cantidades' using errcode = 'P0001';
    end if;
    v_cliente := jsonb_build_object('ruc', v_ruc, 'razon_social', btrim(p_cliente->>'razon_social'), 'direccion', btrim(p_cliente->>'direccion'), 'ubigeo', v_ubigeo,
                                    'vendedor', nullif(btrim(coalesce(p_cliente->>'vendedor', '')), ''));
    select valor into v_lima from wms.parametros where clave = 'ubigeos_lima_metropolitana';
    v_embala := not exists (select 1 from unnest(string_to_array(coalesce(v_lima, ''), ',')) pre where nullif(btrim(pre), '') is not null and v_ubigeo like btrim(pre) || '%');
  end if;

  -- Tipo B: la GRE del cliente (número con formato y el PDF)
  if p_clase = 'B' then
    v_gre := upper(btrim(coalesce(p_gre_numero, '')));
    if v_gre !~ '^[A-Z][A-Z0-9]{3}-[0-9]{1,8}$' then raise exception 'El número de la guía se escribe como T001-00001234 (serie, guion y número)' using errcode = 'P0001'; end if;
    if nullif(btrim(coalesce(p_gre_archivo, '')), '') is null then raise exception 'Adjunta el PDF de la guía de remisión del cliente' using errcode = 'P0001'; end if;
  end if;

  -- Líneas con lote indicado (B y devolución al proveedor): cada una se valida con el mismo orden y las mismas palabras que el dominio (validarLineaSalidaCliente)
  if v_tipo in ('CLIENTE', 'PROVEEDOR') then
    for x in select * from jsonb_array_elements(p_lineas) loop
      v_prod := (x->>'producto_id')::uuid; v_cant := (x->>'cantidad')::integer; v_lote := nullif(x->>'lote_id', '')::uuid;
      if v_prod is null then raise exception 'Elige el producto' using errcode = 'P0001'; end if;
      if v_cant is null or v_cant <= 0 then raise exception 'La cantidad de cada línea debe ser mayor que cero' using errcode = 'P0001'; end if;
      if v_lote is null then raise exception 'Indica el lote de cada línea' using errcode = 'P0001'; end if;
      select * into lt from wms.lotes where id = v_lote;
      if not found then raise exception 'No encontramos uno de los lotes' using errcode = 'P0001'; end if;
      if lt.propietario_id <> v_prop then raise exception 'El lote % no es de este propietario', lt.codigo using errcode = 'P0001'; end if;
      if lt.producto_id <> v_prod then raise exception 'El lote % no corresponde al producto de la línea', lt.codigo using errcode = 'P0001'; end if;
      v_ya_lote := coalesce((v_acum->>(v_lote::text))::integer, 0);
      if v_motivo = 'DESTRUCCION' then
        select coalesce(sum(s.cantidad), 0)::integer into v_enbajas
          from wms.saldos s join wms.posiciones ps on ps.id = s.posicion_id and ps.tipo_area = 'BAJAS_RECHAZADOS'
         where s.lote_id = v_lote and s.propietario_id = v_prop and s.estado = 'BAJAS_RECHAZADOS';
        if greatest(v_enbajas - v_ya_lote, 0) < v_cant then
          raise exception 'La destrucción sale solo desde Bajas: del lote % hay % unidades en el área de Bajas y la línea pide %. Lo que no esté en Bajas se da de baja primero con una Orden de Baja',
            lt.codigo, greatest(v_enbajas - v_ya_lote, 0), v_cant using errcode = 'P0001';
        end if;
      else
        select * into v_apto from wms._lote_apto(lt.vence, v_tipo, v_motivo, v_hoy, 0);
        if not v_apto.apto then raise exception 'Lote %: %', lt.codigo, v_apto.razon using errcode = 'P0001'; end if;
        if wms.lote_bloqueado(v_lote) then raise exception 'El lote % está en Reserva: no sale hasta que se quite la Reserva', lt.codigo using errcode = 'P0001'; end if;
        select coalesce(sum(c.disponible) filter (where c.disponible > 0 and not c.en_conteo), 0)::integer into v_disp from wms._candidatos(v_prop, v_prod) c where c.lote_id = v_lote;
        if greatest(v_disp - v_ya_lote, 0) < v_cant then
          raise exception 'No hay en el lote % con % unidades disponibles (hay %)', lt.codigo, v_cant, greatest(v_disp - v_ya_lote, 0) using errcode = 'P0002';
        end if;
      end if;
      v_acum := jsonb_set(v_acum, array[v_lote::text], to_jsonb(v_ya_lote + v_cant), true);
    end loop;
  end if;

  -- La orden: crear_salida valida tipo, motivo, propietario y lotes otra vez y numera OS-AAAA-NNNNN
  v_id := wms.crear_salida(v_tipo, v_motivo, v_prop,
    (select jsonb_agg(case when v_tipo = 'DISTRIBUCION' or v_tipo = 'MUESTRA' then e - 'lote_id' else e end) from jsonb_array_elements(p_lineas) e),
    null, null, p_token);

  begin
    update wms.salidas set
        origen = 'MANUAL', creada_desde = 'MANUAL',
        pedido_numero = case when p_clase = 'A' then btrim(p_pedido_numero) end,
        referencia_tipo = case when p_clase = 'A' then 'pedido_numero' end,
        referencia_id = case when p_clase = 'A' then v_norm end,
        por_conciliar = (p_clase = 'A'),
        cliente_manual = v_cliente,
        gre_numero = v_gre, gre_archivo = case when p_clase = 'B' then btrim(p_gre_archivo) end,
        creada_en_nombre_de = case when p_clase = 'B' then p_propietario end,
        requiere_embalaje = v_embala
     where id = v_id;
  exception when unique_violation then
    raise exception 'El pedido % ya tiene una Orden de Salida. Un pedido no puede tener dos órdenes', btrim(p_pedido_numero) using errcode = 'P0001';
  end;

  -- A y muestra: el sistema propone lote y vencimiento por FEFO (todo o nada por línea; si falta stock la línea queda SIN_STOCK y se avisa)
  if v_tipo in ('DISTRIBUCION', 'MUESTRA') then
    for r in select id from wms.salida_lineas where salida_id = v_id order by creada_en, id loop
      perform wms._asignar_linea(r.id);
    end loop;
    -- A: si se prefirió otro lote que el propuesto, se aplica con las reglas de la edición de lotes (60 días, Aprobado, sin Reserva, nunca negativo)
    if v_tipo = 'DISTRIBUCION' then
      for x in select * from jsonb_array_elements(p_lineas) loop
        if nullif(x->>'lote_id', '') is not null then
          select id into r from wms.salida_lineas where salida_id = v_id and producto_id = (x->>'producto_id')::uuid;
          v_actual := wms._asignacion_json(r.id);
          if not (jsonb_array_length(coalesce(v_actual, '[]'::jsonb)) = 1 and (v_actual->0->>'lote_id') = (x->>'lote_id')) then
            perform wms.editar_asignacion(r.id, jsonb_build_array(jsonb_build_object('lote_id', x->>'lote_id', 'cantidad', (x->>'cantidad')::integer)), null);
          end if;
        end if;
      end loop;
    end if;
  end if;

  perform wms.registrar_audit('orden_manual_creada', 'salidas', v_id::text, null,
    jsonb_build_object('clase', p_clase, 'tipo', v_tipo, 'motivo', v_motivo, 'pedido', btrim(p_pedido_numero), 'gre', v_gre, 'lineas', jsonb_array_length(p_lineas)),
    case p_clase when 'A' then 'Venta manual por conciliar con Pedidos' when 'B' then 'Por cuenta de un cliente de almacenamiento' else 'Salida sin venta de Logissa' end);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. planificar_ruta y cancelar_ruta (de la 0017): la orden de un pedido se reutiliza (bandeja, manual o nueva) y al quitar un pedido solo se libera la orden que nació en la ruta
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.planificar_ruta(
  p_ruta uuid, p_fecha date, p_vehiculo uuid, p_conductor uuid, p_auxiliar uuid, p_paradas jsonb, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare
  r wms.rutas; v wms.vehiculos; x jsonb; pd wms.pedidos_despacho; v_seq integer := 0; v_dueno uuid; v_salida uuid; v_lineas jsonb; v_exc boolean; v_mot text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), ''); v_nueva integer; v_snapshot jsonb := '[]'::jsonb; v_bloqueados jsonb := '[]'::jsonb;
  v_pedidos text[] := array[]::text[]; v_prod uuid; l jsonb; v_pid text; v_viva wms.ruta_paradas; v_sin_producto text;
begin
  perform wms._exigir_accion('planificar_ruta', 'No tienes permiso para planificar rutas');
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if r.estado not in ('BORRADOR', 'PLANIFICADA') then raise exception 'La ruta ya no se puede cambiar (está %)', lower(replace(r.estado, '_', ' ')) using errcode = 'P0001'; end if;
  if p_fecha is null or p_fecha < wms._hoy_lima() then raise exception 'La fecha de la ruta no puede ser anterior a hoy' using errcode = 'P0001'; end if;
  if r.estado = 'PLANIFICADA' and v_motivo is null then raise exception 'La ruta ya estaba planificada: indica por qué cambia' using errcode = 'P0001'; end if;
  if p_paradas is null or jsonb_typeof(p_paradas) <> 'array' then raise exception 'Las paradas deben ser una lista' using errcode = 'P0001'; end if;

  if p_vehiculo is not null then
    select * into v from wms.vehiculos where id = p_vehiculo;
    if not found then raise exception 'No encontramos ese vehículo' using errcode = 'P0001'; end if;
    if not v.activo then raise exception 'El vehículo % está inactivo', v.placa using errcode = 'P0001'; end if;
  end if;
  if p_conductor is not null and not exists (select 1 from wms.personal_transporte where id = p_conductor and funcion = 'CONDUCTOR' and activo) then
    raise exception 'El conductor elegido no está disponible' using errcode = 'P0001';
  end if;
  if p_auxiliar is not null and not exists (select 1 from wms.personal_transporte where id = p_auxiliar and funcion = 'AUXILIAR' and activo) then
    raise exception 'El auxiliar elegido no está disponible' using errcode = 'P0001';
  end if;
  if p_conductor is not null and p_conductor is not distinct from p_auxiliar then raise exception 'El conductor y el auxiliar deben ser personas distintas' using errcode = 'P0001'; end if;
  -- Un vehículo o una persona no puede estar en dos rutas vivas del mismo día
  if p_vehiculo is not null and exists (select 1 from wms.rutas o where o.id <> p_ruta and o.fecha = p_fecha and o.vehiculo_id = p_vehiculo and o.estado not in ('CERRADA', 'CANCELADA')) then
    raise exception 'El vehículo ya está en otra ruta de ese día' using errcode = 'P0001';
  end if;
  if p_conductor is not null and exists (select 1 from wms.rutas o where o.id <> p_ruta and o.fecha = p_fecha and (o.conductor_id = p_conductor or o.auxiliar_id = p_conductor) and o.estado not in ('CERRADA', 'CANCELADA')) then
    raise exception 'El conductor ya está en otra ruta de ese día' using errcode = 'P0001';
  end if;
  if p_auxiliar is not null and exists (select 1 from wms.rutas o where o.id <> p_ruta and o.fecha = p_fecha and (o.conductor_id = p_auxiliar or o.auxiliar_id = p_auxiliar) and o.estado not in ('CERRADA', 'CANCELADA')) then
    raise exception 'El auxiliar ya está en otra ruta de ese día' using errcode = 'P0001';
  end if;

  select id into v_dueno from wms.propietarios where es_dueno_almacen and activo order by codigo limit 1;

  -- Pedidos que salen del plan: se libera su salida (si aún no se empezó a pickear) y la parada queda inactiva
  for v_viva in select * from wms.ruta_paradas where ruta_id = p_ruta and activa and pedido_id not in
      (select e->>'pedido_id' from jsonb_array_elements(p_paradas) e) loop
    -- SA-2: solo se libera la orden si nació en esta ruta; una orden creada desde la bandeja o a mano sigue viva (el pedido sale de la ruta, no se cancela su orden)
    if v_viva.salida_id is not null and coalesce((select creada_desde from wms.salidas where id = v_viva.salida_id), 'RUTA') = 'RUTA' then
      if exists (select 1 from wms.ordenes_picking where salida_id = v_viva.salida_id and estado <> 'CANCELADA') then
        raise exception 'El pedido % ya tiene picking generado: no se puede sacar de la ruta', (select numero from wms.pedidos_despacho where id = v_viva.pedido_despacho_id) using errcode = 'P0001';
      end if;
      perform wms.cancelar_salida(v_viva.salida_id, coalesce(v_motivo, 'El pedido salió de la ruta'));
      update wms.pedidos_despacho set salida_id = null where id = v_viva.pedido_despacho_id;
    end if;
    update wms.ruta_paradas set activa = false where id = v_viva.id;
  end loop;
  -- Las demás se vuelven a numerar: primero inactivas, después se insertan en el orden nuevo
  update wms.ruta_paradas set activa = false where ruta_id = p_ruta and activa;

  for x in select * from jsonb_array_elements(p_paradas) loop
    v_pid := x->>'pedido_id';
    if v_pid is null or v_pid = any (v_pedidos) then raise exception 'Hay un pedido repetido o sin identificador en la ruta' using errcode = 'P0001'; end if;
    v_pedidos := v_pedidos || v_pid;
    select * into pd from wms.pedidos_despacho where pedido_id = v_pid and vigente for update;
    if not found then raise exception 'No encontramos uno de los pedidos en la bandeja' using errcode = 'P0001'; end if;
    if pd.cambio_pendiente then raise exception 'El pedido % cambió en Pedidos: revisa el cambio antes de planificarlo', pd.numero using errcode = 'P0001'; end if;
    select * into v_viva from wms.ruta_paradas where pedido_id = v_pid and activa;
    if found then raise exception 'El pedido % ya está en otra ruta', pd.numero using errcode = 'P0001'; end if;
    if nullif(btrim(coalesce(pd.snapshot->'cliente'->>'vehiculoCalificado', '')), '') is not null and (p_vehiculo is null or not v.calificado) then
      raise exception 'El cliente de % exige un vehículo calificado', pd.numero using errcode = 'P0001';
    end if;
    v_exc := coalesce((x->>'excepcion_corte')::boolean, false);
    v_mot := nullif(btrim(coalesce(x->>'motivo_excepcion', '')), '');
    if wms._fuera_de_corte(pd.importado_en, p_fecha) and not v_exc then
      raise exception 'El pedido % llegó después del corte de las % de la víspera: para incluirlo marca la excepción y escribe el motivo',
        pd.numero, coalesce((select valor from wms.parametros where clave = 'hora_corte_planificacion'), '16:00') using errcode = 'P0001';
    end if;
    if v_exc and v_mot is null then raise exception 'La excepción del pedido % necesita un motivo', pd.numero using errcode = 'P0001'; end if;

    -- La orden del pedido (una sola vez): la que ya se creó desde la bandeja, la orden manual con ese número de pedido o, si no hay, una nueva que nace en esta ruta (SA-2)
    v_salida := wms._orden_del_pedido(pd, 'RUTA');
    v_seq := v_seq + 1;
    insert into wms.ruta_paradas (ruta_id, secuencia, pedido_id, pedido_despacho_id, salida_id, excepcion_corte, motivo_excepcion)
    values (p_ruta, v_seq, pd.pedido_id, pd.id, v_salida, v_exc, v_mot);
    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('secuencia', v_seq, 'pedido_id', pd.pedido_id, 'numero', pd.numero, 'cliente', pd.cliente_nombre,
      'excepcion_corte', v_exc, 'motivo_excepcion', v_mot));
    if exists (select 1 from wms.salida_lineas where salida_id = v_salida and estado = 'SIN_STOCK') then
      v_bloqueados := v_bloqueados || jsonb_build_array(pd.numero);
    end if;
  end loop;

  v_nueva := r.version + 1;
  update wms.rutas set fecha = p_fecha, vehiculo_id = p_vehiculo, conductor_id = p_conductor, auxiliar_id = p_auxiliar, version = v_nueva where id = p_ruta;
  insert into wms.ruta_versiones (ruta_id, version, fecha, vehiculo_id, conductor_id, auxiliar_id, paradas, motivo, por)
  values (p_ruta, v_nueva, p_fecha, p_vehiculo, p_conductor, p_auxiliar, v_snapshot, coalesce(v_motivo, 'Plan guardado'), auth.uid());
  perform wms.registrar_audit('ruta_planificada', 'rutas', p_ruta::text, null, v_snapshot, v_motivo);
  return jsonb_build_object('version', v_nueva, 'paradas', v_seq, 'bloqueados_por_stock', v_bloqueados);
end $$;

create or replace function wms.cancelar_ruta(p_ruta uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas; pa wms.ruta_paradas; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform wms._exigir_accion('planificar_ruta', 'No tienes permiso para planificar rutas');
  if v_motivo is null then raise exception 'La cancelación necesita un motivo' using errcode = 'P0001'; end if;
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if r.estado not in ('BORRADOR', 'PLANIFICADA') then raise exception 'La ruta ya está en ejecución: no se cancela desde aquí' using errcode = 'P0001'; end if;
  for pa in select * from wms.ruta_paradas where ruta_id = p_ruta and activa loop
    -- SA-2: solo se cancela la orden que nació en esta ruta; la creada desde la bandeja o a mano sigue viva
    if pa.salida_id is not null and coalesce((select creada_desde from wms.salidas where id = pa.salida_id), 'RUTA') = 'RUTA' then
      if exists (select 1 from wms.ordenes_picking where salida_id = pa.salida_id and estado <> 'CANCELADA') then
        raise exception 'El pedido % ya tiene picking generado: no se puede cancelar la ruta', (select numero from wms.pedidos_despacho where id = pa.pedido_despacho_id) using errcode = 'P0001';
      end if;
      perform wms.cancelar_salida(pa.salida_id, v_motivo);
      update wms.pedidos_despacho set salida_id = null where id = pa.pedido_despacho_id;
    end if;
    update wms.ruta_paradas set activa = false where id = pa.id;
  end loop;
  update wms.rutas set estado = 'CANCELADA', motivo_cancelacion = v_motivo, version = version + 1 where id = p_ruta;
  insert into wms.ruta_versiones (ruta_id, version, fecha, vehiculo_id, conductor_id, auxiliar_id, paradas, motivo, por)
  values (p_ruta, r.version + 1, r.fecha, r.vehiculo_id, r.conductor_id, r.auxiliar_id, '[]'::jsonb, 'Ruta cancelada: ' || v_motivo, auth.uid());
  perform wms.registrar_audit('ruta_cancelada', 'rutas', p_ruta::text, null, null, v_motivo);
end $$;
-- ─────────────────────────────────────────────────────────────────────────────
-- 6. La guía de una salida que no es de un cliente de almacenamiento
-- ─────────────────────────────────────────────────────────────────────────────

-- La 0024 solo dejaba emitir la guía electrónica de una venta de distribución. Una muestra y una devolución al proveedor (tipo C) también llevan guía de Nubefact (con su
-- motivo de traslado); solo el tipo B (por cuenta de un cliente) usa la GRE que trae el cliente. Se cambia solo esa condición (si el texto no está, falla en voz alta).
do $$
declare v_oid oid; v_def text;
  v_viejo text := E'  if s.tipo <> ''DISTRIBUCION'' then\n    raise exception ''La guía de una orden de un cliente de almacenamiento la trae el cliente: registra su GRE, el WMS no la emite'' using errcode = ''P0001'';\n  end if;';
  v_nuevo text := E'  if s.tipo = ''CLIENTE'' then\n    raise exception ''La guía de una orden de un cliente de almacenamiento la trae el cliente: registra su GRE, el WMS no la emite'' using errcode = ''P0001'';\n  end if;';
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'registrar_guia_electronica' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position(v_viejo in v_def) = 0 then
    if position(v_nuevo in v_def) > 0 then return; end if;   -- ya aplicada (re-ejecución)
    raise exception 'No se encontró el texto esperado en wms.registrar_guia_electronica';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

-- A Pedidos solo se le avisa de una VENTA (con esa guía factura). Una muestra o una devolución al proveedor no se facturan y la GRE de un cliente tampoco: no hay evento.
-- En una venta manual todavía sin pedido en la bandeja, el aviso lleva el número de pedido de la orden: con él Pedidos encuentra su pedido.
create or replace function wms._encolar_evento_guia(p_guia uuid, p_tipo text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare g wms.guias_remision; s wms.salidas; v_ped record; v_id uuid := gen_random_uuid(); v_payload jsonb;
begin
  select * into g from wms.guias_remision where id = p_guia;
  select * into s from wms.salidas where id = g.salida_id;
  if s.tipo <> 'DISTRIBUCION' then return null; end if;
  select pedido_id, numero into v_ped from wms.pedidos_despacho where salida_id = s.id order by vigente desc, version desc limit 1;
  v_payload := jsonb_build_object('guia', g.numero, 'origen', g.origen, 'entorno', g.entorno, 'enlace', g.enlace, 'enlace_xml', g.enlace_xml, 'estado_sunat', g.estado_sunat, 'salida', s.numero,
                                  'pedido_id', v_ped.pedido_id, 'pedido_numero', coalesce(v_ped.numero, s.pedido_numero), 'por_conciliar', s.por_conciliar,
                                  'fecha_traslado', coalesce(g.fecha_inicio_traslado, g.fecha_traslado),
                                  'bultos', coalesce(g.bultos, s.bultos_conformidad), 'lineas', g.lineas);
  if p_tipo = 'GUIA_ANULADA' then
    v_payload := v_payload || jsonb_build_object('caso', g.caso_anulacion, 'motivo', g.motivo_anulacion, 'baja_sunat', g.baja_sunat,
      'aviso', 'El WMS no modifica la factura: Contabilidad decide si se anula o si corresponde una nota de crédito');
  end if;
  insert into wms.eventos_pedidos (id, tipo, salida_id, guia_id, pedido_id, payload) values (v_id, p_tipo, s.id, g.id, v_ped.pedido_id, v_payload);
  return v_id;
end $$;



-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function
  wms.crear_orden_de_pedido(text), wms.crear_ordenes_pendientes(), wms.orden_del_pedido(text), wms.cancelar_orden_salida(uuid, text), wms.agregar_codigo_producto(uuid, text, text, uuid),
  wms.crear_orden_salida_manual(text, text, uuid, jsonb, text, jsonb, text, text, text),
  wms.planificar_ruta(uuid, date, uuid, uuid, uuid, jsonb, text), wms.cancelar_ruta(uuid, text)
  to authenticated;
revoke execute on all functions in schema wms from public;
