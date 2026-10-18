-- 0026 · WMS · Orden de Salida · OS-6: Bajas con sustento por motivo y la Orden de Baja LS-FR.56.01 (integrada en BJ1)
--
-- Respuestas de Dirección Técnica del 2026-10-17 (docs/wms/respuestas-dt-2026-10.md, §7 y §8):
--   1. Dar de baja stock (Aprobado, en Cuarentena, en Devoluciones o en Reserva; vencido o no) es un PROCESO con documento: se SOLICITA una Orden de Baja y la autoriza
--      Dirección Técnica (Katia). Sin sustento no hay baja. El sustento depende del motivo (aprobado por Katia):
--        · VENCIDO               → la fecha de vencimiento: el sistema la propone desde el lote y Dirección Técnica la confirma;
--        · DETERIORO_DANO        → una evaluación tipo acta organoléptica (mismo checklist del LS-FR.55.02) que concluye NO CONFORME;
--        · ALERTA_DIGEMID        → la alerta o el retiro de DIGEMID, adjunto (PDF o imagen);
--        · OBSERVACION_PROVEEDOR → la comunicación del proveedor o fabricante, adjunta.
--   2. Al autorizar, el stock pasa a Bajas/Rechazados con UN movimiento de CAMBIO_ESTADO (solo Dirección Técnica, con la Orden de Baja como sustento): ocurre en el
--      mismo lugar y queda «por trasladar». El traslado físico a la ubicación de Bajas lo registra quien tiene el permiso de ejecutar movimientos, por el flujo normal
--      de Movimientos (`ejecutar_movimiento`: otra persona lo verifica). Nada se borra.
--   3. La Orden de Baja LS-FR.56.01 la genera el WMS como PDF con un número correlativo BJ-AAAA-NNNNN. Una Orden emitida es inmutable: solo se anula con motivo y se
--      reemite vinculada (como las actas). OJO: un cambio de estado NO se revierte (regla cerrada del ledger), así que anular una Orden anula el DOCUMENTO; el stock
--      sigue en Bajas. Si el stock se dio de baja por error, se corrige con un ajuste (D-98).
--   4. Destrucción: lo vencido de clientes de almacenamiento solo va a Bajas y sale a destrucción cuando el cliente lo indica (OS-2). Esta migración deja la vista
--      `wms.v_stock_en_bajas` (stock en Bajas por propietario, lote y ubicación) como contrato para esa salida.
--   5. Vencidos y salidas sin venta (§7, sección 9 de este archivo): lo vencido no sale por ninguna salida (`_lote_apto`); devolución a proveedor = salida de tipo
--      PROVEEDOR, solo antes del vencimiento y según la política de canje (dos parámetros, PENDIENTE de Katia); motivos de la salida tipo B: venta, pesquisa
--      DIGEMID (nunca de vencidos), muestra y destrucción (solo desde Bajas). Redefine `_lote_apto`, `crear_salida` y `aprobar_salida_vencida`; no toca picking.
-- Re-ejecutable. Se aplica a mano, después de la 0022. Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Permisos, alertas y parámetros (se AGREGAN valores: otras migraciones agregan los suyos en paralelo)
-- ─────────────────────────────────────────────────────────────────────────────

select wms._ampliar_check_in('wms.permisos_rol', 'permisos_rol_accion_check', 'accion', array['solicitar_baja', 'autorizar_baja']);
select wms._ampliar_check_in('wms.alertas', 'alertas_tipo_check', 'tipo', array['BAJA_POR_AUTORIZAR', 'BAJA_POR_TRASLADAR']);

-- Quién solicita una baja: Dirección Técnica, su asistente y el Jefe de Almacén (una fila de `permisos_rol` lo cambia; pendiente de confirmar con Katia).
-- Quién autoriza: solo Dirección Técnica (el ledger ya lo exige para un cambio de estado).
insert into wms.permisos_rol (rol, accion) values
  ('direccion_tecnica', 'solicitar_baja'), ('asistente_dt', 'solicitar_baja'), ('jefe_almacen', 'solicitar_baja'),
  ('direccion_tecnica', 'autorizar_baja')
on conflict (rol, accion) do nothing;

insert into wms.parametros (clave, valor, nota) values
  ('baja_codigo_formato', 'LS-FR.56.01',
   'Código del formato de la Orden de Baja. OJO: el .docx de referencia dice «Cod. Formato LS-POE.56.01» en su encabezado y «LS-FR.56.01» en su nombre de archivo; se usa LS-FR.56.01 hasta que Katia confirme.'),
  ('baja_codigo_poe', 'LS-POE.11.01', 'Código del procedimiento (POE) que respalda la Orden de Baja, tal como figura en el encabezado del formato.'),
  ('baja_vigencia_formato', 'Desde 01.09.2026 hasta 01.09.2028', 'Vigencia del formato LS-FR.56.01 (encabezado del documento).'),
  ('baja_solicitante_nombre', 'Katia Zapata', 'Nombre que lleva «Información del solicitante» en la Orden de Baja (DT: el solicitante es Katia). Katia confirma el nombre completo.'),
  ('baja_solicitante_cargo', 'Dirección Técnica', 'Cargo que lleva «Información del solicitante». PENDIENTE: Katia confirma el cargo exacto tal como debe imprimirse.'),
  ('baja_motivo_traslado', 'Traslado al área de baja', 'Texto del pie del formato: «*Motivo de traslado al área de baja».')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Orden de Baja (cabecera), líneas, sustentos y evaluaciones
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.ordenes_baja (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  estado text not null default 'SOLICITADA' check (estado in ('SOLICITADA', 'EMITIDA', 'RECHAZADA', 'CANCELADA', 'ANULADA')),
  propietario_id uuid not null references wms.propietarios(id),
  nota text,
  solicitada_por uuid not null,
  solicitada_en timestamptz not null default now(),
  -- rechazo o retiro de la solicitud
  cerrada_por uuid,
  cerrada_en timestamptz,
  motivo_cierre text,
  -- emisión (lo que autoriza Dirección Técnica)
  emitida_por uuid,
  emitida_en timestamptz,
  fecha_documento date,
  movimiento_estado_id uuid references wms.movimientos(id),
  posicion_destino_id uuid references wms.posiciones(id),
  orden_movimiento_id uuid references wms.ordenes_movimiento(id),         -- el traslado físico a Bajas (Movimientos)
  contenido jsonb,
  hash_contenido text,
  -- anulación y reemisión (como las actas)
  anulada_por uuid,
  anulada_en timestamptz,
  motivo_anulacion text,
  reemite_de uuid references wms.ordenes_baja(id),
  check ((estado = 'EMITIDA') = (emitida_en is not null and contenido is not null and movimiento_estado_id is not null) or estado = 'ANULADA'),
  check (estado not in ('RECHAZADA', 'CANCELADA') or nullif(btrim(coalesce(motivo_cierre, '')), '') is not null),
  check (estado <> 'ANULADA' or nullif(btrim(coalesce(motivo_anulacion, '')), '') is not null)
);
alter table wms.ordenes_baja enable row level security;
create unique index if not exists ordenes_baja_reemision_uk on wms.ordenes_baja (reemite_de) where reemite_de is not null;     -- una anulada se reemite una sola vez
create index if not exists ordenes_baja_estado_idx on wms.ordenes_baja (estado, solicitada_en);

create table if not exists wms.ordenes_baja_lineas (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references wms.ordenes_baja(id),
  n integer not null check (n > 0),
  producto_id uuid not null,
  lote_id uuid not null references wms.lotes(id),
  posicion_id uuid not null references wms.posiciones(id),
  estado_origen text not null check (estado_origen in ('CUARENTENA', 'DEVOLUCIONES', 'APROBADO')),
  cantidad integer not null check (cantidad > 0),
  motivo text not null check (motivo in ('VENCIDO', 'DETERIORO_DANO', 'ALERTA_DIGEMID', 'OBSERVACION_PROVEEDOR')),
  detalle text,
  -- VENCIDO: el sistema propone la fecha del lote; Dirección Técnica la confirma.
  vence_propuesta date,
  vence_confirmada date,
  vence_confirmada_por uuid,
  vence_confirmada_en timestamptz,
  -- Al emitir: de qué entregas salió cada unidad ([{procedencia_id, cantidad, origen}]), para el traslado físico.
  reparto jsonb,
  unique (orden_id, n),
  check ((vence_confirmada is null) = (vence_confirmada_por is null))
);
alter table wms.ordenes_baja_lineas enable row level security;
create unique index if not exists ordenes_baja_lineas_celda_uk on wms.ordenes_baja_lineas (orden_id, lote_id, posicion_id, estado_origen);
create index if not exists ordenes_baja_lineas_lote_idx on wms.ordenes_baja_lineas (lote_id);

