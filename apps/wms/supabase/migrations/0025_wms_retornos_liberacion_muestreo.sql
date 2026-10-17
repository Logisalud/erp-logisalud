-- 0025 · WMS · Orden de Salida · OS-5: retornos como recepción tipo devolución, liberación de productos (LS-POE.04.05) y muestreo (LS-TB.02.02)
--
-- Respuestas de Dirección Técnica del 2026-10-17 (docs/wms/respuestas-dt-2026-10.md, §4, §5 y §6):
--   1. RETORNOS. Todo lo que salió del almacén y vuelve (rechazado por el cliente o no entregado) entra como una RECEPCIÓN TIPO DEVOLUCIÓN: estado Devoluciones, acta de
--      recepción y acta organoléptica al 100 %, y Aprobado o Bajas. Se agrega la referencia a la Orden de Salida, el motivo y la guía a la solicitud de ingreso, y una función
--      (`crear_retorno`) que la origina desde la salida. Lo que vuelve nunca supera lo que salió (en la base de datos, por lote). Un pedido que se reprograma se prepara
--      desde cero con una nueva Orden de Salida: la anterior no se reabre. No vuelven la zona «Retorno reservado» ni `registrar_retorno` (se retiraron en la 0022).
--   2. LIBERACIÓN (LS-POE.04.05). Productos de Logissa: Sandra evalúa y Katia dictamina, como hoy; una OBSERVACIÓN REVERSIBLE deja el producto en Cuarentena hasta la disposición
--      final. Productos de clientes de almacenamiento: libera el DT DEL CLIENTE; hasta tener los accesos de clientes (SEC1), Sandra o Katia REGISTRAN su dictamen (documento
--      adjunto, cantidades liberadas y rechazadas) y CONFIRMAN el cambio de estado. Rol `dt_cliente` (ligado a su propietario, un único permiso) declarado pero DESHABILITADO:
--      la base no deja crear la cuenta mientras `acceso_clientes_habilitado` esté apagado. El estado sanitario sigue cambiando solo por el flujo y con sustento.
--      El WMS reemplaza el LS-FR.04 Control de Status.
--   3. MUESTREO (LS-TB.02.02). Reemplaza techo(√n)+1: lotes de menos de 100 unidades y devoluciones, 100 %; evaluación simplificada por defecto, normal para un producto o
--      proveedor nuevo (primera recepción), estricta (100 %) para productos con antecedentes de calidad que marca Dirección Técnica. La tabla es un PARÁMETRO con su código y su
--      vigencia (`tablas_muestreo`), no una regla escondida en el código.
--
-- Depende de la 0022 (`_ampliar_check_in`). No depende de la 0023 ni de la 0024. Re-ejecutable (existencia explícita en vez de `drop … if exists`). RLS desde el `create table`.
-- Se aplica a mano, con aprobación. Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Acciones, rol, alertas y parámetros
-- ─────────────────────────────────────────────────────────────────────────────

select wms._ampliar_check_in('wms.permisos_rol', 'permisos_rol_accion_check', 'accion',
  array['originar_retorno', 'registrar_dictamen_cliente', 'marcar_antecedentes_calidad', 'liberar_stock_propietario']);
select wms._ampliar_check_in('wms.usuario_roles', 'usuario_roles_rol_check', 'rol', array['dt_cliente']);
select wms._ampliar_check_in('wms.alertas', 'alertas_tipo_check', 'tipo', array['RETORNO_POR_AUTORIZAR', 'DICTAMEN_POR_CONFIRMAR']);

insert into wms.permisos_rol (rol, accion) values
  ('direccion_tecnica', 'originar_retorno'), ('asistente_dt', 'originar_retorno'), ('jefe_almacen', 'originar_retorno'), ('jefe_transporte', 'originar_retorno'),
  ('direccion_tecnica', 'registrar_dictamen_cliente'), ('asistente_dt', 'registrar_dictamen_cliente'),
  ('direccion_tecnica', 'marcar_antecedentes_calidad'),
  ('dt_cliente', 'liberar_stock_propietario')
on conflict (rol, accion) do nothing;

insert into wms.parametros (clave, valor, nota) values
  ('dictamen_cliente_dos_personas', 'no',
   'OS-5 (pendiente de Katia, D-102): si es «si», quien confirma el cambio de estado por el dictamen de un DT de cliente debe ser una persona distinta de quien lo registró. Por defecto no se exige (Sandra o Katia pueden hacer los dos pasos).')
on conflict (clave) do nothing;
update wms.parametros set nota = 'OBSOLETO desde la 0025: el muestreo ya no es techo(√n)+1; el tamaño de la muestra sale de la tabla LS-TB.02.02 (wms.tablas_muestreo).'
 where clave = 'muestreo_constante';

-- «DT de cliente»: lleva propietario, igual que `usuario_cliente`. Una cuenta de cliente es de un solo propietario y no es personal.
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'wms.usuario_roles'::regclass and conname = 'usuario_roles_cliente_propietario_check') then
    alter table wms.usuario_roles drop constraint usuario_roles_cliente_propietario_check;
  end if;
  alter table wms.usuario_roles add constraint usuario_roles_cliente_propietario_check
    check ((rol in ('usuario_cliente', 'dt_cliente')) = (propietario_id is not null));
end $$;

-- Propietario del DT de cliente logueado (null si no lo es, si su rol no está vigente o si el acceso de clientes está apagado). DESHABILITADO hasta SEC1.
create or replace function wms.propietario_dt_cliente()
returns uuid language sql stable security definer set search_path = wms, pg_temp as $$
  select r.propietario_id
    from wms.usuario_roles r
   where r.user_id = auth.uid()
     and r.rol = 'dt_cliente'
     and r.desde <= current_date
     and (r.hasta is null or r.hasta >= current_date)
     and coalesce((select p.valor from wms.parametros p where p.clave = 'acceso_clientes_habilitado'), 'false') = 'true'
   limit 1
$$;

-- La cuenta de un DT de cliente solo se crea con el acceso de clientes habilitado, pertenece a un cliente de almacenamiento activo y no tiene roles del personal.
create or replace function wms.trg_guardia_dt_cliente()
returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if new.rol = 'dt_cliente' then
    if coalesce((select p.valor from wms.parametros p where p.clave = 'acceso_clientes_habilitado'), 'false') <> 'true' then
      raise exception 'El rol DT de cliente está deshabilitado hasta que SEC1 esté en producción (D-68): el acceso de clientes no está habilitado' using errcode = 'P0001';
    end if;
    if not exists (select 1 from wms.propietarios o where o.id = new.propietario_id and o.activo and not o.es_dueno_almacen) then
      raise exception 'Un DT de cliente pertenece a un cliente de almacenamiento activo (no al dueño del almacén)' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.usuario_roles r
                where r.user_id = new.user_id and r.rol <> 'dt_cliente' and r.id <> new.id and (r.hasta is null or r.hasta >= current_date)) then
      raise exception 'Una cuenta de DT de cliente no puede tener otros roles' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.usuario_roles r
                where r.user_id = new.user_id and r.rol = 'dt_cliente' and r.id <> new.id
                  and r.propietario_id <> new.propietario_id and (r.hasta is null or r.hasta >= current_date)) then
      raise exception 'Una cuenta de DT de cliente pertenece a un solo propietario' using errcode = 'P0001';
    end if;
  elsif exists (select 1 from wms.usuario_roles r
                 where r.user_id = new.user_id and r.rol = 'dt_cliente' and r.id <> new.id and (r.hasta is null or r.hasta >= current_date)) then
    raise exception 'Esta cuenta es de un DT de cliente: no puede recibir otros roles' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'guardia_dt_cliente' and tgrelid = 'wms.usuario_roles'::regclass and not tgisinternal) then
    drop trigger guardia_dt_cliente on wms.usuario_roles;
  end if;
end $$;
create trigger guardia_dt_cliente before insert or update on wms.usuario_roles
  for each row execute function wms.trg_guardia_dt_cliente();

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Muestreo: la tabla LS-TB.02.02 como parámetro (código, vigencia y tramos)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.tablas_muestreo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null check (nullif(btrim(codigo), '') is not null),
  vigente_desde date not null,
  vigente_hasta date,
  umbral_total integer not null default 100 check (umbral_total > 0),   -- por debajo de esto se evalúa el 100 % del lote
  nota text,
  creado_en timestamptz not null default now(),
  unique (codigo, vigente_desde),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
