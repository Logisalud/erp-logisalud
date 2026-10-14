-- WMS Logisalud — migración 0011 (Salidas, PR S1): cimientos de datos y AISLAMIENTO POR PROPIETARIO.
--
-- Plan: docs/wms/salidas/diagnostico-y-plan.md (§2.2, §4.6, §4.9, §6 S1). Decisiones: D-57, D-65, D-67, D-68, D-70.
--
--   1. Roles nuevos (transporte, conformidad, salidas sin venta y USUARIO DE CLIENTE ligado a un propietario) y
--      acciones nuevas por operación (dar_conformidad, cambiar_lote_asignado, …).
--   2. P0 — AISLAMIENTO: `wms.es_usuario()` deja de ser «cualquier fila de usuario_roles». Pasa a ser una lista
--      cerrada de roles del personal: un usuario de cliente (y los roles de campo, hasta que tengan sus propias
--      políticas) NO lee ninguna de las 27 tablas que dependen de ella. El cliente lee solo lo de su propietario.
--      Interruptor `acceso_clientes_habilitado` (apagado): mientras SEC1 no esté en producción, la base rechaza
--      crear un usuario de cliente y, aunque existiera, sus políticas no devuelven nada. Solo se enciende con SQL
--      de un administrador de la base, nunca desde la aplicación.
--   3. Tipos de movimiento SALIDA y RETORNO (creados DESHABILITADOS: los habilita S2 junto con sus reglas).
--   4. Áreas: EMBALAJE y DESPACHO pasan a estar en alcance (admiten APROBADO) y se crean tres zonas configurables
--      y APAGADAS (D-52 sigue abierta: sin ubicación física ni tipo BPA confirmado por Katia y Charlie).
--   5. `posiciones.orden_recorrido` (D-65): orden de picking por la posición física de la columna, configurable.
--   6. Alertas dirigidas a `jefe_transporte`; tabla `vehiculos` (mínima, sin pantallas).
--   7. P0 — FUNCIONES: hasta hoy todas las funciones de `wms` tenían EXECUTE para PUBLIC (el valor por defecto de
--      Postgres). Cualquier persona autenticada del proyecto —sin rol en el WMS, de Compras, de Pedidos o un futuro
--      cliente— podía llamar a los ayudantes internos (`_snapshot_solicitud`, `_aplicar_cambios`, `_alertar`…),
--      falsificar eventos de auditoría con `registrar_audit` o mover correlativos. Se cierra: solo quedan con
--      EXECUTE las funciones que concede explícitamente cada migración. Toda migración nueva termina con ese mismo
--      `revoke` (hay una prueba que lo exige).
--
-- NO SE APLICA SOLA: se aplica a mano, con aprobación, en la base consolidada. Re-ejecutable (existencia explícita
-- en vez de `drop … if exists`). RLS desde el `create table`. Nada se concede a `anon`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Roles y acciones
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.usuario_roles add column if not exists propietario_id uuid references wms.propietarios(id);

do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'wms.usuario_roles'::regclass and conname = 'usuario_roles_rol_check') then
    alter table wms.usuario_roles drop constraint usuario_roles_rol_check;
  end if;
  alter table wms.usuario_roles add constraint usuario_roles_rol_check check (rol in (
    'direccion_tecnica', 'asistente_dt', 'jefe_almacen', 'reemplazo_jefe', 'auxiliar', 'auditoria_lectura', 'admin_wms',
    'jefe_transporte', 'conductor', 'auxiliar_transporte', 'conformidad_despacho', 'autoriza_salidas_sin_venta',
    'usuario_cliente'));
  -- Solo el usuario de cliente lleva propietario, y siempre lo lleva.
  if exists (select 1 from pg_constraint where conrelid = 'wms.usuario_roles'::regclass and conname = 'usuario_roles_cliente_propietario_check') then
    alter table wms.usuario_roles drop constraint usuario_roles_cliente_propietario_check;
  end if;
  alter table wms.usuario_roles add constraint usuario_roles_cliente_propietario_check
    check ((rol = 'usuario_cliente') = (propietario_id is not null));
end $$;

do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'wms.permisos_rol'::regclass and conname = 'permisos_rol_accion_check') then
    alter table wms.permisos_rol drop constraint permisos_rol_accion_check;
  end if;
  alter table wms.permisos_rol add constraint permisos_rol_accion_check check (accion in (
    'ver', 'ejecutar', 'verificar', 'aprobar', 'ajustar', 'configurar', 'exportar', 'auditar',
    'dar_conformidad', 'cambiar_lote_asignado', 'imprimir_paquete_documental',
    'gestionar_documentos_regulatorios', 'autorizar_salida_sin_venta'));
end $$;

