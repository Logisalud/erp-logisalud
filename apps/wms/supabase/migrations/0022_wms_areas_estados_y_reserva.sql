-- 0022 · WMS · Orden de Salida · OS-1: áreas habilitadas, estado Reserva, permisos de los jefes y Kardex LS-FR.41
--
-- Respuestas de Dirección Técnica del 2026-10-17 (docs/wms/respuestas-dt-2026-10.md, §3, §4 y §11):
--   1. Áreas habilitadas: Recepción, Cuarentena, Aprobados, Contramuestra, Bajas, Devoluciones y Despacho. Se retiran «Pendiente de conformidad», «Observado»,
--      «Retorno reservado» y «Embalaje» (la mesa K-M2 pasa a ser parte de Despacho). El stock que pasa la conformidad queda en **Despacho**, y la salida sale de ahí.
--      Nada se borra: las áreas retiradas quedan en `tipos_area` fuera de alcance, y la migración se detiene si alguna tiene stock.
--   2. RESERVA = un ESTADO del lote (no un área): el lote sigue Aprobado pero no se puede asignar ni pickear. Lo aplican y lo quitan el Jefe de Transporte y Dirección
--      Técnica, con motivo; queda la historia completa. Reemplaza al «hold» (`lote_bloqueado`) y al acondicionamiento de «Calidad».
--   3. Los retornos ya no entran a una zona propia: vuelven como una recepción tipo devolución (OS-5). Se retira `registrar_retorno` y se apaga el movimiento RETORNO.
--   4. Jefe de Almacén y Jefe de Transporte tienen TODOS los permisos del auxiliar.
--   5. El código controlado del Kardex es LS-FR.41 (reemplaza al provisional).
-- Re-ejecutable. Se aplica a mano, después de la 0021. Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Permisos, alertas y parámetros
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'wms.permisos_rol'::regclass and conname = 'permisos_rol_accion_check') then
    alter table wms.permisos_rol drop constraint permisos_rol_accion_check;
  end if;
  alter table wms.permisos_rol add constraint permisos_rol_accion_check check (accion in (
    'ver', 'ejecutar', 'verificar', 'aprobar', 'ajustar', 'configurar', 'exportar', 'auditar',
    'dar_conformidad', 'cambiar_lote_asignado', 'imprimir_paquete_documental',
    'gestionar_documentos_regulatorios', 'autorizar_salida_sin_venta', 'preparar_salidas', 'confirmar_salida',
    'planificar_ruta', 'registrar_documentacion', 'embalar', 'cargar_ruta', 'liberar_unidad', 'reservar_lote'));
end $$;

-- Reserva de lote: Jefe de Transporte y Dirección Técnica.
insert into wms.permisos_rol (rol, accion) values ('jefe_transporte', 'reservar_lote'), ('direccion_tecnica', 'reservar_lote')
on conflict (rol, accion) do nothing;

-- Los dos jefes tienen también TODO lo del auxiliar (el auxiliar sigue siendo la base).
insert into wms.permisos_rol (rol, accion)
select j.rol, p.accion
  from (values ('jefe_almacen'), ('jefe_transporte')) as j(rol)
  cross join (select accion from wms.permisos_rol where rol = 'auxiliar') p
on conflict (rol, accion) do nothing;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'alertas_tipo_check' and conrelid = 'wms.alertas'::regclass) then
    alter table wms.alertas drop constraint alertas_tipo_check;
  end if;
  alter table wms.alertas add constraint alertas_tipo_check check (tipo in (
    'TEMPERATURA', 'RS_VENCIDO', 'DIVERGENCIA_COMPRAS', 'POR_TRASLADAR_VENCIDO', 'LOTE_POR_VENCER', 'LOTE_VENCIDO',
    'SOLICITUD_AJUSTADA', 'EXCEDE_OC', 'POR_REGISTRAR_EN_COMPRAS', 'NO_COINCIDE_CON_COMPRAS',
    'MOVIMIENTO_CON_DIFERENCIA', 'MOVIMIENTO_SIN_VERIFICAR', 'CONTEO_CON_DIFERENCIA', 'AJUSTE_POR_AUTORIZAR', 'PENDIENTE_AFECTA_PRODUCTO',
    'STOCK_INSUFICIENTE', 'PEDIDO_CAMBIADO', 'DOCUMENTO_VENCIDO', 'DOCUMENTACION_INCOMPLETA', 'LOTE_EN_RESERVA'));
end $$;