alter table wms.tablas_muestreo enable row level security;

create table if not exists wms.tablas_muestreo_tramos (
  tabla_id uuid not null references wms.tablas_muestreo(id),
  regimen text not null check (regimen in ('SIMPLIFICADA', 'NORMAL')),
  desde integer not null check (desde > 0),
  hasta integer,                                                       -- null = sin tope
  muestra integer not null check (muestra > 0),
  primary key (tabla_id, regimen, desde),
  check (hasta is null or hasta >= desde)
);
alter table wms.tablas_muestreo_tramos enable row level security;

do $$ declare t text; begin
  foreach t in array array['tablas_muestreo', 'tablas_muestreo_tramos'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then
      execute format('drop policy lectura on wms.%I', t);
    end if;
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
    execute format('revoke all on wms.%I from anon, authenticated', t);
    execute format('grant select on wms.%I to authenticated', t);
  end loop;
end $$;

-- LS-TB.02.02 «Tamaño de muestra» (Tabla militar estándar), vigente del 01-09-2026 al 01-09-2028. Una versión nueva de la tabla es una fila nueva con su vigencia:
-- nunca se reescribe la anterior (las actas ya firmadas guardan el código con que se calcularon).
insert into wms.tablas_muestreo (codigo, vigente_desde, vigente_hasta, umbral_total, nota)
values ('LS-TB.02.02', '2026-09-01', '2028-09-01', 100,
        'Tamaño de muestra (DT, 2026-10-17): menos de 100 unidades y devoluciones, 100 %; simplificada por defecto; normal para producto o proveedor nuevo; estricta (100 %) para productos con antecedentes de calidad.')
on conflict (codigo, vigente_desde) do nothing;

insert into wms.tablas_muestreo_tramos (tabla_id, regimen, desde, hasta, muestra)
select t.id, v.regimen, v.desde, v.hasta, v.muestra
  from wms.tablas_muestreo t
  cross join (values
    ('SIMPLIFICADA', 100, 1000, 20), ('SIMPLIFICADA', 1001, 10000, 30), ('SIMPLIFICADA', 10001, 100000, 80), ('SIMPLIFICADA', 100001, null::integer, 150),
    ('NORMAL', 100, 1000, 50), ('NORMAL', 1001, 10000, 150), ('NORMAL', 10001, 100000, 300), ('NORMAL', 100001, null::integer, 500)
  ) as v(regimen, desde, hasta, muestra)
 where t.codigo = 'LS-TB.02.02' and t.vigente_desde = '2026-09-01'
on conflict (tabla_id, regimen, desde) do nothing;

-- Productos con antecedentes de calidad: los marca (y los quita) Dirección Técnica, siempre con motivo. Se evalúan al 100 %. La historia no se borra.
create table if not exists wms.antecedentes_calidad (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null,
  motivo text not null check (nullif(btrim(motivo), '') is not null),
  marcado_por uuid not null,
  marcado_en timestamptz not null default now(),
  quitado_por uuid,
  quitado_en timestamptz,
  motivo_quita text,
  check ((quitado_en is null and quitado_por is null and motivo_quita is null)
      or (quitado_en is not null and quitado_por is not null and nullif(btrim(coalesce(motivo_quita, '')), '') is not null))
);
alter table wms.antecedentes_calidad enable row level security;
create unique index if not exists antecedentes_calidad_vivo_uk on wms.antecedentes_calidad (producto_id) where quitado_en is null;     -- un producto, una marca viva
create index if not exists antecedentes_calidad_producto_idx on wms.antecedentes_calidad (producto_id);

do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'antecedentes_calidad' and policyname = 'lectura') then
    drop policy lectura on wms.antecedentes_calidad;
  end if;
  create policy lectura on wms.antecedentes_calidad for select to authenticated using (wms.es_usuario());
  revoke all on wms.antecedentes_calidad from anon, authenticated;
  grant select on wms.antecedentes_calidad to authenticated;
end $$;

create or replace function wms._antecedentes_guardia() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Una marca de antecedentes de calidad no se borra: se quita con motivo' using errcode = 'P0001'; end if;
  if old.quitado_en is not null then raise exception 'Esa marca ya se quitó: su historia no cambia' using errcode = 'P0001'; end if;
  if new.producto_id <> old.producto_id or new.motivo <> old.motivo or new.marcado_por <> old.marcado_por or new.marcado_en <> old.marcado_en then
    raise exception 'Una marca solo se cierra: no se edita' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'antecedentes_calidad_guardia' and tgrelid = 'wms.antecedentes_calidad'::regclass and not tgisinternal) then
    drop trigger antecedentes_calidad_guardia on wms.antecedentes_calidad;
  end if;
end $$;
create trigger antecedentes_calidad_guardia before update or delete on wms.antecedentes_calidad for each row execute function wms._antecedentes_guardia();

create or replace function wms.marcar_muestreo_estricto(p_producto uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid;
begin
  perform wms._exigir_accion('marcar_antecedentes_calidad', 'Solo Dirección Técnica marca un producto con antecedentes de calidad');
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Cuéntanos qué antecedentes de calidad tiene el producto' using errcode = 'P0001'; end if;
  if not exists (select 1 from catalogo.productos where id = p_producto) then raise exception 'No encontramos ese producto' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.antecedentes_calidad where producto_id = p_producto and quitado_en is null) then
    raise exception 'Ese producto ya está marcado con antecedentes de calidad' using errcode = 'P0001';
  end if;
  insert into wms.antecedentes_calidad (producto_id, motivo, marcado_por) values (p_producto, trim(p_motivo), auth.uid()) returning id into v_id;
  perform wms.registrar_audit('antecedentes_de_calidad_marcados', 'productos', p_producto::text, null, jsonb_build_object('marca', v_id), p_motivo);
  return v_id;
end $$;

