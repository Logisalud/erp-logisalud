-- 0034 · WMS · Salidas · SB-D: motivos de traslado validados, baja de la guía después de la salida, plazo de la factura (informativo) y el rol Administrador
--
-- Decisiones D-190 a D-195 (docs/wms/decisiones-pendientes.md). La 0033 es de SB-C: esta migración no depende de ella.
--   1. Motivo de traslado (D-190). Los valores ya los parametrizó la 0032 (`guia_motivo_codigo_venta` 01, `_devolucion` 06 DEVOLUCION, `_muestra` 13 OTROS). Aquí solo se VALIDAN:
--      el código son 2 números (Catálogo 20 de SUNAT) y la descripción de «otros» lleva entre 1 y 70 caracteres (límite de `motivo_de_traslado_otros_descripcion` en Nubefact).
--      Se suma `guia_motivo_codigo_retorno` (13 OTROS; el retorno de un rechazo). No hay valores duplicados: se ajusta lo que ya existe.
--   2. Dar de baja una guía después de la salida (D-191). SUNAT no fija plazo (a confirmar con la contadora), así que el WMS NO bloquea tras la salida. `anular_guia` con el caso 3
--      («la guía ya salió») marca la guía como anulada SIN tocar el stock (la salida sigue confirmada), avisa a Pedidos (GUIA_ANULADA) y la orden queda «guía anulada, falta guía
--      vigente»: `registrar_gre` y `registrar_guia_electronica` aceptan entonces una guía nueva en una salida CONFIRMADA (solo si ya tuvo una guía y ninguna está vigente). Los casos 1 y 2
--      siguen siendo solo antes de la salida. La baja ante SUNAT se hace en el panel de Nubefact (`baja_sunat` queda PENDIENTE hasta que se verifique).
--   3. Factura (D-192): `factura_anulacion_directa_dias` = 7, dato INFORMATIVO para Pedidos que viaja en el aviso GUIA_ANULADA. El WMS no toca la factura.
--   4. Rol Administrador (D-194): el rol `admin_wms` (Sebastián y Andrés) pasa a tener todos los permisos operativos y de configuración. NO firma decisiones sanitarias (aprobar,
--      ajustar, autorizar bajas, dictamen del cliente, antecedentes de calidad, registro sanitario y BPM): esos permisos nunca se le dan, y los triggers de esta migración impiden
--      dárselos (ni a nadie) desde la aplicación o darse el rol de Dirección Técnica. Para las funciones que preguntan por rol, `tiene_rol` lo cuenta como Jefe de Almacén / de Transporte /
--      auxiliar; nunca como Dirección Técnica ni como su asistente. Las invariantes (nunca negativo, Aprobado nunca vuelve a Cuarentena, actas firmadas inmutables, dos personas POR PERSONA) no
--      miran el rol. La configuración que edita el Administrador queda en la auditoría (`audit_respaldo` en parámetros, permisos y transiciones).
-- Requiere 0032. Re-ejecutable. Se aplica a mano (nunca al mergear). Termina con el `revoke execute … from public`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Parámetros nuevos y su validación
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.parametros (clave, valor, nota) values
  ('guia_motivo_codigo_retorno', '13', 'Código del motivo de traslado del retorno de un rechazo: 13 = OTROS (lo indicó Sebas); va con `guia_motivo_otros_descripcion_retorno` (máximo 70 caracteres).'),
  ('factura_anulacion_directa_dias', '7', 'Dato informativo para Pedidos: una factura se anula directo en Nubefact hasta 7 días después de emitida; pasado el plazo corresponde una nota de crédito. Lo decide Pedidos; el WMS no toca la factura.'),
  ('guia_baja_plazo', 'SIN_PLAZO', 'Plazo para dar de baja una guía: SUNAT no fija uno, así que el WMS no bloquea la baja después de la salida. Pendiente de confirmar con la contadora (D-191).')
on conflict (clave) do nothing;

