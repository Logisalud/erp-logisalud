-- WMS Logisalud — migración 0005: flujo real de ingreso (addendum del 2026-10-08).
--
-- Cambios respecto de 0004 (que no se aplicó en ninguna base, pero esta migración también corre sobre ella):
--  · La SOLICITUD DE INGRESO pasa a ser la entidad primaria: nace de la OC (compra local) o de la guía del
--    cliente, declara producto + lote + vencimiento + cantidad, NO crea stock, es editable hasta el cierre
--    y toda edición deja historial campo a campo. Se conserva lo anunciado (cantidad_inicial) y lo
--    autorizado (cantidad vigente = solicitud final). Correlativo SI-AAAA-NNNNN.
--  · La recepción física VERIFICA lo declarado (coincide / diferencia → ajustar la solicitud con motivo);
--    no se vuelve a escribir lote y vencimiento. `ingresos` = recepción física; `ingreso_lotes` = sus líneas.
--  · El Acta de Recepción se genera desde la solicitud final.
--  · Estado sanitario nuevo `DEVOLUCIONES` (D-31): una devolución nace en el Área de Devoluciones y NUNCA pasa
--    por Cuarentena; compra y cliente nacen en Cuarentena.
--  · La cantidad física se captura una sola vez, aquí. Compras la consume (hoy se copia a mano): el WMS
--    reconcilia en solo lectura (`estado_registro_compras`) y alerta POR_REGISTRAR_EN_COMPRAS /
--    NO_COINCIDE_CON_COMPRAS. La alerta de divergencia de 0004 desaparece (D-19 cambia de sentido).
--  · Un lote declarado distinto del físico es un ajuste explícito con motivo (D-35), no un rechazo.
--  · Alertas nuevas: SOLICITUD_AJUSTADA (Sandra y Katia, D-34), EXCEDE_OC (Katia; avisar a Compras, D-33).
--
-- Re-ejecutable. Se aplica a mano (después de 0001–0004). No toca nada de Compras.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Estado sanitario DEVOLUCIONES y su matriz
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.estados_sanitarios (codigo, nombre, orden) values ('DEVOLUCIONES', 'Devoluciones', 4)
on conflict (codigo) do nothing;

insert into wms.transiciones_estado (desde, hasta, requiere_sustento) values
  ('DEVOLUCIONES', 'APROBADO', true),
  ('DEVOLUCIONES', 'BAJAS_RECHAZADOS', true)
on conflict (desde, hasta) do nothing;

-- Nada vuelve a Cuarentena ni a Devoluciones (son estados de entrada).
create or replace function wms.trg_prohibir_aprobado_a_cuarentena()
returns trigger language plpgsql as $$
begin
  if new.desde = 'APROBADO' and new.hasta = 'CUARENTENA' then
    raise exception 'Aprobado → Cuarentena está prohibido siempre' using errcode = 'P0001';
  end if;
  if new.hasta in ('CUARENTENA', 'DEVOLUCIONES') then
    raise exception 'Nada vuelve a Cuarentena ni a Devoluciones: son estados de entrada' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Una devolución espera en el Área de Devoluciones con su propio estado; ya no como "Cuarentena".
delete from wms.area_estado_admitido where tipo_area = 'DEVOLUCIONES' and estado = 'CUARENTENA';
insert into wms.area_estado_admitido (tipo_area, estado, origen_requerido) values
  ('DEVOLUCIONES', 'DEVOLUCIONES', 'DEVOLUCION')
on conflict (tipo_area, estado) do nothing;

-- Un ingreso solo suma unidades; el estado de nacimiento depende del origen:
-- devolución → DEVOLUCIONES, compra / cliente → CUARENTENA.
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
        if not exists (select 1 from wms.producto_regulatorio pr
                        where pr.producto_id = r.producto_id and pr.estado_validacion = 'VALIDADO') then
          raise exception 'El producto no tiene su registro sanitario validado: no se puede aprobar' using errcode = 'P0001';
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
  end if;

  if v.verificador_id is not null and v.verificador_id = v.ejecutor_id then
    raise exception 'El verificador no puede ser quien ejecutó el movimiento' using errcode = 'P0001';
  end if;
end $$;