create or replace function wms.quitar_muestreo_estricto(p_producto uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid;
begin
  perform wms._exigir_accion('marcar_antecedentes_calidad', 'Solo Dirección Técnica quita la marca de antecedentes de calidad');
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Cuéntanos por qué se quita la marca de antecedentes de calidad' using errcode = 'P0001'; end if;
  select id into v_id from wms.antecedentes_calidad where producto_id = p_producto and quitado_en is null for update;
  if not found then raise exception 'Ese producto no tiene la marca de antecedentes de calidad' using errcode = 'P0001'; end if;
  update wms.antecedentes_calidad set quitado_por = auth.uid(), quitado_en = now(), motivo_quita = trim(p_motivo) where id = v_id;
  perform wms.registrar_audit('antecedentes_de_calidad_quitados', 'productos', p_producto::text, null, jsonb_build_object('marca', v_id), p_motivo);
end $$;

-- La tabla que rige en una fecha (la de vigencia más reciente entre las que rigen). Interno.
create or replace function wms._tabla_muestreo_vigente(p_fecha date default current_date) returns wms.tablas_muestreo
language sql stable security definer set search_path = wms, pg_temp as $$
  select t.* from wms.tablas_muestreo t
   where t.vigente_desde <= p_fecha and (t.vigente_hasta is null or p_fecha <= t.vigente_hasta)
   order by t.vigente_desde desc limit 1
$$;

-- Cuántas unidades se toman de muestra. Regímenes de 100 % (ESTRICTA, DEVOLUCION, LOTE_MENOR) y todo lote por debajo del umbral: todo el lote. Nunca más que las del lote.
create or replace function wms.tamano_muestra(p_unidades integer, p_regimen text, p_fecha date default current_date) returns integer
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_t wms.tablas_muestreo; v_n integer := greatest(coalesce(p_unidades, 0), 0); v_m integer;
begin
  if p_regimen not in ('SIMPLIFICADA', 'NORMAL', 'ESTRICTA', 'DEVOLUCION', 'LOTE_MENOR') then raise exception 'Régimen de muestreo desconocido: %', p_regimen using errcode = 'P0001'; end if;
  v_t := wms._tabla_muestreo_vigente(p_fecha);
  if v_t.id is null then raise exception 'No hay una tabla de muestreo vigente (LS-TB.02.02): Dirección Técnica debe cargar la que rige hoy' using errcode = 'P0001'; end if;
  if p_regimen in ('ESTRICTA', 'DEVOLUCION', 'LOTE_MENOR') or v_n < v_t.umbral_total then return v_n; end if;
  select t.muestra into v_m from wms.tablas_muestreo_tramos t
   where t.tabla_id = v_t.id and t.regimen = p_regimen and v_n >= t.desde and (t.hasta is null or v_n <= t.hasta);
  if v_m is null then raise exception 'La tabla % no tiene un tramo para % unidades', v_t.codigo, v_n using errcode = 'P0001'; end if;
  return least(v_m, v_n);
end $$;

-- El plan de muestreo de un lote recibido: régimen (devolución, estricta, lote pequeño, normal si es producto o proveedor nuevo, simplificada), muestra y tabla.
create or replace function wms.plan_muestreo(p_ingreso_lote uuid) returns table (regimen text, muestra integer, tabla_codigo text)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare
  il wms.ingreso_lotes; i wms.ingresos; v_t wms.tablas_muestreo; v_reg text;
  v_estricta boolean; v_prod_nuevo boolean; v_prov_nuevo boolean;
begin
  select * into il from wms.ingreso_lotes where id = p_ingreso_lote;
  if not found then raise exception 'No encontramos ese lote recibido' using errcode = 'P0001'; end if;
  select * into i from wms.ingresos where id = il.ingreso_id;
  v_t := wms._tabla_muestreo_vigente(current_date);
  if v_t.id is null then raise exception 'No hay una tabla de muestreo vigente (LS-TB.02.02): Dirección Técnica debe cargar la que rige hoy' using errcode = 'P0001'; end if;
  v_estricta := exists (select 1 from wms.antecedentes_calidad a where a.producto_id = il.producto_id and a.quitado_en is null);
  -- Producto nuevo: no hay ningún otro lote registrado de ese producto (los de la propia recepción no cuentan).
  v_prod_nuevo := not exists (select 1 from wms.lotes lt
                               where lt.producto_id = il.producto_id
                                 and not exists (select 1 from wms.ingreso_lotes x where x.lote_id = lt.id and x.ingreso_id = i.id));
  -- Proveedor nuevo: solo en una compra local, y si no hay otra compra confirmada al mismo proveedor (por RUC o, sin RUC, por nombre).
  v_prov_nuevo := i.tipo = 'COMPRA_LOCAL'
    and coalesce(nullif(i.contraparte_ruc, ''), nullif(i.contraparte_nombre, '')) is not null
    and not exists (select 1 from wms.ingresos x
                     where x.id <> i.id and x.tipo = 'COMPRA_LOCAL' and x.estado = 'CONFIRMADO'
                       and ((i.contraparte_ruc is not null and x.contraparte_ruc = i.contraparte_ruc)
                         or (i.contraparte_ruc is null and x.contraparte_nombre = i.contraparte_nombre)));
  v_reg := case when i.tipo = 'DEVOLUCION' then 'DEVOLUCION'
                when v_estricta then 'ESTRICTA'
                when il.cantidad < v_t.umbral_total then 'LOTE_MENOR'
                when v_prod_nuevo or v_prov_nuevo then 'NORMAL'
                else 'SIMPLIFICADA' end;
  regimen := v_reg; muestra := wms.tamano_muestra(il.cantidad, v_reg, current_date); tabla_codigo := v_t.codigo;
  return next;
end $$;

create or replace function wms.muestra_de_lote(p_ingreso_lote uuid) returns integer
language sql stable security definer set search_path = wms, pg_temp as $$
  select muestra from wms.plan_muestreo(p_ingreso_lote)
$$;

alter table wms.actas_organolepticas add column if not exists regimen_muestreo text;
alter table wms.actas_organolepticas add column if not exists tabla_muestreo text;
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'wms.actas_organolepticas'::regclass and conname = 'actas_organolepticas_regimen_check') then
    alter table wms.actas_organolepticas drop constraint actas_organolepticas_regimen_check;
  end if;
  alter table wms.actas_organolepticas add constraint actas_organolepticas_regimen_check
    check (regimen_muestreo is null or regimen_muestreo in ('SIMPLIFICADA', 'NORMAL', 'ESTRICTA', 'DEVOLUCION', 'LOTE_MENOR'));
end $$;

-- Toda acta organoléptica nueva nace con su régimen, su muestra y la tabla con que se calcularon (sin importar por dónde se inserte). Las ya firmadas no se tocan.
create or replace function wms.trg_acta_org_muestreo() returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
declare p record;
begin
  select * into p from wms.plan_muestreo(new.ingreso_lote_id);
  new.regimen_muestreo := p.regimen; new.cantidad_muestra := p.muestra; new.tabla_muestreo := p.tabla_codigo;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'acta_org_muestreo' and tgrelid = 'wms.actas_organolepticas'::regclass and not tgisinternal) then
    drop trigger acta_org_muestreo on wms.actas_organolepticas;
  end if;
end $$;
create trigger acta_org_muestreo before insert on wms.actas_organolepticas for each row execute function wms.trg_acta_org_muestreo();

-- Retiro de techo(√n)+1: `confirmar_ingreso` (de la 0005) llamaba a `wms.muestra_organoleptica`. Se reescribe el texto exacto que cambia (y la migración falla en voz alta si
-- no está, para no dejar la función a medias) y recién entonces se retira la función vieja.
do $$
declare v_oid oid; v_def text; v_viejo text := 'wms.muestra_organoleptica(r.cantidad)'; v_nuevo text := 'wms.muestra_de_lote(r.il_id)';
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'confirmar_ingreso' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position(v_viejo in v_def) > 0 then
    execute replace(v_def, v_viejo, v_nuevo);
  elsif position(v_nuevo in v_def) = 0 then
    raise exception 'No se encontró el texto esperado en wms.confirmar_ingreso: %', v_viejo;
  end if;
  if to_regprocedure('wms.muestra_organoleptica(integer)') is not null then
    drop function wms.muestra_organoleptica(integer);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Retornos: una devolución que se origina desde una Orden de Salida
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.solicitudes_ingreso add column if not exists salida_id uuid references wms.salidas(id);
alter table wms.solicitudes_ingreso add column if not exists retorno_motivo text;
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'wms.solicitudes_ingreso'::regclass and conname = 'solicitudes_retorno_check') then
    alter table wms.solicitudes_ingreso drop constraint solicitudes_retorno_check;
  end if;
  alter table wms.solicitudes_ingreso add constraint solicitudes_retorno_check
    check ((salida_id is null) = (retorno_motivo is null)
       and (retorno_motivo is null or retorno_motivo in ('RECHAZADO_CLIENTE', 'NO_ENTREGADO'))
       and (salida_id is null or tipo = 'DEVOLUCION'));
end $$;
create index if not exists solicitudes_salida_idx on wms.solicitudes_ingreso (salida_id) where salida_id is not null;

-- Una devolución se cuenta al 100 % (acta de recepción): el conteo de una devolución es siempre TOTAL.
create or replace function wms.trg_devolucion_conteo_total() returns trigger language plpgsql as $$
begin
  if new.tipo = 'DEVOLUCION' then new.tipo_conteo := 'TOTAL'; end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'devolucion_conteo_total' and tgrelid = 'wms.ingresos'::regclass and not tgisinternal) then
    drop trigger devolucion_conteo_total on wms.ingresos;
  end if;
end $$;
create trigger devolucion_conteo_total before insert or update of tipo_conteo, tipo on wms.ingresos for each row execute function wms.trg_devolucion_conteo_total();

-- Lo que salió de una Orden de Salida, lote por lote, y cuánto de eso ya se anunció como retorno (las solicitudes anuladas no cuentan).
create or replace function wms.lotes_retornables(p_salida uuid)
returns table (producto_id uuid, lote_id uuid, lote text, vence date, despachado integer, ya_retornado integer, retornable integer)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  return query
  select d.producto_id, d.lote_id, d.codigo, d.vence, d.despachado,
         coalesce((select sum(l.cantidad) from wms.solicitud_ingreso_lineas l join wms.solicitudes_ingreso s on s.id = l.solicitud_id
                    where s.salida_id = p_salida and s.estado <> 'ANULADA' and l.producto_id = d.producto_id and l.lote = d.codigo), 0)::integer,
         greatest(d.despachado - coalesce((select sum(l.cantidad) from wms.solicitud_ingreso_lineas l join wms.solicitudes_ingreso s on s.id = l.solicitud_id
                    where s.salida_id = p_salida and s.estado <> 'ANULADA' and l.producto_id = d.producto_id and l.lote = d.codigo), 0), 0)::integer
    from (select r.producto_id, r.lote_id, lt.codigo, lt.vence, sum(r.cantidad)::integer as despachado
            from wms.reservas r join wms.salida_lineas sl on sl.id = r.linea_id join wms.lotes lt on lt.id = r.lote_id
           where sl.salida_id = p_salida and r.estado = 'CONSUMIDA'
           group by r.producto_id, r.lote_id, lt.codigo, lt.vence) d
   order by d.codigo;