-- La alerta o la comunicación adjunta (PDF o imagen). Solo se agregan filas.
create table if not exists wms.ordenes_baja_sustentos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references wms.ordenes_baja(id),
  linea_id uuid not null references wms.ordenes_baja_lineas(id),
  tipo text not null check (tipo in ('ALERTA_DIGEMID', 'COMUNICACION_PROVEEDOR')),
  nombre_archivo text not null check (nullif(btrim(nombre_archivo), '') is not null),
  archivo_ref text not null check (nullif(btrim(archivo_ref), '') is not null),
  hash text,
  bytes integer check (bytes is null or bytes > 0),
  referencia text,                                                   -- N.° de alerta, de carta, de correo…
  agregado_por uuid not null,
  agregado_en timestamptz not null default now()
);
alter table wms.ordenes_baja_sustentos enable row level security;
create index if not exists ordenes_baja_sustentos_linea_idx on wms.ordenes_baja_sustentos (linea_id);

-- La evaluación tipo acta organoléptica del deterioro o daño (mismo checklist del LS-FR.55.02). Una fila por versión: la última vale.
create table if not exists wms.ordenes_baja_evaluaciones (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references wms.ordenes_baja(id),
  linea_id uuid not null references wms.ordenes_baja_lineas(id),
  version integer not null check (version > 0),
  checklist jsonb not null,
  cert_analisis boolean,
  observacion text not null check (nullif(btrim(observacion), '') is not null),
  conclusion text not null check (conclusion in ('CONFORME', 'NO_CONFORME')),
  evaluada_por uuid not null,
  evaluada_en timestamptz not null default now(),
  unique (linea_id, version)
);
alter table wms.ordenes_baja_evaluaciones enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ordenes_baja', 'ordenes_baja_lineas', 'ordenes_baja_sustentos', 'ordenes_baja_evaluaciones'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then
      execute format('drop policy lectura on wms.%I', t);
    end if;
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
    execute format('revoke all on wms.%I from anon, authenticated', t);
    execute format('grant select on wms.%I to authenticated', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Inmutabilidad (defensa en la base: las funciones ya lo respetan)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._orden_baja_guardia() returns trigger language plpgsql set search_path = wms, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'Una Orden de Baja no se borra: si hubo un error se anula con motivo y se reemite' using errcode = 'P0001'; end if;
  if new.id <> old.id or new.numero <> old.numero or new.propietario_id <> old.propietario_id or new.solicitada_por <> old.solicitada_por
     or new.solicitada_en <> old.solicitada_en or new.reemite_de is distinct from old.reemite_de then
    raise exception 'Esos datos de la Orden de Baja no se editan' using errcode = 'P0001';
  end if;
  if old.estado in ('RECHAZADA', 'CANCELADA', 'ANULADA') then
    raise exception 'La Orden de Baja % ya está cerrada (%): su historia no cambia', old.numero, old.estado using errcode = 'P0001';
  end if;
  if old.estado = 'EMITIDA' then
    if new.estado not in ('EMITIDA', 'ANULADA') then raise exception 'Una Orden de Baja emitida solo se anula, con motivo' using errcode = 'P0001'; end if;
    if new.contenido is distinct from old.contenido or new.hash_contenido is distinct from old.hash_contenido or new.fecha_documento is distinct from old.fecha_documento
       or new.emitida_por is distinct from old.emitida_por or new.emitida_en is distinct from old.emitida_en
       or new.movimiento_estado_id is distinct from old.movimiento_estado_id then
      raise exception 'Una Orden de Baja emitida es inmutable: solo se anula con motivo y se reemite' using errcode = 'P0001';
    end if;
  elsif old.estado = 'SOLICITADA' and new.estado = 'ANULADA' then
    raise exception 'Una solicitud no se anula: se rechaza o se retira' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function wms._orden_baja_hijos_guardia() returns trigger language plpgsql set search_path = wms, pg_temp as $$
declare v_estado text; v_orden uuid;
begin
  if tg_op = 'DELETE' then raise exception 'Nada de una Orden de Baja se borra' using errcode = 'P0001'; end if;
  v_orden := new.orden_id;
  select estado into v_estado from wms.ordenes_baja where id = v_orden;
  if tg_op = 'INSERT' then
    if v_estado is distinct from 'SOLICITADA' then raise exception 'La Orden de Baja ya no admite cambios en sus líneas ni en su sustento' using errcode = 'P0001'; end if;
    return new;
  end if;
  -- UPDATE: solo la confirmación del vencimiento y el reparto al emitir, y solo mientras es solicitud.
  if tg_table_name <> 'ordenes_baja_lineas' then raise exception 'El sustento de una Orden de Baja no se edita: se agrega otro' using errcode = 'P0001'; end if;
  if v_estado is distinct from 'SOLICITADA' then raise exception 'La Orden de Baja ya no admite cambios en sus líneas' using errcode = 'P0001'; end if;
  if new.id <> old.id or new.orden_id <> old.orden_id or new.n <> old.n or new.producto_id <> old.producto_id or new.lote_id <> old.lote_id
     or new.posicion_id <> old.posicion_id or new.estado_origen <> old.estado_origen or new.cantidad <> old.cantidad or new.motivo <> old.motivo
     or new.detalle is distinct from old.detalle or new.vence_propuesta is distinct from old.vence_propuesta then
    raise exception 'Una línea de la Orden de Baja no se edita: se retira la solicitud y se hace otra' using errcode = 'P0001';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  if exists (select 1 from pg_trigger where tgname = 'orden_baja_guardia' and tgrelid = 'wms.ordenes_baja'::regclass and not tgisinternal) then
    drop trigger orden_baja_guardia on wms.ordenes_baja;
  end if;
  foreach t in array array['ordenes_baja_lineas', 'ordenes_baja_sustentos', 'ordenes_baja_evaluaciones'] loop
    if exists (select 1 from pg_trigger where tgname = 'orden_baja_hijos_guardia' and tgrelid = ('wms.' || t)::regclass and not tgisinternal) then
      execute format('drop trigger orden_baja_hijos_guardia on wms.%I', t);
    end if;
    execute format('create trigger orden_baja_hijos_guardia before insert or update or delete on wms.%I for each row execute function wms._orden_baja_hijos_guardia()', t);
  end loop;
end $$;
create trigger orden_baja_guardia before update or delete on wms.ordenes_baja for each row execute function wms._orden_baja_guardia();

-- Aprobado → Bajas/Rechazados SOLO con una Orden de Baja emitida que lo sustente (regla en el ledger, no solo en la pantalla).
-- Cuarentena y Devoluciones → Bajas siguen por su acta organoléptica o por una Orden de Baja.
create or replace function wms._baja_aprobada_exige_orden() returns trigger language plpgsql set search_path = wms, pg_temp as $$
declare m wms.movimientos;
begin
  if new.estado <> 'BAJAS_RECHAZADOS' or new.delta <= 0 then return null; end if;
  select * into m from wms.movimientos where id = new.movimiento_id;
  if m.tipo <> 'CAMBIO_ESTADO' then return null; end if;
  if not exists (select 1 from wms.partidas p where p.movimiento_id = new.movimiento_id and p.posicion_id = new.posicion_id and p.lote_id = new.lote_id
                    and p.procedencia_id = new.procedencia_id and p.estado = 'APROBADO' and p.delta < 0) then return null; end if;
  if m.sustento_tipo is distinct from 'ORDEN_BAJA'
     or not exists (select 1 from wms.ordenes_baja o where o.id::text = m.sustento_id and o.movimiento_estado_id = m.id and o.estado in ('EMITIDA', 'ANULADA')) then
    raise exception 'Dar de baja stock Aprobado necesita su Orden de Baja con el sustento del motivo' using errcode = 'P0001';
  end if;
  return null;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'baja_aprobada_exige_orden' and tgrelid = 'wms.partidas'::regclass and not tgisinternal) then
    drop trigger baja_aprobada_exige_orden on wms.partidas;
  end if;
end $$;
create constraint trigger baja_aprobada_exige_orden after insert on wms.partidas deferrable initially deferred
  for each row execute function wms._baja_aprobada_exige_orden();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Ayudantes internos (no se conceden a nadie)
-- ─────────────────────────────────────────────────────────────────────────────

-- Lo que se puede pedir de baja en una celda (ubicación + lote + estado): el saldo, menos lo comprometido en pedidos y en movimientos abiertos,
-- menos lo ya pedido en otras solicitudes abiertas.
create or replace function wms._baja_disponible(p_posicion uuid, p_lote uuid, p_estado text, p_excluir uuid default null) returns integer
language sql stable security definer set search_path = wms, pg_temp as $$
  select greatest(
    coalesce((select sum(s.cantidad - wms._comprometido(s.posicion_id, s.lote_id, s.estado, s.procedencia_id))
                from wms.saldos s where s.posicion_id = p_posicion and s.lote_id = p_lote and s.estado = p_estado and s.cantidad > 0), 0)
    - coalesce((select sum(l.cantidad) from wms.ordenes_baja_lineas l join wms.ordenes_baja o on o.id = l.orden_id
                 where o.estado = 'SOLICITADA' and l.posicion_id = p_posicion and l.lote_id = p_lote and l.estado_origen = p_estado
                   and o.id is distinct from p_excluir), 0), 0)::integer
$$;

