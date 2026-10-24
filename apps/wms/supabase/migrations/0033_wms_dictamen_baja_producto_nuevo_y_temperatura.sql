-- 0033 · WMS · SB-C: dictamen del DT del cliente con una sola persona, Orden de Baja (código oficial y Visto Bueno), «producto/proveedor nuevo» y temperatura en ruta
--
-- Respuestas de Dirección Técnica del 2026-10-23 (D-169 … D-176):
--   1. DICTAMEN DEL DT DEL CLIENTE. Lo registra UNA persona (Sandra o Katia), sin segunda firma: el parámetro `dictamen_cliente_dos_personas` queda en «no», DEFINITIVO, y la base ya no
--      lo consulta (`confirmar_dictamen_cliente` se vuelve a escribir sin esa condición; `registrar_dictamen_cliente`, sin avisar a «la otra persona»: el aviso es para quien lo registró).
--   2. ORDEN DE BAJA. El código oficial del formato es LS-FR.56.01 (no el «LS-POE.56.01» que dice el encabezado del .docx) y Katia Zapata firma el Visto Bueno: el contenido que se
--      congela al emitir la Orden lleva `visto_bueno` (nombre y cargo, parámetros `baja_vb_nombre` y `baja_vb_cargo`).
--   3. PRODUCTO / PROVEEDOR NUEVO = SIN recepciones históricas. No existe «el mismo producto con otro laboratorio». Cuenta como historia: el stock inicial de Odoo (carga inicial) y el
--      ledger del WMS, y las recepciones previas de Compras (almacen.recepciones_items y compras.ordenes_compra_items con cantidad_recibida > 0, leídas por `wms.v_oc_lineas`).
--      `wms.es_producto_nuevo` y `wms.es_proveedor_nuevo` aplican el criterio y `wms.plan_muestreo` las usa (la recepción que se está evaluando no cuenta como su propia historia).
--   4. TEMPERATURA EN RUTA. Máximo 24.9 °C siempre (parámetro `temperatura_ruta_max_c`): si el data logger lo supera, alerta (tipo TEMPERATURA) para Dirección Técnica y el Jefe de
--      Transporte. Qué se hace con la mercadería (`ls_fr_43_03_temperatura_fuera_de_rango`) y si el límite rige también en recepción (`temperatura_recepcion_limite_rige`): PENDIENTE de Katia; no se bloquea nada.
--   5. DATA LOGGER ELITECH RC-61. La aplicación lee el informe (PDF o CSV) y guarda las lecturas (`ruta_logger_importes`, `ruta_logger_lecturas`): `registrar_lecturas_logger` recalcula
--      mínima, máxima, promedio y los minutos sobre el límite desde las lecturas (no confía en lo que resume el archivo) y las cruza con el cierre de la ruta.
--
-- Re-ejecutable (`if not exists`, `create or replace`, sin `drop … if exists` de funciones). RLS desde el `create table`. Se aplica a mano, con aprobación.
-- Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Parámetros
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.parametros (clave, valor, nota) values
  ('baja_vb_nombre', 'Katia Zapata', 'Nombre que firma el V°/B° de la Orden de Baja (DT 2026-10-23: firma Katia Zapata).'),
  ('baja_vb_cargo', 'Dirección Técnica', 'Cargo que se imprime bajo el V°/B° de la Orden de Baja.'),
  ('temperatura_ruta_max_c', '24.9', 'Límite de temperatura en ruta (DT 2026-10-23): máximo 24.9 °C siempre. Si el data logger lo supera, se alerta a Dirección Técnica y al Jefe de Transporte.'),
  ('temperatura_recepcion_limite_rige', 'PENDIENTE', 'Pendiente de Katia: si el mismo límite de 24.9 °C rige también en la recepción de mercadería. Hoy la temperatura de recepción se registra como siempre, sin este límite.')
on conflict (clave) do nothing;

update wms.parametros set valor = 'no',
  nota = 'DEFINITIVO (DT 2026-10-23, D-169): el dictamen del DT del cliente lo registra UNA persona (Sandra o Katia) y no lleva segunda firma. La base de datos ya no consulta este parámetro.'
 where clave = 'dictamen_cliente_dos_personas';
update wms.parametros set valor = 'LS-FR.56.01',
  nota = 'Código OFICIAL del formato de la Orden de Baja (DT 2026-10-23, D-170): LS-FR.56.01. El .docx de referencia dice «Cod. Formato LS-POE.56.01» en su encabezado; ese texto no se usa.'
 where clave = 'baja_codigo_formato';