end $$;

-- Regla en la base de datos: lo que vuelve nunca supera lo que salió. Vale para cada línea de una solicitud con Orden de Salida (al crearla y al ajustarla en la recepción).
create or replace function wms.trg_solicitud_linea_retorno() returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.solicitudes_ingreso; v_salio integer; v_otros integer; v_lote text;
begin
  select * into s from wms.solicitudes_ingreso where id = new.solicitud_id;
  if s.salida_id is null or s.estado = 'ANULADA' then return new; end if;
  select coalesce(sum(r.cantidad), 0)::integer into v_salio
    from wms.reservas r join wms.salida_lineas sl on sl.id = r.linea_id join wms.lotes lt on lt.id = r.lote_id
   where sl.salida_id = s.salida_id and r.estado = 'CONSUMIDA' and r.producto_id = new.producto_id and lt.codigo = new.lote;
  if v_salio = 0 then
    raise exception 'El lote % no salió en esa Orden de Salida: no puede volver de ella', new.lote using errcode = 'P0001';
  end if;
  select coalesce(sum(l.cantidad), 0)::integer into v_otros
    from wms.solicitud_ingreso_lineas l join wms.solicitudes_ingreso x on x.id = l.solicitud_id
   where x.salida_id = s.salida_id and x.estado <> 'ANULADA' and l.producto_id = new.producto_id and l.lote = new.lote and l.id <> new.id;
  if v_otros + new.cantidad > v_salio then
    raise exception 'No puede volver más de lo que salió: del lote % salieron %, ya se anunció el retorno de % y se intenta registrar %', new.lote, v_salio, v_otros, new.cantidad using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'solicitud_linea_retorno' and tgrelid = 'wms.solicitud_ingreso_lineas'::regclass and not tgisinternal) then
    drop trigger solicitud_linea_retorno on wms.solicitud_ingreso_lineas;
  end if;
end $$;
create trigger solicitud_linea_retorno before insert or update of cantidad, lote, producto_id on wms.solicitud_ingreso_lineas
  for each row execute function wms.trg_solicitud_linea_retorno();

-- Origina el retorno desde la Orden de Salida: crea una solicitud de ingreso tipo DEVOLUCIÓN con la referencia a la salida, el motivo y la guía. Quien la origina no siempre puede
-- autorizarla (D-32): queda «por autorizar» y avisa a Sandra; si la origina Sandra o Katia y lo pide, queda autorizada («por llegar»).
-- p_lineas = [{lote_id, cantidad}]; p_datos = {doc_original_tipo, doc_original_numero, guia_numero?, observaciones?}.
create or replace function wms.crear_retorno(p_salida uuid, p_motivo text, p_datos jsonb, p_lineas jsonb, p_autorizar boolean default false) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  s wms.salidas; v_id uuid := gen_random_uuid(); v_num text; v_anio text := to_char(now(), 'YYYY'); v_guia text; x jsonb; r record; v_n integer := 0;
  v_cant integer; v_vence date; lt wms.lotes;
begin
  perform wms._exigir_accion('originar_retorno', 'No tienes permiso para registrar el retorno de una Orden de Salida');
  select * into s from wms.salidas where id = p_salida for share;
  if not found then raise exception 'No encontramos esa Orden de Salida' using errcode = 'P0001'; end if;
  if s.estado <> 'CONFIRMADA' then
    raise exception 'La Orden de Salida % todavía no salió: solo lo que ya salió puede volver', s.numero using errcode = 'P0001';
  end if;
  if p_motivo is null or p_motivo not in ('RECHAZADO_CLIENTE', 'NO_ENTREGADO') then
    raise exception 'Elige por qué vuelve: rechazado por el cliente o no entregado' using errcode = 'P0001';
  end if;
  if nullif(trim(p_datos->>'doc_original_tipo'), '') is null or nullif(trim(p_datos->>'doc_original_numero'), '') is null then
    raise exception 'La devolución necesita la factura o boleta original: sin ella no se puede registrar' using errcode = 'P0001';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then raise exception 'Indica cuántas unidades vuelven de al menos un lote' using errcode = 'P0001'; end if;
  v_guia := coalesce(nullif(trim(p_datos->>'guia_numero'), ''), (select g.numero from wms.guias_remision g where g.salida_id = p_salida and g.estado = 'VIGENTE' limit 1));

  v_num := 'SI-' || v_anio || '-' || lpad(wms.siguiente_correlativo('SI-' || v_anio)::text, 5, '0');
  insert into wms.solicitudes_ingreso (id, numero, tipo, propietario_id, estado, guia_numero, doc_original_tipo, doc_original_numero, motivo, observaciones,
                                       origen_creacion, creado_por, salida_id, retorno_motivo)
  values (v_id, v_num, 'DEVOLUCION', s.propietario_id, 'ENVIADA', v_guia, trim(p_datos->>'doc_original_tipo'), trim(p_datos->>'doc_original_numero'),
          case p_motivo when 'RECHAZADO_CLIENTE' then 'Retorno de ' || s.numero || ': rechazado por el cliente' else 'Retorno de ' || s.numero || ': no entregado' end,
          nullif(trim(p_datos->>'observaciones'), ''), 'INTERNO', auth.uid(), p_salida, p_motivo);

  for x in select * from jsonb_array_elements(p_lineas) loop
    v_cant := (x->>'cantidad')::integer;
    if v_cant is null or v_cant <= 0 then raise exception 'La cantidad que vuelve debe ser un entero mayor que cero' using errcode = 'P0001'; end if;
    select * into lt from wms.lotes where id = (x->>'lote_id')::uuid;
    if not found then raise exception 'No encontramos uno de los lotes' using errcode = 'P0001'; end if;
    if lt.vence is null then raise exception 'El lote % no tiene fecha de vencimiento cargada: no se puede anunciar su retorno', lt.codigo using errcode = 'P0001'; end if;
    -- El trigger solicitud_linea_retorno verifica que el lote salió en esa Orden y que no vuelve más de lo que salió.
    insert into wms.solicitud_ingreso_lineas (solicitud_id, producto_id, registro_sanitario, lote, vence, vence_texto_original, cantidad)
    values (v_id, lt.producto_id, (select registro_sanitario from wms.producto_regulatorio where producto_id = lt.producto_id), lt.codigo, lt.vence, lt.vence_texto_original, v_cant);
    v_n := v_n + 1;
  end loop;

  for r in select distinct l.producto_id, p.descripcion, pr.rs_vence
             from wms.solicitud_ingreso_lineas l join catalogo.productos p on p.id = l.producto_id
             join wms.producto_regulatorio pr on pr.producto_id = l.producto_id
            where l.solicitud_id = v_id and pr.rs_vence is not null and pr.rs_vence < current_date loop
    perform wms._alertar('RS_VENCIDO', 'direccion_tecnica', null, r.producto_id, 'rs:' || r.producto_id,
      format('El registro sanitario de %s venció el %s. Su lote no se puede aprobar hasta que lo resuelvas.', r.descripcion, to_char(r.rs_vence, 'DD/MM/YYYY')), null, v_id);
  end loop;

  perform wms._nueva_version_solicitud(v_id, 'Creada desde la Orden de Salida ' || s.numero);
  perform wms.registrar_audit('retorno_registrado', 'solicitudes_ingreso', v_id::text, null,
    jsonb_build_object('numero', v_num, 'salida', s.numero, 'motivo', p_motivo, 'lineas', v_n, 'guia', v_guia));
  if p_autorizar and wms.tiene_rol('asistente_dt', 'direccion_tecnica') then
    perform wms.autorizar_solicitud(v_id);
  else
    perform wms._alertar('RETORNO_POR_AUTORIZAR', 'asistente_dt', null, null, 'retorno:' || v_id,
      format('La Orden de Salida %s tiene un retorno por autorizar (%s): %s. Autoriza la solicitud para que el almacén la reciba como devolución.',
             s.numero, v_num, case p_motivo when 'RECHAZADO_CLIENTE' then 'rechazado por el cliente' else 'no entregado' end), null, v_id);
  end if;
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Liberación (LS-POE.04.05): observación reversible y dictamen del DT del cliente
-- ─────────────────────────────────────────────────────────────────────────────