create or replace function wms._baja_texto_motivo(p_motivo text) returns text
language sql immutable set search_path = wms, pg_temp as $$
  select case p_motivo when 'VENCIDO' then 'Vencido' when 'DETERIORO_DANO' then 'Deterioro o daño'
                       when 'ALERTA_DIGEMID' then 'Alerta o retiro de DIGEMID' when 'OBSERVACION_PROVEEDOR' then 'Observación del proveedor o fabricante' else p_motivo end
$$;

-- ¿Qué falta del sustento de esta línea? Nulo si está completo. Los mensajes son los que ve la persona.
create or replace function wms._baja_sustento_faltante(l wms.ordenes_baja_lineas) returns text
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare lt wms.lotes; e wms.ordenes_baja_evaluaciones; v_pref text;
begin
  select * into lt from wms.lotes where id = l.lote_id;
  v_pref := format('Línea %s (lote %s): ', l.n, lt.codigo);
  if l.motivo = 'VENCIDO' then
    if lt.vence is null or lt.vence >= wms._hoy_lima() then return v_pref || 'el lote no está vencido'; end if;
    if l.vence_confirmada is null then return v_pref || 'Dirección Técnica debe confirmar la fecha de vencimiento'; end if;
    if l.vence_confirmada <> lt.vence then return v_pref || 'el vencimiento del lote cambió: Dirección Técnica debe confirmarlo otra vez'; end if;
  elsif l.motivo = 'DETERIORO_DANO' then
    select * into e from wms.ordenes_baja_evaluaciones where linea_id = l.id order by version desc limit 1;
    if not found then return v_pref || 'falta la evaluación del deterioro o daño'; end if;
    if e.conclusion <> 'NO_CONFORME' then return v_pref || 'la evaluación concluye CONFORME: no sustenta una baja'; end if;
    if not exists (select 1 from jsonb_each_text(e.checklist) c where c.value = 'NC') then return v_pref || 'la evaluación no marca ningún punto no conforme'; end if;
  elsif l.motivo = 'ALERTA_DIGEMID' then
    if not exists (select 1 from wms.ordenes_baja_sustentos s where s.linea_id = l.id and s.tipo = 'ALERTA_DIGEMID') then return v_pref || 'falta adjuntar la alerta o el retiro de DIGEMID'; end if;
  elsif l.motivo = 'OBSERVACION_PROVEEDOR' then
    if not exists (select 1 from wms.ordenes_baja_sustentos s where s.linea_id = l.id and s.tipo = 'COMUNICACION_PROVEEDOR') then return v_pref || 'falta adjuntar la comunicación del proveedor o fabricante'; end if;
  end if;
  return null;
end $$;

-- La ubicación de Bajas donde se traslada: la indicada (de Bajas y que acepte al propietario) o, si no, una de Bajas del propietario (primero donde ya tiene stock).
create or replace function wms._posicion_bajas(p_propietario uuid, p_indicada uuid) returns uuid
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_id uuid;
begin
  if p_indicada is not null then
    select id into v_id from wms.posiciones where id = p_indicada and tipo_area = 'BAJAS_RECHAZADOS' and activa;
    if v_id is null then raise exception 'Esa ubicación no es del área de Bajas' using errcode = 'P0001'; end if;
    if not wms.posicion_acepta(v_id, p_propietario, current_date) then raise exception 'Esa ubicación de Bajas no es de este propietario' using errcode = 'P0001'; end if;
    return v_id;
  end if;
  select p.id into v_id from wms.posiciones p
   where p.tipo_area = 'BAJAS_RECHAZADOS' and p.activa and wms.posicion_acepta(p.id, p_propietario, current_date)
   order by exists (select 1 from wms.saldos s where s.posicion_id = p.id and s.propietario_id = p_propietario and s.cantidad > 0) desc, p.codigo
   limit 1;
  if v_id is null then
    raise exception 'Este propietario todavía no tiene una ubicación en el área de Bajas: Dirección Técnica y el Jefe de Almacén deben definirla' using errcode = 'P0001';
  end if;
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Solicitar la baja
-- ─────────────────────────────────────────────────────────────────────────────

-- p_lineas = [{lote_id, posicion_id, estado, cantidad, motivo, detalle}]. Una solicitud es de UN propietario (el ledger y las ubicaciones de Bajas son por propietario).
create or replace function wms.solicitar_baja(p_propietario uuid, p_lineas jsonb, p_nota text default null) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v_id uuid := gen_random_uuid(); v_anio text := to_char(wms._hoy_lima(), 'YYYY'); v_num text;
  x jsonb; v_n integer := 0; lt wms.lotes; ps wms.posiciones; v_estado text; v_cant integer; v_motivo text;
  v_disp integer; v_comp integer; v_total integer := 0; v_prod text;
begin
  perform wms._exigir_accion('solicitar_baja', 'No tienes permiso para solicitar una baja');
  if not exists (select 1 from wms.propietarios where id = p_propietario and activo) then raise exception 'Elige el propietario del stock' using errcode = 'P0001'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception 'Agrega al menos una línea a la baja' using errcode = 'P0001'; end if;

  v_num := 'BJ-' || v_anio || '-' || lpad(wms.siguiente_correlativo('BJ-' || v_anio)::text, 5, '0');
  insert into wms.ordenes_baja (id, numero, propietario_id, nota, solicitada_por) values (v_id, v_num, p_propietario, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid());

  for x in select value from jsonb_array_elements(p_lineas) loop
    v_n := v_n + 1;
    select * into lt from wms.lotes where id = (x->>'lote_id')::uuid;
    if not found then raise exception 'Línea %: no encontramos ese lote', v_n using errcode = 'P0001'; end if;
    if lt.propietario_id <> p_propietario then raise exception 'Línea %: el lote % es de otro propietario; una baja es de un solo propietario', v_n, lt.codigo using errcode = 'P0001'; end if;
    select * into ps from wms.posiciones where id = (x->>'posicion_id')::uuid;
    if not found then raise exception 'Línea % (lote %): no encontramos esa ubicación', v_n, lt.codigo using errcode = 'P0001'; end if;
    v_estado := x->>'estado'; v_cant := nullif(x->>'cantidad', '')::integer; v_motivo := x->>'motivo';
    if v_estado = 'BAJAS_RECHAZADOS' or ps.tipo_area = 'BAJAS_RECHAZADOS' then
      raise exception 'Línea % (lote %): eso ya está en Bajas; lo que está en Bajas no se vuelve a dar de baja', v_n, lt.codigo using errcode = 'P0001';
    end if;
    if v_estado is null or v_estado not in ('CUARENTENA', 'DEVOLUCIONES', 'APROBADO') then raise exception 'Línea % (lote %): elige el estado del stock', v_n, lt.codigo using errcode = 'P0001'; end if;
    if ps.tipo_area = 'DESPACHO' then raise exception 'Línea % (lote %): esas unidades están en Despacho dentro de una salida; se resuelven en la salida', v_n, lt.codigo using errcode = 'P0001'; end if;
    if v_cant is null or v_cant <= 0 then raise exception 'Línea % (lote %): la cantidad debe ser mayor que cero', v_n, lt.codigo using errcode = 'P0001'; end if;
    if v_motivo is null or v_motivo not in ('VENCIDO', 'DETERIORO_DANO', 'ALERTA_DIGEMID', 'OBSERVACION_PROVEEDOR') then
      raise exception 'Línea % (lote %): elige el motivo de la baja', v_n, lt.codigo using errcode = 'P0001';
    end if;
    if v_motivo = 'VENCIDO' and (lt.vence is null or lt.vence >= wms._hoy_lima()) then
      raise exception 'Línea % (lote %): el lote no está vencido (vence el %); elige otro motivo', v_n, lt.codigo, coalesce(to_char(lt.vence, 'DD/MM/YYYY'), 'sin fecha') using errcode = 'P0001';
    end if;
    perform wms._candado_stock(lt.producto_id, lt.propietario_id);
    v_disp := wms._baja_disponible(ps.id, lt.id, v_estado);
    if v_cant > v_disp then
      select coalesce(sum(wms._comprometido(s.posicion_id, s.lote_id, s.estado, s.procedencia_id)), 0)::integer into v_comp
        from wms.saldos s where s.posicion_id = ps.id and s.lote_id = lt.id and s.estado = v_estado;
      raise exception 'Línea % (lote %): no se puede dar de baja más de lo que hay. Disponible en % (%): % unidades%', v_n, lt.codigo, ps.codigo, v_estado, v_disp,
        case when v_comp > 0 then format(' (otras %s están comprometidas en pedidos o movimientos)', v_comp) else '' end using errcode = 'P0002';
    end if;
    if exists (select 1 from wms.ordenes_baja_lineas where orden_id = v_id and lote_id = lt.id and posicion_id = ps.id and estado_origen = v_estado) then
      raise exception 'Línea % (lote %): ese lote ya está en otra línea de esta baja; junta las cantidades', v_n, lt.codigo using errcode = 'P0001';
    end if;
    insert into wms.ordenes_baja_lineas (orden_id, n, producto_id, lote_id, posicion_id, estado_origen, cantidad, motivo, detalle, vence_propuesta)
    values (v_id, v_n, lt.producto_id, lt.id, ps.id, v_estado, v_cant, v_motivo, nullif(btrim(coalesce(x->>'detalle', '')), ''), lt.vence);
    v_total := v_total + v_cant;
  end loop;

  select string_agg(distinct p.descripcion, ', ') into v_prod
    from wms.ordenes_baja_lineas l join catalogo.productos p on p.id = l.producto_id where l.orden_id = v_id;
  perform wms._alertar('BAJA_POR_AUTORIZAR', 'direccion_tecnica', null, null, 'baja:' || v_id,
    format('La baja %s espera tu autorización: %s unidades (%s).', v_num, v_total, left(coalesce(v_prod, ''), 120)));
  perform wms.registrar_audit('baja_solicitada', 'ordenes_baja', v_id::text, null, jsonb_build_object('numero', v_num, 'lineas', p_lineas), p_nota);
  return v_id;