-- Permisos por operación (§4.6). El usuario de cliente NO tiene ninguna fila aquí: lo suyo (crear órdenes de salida)
-- llega en B2 con funciones que validan el propietario. Los roles de campo (conductor, auxiliar_transporte) tampoco:
-- sus permisos llegan con sus pantallas (S4/S9). La conformidad es un permiso propio (D-57), asignable a quien corresponda.
insert into wms.permisos_rol (rol, accion) values
  ('jefe_transporte', 'ver'), ('jefe_transporte', 'cambiar_lote_asignado'), ('jefe_transporte', 'imprimir_paquete_documental'),
  ('jefe_almacen', 'cambiar_lote_asignado'), ('reemplazo_jefe', 'cambiar_lote_asignado'),
  ('conformidad_despacho', 'ver'), ('conformidad_despacho', 'dar_conformidad'),
  ('autoriza_salidas_sin_venta', 'ver'), ('autoriza_salidas_sin_venta', 'autorizar_salida_sin_venta'),
  ('direccion_tecnica', 'gestionar_documentos_regulatorios'), ('direccion_tecnica', 'imprimir_paquete_documental')
on conflict (rol, accion) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. P0 — Aislamiento por propietario
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.parametros (clave, valor, nota) values
  ('acceso_clientes_habilitado', 'false',
   'D-68 (P0): apagado hasta que SEC1 (endurecer las lecturas abiertas de Compras y Pedidos) esté en producción. Solo se enciende con SQL de un administrador de la base, con aprobación de Sebas.')
on conflict (clave) do nothing;

-- La aplicación (rol `authenticated`) no puede encender ni tocar el interruptor, ni siquiera con el rol admin_wms.
create or replace function wms.trg_proteger_acceso_clientes()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' and coalesce(new.clave, old.clave) = 'acceso_clientes_habilitado' then
    raise exception 'El acceso de clientes solo lo habilita un administrador de la base (D-68)' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'proteger_acceso_clientes' and tgrelid = 'wms.parametros'::regclass and not tgisinternal) then
    drop trigger proteger_acceso_clientes on wms.parametros;
  end if;
end $$;
create trigger proteger_acceso_clientes before insert or update or delete on wms.parametros
  for each row execute function wms.trg_proteger_acceso_clientes();

-- ¿Quién es «personal»? Lista CERRADA (falla cerrada: un rol nuevo no lee nada hasta que se clasifique aquí).
-- Fuera de la lista: usuario_cliente (solo lo suyo, abajo) y conductor / auxiliar_transporte (sus políticas por ruta
-- llegan con S4/S9; hasta entonces no leen el inventario).
create or replace function wms.es_usuario()
returns boolean language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (
    select 1 from wms.usuario_roles r
    where r.user_id = auth.uid()
      and r.rol = any (array['direccion_tecnica', 'asistente_dt', 'jefe_almacen', 'reemplazo_jefe', 'auxiliar',
                             'auditoria_lectura', 'admin_wms', 'jefe_transporte', 'conformidad_despacho',
                             'autoriza_salidas_sin_venta'])
      and r.desde <= current_date
      and (r.hasta is null or r.hasta >= current_date))
$$;

-- Propietario del usuario de cliente logueado (null si no lo es, si su rol no está vigente o si el acceso de clientes
-- está apagado). Es la ÚNICA puerta por la que un cliente ve algo.
create or replace function wms.propietario_cliente()
returns uuid language sql stable security definer set search_path = wms, pg_temp as $$
  select r.propietario_id
    from wms.usuario_roles r
   where r.user_id = auth.uid()
     and r.rol = 'usuario_cliente'
     and r.desde <= current_date
     and (r.hasta is null or r.hasta >= current_date)
     and coalesce((select p.valor from wms.parametros p where p.clave = 'acceso_clientes_habilitado'), 'false') = 'true'
   limit 1
$$;

-- Una cuenta de cliente nunca es personal, y solo se crea cuando el acceso de clientes está habilitado.
create or replace function wms.trg_guardia_usuario_roles()
returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if new.rol = 'usuario_cliente' then
    if coalesce((select p.valor from wms.parametros p where p.clave = 'acceso_clientes_habilitado'), 'false') <> 'true' then
      raise exception 'El acceso de clientes no está habilitado (D-68): primero debe estar SEC1 en producción' using errcode = 'P0001';
    end if;
    if not exists (select 1 from wms.propietarios o where o.id = new.propietario_id and o.activo and not o.es_dueno_almacen) then
      raise exception 'Un usuario de cliente pertenece a un cliente de almacenamiento activo (no al dueño del almacén)' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.usuario_roles r
                where r.user_id = new.user_id and r.rol <> 'usuario_cliente' and r.id <> new.id
                  and (r.hasta is null or r.hasta >= current_date)) then
      raise exception 'Una cuenta de cliente no puede tener roles del personal' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.usuario_roles r
                where r.user_id = new.user_id and r.rol = 'usuario_cliente' and r.id <> new.id
                  and r.propietario_id <> new.propietario_id and (r.hasta is null or r.hasta >= current_date)) then
      raise exception 'Una cuenta de cliente pertenece a un solo propietario' using errcode = 'P0001';
    end if;
  elsif exists (select 1 from wms.usuario_roles r
                 where r.user_id = new.user_id and r.rol = 'usuario_cliente' and r.id <> new.id
                   and (r.hasta is null or r.hasta >= current_date)) then
    raise exception 'Esta cuenta es de un cliente: no puede recibir roles del personal' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'guardia_usuario_roles' and tgrelid = 'wms.usuario_roles'::regclass and not tgisinternal) then
    drop trigger guardia_usuario_roles on wms.usuario_roles;
  end if;
