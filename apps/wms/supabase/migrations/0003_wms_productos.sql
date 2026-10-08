-- WMS Logisalud — migración 0003: alta de producto (Sandra) y validación (Katia)
-- como funciones atómicas.
--
-- El maestro de productos es UNO solo (catalogo.productos, de Compras). El WMS
-- no lo modifica en su estructura: agrega el dato regulatorio en wms.producto_regulatorio
-- (1:1). Sandra crea el producto y su registro sanitario; Katia lo valida y la
-- base estampa quién validó y cuándo (no se confía en lo que mande el cliente).
--
-- Escribir en catalogo.productos desde aquí requiere security definer, así que
-- el chequeo de rol es obligatorio dentro de la función.

create or replace function wms.crear_producto(
  p_codigo text,
  p_descripcion text,
  p_presentacion text default null,
  p_marca text default null,
  p_principio_activo text default null,
  p_unidad_medida text default 'UND',
  p_registro_sanitario text default null,
  p_rs_vence date default null,
  p_fabricante text default null,
  p_forma_presentacion text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid;
begin
  if not wms.tiene_rol('asistente_dt', 'direccion_tecnica') then
    raise exception 'Solo Dirección Técnica y su asistente dan de alta productos' using errcode = '42501';
  end if;
  if nullif(trim(p_codigo), '') is null or nullif(trim(p_descripcion), '') is null then
    raise exception 'El producto necesita código y descripción' using errcode = 'P0001';
  end if;
  if exists (select 1 from catalogo.productos where codigo = trim(p_codigo)) then
    raise exception 'Ya existe un producto con el código %', trim(p_codigo) using errcode = '23505';
  end if;
  insert into catalogo.productos (codigo, descripcion, presentacion, marca, principio_activo, unidad_medida)
  values (trim(p_codigo), trim(p_descripcion), nullif(trim(p_presentacion), ''), nullif(trim(p_marca), ''),
          nullif(trim(p_principio_activo), ''), coalesce(nullif(trim(p_unidad_medida), ''), 'UND'))
  returning id into v_id;
  insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, fabricante,
                                        forma_presentacion, creado_por)
  values (v_id, nullif(trim(p_registro_sanitario), ''), p_rs_vence, nullif(trim(p_fabricante), ''),
          nullif(trim(p_forma_presentacion), ''), auth.uid());
  return v_id;
end $$;

-- Katia valida (o devuelve con observación). La base estampa validado_por/en.
create or replace function wms.validar_producto(p_producto uuid, p_decision text, p_observacion text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare v wms.producto_regulatorio;
begin
  if not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica valida productos' using errcode = '42501';
  end if;
  if p_decision not in ('VALIDADO', 'OBSERVADO') then
    raise exception 'Decisión inválida: %', p_decision using errcode = 'P0001';
  end if;
  select * into v from wms.producto_regulatorio where producto_id = p_producto;
  if not found then
    raise exception 'El producto no tiene datos regulatorios cargados' using errcode = 'P0001';
  end if;
  if p_decision = 'VALIDADO' and (v.registro_sanitario is null or v.rs_vence is null) then
    raise exception 'Para validar hacen falta el registro sanitario y su vencimiento' using errcode = 'P0001';
  end if;
  if p_decision = 'OBSERVADO' and nullif(trim(p_observacion), '') is null then
    raise exception 'Al observar un producto hay que decir qué falta o qué está mal' using errcode = 'P0001';
  end if;
  update wms.producto_regulatorio
     set estado_validacion = p_decision,
         observacion = nullif(trim(p_observacion), ''),
         validado_por = case when p_decision = 'VALIDADO' then auth.uid() end,
         validado_en = case when p_decision = 'VALIDADO' then now() end
   where producto_id = p_producto;
  perform wms.registrar_audit('producto_' || lower(p_decision), 'producto_regulatorio', p_producto::text,
                              to_jsonb(v), null, p_observacion);
end $$;

-- Sandra corrige lo suyo mientras no esté validado (o tras una observación).
create or replace function wms.actualizar_regulatorio(
  p_producto uuid,
  p_registro_sanitario text,
  p_rs_vence date,
  p_fabricante text default null,
  p_forma_presentacion text default null)
returns void language plpgsql security definer set search_path = wms, pg_temp as $$
declare v wms.producto_regulatorio;
begin
  if not wms.tiene_rol('asistente_dt', 'direccion_tecnica') then
    raise exception 'Solo Dirección Técnica y su asistente editan datos regulatorios' using errcode = '42501';
  end if;
  select * into v from wms.producto_regulatorio where producto_id = p_producto;
  if not found then raise exception 'El producto no tiene datos regulatorios cargados' using errcode = 'P0001'; end if;
  if v.estado_validacion = 'VALIDADO' and not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Lo validado solo lo cambia Dirección Técnica' using errcode = '42501';
  end if;
  -- Cambiar el registro sanitario o su vencimiento de algo validado exige validar de nuevo.
  update wms.producto_regulatorio
     set registro_sanitario = nullif(trim(p_registro_sanitario), ''), rs_vence = p_rs_vence,
         fabricante = nullif(trim(p_fabricante), ''), forma_presentacion = nullif(trim(p_forma_presentacion), ''),
         estado_validacion = 'PENDIENTE', observacion = null, validado_por = null, validado_en = null
   where producto_id = p_producto;
end $$;

grant execute on function
  wms.crear_producto(text, text, text, text, text, text, text, date, text, text),
  wms.validar_producto(uuid, text, text),
  wms.actualizar_regulatorio(uuid, text, date, text, text) to authenticated;