end $$;

-- Lo que se puede pedir de baja de un propietario (la búsqueda de «Nueva baja»): una fila por ubicación, lote y estado con lo disponible de verdad.
create or replace function wms.stock_para_baja(p_propietario uuid, p_consulta text default null, p_limite integer default 40)
returns table (posicion_id uuid, posicion text, lote_id uuid, lote text, vence date, vencido boolean, producto_id uuid, producto_codigo text, producto text, estado text, disponible integer)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_permiso('solicitar_baja') then raise exception 'No tienes permiso para solicitar una baja' using errcode = '42501'; end if;
  return query
  select x.posicion_id, x.posicion, x.lote_id, x.lote, x.vence, x.vencido, x.producto_id, x.producto_codigo, x.producto, x.estado, x.disp
    from (
      select s.posicion_id, ps.codigo as posicion, s.lote_id, lt.codigo as lote, lt.vence,
             (lt.vence is not null and lt.vence < wms._hoy_lima()) as vencido, s.producto_id, p.codigo as producto_codigo, p.descripcion as producto, s.estado,
             wms._baja_disponible(s.posicion_id, s.lote_id, s.estado) as disp
        from (select distinct sa.posicion_id, sa.lote_id, sa.producto_id, sa.estado from wms.saldos sa
               where sa.propietario_id = p_propietario and sa.cantidad > 0 and sa.estado in ('CUARENTENA', 'DEVOLUCIONES', 'APROBADO')) s
        join wms.posiciones ps on ps.id = s.posicion_id and ps.tipo_area not in ('DESPACHO', 'BAJAS_RECHAZADOS')
        join wms.lotes lt on lt.id = s.lote_id
        join catalogo.productos p on p.id = s.producto_id
       where nullif(btrim(coalesce(p_consulta, '')), '') is null
          or p.descripcion ilike '%' || btrim(p_consulta) || '%' or p.codigo ilike '%' || btrim(p_consulta) || '%'
          or lt.codigo ilike '%' || btrim(p_consulta) || '%' or ps.codigo ilike '%' || btrim(p_consulta) || '%'
    ) x
   where x.disp > 0
   order by x.vencido desc, x.producto, x.lote, x.posicion
   limit greatest(coalesce(p_limite, 40), 1);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Sustento por motivo
-- ─────────────────────────────────────────────────────────────────────────────

-- Un vencido: Dirección Técnica confirma la fecha que el sistema propone desde el lote.
create or replace function wms.confirmar_vencimiento_baja(p_linea uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare l wms.ordenes_baja_lineas; o wms.ordenes_baja; lt wms.lotes;
begin
  perform wms._exigir_accion('autorizar_baja', 'Solo Dirección Técnica confirma el vencimiento de una baja');
  select * into l from wms.ordenes_baja_lineas where id = p_linea;
  if not found then raise exception 'No encontramos esa línea' using errcode = 'P0001'; end if;
  select * into o from wms.ordenes_baja where id = l.orden_id for update;
  if o.estado <> 'SOLICITADA' then raise exception 'La baja % ya no está en solicitud', o.numero using errcode = 'P0001'; end if;
  if l.motivo <> 'VENCIDO' then raise exception 'Esta línea no es una baja por vencimiento' using errcode = 'P0001'; end if;
  select * into lt from wms.lotes where id = l.lote_id;
  if lt.vence is null or lt.vence >= wms._hoy_lima() then raise exception 'El lote % no está vencido: no se confirma como vencido', lt.codigo using errcode = 'P0001'; end if;
  update wms.ordenes_baja_lineas set vence_confirmada = lt.vence, vence_confirmada_por = auth.uid(), vence_confirmada_en = now() where id = p_linea;
  perform wms.registrar_audit('baja_vencimiento_confirmado', 'ordenes_baja', o.id::text, null, jsonb_build_object('linea', p_linea, 'lote', lt.codigo, 'vence', lt.vence), null);
end $$;

-- Deterioro o daño: la evaluación tipo acta organoléptica la registran la asistente de Dirección Técnica o Dirección Técnica.
create or replace function wms.registrar_evaluacion_baja(p_linea uuid, p_datos jsonb) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare l wms.ordenes_baja_lineas; o wms.ordenes_baja; v_ver integer; v_id uuid := gen_random_uuid(); v_conc text; v_obs text;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_rol('asistente_dt', 'direccion_tecnica') then raise exception 'Solo la asistente de Dirección Técnica o Dirección Técnica registran la evaluación' using errcode = '42501'; end if;
  select * into l from wms.ordenes_baja_lineas where id = p_linea;
  if not found then raise exception 'No encontramos esa línea' using errcode = 'P0001'; end if;
  select * into o from wms.ordenes_baja where id = l.orden_id for update;
  if o.estado <> 'SOLICITADA' then raise exception 'La baja % ya no está en solicitud', o.numero using errcode = 'P0001'; end if;
  if l.motivo <> 'DETERIORO_DANO' then raise exception 'Esta línea no es una baja por deterioro o daño' using errcode = 'P0001'; end if;
  v_conc := p_datos->>'conclusion'; v_obs := nullif(btrim(coalesce(p_datos->>'observacion', '')), '');
  if v_conc is null or v_conc not in ('CONFORME', 'NO_CONFORME') then raise exception 'Elige la conclusión de la evaluación' using errcode = 'P0001'; end if;
  if v_obs is null then raise exception 'Describe lo que viste en la observación' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_datos->'checklist') <> 'object' or not exists (select 1 from jsonb_each(p_datos->'checklist')) then raise exception 'Completa el checklist de la evaluación' using errcode = 'P0001'; end if;
  select coalesce(max(version), 0) + 1 into v_ver from wms.ordenes_baja_evaluaciones where linea_id = p_linea;
  insert into wms.ordenes_baja_evaluaciones (id, orden_id, linea_id, version, checklist, cert_analisis, observacion, conclusion, evaluada_por)
  values (v_id, o.id, p_linea, v_ver, p_datos->'checklist', nullif(p_datos->>'cert_analisis', '')::boolean, v_obs, v_conc, auth.uid());
  perform wms.registrar_audit('baja_evaluacion_registrada', 'ordenes_baja', o.id::text, null, jsonb_build_object('linea', p_linea, 'version', v_ver, 'conclusion', v_conc), null);
  return v_id;
end $$;

