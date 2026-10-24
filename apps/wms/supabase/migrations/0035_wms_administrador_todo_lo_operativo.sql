-- 0035 · WMS · SB-E: el Administrador hace todo lo operativo y de configuración (D-196)
--
-- Instrucción de Sebas (24-oct): «todos los permisos operativos y de configuración, incluida la firma de actas como Jefe de Almacén. Todo. Todo.»
-- Sigue reservado a Dirección Técnica (instrucción anterior, no cambia): APROBAR, DAR DE BAJA, AUTORIZAR AJUSTES y VALIDAR PRODUCTO (y lo que es lo mismo
-- que aprobar: el dictamen de un cliente, las observaciones de un acta de cliente, los antecedentes de calidad y liberar el stock de un propietario).
-- Las invariantes valen para todos: nunca negativo, Aprobado nunca vuelve a Cuarentena, actas firmadas inmutables y dos personas POR PERSONA.
--
--   1. Firma de actas como Jefe de Almacén: ya la tenía (`tiene_rol` lo cuenta como Jefe de Almacén desde la 0034); aquí solo se prueba.
--   2. Solicitudes de ingreso (preparar, ajustar, autorizar, anular), cierre de expediente, llenado del acta organoléptica y autorización de un retorno: la base ya
--      aceptaba solo a Sandra y a Dirección Técnica. Ahora acepta también al Administrador. LA DECISIÓN del acta organoléptica (Aprobado o Bajas) sigue siendo solo de DT.
--   3. Documentos (registro sanitario, BPM, COA, fabricantes, perfiles): el Administrador recibe `gestionar_documentos_regulatorios` (la 0034 lo había dejado fuera). Subir o
--      reemplazar un documento no decide nada sanitario: queda auditado, con su motivo.
--   4. Productos y maestros: el Administrador da de alta productos y edita sus datos. Un producto que NO crea Dirección Técnica ni su asistente nace «PENDIENTE de validar»:
--      queda marcado `por_validar` y `validar_movimiento` no aprueba lotes de un producto marcado: nada se aprueba hasta que Dirección Técnica (o su asistente, como ya pasaba) lo valida con
--      `wms.validar_producto`. Si el Administrador edita los datos regulatorios de un producto ya validado, vuelve a «PENDIENTE» (hay que validarlo de nuevo).
--   5. Alertas: el Administrador atiende las que son de la asistente de Dirección Técnica (las puede resolver ahora); las de Dirección Técnica siguen siendo suyas.
--
-- Sigue sin ser del Administrador (nota en D-196): corregir el vencimiento de un lote (sin pantalla; solo DT), evaluar una baja (el insumo de la decisión de DT),
-- confirmar la carga inicial (segunda persona) y todo lo de la lista sanitaria.
-- Requiere 0034. Re-ejecutable. Se aplica a mano (nunca al mergear). Termina con el `revoke execute … from public`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Marca «por validar» y ayudante
-- ─────────────────────────────────────────────────────────────────────────────

-- D-37 quitó la validación aparte: aprobar pide solo el registro sanitario y su vencimiento cargados. Para que el Administrador pueda dar de alta y editar sin decidir
-- lo sanitario, el producto que él toca queda MARCADO «por validar» y `validar_movimiento` no aprueba lotes de un producto marcado. Es una columna aparte (y no el estado
-- `PENDIENTE`) para no bloquear productos viejos cuyo estado nunca se usó.
alter table wms.producto_regulatorio add column if not exists por_validar boolean not null default false;

-- Ayudante: ¿quien llama valida productos? (Dirección Técnica y su asistente; el Administrador NO)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._puede_validar() returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select wms.tiene_rol('asistente_dt', 'direccion_tecnica')
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Parche por texto: se cambia el texto exacto de cada función y, si no está, falla en voz alta (re-ejecutable: si ya está el texto nuevo, sigue)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._parchar_funcion(p_nombre text, p_viejo text, p_nuevo text) returns void
language plpgsql set search_path = wms, pg_temp as $$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = p_nombre order by p.oid desc limit 1;
  if v_oid is null then raise exception 'No existe wms.%', p_nombre; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(p_viejo in v_def) = 0 then
    if position(p_nuevo in v_def) > 0 then return; end if;   -- ya aplicado
    raise exception 'No se encontró el texto esperado en wms.%: %', p_nombre, p_viejo;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end $$;