create or replace function wms.trg_validar_parametro() returns trigger
language plpgsql as $$
declare v text := btrim(coalesce(new.valor, ''));
begin
  if new.clave like 'guia\_motivo\_codigo\_%' and v !~ '^[0-9]{2}$' then
    raise exception 'El código del motivo de traslado son 2 números (Catálogo 20 de SUNAT), por ejemplo 01, 06 o 13' using errcode = 'P0001';
  end if;
  if new.clave like 'guia\_motivo\_otros\_descripcion\_%' then
    if char_length(v) < 1 or char_length(v) > 70 then
      raise exception 'La descripción del motivo «otros» lleva entre 1 y 70 caracteres (Nubefact no acepta más)' using errcode = 'P0001';
    end if;
    new.valor := v;
  end if;
  if new.clave = 'factura_anulacion_directa_dias' and (v !~ '^[0-9]{1,3}$' or v::integer < 1) then
    raise exception 'El plazo de anulación directa de la factura son días enteros, de 1 a 999' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'validar_parametro' and tgrelid = 'wms.parametros'::regclass and not tgisinternal) then
    drop trigger validar_parametro on wms.parametros;
  end if;
end $$;
create trigger validar_parametro before insert or update on wms.parametros
  for each row execute function wms.trg_validar_parametro();

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Baja de la guía después de la salida (caso 3)
-- ─────────────────────────────────────────────────────────────────────────────

-- ¿Se puede registrar una guía NUEVA en una salida que ya salió? Solo si ya tuvo una guía, ninguna está vigente y la salida está confirmada.
create or replace function wms._guia_de_reemplazo_posible(p_salida uuid) returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (select 1 from wms.salidas s where s.id = p_salida and s.estado = 'CONFIRMADA')
     and exists (select 1 from wms.guias_remision g where g.salida_id = p_salida and g.estado = 'ANULADA')
     and not exists (select 1 from wms.guias_remision g where g.salida_id = p_salida and g.estado = 'VIGENTE')
$$;

-- Parche por texto de las dos funciones que registran la guía: «la salida ya no está abierta» no aplica a una guía de reemplazo. Si el texto no está, falla en voz alta.
do $$
declare
  v_viejo text := $q$if s.estado <> 'ABIERTA' then raise exception 'La salida ya no está abierta' using errcode = 'P0001'; end if;$q$;
  v_nuevo text := $q$if s.estado <> 'ABIERTA' and not wms._guia_de_reemplazo_posible(p_salida) then raise exception 'La salida ya no está abierta' using errcode = 'P0001'; end if;$q$;
  v_nombre text; v_oid oid; v_def text;
begin
  foreach v_nombre in array array['registrar_gre', 'registrar_guia_electronica'] loop
    select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = v_nombre order by p.oid desc limit 1;
    v_def := pg_get_functiondef(v_oid);
    if position(v_viejo in v_def) = 0 then
      if position(v_nuevo in v_def) > 0 then continue; end if;   -- ya aplicada (re-ejecución)
      raise exception 'No se encontró el texto esperado en wms.%', v_nombre;
    end if;
    execute replace(v_def, v_viejo, v_nuevo);
  end loop;
end $$;