-- Alerta de DIGEMID o comunicación del proveedor: el archivo ya está guardado en Storage; aquí queda su referencia.
create or replace function wms.adjuntar_sustento_baja(p_linea uuid, p_tipo text, p_nombre text, p_ref text, p_hash text, p_bytes integer, p_referencia text default null) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare l wms.ordenes_baja_lineas; o wms.ordenes_baja; v_id uuid := gen_random_uuid();
begin
  perform wms._exigir_accion('solicitar_baja', 'No tienes permiso para adjuntar el sustento de una baja');
  select * into l from wms.ordenes_baja_lineas where id = p_linea;
  if not found then raise exception 'No encontramos esa línea' using errcode = 'P0001'; end if;
  select * into o from wms.ordenes_baja where id = l.orden_id for update;
  if o.estado <> 'SOLICITADA' then raise exception 'La baja % ya no está en solicitud: no se agregan archivos', o.numero using errcode = 'P0001'; end if;
  if (l.motivo = 'ALERTA_DIGEMID' and p_tipo is distinct from 'ALERTA_DIGEMID') or (l.motivo = 'OBSERVACION_PROVEEDOR' and p_tipo is distinct from 'COMUNICACION_PROVEEDOR')
     or l.motivo not in ('ALERTA_DIGEMID', 'OBSERVACION_PROVEEDOR') then
    raise exception 'Ese archivo no corresponde al motivo de la línea (%)', wms._baja_texto_motivo(l.motivo) using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null or nullif(btrim(coalesce(p_ref, '')), '') is null then raise exception 'Falta el archivo' using errcode = 'P0001'; end if;
  insert into wms.ordenes_baja_sustentos (id, orden_id, linea_id, tipo, nombre_archivo, archivo_ref, hash, bytes, referencia, agregado_por)
  values (v_id, o.id, p_linea, p_tipo, btrim(p_nombre), btrim(p_ref), nullif(p_hash, ''), p_bytes, nullif(btrim(coalesce(p_referencia, '')), ''), auth.uid());
  perform wms.registrar_audit('baja_sustento_adjuntado', 'ordenes_baja', o.id::text, null, jsonb_build_object('linea', p_linea, 'tipo', p_tipo, 'archivo', p_nombre), null);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Autorizar (emitir), rechazar o retirar, anular y reemitir
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._contenido_orden_baja(p_orden uuid, p_numero text, p_fecha date, p_reemite_numero text) returns jsonb
language sql stable security definer set search_path = wms, pg_temp as $$
  select jsonb_build_object(
    'formato', (select valor from wms.parametros where clave = 'baja_codigo_formato'),
    'poe', (select valor from wms.parametros where clave = 'baja_codigo_poe'),
    'vigencia', (select valor from wms.parametros where clave = 'baja_vigencia_formato'),
    'numero', p_numero, 'fecha', p_fecha, 'reemite', p_reemite_numero,
    'solicitante', jsonb_build_object('nombre', (select valor from wms.parametros where clave = 'baja_solicitante_nombre'),
                                      'cargo', (select valor from wms.parametros where clave = 'baja_solicitante_cargo')),
    'motivo_traslado', (select valor from wms.parametros where clave = 'baja_motivo_traslado'),
    'propietario', (select jsonb_build_object('codigo', po.codigo, 'razon_social', po.razon_social) from wms.ordenes_baja o join wms.propietarios po on po.id = o.propietario_id where o.id = p_orden),
    'lineas', coalesce((select jsonb_agg(jsonb_build_object(
        'n', l.n, 'producto_codigo', p.codigo, 'producto', p.descripcion, 'presentacion', p.presentacion, 'registro_sanitario', pr.registro_sanitario,
        'lote', lt.codigo, 'vence', lt.vence, 'cantidad', l.cantidad, 'motivo', l.motivo, 'motivo_texto', wms._baja_texto_motivo(l.motivo), 'detalle', l.detalle,
        'estado_origen', l.estado_origen, 'ubicacion', ps.codigo,
        'vence_confirmada', l.vence_confirmada,
        'sustento', case l.motivo
          when 'VENCIDO' then 'Venció el ' || to_char(l.vence_confirmada, 'DD/MM/YYYY') || ' (fecha confirmada por Dirección Técnica)'
          when 'DETERIORO_DANO' then 'Evaluación organoléptica NO CONFORME (versión ' || (select max(e.version) from wms.ordenes_baja_evaluaciones e where e.linea_id = l.id) || ')'
          else (select string_agg(s.nombre_archivo || coalesce(' · ' || s.referencia, ''), '; ' order by s.agregado_en) from wms.ordenes_baja_sustentos s where s.linea_id = l.id) end)
        order by l.n)
      from wms.ordenes_baja_lineas l
      join catalogo.productos p on p.id = l.producto_id
      left join wms.producto_regulatorio pr on pr.producto_id = l.producto_id
      join wms.lotes lt on lt.id = l.lote_id
      join wms.posiciones ps on ps.id = l.posicion_id
     where l.orden_id = p_orden), '[]'::jsonb))
$$;

create or replace function wms.autorizar_baja(p_orden uuid) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  o wms.ordenes_baja; l wms.ordenes_baja_lineas; s record; lt wms.lotes;
  v_falta text; v_partidas jsonb := '[]'::jsonb; v_resta integer; v_tomar integer; v_origen text; v_reparto jsonb; v_mov uuid; v_cont jsonb; v_fecha date := wms._hoy_lima();
  v_total integer := 0;
begin
  perform wms._exigir_accion('autorizar_baja', 'Solo Dirección Técnica autoriza una baja');
  if not wms.tiene_rol('direccion_tecnica') then raise exception 'Solo Dirección Técnica autoriza una baja' using errcode = '42501'; end if;
  select * into o from wms.ordenes_baja where id = p_orden for update;
  if not found then raise exception 'No encontramos esa baja' using errcode = 'P0001'; end if;
  if o.estado <> 'SOLICITADA' then raise exception 'La baja % ya no está en solicitud (%)', o.numero, o.estado using errcode = 'P0001'; end if;

  -- 1) Sin sustento no hay baja: todas las líneas, con su motivo.
  for l in select * from wms.ordenes_baja_lineas where orden_id = p_orden order by n loop
    v_falta := wms._baja_sustento_faltante(l);
    if v_falta is not null then raise exception 'Sin sustento no se da de baja. %', v_falta using errcode = 'P0001'; end if;
  end loop;

  -- 2) Que todavía alcance (con los candados por producto, en orden).
  for l in select * from wms.ordenes_baja_lineas where orden_id = p_orden order by n loop
    select * into lt from wms.lotes where id = l.lote_id;
    perform wms._candado_stock(lt.producto_id, lt.propietario_id);
  end loop;
  for l in select * from wms.ordenes_baja_lineas where orden_id = p_orden order by n loop
    select * into lt from wms.lotes where id = l.lote_id;
    if l.cantidad > wms._baja_disponible(l.posicion_id, l.lote_id, l.estado_origen, p_orden) then
      raise exception 'Línea % (lote %): ya no hay tantas unidades disponibles en esa ubicación; no se da de baja más de lo que hay', l.n, lt.codigo using errcode = 'P0002';
    end if;
    -- 3) El reparto entre las entregas de esa celda y las partidas del cambio de estado.
    v_resta := l.cantidad; v_reparto := '[]'::jsonb;
    for s in select sa.procedencia_id, sa.cantidad - wms._comprometido(sa.posicion_id, sa.lote_id, sa.estado, sa.procedencia_id) as libre
               from wms.saldos sa where sa.posicion_id = l.posicion_id and sa.lote_id = l.lote_id and sa.estado = l.estado_origen and sa.cantidad > 0
              order by sa.procedencia_id loop
      exit when v_resta <= 0;
      v_tomar := least(v_resta, s.libre);
      continue when v_tomar <= 0;
      select origen into v_origen from wms.partidas where procedencia_id = s.procedencia_id and lote_id = l.lote_id order by id limit 1;
      v_partidas := v_partidas
        || jsonb_build_object('posicion_id', l.posicion_id, 'producto_id', l.producto_id, 'lote_id', l.lote_id, 'propietario_id', o.propietario_id, 'estado', l.estado_origen,
                              'origen', v_origen, 'procedencia_id', s.procedencia_id, 'delta', -v_tomar)
        || jsonb_build_object('posicion_id', l.posicion_id, 'producto_id', l.producto_id, 'lote_id', l.lote_id, 'propietario_id', o.propietario_id, 'estado', 'BAJAS_RECHAZADOS',
                              'origen', v_origen, 'procedencia_id', s.procedencia_id, 'delta', v_tomar);
      v_reparto := v_reparto || jsonb_build_object('procedencia_id', s.procedencia_id, 'cantidad', v_tomar, 'origen', v_origen);
      v_resta := v_resta - v_tomar;
    end loop;
    if v_resta > 0 then raise exception 'Línea % (lote %): ya no hay tantas unidades disponibles; no se da de baja más de lo que hay', l.n, lt.codigo using errcode = 'P0002'; end if;
    update wms.ordenes_baja_lineas set reparto = v_reparto where id = l.id;
    v_total := v_total + l.cantidad;
  end loop;

  -- 4) El ledger: UN cambio de estado, solo Dirección Técnica, con la Orden de Baja como sustento.
  v_mov := wms.postear_movimiento('CAMBIO_ESTADO', 'Orden de Baja ' || o.numero, v_partidas, 'orden_baja', o.id::text, 'ORDEN_BAJA', o.id::text, null);
  v_cont := wms._contenido_orden_baja(o.id, o.numero, v_fecha, null);
  update wms.ordenes_baja set estado = 'EMITIDA', emitida_por = auth.uid(), emitida_en = now(), fecha_documento = v_fecha, movimiento_estado_id = v_mov,
         contenido = v_cont, hash_contenido = wms._hash(v_cont) where id = p_orden;

  update wms.alertas set estado = 'ATENDIDA', atendida_por = auth.uid(), atendida_en = now(), nota_atencion = 'Se autorizó la baja ' || o.numero
   where clave = 'baja:' || p_orden and estado = 'ABIERTA';
  -- Lo vencido que ya tiene baja deja de pedir decisión.
  update wms.alertas set estado = 'ATENDIDA', atendida_por = auth.uid(), atendida_en = now(), nota_atencion = 'Se dio de baja con la Orden ' || o.numero
   where tipo = 'LOTE_VENCIDO' and estado = 'ABIERTA'
     and clave in (select 'lote-vencido:' || l2.lote_id from wms.ordenes_baja_lineas l2 where l2.orden_id = p_orden
                    and not exists (select 1 from wms.saldos sa where sa.lote_id = l2.lote_id and sa.cantidad > 0 and sa.estado <> 'BAJAS_RECHAZADOS'));
  perform wms._alertar('BAJA_POR_TRASLADAR', 'jefe_almacen', null, null, 'baja-traslado:' || p_orden,
    format('La baja %s ya está autorizada: lleva las %s unidades al área de Bajas y regístralo en Movimientos.', o.numero, v_total));
  perform wms.registrar_audit('baja_autorizada', 'ordenes_baja', p_orden::text, null, jsonb_build_object('numero', o.numero, 'movimiento_id', v_mov, 'hash', wms._hash(v_cont)), null);
  return v_mov;