-- Unidades de una acta que siguen esperando decisión (en el estado en que nacieron: Cuarentena o, en una devolución, Devoluciones).
create or replace function wms._acta_pendiente(p_acta uuid) returns integer
language sql stable security definer set search_path = wms, pg_temp as $$
  select coalesce(sum(s.cantidad), 0)::integer
    from wms.actas_organolepticas o
    join wms.ingresos i on i.id = o.ingreso_id
    join wms.saldos s on s.procedencia_id = o.ingreso_lote_id and s.cantidad > 0
                     and s.estado = case when i.tipo = 'DEVOLUCION' then 'DEVOLUCIONES' else 'CUARENTENA' end
   where o.id = p_acta
$$;

-- ¿El lote de esta acta es de un cliente de almacenamiento (lo libera el DT del cliente) y no del dueño del almacén (lo libera Katia)?
create or replace function wms._acta_es_de_cliente(p_acta uuid) returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (select 1 from wms.actas_organolepticas o
                   join wms.ingresos i on i.id = o.ingreso_id
                   join wms.propietarios p on p.id = i.propietario_id
                  where o.id = p_acta and not p.es_dueno_almacen)
$$;

create table if not exists wms.observaciones_liberacion (
  id uuid primary key default gen_random_uuid(),
  acta_id uuid not null references wms.actas_organolepticas(id),
  texto text not null check (nullif(btrim(texto), '') is not null),
  registrada_por uuid not null,
  registrada_en timestamptz not null default now(),
  cerrada_por uuid,
  cerrada_en timestamptz,
  nota text,
  check ((cerrada_en is null and cerrada_por is null) or (cerrada_en is not null and cerrada_por is not null and nullif(btrim(coalesce(nota, '')), '') is not null))
);
alter table wms.observaciones_liberacion enable row level security;
create unique index if not exists observaciones_liberacion_viva_uk on wms.observaciones_liberacion (acta_id) where cerrada_en is null;     -- un acta, una observación viva
create index if not exists observaciones_liberacion_acta_idx on wms.observaciones_liberacion (acta_id);

create table if not exists wms.dictamenes_cliente (
  id uuid primary key default gen_random_uuid(),
  acta_id uuid not null references wms.actas_organolepticas(id),
  estado text not null default 'REGISTRADO' check (estado in ('REGISTRADO', 'CONFIRMADO', 'ANULADO')),
  via text not null default 'PERSONAL' check (via in ('PERSONAL', 'DT_CLIENTE')),
  cantidad_liberada integer not null check (cantidad_liberada >= 0),
  cantidad_rechazada integer not null check (cantidad_rechazada >= 0),
  fecha_dictamen date,                                  -- la fecha del documento del DT del cliente
  observacion text,
  documento_ref text,                                   -- ruta del PDF o la imagen en el bucket `wms-documentos` (el archivo vive en Storage)
  documento_nombre text,
  documento_tipo text check (documento_tipo is null or documento_tipo in ('application/pdf', 'image/png', 'image/jpeg')),
  documento_hash text,
  registrado_por uuid not null,
  registrado_en timestamptz not null default now(),
  confirmado_por uuid,
  confirmado_en timestamptz,
  anulado_por uuid,
  anulado_en timestamptz,
  motivo_anulacion text,
  movimiento_id uuid references wms.movimientos(id),
  check (cantidad_liberada + cantidad_rechazada > 0),
  -- registrado por el personal: el documento recibido por correo es obligatorio; el DT del cliente (SEC1) dictamina directo en el WMS
  check (via = 'DT_CLIENTE' or (nullif(btrim(coalesce(documento_ref, '')), '') is not null and documento_hash is not null and documento_tipo is not null and fecha_dictamen is not null)),
  check ((estado = 'CONFIRMADO') = (confirmado_en is not null and confirmado_por is not null)),
  check ((estado = 'ANULADO') = (anulado_en is not null and anulado_por is not null and nullif(btrim(coalesce(motivo_anulacion, '')), '') is not null))
);
alter table wms.dictamenes_cliente enable row level security;
create unique index if not exists dictamenes_cliente_uno_por_confirmar_uk on wms.dictamenes_cliente (acta_id) where estado = 'REGISTRADO';
create index if not exists dictamenes_cliente_acta_idx on wms.dictamenes_cliente (acta_id);

do $$ declare t text; begin
  foreach t in array array['observaciones_liberacion', 'dictamenes_cliente'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then
      execute format('drop policy lectura on wms.%I', t);
    end if;
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
    execute format('revoke all on wms.%I from anon, authenticated', t);
    execute format('grant select on wms.%I to authenticated', t);
  end loop;
end $$;

-- Nada se borra ni se reescribe: una observación solo se cierra; un dictamen solo pasa de REGISTRADO a CONFIRMADO o ANULADO.
create or replace function wms._observacion_guardia() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Una observación no se borra: se levanta con una nota' using errcode = 'P0001'; end if;
  if old.cerrada_en is not null then raise exception 'Esa observación ya se cerró: su historia no cambia' using errcode = 'P0001'; end if;
  if new.acta_id <> old.acta_id or new.texto <> old.texto or new.registrada_por <> old.registrada_por or new.registrada_en <> old.registrada_en then
    raise exception 'Una observación solo se cierra: no se edita' using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace function wms._dictamen_guardia() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Un dictamen no se borra: se anula con motivo' using errcode = 'P0001'; end if;
  if old.estado <> 'REGISTRADO' then raise exception 'Ese dictamen ya está % : su historia no cambia', lower(old.estado) using errcode = 'P0001'; end if;
  if (new.acta_id, new.via, new.cantidad_liberada, new.cantidad_rechazada, new.fecha_dictamen, new.observacion, new.documento_ref, new.documento_nombre,
      new.documento_tipo, new.documento_hash, new.registrado_por, new.registrado_en)
     is distinct from (old.acta_id, old.via, old.cantidad_liberada, old.cantidad_rechazada, old.fecha_dictamen, old.observacion, old.documento_ref, old.documento_nombre,
      old.documento_tipo, old.documento_hash, old.registrado_por, old.registrado_en) then
    raise exception 'Un dictamen registrado no se edita: se anula con motivo y se registra otro' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'observaciones_liberacion_guardia' and tgrelid = 'wms.observaciones_liberacion'::regclass and not tgisinternal) then
    drop trigger observaciones_liberacion_guardia on wms.observaciones_liberacion;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'dictamenes_cliente_guardia' and tgrelid = 'wms.dictamenes_cliente'::regclass and not tgisinternal) then
    drop trigger dictamenes_cliente_guardia on wms.dictamenes_cliente;
  end if;
end $$;
create trigger observaciones_liberacion_guardia before update or delete on wms.observaciones_liberacion for each row execute function wms._observacion_guardia();
create trigger dictamenes_cliente_guardia before update or delete on wms.dictamenes_cliente for each row execute function wms._dictamen_guardia();

-- ¿Hay un dictamen del DT del cliente en curso para este paso? (misma idea que `orden_ctx` y `salida_ctx`: lo fija la función que lo aplica, dentro de su transacción, y aquí se vuelve a
-- comprobar contra la fila: quien llama no puede fabricar el contexto.) Lo usa `postear_movimiento` para dejar que Sandra o el DT del cliente —y no solo Katia— registren
-- el cambio de estado que ESE dictamen autoriza.
create or replace function wms._dictamen_en_curso(p_referencia_tipo text, p_referencia_id text) returns boolean
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare d wms.dictamenes_cliente;
begin
  if p_referencia_tipo is distinct from 'dictamen_cliente' or p_referencia_id is null then return false; end if;
  if coalesce(current_setting('wms.dictamen_ctx', true), '') <> p_referencia_id then return false; end if;
  select * into d from wms.dictamenes_cliente where id = p_referencia_id::uuid and estado = 'REGISTRADO';
  if not found then return false; end if;
  if d.via = 'PERSONAL' then return wms.tiene_permiso('registrar_dictamen_cliente'); end if;
  return wms.tiene_permiso('liberar_stock_propietario')
     and wms.propietario_dt_cliente() = (select i.propietario_id from wms.actas_organolepticas o join wms.ingresos i on i.id = o.ingreso_id where o.id = d.acta_id);
end $$;