-- El código controlado del Kardex (D-29): ya existe, es LS-FR.41. Solo se reemplaza el provisional; si alguien puso otro código, se respeta.
update wms.parametros set valor = 'LS-FR.41', nota = 'D-29: código controlado del formato de Kardex (DT, 2026-10-17).'
 where clave = 'kardex_codigo_formato' and (valor = '' or valor ilike '%provisional%');

insert into wms.parametros (clave, valor, nota) values
  ('contramuestra_aplica_logissa', 'no',
   'DT 2026-10-17: Contramuestra solo cuando Logissa es titular del registro sanitario o del certificado de registro (fabricación por encargo, cada lote nuevo). Hoy no aplica a Logissa; el área sigue existiendo con sus ubicaciones.')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Áreas: siete habilitadas; las demás quedan retiradas (sin borrar nada)
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from wms.saldos s join wms.posiciones p on p.id = s.posicion_id
              where p.tipo_area in ('PENDIENTE_CONFORMIDAD', 'OBSERVADO', 'RETORNO_RESERVADO') and s.cantidad > 0) then
    raise exception 'Hay stock en una zona que se retira (Pendiente de conformidad, Observado o Retorno reservado): resuélvelo antes de aplicar esta migración';
  end if;
end $$;

-- Las ubicaciones de las zonas retiradas (K-M2 de Embalaje y, si las hubiera, las otras tres) pasan a Despacho.
update wms.posiciones set tipo_area = 'DESPACHO' where tipo_area in ('EMBALAJE', 'PENDIENTE_CONFORMIDAD', 'OBSERVADO', 'RETORNO_RESERVADO');

update wms.tipos_area set en_alcance = false where codigo in ('EMBALAJE', 'PENDIENTE_CONFORMIDAD', 'OBSERVADO', 'RETORNO_RESERVADO');
update wms.tipos_area set en_alcance = true where codigo in ('RECEPCION', 'CUARENTENA', 'APROBADOS', 'CONTRAMUESTRA', 'BAJAS_RECHAZADOS', 'DEVOLUCIONES', 'DESPACHO');
delete from wms.area_estado_admitido where tipo_area in ('EMBALAJE', 'PENDIENTE_CONFORMIDAD', 'OBSERVADO', 'RETORNO_RESERVADO');

-- Un movimiento interno manual (Mover) no entra ni sale de Despacho: lo alimenta solo el flujo de salidas.
create or replace function wms.trg_mover_no_toca_zonas_de_salida()
returns trigger language plpgsql set search_path = wms, pg_temp as $$
begin
  if exists (select 1 from wms.posiciones p where p.id in (new.desde_posicion_id, new.hasta_posicion_id) and p.tipo_area = 'DESPACHO') then
    raise exception 'Despacho se usa solo en las salidas: no se mueve a mano' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Despacho tiene varias ubicaciones (K-1 … K-7 y la mesa K-M2): la conformidad deja el stock en la que se indique o, si no, en la ubicación por defecto
-- (parámetro `posicion_despacho_defecto`; Charlie la confirma).
insert into wms.parametros (clave, valor, nota) values
  ('posicion_despacho_defecto', 'K-1', 'Ubicación de Despacho donde queda el stock al dar la conformidad si no se indica otra. Charlie confirma cuál es.')
on conflict (clave) do nothing;

create or replace function wms._posicion_de_zona(p_tipo_area text, p_indicada uuid) returns uuid
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_id uuid; v_n integer; v_def text;
begin
  if p_indicada is not null then
    select id into v_id from wms.posiciones where id = p_indicada and tipo_area = p_tipo_area and activa;
    if v_id is null then raise exception 'Esa ubicación no es de %', p_tipo_area using errcode = 'P0001'; end if;
    return v_id;
  end if;
  select count(*), min(id::text)::uuid into v_n, v_id from wms.posiciones where tipo_area = p_tipo_area and activa;
  if v_n = 0 then
    raise exception 'El área % todavía no tiene ubicación física: Dirección Técnica y el Jefe de Almacén deben definirla (D-52)', p_tipo_area using errcode = 'P0001';
  elsif v_n = 1 then
    return v_id;
  end if;
  select valor into v_def from wms.parametros where clave = 'posicion_despacho_defecto';
  if p_tipo_area = 'DESPACHO' and v_def is not null then
    select id into v_id from wms.posiciones where codigo = v_def and tipo_area = 'DESPACHO' and activa;
    if v_id is not null then return v_id; end if;
  end if;
  raise exception 'Hay varias ubicaciones de %: indica cuál usar', p_tipo_area using errcode = 'P0001';