end $$;

-- Rechazar (Dirección Técnica) o retirar (quien la pidió, o Dirección Técnica) una solicitud, siempre con motivo.
create or replace function wms.cerrar_solicitud_baja(p_orden uuid, p_decision text, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare o wms.ordenes_baja;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if p_decision not in ('RECHAZADA', 'CANCELADA') then raise exception 'Decisión inválida: %', p_decision using errcode = 'P0001'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Cuéntanos el motivo' using errcode = 'P0001'; end if;
  select * into o from wms.ordenes_baja where id = p_orden for update;
  if not found then raise exception 'No encontramos esa baja' using errcode = 'P0001'; end if;
  if o.estado <> 'SOLICITADA' then raise exception 'La baja % ya no está en solicitud (%)', o.numero, o.estado using errcode = 'P0001'; end if;
  if p_decision = 'RECHAZADA' and not wms.tiene_rol('direccion_tecnica') then raise exception 'Solo Dirección Técnica rechaza una baja' using errcode = '42501'; end if;
  if p_decision = 'CANCELADA' and not (o.solicitada_por = auth.uid() or wms.tiene_rol('direccion_tecnica')) then
    raise exception 'Solo quien pidió la baja, o Dirección Técnica, la retira' using errcode = '42501';
  end if;
  update wms.ordenes_baja set estado = p_decision, cerrada_por = auth.uid(), cerrada_en = now(), motivo_cierre = btrim(p_motivo) where id = p_orden;
  update wms.alertas set estado = 'ATENDIDA', atendida_por = auth.uid(), atendida_en = now(), nota_atencion = case p_decision when 'RECHAZADA' then 'Se rechazó la baja' else 'Se retiró la solicitud' end
   where clave = 'baja:' || p_orden and estado = 'ABIERTA';
  perform wms.registrar_audit(case p_decision when 'RECHAZADA' then 'baja_rechazada' else 'baja_retirada' end, 'ordenes_baja', p_orden::text, null, null, p_motivo);
end $$;

-- Anular una Orden emitida: se anula el DOCUMENTO (con motivo). El cambio de estado del ledger no se revierte (regla cerrada); si el stock no debía estar en Bajas, se corrige con un ajuste.
create or replace function wms.anular_orden_baja(p_orden uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare o wms.ordenes_baja;
begin
  perform wms._exigir_accion('autorizar_baja', 'Solo Dirección Técnica anula una Orden de Baja');
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'La anulación necesita un motivo' using errcode = 'P0001'; end if;
  select * into o from wms.ordenes_baja where id = p_orden for update;
  if not found then raise exception 'No encontramos esa Orden de Baja' using errcode = 'P0001'; end if;
  if o.estado = 'ANULADA' then raise exception 'La Orden % ya está anulada', o.numero using errcode = 'P0001'; end if;
  if o.estado <> 'EMITIDA' then raise exception 'Solo se anula una Orden emitida; una solicitud se rechaza o se retira' using errcode = 'P0001'; end if;
  update wms.ordenes_baja set estado = 'ANULADA', anulada_por = auth.uid(), anulada_en = now(), motivo_anulacion = btrim(p_motivo) where id = p_orden;
  perform wms.registrar_audit('orden_baja_anulada', 'ordenes_baja', p_orden::text, null, jsonb_build_object('numero', o.numero), p_motivo);
end $$;

-- Reemisión: una Orden nueva (otro número) vinculada a la anulada, con las mismas líneas y el mismo sustento. No mueve stock otra vez.
create or replace function wms.reemitir_orden_baja(p_orden_anulada uuid) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare a wms.ordenes_baja; v_id uuid := gen_random_uuid(); v_anio text := to_char(wms._hoy_lima(), 'YYYY'); v_num text; v_fecha date := wms._hoy_lima(); v_cont jsonb; l record; v_nl uuid;
begin
  perform wms._exigir_accion('autorizar_baja', 'Solo Dirección Técnica reemite una Orden de Baja');
  select * into a from wms.ordenes_baja where id = p_orden_anulada for update;
  if not found or a.estado <> 'ANULADA' then raise exception 'Solo se reemite una Orden anulada' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.ordenes_baja where reemite_de = p_orden_anulada) then raise exception 'Esa Orden ya fue reemitida' using errcode = 'P0001'; end if;
  v_num := 'BJ-' || v_anio || '-' || lpad(wms.siguiente_correlativo('BJ-' || v_anio)::text, 5, '0');
  insert into wms.ordenes_baja (id, numero, propietario_id, nota, solicitada_por, reemite_de) values (v_id, v_num, a.propietario_id, a.nota, auth.uid(), p_orden_anulada);
  for l in select * from wms.ordenes_baja_lineas where orden_id = p_orden_anulada order by n loop
    v_nl := gen_random_uuid();
    insert into wms.ordenes_baja_lineas (id, orden_id, n, producto_id, lote_id, posicion_id, estado_origen, cantidad, motivo, detalle, vence_propuesta, vence_confirmada, vence_confirmada_por, vence_confirmada_en, reparto)
    values (v_nl, v_id, l.n, l.producto_id, l.lote_id, l.posicion_id, l.estado_origen, l.cantidad, l.motivo, l.detalle, l.vence_propuesta, l.vence_confirmada, l.vence_confirmada_por, l.vence_confirmada_en, l.reparto);
    insert into wms.ordenes_baja_sustentos (orden_id, linea_id, tipo, nombre_archivo, archivo_ref, hash, bytes, referencia, agregado_por, agregado_en)
      select v_id, v_nl, s.tipo, s.nombre_archivo, s.archivo_ref, s.hash, s.bytes, s.referencia, s.agregado_por, s.agregado_en from wms.ordenes_baja_sustentos s where s.linea_id = l.id;
    insert into wms.ordenes_baja_evaluaciones (orden_id, linea_id, version, checklist, cert_analisis, observacion, conclusion, evaluada_por, evaluada_en)
      select v_id, v_nl, e.version, e.checklist, e.cert_analisis, e.observacion, e.conclusion, e.evaluada_por, e.evaluada_en from wms.ordenes_baja_evaluaciones e where e.linea_id = l.id;
  end loop;
  v_cont := wms._contenido_orden_baja(v_id, v_num, v_fecha, a.numero);
  update wms.ordenes_baja set estado = 'EMITIDA', emitida_por = auth.uid(), emitida_en = now(), fecha_documento = v_fecha, movimiento_estado_id = a.movimiento_estado_id,
         posicion_destino_id = a.posicion_destino_id, orden_movimiento_id = a.orden_movimiento_id, contenido = v_cont, hash_contenido = wms._hash(v_cont) where id = v_id;
  perform wms.registrar_audit('orden_baja_reemitida', 'ordenes_baja', v_id::text, null, jsonb_build_object('numero', v_num, 'reemite', a.numero), null);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Trasladar a Bajas (el movimiento físico, por el flujo normal de Movimientos)
-- ─────────────────────────────────────────────────────────────────────────────

-- Arma el movimiento interno con lo de la Orden (ejecutar_movimiento exige el permiso de ejecutar y otra persona lo verifica). Dirección Técnica cambió el estado;
-- quien tiene el permiso de ejecutar lleva las unidades a la ubicación de Bajas del propietario.
create or replace function wms.trasladar_baja(p_orden uuid, p_destino uuid default null) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare o wms.ordenes_baja; l record; r jsonb; v_lineas jsonb := '[]'::jsonb; v_dest uuid; v_mov uuid; v_viejo wms.ordenes_movimiento;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_permiso('ejecutar') then raise exception 'No tienes permiso para registrar movimientos' using errcode = '42501'; end if;
  select * into o from wms.ordenes_baja where id = p_orden for update;
  if not found then raise exception 'No encontramos esa Orden de Baja' using errcode = 'P0001'; end if;
  if o.estado <> 'EMITIDA' then raise exception 'La Orden de Baja % no está vigente (%)', o.numero, o.estado using errcode = 'P0001'; end if;
  if o.orden_movimiento_id is not null then
    select * into v_viejo from wms.ordenes_movimiento where id = o.orden_movimiento_id;
    if v_viejo.estado <> 'ANULADO' then raise exception 'El traslado de esta baja ya está registrado (%)', v_viejo.numero using errcode = 'P0001'; end if;
  end if;
  v_dest := wms._posicion_bajas(o.propietario_id, p_destino);
  for l in select * from wms.ordenes_baja_lineas where orden_id = p_orden order by n loop
    for r in select value from jsonb_array_elements(l.reparto) loop
      v_lineas := v_lineas || jsonb_build_object('lote_id', l.lote_id, 'estado', 'BAJAS_RECHAZADOS', 'procedencia_id', r->>'procedencia_id',
                                                 'desde_posicion_id', l.posicion_id, 'hasta_posicion_id', v_dest, 'cantidad', (r->>'cantidad')::integer);
    end loop;
  end loop;
  v_mov := wms.ejecutar_movimiento(v_lineas, 'Traslado a Bajas de la Orden ' || o.numero, 'baja-' || p_orden || '-' || extract(epoch from now())::bigint);
  -- La Orden emitida es inmutable en lo que dice el documento; el vínculo con el traslado es seguimiento y sí se puede actualizar.
  update wms.ordenes_baja set orden_movimiento_id = v_mov, posicion_destino_id = v_dest where id = p_orden;
  update wms.alertas set estado = 'ATENDIDA', atendida_por = auth.uid(), atendida_en = now(), nota_atencion = 'Se registró el traslado a Bajas'
   where clave = 'baja-traslado:' || p_orden and estado = 'ABIERTA';
  perform wms.registrar_audit('baja_trasladada', 'ordenes_baja', p_orden::text, null, jsonb_build_object('orden_movimiento', v_mov, 'destino', v_dest), null);
  return v_mov;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Stock en Bajas por propietario y lote (el contrato para la salida por destrucción de OS-2)
-- ─────────────────────────────────────────────────────────────────────────────

-- Una fila por ubicación y lote con unidades en estado Bajas/Rechazados. `en_area_bajas` = ya está físicamente en el área de Bajas (lo que todavía espera su
-- traslado no es destruible). `vencido` = el lote venció. `ordenes_baja` = Órdenes de Baja vigentes que lo sustentan (vacío si llegó a Bajas por un rechazo).
-- Solo lectura; la lectura respeta las políticas de `saldos` (quien llama).
create or replace view wms.v_stock_en_bajas with (security_invoker = true) as
select s.posicion_id, s.lote_id, s.propietario_id, s.producto_id,
       po.codigo as propietario_codigo, po.razon_social as propietario,
       p.codigo as producto_codigo, p.descripcion as producto, p.presentacion,
       lt.codigo as lote, lt.vence, (lt.vence is not null and lt.vence < (now() at time zone 'America/Lima')::date) as vencido,
       ps.codigo as posicion, (ps.tipo_area = 'BAJAS_RECHAZADOS') as en_area_bajas,
       sum(s.cantidad)::integer as cantidad,
       coalesce((select array_agg(distinct ob.numero order by ob.numero) from wms.ordenes_baja_lineas ol join wms.ordenes_baja ob on ob.id = ol.orden_id
                  where ol.lote_id = s.lote_id and ob.estado = 'EMITIDA'), '{}'::text[]) as ordenes_baja,
       coalesce((select array_agg(distinct ol.motivo order by ol.motivo) from wms.ordenes_baja_lineas ol join wms.ordenes_baja ob on ob.id = ol.orden_id
                  where ol.lote_id = s.lote_id and ob.estado = 'EMITIDA'), '{}'::text[]) as motivos
  from wms.saldos s
  join wms.propietarios po on po.id = s.propietario_id
  join catalogo.productos p on p.id = s.producto_id
  join wms.lotes lt on lt.id = s.lote_id
  join wms.posiciones ps on ps.id = s.posicion_id
 where s.estado = 'BAJAS_RECHAZADOS' and s.cantidad > 0
 group by s.posicion_id, s.lote_id, s.propietario_id, s.producto_id, po.codigo, po.razon_social, p.codigo, p.descripcion, p.presentacion, lt.codigo, lt.vence, ps.codigo, ps.tipo_area;
revoke all on wms.v_stock_en_bajas from anon, authenticated;
grant select on wms.v_stock_en_bajas to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Vencidos, devolución a proveedor y salidas sin venta (DT 2026-10-17, §7)
-- ─────────────────────────────────────────────────────────────────────────────
--   · Lo vencido NO sale por una salida: ni el de Logissa ni el de un cliente de almacenamiento. Va a Bajas (Orden de Baja) y, si es de un cliente, sale a
--     destrucción cuando el cliente lo indica, y solo DESDE Bajas. Nunca se devuelve ni se vende vencido: se retira la aprobación de Dirección Técnica de
--     lotes vencidos (D-69), que ya no tiene caso.
--   · Devolución a proveedor (stock de Logissa: Biosana, Prades Lab…): una salida normal de tipo PROVEEDOR, solo ANTES del vencimiento y según la política de
--     canje. La política de canje está PENDIENTE de Katia: queda como dos parámetros (ver más abajo).
--   · Motivos de la salida tipo B (cliente de almacenamiento): venta, pesquisa DIGEMID (nunca de vencidos), muestra y destrucción (solo desde Bajas).
--     La devolución al proveedor deja de ser motivo de un cliente. La salida tipo B no emite guía del WMS: usa la GRE del cliente (lo construye OS-3).

insert into wms.parametros (clave, valor, nota) values
  ('canje_dias_minimos_antes_vencimiento', '0',
   'Política de canje con el proveedor (PENDIENTE de Katia): una devolución al proveedor solo sale si al lote le faltan AL MENOS estos días para vencer. 0 = hasta el día del vencimiento.'),
  ('canje_dias_maximos_antes_vencimiento', '',
   'Política de canje con el proveedor (PENDIENTE de Katia): solo se acepta devolver cuando al lote le faltan COMO MÁXIMO estos días para vencer (ventana de canje). Vacío = sin tope.')
on conflict (clave) do nothing;

-- Los tipos de salida: se agrega PROVEEDOR (devolución de Logissa a su proveedor). El «tipo + motivo» que ya existía se reemplaza por uno NOT VALID: las filas viejas
-- (si hubiera alguna con devolución al proveedor de un cliente) no se tocan ni se reescriben; solo las nuevas deben cumplirlo.
select wms._ampliar_check_in('wms.salidas', 'salidas_tipo_check', 'tipo', array['PROVEEDOR']);
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'wms.salidas'::regclass and conname = 'salidas_check') then
    alter table wms.salidas drop constraint salidas_check;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'wms.salidas'::regclass and conname = 'salidas_tipo_motivo_check') then
    alter table wms.salidas drop constraint salidas_tipo_motivo_check;
  end if;
  alter table wms.salidas add constraint salidas_tipo_motivo_check check (
    (tipo = 'DISTRIBUCION' and motivo = 'VENTA') or (tipo = 'MUESTRA' and motivo = 'MUESTRA') or (tipo = 'PROVEEDOR' and motivo = 'DEVOLUCION_PROVEEDOR')
    or (tipo = 'CLIENTE' and motivo in ('VENTA', 'PESQUISA_DIGEMID', 'DESTRUCCION', 'MUESTRA'))) not valid;