-- 2. Solicitudes de ingreso y expediente, acta organoléptica (llenarla), retorno (autorizarlo)
do $$ begin
  perform wms._parchar_funcion('_exigir_preparar', $q$wms.tiene_rol('asistente_dt', 'direccion_tecnica')$q$, $q$wms.tiene_rol('asistente_dt', 'direccion_tecnica', 'admin_wms')$q$);
  perform wms._parchar_funcion('_exigir_preparar', $q$Sandra (Asistente de Dirección Técnica) o Dirección Técnica preparan$q$, $q$Sandra (Asistente de Dirección Técnica), Dirección Técnica o el Administrador preparan$q$);
  perform wms._parchar_funcion('cerrar_expediente', $q$wms.tiene_rol('asistente_dt', 'direccion_tecnica')$q$, $q$wms.tiene_rol('asistente_dt', 'direccion_tecnica', 'admin_wms')$q$);
  perform wms._parchar_funcion('guardar_acta_organoleptica', $q$wms.tiene_rol('asistente_dt', 'direccion_tecnica')$q$, $q$wms.tiene_rol('asistente_dt', 'direccion_tecnica', 'admin_wms')$q$);
  perform wms._parchar_funcion('crear_retorno', $q$p_autorizar and wms.tiene_rol('asistente_dt', 'direccion_tecnica')$q$, $q$p_autorizar and wms.tiene_rol('asistente_dt', 'direccion_tecnica', 'admin_wms')$q$);
  -- Las alertas de la asistente las puede atender el Administrador (las de Dirección Técnica siguen siendo de DT).
  perform wms._parchar_funcion('atender_alerta', $q$if not wms.tiene_rol(a.destinatario_rol, 'direccion_tecnica') then$q$,
    $q$if not (wms.tiene_rol(a.destinatario_rol, 'direccion_tecnica') or (a.destinatario_rol = 'asistente_dt' and wms.tiene_rol('admin_wms'))) then$q$);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Productos: el Administrador los da de alta y los edita; DT (o su asistente) los valida
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  perform wms._parchar_funcion('_exigir_regulatorio', $q$wms.tiene_rol('asistente_dt', 'direccion_tecnica')$q$, $q$wms.tiene_rol('asistente_dt', 'direccion_tecnica', 'admin_wms')$q$);
  perform wms._parchar_funcion('_exigir_regulatorio', $q$Solo Dirección Técnica y su asistente editan los datos regulatorios$q$, $q$Solo Dirección Técnica, su asistente y el Administrador editan los datos regulatorios$q$);

  -- Alta: nace validado solo si la hace quien valida; si la hace el Administrador, nace PENDIENTE.
  perform wms._parchar_funcion('crear_producto', $q$creado_por, estado_validacion, validado_por, validado_en)$q$, $q$creado_por, estado_validacion, validado_por, validado_en, por_validar)$q$);
  perform wms._parchar_funcion('crear_producto', $q$auth.uid(), 'VALIDADO', auth.uid(), now());$q$,
    $q$auth.uid(), case when wms._puede_validar() then 'VALIDADO' else 'PENDIENTE' end, case when wms._puede_validar() then auth.uid() end, case when wms._puede_validar() then now() end, not wms._puede_validar());$q$);
  perform wms._parchar_funcion('crear_producto', $q$jsonb_build_object('codigo', trim(p_codigo)), 'Alta del producto');$q$,
    $q$jsonb_build_object('codigo', trim(p_codigo), 'validado', wms._puede_validar()), 'Alta del producto');$q$);

  -- Edición: la valida quien valida; si edita el Administrador y cambia algo, el producto queda PENDIENTE hasta que DT lo valide.
  perform wms._parchar_funcion('editar_regulatorio', $q$creado_por, estado_validacion, validado_por, validado_en)$q$, $q$creado_por, estado_validacion, validado_por, validado_en, por_validar)$q$);
  perform wms._parchar_funcion('editar_regulatorio', $q$values (p_producto, auth.uid(), 'VALIDADO', auth.uid(), now())$q$,
    $q$values (p_producto, auth.uid(), case when wms._puede_validar() then 'VALIDADO' else 'PENDIENTE' end, case when wms._puede_validar() then auth.uid() end, case when wms._puede_validar() then now() end, not wms._puede_validar())$q$);
  perform wms._parchar_funcion('editar_regulatorio', $q$set estado_validacion = 'VALIDADO', observacion = null, validado_por = auth.uid(), validado_en = now()$q$,
    $q$set estado_validacion = case when wms._puede_validar() then 'VALIDADO' when v_n > 0 then 'PENDIENTE' else estado_validacion end,
         observacion = case when wms._puede_validar() or v_n > 0 then null else observacion end,
         validado_por = case when wms._puede_validar() then auth.uid() when v_n > 0 then null else validado_por end,
         validado_en = case when wms._puede_validar() then now() when v_n > 0 then null else validado_en end,
         por_validar = case when wms._puede_validar() then false when v_n > 0 then true else por_validar end$q$);

  -- Un lote de un producto por validar no se aprueba (la base lo impide a todos, también a Dirección Técnica: primero se valida el producto).
  perform wms._parchar_funcion('validar_movimiento', $q$if r.hasta = 'APROBADO' then$q$,
    $q$if r.hasta = 'APROBADO' then
        if exists (select 1 from wms.producto_regulatorio pr where pr.producto_id = r.producto_id and pr.por_validar) then
          raise exception 'El producto no está validado: Dirección Técnica debe validarlo antes de aprobar sus lotes' using errcode = 'P0001';
        end if;$q$);