-- Anular la guía (D-90, D-191): caso 1 (datos del traslado) y caso 2 (contenido) solo ANTES de la salida; caso 3 («la guía ya salió») solo DESPUÉS: no toca el stock.
create or replace function wms.anular_guia(p_guia uuid, p_caso integer, p_motivo text) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare g wms.guias_remision; s wms.salidas; v_mot text := nullif(btrim(coalesce(p_motivo, '')), ''); v_reabierta boolean := false; v_baja text;
begin
  perform wms._exigir_accion('anular_guia', 'Solo el Jefe de Transporte puede anular una guía');
  if p_caso is null or p_caso not in (1, 2, 3) then raise exception 'Elige qué se equivocó: los datos del traslado, el contenido, o la guía ya salió' using errcode = 'P0001'; end if;
  if v_mot is null then raise exception 'Cuenta por qué se anula la guía' using errcode = 'P0001'; end if;
  select * into g from wms.guias_remision where id = p_guia for update;
  if not found then raise exception 'No encontramos esa guía' using errcode = 'P0001'; end if;
  if g.estado = 'ANULADA' then raise exception 'Esa guía ya está anulada' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = g.salida_id for update;
  if s.estado = 'CANCELADA' then raise exception 'La orden está cancelada: no hay nada que anular' using errcode = 'P0001'; end if;
  if p_caso = 3 and s.estado <> 'CONFIRMADA' then
    raise exception 'La orden todavía no salió: elige «me equivoqué en los datos» o «me equivoqué en el contenido»' using errcode = 'P0001';
  end if;
  if p_caso in (1, 2) and s.estado <> 'ABIERTA' then
    raise exception 'La orden ya salió: elige «la guía ya salió». El stock no se toca y se emite una guía nueva' using errcode = 'P0001';
  end if;
  if p_caso = 2 then
    perform wms._reabrir_conformidad(g.salida_id, v_mot);
    v_reabierta := true;
  end if;
  v_baja := case when g.origen = 'NUBEFACT' then 'PENDIENTE' else 'NO_APLICA' end;
  update wms.guias_remision set estado = 'ANULADA', anulada_por = auth.uid(), anulada_en = now(), motivo_anulacion = v_mot, caso_anulacion = p_caso, baja_sunat = v_baja where id = p_guia;
  perform wms._encolar_evento_guia(p_guia, 'GUIA_ANULADA');
  perform wms.registrar_audit('gre_anulada', 'guias_remision', p_guia::text, jsonb_build_object('numero', g.numero),
    jsonb_build_object('caso', p_caso, 'reabierta', v_reabierta, 'baja_sunat', v_baja, 'despues_de_la_salida', s.estado = 'CONFIRMADA', 'stock_sin_cambios', p_caso = 3), v_mot);
  return jsonb_build_object('caso', p_caso, 'conformidad_reabierta', v_reabierta, 'baja_sunat', v_baja);
end $$;

-- El aviso a Pedidos sale igual que en la 0028 y suma dos datos: si la orden ya había salido y el plazo informativo de la factura (D-192).
create or replace function wms._encolar_evento_guia(p_guia uuid, p_tipo text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare g wms.guias_remision; s wms.salidas; v_ped record; v_id uuid := gen_random_uuid(); v_payload jsonb;
  v_dias text := (select valor from wms.parametros where clave = 'factura_anulacion_directa_dias');
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
      'salida_confirmada', s.estado = 'CONFIRMADA', 'falta_guia_vigente', true, 'factura_anulacion_directa_dias', coalesce(nullif(v_dias, '')::integer, 7),
      'aviso', 'El WMS no modifica la factura: Pedidos decide si se anula directo en Nubefact (hasta ' || coalesce(nullif(v_dias, ''), '7') || ' días después de emitida) o si corresponde una nota de crédito');
  end if;
  insert into wms.eventos_pedidos (id, tipo, salida_id, guia_id, pedido_id, payload) values (v_id, p_tipo, s.id, g.id, v_ped.pedido_id, v_payload);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rol Administrador (admin_wms)
-- ─────────────────────────────────────────────────────────────────────────────

-- Todos los permisos operativos y de configuración. NO están: aprobar, ajustar, autorizar_baja, registrar_dictamen_cliente, marcar_antecedentes_calidad,
-- gestionar_documentos_regulatorios (registro sanitario y BPM) ni liberar_stock_propietario: son decisiones sanitarias.
insert into wms.permisos_rol (rol, accion)
select 'admin_wms', a from unnest(array[
  'ver', 'ejecutar', 'verificar', 'configurar', 'exportar', 'auditar', 'dar_conformidad', 'cambiar_lote_asignado', 'imprimir_paquete_documental', 'autorizar_salida_sin_venta',
  'preparar_salidas', 'confirmar_salida', 'planificar_ruta', 'registrar_documentacion', 'embalar', 'cargar_ruta', 'liberar_unidad', 'reservar_lote', 'anular_guia',
  'solicitar_baja', 'cerrar_ruta', 'registrar_ls_fr', 'originar_retorno', 'crear_orden_venta_manual', 'entregar_al_transportista_cliente']) a
on conflict (rol, accion) do nothing;