end $$;

-- Funciones del libro que nombraban las zonas retiradas. En vez de copiar sus cuerpos completos otra vez, se reescribe el texto exacto que cambia
-- (y la migración falla en voz alta si el texto esperado no está, para no dejar una función a medias).
do $$
declare
  v_oid oid; v_def text; v_nuevo text;
  c record;
begin
  for c in
    select * from (values
      ('postear_movimiento', '(''EMBALAJE'', ''DESPACHO'', ''PENDIENTE_CONFORMIDAD'', ''OBSERVADO'', ''RETORNO_RESERVADO'')', '(''DESPACHO'')'),
      ('postear_movimiento', 'Embalaje, Despacho y las zonas de salida se usan solo en las salidas: no se mueven a mano', 'Despacho se usa solo en las salidas: no se mueve a mano'),
      ('validar_movimiento', 'ps.tipo_area not in (''PENDIENTE_CONFORMIDAD'', ''RETORNO_RESERVADO'')', 'ps.tipo_area <> ''DESPACHO'''),
      ('validar_movimiento', 'Una salida sale de staging (o de la zona de retorno reservado), nunca directo del rack', 'Una salida sale de Despacho, nunca directo del rack'),
      ('dar_conformidad', 'wms._posicion_de_zona(''PENDIENTE_CONFORMIDAD'', p_staging)', 'wms._posicion_de_zona(''DESPACHO'', p_staging)')
    ) as t(fn, viejo, nuevo)
  loop
    select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = c.fn order by p.oid desc limit 1;
    v_def := pg_get_functiondef(v_oid);
    if position(c.viejo in v_def) = 0 then
      if position(c.nuevo in v_def) > 0 then continue; end if;        -- ya aplicada (re-ejecución)
      raise exception 'No se encontró el texto esperado en wms.%: %', c.fn, c.viejo;
    end if;
    v_nuevo := replace(v_def, c.viejo, c.nuevo);
    execute v_nuevo;
  end loop;
end $$;

-- Los retornos ya no tienen zona propia: vuelven como una recepción tipo devolución (OS-5). Se retira la función y se apaga el movimiento.
do $$ begin
  if to_regprocedure('wms.registrar_retorno(uuid, integer, uuid, text, uuid)') is not null then
    drop function wms.registrar_retorno(uuid, integer, uuid, text, uuid);
  end if;
end $$;
update wms.tipos_movimiento set habilitado = false where codigo = 'RETORNO';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Reserva de lote (estado, no área)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.reservas_lote (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references wms.lotes(id),
  motivo text not null check (nullif(btrim(motivo), '') is not null),
  aplicada_por uuid not null,
  aplicada_en timestamptz not null default now(),
  quitada_por uuid,
  quitada_en timestamptz,
  motivo_quita text,
  check ((quitada_en is null and quitada_por is null and motivo_quita is null)
      or (quitada_en is not null and quitada_por is not null and nullif(btrim(coalesce(motivo_quita, '')), '') is not null))
);
alter table wms.reservas_lote enable row level security;
create unique index if not exists reservas_lote_viva_uk on wms.reservas_lote (lote_id) where quitada_en is null;     -- un lote, una reserva viva
create index if not exists reservas_lote_lote_idx on wms.reservas_lote (lote_id);

do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'reservas_lote' and policyname = 'lectura') then
    drop policy lectura on wms.reservas_lote;
  end if;
  create policy lectura on wms.reservas_lote for select to authenticated using (wms.es_usuario());
  revoke all on wms.reservas_lote from anon, authenticated;
  grant select on wms.reservas_lote to authenticated;
end $$;

-- La reserva solo se cierra con motivo y no se borra: aplicar/quitar son filas, no ediciones libres.
create or replace function wms._reserva_lote_guardia() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Las reservas no se borran: se quitan con motivo' using errcode = 'P0001'; end if;
  if old.quitada_en is not null then raise exception 'Esa reserva ya se quitó: su historia no cambia' using errcode = 'P0001'; end if;
  if new.lote_id <> old.lote_id or new.motivo <> old.motivo or new.aplicada_por <> old.aplicada_por or new.aplicada_en <> old.aplicada_en then
    raise exception 'Una reserva solo se cierra: no se edita' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'reservas_lote_guardia' and tgrelid = 'wms.reservas_lote'::regclass and not tgisinternal) then
    drop trigger reservas_lote_guardia on wms.reservas_lote;
  end if;
end $$;
create trigger reservas_lote_guardia before update or delete on wms.reservas_lote for each row execute function wms._reserva_lote_guardia();