end $$;

-- Validar un producto: solo Dirección Técnica o su asistente (el Administrador no). Hacen falta el registro sanitario y su vencimiento.
create or replace function wms.validar_producto(p_producto uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v wms.producto_regulatorio;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms._puede_validar() then
    raise exception 'Solo Dirección Técnica o su asistente validan productos' using errcode = '42501';
  end if;
  select * into v from wms.producto_regulatorio where producto_id = p_producto for update;
  if not found then raise exception 'El producto no tiene datos regulatorios cargados' using errcode = 'P0001'; end if;
  if v.estado_validacion = 'VALIDADO' and not v.por_validar then return; end if;
  if nullif(trim(v.registro_sanitario), '') is null or v.rs_vence is null then
    raise exception 'Para validar hacen falta el registro sanitario y su vencimiento' using errcode = 'P0001';
  end if;
  update wms.producto_regulatorio set estado_validacion = 'VALIDADO', por_validar = false, observacion = null, validado_por = auth.uid(), validado_en = now() where producto_id = p_producto;
  perform wms.registrar_audit('producto_validado', 'producto_regulatorio', p_producto::text, jsonb_build_object('estado', v.estado_validacion, 'creado_por', v.creado_por),
    jsonb_build_object('estado', 'VALIDADO'), null);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Documentos: el Administrador gestiona los documentos regulatorios (los sube, reemplaza y asigna). Ya no es una decisión sanitaria reservada.
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.permisos_rol (rol, accion) values ('admin_wms', 'gestionar_documentos_regulatorios') on conflict (rol, accion) do nothing;

-- Los permisos sanitarios siguen sin tocarse desde la aplicación; `gestionar_documentos_regulatorios` sale de la lista (es del Administrador y de DT).
create or replace function wms.trg_guardia_permisos_rol() returns trigger
language plpgsql as $$
declare v_accion text := coalesce(new.accion, old.accion);
begin
  if current_user = 'authenticated'
     and v_accion = any (array['aprobar', 'ajustar', 'autorizar_baja', 'registrar_dictamen_cliente', 'marcar_antecedentes_calidad', 'liberar_stock_propietario']) then
    raise exception 'Los permisos de decisiones sanitarias (%) no se cambian desde la aplicación: solo Dirección Técnica las firma y se ajustan con una migración', v_accion using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if to_regprocedure('wms._parchar_funcion(text, text, text)') is not null then drop function wms._parchar_funcion(text, text, text); end if;
end $$;
grant execute on function wms.validar_producto(uuid), wms.tiene_rol(text[]) to authenticated;
revoke execute on all functions in schema wms from public;