-- Quien pregunta por rol: el Administrador cuenta como Jefe de Almacén, Jefe de Transporte o auxiliar (lo operativo); nunca como Dirección Técnica ni como su asistente.
create or replace function wms.tiene_rol(variadic p_roles text[])
returns boolean language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (
    select 1 from wms.usuario_roles r
    where r.user_id = auth.uid()
      and r.desde <= current_date
      and (r.hasta is null or r.hasta >= current_date)
      and (r.rol = any (p_roles)
           or (r.rol = 'admin_wms' and p_roles && array['jefe_almacen', 'reemplazo_jefe', 'jefe_transporte', 'auxiliar'])))
$$;

-- Los permisos sanitarios no se tocan desde la aplicación (ni los del Administrador ni los de nadie): solo por migración.
create or replace function wms.trg_guardia_permisos_rol() returns trigger
language plpgsql as $$
declare v_accion text := coalesce(new.accion, old.accion);
begin
  if current_user = 'authenticated'
     and v_accion = any (array['aprobar', 'ajustar', 'autorizar_baja', 'registrar_dictamen_cliente', 'marcar_antecedentes_calidad', 'gestionar_documentos_regulatorios', 'liberar_stock_propietario']) then
    raise exception 'Los permisos de decisiones sanitarias (%) no se cambian desde la aplicación: solo Dirección Técnica las firma y se ajustan con una migración', v_accion using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'guardia_permisos_rol' and tgrelid = 'wms.permisos_rol'::regclass and not tgisinternal) then
    drop trigger guardia_permisos_rol on wms.permisos_rol;
  end if;
end $$;
create trigger guardia_permisos_rol before insert or update or delete on wms.permisos_rol
  for each row execute function wms.trg_guardia_permisos_rol();

-- El rol de Dirección Técnica no se asigna desde la aplicación (el Administrador no se lo da ni se lo da a otra persona): se asigna desde la base.
create or replace function wms.trg_no_dar_direccion_tecnica() returns trigger
language plpgsql as $$
begin
  if current_user = 'authenticated' and new.rol = 'direccion_tecnica' then
    raise exception 'El rol de Dirección Técnica no se asigna desde la aplicación: lo asigna un administrador de la base' using errcode = '42501';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'no_dar_direccion_tecnica' and tgrelid = 'wms.usuario_roles'::regclass and not tgisinternal) then
    drop trigger no_dar_direccion_tecnica on wms.usuario_roles;
  end if;
end $$;
create trigger no_dar_direccion_tecnica before insert or update on wms.usuario_roles
  for each row execute function wms.trg_no_dar_direccion_tecnica();

-- Todo auditado: lo que cambia el Administrador en la configuración queda en la auditoría (quién, antes y después). Lleva su propia clave porque estas tablas no tienen `id`.
create or replace function wms.trg_audit_config() returns trigger
language plpgsql security definer set search_path = wms, pg_temp as $$
declare j jsonb := to_jsonb(coalesce(new, old)); v_id text;
begin
  v_id := case tg_table_name
    when 'parametros' then j->>'clave'
    when 'permisos_rol' then (j->>'rol') || ':' || (j->>'accion')
    when 'transiciones_estado' then (j->>'desde') || '>' || (j->>'hasta')
    when 'area_estado_admitido' then coalesce(j->>'tipo_area', '') || ':' || coalesce(j->>'estado', '')
    else coalesce(j->>'id', j->>'codigo') end;
  insert into wms.audit_events (actor, evento, entidad, entidad_id, antes, despues, motivo)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
          nullif(current_setting('wms.motivo', true), ''));
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['parametros', 'permisos_rol', 'transiciones_estado', 'area_estado_admitido'] loop
    if to_regclass(format('wms.%I', t)) is null then continue; end if;
    if exists (select 1 from pg_trigger where tgname = 'audit_config' and tgrelid = to_regclass(format('wms.%I', t)) and not tgisinternal) then
      execute format('drop trigger audit_config on wms.%I', t);
    end if;
    execute format('create trigger audit_config after insert or update or delete on wms.%I for each row execute function wms.trg_audit_config()', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.anular_guia(uuid, integer, text), wms.tiene_rol(text[]) to authenticated;
revoke execute on all functions in schema wms from public;