end $$;
create trigger guardia_usuario_roles before insert or update on wms.usuario_roles
  for each row execute function wms.trg_guardia_usuario_roles();

-- Lo único que el cliente lee: su propietario, sus lotes y sus saldos (B3 agrega vistas propias para el resto).
do $$ declare t text; col text; begin
  foreach t in array array['propietarios', 'lotes', 'saldos'] loop
    col := case when t = 'propietarios' then 'id' else 'propietario_id' end;
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura_cliente') then
      execute format('drop policy lectura_cliente on wms.%I', t);
    end if;
    execute format('create policy lectura_cliente on wms.%I for select to authenticated using (%I = wms.propietario_cliente())', t, col);
  end loop;
end $$;

grant execute on function wms.es_usuario(), wms.propietario_cliente() to authenticated;

-- Reconciliación del ledger (0002): ahora solo para el personal. Un cliente ve sus saldos pero no el ledger, y la
-- comparación le habría mostrado «diferencias» falsas con ubicaciones y celdas de su propio stock.
create or replace function wms.verificar_saldos()
returns table (posicion_id uuid, producto_id uuid, lote_id uuid, propietario_id uuid, estado text,
               procedencia_id uuid, en_ledger bigint, en_saldos integer)
language sql stable set search_path = wms, pg_temp as $$
  select coalesce(l.posicion_id, s.posicion_id), coalesce(l.producto_id, s.producto_id),
         coalesce(l.lote_id, s.lote_id), coalesce(l.propietario_id, s.propietario_id),
         coalesce(l.estado, s.estado), coalesce(l.procedencia_id, s.procedencia_id),
         coalesce(l.suma, 0), coalesce(s.cantidad, 0)
    from (select p.posicion_id, p.producto_id, p.lote_id, p.propietario_id, p.estado, p.procedencia_id,
                 sum(p.delta) as suma
            from wms.partidas p group by 1, 2, 3, 4, 5, 6) l
    full join wms.saldos s using (posicion_id, producto_id, lote_id, propietario_id, estado, procedencia_id)
   where wms.es_usuario() and coalesce(l.suma, 0) <> coalesce(s.cantidad, 0)
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tipos de movimiento: SALIDA y RETORNO (deshabilitados hasta S2)
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.tipos_movimiento (codigo, nombre, habilitado) values
  ('SALIDA', 'Salida', false),
  ('RETORNO', 'Retorno de pedido no entregado', false)
on conflict (codigo) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Áreas de salida
-- ─────────────────────────────────────────────────────────────────────────────

update wms.tipos_area set en_alcance = true where codigo in ('EMBALAJE', 'DESPACHO');
insert into wms.area_estado_admitido (tipo_area, estado, origen_requerido) values
  ('EMBALAJE', 'APROBADO', null),
  ('DESPACHO', 'APROBADO', null)
on conflict (tipo_area, estado) do nothing;

-- Zonas nuevas, configurables y APAGADAS (D-52: Katia y Charlie definen ubicación física y tipo BPA). Sin
-- `area_estado_admitido` y sin posiciones, la base rechaza cualquier unidad que intente entrar.
insert into wms.tipos_area (codigo, nombre, es_compartida, es_transito, en_alcance) values
  ('PENDIENTE_CONFORMIDAD', 'Pendiente de conformidad', true, true, false),
  ('OBSERVADO', 'Observado / pendiente de corrección', true, true, false),
  ('RETORNO_RESERVADO', 'Retorno no entregado / reservado', true, false, false)
on conflict (codigo) do nothing;