end $$;

-- ¿Puede este lote salir de Aprobados en este tipo de salida? Mismo contrato que en la 0012 (`requiere_aprobacion_dt` queda siempre en falso: ya no hay excepción).
create or replace function wms._lote_apto(p_vence date, p_tipo text, p_motivo text, p_hoy date, p_min_dias integer)
returns table (apto boolean, requiere_aprobacion_dt boolean, razon text)
language plpgsql stable as $$
declare v_min integer; v_max integer; v_faltan integer;
begin
  if p_vence is not null and p_vence < p_hoy then
    return query select false, false, (case
      when p_tipo = 'PROVEEDOR' then 'El lote está vencido: no se devuelve vencido a nadie. Va a Bajas con una Orden de Baja.'
      when p_tipo = 'CLIENTE' and p_motivo = 'PESQUISA_DIGEMID' then 'El lote está vencido: la pesquisa DIGEMID nunca es de lotes vencidos. Lo vencido va a Bajas y sale a destrucción cuando el cliente lo indica.'
      when p_tipo = 'CLIENTE' then 'El lote está vencido: lo vencido solo va a Bajas (Orden de Baja) y sale a destrucción cuando el cliente lo indica.'
      else 'El lote está vencido: el stock de Logissa nunca sale vencido; solo va a Bajas (Orden de Baja).' end)::text;
    return;
  end if;
  if p_tipo = 'DISTRIBUCION' and p_vence is not null and (p_vence - p_hoy) < p_min_dias then
    return query select false, false, format('El lote vence en %s días: un pedido de venta pide al menos %s.', p_vence - p_hoy, p_min_dias);
    return;
  end if;
  if p_tipo = 'PROVEEDOR' then
    -- Política de canje (PENDIENTE de Katia): dos parámetros. Un lote sin fecha no se puede evaluar: no se devuelve.
    if p_vence is null then
      return query select false, false, 'El lote no tiene fecha de vencimiento: no se puede evaluar la política de canje.'::text;
      return;
    end if;
    v_faltan := p_vence - p_hoy;
    select coalesce(nullif(btrim(valor), '')::integer, 0) into v_min from wms.parametros where clave = 'canje_dias_minimos_antes_vencimiento';
    select nullif(btrim(valor), '')::integer into v_max from wms.parametros where clave = 'canje_dias_maximos_antes_vencimiento';
    if v_faltan < coalesce(v_min, 0) then
      return query select false, false, format('Según la política de canje, el proveedor recibe el lote con al menos %s días antes de vencer; a este le faltan %s.', coalesce(v_min, 0), v_faltan);
      return;
    end if;
    if v_max is not null and v_faltan > v_max then
      return query select false, false, format('Según la política de canje, el proveedor recibe el lote cuando faltan %s días o menos para vencer; a este le faltan %s.', v_max, v_faltan);
      return;
    end if;
  end if;
  return query select true, false, null::text;