-- Cambio de estado sanitario: solo Katia, o el flujo del dictamen de un DT de cliente (Sandra/Katia que lo registraron, o el propio DT del cliente con SEC1).
do $$
declare v_oid oid; v_def text;
  v_viejo text := 'if p_tipo = ''CAMBIO_ESTADO'' and not wms.tiene_rol(''direccion_tecnica'') then';
  v_nuevo text := 'if p_tipo = ''CAMBIO_ESTADO'' and not (wms.tiene_rol(''direccion_tecnica'') or wms._dictamen_en_curso(p_referencia_tipo, p_referencia_id)) then';
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'postear_movimiento' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position(v_viejo in v_def) > 0 then
    execute replace(v_def, v_viejo, v_nuevo);
  elsif position(v_nuevo in v_def) = 0 then
    raise exception 'No se encontró el texto esperado en wms.postear_movimiento: %', v_viejo;
  end if;
end $$;

-- El producto de un cliente no lo libera Katia: su acta solo se firma por el dictamen del DT del cliente. Y al firmarse cualquier acta se cierra su observación reversible
-- («disposición final»).
create or replace function wms.trg_acta_org_liberacion() returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if new.estado = 'FIRMADA' and old.estado <> 'FIRMADA' then
    if wms._acta_es_de_cliente(new.id)
       and not exists (select 1 from wms.dictamenes_cliente d where d.acta_id = new.id and d.id::text = coalesce(current_setting('wms.dictamen_ctx', true), '')) then
      raise exception 'Este producto es de un cliente de almacenamiento: lo libera el DT del cliente, no Dirección Técnica de Logissa. Registra su dictamen y confirma el cambio de estado.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create or replace function wms.trg_acta_org_cierra_observacion() returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if new.estado = 'FIRMADA' and old.estado <> 'FIRMADA' then
    update wms.observaciones_liberacion
       set cerrada_por = coalesce(new.decidido_por, auth.uid()), cerrada_en = now(),
           nota = 'Disposición final: ' || case new.decision when 'APROBADO' then 'Aprobado' else 'Bajas/Rechazados' end
     where acta_id = new.id and cerrada_en is null;
  end if;
  return null;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'acta_org_liberacion' and tgrelid = 'wms.actas_organolepticas'::regclass and not tgisinternal) then
    drop trigger acta_org_liberacion on wms.actas_organolepticas;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'acta_org_cierra_observacion' and tgrelid = 'wms.actas_organolepticas'::regclass and not tgisinternal) then
    drop trigger acta_org_cierra_observacion on wms.actas_organolepticas;
  end if;
end $$;
create trigger acta_org_liberacion before update on wms.actas_organolepticas for each row execute function wms.trg_acta_org_liberacion();
create trigger acta_org_cierra_observacion after update on wms.actas_organolepticas for each row execute function wms.trg_acta_org_cierra_observacion();

-- Observación reversible: el producto sigue en Cuarentena hasta la disposición final. En un producto de Logissa la deja Dirección Técnica; en uno de un cliente, Sandra o Katia la
-- registran por el DT del cliente.
create or replace function wms.observar_acta_organoleptica(p_acta uuid, p_texto text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare o wms.actas_organolepticas; v_id uuid; v_cliente boolean;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  select * into o from wms.actas_organolepticas where id = p_acta for update;
  if not found then raise exception 'Acta inexistente' using errcode = 'P0001'; end if;
  v_cliente := wms._acta_es_de_cliente(p_acta);
  if v_cliente then
    if not wms.tiene_permiso('registrar_dictamen_cliente') then raise exception 'Solo Sandra o Dirección Técnica registran la observación del DT de un cliente' using errcode = '42501'; end if;
  elsif not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica deja un producto Observado' using errcode = '42501';
  end if;
  if o.estado = 'FIRMADA' then raise exception 'El acta ya está firmada: no se puede observar' using errcode = 'P0001'; end if;
  if o.estado <> 'PENDIENTE_DT' then raise exception 'El acta todavía no está completa: falta que la envíen a Dirección Técnica' using errcode = 'P0001'; end if;
  if nullif(btrim(coalesce(p_texto, '')), '') is null then raise exception 'Cuéntanos qué se observa y qué hay que corregir' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.observaciones_liberacion where acta_id = p_acta and cerrada_en is null) then raise exception 'Esa acta ya está Observada' using errcode = 'P0001'; end if;
  insert into wms.observaciones_liberacion (acta_id, texto, registrada_por) values (p_acta, trim(p_texto), auth.uid()) returning id into v_id;
  perform wms.registrar_audit('acta_organoleptica_observada', 'actas_organolepticas', p_acta::text, null, jsonb_build_object('observacion', v_id), p_texto);
  return v_id;
end $$;