-- El punto de consulta que ya usaban la asignación, la edición de lotes y la disponibilidad: ahora responde de verdad.
create or replace function wms.lote_bloqueado(p_lote uuid) returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (select 1 from wms.reservas_lote where lote_id = p_lote and quitada_en is null)
$$;

create or replace function wms.aplicar_reserva_lote(p_lote uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare lt record; v_id uuid; v_asignadas integer; v_aprobado integer;
begin
  perform wms._exigir_accion('reservar_lote', 'No tienes permiso para poner un lote en Reserva');
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Cuéntanos el motivo de la Reserva' using errcode = 'P0001'; end if;
  select * into lt from wms.lotes where id = p_lote;
  if not found then raise exception 'No encontramos ese lote' using errcode = 'P0001'; end if;
  select coalesce(sum(cantidad), 0)::integer into v_aprobado from wms.saldos where lote_id = p_lote and estado = 'APROBADO';
  if v_aprobado = 0 then raise exception 'Solo un lote Aprobado con stock puede ponerse en Reserva' using errcode = 'P0001'; end if;
  if wms.lote_bloqueado(p_lote) then raise exception 'Ese lote ya está en Reserva' using errcode = 'P0001'; end if;
  insert into wms.reservas_lote (lote_id, motivo, aplicada_por) values (p_lote, trim(p_motivo), auth.uid()) returning id into v_id;
  -- Pedidos que ya lo tenían asignado: no se pueden pickear mientras dure; se avisa para que cambien el lote.
  select coalesce(sum(r.cantidad), 0)::integer into v_asignadas from wms.reservas r where r.lote_id = p_lote and r.estado in ('ACTIVA', 'EN_TRANSITO');
  if v_asignadas > 0 then
    perform wms._alertar('LOTE_EN_RESERVA', 'jefe_transporte', null, lt.producto_id, 'reserva-lote:' || v_id,
      format('El lote %s quedó en Reserva y tiene %s unidades asignadas a pedidos: cambia el lote en esas Órdenes de Salida antes de pickear.', lt.codigo, v_asignadas), lt.codigo);
  end if;
  perform wms.registrar_audit('lote_en_reserva', 'lotes', p_lote::text, null, jsonb_build_object('reserva', v_id, 'asignadas', v_asignadas), p_motivo);
  return v_id;
end $$;

create or replace function wms.quitar_reserva_lote(p_lote uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid;
begin
  perform wms._exigir_accion('reservar_lote', 'No tienes permiso para quitar la Reserva de un lote');
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Cuéntanos por qué se quita la Reserva' using errcode = 'P0001'; end if;
  select id into v_id from wms.reservas_lote where lote_id = p_lote and quitada_en is null for update;
  if not found then raise exception 'Ese lote no está en Reserva' using errcode = 'P0001'; end if;
  update wms.reservas_lote set quitada_por = auth.uid(), quitada_en = now(), motivo_quita = trim(p_motivo) where id = v_id;
  update wms.alertas set estado = 'ATENDIDA', atendida_por = auth.uid(), atendida_en = now(), nota_atencion = 'Se quitó la Reserva del lote'
   where clave = 'reserva-lote:' || v_id and estado = 'ABIERTA';
  perform wms.registrar_audit('reserva_de_lote_quitada', 'lotes', p_lote::text, null, jsonb_build_object('reserva', v_id), p_motivo);
end $$;

-- Un lote en Reserva no se pickea ni entra a una orden de picking (aunque ya estuviera asignado antes).
create or replace function wms._picking_no_lote_en_reserva() returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if wms.lote_bloqueado(new.lote_id) and (tg_op = 'INSERT' or (new.picking <> 'PENDIENTE' and old.picking = 'PENDIENTE')) then
    raise exception 'El lote % está en Reserva: no se puede pickear. Cambia el lote en la Orden de Salida.', (select codigo from wms.lotes where id = new.lote_id) using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'picking_no_lote_en_reserva' and tgrelid = 'wms.ordenes_picking_lineas'::regclass and not tgisinternal) then
    drop trigger picking_no_lote_en_reserva on wms.ordenes_picking_lineas;
  end if;
end $$;
create trigger picking_no_lote_en_reserva before insert or update of picking on wms.ordenes_picking_lineas
  for each row execute function wms._picking_no_lote_en_reserva();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.aplicar_reserva_lote(uuid, text), wms.quitar_reserva_lote(uuid, text) to authenticated;
revoke execute on all functions in schema wms from public;