-- Un lote ya registrado con otro vencimiento no se acepta en silencio (un lote no puede tener dos fechas),
-- pero el mensaje apunta al camino: ajuste explícito con motivo (D-35).
create or replace function wms.asegurar_lote(
  p_producto uuid, p_codigo text, p_vence date, p_propietario uuid, p_vence_texto text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v wms.lotes;
begin
  if not wms.tiene_permiso('ejecutar') and not wms.tiene_permiso('configurar') then
    raise exception 'No tienes permiso para registrar lotes' using errcode = '42501';
  end if;
  select * into v from wms.lotes
   where producto_id = p_producto and codigo = p_codigo and propietario_id = p_propietario;
  if found then
    if v.vence is distinct from p_vence then
      raise exception 'El lote % ya existe con otro vencimiento (%) y aquí se declaró %. Ajusta el dato de la solicitud con su motivo; si el vencimiento registrado antes era el equivocado, Dirección Técnica lo corrige.',
        p_codigo, coalesce(v.vence::text, 'sin fecha'), coalesce(p_vence::text, 'sin fecha') using errcode = 'P0001';
    end if;
    return v.id;
  end if;
  insert into wms.lotes (producto_id, codigo, vence, vence_texto_original, propietario_id)
  values (p_producto, p_codigo, p_vence, p_vence_texto, p_propietario)
  returning id into v.id;
  perform wms.registrar_audit('lote_creado', 'lotes', v.id::text, null,
    jsonb_build_object('producto_id', p_producto, 'codigo', p_codigo, 'vence', p_vence));
  return v.id;
end $$;

-- Corrección explícita (solo Dirección Técnica, con motivo y auditoría) del vencimiento de un lote ya registrado.
create or replace function wms.corregir_vencimiento_lote(p_lote uuid, p_vence date, p_motivo text)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare v wms.lotes;
begin
  if not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica corrige el vencimiento de un lote registrado' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'La corrección necesita un motivo' using errcode = 'P0001'; end if;
  select * into v from wms.lotes where id = p_lote for update;
  if not found then raise exception 'Lote inexistente' using errcode = 'P0001'; end if;
  update wms.lotes set vence = p_vence where id = p_lote;
  perform wms.registrar_audit('lote_vencimiento_corregido', 'lotes', p_lote::text,
    jsonb_build_object('vence', v.vence), jsonb_build_object('vence', p_vence), p_motivo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Parámetros nuevos
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.parametros (clave, valor, nota) values
  ('plazo_registro_compras_horas', '24', 'Horas desde la confirmación del ingreso en que se espera ver la cantidad física registrada en Compras (copiada a mano); pasado el plazo se alerta')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Estructura: la solicitud pasa a ser la entidad primaria
-- ─────────────────────────────────────────────────────────────────────────────

-- La solicitud ya no cuelga del ingreso: el ingreso (recepción física) cuelga de la solicitud.
do $$ begin if exists (select 1 from information_schema.columns where table_schema = 'wms' and table_name = 'solicitudes_ingreso' and column_name = 'ingreso_id') then alter table wms.solicitudes_ingreso drop column ingreso_id cascade; end if; end $$;
alter table wms.solicitudes_ingreso
  add column if not exists numero text,
  add column if not exists tipo text,
  add column if not exists propietario_id uuid references wms.propietarios(id),
  add column if not exists estado text not null default 'BORRADOR',
  add column if not exists oc_id uuid,
  add column if not exists oc_codigo text,
  add column if not exists contraparte_nombre text,
  add column if not exists contraparte_ruc text,
  add column if not exists guia_numero text,
  add column if not exists doc_original_tipo text,
  add column if not exists doc_original_numero text,
  add column if not exists motivo text,
  add column if not exists observaciones text,
  add column if not exists fecha_prevista date,
  add column if not exists origen_creacion text not null default 'INTERNO',
  add column if not exists creado_por uuid,
  add column if not exists autorizado_por uuid,
  add column if not exists autorizado_en timestamptz,
  add column if not exists cerrada_en timestamptz;

do $$ begin
  alter table wms.solicitudes_ingreso add constraint solicitudes_numero_unico unique (numero);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin if exists (select 1 from pg_constraint where conname = 'solicitudes_tipo_check' and conrelid = to_regclass('wms.solicitudes_ingreso')) then alter table wms.solicitudes_ingreso drop constraint solicitudes_tipo_check; end if; end $$;
alter table wms.solicitudes_ingreso add constraint solicitudes_tipo_check
  check (tipo in ('COMPRA_LOCAL', 'DEVOLUCION', 'INGRESO_CLIENTE'));
do $$ begin if exists (select 1 from pg_constraint where conname = 'solicitudes_estado_check' and conrelid = to_regclass('wms.solicitudes_ingreso')) then alter table wms.solicitudes_ingreso drop constraint solicitudes_estado_check; end if; end $$;
alter table wms.solicitudes_ingreso add constraint solicitudes_estado_check
  check (estado in ('BORRADOR', 'ENVIADA', 'PROGRAMADA', 'EN_RECEPCION', 'CERRADA', 'ANULADA'));
do $$ begin if exists (select 1 from pg_constraint where conname = 'solicitudes_origen_check' and conrelid = to_regclass('wms.solicitudes_ingreso')) then alter table wms.solicitudes_ingreso drop constraint solicitudes_origen_check; end if; end $$;
alter table wms.solicitudes_ingreso add constraint solicitudes_origen_check check (origen_creacion in ('INTERNO', 'CLIENTE'));
do $$ begin if exists (select 1 from pg_constraint where conname = 'solicitudes_ruc_check' and conrelid = to_regclass('wms.solicitudes_ingreso')) then alter table wms.solicitudes_ingreso drop constraint solicitudes_ruc_check; end if; end $$;
alter table wms.solicitudes_ingreso add constraint solicitudes_ruc_check
  check (contraparte_ruc is null or contraparte_ruc ~ '^[0-9]{11}$');
-- La devolución sin factura o boleta original no existe; el ingreso de cliente sin guía tampoco.
do $$ begin if exists (select 1 from pg_constraint where conname = 'solicitudes_devolucion_check' and conrelid = to_regclass('wms.solicitudes_ingreso')) then alter table wms.solicitudes_ingreso drop constraint solicitudes_devolucion_check; end if; end $$;
alter table wms.solicitudes_ingreso add constraint solicitudes_devolucion_check
  check (tipo <> 'DEVOLUCION' or (doc_original_tipo in ('FACTURA', 'BOLETA') and nullif(trim(doc_original_numero), '') is not null));
do $$ begin if exists (select 1 from pg_constraint where conname = 'solicitudes_cliente_check' and conrelid = to_regclass('wms.solicitudes_ingreso')) then alter table wms.solicitudes_ingreso drop constraint solicitudes_cliente_check; end if; end $$;
alter table wms.solicitudes_ingreso add constraint solicitudes_cliente_check
  check (tipo <> 'INGRESO_CLIENTE' or nullif(trim(guia_numero), '') is not null);
create index if not exists solicitudes_estado_idx on wms.solicitudes_ingreso (estado, creado_en desc);

create table if not exists wms.solicitud_ingreso_lineas (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references wms.solicitudes_ingreso(id),
  oc_item_id uuid,                                  -- varias líneas de solicitud pueden salir de una misma línea de OC
  producto_id uuid not null,
  registro_sanitario text,                          -- copia declarada
  lote text not null check (nullif(trim(lote), '') is not null),
  vence date not null,
  vence_texto_original text,
  cantidad integer not null check (cantidad >= 0),  -- vigente = solicitud FINAL (0 = ya no llega)
  cantidad_inicial integer check (cantidad_inicial is null or cantidad_inicial >= 0),  -- lo anunciado; inmutable desde la autorización
  cantidad_oc_pedida numeric(14, 3),                -- copias de lectura de Compras al crear la solicitud
  cantidad_oc_saldo numeric(14, 3),
  compras_recibida_antes numeric(14, 3),            -- cantidad_recibida de la línea de OC cuando se creó (base para reconciliar)
  estado_linea text not null default 'ESPERADA' check (estado_linea in ('ESPERADA', 'AJUSTADA', 'RETIRADA')),
  creado_en timestamptz not null default now()
);
alter table wms.solicitud_ingreso_lineas enable row level security;
create index if not exists solicitud_lineas_sol_idx on wms.solicitud_ingreso_lineas (solicitud_id);
create index if not exists solicitud_lineas_oc_idx on wms.solicitud_ingreso_lineas (oc_item_id) where oc_item_id is not null;

-- Lo anunciado no se reescribe jamás; mientras esté en BORRADOR/ENVIADA las líneas se pueden quitar, después solo se ajustan.
create or replace function wms.trg_solicitud_linea_guardia()
returns trigger language plpgsql as $$
declare v_estado text;
begin
  select estado into v_estado from wms.solicitudes_ingreso where id = coalesce(new.solicitud_id, old.solicitud_id);
  if tg_op = 'DELETE' then
    if v_estado not in ('BORRADOR', 'ENVIADA') then
      raise exception 'Una línea de una solicitud autorizada no se borra: se pone en cero con su motivo' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.cantidad_inicial is not null and new.cantidad_inicial is distinct from old.cantidad_inicial then
    raise exception 'La cantidad inicial (lo anunciado) no se reescribe' using errcode = 'P0001';
  end if;
  if v_estado in ('CERRADA', 'ANULADA') then
    raise exception 'La solicitud ya está %: sus líneas no se editan', lower(v_estado) using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'solicitud_linea_guardia' and tgrelid = to_regclass('wms.solicitud_ingreso_lineas') and not tgisinternal) then drop trigger solicitud_linea_guardia on wms.solicitud_ingreso_lineas; end if; end $$;
create trigger solicitud_linea_guardia before update or delete on wms.solicitud_ingreso_lineas
  for each row execute function wms.trg_solicitud_linea_guardia();

-- Historial campo a campo (inmutable): "cantidad 50 → 45, Charlie, 08/10/2026 10:42, motivo".
create table if not exists wms.solicitud_ingreso_cambios (
  id bigint generated always as identity primary key,
  solicitud_id uuid not null references wms.solicitudes_ingreso(id),
  linea_id uuid references wms.solicitud_ingreso_lineas(id),
  version integer not null,
  campo text not null,
  antes text,
  despues text,
  motivo text,
  usuario uuid,
  ts timestamptz not null default now()
);
alter table wms.solicitud_ingreso_cambios enable row level security;
create index if not exists solicitud_cambios_sol_idx on wms.solicitud_ingreso_cambios (solicitud_id, id);
do $$ begin if exists (select 1 from pg_trigger where tgname = 'solicitud_cambios_inmutable' and tgrelid = to_regclass('wms.solicitud_ingreso_cambios') and not tgisinternal) then drop trigger solicitud_cambios_inmutable on wms.solicitud_ingreso_cambios; end if; end $$;
create trigger solicitud_cambios_inmutable before update or delete on wms.solicitud_ingreso_cambios
  for each row execute function wms.trg_inmutable();
do $$ begin if exists (select 1 from pg_trigger where tgname = 'solicitud_cambios_inmutable_tr' and tgrelid = to_regclass('wms.solicitud_ingreso_cambios') and not tgisinternal) then drop trigger solicitud_cambios_inmutable_tr on wms.solicitud_ingreso_cambios; end if; end $$;
create trigger solicitud_cambios_inmutable_tr before truncate on wms.solicitud_ingreso_cambios
  for each statement execute function wms.trg_inmutable();

-- La recepción física (`ingresos`) nace de una solicitud y ya no de una recepción de Compras.
alter table wms.ingresos add column if not exists solicitud_id uuid references wms.solicitudes_ingreso(id);
do $$ begin
  alter table wms.ingresos add constraint ingresos_solicitud_unica unique (solicitud_id);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ declare c record; begin
  for c in select conname from pg_constraint
            where conrelid = 'wms.ingresos'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%compra_recepcion_id is not null%' loop
    execute format('alter table wms.ingresos drop constraint %I', c.conname);
  end loop;
end $$;
do $$ begin if exists (select 1 from pg_constraint where conname = 'ingresos_estado_check' and conrelid = to_regclass('wms.ingresos')) then alter table wms.ingresos drop constraint ingresos_estado_check; end if; end $$;
alter table wms.ingresos add constraint ingresos_estado_check check (estado in ('BORRADOR', 'EN_RECEPCION', 'CONFIRMADO'));
alter table wms.ingresos alter column estado set default 'EN_RECEPCION';

-- Las líneas de la recepción: una por línea de solicitud con cantidad > 0.
do $$ begin if to_regclass('wms.ingreso_lineas') is not null then drop table wms.ingreso_lineas cascade; end if; end $$;
do $$ begin if exists (select 1 from information_schema.columns where table_schema = 'wms' and table_name = 'ingreso_lotes' and column_name = 'linea_id') then alter table wms.ingreso_lotes drop column linea_id; end if; end $$;
alter table wms.ingreso_lotes alter column lote_id drop not null;        -- el lote se asegura al confirmar
alter table wms.ingreso_lotes alter column posicion_id drop not null;    -- el destino se elige al verificar
alter table wms.ingreso_lotes
  add column if not exists solicitud_linea_id uuid references wms.solicitud_ingreso_lineas(id),
  add column if not exists lote_codigo text,
  add column if not exists verificacion text not null default 'PENDIENTE';
do $$ begin if exists (select 1 from pg_constraint where conname = 'ingreso_lotes_verificacion_check' and conrelid = to_regclass('wms.ingreso_lotes')) then alter table wms.ingreso_lotes drop constraint ingreso_lotes_verificacion_check; end if; end $$;
alter table wms.ingreso_lotes add constraint ingreso_lotes_verificacion_check check (verificacion in ('PENDIENTE', 'COINCIDE', 'AJUSTADA'));
do $$ begin
  alter table wms.ingreso_lotes add constraint ingreso_lotes_linea_unica unique (solicitud_linea_id);
exception when duplicate_object or duplicate_table then null; end $$;

-- Alertas: tipos nuevos y destinatario Sandra.
alter table wms.alertas add column if not exists solicitud_id uuid references wms.solicitudes_ingreso(id);
do $$ begin if exists (select 1 from pg_constraint where conname = 'alertas_tipo_check' and conrelid = to_regclass('wms.alertas')) then alter table wms.alertas drop constraint alertas_tipo_check; end if; end $$;
alter table wms.alertas add constraint alertas_tipo_check check (tipo in (
  'TEMPERATURA', 'RS_VENCIDO', 'DIVERGENCIA_COMPRAS', 'POR_TRASLADAR_VENCIDO', 'LOTE_POR_VENCER', 'LOTE_VENCIDO',
  'SOLICITUD_AJUSTADA', 'EXCEDE_OC', 'POR_REGISTRAR_EN_COMPRAS', 'NO_COINCIDE_CON_COMPRAS'));
do $$ begin if exists (select 1 from pg_constraint where conname = 'alertas_destinatario_rol_check' and conrelid = to_regclass('wms.alertas')) then alter table wms.alertas drop constraint alertas_destinatario_rol_check; end if; end $$;
alter table wms.alertas add constraint alertas_destinatario_rol_check
  check (destinatario_rol in ('direccion_tecnica', 'jefe_almacen', 'asistente_dt'));

-- Lectura de Compras (solo lectura, aditivo): todas las líneas de OC con lo recibido y lo facturado.
do $$ begin
  if to_regclass('compras.ordenes_compra') is not null and to_regclass('compras.ordenes_compra_items') is not null
     and to_regclass('compras.proveedores') is not null and to_regclass('catalogo.productos') is not null then
    execute $v$
      -- Todas las líneas de OC (cualquier estado): para conciliar y mostrar lo facturado aunque la OC ya se haya cerrado en Compras.
      create or replace view wms.v_oc_lineas with (security_invoker = true) as
      select oc.id as oc_id, oc.codigo as oc_codigo, oc.estado as estado_oc, pv.id as proveedor_id,
             pv.razon_social as proveedor_nombre, pv.ruc as proveedor_ruc,
             oi.id as oc_item_id, oi.producto_id, p.codigo as producto_codigo, p.descripcion as producto_descripcion,
             oi.cantidad_pedida, coalesce(oi.cantidad_recibida, 0) as cantidad_recibida,
             oi.cantidad_pedida - coalesce(oi.cantidad_recibida, 0) as saldo,
             coalesce(oi.cantidad_facturada, 0) as cantidad_facturada
        from compras.ordenes_compra oc
        join compras.proveedores pv on pv.id = oc.proveedor_id
        join compras.ordenes_compra_items oi on oi.oc_id = oc.id
        join catalogo.productos p on p.id = oi.producto_id
    $v$;
    -- Lo que se puede anunciar: solo OC que aún pueden recibir mercadería.
    execute $v$
      create or replace view wms.v_oc_items with (security_invoker = true) as
      select * from wms.v_oc_lineas where estado_oc in ('enviada', 'confirmada', 'parcialmente_recibida')
    $v$;
    execute 'grant select on wms.v_oc_lineas, wms.v_oc_items to authenticated';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Funciones: se retira el camino antiguo (ingreso desde una recepción de Compras, lotes tecleados)
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin if to_regprocedure('wms.crear_ingreso(text, uuid, jsonb, jsonb)') is not null then drop function wms.crear_ingreso(text, uuid, jsonb, jsonb); end if; end $$;
do $$ begin if to_regprocedure('wms.guardar_lotes(uuid, uuid, jsonb)') is not null then drop function wms.guardar_lotes(uuid, uuid, jsonb); end if; end $$;
do $$ begin if to_regprocedure('wms.editar_solicitud(uuid, jsonb, text)') is not null then drop function wms.editar_solicitud(uuid, jsonb, text); end if; end $$;
do $$ begin if to_regprocedure('wms.lineas_descuadradas(uuid)') is not null then drop function wms.lineas_descuadradas(uuid); end if; end $$;
do $$ begin if to_regprocedure('wms._solicitud_datos(uuid)') is not null then drop function wms._solicitud_datos(uuid); end if; end $$;
do $$ begin if to_regprocedure('wms._nueva_version_solicitud(uuid, jsonb, text)') is not null then drop function wms._nueva_version_solicitud(uuid, jsonb, text); end if; end $$;
do $$ begin if to_regprocedure('wms.revisar_divergencias()') is not null then drop function wms.revisar_divergencias(); end if; end $$;
do $$ begin if to_regprocedure('wms._alertar(text, text, uuid, uuid, text, text, text)') is not null then drop function wms._alertar(text, text, uuid, uuid, text, text, text); end if; end $$;

create or replace function wms._alertar(p_tipo text, p_rol text, p_ingreso uuid, p_producto uuid, p_clave text, p_mensaje text,
                                         p_lote text default null, p_solicitud uuid default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  insert into wms.alertas (tipo, destinatario_rol, ingreso_id, solicitud_id, producto_id, clave, mensaje, lote_codigo)
  values (p_tipo, p_rol, p_ingreso, p_solicitud, p_producto, p_clave, p_mensaje, p_lote)
  on conflict (clave) where estado = 'ABIERTA' do nothing;
end $$;

-- Preparan y autorizan solicitudes: Sandra (asistente) y Katia (Dirección Técnica). D-32.
create or replace function wms._exigir_preparar() returns void
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_rol('asistente_dt', 'direccion_tecnica') then
    raise exception 'Solo Sandra (Asistente de Dirección Técnica) o Dirección Técnica preparan y autorizan solicitudes de ingreso' using errcode = '42501';
  end if;
end $$;

create or replace function wms._snapshot_solicitud(p_id uuid) returns jsonb
language sql stable security definer set search_path = wms, pg_temp as $$
  select jsonb_build_object(
    'numero', s.numero, 'tipo', s.tipo, 'estado', s.estado, 'propietario_id', s.propietario_id, 'oc_codigo', s.oc_codigo,
    'contraparte_nombre', s.contraparte_nombre, 'contraparte_ruc', s.contraparte_ruc, 'guia_numero', s.guia_numero,
    'doc_original_tipo', s.doc_original_tipo, 'doc_original_numero', s.doc_original_numero, 'motivo', s.motivo,
    'observaciones', s.observaciones, 'fecha_prevista', s.fecha_prevista,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'linea_id', l.id, 'producto_id', l.producto_id, 'producto', p.descripcion, 'codigo', p.codigo,
               'lote', l.lote, 'vence', l.vence, 'cantidad', l.cantidad, 'cantidad_inicial', l.cantidad_inicial,
               'oc_item_id', l.oc_item_id) order by l.creado_en, l.id)
        from wms.solicitud_ingreso_lineas l join catalogo.productos p on p.id = l.producto_id
       where l.solicitud_id = s.id), '[]'::jsonb))
    from wms.solicitudes_ingreso s where s.id = p_id