update wms.parametros set nota = 'Nombre del solicitante de la Orden de Baja (Katia Zapata). Quien firma el Visto Bueno es `baja_vb_nombre`.'
 where clave = 'baja_solicitante_nombre';
update wms.parametros set valor = 'RC-61 (PDF o CSV)',
  nota = 'El informe del data logger Elitech RC-61 se lee desde la aplicación (PDF o CSV): mínima, máxima y lecturas (D-175). El archivo se sigue guardando tal cual.'
 where clave = 'ls_fr_43_03_logger_formato' and valor = 'PENDIENTE';
-- El equipo real es el Elitech RC-61 (el informe de muestra lo dice), no el GSP-6 que se había supuesto en la 0027.
update wms.parametros set valor = replace(valor, 'GSP-6', 'RC-61'), nota = replace(nota, 'GSP-6', 'RC-61')
 where clave = 'ls_fr_43_03_temperatura_metodo' and (valor like '%GSP-6%' or nota like '%GSP-6%');
-- PENDIENTE de Katia (D-174): qué se hace con la mercadería cuando el data logger supera el límite de 24.9 °C. Hoy solo se alerta; no se bloquea ni se aparta nada.
update wms.parametros set nota = 'Pendiente de Katia (D-174): qué se hace con la mercadería de una ruta cuyo data logger supera el límite de 24.9 °C (`temperatura_ruta_max_c`). Hoy solo se alerta a Dirección Técnica y al Jefe de Transporte; la ruta no se bloquea ni se aparta nada. El rango 15–25 °C del formato solo marca el cierre y el PDF.'
 where clave = 'ls_fr_43_03_temperatura_fuera_de_rango';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Dictamen del DT del cliente: una sola persona
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- Sin segunda firma (D-169): quien lo registró lo confirma. El aviso es un recordatorio para él (su propio rol), no para «la otra persona».
  v_rol := case when wms.tiene_rol('direccion_tecnica') then 'direccion_tecnica' else 'asistente_dt' end;
  perform wms._alertar('DICTAMEN_POR_CONFIRMAR', v_rol, i.id, null, 'dictamen:' || v_id,
    format('Registraste el dictamen del DT del cliente para %s (lote %s): %s liberadas y %s rechazadas. Falta confirmar el cambio de estado.', pr.descripcion, pr.lote, p_liberada, p_rechazada),
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
  -- D-169: sin segunda firma. Quien registró el dictamen puede confirmarlo.
  perform wms._validar_dictamen(d.acta_id, d.cantidad_liberada, d.cantidad_rechazada);
  return wms._aplicar_dictamen_cliente(p_dictamen);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Orden de Baja: el contenido congelado al emitir lleva el Visto Bueno (Katia Zapata)
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
    'visto_bueno', jsonb_build_object('nombre', (select valor from wms.parametros where clave = 'baja_vb_nombre'),
                                      'cargo', (select valor from wms.parametros where clave = 'baja_vb_cargo')),
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Producto nuevo y proveedor nuevo: sin recepciones históricas
-- ─────────────────────────────────────────────────────────────────────────────

-- ¿Compras ya recibió algo de ese producto o de ese proveedor? Lee las líneas de OC (`wms.v_oc_lineas`: cantidad_recibida > 0) y las recepciones físicas de almacén. Si una línea es de la
-- propia solicitud que se evalúa, vale lo que Compras mostraba ANTES de ella (`compras_recibida_antes`): Compras puede haber registrado ya esta misma recepción. Sin las tablas
-- de Compras (otra base de pruebas) no hay historia.
create or replace function wms._compras_con_historia(p_producto uuid, p_ruc text, p_nombre text, p_solicitud uuid) returns boolean
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v boolean := false;
begin
  if p_producto is null and p_ruc is null and p_nombre is null then return false; end if;
  if to_regclass('wms.v_oc_lineas') is not null then
    execute $q$
      select exists (
        select 1 from wms.v_oc_lineas v
         where ($1::uuid is null or v.producto_id = $1::uuid)
           and ($2::text is null or v.proveedor_ruc = $2::text)
           and ($3::text is null or lower(btrim(v.proveedor_nombre)) = lower(btrim($3::text)))
           and coalesce((select case when count(*) > 0 then coalesce(min(sl.compras_recibida_antes), 0) end
                           from wms.solicitud_ingreso_lineas sl where sl.solicitud_id = $4::uuid and sl.oc_item_id = v.oc_item_id),
                        v.cantidad_recibida) > 0)
    $q$ into v using p_producto, p_ruc, p_nombre, p_solicitud;
    if v then return true; end if;
  end if;
  if to_regclass('almacen.recepciones_items') is not null and to_regclass('compras.ordenes_compra_items') is not null
     and to_regclass('compras.ordenes_compra') is not null and to_regclass('compras.proveedores') is not null then
    execute $q$
      select exists (
        select 1 from almacen.recepciones_items ri
          join compras.ordenes_compra_items oi on oi.id = ri.oc_item_id
          join compras.ordenes_compra oc on oc.id = oi.oc_id
          join compras.proveedores pv on pv.id = oc.proveedor_id
         where ri.cantidad_fisica > 0
           and ($1::uuid is null or oi.producto_id = $1::uuid)
           and ($2::text is null or pv.ruc = $2::text)
           and ($3::text is null or lower(btrim(pv.razon_social)) = lower(btrim($3::text)))
           and not exists (select 1 from wms.solicitud_ingreso_lineas sl where sl.solicitud_id = $4::uuid and sl.oc_item_id = oi.id))
    $q$ into v using p_producto, p_ruc, p_nombre, p_solicitud;
  end if;
  return coalesce(v, false);
end $$;

-- Producto nuevo = nunca se recibió. Historia: el ledger del WMS (incluida la carga inicial de Odoo: un producto con stock inicial NO es nuevo) y las recepciones de Compras.
-- Las unidades de la propia recepción (`p_ingreso`) no cuentan como su historia. «El mismo producto con otro laboratorio» no existe: cada producto del catálogo es uno.
create or replace function wms.es_producto_nuevo(p_producto uuid, p_ingreso uuid default null) returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select not (
    exists (select 1 from wms.lotes lt where lt.producto_id = p_producto
             and not exists (select 1 from wms.ingreso_lotes x where x.lote_id = lt.id and x.ingreso_id = p_ingreso))
    or exists (select 1 from wms.partidas pa where pa.producto_id = p_producto
                and not exists (select 1 from wms.ingreso_lotes x where x.id = pa.procedencia_id and x.ingreso_id = p_ingreso))
    or wms._compras_con_historia(p_producto, null, null, (select i.solicitud_id from wms.ingresos i where i.id = p_ingreso))
  )
$$;

-- Proveedor nuevo = solo en una compra local, y nunca se le recibió: ni otra compra local confirmada en el WMS ni una recepción previa en Compras (por RUC o, sin RUC, por nombre).
create or replace function wms.es_proveedor_nuevo(p_ingreso uuid) returns boolean
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare i wms.ingresos; v_ruc text; v_nombre text;
begin
  select * into i from wms.ingresos where id = p_ingreso;
  if not found or i.tipo <> 'COMPRA_LOCAL' then return false; end if;
  v_ruc := nullif(btrim(coalesce(i.contraparte_ruc, '')), '');
  v_nombre := nullif(btrim(coalesce(i.contraparte_nombre, '')), '');
  if coalesce(v_ruc, v_nombre) is null then return false; end if;
  if exists (select 1 from wms.ingresos x
              where x.id <> i.id and x.tipo = 'COMPRA_LOCAL' and x.estado = 'CONFIRMADO'
                and ((v_ruc is not null and x.contraparte_ruc = v_ruc) or (v_ruc is null and x.contraparte_nombre = v_nombre))) then
    return false;
  end if;
  return not wms._compras_con_historia(null, v_ruc, case when v_ruc is null then v_nombre end, i.solicitud_id);
end $$;

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
  v_prod_nuevo := wms.es_producto_nuevo(il.producto_id, i.id);
  v_prov_nuevo := wms.es_proveedor_nuevo(i.id);
  v_reg := case when i.tipo = 'DEVOLUCION' then 'DEVOLUCION'
                when v_estricta then 'ESTRICTA'
                when il.cantidad < v_t.umbral_total then 'LOTE_MENOR'
                when v_prod_nuevo or v_prov_nuevo then 'NORMAL'
                else 'SIMPLIFICADA' end;
  regimen := v_reg; muestra := wms.tamano_muestra(il.cantidad, v_reg, current_date); tabla_codigo := v_t.codigo;
  return next;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Data logger de la ruta: lecturas importadas, cruce con el cierre y alerta sobre el límite
-- ─────────────────────────────────────────────────────────────────────────────


create table if not exists wms.ruta_logger_importes (
  id uuid primary key default gen_random_uuid(),
  ruta_id uuid not null references wms.rutas(id),
  archivo_nombre text not null check (btrim(archivo_nombre) <> ''),
  archivo_hash text not null check (archivo_hash ~ '^[0-9a-f]{64}$'),
  archivo_ref text,                                  -- dónde quedó el archivo original en el almacenamiento privado (null si solo se leyó)
  formato text not null check (formato in ('PDF', 'CSV')),
  modelo text,
  serie text,
  intervalo_min integer check (intervalo_min is null or intervalo_min between 1 and 1440),
  umbral_alto numeric(4, 1),                         -- el umbral de alarma que traía el equipo (RC-61: 24.5 / 15.5); no es nuestro límite
  umbral_bajo numeric(4, 1),
  primera_lectura timestamp not null,                -- hora del propio data logger (sin zona horaria)
  ultima_lectura timestamp not null,
  puntos integer not null check (puntos >= 1),
  temp_min numeric(4, 1) not null,
  temp_max numeric(4, 1) not null,
  temp_prom numeric(4, 1) not null,
  limite_c numeric(4, 1) not null,                   -- el parámetro `temperatura_ruta_max_c` del momento
  excede boolean not null,
  lecturas_sobre_limite integer not null default 0,
  minutos_sobre_limite integer not null default 0,   -- lecturas sobre el límite × intervalo
  primera_excedencia timestamp,
  coincide_con_cierre boolean,                       -- null si la ruta todavía no estaba cerrada al importar
  cierre_min numeric(4, 1),
  cierre_max numeric(4, 1),
  dentro_de_fecha_ruta boolean not null,
  importado_por uuid not null,
  importado_en timestamptz not null default now(),
  vigente boolean not null default true,
  check (temp_min <= temp_max),
  check (primera_lectura <= ultima_lectura)
);
alter table wms.ruta_logger_importes enable row level security;
create unique index if not exists ruta_logger_importes_vigente_uk on wms.ruta_logger_importes (ruta_id) where vigente;
create index if not exists ruta_logger_importes_ruta_idx on wms.ruta_logger_importes (ruta_id, importado_en desc);

create table if not exists wms.ruta_logger_lecturas (
  id bigint generated always as identity primary key,
  importe_id uuid not null references wms.ruta_logger_importes(id),
  momento timestamp not null,
  temperatura numeric(4, 1) not null,
  humedad numeric(4, 1),
  unique (importe_id, momento)
);
alter table wms.ruta_logger_lecturas enable row level security;

create or replace function wms._logger_lecturas_inmutables() returns trigger language plpgsql as $$
begin raise exception 'Las lecturas del data logger no se editan ni se borran: se importa de nuevo y la versión anterior queda' using errcode = 'P0001'; end $$;

do $$ declare t text; begin
  foreach t in array array['ruta_logger_importes', 'ruta_logger_lecturas'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then execute format('drop policy lectura on wms.%I', t); end if;
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
    execute format('revoke all on wms.%I from anon, authenticated', t);
    execute format('grant select on wms.%I to authenticated', t);
  end loop;
  if exists (select 1 from pg_trigger where tgname = 'ruta_logger_importes_inmutable' and tgrelid = 'wms.ruta_logger_importes'::regclass and not tgisinternal) then
    drop trigger ruta_logger_importes_inmutable on wms.ruta_logger_importes;
  end if;
  create trigger ruta_logger_importes_inmutable before update or delete on wms.ruta_logger_importes for each row execute function wms._ls_fr_versionado_inmutable();
  if exists (select 1 from pg_trigger where tgname = 'ruta_logger_lecturas_inmutable' and tgrelid = 'wms.ruta_logger_lecturas'::regclass and not tgisinternal) then
    drop trigger ruta_logger_lecturas_inmutable on wms.ruta_logger_lecturas;
  end if;
  create trigger ruta_logger_lecturas_inmutable before update or delete on wms.ruta_logger_lecturas for each row execute function wms._logger_lecturas_inmutables();
end $$;

-- El límite vigente (parámetro). Sin dato o con texto raro, 24.9.
create or replace function wms._limite_temperatura_ruta() returns numeric
language sql stable security definer set search_path = wms, pg_temp as $$
  select coalesce((select case when valor ~ '^-?\d+(\.\d+)?$' then valor::numeric end from wms.parametros where clave = 'temperatura_ruta_max_c'), 24.9)
$$;

-- La alerta de temperatura de una ruta: una sola abierta por ruta (la clave evita duplicarla), para Dirección Técnica y para el Jefe de Transporte.
create or replace function wms._alertar_temperatura_ruta(p_ruta uuid, p_maxima numeric, p_origen text, p_minutos integer default null) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas; v_lim numeric := wms._limite_temperatura_ruta(); v_msg text; v_rol text;
begin
  select * into r from wms.rutas where id = p_ruta;
  if not found then return; end if;
  v_msg := format('Ruta %s: %s marca una temperatura máxima de %s °C, sobre el límite de %s °C%s. Dirección Técnica decide qué se hace con la mercadería.',
                  r.numero, p_origen, replace(trim_scale(p_maxima)::text, '.', ','), replace(trim_scale(v_lim)::text, '.', ','),
                  case when p_minutos is not null and p_minutos > 0 then format(' (estuvo %s min por encima)', p_minutos) else '' end);
  foreach v_rol in array array['direccion_tecnica', 'jefe_transporte'] loop
    perform wms._alertar('TEMPERATURA', v_rol, null, null, 'temp-ruta:' || p_ruta || ':' || v_rol, v_msg);
  end loop;
end $$;

-- Al cerrar la ruta (o corregir el cierre): si la máxima que anotó el Jefe de Transporte supera el límite, se alerta. Solo avisa: no bloquea el cierre.
create or replace function wms.trg_cierre_ruta_alerta_temperatura() returns trigger
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if new.temp_max > wms._limite_temperatura_ruta() then perform wms._alertar_temperatura_ruta(new.ruta_id, new.temp_max, 'el cierre'); end if;
  return new;
end $$;

do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'ruta_cierres_alerta_temperatura' and tgrelid = 'wms.ruta_cierres'::regclass and not tgisinternal) then
    drop trigger ruta_cierres_alerta_temperatura on wms.ruta_cierres;
  end if;
  create trigger ruta_cierres_alerta_temperatura after insert on wms.ruta_cierres for each row execute function wms.trg_cierre_ruta_alerta_temperatura();
end $$;

-- Guarda las lecturas leídas del informe del data logger (la aplicación ya extrajo el PDF o el CSV). La base recalcula todo desde las lecturas: mínima, máxima, promedio y minutos sobre el
-- límite. Cruza con el cierre vigente de la ruta (misma mínima y máxima, con 0,1 °C de tolerancia) y con la fecha de la ruta. Si la máxima supera el límite, alerta.
-- Se puede importar desde que la unidad salió; una importación nueva reemplaza a la vigente y la anterior queda. Lo hace quien cierra rutas (Jefe de Transporte).
create or replace function wms.registrar_lecturas_logger(
  p_ruta uuid, p_archivo_nombre text, p_archivo_hash text, p_formato text, p_modelo text, p_serie text,
  p_intervalo_min integer, p_umbral_alto numeric, p_umbral_bajo numeric, p_lecturas jsonb, p_archivo_ref text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  r wms.rutas; c wms.ruta_cierres; v_id uuid := gen_random_uuid(); v_lim numeric := wms._limite_temperatura_ruta();
  v_n integer; v_malas integer; v_min numeric; v_max numeric; v_prom numeric; v_desde timestamp; v_hasta timestamp;
  v_sobre integer; v_distintas integer; v_primera timestamp; v_int integer; v_coincide boolean; v_dentro boolean;
begin
  perform wms._exigir_accion('cerrar_ruta', 'Solo el Jefe de Transporte importa las lecturas del data logger');
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if r.estado not in ('EN_RUTA', 'PENDIENTE_CIERRE', 'CERRADA') then
    raise exception 'La ruta todavía no salió (está %): el data logger se lee cuando la unidad ya salió', lower(replace(r.estado, '_', ' ')) using errcode = 'P0001';
  end if;
  if p_formato is null or p_formato not in ('PDF', 'CSV') then raise exception 'El informe del data logger tiene que ser un PDF o un CSV' using errcode = 'P0001'; end if;
  if nullif(btrim(coalesce(p_archivo_nombre, '')), '') is null or p_archivo_hash is null or p_archivo_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Falta el archivo del data logger' using errcode = 'P0001';
  end if;
  if p_lecturas is null or jsonb_typeof(p_lecturas) <> 'array' or jsonb_array_length(p_lecturas) = 0 then
    raise exception 'No encontramos lecturas en el archivo del data logger' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_lecturas) > 20000 then raise exception 'El archivo trae más de 20.000 lecturas: revisa que sea el del viaje' using errcode = 'P0001'; end if;
  with l as (select (x->>'t')::timestamp as momento, (x->>'c')::numeric as temperatura from jsonb_array_elements(p_lecturas) x)
  select count(*), count(*) filter (where temperatura < -50 or temperatura > 80 or momento is null), min(temperatura), max(temperatura), avg(temperatura), min(momento), max(momento),
         count(distinct momento), count(*) filter (where temperatura > v_lim), min(momento) filter (where temperatura > v_lim)
    into v_n, v_malas, v_min, v_max, v_prom, v_desde, v_hasta, v_distintas, v_sobre, v_primera from l;
  if v_malas > 0 then raise exception 'Hay % lecturas con una temperatura imposible (entre -50 y 80 °C) o sin hora: revisa el archivo', v_malas using errcode = 'P0001'; end if;
  if v_distintas <> v_n then raise exception 'El archivo repite horas de lectura: revisa que sea un solo informe' using errcode = 'P0001'; end if;
  v_int := coalesce(p_intervalo_min, 5);
  v_dentro := r.fecha between v_desde::date and v_hasta::date;
  select * into c from wms.ruta_cierres where ruta_id = p_ruta and vigente;
  if found then v_coincide := abs(c.temp_min - round(v_min, 1)) <= 0.1 and abs(c.temp_max - round(v_max, 1)) <= 0.1; end if;
  update wms.ruta_logger_importes set vigente = false where ruta_id = p_ruta and vigente;
  insert into wms.ruta_logger_importes (id, ruta_id, archivo_nombre, archivo_hash, archivo_ref, formato, modelo, serie, intervalo_min, umbral_alto, umbral_bajo, primera_lectura, ultima_lectura, puntos,
    temp_min, temp_max, temp_prom, limite_c, excede, lecturas_sobre_limite, minutos_sobre_limite, primera_excedencia, coincide_con_cierre, cierre_min, cierre_max, dentro_de_fecha_ruta, importado_por)
  values (v_id, p_ruta, btrim(p_archivo_nombre), p_archivo_hash, nullif(btrim(coalesce(p_archivo_ref, '')), ''), p_formato, nullif(btrim(coalesce(p_modelo, '')), ''), nullif(btrim(coalesce(p_serie, '')), ''), p_intervalo_min, p_umbral_alto, p_umbral_bajo,
    v_desde, v_hasta, v_n, round(v_min, 1), round(v_max, 1), round(v_prom, 1), v_lim, v_sobre > 0, v_sobre, v_sobre * v_int, v_primera, v_coincide, c.temp_min, c.temp_max, v_dentro, auth.uid());
  insert into wms.ruta_logger_lecturas (importe_id, momento, temperatura, humedad)
  select v_id, (x->>'t')::timestamp, round((x->>'c')::numeric, 1), round(nullif(x->>'h', '')::numeric, 1) from jsonb_array_elements(p_lecturas) x order by 2;
  if v_sobre > 0 then perform wms._alertar_temperatura_ruta(p_ruta, round(v_max, 1), 'el data logger', v_sobre * v_int); end if;
  perform wms.registrar_audit('lecturas_logger_importadas', 'rutas', p_ruta::text, null,
    jsonb_build_object('archivo', p_archivo_nombre, 'puntos', v_n, 'temp_min', round(v_min, 1), 'temp_max', round(v_max, 1), 'excede', v_sobre > 0, 'coincide_con_cierre', v_coincide), null);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function
  wms.registrar_dictamen_cliente(uuid, integer, integer, date, text, text, text, text, text),
  wms.confirmar_dictamen_cliente(uuid),
  wms.registrar_lecturas_logger(uuid, text, text, text, text, text, integer, numeric, numeric, jsonb, text)
  to authenticated;
revoke execute on all functions in schema wms from public;