end $$;

-- Dirección Técnica ya no aprueba lotes vencidos en una salida (D-69 queda sin efecto). La función se conserva para no romper llamadas viejas y explica el camino.
create or replace function wms.aprobar_salida_vencida(p_salida uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  perform wms._exigir_accion('aprobar', 'Solo Dirección Técnica aprueba la salida de lotes vencidos');
  raise exception 'Lo vencido ya no sale por una salida con aprobación: se da de baja con una Orden de Baja y, si es de un cliente, sale a destrucción desde Bajas' using errcode = 'P0001';
end $$;

-- Crea una salida y sus líneas. Mismo contrato que en la 0012, con: tipo PROVEEDOR (devolución de Logissa a su proveedor, lote indicado y política de canje), los cuatro
-- motivos de la salida de un cliente, y la destrucción que solo sale desde Bajas (la línea queda pendiente: el picking desde Bajas lo arma OS-2).
create or replace function wms.crear_salida(
  p_tipo text, p_motivo text, p_propietario uuid, p_lineas jsonb,
  p_referencia_tipo text default null, p_referencia_id text default null, p_token text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v_id uuid; v_dueno boolean; v_activo boolean; x jsonb; v_prod uuid; v_cant integer; v_lote uuid; lt wms.lotes; v_msg text; r record; v_apto record;
  v_hoy date := wms._hoy_lima(); v_enbajas integer; v_pedido integer;
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
  if p_tipo not in ('DISTRIBUCION', 'CLIENTE', 'MUESTRA', 'PROVEEDOR') then raise exception 'Tipo de salida desconocido' using errcode = 'P0001'; end if;
  if p_tipo = 'CLIENTE' and p_motivo = 'DEVOLUCION_PROVEEDOR' then
    raise exception 'La devolución al proveedor es del stock de Logissa; un cliente de almacenamiento saca por venta, pesquisa DIGEMID, muestra o destrucción' using errcode = 'P0001';
  end if;
  if (p_tipo = 'DISTRIBUCION' and p_motivo is distinct from 'VENTA') or (p_tipo = 'MUESTRA' and p_motivo is distinct from 'MUESTRA')
     or (p_tipo = 'PROVEEDOR' and p_motivo is distinct from 'DEVOLUCION_PROVEEDOR')
     or (p_tipo = 'CLIENTE' and p_motivo not in ('VENTA', 'PESQUISA_DIGEMID', 'DESTRUCCION', 'MUESTRA')) or p_motivo is null then
    raise exception 'El motivo no corresponde a este tipo de salida' using errcode = 'P0001';
  end if;
  select es_dueno_almacen, activo into v_dueno, v_activo from wms.propietarios where id = p_propietario;
  if not found then raise exception 'No encontramos ese propietario' using errcode = 'P0001'; end if;
  if not v_activo then raise exception 'Ese propietario está inactivo' using errcode = 'P0001'; end if;
  if p_tipo in ('DISTRIBUCION', 'MUESTRA', 'PROVEEDOR') and not v_dueno then
    raise exception 'Las salidas de distribución, las muestras y las devoluciones al proveedor son del dueño del almacén' using errcode = 'P0001';
  end if;
  if p_tipo = 'CLIENTE' and v_dueno then
    raise exception 'Una salida por cuenta de un cliente es de un cliente de almacenamiento' using errcode = 'P0001';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La salida no tiene líneas' using errcode = 'P0001';
  end if;

  v_id := gen_random_uuid();
  insert into wms.salidas (id, numero, tipo, motivo, propietario_id, referencia_tipo, referencia_id, autorizada_por, token, creada_por)
  values (v_id, 'OS-' || to_char(now(), 'YYYY') || '-' || lpad(wms.siguiente_correlativo('OS-' || to_char(now(), 'YYYY'))::text, 5, '0'),
          p_tipo, p_motivo, p_propietario, p_referencia_tipo, p_referencia_id,
          case when p_tipo = 'MUESTRA' then auth.uid() end, nullif(trim(p_token), ''), auth.uid());

  for x in select * from jsonb_array_elements(p_lineas) loop
    v_prod := (x->>'producto_id')::uuid;
    v_cant := (x->>'cantidad')::integer;
    v_lote := nullif(x->>'lote_id', '')::uuid;
    if v_cant is null or v_cant <= 0 then raise exception 'La cantidad de cada línea debe ser mayor que cero' using errcode = 'P0001'; end if;
    if not exists (select 1 from catalogo.productos where id = v_prod) then raise exception 'No encontramos uno de los productos' using errcode = 'P0001'; end if;
    if p_tipo in ('CLIENTE', 'PROVEEDOR') then
      if v_lote is null then raise exception 'Indica el lote de cada línea' using errcode = 'P0001'; end if;
      select * into lt from wms.lotes where id = v_lote;
      if not found then raise exception 'No encontramos uno de los lotes' using errcode = 'P0001'; end if;
      if lt.propietario_id <> p_propietario then raise exception 'El lote % no es de este propietario', lt.codigo using errcode = 'P0001'; end if;
      if lt.producto_id <> v_prod then raise exception 'El lote % no corresponde al producto de la línea', lt.codigo using errcode = 'P0001'; end if;
      if p_motivo = 'DESTRUCCION' then
        -- La destrucción sale solo desde Bajas (lo vencido y lo dado de baja), y solo lo que ya está físicamente en el área de Bajas.
        select coalesce(sum(s.cantidad), 0)::integer into v_enbajas
          from wms.saldos s join wms.posiciones ps on ps.id = s.posicion_id and ps.tipo_area = 'BAJAS_RECHAZADOS'
         where s.lote_id = v_lote and s.propietario_id = p_propietario and s.estado = 'BAJAS_RECHAZADOS';
        select coalesce(sum(sl.cantidad), 0)::integer into v_pedido from wms.salida_lineas sl where sl.salida_id = v_id and sl.lote_indicado_id = v_lote;
        if v_enbajas - v_pedido < v_cant then
          raise exception 'La destrucción sale solo desde Bajas: del lote % hay % unidades en el área de Bajas y la línea pide %. Lo que no esté en Bajas se da de baja primero con una Orden de Baja',
            lt.codigo, greatest(v_enbajas - v_pedido, 0), v_cant using errcode = 'P0001';
        end if;
      else
        -- Salir de Aprobados: el lote debe ser apto (nunca vencido; en la devolución al proveedor, además, según la política de canje).
        select * into v_apto from wms._lote_apto(lt.vence, p_tipo, p_motivo, v_hoy, 0);
        if not v_apto.apto then raise exception 'Lote %: %', lt.codigo, v_apto.razon using errcode = 'P0001'; end if;
      end if;
    elsif v_lote is not null then
      raise exception 'En una salida de distribución o una muestra el sistema elige el lote por FEFO' using errcode = 'P0001';
    end if;
    insert into wms.salida_lineas (salida_id, producto_id, cantidad, lote_indicado_id, nota_stock)
    values (v_id, v_prod, v_cant, v_lote, case when p_motivo = 'DESTRUCCION' then 'Sale desde Bajas: se prepara con el picking de Bajas' end);
  end loop;

  if p_tipo in ('CLIENTE', 'PROVEEDOR') and p_motivo <> 'DESTRUCCION' then
    for r in select id from wms.salida_lineas where salida_id = v_id order by creada_en, id loop
      v_msg := wms._asignar_linea(r.id);
      if v_msg is not null then raise exception '%', v_msg using errcode = 'P0002'; end if;
    end loop;
  end if;
  update wms.salidas set requiere_embalaje = wms._requiere_embalaje(p_referencia_tipo, p_referencia_id) where id = v_id;   -- (0023, OS-2): la orden nace sabiendo si necesita embalaje
  perform wms.registrar_audit('salida_creada', 'salidas', v_id::text, null, p_lineas, p_tipo || ' / ' || p_motivo);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function
  wms.solicitar_baja(uuid, jsonb, text), wms.confirmar_vencimiento_baja(uuid), wms.registrar_evaluacion_baja(uuid, jsonb),
  wms.adjuntar_sustento_baja(uuid, text, text, text, text, integer, text), wms.autorizar_baja(uuid), wms.cerrar_solicitud_baja(uuid, text, text),
  wms.anular_orden_baja(uuid, text), wms.reemitir_orden_baja(uuid), wms.trasladar_baja(uuid, uuid), wms.stock_para_baja(uuid, text, integer)
  to authenticated;
revoke execute on all functions in schema wms from public;