$$;

create or replace function wms._nueva_version_solicitud(p_solicitud uuid, p_motivo text) returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v integer;
begin
  select coalesce(max(version), 0) + 1 into v from wms.solicitud_ingreso_versiones where solicitud_id = p_solicitud;
  insert into wms.solicitud_ingreso_versiones (solicitud_id, version, datos, motivo, editado_por)
  values (p_solicitud, v, wms._snapshot_solicitud(p_solicitud), p_motivo, auth.uid());
  update wms.solicitudes_ingreso set version_actual = v where id = p_solicitud;
  return v;
end $$;

create or replace function wms._ingreso_de_solicitud(p_solicitud uuid) returns uuid
language sql stable security definer set search_path = wms, pg_temp as $$
  select id from wms.ingresos where solicitud_id = p_solicitud
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Solicitud de Ingreso: crear, autorizar, ajustar, anular
-- ─────────────────────────────────────────────────────────────────────────────

-- p_lineas = [{oc_item_id?, producto_id?, lote, vence, vence_texto?, cantidad}]. Compra local: el producto y las cifras de la OC
-- salen de Compras (vista de solo lectura), nunca del cliente. Una línea de OC puede repartirse en varias líneas (un lote cada una).
create or replace function wms.crear_solicitud(p_tipo text, p_propietario uuid, p_datos jsonb, p_lineas jsonb, p_autorizar boolean default false)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v_id uuid := gen_random_uuid();
  v_prop wms.propietarios;
  v_oc uuid;
  x jsonb;
  v_item record;
  v_prod uuid;
  v_num text;
  v_anio text := to_char(now(), 'YYYY');
  v_n int := 0;
  r record;
begin
  perform wms._exigir_preparar();
  select * into v_prop from wms.propietarios where id = p_propietario and activo;
  if not found then raise exception 'Propietario inexistente o inactivo' using errcode = 'P0001'; end if;
  if p_tipo not in ('COMPRA_LOCAL', 'DEVOLUCION', 'INGRESO_CLIENTE') or
     not exists (select 1 from wms.origenes where codigo = p_tipo and habilitado) then
    raise exception 'Tipo de ingreso no habilitado: %', p_tipo using errcode = 'P0001';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos un producto con su lote, su vencimiento y su cantidad' using errcode = 'P0001';
  end if;

  if p_tipo = 'COMPRA_LOCAL' then
    if not v_prop.es_dueno_almacen then
      raise exception 'Una compra local es stock propio: el propietario es Logissa' using errcode = 'P0001';
    end if;
    v_oc := nullif(p_datos->>'oc_id', '')::uuid;
    if v_oc is null then raise exception 'Elige la orden de compra' using errcode = 'P0001'; end if;
    if to_regclass('wms.v_oc_items') is null then
      raise exception 'Compras no está conectado a esta base: no se puede leer la orden de compra' using errcode = 'P0001';
    end if;
  elsif p_tipo = 'INGRESO_CLIENTE' then
    if v_prop.es_dueno_almacen then
      raise exception 'Un ingreso de cliente queda a nombre del cliente, no de Logissa' using errcode = 'P0001';
    end if;
    if nullif(trim(p_datos->>'guia_numero'), '') is null then
      raise exception 'El ingreso de cliente necesita la guía del cliente' using errcode = 'P0001';
    end if;
  elsif p_tipo = 'DEVOLUCION' then
    if nullif(trim(p_datos->>'doc_original_tipo'), '') is null or nullif(trim(p_datos->>'doc_original_numero'), '') is null then
      raise exception 'La devolución necesita la factura o boleta original: sin ella no se puede registrar' using errcode = 'P0001';
    end if;
  end if;

  v_num := 'SI-' || v_anio || '-' || lpad(wms.siguiente_correlativo('SI-' || v_anio)::text, 5, '0');
  insert into wms.solicitudes_ingreso (id, numero, tipo, propietario_id, estado, oc_id, contraparte_nombre, contraparte_ruc,
                                       guia_numero, doc_original_tipo, doc_original_numero, motivo, observaciones, fecha_prevista,
                                       origen_creacion, creado_por)
  values (v_id, v_num, p_tipo, p_propietario, 'BORRADOR', v_oc, nullif(trim(p_datos->>'contraparte_nombre'), ''),
          nullif(trim(p_datos->>'contraparte_ruc'), ''), nullif(trim(p_datos->>'guia_numero'), ''),
          nullif(trim(p_datos->>'doc_original_tipo'), ''), nullif(trim(p_datos->>'doc_original_numero'), ''),
          nullif(trim(p_datos->>'motivo'), ''), nullif(trim(p_datos->>'observaciones'), ''),
          nullif(p_datos->>'fecha_prevista', '')::date, 'INTERNO', auth.uid());

  for x in select * from jsonb_array_elements(p_lineas) loop
    if nullif(trim(x->>'lote'), '') is null then raise exception 'Cada línea necesita su lote' using errcode = 'P0001'; end if;
    if nullif(x->>'vence', '') is null then raise exception 'El lote % necesita su fecha de vencimiento', x->>'lote' using errcode = 'P0001'; end if;
    if (x->>'cantidad')::int is null or (x->>'cantidad')::int <= 0 then
      raise exception 'La cantidad del lote % debe ser un entero mayor que cero', x->>'lote' using errcode = 'P0001';
    end if;
    v_prod := nullif(x->>'producto_id', '')::uuid;
    select null::text as oc_codigo, null::text as proveedor_nombre, null::text as proveedor_ruc, null::uuid as producto_id,
           null::numeric as cantidad_pedida, null::numeric as cantidad_recibida, null::numeric as saldo into v_item;
    if p_tipo = 'COMPRA_LOCAL' then
      execute 'select oc_codigo, proveedor_nombre, proveedor_ruc, producto_id, cantidad_pedida, cantidad_recibida, saldo
                 from wms.v_oc_items where oc_item_id = $1 and oc_id = $2'
        into v_item using nullif(x->>'oc_item_id', '')::uuid, v_oc;
      if v_item.producto_id is null then
        raise exception 'Una línea no pertenece a esa orden de compra' using errcode = 'P0001';
      end if;
      v_prod := v_item.producto_id;
      update wms.solicitudes_ingreso set oc_codigo = v_item.oc_codigo,
             contraparte_nombre = coalesce(contraparte_nombre, v_item.proveedor_nombre),
             contraparte_ruc = coalesce(contraparte_ruc, v_item.proveedor_ruc) where id = v_id;
    end if;
    if v_prod is null then raise exception 'Cada línea necesita su producto' using errcode = 'P0001'; end if;
    insert into wms.solicitud_ingreso_lineas (solicitud_id, oc_item_id, producto_id, registro_sanitario, lote, vence,
                                              vence_texto_original, cantidad, cantidad_oc_pedida, cantidad_oc_saldo, compras_recibida_antes)
    values (v_id, nullif(x->>'oc_item_id', '')::uuid, v_prod,
            (select registro_sanitario from wms.producto_regulatorio where producto_id = v_prod),
            trim(x->>'lote'), (x->>'vence')::date, nullif(x->>'vence_texto', ''), (x->>'cantidad')::int,
            case when p_tipo = 'COMPRA_LOCAL' then v_item.cantidad_pedida end,
            case when p_tipo = 'COMPRA_LOCAL' then v_item.saldo end,
            case when p_tipo = 'COMPRA_LOCAL' then v_item.cantidad_recibida end);
    v_n := v_n + 1;
  end loop;

  -- Registro sanitario vencido: alerta inmediata a Katia (bloquea la aprobación, no la recepción).
  for r in select distinct l.producto_id, p.descripcion, pr.rs_vence
             from wms.solicitud_ingreso_lineas l join catalogo.productos p on p.id = l.producto_id
             join wms.producto_regulatorio pr on pr.producto_id = l.producto_id
            where l.solicitud_id = v_id and pr.rs_vence is not null and pr.rs_vence < current_date loop
    perform wms._alertar('RS_VENCIDO', 'direccion_tecnica', null, r.producto_id, 'rs:' || r.producto_id,
      format('El registro sanitario de %s venció el %s. Su lote no se puede aprobar hasta que lo resuelvas.',
             r.descripcion, to_char(r.rs_vence, 'DD/MM/YYYY')), null, v_id);
  end loop;
  perform wms._alertar_exceso_oc(v_id);

  perform wms._nueva_version_solicitud(v_id, 'Creada');
  perform wms.registrar_audit('solicitud_creada', 'solicitudes_ingreso', v_id::text, null,
    jsonb_build_object('numero', v_num, 'tipo', p_tipo, 'lineas', v_n));
  if p_autorizar then perform wms.autorizar_solicitud(v_id); end if;
  return v_id;