create or replace function wms.levantar_observacion_acta(p_acta uuid, p_nota text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid; v_cliente boolean;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  v_cliente := wms._acta_es_de_cliente(p_acta);
  if v_cliente then
    if not wms.tiene_permiso('registrar_dictamen_cliente') then raise exception 'Solo Sandra o Dirección Técnica levantan la observación del DT de un cliente' using errcode = '42501'; end if;
  elsif not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica levanta una observación' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_nota, '')), '') is null then raise exception 'Cuéntanos cómo se resolvió la observación' using errcode = 'P0001'; end if;
  select id into v_id from wms.observaciones_liberacion where acta_id = p_acta and cerrada_en is null for update;
  if not found then raise exception 'Esa acta no está Observada' using errcode = 'P0001'; end if;
  update wms.observaciones_liberacion set cerrada_por = auth.uid(), cerrada_en = now(), nota = 'Observación levantada: ' || trim(p_nota) where id = v_id;
  perform wms.registrar_audit('observacion_levantada', 'actas_organolepticas', p_acta::text, null, jsonb_build_object('observacion', v_id), p_nota);
end $$;

-- Cuántas unidades del dictamen caben en lo que espera decisión (y reglas comunes a quien lo registra).
create or replace function wms._validar_dictamen(p_acta uuid, p_liberada integer, p_rechazada integer) returns wms.actas_organolepticas
language plpgsql security definer set search_path = wms, pg_temp as $$
declare o wms.actas_organolepticas; v_pend integer;
begin
  select * into o from wms.actas_organolepticas where id = p_acta for update;
  if not found then raise exception 'Acta inexistente' using errcode = 'P0001'; end if;
  if not wms._acta_es_de_cliente(p_acta) then
    raise exception 'Este producto es de Logissa: lo libera Dirección Técnica de Logissa con su acta, no un dictamen de cliente' using errcode = 'P0001';
  end if;
  if o.estado = 'FIRMADA' then raise exception 'El acta ya está firmada: ese lote ya tiene su decisión' using errcode = 'P0001'; end if;
  if o.estado <> 'PENDIENTE_DT' then
    raise exception 'La evaluación organoléptica todavía no está completa: Sandra la termina y la envía antes de registrar el dictamen del DT del cliente' using errcode = 'P0001';
  end if;
  if coalesce(p_liberada, 0) < 0 or coalesce(p_rechazada, 0) < 0 or coalesce(p_liberada, 0) + coalesce(p_rechazada, 0) = 0 then
    raise exception 'El dictamen tiene que liberar o rechazar al menos una unidad' using errcode = 'P0001';
  end if;
  v_pend := wms._acta_pendiente(p_acta);
  if p_liberada + p_rechazada > v_pend then
    raise exception 'Liberadas y rechazadas suman %, pero solo hay % unidades esperando decisión', p_liberada + p_rechazada, v_pend using errcode = 'P0001';
  end if;
  return o;
end $$;

-- Aplica un dictamen REGISTRADO: cambia el estado de las unidades (Cuarentena/Devoluciones → Aprobado, y lo rechazado → Bajas/Rechazados) con el dictamen como sustento. Cuando todo
-- el lote ya tiene dictamen, firma el acta (Aprobado si se liberó algo; si no, Bajas/Rechazados).
create or replace function wms._aplicar_dictamen_cliente(p_dictamen uuid) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  d wms.dictamenes_cliente; o wms.actas_organolepticas; i wms.ingresos; il wms.ingreso_lotes;
  v_desde text; c record; v_lib integer; v_rec integer; v_tomar integer; v_partidas jsonb := '[]'::jsonb; v_mov uuid;
  v_lib_total integer; v_rec_total integer; v_cont jsonb; v_decision text; v_nombre text;
begin
  select * into d from wms.dictamenes_cliente where id = p_dictamen for update;
  select * into o from wms.actas_organolepticas where id = d.acta_id for update;
  select * into i from wms.ingresos where id = o.ingreso_id;
  select * into il from wms.ingreso_lotes where id = o.ingreso_lote_id;
  v_desde := case when i.tipo = 'DEVOLUCION' then 'DEVOLUCIONES' else 'CUARENTENA' end;
  v_lib := d.cantidad_liberada; v_rec := d.cantidad_rechazada;
  if v_lib + v_rec > wms._acta_pendiente(o.id) then
    raise exception 'Ya no hay % unidades esperando decisión en ese lote: revisa el dictamen', v_lib + v_rec using errcode = 'P0001';
  end if;
  -- Solo las unidades de ESTA entrega que siguen esperando su decisión (la aprobación no se hereda): primero se libera, luego se rechaza.
  for c in select s.posicion_id, s.producto_id, s.lote_id, s.propietario_id, s.procedencia_id, s.cantidad
             from wms.saldos s where s.procedencia_id = il.id and s.estado = v_desde and s.cantidad > 0 order by s.posicion_id loop
    exit when v_lib + v_rec <= 0;
    if v_lib > 0 then
      v_tomar := least(c.cantidad, v_lib);
      v_partidas := v_partidas
        || jsonb_build_object('posicion_id', c.posicion_id, 'producto_id', c.producto_id, 'lote_id', c.lote_id, 'propietario_id', c.propietario_id, 'estado', v_desde, 'origen', i.tipo, 'procedencia_id', c.procedencia_id, 'delta', -v_tomar)
        || jsonb_build_object('posicion_id', c.posicion_id, 'producto_id', c.producto_id, 'lote_id', c.lote_id, 'propietario_id', c.propietario_id, 'estado', 'APROBADO', 'origen', i.tipo, 'procedencia_id', c.procedencia_id, 'delta', v_tomar);
      v_lib := v_lib - v_tomar; c.cantidad := c.cantidad - v_tomar;
    end if;
    if v_rec > 0 and c.cantidad > 0 then
      v_tomar := least(c.cantidad, v_rec);
      v_partidas := v_partidas
        || jsonb_build_object('posicion_id', c.posicion_id, 'producto_id', c.producto_id, 'lote_id', c.lote_id, 'propietario_id', c.propietario_id, 'estado', v_desde, 'origen', i.tipo, 'procedencia_id', c.procedencia_id, 'delta', -v_tomar)
        || jsonb_build_object('posicion_id', c.posicion_id, 'producto_id', c.producto_id, 'lote_id', c.lote_id, 'propietario_id', c.propietario_id, 'estado', 'BAJAS_RECHAZADOS', 'origen', i.tipo, 'procedencia_id', c.procedencia_id, 'delta', v_tomar);
      v_rec := v_rec - v_tomar;
    end if;
  end loop;

  perform set_config('wms.dictamen_ctx', p_dictamen::text, true);
  v_mov := wms.postear_movimiento('CAMBIO_ESTADO', 'Dictamen del DT del cliente · acta organoléptica ' || o.numero, v_partidas, 'dictamen_cliente', p_dictamen::text, 'DICTAMEN_CLIENTE', p_dictamen::text);
  update wms.dictamenes_cliente set estado = 'CONFIRMADO', confirmado_por = auth.uid(), confirmado_en = now(), movimiento_id = v_mov where id = p_dictamen;

  -- ¿Ya tiene dictamen todo el lote? Entonces el acta queda firmada.
  if wms._acta_pendiente(o.id) = 0 then
    select coalesce(sum(x.cantidad_liberada), 0), coalesce(sum(x.cantidad_rechazada), 0) into v_lib_total, v_rec_total
      from wms.dictamenes_cliente x where x.acta_id = o.id and x.estado = 'CONFIRMADO';
    v_decision := case when v_lib_total > 0 then 'APROBADO' else 'BAJAS_RECHAZADOS' end;
    v_cont := jsonb_build_object(
      'numero', o.numero, 'formato', 'LS-FR.55.02', 'ingreso_lote_id', o.ingreso_lote_id, 'cantidad_lote', o.cantidad_lote, 'cantidad_muestra', o.cantidad_muestra,
      'regimen_muestreo', o.regimen_muestreo, 'tabla_muestreo', o.tabla_muestreo,
      'cert_analisis', o.cert_analisis, 'checklist', o.checklist, 'observacion', o.observacion, 'destino_sugerido', o.destino_sugerido, 'conclusion', o.conclusion,
      'decision', v_decision, 'estado_origen', v_desde, 'liberacion', 'DT_CLIENTE', 'cantidad_liberada', v_lib_total, 'cantidad_rechazada', v_rec_total,
      'dictamenes', (select jsonb_agg(jsonb_build_object('dictamen', x.id, 'via', x.via, 'liberada', x.cantidad_liberada, 'rechazada', x.cantidad_rechazada,
                                                         'fecha', x.fecha_dictamen, 'documento', x.documento_nombre, 'hash_documento', x.documento_hash) order by x.registrado_en)
                       from wms.dictamenes_cliente x where x.acta_id = o.id and x.estado = 'CONFIRMADO'),
      'producto', (select jsonb_build_object('codigo', p.codigo, 'descripcion', p.descripcion, 'registro_sanitario', pr.registro_sanitario, 'rs_vence', pr.rs_vence,
                                             'fabricante', pr.fabricante, 'forma', pr.forma_presentacion)
                     from catalogo.productos p left join wms.producto_regulatorio pr on pr.producto_id = p.id where p.id = il.producto_id),
      'lote', (select jsonb_build_object('codigo', lt.codigo, 'vence', lt.vence) from wms.lotes lt where lt.id = il.lote_id));
    update wms.actas_organolepticas set estado = 'FIRMADA', decision = v_decision, decidido_por = auth.uid(), decidido_en = now(),
           observacion_dt = format('Dictamen del DT del cliente: %s unidades liberadas y %s rechazadas.', v_lib_total, v_rec_total),
           contenido = v_cont, hash_contenido = wms._hash(v_cont), movimiento_id = v_mov
     where id = o.id;
    v_nombre := 'DT del cliente (dictamen registrado en el WMS)';
    insert into wms.acta_firmas (acta_tipo, acta_id, rol_firma, user_id, nombre, registrado_por, hash_contenido)
    values ('ORGANOLEPTICA', o.id, 'DIRECCION_TECNICA', auth.uid(), v_nombre, auth.uid(), wms._hash(v_cont));
    if i.expediente_id is not null then
      insert into wms.expediente_documentos (expediente_id, tipo, descripcion, referencia_tipo, referencia_id, agregado_por)
      values (i.expediente_id, 'ACTA_ORGANOLEPTICA', 'Acta organoléptica ' || o.numero, 'acta_organoleptica', o.id::text, auth.uid()) on conflict do nothing;
      update wms.expediente_faltantes set estado = 'RESUELTO', resuelto_por = auth.uid(), resuelto_en = now(), nota = 'Acta firmada con el dictamen del DT del cliente'
       where expediente_id = i.expediente_id and tipo = 'ACTA_ORGANOLEPTICA' and documento like 'Acta organoléptica ' || o.numero || '%' and estado = 'ABIERTO';
    end if;
  end if;
  perform set_config('wms.dictamen_ctx', '', true);

  if i.expediente_id is not null and d.documento_ref is not null then
    insert into wms.expediente_documentos (expediente_id, tipo, descripcion, referencia_tipo, referencia_id, agregado_por)
    values (i.expediente_id, 'DICTAMEN_DT_CLIENTE', 'Dictamen del DT del cliente · acta ' || o.numero || ' · ' || coalesce(d.documento_nombre, 'documento'), 'dictamen_cliente', p_dictamen::text, auth.uid())
    on conflict do nothing;
  end if;
  update wms.alertas set estado = 'ATENDIDA', atendida_por = auth.uid(), atendida_en = now(), nota_atencion = 'Se confirmó el cambio de estado'
   where clave = 'dictamen:' || p_dictamen and estado = 'ABIERTA';
  perform wms.registrar_audit('dictamen_cliente_confirmado', 'actas_organolepticas', o.id::text, null,
    jsonb_build_object('dictamen', p_dictamen, 'liberada', d.cantidad_liberada, 'rechazada', d.cantidad_rechazada, 'movimiento_id', v_mov, 'via', d.via), d.observacion);
  return v_mov;
end $$;

-- Sandra o Katia registran el dictamen del DT del cliente: el documento que llegó por correo (PDF o imagen; el archivo ya está en Storage y aquí va su referencia y su hash) con las
-- cantidades liberadas y rechazadas. Todavía NO cambia nada: falta confirmar el cambio de estado.
create or replace function wms.registrar_dictamen_cliente(
  p_acta uuid, p_liberada integer, p_rechazada integer, p_fecha date, p_observacion text,
  p_documento_ref text, p_documento_nombre text, p_documento_hash text, p_documento_tipo text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare o wms.actas_organolepticas; v_id uuid; i wms.ingresos; v_rol text; pr record;
begin
  perform wms._exigir_accion('registrar_dictamen_cliente', 'Solo Sandra o Dirección Técnica registran el dictamen del DT de un cliente');
  o := wms._validar_dictamen(p_acta, p_liberada, p_rechazada);
  if p_fecha is null then raise exception 'Escribe la fecha del dictamen (la del documento que recibiste)' using errcode = 'P0001'; end if;
  if p_fecha > current_date then raise exception 'La fecha del dictamen no puede ser futura' using errcode = 'P0001'; end if;
  if nullif(btrim(coalesce(p_documento_ref, '')), '') is null or p_documento_hash is null then
    raise exception 'Adjunta el documento del dictamen que llegó por correo (PDF o imagen)' using errcode = 'P0001';
  end if;
  if p_documento_tipo is null or p_documento_tipo not in ('application/pdf', 'image/png', 'image/jpeg') then
    raise exception 'El documento tiene que ser un PDF o una imagen (PNG o JPG)' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.dictamenes_cliente where acta_id = p_acta and estado = 'REGISTRADO') then
    raise exception 'Ya hay un dictamen registrado para este lote esperando confirmación: confírmalo o anúlalo con motivo' using errcode = 'P0001';
  end if;
  insert into wms.dictamenes_cliente (acta_id, via, cantidad_liberada, cantidad_rechazada, fecha_dictamen, observacion, documento_ref, documento_nombre, documento_tipo, documento_hash, registrado_por)
  values (p_acta, 'PERSONAL', p_liberada, p_rechazada, p_fecha, nullif(trim(p_observacion), ''), trim(p_documento_ref), nullif(trim(p_documento_nombre), ''), p_documento_tipo, p_documento_hash, auth.uid())
  returning id into v_id;
  select * into i from wms.ingresos where id = o.ingreso_id;
  select p.descripcion, lt.codigo as lote into pr from wms.ingreso_lotes il join catalogo.productos p on p.id = il.producto_id left join wms.lotes lt on lt.id = il.lote_id where il.id = o.ingreso_lote_id;
  -- El otro de los dos confirma el cambio de estado: si lo registró Katia, avisa a Sandra; si lo registró Sandra, a Katia.
  v_rol := case when wms.tiene_rol('direccion_tecnica') then 'asistente_dt' else 'direccion_tecnica' end;
  perform wms._alertar('DICTAMEN_POR_CONFIRMAR', v_rol, i.id, null, 'dictamen:' || v_id,
    format('Se registró el dictamen del DT del cliente para %s (lote %s): %s liberadas y %s rechazadas. Falta confirmar el cambio de estado.', pr.descripcion, pr.lote, p_liberada, p_rechazada),
    pr.lote, i.solicitud_id);
  perform wms.registrar_audit('dictamen_cliente_registrado', 'actas_organolepticas', p_acta::text, null,
    jsonb_build_object('dictamen', v_id, 'liberada', p_liberada, 'rechazada', p_rechazada, 'fecha', p_fecha, 'documento', p_documento_nombre, 'hash', p_documento_hash), p_observacion);
  return v_id;
end $$;

create or replace function wms.confirmar_dictamen_cliente(p_dictamen uuid) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare d wms.dictamenes_cliente;
begin
  perform wms._exigir_accion('registrar_dictamen_cliente', 'Solo Sandra o Dirección Técnica confirman el cambio de estado por el dictamen del DT de un cliente');
  select * into d from wms.dictamenes_cliente where id = p_dictamen for update;
  if not found then raise exception 'No encontramos ese dictamen' using errcode = 'P0001'; end if;
  if d.estado <> 'REGISTRADO' then raise exception 'Ese dictamen ya está %', lower(d.estado) using errcode = 'P0001'; end if;
  if d.via <> 'PERSONAL' then raise exception 'Ese dictamen lo emitió el propio DT del cliente: se aplica solo' using errcode = 'P0001'; end if;
  if coalesce((select valor from wms.parametros where clave = 'dictamen_cliente_dos_personas'), 'no') = 'si' and d.registrado_por = auth.uid() then
    raise exception 'El cambio de estado lo confirma otra persona, distinta de quien registró el dictamen' using errcode = 'P0001';
  end if;
  perform wms._validar_dictamen(d.acta_id, d.cantidad_liberada, d.cantidad_rechazada);
  return wms._aplicar_dictamen_cliente(p_dictamen);
end $$;

create or replace function wms.anular_dictamen_cliente(p_dictamen uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare d wms.dictamenes_cliente;
begin
  perform wms._exigir_accion('registrar_dictamen_cliente', 'Solo Sandra o Dirección Técnica anulan un dictamen registrado');
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Cuéntanos por qué se anula el dictamen' using errcode = 'P0001'; end if;
  select * into d from wms.dictamenes_cliente where id = p_dictamen for update;
  if not found then raise exception 'No encontramos ese dictamen' using errcode = 'P0001'; end if;
  if d.estado <> 'REGISTRADO' then raise exception 'Ese dictamen ya está %: un dictamen confirmado ya cambió el estado y no se anula', lower(d.estado) using errcode = 'P0001'; end if;
  update wms.dictamenes_cliente set estado = 'ANULADO', anulado_por = auth.uid(), anulado_en = now(), motivo_anulacion = trim(p_motivo) where id = p_dictamen;
  update wms.alertas set estado = 'ATENDIDA', atendida_por = auth.uid(), atendida_en = now(), nota_atencion = 'Se anuló el dictamen'
   where clave = 'dictamen:' || p_dictamen and estado = 'ABIERTA';
  perform wms.registrar_audit('dictamen_cliente_anulado', 'actas_organolepticas', d.acta_id::text, null, jsonb_build_object('dictamen', p_dictamen), p_motivo);
end $$;

-- El rol «DT de cliente» (SEC1): libera o rechaza el stock de SU propietario, con ese único permiso. DESHABILITADO: mientras `acceso_clientes_habilitado` esté apagado nadie
-- puede tener el rol, y aunque existiera, `propietario_dt_cliente()` no devuelve nada.
create or replace function wms.dictaminar_como_dt_cliente(p_acta uuid, p_liberada integer, p_rechazada integer, p_observacion text default null) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare o wms.actas_organolepticas; v_prop uuid; v_id uuid;
begin
  perform wms._exigir_accion('liberar_stock_propietario', 'Solo el DT de un cliente libera o rechaza el stock de su propietario');
  v_prop := wms.propietario_dt_cliente();
  if v_prop is null then raise exception 'El acceso de clientes todavía no está habilitado (D-68): el DT del cliente aún no puede dictaminar en el WMS' using errcode = '42501'; end if;
  o := wms._validar_dictamen(p_acta, p_liberada, p_rechazada);
  if (select i.propietario_id from wms.ingresos i where i.id = o.ingreso_id) is distinct from v_prop then
    raise exception 'Ese lote no es de tu propietario: solo puedes liberar o rechazar tu propio stock' using errcode = '42501';
  end if;
  insert into wms.dictamenes_cliente (acta_id, via, cantidad_liberada, cantidad_rechazada, fecha_dictamen, observacion, registrado_por)
  values (p_acta, 'DT_CLIENTE', p_liberada, p_rechazada, current_date, nullif(trim(p_observacion), ''), auth.uid()) returning id into v_id;
  perform wms._aplicar_dictamen_cliente(v_id);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function
  wms.marcar_muestreo_estricto(uuid, text), wms.quitar_muestreo_estricto(uuid, text),
  wms.crear_retorno(uuid, text, jsonb, jsonb, boolean), wms.lotes_retornables(uuid),
  wms.observar_acta_organoleptica(uuid, text), wms.levantar_observacion_acta(uuid, text),
  wms.registrar_dictamen_cliente(uuid, integer, integer, date, text, text, text, text, text), wms.confirmar_dictamen_cliente(uuid), wms.anular_dictamen_cliente(uuid, text),
  wms.dictaminar_como_dt_cliente(uuid, integer, integer, text)
  to authenticated;
revoke execute on all functions in schema wms from public;