-- Un movimiento interno manual (Mover) no entra ni sale de las zonas de salida: las alimenta solo el flujo de salidas (S2+).
create or replace function wms.trg_mover_no_toca_zonas_de_salida()
returns trigger language plpgsql set search_path = wms, pg_temp as $$
begin
  if exists (select 1 from wms.posiciones p
              where p.id in (new.desde_posicion_id, new.hasta_posicion_id)
                and p.tipo_area in ('EMBALAJE', 'DESPACHO', 'PENDIENTE_CONFORMIDAD', 'OBSERVADO', 'RETORNO_RESERVADO')) then
    raise exception 'Embalaje, Despacho y las zonas de salida se usan solo en las salidas: no se mueven a mano' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'mover_no_toca_zonas_de_salida' and tgrelid = 'wms.ordenes_movimiento_lineas'::regclass and not tgisinternal) then
    drop trigger mover_no_toca_zonas_de_salida on wms.ordenes_movimiento_lineas;
  end if;
end $$;
create trigger mover_no_toca_zonas_de_salida before insert on wms.ordenes_movimiento_lineas
  for each row execute function wms.trg_mover_no_toca_zonas_de_salida();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Orden de recorrido del picking (D-65)
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.posiciones add column if not exists orden_recorrido int;

-- Por defecto: rack y luego columna (todos los niveles de una columna comparten el mismo orden: el picker camina a la
-- columna y toma de todos los niveles). Charlie confirma el recorrido real y lo ajusta por posición.
create or replace function wms.orden_recorrido_por_defecto(p_rack text, p_posicion int)
returns int language sql immutable as $$
  select (ascii(upper(left(coalesce(nullif(p_rack, ''), 'A'), 1))) - 64) * 1000 + coalesce(p_posicion, 0) * 10
$$;

create or replace function wms.trg_orden_recorrido()
returns trigger language plpgsql as $$
begin
  if new.orden_recorrido is null then
    new.orden_recorrido := wms.orden_recorrido_por_defecto(new.rack, new.posicion);
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'orden_recorrido' and tgrelid = 'wms.posiciones'::regclass and not tgisinternal) then
    drop trigger orden_recorrido on wms.posiciones;
  end if;
end $$;
create trigger orden_recorrido before insert on wms.posiciones
  for each row execute function wms.trg_orden_recorrido();

update wms.posiciones set orden_recorrido = wms.orden_recorrido_por_defecto(rack, posicion) where orden_recorrido is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Alertas para el Jefe de Transporte y vehículos
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'alertas_destinatario_rol_check' and conrelid = 'wms.alertas'::regclass) then
    alter table wms.alertas drop constraint alertas_destinatario_rol_check;
  end if;
  alter table wms.alertas add constraint alertas_destinatario_rol_check
    check (destinatario_rol in ('direccion_tecnica', 'jefe_almacen', 'asistente_dt', 'jefe_transporte'));
end $$;

-- Vehículos (mínimo para S4: placa, capacidad y compatibilidad). Qué vehículo está «calificado» sigue abierto (D-58).
create table if not exists wms.vehiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  descripcion text,
  tipo text not null default 'PROPIO' check (tipo in ('PROPIO', 'EXTERNO')),
  capacidad_kg numeric(10, 2) check (capacidad_kg is null or capacidad_kg >= 0),
  capacidad_bultos int check (capacidad_bultos is null or capacidad_bultos >= 0),
  apto_cadena_frio boolean not null default false,
  calificado boolean not null default false,
  activo boolean not null default true,
  nota text,
  creado_en timestamptz not null default now()
);
alter table wms.vehiculos enable row level security;
create unique index if not exists vehiculos_placa_uk on wms.vehiculos (upper(placa));

do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'vehiculos' and policyname = 'lectura') then
    drop policy lectura on wms.vehiculos;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'vehiculos' and policyname = 'escritura') then
    drop policy escritura on wms.vehiculos;
  end if;
end $$;
create policy lectura on wms.vehiculos for select to authenticated using (wms.es_usuario());
create policy escritura on wms.vehiculos for all to authenticated
  using (wms.tiene_rol('admin_wms', 'jefe_transporte')) with check (wms.tiene_rol('admin_wms', 'jefe_transporte'));
grant select on wms.vehiculos to authenticated;
grant insert, update, delete on wms.vehiculos to authenticated;

do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'audit_respaldo' and tgrelid = 'wms.vehiculos'::regclass and not tgisinternal) then
    drop trigger audit_respaldo on wms.vehiculos;
  end if;
end $$;
create trigger audit_respaldo after insert or update or delete on wms.vehiculos
  for each row execute function wms.trg_audit();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Funciones: lista cerrada (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

-- Dos ayudantes los llaman triggers que corren con el rol de quien escribe: se conceden explícitamente (no filtran nada:
-- uno calcula un número; el otro solo revisa un movimiento ya visible para quien lo llama).
grant execute on function wms.orden_recorrido_por_defecto(text, int), wms.validar_movimiento(uuid) to authenticated;
revoke execute on all functions in schema wms from public;