end $$;

-- D-33: llega (o se autoriza) más que el saldo de la OC → se registra lo físico y se alerta; NO se resuelve solo.
create or replace function wms._alertar_exceso_oc(p_solicitud uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare r record; s wms.solicitudes_ingreso;
begin
  select * into s from wms.solicitudes_ingreso where id = p_solicitud;
  if s.tipo <> 'COMPRA_LOCAL' then return; end if;
  for r in select l.oc_item_id, l.producto_id, p.descripcion, sum(l.cantidad) as pide, max(l.cantidad_oc_saldo) as saldo
             from wms.solicitud_ingreso_lineas l join catalogo.productos p on p.id = l.producto_id
            where l.solicitud_id = p_solicitud and l.oc_item_id is not null
            group by l.oc_item_id, l.producto_id, p.descripcion
           having sum(l.cantidad) > max(l.cantidad_oc_saldo) loop
    perform wms._alertar('EXCEDE_OC', 'direccion_tecnica', null, r.producto_id, 'excede:' || p_solicitud || ':' || r.oc_item_id,
      format('La solicitud %s declara %s unidades de %s y el saldo de la orden %s es %s: sobran %s. El WMS aceptará lo que llegue físicamente, pero no lo resuelve: decídelo con Compras.',
             s.numero, r.pide, r.descripcion, s.oc_codigo, trim_scale(r.saldo), trim_scale(r.pide - r.saldo)), null, p_solicitud);
  end loop;
end $$;

create or replace function wms.autorizar_solicitud(p_solicitud uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.solicitudes_ingreso;
begin
  perform wms._exigir_preparar();
  select * into s from wms.solicitudes_ingreso where id = p_solicitud for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = 'P0001'; end if;
  if s.estado not in ('BORRADOR', 'ENVIADA') then
    raise exception 'La solicitud % ya está %', s.numero, lower(s.estado) using errcode = 'P0001';
  end if;
  -- Desde aquí lo anunciado queda fijo: la cantidad inicial no se reescribe.
  update wms.solicitud_ingreso_lineas set cantidad_inicial = cantidad where solicitud_id = p_solicitud;
  update wms.solicitudes_ingreso set estado = 'PROGRAMADA', autorizado_por = auth.uid(), autorizado_en = now() where id = p_solicitud;
  perform wms._nueva_version_solicitud(p_solicitud, 'Autorizada: queda programada');
  perform wms.registrar_audit('solicitud_autorizada', 'solicitudes_ingreso', p_solicitud::text, null, wms._snapshot_solicitud(p_solicitud));
end $$;

-- Núcleo de los cambios: una lista de operaciones, cada una con su registro campo a campo.
--  {op:'LINEA', linea_id, campo: cantidad|lote|vence|producto_id, valor, vence_texto?}
--  {op:'AGREGAR_LINEA', producto_id?, oc_item_id?, lote, vence, vence_texto?, cantidad}
--  {op:'ENCABEZADO', campo: guia_numero|contraparte_nombre|contraparte_ruc|motivo|observaciones|fecha_prevista|doc_original_tipo|doc_original_numero, valor}
create or replace function wms._aplicar_cambios(p_solicitud uuid, p_cambios jsonb, p_motivo text) returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  s wms.solicitudes_ingreso;
  op jsonb;
  l wms.solicitud_ingreso_lineas;
  v_post boolean;
  v_ver integer;
  v_antes text;
  v_despues text;
  v_hubo boolean := false;
  v_campo text;
  v_valor text;
  v_item record;
  v_prod uuid;
  v_nueva uuid;
  v_resumen text;
begin
  select * into s from wms.solicitudes_ingreso where id = p_solicitud for update;
  v_post := s.estado not in ('BORRADOR', 'ENVIADA');
  select coalesce(max(version), 0) + 1 into v_ver from wms.solicitud_ingreso_versiones where solicitud_id = p_solicitud;

  for op in select * from jsonb_array_elements(coalesce(p_cambios, '[]'::jsonb)) loop
    if op->>'op' = 'LINEA' then
      select * into l from wms.solicitud_ingreso_lineas where id = (op->>'linea_id')::uuid and solicitud_id = p_solicitud;
      if not found then raise exception 'La línea no pertenece a esta solicitud' using errcode = 'P0001'; end if;
      v_campo := op->>'campo';
      v_valor := op->>'valor';
      if v_campo = 'cantidad' then
        if v_valor !~ '^[0-9]+$' then raise exception 'La cantidad es un entero (cero si ya no llega)' using errcode = 'P0001'; end if;
        v_antes := l.cantidad::text; v_despues := v_valor::int::text;
        if v_antes is distinct from v_despues then
          update wms.solicitud_ingreso_lineas set cantidad = v_valor::int,
                 estado_linea = case when not v_post then estado_linea when v_valor::int = 0 then 'RETIRADA' else 'AJUSTADA' end
           where id = l.id;
        end if;
      elsif v_campo = 'lote' then
        if nullif(trim(v_valor), '') is null then raise exception 'El lote no puede quedar vacío' using errcode = 'P0001'; end if;
        v_antes := l.lote; v_despues := trim(v_valor);
        if v_antes is distinct from v_despues then
          update wms.solicitud_ingreso_lineas set lote = v_despues, estado_linea = case when v_post then 'AJUSTADA' else estado_linea end where id = l.id;
        end if;
      elsif v_campo = 'vence' then
        v_antes := l.vence::text; v_despues := v_valor::date::text;
        if v_antes is distinct from v_despues then
          update wms.solicitud_ingreso_lineas set vence = v_valor::date, vence_texto_original = nullif(op->>'vence_texto', ''),
                 estado_linea = case when v_post then 'AJUSTADA' else estado_linea end where id = l.id;
        end if;
      elsif v_campo = 'producto_id' then
        v_antes := l.producto_id::text; v_despues := v_valor;
        if v_antes is distinct from v_despues then
          update wms.solicitud_ingreso_lineas set producto_id = v_valor::uuid,
                 registro_sanitario = (select registro_sanitario from wms.producto_regulatorio where producto_id = v_valor::uuid),
                 estado_linea = case when v_post then 'AJUSTADA' else estado_linea end where id = l.id;
        end if;
      else
        raise exception 'Campo de línea no editable: %', v_campo using errcode = 'P0001';
      end if;
      if v_antes is distinct from v_despues then
        insert into wms.solicitud_ingreso_cambios (solicitud_id, linea_id, version, campo, antes, despues, motivo, usuario)
        values (p_solicitud, l.id, v_ver, v_campo, v_antes, v_despues, nullif(trim(p_motivo), ''), auth.uid());
        v_hubo := true;
      end if;

    elsif op->>'op' = 'AGREGAR_LINEA' then
      if nullif(trim(op->>'lote'), '') is null or nullif(op->>'vence', '') is null
         or (op->>'cantidad') !~ '^[0-9]+$' or (op->>'cantidad')::int <= 0 then
        raise exception 'La línea nueva necesita lote, vencimiento y una cantidad entera mayor que cero' using errcode = 'P0001';
      end if;
      v_prod := nullif(op->>'producto_id', '')::uuid;
      v_item := null;
      if s.tipo = 'COMPRA_LOCAL' and nullif(op->>'oc_item_id', '') is not null then
        execute 'select producto_id, cantidad_pedida, cantidad_recibida, saldo from wms.v_oc_lineas where oc_item_id = $1 and oc_id = $2'
          into v_item using (op->>'oc_item_id')::uuid, s.oc_id;
        if v_item.producto_id is null then raise exception 'Esa línea no pertenece a la orden de compra' using errcode = 'P0001'; end if;
        v_prod := v_item.producto_id;
      end if;
      if v_prod is null then raise exception 'La línea nueva necesita su producto' using errcode = 'P0001'; end if;
      insert into wms.solicitud_ingreso_lineas (solicitud_id, oc_item_id, producto_id, registro_sanitario, lote, vence, vence_texto_original,
                                                cantidad, cantidad_inicial, cantidad_oc_pedida, cantidad_oc_saldo, compras_recibida_antes, estado_linea)
      values (p_solicitud, nullif(op->>'oc_item_id', '')::uuid, v_prod,
              (select registro_sanitario from wms.producto_regulatorio where producto_id = v_prod),
              trim(op->>'lote'), (op->>'vence')::date, nullif(op->>'vence_texto', ''), (op->>'cantidad')::int,
              case when v_post then 0 end, v_item.cantidad_pedida, v_item.saldo, v_item.cantidad_recibida,
              case when v_post then 'AJUSTADA' else 'ESPERADA' end)
      returning id into v_nueva;
      insert into wms.solicitud_ingreso_cambios (solicitud_id, linea_id, version, campo, antes, despues, motivo, usuario)
      values (p_solicitud, v_nueva, v_ver, 'línea agregada', null, 'lote ' || trim(op->>'lote') || ' · ' || (op->>'cantidad'),
              nullif(trim(p_motivo), ''), auth.uid());
      v_hubo := true;

    elsif op->>'op' = 'ENCABEZADO' then
      v_campo := op->>'campo';
      v_valor := nullif(trim(op->>'valor'), '');
      if v_campo not in ('guia_numero', 'contraparte_nombre', 'contraparte_ruc', 'motivo', 'observaciones', 'fecha_prevista',
                         'doc_original_tipo', 'doc_original_numero') then
        raise exception 'Campo de la solicitud no editable: %', v_campo using errcode = 'P0001';
      end if;
      execute format('select %I::text from wms.solicitudes_ingreso where id = $1', v_campo) into v_antes using p_solicitud;
      v_despues := v_valor;
      if v_antes is distinct from v_despues then
        if v_campo = 'fecha_prevista' then
          update wms.solicitudes_ingreso set fecha_prevista = v_valor::date where id = p_solicitud;
        else
          execute format('update wms.solicitudes_ingreso set %I = $1 where id = $2', v_campo) using v_valor, p_solicitud;
        end if;
        insert into wms.solicitud_ingreso_cambios (solicitud_id, version, campo, antes, despues, motivo, usuario)
        values (p_solicitud, v_ver, v_campo, v_antes, v_despues, nullif(trim(p_motivo), ''), auth.uid());
        v_hubo := true;
      end if;
    else
      raise exception 'Operación desconocida: %', op->>'op' using errcode = 'P0001';
    end if;
  end loop;

  if not v_hubo then raise exception 'No hay nada que cambiar' using errcode = 'P0001'; end if;
  perform wms._nueva_version_solicitud(p_solicitud, nullif(trim(p_motivo), ''));

  if v_post then
    -- D-34: toda diferencia entre lo anunciado y lo final avisa a Sandra y a Katia.
    select string_agg(
             case when c.campo = 'línea agregada' then 'línea agregada (' || c.despues || ')'
                  else coalesce(p.descripcion || ' · lote ' || sl.lote || ': ', '') || c.campo || ' ' || coalesce(c.antes, '—') || ' → ' || coalesce(c.despues, '—') end,
             '; ' order by c.id)
      into v_resumen
      from wms.solicitud_ingreso_cambios c
      left join wms.solicitud_ingreso_lineas sl on sl.id = c.linea_id
      left join catalogo.productos p on p.id = sl.producto_id
     where c.solicitud_id = p_solicitud and c.version = v_ver;
    perform wms._alertar('SOLICITUD_AJUSTADA', 'asistente_dt', null, null, 'ajuste:' || p_solicitud || ':' || v_ver || ':asistente_dt',
      format('La solicitud %s cambió: %s. Motivo: %s.', s.numero, v_resumen, coalesce(nullif(trim(p_motivo), ''), 'sin motivo')), null, p_solicitud);
    perform wms._alertar('SOLICITUD_AJUSTADA', 'direccion_tecnica', null, null, 'ajuste:' || p_solicitud || ':' || v_ver || ':direccion_tecnica',
      format('La solicitud %s cambió: %s. Motivo: %s.', s.numero, v_resumen, coalesce(nullif(trim(p_motivo), ''), 'sin motivo')), null, p_solicitud);
  end if;
  perform wms._alertar_exceso_oc(p_solicitud);
  perform wms.registrar_audit('solicitud_ajustada', 'solicitudes_ingreso', p_solicitud::text, null, p_cambios, p_motivo);
  return v_ver;
end $$;

create or replace function wms.ajustar_solicitud(p_solicitud uuid, p_cambios jsonb, p_motivo text default null) returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.solicitudes_ingreso; v integer; v_ing uuid;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  select * into s from wms.solicitudes_ingreso where id = p_solicitud;
  if not found then raise exception 'Solicitud inexistente' using errcode = 'P0001'; end if;
  if s.estado in ('CERRADA', 'ANULADA') then
    raise exception 'La solicitud % ya está %: no se edita', s.numero, lower(s.estado) using errcode = 'P0001';
  end if;
  v_ing := wms._ingreso_de_solicitud(p_solicitud);
  if v_ing is not null and wms._ingreso_con_firmas(v_ing) then
    raise exception 'El acta ya tiene firmas: para corregir algo, anúlala con motivo y emite otra' using errcode = 'P0001';
  end if;
  if s.estado in ('BORRADOR', 'ENVIADA') then
    perform wms._exigir_preparar();
  else
    if not (wms.tiene_permiso('ejecutar') or wms.tiene_rol('direccion_tecnica', 'asistente_dt')) then
      raise exception 'No tienes permiso para ajustar esta solicitud' using errcode = '42501';
    end if;
    if nullif(trim(p_motivo), '') is null then
      raise exception 'Todo cambio de una solicitud autorizada necesita su motivo' using errcode = 'P0001';
    end if;
  end if;
  v := wms._aplicar_cambios(p_solicitud, p_cambios, p_motivo);
  perform wms._sincronizar_recepcion(p_solicitud);
  return v;
end $$;

create or replace function wms.anular_solicitud(p_solicitud uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.solicitudes_ingreso; v_ing uuid;
begin
  perform wms._exigir_preparar();
  if nullif(trim(p_motivo), '') is null then raise exception 'La anulación necesita un motivo' using errcode = 'P0001'; end if;
  select * into s from wms.solicitudes_ingreso where id = p_solicitud for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = 'P0001'; end if;
  if s.estado in ('CERRADA', 'ANULADA') then
    raise exception 'La solicitud % ya está %', s.numero, lower(s.estado) using errcode = 'P0001';
  end if;
  v_ing := wms._ingreso_de_solicitud(p_solicitud);
  if v_ing is not null and exists (select 1 from wms.actas_recepcion where ingreso_id = v_ing and estado = 'FIRMADA') then
    raise exception 'Hay un acta firmada: anúlala primero' using errcode = 'P0001';
  end if;
  update wms.solicitudes_ingreso set estado = 'ANULADA' where id = p_solicitud;
  perform wms._nueva_version_solicitud(p_solicitud, 'Anulada: ' || trim(p_motivo));
  perform wms.registrar_audit('solicitud_anulada', 'solicitudes_ingreso', p_solicitud::text, null, null, p_motivo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Recepción física: iniciar, verificar (en vez de digitar), datos propios
-- ─────────────────────────────────────────────────────────────────────────────

-- Las líneas de la recepción siguen a las de la solicitud (cantidad > 0). Un cambio de lote, vencimiento o cantidad
-- vuelve la línea a "pendiente de verificar" salvo que lo esté haciendo la propia verificación.
create or replace function wms._sincronizar_recepcion(p_solicitud uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare i wms.ingresos; l wms.solicitud_ingreso_lineas;
begin
  select * into i from wms.ingresos where solicitud_id = p_solicitud and estado = 'EN_RECEPCION';
  if not found then return; end if;
  for l in select * from wms.solicitud_ingreso_lineas where solicitud_id = p_solicitud loop
    if l.cantidad = 0 then
      delete from wms.ingreso_lotes where solicitud_linea_id = l.id;
    else
      insert into wms.ingreso_lotes (ingreso_id, solicitud_linea_id, producto_id, lote_codigo, cantidad, vence, vence_texto_original)
      values (i.id, l.id, l.producto_id, l.lote, l.cantidad, l.vence, l.vence_texto_original)
      on conflict (solicitud_linea_id) do update
        set producto_id = excluded.producto_id, lote_codigo = excluded.lote_codigo, cantidad = excluded.cantidad,
            vence = excluded.vence, vence_texto_original = excluded.vence_texto_original,
            verificacion = case when (wms.ingreso_lotes.cantidad, wms.ingreso_lotes.lote_codigo, wms.ingreso_lotes.vence)
                                  is distinct from (excluded.cantidad, excluded.lote_codigo, excluded.vence)
                                then 'PENDIENTE' else wms.ingreso_lotes.verificacion end;
    end if;
  end loop;
end $$;

create or replace function wms.iniciar_recepcion(p_solicitud uuid) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.solicitudes_ingreso; v_id uuid;
begin
  perform wms._exigir_ejecutar();
  select * into s from wms.solicitudes_ingreso where id = p_solicitud for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = 'P0001'; end if;
  if s.estado = 'EN_RECEPCION' then return wms._ingreso_de_solicitud(p_solicitud); end if;
  if s.estado <> 'PROGRAMADA' then
    raise exception 'La solicitud % está %: solo una solicitud programada ("por llegar") se empieza a recibir', s.numero, lower(s.estado)
      using errcode = 'P0001';
  end if;
  insert into wms.ingresos (tipo, propietario_id, estado, solicitud_id, oc_codigo, contraparte_nombre, contraparte_ruc, guia_numero,
                            doc_original_tipo, doc_original_numero, motivo, creado_por, hora_inicio)
  values (s.tipo, s.propietario_id, 'EN_RECEPCION', p_solicitud, s.oc_codigo, s.contraparte_nombre, s.contraparte_ruc, s.guia_numero,
          s.doc_original_tipo, s.doc_original_numero, s.motivo, auth.uid(), now())
  returning id into v_id;
  update wms.solicitudes_ingreso set estado = 'EN_RECEPCION' where id = p_solicitud;
  perform wms._sincronizar_recepcion(p_solicitud);
  perform wms.registrar_audit('recepcion_iniciada', 'ingresos', v_id::text, null, jsonb_build_object('solicitud', s.numero));
  return v_id;
end $$;

-- "Esto es lo que esperamos. Confirma lo que encontramos."
--  · p_coincide = true  → la línea queda verificada tal cual.
--  · p_coincide = false → hay una diferencia: se actualiza la SOLICITUD (cantidad, lote o vencimiento) con su motivo y su historial,
--    y la línea queda verificada con el valor nuevo. Si hay un acta en borrador sin firmas, se regenera.
create or replace function wms.verificar_linea(
  p_linea uuid, p_coincide boolean, p_cantidad integer default null, p_lote text default null, p_vence date default null,
  p_vence_texto text default null, p_posicion uuid default null, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  l wms.solicitud_ingreso_lineas;
  s wms.solicitudes_ingreso;
  i wms.ingresos;
  v_ops jsonb := '[]'::jsonb;
  v_area text;
  v_acta wms.actas_recepcion;
  v_cont jsonb;
  v_total int; v_ok int;
begin
  perform wms._exigir_ejecutar();
  select * into l from wms.solicitud_ingreso_lineas where id = p_linea;
  if not found then raise exception 'Línea inexistente' using errcode = 'P0001'; end if;
  select * into s from wms.solicitudes_ingreso where id = l.solicitud_id for update;
  if s.estado <> 'EN_RECEPCION' then
    raise exception 'La solicitud % no está en recepción: empieza la recepción primero', s.numero using errcode = 'P0001';
  end if;
  select * into i from wms.ingresos where solicitud_id = s.id;
  if wms._ingreso_con_firmas(i.id) then
    raise exception 'El acta ya tiene firmas: para corregir algo, anúlala con motivo y emite otra' using errcode = 'P0001';
  end if;

  if not p_coincide then
    if nullif(trim(p_motivo), '') is null then
      raise exception 'Cuenta qué encontraste: el cambio de la solicitud necesita su motivo' using errcode = 'P0001';
    end if;
    if p_cantidad is not null and p_cantidad <> l.cantidad then
      v_ops := v_ops || jsonb_build_object('op', 'LINEA', 'linea_id', l.id, 'campo', 'cantidad', 'valor', p_cantidad::text);
    end if;
    if nullif(trim(p_lote), '') is not null and trim(p_lote) <> l.lote then
      v_ops := v_ops || jsonb_build_object('op', 'LINEA', 'linea_id', l.id, 'campo', 'lote', 'valor', trim(p_lote));
    end if;
    if p_vence is not null and p_vence <> l.vence then
      v_ops := v_ops || jsonb_build_object('op', 'LINEA', 'linea_id', l.id, 'campo', 'vence', 'valor', p_vence::text, 'vence_texto', p_vence_texto);
    end if;
    if jsonb_array_length(v_ops) = 0 then
      raise exception 'Indica qué encontraste distinto (cantidad, lote o vencimiento)' using errcode = 'P0001';
    end if;
    perform wms._aplicar_cambios(s.id, v_ops, p_motivo);
    perform wms._sincronizar_recepcion(s.id);
  end if;

  update wms.ingreso_lotes set verificacion = case when p_coincide then 'COINCIDE' else 'AJUSTADA' end
   where solicitud_linea_id = p_linea;

  if p_posicion is not null then
    v_area := case when i.tipo = 'DEVOLUCION' then 'DEVOLUCIONES' else 'CUARENTENA' end;
    if (select tipo_area from wms.posiciones where id = p_posicion) is distinct from v_area then
      raise exception '%', case when i.tipo = 'DEVOLUCION' then 'Una devolución se deja en el Área de Devoluciones: nunca pasa por Cuarentena'
                           else 'El inventario nuevo nace en Cuarentena: elige una posición de Cuarentena (A-6 a A-9)' end using errcode = 'P0001';
    end if;
    update wms.ingreso_lotes set posicion_id = p_posicion where solicitud_linea_id = p_linea;
  end if;

  -- Acta en borrador sin firmas: se regenera con lo verificado.
  select * into v_acta from wms.actas_recepcion where ingreso_id = i.id and estado = 'BORRADOR';
  if found and not wms._ingreso_con_firmas(i.id) then
    v_cont := wms._contenido_acta_recepcion(i.id, v_acta.numero);
    update wms.actas_recepcion set contenido = v_cont, hash_contenido = wms._hash(v_cont) where id = v_acta.id;
  end if;
  perform wms.registrar_audit('linea_verificada', 'solicitud_ingreso_lineas', p_linea::text, null,
    jsonb_build_object('coincide', p_coincide, 'cantidad', p_cantidad, 'lote', p_lote, 'vence', p_vence), p_motivo);

  select count(*), count(*) filter (where verificacion <> 'PENDIENTE') into v_total, v_ok from wms.ingreso_lotes where ingreso_id = i.id;
  return jsonb_build_object('verificadas', v_ok, 'total', v_total);
end $$;

-- Solo los datos propios de la recepción física (bultos, paletas, vehículo, temperatura, horarios, conteo, verificaciones).
-- Guía, contraparte y demás pertenecen a la solicitud y se cambian con ajustar_solicitud.
create or replace function wms.editar_ingreso(p_ingreso uuid, p_datos jsonb)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v wms.ingresos;
  v_min numeric := coalesce((select valor::numeric from wms.parametros where clave = 'temperatura_min_c'), 15);
  v_max numeric := coalesce((select valor::numeric from wms.parametros where clave = 'temperatura_max_c'), 25);
  v_temp numeric;
  v_antes jsonb;
begin
  perform wms._exigir_ejecutar();
  select * into v from wms.ingresos where id = p_ingreso for update;
  if not found then raise exception 'Ingreso inexistente' using errcode = 'P0001'; end if;
  if wms._ingreso_con_firmas(p_ingreso) then
    raise exception 'El acta ya tiene firmas: para corregir algo, anúlala con motivo y emite otra' using errcode = 'P0001';
  end if;
  v_antes := to_jsonb(v);
  v_temp := case when p_datos ? 'temperatura_c' then nullif(p_datos->>'temperatura_c', '')::numeric else v.temperatura_c end;
  update wms.ingresos set
    temperatura_c = v_temp,
    alerta_temperatura = v_temp is not null and (v_temp < v_min or v_temp > v_max),
    bultos = case when p_datos ? 'bultos' then nullif(p_datos->>'bultos', '')::int else bultos end,
    paletas = case when p_datos ? 'paletas' then nullif(p_datos->>'paletas', '')::int else paletas end,
    placa = case when p_datos ? 'placa' then nullif(trim(p_datos->>'placa'), '') else placa end,
    marca_vehiculo = case when p_datos ? 'marca_vehiculo' then nullif(trim(p_datos->>'marca_vehiculo'), '') else marca_vehiculo end,
    tipo_conteo = case when p_datos ? 'tipo_conteo' then nullif(p_datos->>'tipo_conteo', '') else tipo_conteo end,
    hora_inicio = case when p_datos ? 'hora_inicio' then nullif(p_datos->>'hora_inicio', '')::timestamptz else hora_inicio end,
    hora_fin = case when p_datos ? 'hora_fin' then nullif(p_datos->>'hora_fin', '')::timestamptz else hora_fin end,
    verificaciones = case when p_datos ? 'verificaciones' then p_datos->'verificaciones' else verificaciones end,
    observaciones = case when p_datos ? 'observaciones' then nullif(trim(p_datos->>'observaciones'), '') else observaciones end,
    factura_numero = case when p_datos ? 'factura_numero' then nullif(trim(p_datos->>'factura_numero'), '') else factura_numero end
  where id = p_ingreso;
  if v_temp is not null and (v_temp < v_min or v_temp > v_max) then
    perform wms._alertar('TEMPERATURA', 'direccion_tecnica', p_ingreso, null, 'temp:' || p_ingreso,
      format('La mercadería llegó a %s °C, fuera del rango de %s a %s °C. Se recibió; revísala antes de aprobar.', v_temp, v_min, v_max));
  end if;
  perform wms.registrar_audit('ingreso_editado', 'ingresos', p_ingreso::text, v_antes, p_datos);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Acta de Recepción prellenada desde la solicitud final
-- ─────────────────────────────────────────────────────────────────────────────

-- Invariante previa al acta: cada línea verificada, con lo esperado = lo encontrado, y con su destino.
create or replace function wms._validar_para_acta(p_ingreso uuid) returns void
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v wms.ingresos; r record;
begin
  select * into v from wms.ingresos where id = p_ingreso;
  if not found then raise exception 'Ingreso inexistente' using errcode = 'P0001'; end if;
  if v.tipo = 'DEVOLUCION' and (v.doc_original_tipo is null or nullif(trim(v.doc_original_numero), '') is null) then
    raise exception 'La devolución necesita la factura o boleta original' using errcode = 'P0001';
  end if;
  if not exists (select 1 from wms.ingreso_lotes where ingreso_id = p_ingreso) then
    raise exception 'No hay nada que recibir: la solicitud no tiene líneas con cantidad' using errcode = 'P0001';
  end if;
  for r in select p.descripcion, l.lote, l.cantidad as esperado, il.cantidad as encontrado, il.verificacion, il.posicion_id
             from wms.solicitud_ingreso_lineas l join catalogo.productos p on p.id = l.producto_id
             left join wms.ingreso_lotes il on il.solicitud_linea_id = l.id
            where l.solicitud_id = v.solicitud_id and l.cantidad > 0 order by p.descripcion, l.lote loop
    if r.encontrado is null or r.verificacion = 'PENDIENTE' then
      raise exception 'Falta verificar % (lote %)', r.descripcion, r.lote using errcode = 'P0001';
    end if;
    if r.encontrado <> r.esperado then
      raise exception 'Esperábamos % y encontramos % de % (lote %): actualiza la solicitud', r.esperado, r.encontrado, r.descripcion, r.lote
        using errcode = 'P0001';
    end if;
    if r.posicion_id is null then
      raise exception 'Elige dónde se deja % (lote %)', r.descripcion, r.lote using errcode = 'P0001';
    end if;
  end loop;
  if v.temperatura_c is null then
    raise exception 'Falta la temperatura de recepción' using errcode = 'P0001';
  end if;
end $$;

create or replace function wms._contenido_acta_recepcion(p_ingreso uuid, p_numero text) returns jsonb
language sql stable security definer set search_path = wms, pg_temp as $$
  select jsonb_build_object(
    'numero', p_numero,
    'formato', 'LS-FR.03.05',
    'solicitud', jsonb_build_object('numero', s.numero, 'version', s.version_actual),
    'ingreso', jsonb_build_object(
      'id', i.id, 'tipo', i.tipo, 'propietario', o.razon_social, 'propietario_id', i.propietario_id,
      'contraparte_nombre', i.contraparte_nombre, 'contraparte_ruc', i.contraparte_ruc, 'oc_codigo', i.oc_codigo,
      'guia_numero', s.guia_numero, 'factura_numero', i.factura_numero,
      'doc_original_tipo', s.doc_original_tipo, 'doc_original_numero', s.doc_original_numero, 'motivo', s.motivo,
      'temperatura_c', i.temperatura_c, 'alerta_temperatura', i.alerta_temperatura, 'bultos', i.bultos,
      'paletas', i.paletas, 'placa', i.placa, 'marca_vehiculo', i.marca_vehiculo, 'tipo_conteo', i.tipo_conteo,
      'hora_inicio', i.hora_inicio, 'hora_fin', i.hora_fin, 'verificaciones', i.verificaciones,
      'observaciones', i.observaciones),
    'lineas', coalesce((
      select jsonb_agg(x order by x->>'descripcion') from (
        select jsonb_build_object(
          'producto_id', g.producto_id, 'codigo', p.codigo, 'descripcion', p.descripcion,
          'registro_sanitario', pr.registro_sanitario, 'cantidad_establecida', g.establecida, 'cantidad_recibida', g.recibida,
          'lotes', g.lotes) as x
          from (select il.producto_id, sum(sl.cantidad) as establecida, sum(il.cantidad) as recibida,
                       jsonb_agg(jsonb_build_object('ingreso_lote_id', il.id, 'lote', il.lote_codigo, 'vence', il.vence,
                                 'vence_texto', il.vence_texto_original, 'cantidad', il.cantidad,
                                 'cantidad_inicial', sl.cantidad_inicial, 'posicion', ps.codigo) order by il.lote_codigo) as lotes
                  from wms.ingreso_lotes il
                  join wms.solicitud_ingreso_lineas sl on sl.id = il.solicitud_linea_id
                  left join wms.posiciones ps on ps.id = il.posicion_id
                 where il.ingreso_id = i.id group by il.producto_id) g
          join catalogo.productos p on p.id = g.producto_id
          left join wms.producto_regulatorio pr on pr.producto_id = g.producto_id) t), '[]'::jsonb))
  from wms.ingresos i
  join wms.solicitudes_ingreso s on s.id = i.solicitud_id
  join wms.propietarios o on o.id = i.propietario_id
  where i.id = p_ingreso
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Confirmar el ingreso (acta firmada → ledger). Nace en Cuarentena; la devolución, en Devoluciones.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.confirmar_ingreso(p_ingreso uuid)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v wms.ingresos;
  s wms.solicitudes_ingreso;
  a wms.actas_recepcion;
  v_mov uuid;
  v_partidas jsonb;
  v_exp uuid;
  v_clave text;
  v_estado text;
  r record;
  v_num_org text;
begin
  perform wms._exigir_ejecutar();
  select * into v from wms.ingresos where id = p_ingreso for update;
  if not found then raise exception 'Ingreso inexistente' using errcode = 'P0001'; end if;
  if v.estado = 'CONFIRMADO' then raise exception 'Este ingreso ya está confirmado' using errcode = 'P0001'; end if;
  select * into s from wms.solicitudes_ingreso where id = v.solicitud_id for update;
  perform wms._validar_para_acta(p_ingreso);
  select * into a from wms.actas_recepcion where ingreso_id = p_ingreso and estado = 'FIRMADA';
  if not found then
    raise exception 'Para confirmar el ingreso, el acta de recepción tiene que estar firmada por las cuatro partes' using errcode = 'P0001';
  end if;

  -- El lote se asegura recién ahora, con lo verificado en la recepción física.
  for r in select il.id, il.producto_id, il.lote_codigo, il.vence, il.vence_texto_original
             from wms.ingreso_lotes il where il.ingreso_id = p_ingreso loop
    update wms.ingreso_lotes set lote_id = wms.asegurar_lote(r.producto_id, r.lote_codigo, r.vence, v.propietario_id, r.vence_texto_original)
     where id = r.id;
  end loop;

  v_estado := case when v.tipo = 'DEVOLUCION' then 'DEVOLUCIONES' else 'CUARENTENA' end;
  select jsonb_agg(jsonb_build_object(
           'posicion_id', il.posicion_id, 'producto_id', il.producto_id, 'lote_id', il.lote_id,
           'propietario_id', v.propietario_id, 'estado', v_estado, 'origen', v.tipo,
           'procedencia_id', il.id, 'delta', il.cantidad))
    into v_partidas from wms.ingreso_lotes il where il.ingreso_id = p_ingreso;
  v_mov := wms.postear_movimiento('INGRESO', 'Ingreso ' || a.numero, v_partidas, 'ingreso', p_ingreso::text,
                                  'ACTA_RECEPCION', a.id::text, null);

  -- Expediente: por OC, o por N° de acta si no hay compra (varias recepciones de una OC lo comparten).
  v_clave := coalesce(v.oc_codigo, a.numero);
  insert into wms.expedientes (clave, tipo) values (v_clave, case when v.oc_codigo is null then 'ACTA' else 'OC' end)
  on conflict (clave) do nothing;
  select id into v_exp from wms.expedientes where clave = v_clave;
  update wms.expedientes set estado = 'ABIERTO', cerrado_por = null, cerrado_en = null where id = v_exp and estado = 'CERRADO';

  update wms.ingresos set estado = 'CONFIRMADO', confirmado_en = now(), movimiento_id = v_mov, expediente_id = v_exp
   where id = p_ingreso;
  update wms.solicitudes_ingreso set estado = 'CERRADA', cerrada_en = now() where id = s.id;

  perform wms._agregar_doc(v_exp, 'ACTA_RECEPCION', 'Acta de Recepción ' || a.numero, 'acta_recepcion', a.id::text);
  perform wms._agregar_doc(v_exp, 'SOLICITUD_INGRESO', 'Solicitud de Ingreso ' || s.numero || ' (LS-FR.05.05)', 'solicitud_ingreso', s.id::text);

  if nullif(trim(s.guia_numero), '') is not null then
    perform wms._agregar_doc(v_exp, 'GUIA_REMISION', 'Guía ' || s.guia_numero, 'guia', p_ingreso::text || ':' || s.guia_numero);
  else
    insert into wms.expediente_faltantes (expediente_id, tipo, documento, responsable, creado_por)
    select v_exp, 'GUIA_REMISION', 'Guía de remisión (' || a.numero || ')', 'Jefe de Almacén', auth.uid()
     where not exists (select 1 from wms.expediente_faltantes f where f.expediente_id = v_exp and f.tipo = 'GUIA_REMISION'
                          and f.estado = 'ABIERTO' and f.documento like '%(' || a.numero || ')');
  end if;
  if v.tipo = 'COMPRA_LOCAL' then
    if nullif(trim(v.factura_numero), '') is not null then
      perform wms._agregar_doc(v_exp, 'FACTURA', 'Factura ' || v.factura_numero, 'factura', p_ingreso::text || ':' || v.factura_numero);
    else
      insert into wms.expediente_faltantes (expediente_id, tipo, documento, responsable, creado_por)
      values (v_exp, 'FACTURA', 'Factura del proveedor (' || a.numero || ')', 'Contabilidad', auth.uid());
    end if;
  elsif v.tipo = 'DEVOLUCION' then
    perform wms._agregar_doc(v_exp, 'FACTURA_BOLETA_ORIGINAL', s.doc_original_tipo || ' original ' || s.doc_original_numero,
                             'doc_original', p_ingreso::text || ':' || s.doc_original_numero);
    insert into wms.expediente_faltantes (expediente_id, tipo, documento, responsable, creado_por)
    values (v_exp, 'FORMULARIO_DEVOLUCION', 'Formulario de devolución del transportista (' || a.numero || ')', 'Jefe de Almacén', auth.uid());
  end if;

  -- Un acta organoléptica por producto y lote recibido (la llena Sandra; Katia decide).
  for r in select il.id as il_id, il.cantidad, lt.codigo as lote, p.descripcion as producto
             from wms.ingreso_lotes il join wms.lotes lt on lt.id = il.lote_id
             join catalogo.productos p on p.id = il.producto_id where il.ingreso_id = p_ingreso loop
    v_num_org := 'O-' || to_char(now(), 'YYYYMM') || '-' || lpad(wms.siguiente_correlativo('O-' || to_char(now(), 'YYYYMM'))::text, 4, '0');
    insert into wms.actas_organolepticas (ingreso_lote_id, ingreso_id, numero, cantidad_lote, cantidad_muestra)
    values (r.il_id, p_ingreso, v_num_org, r.cantidad, wms.muestra_organoleptica(r.cantidad));
    insert into wms.expediente_faltantes (expediente_id, tipo, documento, responsable, creado_por)
    values (v_exp, 'ACTA_ORGANOLEPTICA', 'Acta organoléptica ' || v_num_org || ' · ' || r.producto || ' · lote ' || r.lote,
            'Dirección Técnica', auth.uid());
  end loop;

  for r in select distinct il.producto_id, p.descripcion, pr.rs_vence
             from wms.ingreso_lotes il join catalogo.productos p on p.id = il.producto_id
             join wms.producto_regulatorio pr on pr.producto_id = il.producto_id
            where il.ingreso_id = p_ingreso and pr.rs_vence is not null and pr.rs_vence < current_date loop
    perform wms._alertar('RS_VENCIDO', 'direccion_tecnica', p_ingreso, r.producto_id, 'rs:' || r.producto_id,
      format('El registro sanitario de %s venció el %s. Su lote no se puede aprobar hasta que lo resuelvas.',
             r.descripcion, to_char(r.rs_vence, 'DD/MM/YYYY')));
  end loop;

  perform wms.registrar_audit('ingreso_confirmado', 'ingresos', p_ingreso::text, null,
    jsonb_build_object('acta', a.numero, 'solicitud', s.numero, 'movimiento_id', v_mov, 'estado_inicial', v_estado));
  return v_mov;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Acta organoléptica: la unidad espera en Cuarentena (compras/clientes) o en Devoluciones (devoluciones)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.decidir_acta_organoleptica(p_acta uuid, p_decision text, p_observacion text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  o wms.actas_organolepticas;
  i wms.ingresos;
  il wms.ingreso_lotes;
  v_partidas jsonb;
  v_desde text;
  v_mov uuid;
  v_cont jsonb;
begin
  if not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica decide Aprobado o Bajas/Rechazados' using errcode = '42501';
  end if;
  if p_decision not in ('APROBADO', 'BAJAS_RECHAZADOS') then
    raise exception 'Decisión inválida: %', p_decision using errcode = 'P0001';
  end if;
  select * into o from wms.actas_organolepticas where id = p_acta for update;
  if not found then raise exception 'Acta inexistente' using errcode = 'P0001'; end if;
  if o.estado = 'FIRMADA' then raise exception 'El acta ya está firmada' using errcode = 'P0001'; end if;
  if o.estado <> 'PENDIENTE_DT' then
    raise exception 'El acta todavía no está completa: falta que la envíen a Dirección Técnica' using errcode = 'P0001';
  end if;
  if p_decision = 'APROBADO' and o.conclusion <> 'CONFORME' then
    raise exception 'El acta concluye NO CONFORME: no se puede aprobar. Decide Bajas/Rechazados o pide que la corrijan.' using errcode = 'P0001';
  end if;
  select * into il from wms.ingreso_lotes where id = o.ingreso_lote_id;
  select * into i from wms.ingresos where id = o.ingreso_id;
  v_desde := case when i.tipo = 'DEVOLUCION' then 'DEVOLUCIONES' else 'CUARENTENA' end;

  -- Solo las unidades de ESTA entrega que siguen esperando su decisión (la aprobación no se hereda).
  select jsonb_agg(x) into v_partidas from (
    select jsonb_build_object('posicion_id', s.posicion_id, 'producto_id', s.producto_id, 'lote_id', s.lote_id,
             'propietario_id', s.propietario_id, 'estado', v_desde, 'origen', i.tipo,
             'procedencia_id', s.procedencia_id, 'delta', -s.cantidad) as x
      from wms.saldos s where s.procedencia_id = il.id and s.estado = v_desde and s.cantidad > 0
    union all
    select jsonb_build_object('posicion_id', s.posicion_id, 'producto_id', s.producto_id, 'lote_id', s.lote_id,
             'propietario_id', s.propietario_id, 'estado', p_decision, 'origen', i.tipo,
             'procedencia_id', s.procedencia_id, 'delta', s.cantidad)
      from wms.saldos s where s.procedencia_id = il.id and s.estado = v_desde and s.cantidad > 0
  ) t;
  if v_partidas is null then
    raise exception 'Estas unidades ya no están esperando decisión: no hay nada que decidir' using errcode = 'P0001';
  end if;

  v_cont := jsonb_build_object(
    'numero', o.numero, 'formato', 'LS-FR.55.02',
    'ingreso_lote_id', o.ingreso_lote_id, 'cantidad_lote', o.cantidad_lote, 'cantidad_muestra', o.cantidad_muestra,
    'cert_analisis', o.cert_analisis, 'checklist', o.checklist, 'observacion', o.observacion,
    'destino_sugerido', o.destino_sugerido, 'conclusion', o.conclusion, 'decision', p_decision,
    'estado_origen', v_desde,
    'observacion_dt', nullif(trim(p_observacion), ''),
    'producto', (select jsonb_build_object('codigo', p.codigo, 'descripcion', p.descripcion, 'registro_sanitario', pr.registro_sanitario,
                                           'rs_vence', pr.rs_vence, 'fabricante', pr.fabricante, 'forma', pr.forma_presentacion)
                   from catalogo.productos p left join wms.producto_regulatorio pr on pr.producto_id = p.id where p.id = il.producto_id),
    'lote', (select jsonb_build_object('codigo', lt.codigo, 'vence', lt.vence) from wms.lotes lt where lt.id = il.lote_id));

  v_mov := wms.postear_movimiento('CAMBIO_ESTADO', 'Acta organoléptica ' || o.numero || ': ' || p_decision, v_partidas,
                                  'acta_organoleptica', o.id::text, 'ACTA_ORGANOLEPTICA', o.id::text, null);
  update wms.actas_organolepticas set estado = 'FIRMADA', decision = p_decision, decidido_por = auth.uid(),
         decidido_en = now(), observacion_dt = nullif(trim(p_observacion), ''), contenido = v_cont,
         hash_contenido = wms._hash(v_cont), movimiento_id = v_mov
   where id = p_acta;
  insert into wms.acta_firmas (acta_tipo, acta_id, rol_firma, user_id, nombre, registrado_por, hash_contenido)
  values ('ORGANOLEPTICA', p_acta, 'DIRECCION_TECNICA', auth.uid(), 'Dirección Técnica', auth.uid(), wms._hash(v_cont));

  if i.expediente_id is not null then
    insert into wms.expediente_documentos (expediente_id, tipo, descripcion, referencia_tipo, referencia_id, agregado_por)
    values (i.expediente_id, 'ACTA_ORGANOLEPTICA', 'Acta organoléptica ' || o.numero, 'acta_organoleptica', o.id::text, auth.uid())
    on conflict do nothing;
    update wms.expediente_faltantes set estado = 'RESUELTO', resuelto_por = auth.uid(), resuelto_en = now(), nota = 'Acta firmada'
     where expediente_id = i.expediente_id and tipo = 'ACTA_ORGANOLEPTICA' and documento like 'Acta organoléptica ' || o.numero || '%'
       and estado = 'ABIERTO';
  end if;
  perform wms.registrar_audit('acta_organoleptica_firmada', 'actas_organolepticas', p_acta::text, null,
    jsonb_build_object('decision', p_decision, 'hash', wms._hash(v_cont), 'movimiento_id', v_mov), p_observacion);
  return v_mov;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Conciliación con Compras (la integración es MANUAL: WMS informa, Compras se registra a mano)
-- ─────────────────────────────────────────────────────────────────────────────

-- Por línea de OC: lo que Compras debería mostrar como recibido = lo que mostraba antes de las solicitudes
-- + lo físico confirmado de las solicitudes cerradas. FALTA = aún no lo registraron; NO_COINCIDE = lo registraron distinto.
create or replace function wms.estado_registro_compras(p_solicitud uuid)
returns table (oc_item_id uuid, producto_id uuid, fisica numeric, base numeric, esperado numeric, registrado numeric, estado text)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if to_regclass('wms.v_oc_lineas') is null then return; end if;
  return query execute $q$
    with mias as (
      select sl.oc_item_id, sl.producto_id, sum(il.cantidad)::numeric as fisica
        from wms.solicitud_ingreso_lineas sl
        join wms.solicitudes_ingreso s on s.id = sl.solicitud_id and s.estado = 'CERRADA'
        join wms.ingreso_lotes il on il.solicitud_linea_id = sl.id
       where sl.solicitud_id = $1 and sl.oc_item_id is not null
       group by sl.oc_item_id, sl.producto_id),
    todas as (
      select sl.oc_item_id, sum(il.cantidad)::numeric as fisica_total, min(sl.compras_recibida_antes) as base
        from wms.solicitud_ingreso_lineas sl
        join wms.solicitudes_ingreso s on s.id = sl.solicitud_id and s.estado = 'CERRADA'
        join wms.ingreso_lotes il on il.solicitud_linea_id = sl.id
       where sl.oc_item_id in (select m.oc_item_id from mias m)
       group by sl.oc_item_id)
    select m.oc_item_id, m.producto_id, m.fisica, coalesce(t.base, 0), coalesce(t.base, 0) + t.fisica_total,
           v.cantidad_recibida,
           case when v.cantidad_recibida = coalesce(t.base, 0) + t.fisica_total then 'OK'
                when v.cantidad_recibida <= coalesce(t.base, 0) then 'FALTA'
                else 'NO_COINCIDE' end
      from mias m join todas t on t.oc_item_id = m.oc_item_id
      join wms.v_oc_lineas v on v.oc_item_id = m.oc_item_id
  $q$ using p_solicitud;
end $$;

create or replace function wms.revisar_registro_compras() returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  s record; e record; v_n int := 0; v_clave text;
  v_horas numeric := coalesce((select valor::numeric from wms.parametros where clave = 'plazo_registro_compras_horas'), 24);
  v_ing uuid; v_desc text;
begin
  if to_regclass('wms.v_oc_lineas') is null then return 0; end if;
  for s in select * from wms.solicitudes_ingreso where estado = 'CERRADA' and tipo = 'COMPRA_LOCAL' and oc_id is not null loop
    select id into v_ing from wms.ingresos where solicitud_id = s.id;
    for e in select * from wms.estado_registro_compras(s.id) loop
      select p.descripcion into v_desc from catalogo.productos p where p.id = e.producto_id;
      v_clave := 'compras:' || s.id || ':' || e.oc_item_id;
      if e.estado = 'OK' then
        update wms.alertas set estado = 'ATENDIDA', atendida_en = now(), nota_atencion = 'Compras ya coincide con la cantidad física'
         where clave = v_clave and estado = 'ABIERTA';
      elsif e.estado = 'FALTA' and s.cerrada_en < now() - make_interval(hours => v_horas::int) then
        perform wms._alertar('POR_REGISTRAR_EN_COMPRAS', 'jefe_almacen', v_ing, e.producto_id, v_clave,
          format('%s: la cantidad física confirmada es %s y Compras todavía no la tiene registrada (%s). Cópiala en la recepción de la OC %s.',
                 v_desc, e.fisica, e.registrado, s.oc_codigo), null, s.id);
        v_n := v_n + 1;
      elsif e.estado = 'NO_COINCIDE' then
        perform wms._alertar('NO_COINCIDE_CON_COMPRAS', 'jefe_almacen', v_ing, e.producto_id, v_clave,
          format('%s: en WMS recibimos %s y Compras muestra %s en la OC %s. Revisa cuál es el dato correcto.',
                 v_desc, e.esperado, e.registrado, s.oc_codigo), null, s.id);
        perform wms._alertar('NO_COINCIDE_CON_COMPRAS', 'direccion_tecnica', v_ing, e.producto_id, v_clave || ':dt',
          format('%s: en WMS recibimos %s y Compras muestra %s en la OC %s.', v_desc, e.esperado, e.registrado, s.oc_codigo), null, s.id);
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return v_n;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Vistas de lectura: las seis cantidades y lo esperado
-- ─────────────────────────────────────────────────────────────────────────────

-- OC pedida · solicitud inicial · solicitud final · física confirmada · inventario. (La factura y lo registrado
-- en Compras se leen de Compras; ver v_oc_items.)
create or replace view wms.v_cantidades_solicitud with (security_invoker = true) as
select sl.solicitud_id, sl.id as linea_id, sl.producto_id, sl.lote, sl.vence, sl.oc_item_id,
       sl.cantidad_oc_pedida, sl.cantidad_inicial, sl.cantidad as cantidad_final,
       case when i.estado = 'CONFIRMADO' then il.cantidad end as cantidad_fisica_confirmada,
       coalesce((select sum(s.cantidad) from wms.saldos s where s.procedencia_id = il.id), 0) as cantidad_inventario
  from wms.solicitud_ingreso_lineas sl
  join wms.solicitudes_ingreso so on so.id = sl.solicitud_id
  left join wms.ingresos i on i.solicitud_id = sl.solicitud_id
  left join wms.ingreso_lotes il on il.solicitud_linea_id = sl.id;

create or replace view wms.v_esperado with (security_invoker = true) as
select so.id as solicitud_id, so.numero, so.tipo, so.estado, so.propietario_id, so.contraparte_nombre, so.oc_codigo,
       so.fecha_prevista, so.version_actual,
       (select count(*) from wms.solicitud_ingreso_lineas l where l.solicitud_id = so.id and l.cantidad > 0) as lineas,
       (select coalesce(sum(l.cantidad), 0) from wms.solicitud_ingreso_lineas l where l.solicitud_id = so.id) as unidades
  from wms.solicitudes_ingreso so
 where so.estado in ('PROGRAMADA', 'EN_RECEPCION');

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. RLS y grants del flujo nuevo
-- ─────────────────────────────────────────────────────────────────────────────

do $$ declare t text; begin
  foreach t in array array['solicitud_ingreso_lineas', 'solicitud_ingreso_cambios'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then execute format('drop policy lectura on wms.%I', t); end if;
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
  end loop;
end $$;

grant select on all tables in schema wms to authenticated;
grant execute on function
  wms.crear_solicitud(text, uuid, jsonb, jsonb, boolean),
  wms.autorizar_solicitud(uuid),
  wms.ajustar_solicitud(uuid, jsonb, text),
  wms.anular_solicitud(uuid, text),
  wms.iniciar_recepcion(uuid),
  wms.verificar_linea(uuid, boolean, integer, text, date, text, uuid, text),
  wms.editar_ingreso(uuid, jsonb),
  wms.confirmar_ingreso(uuid),
  wms.decidir_acta_organoleptica(uuid, text, text),
  wms.corregir_vencimiento_lote(uuid, date, text),
  wms.estado_registro_compras(uuid),
  wms.revisar_registro_compras() to authenticated;
