-- 0041 · WMS · Piloto PIL-8 (decisión de Sebas, 4-nov-2026): los productos los crea Compras; el WMS los completa
--
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0006, 0038 y 0040 (NO requiere la 0008: esa va al final, en el go-live).
--
--   1. En modo piloto el WMS NO escribe en `catalogo.productos`: `wms.crear_producto` se rechaza y `wms.editar_regulatorio` rechaza presentación y principio
--      activo (se corrigen en Compras). Fuera del piloto (go-live) sigue valiendo D-38: Sandra y Katia los editan desde la ficha del WMS, con historial (0008).
--   2. «Productos por completar»: un producto de Compras sin sus datos regulatorios completos (registro sanitario, su vencimiento, fabricante, forma
--      farmacéutica, concentración y condición de almacenamiento) figura «pendiente de Dirección Técnica» y NO se pueden aprobar lotes suyos:
--      `wms.producto_completo(producto)` y el parche de `wms.validar_movimiento`.

-- Parche por texto (el mismo ayudante de las migraciones 0035, 0040 y 0008). Interno.
create or replace function wms._parchar_funcion(p_nombre text, p_viejo text, p_nuevo text) returns void
language plpgsql set search_path = wms, pg_temp as $$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = p_nombre order by p.oid desc limit 1;
  if v_oid is null then raise exception 'No existe wms.%', p_nombre; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(p_viejo in v_def) = 0 then
    if position(p_nuevo in v_def) > 0 then return; end if;
    raise exception 'No se encontró el texto esperado en wms.%: %', p_nombre, p_viejo;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end $$;

-- ¿Tiene el producto completos sus datos regulatorios? (los seis que se completan en el WMS; la marca «sin material de envase» y los códigos alternativos no bloquean)
create or replace function wms.producto_completo(p_producto uuid) returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select coalesce((select nullif(btrim(pr.registro_sanitario), '') is not null and pr.rs_vence is not null
                          and nullif(btrim(pr.fabricante), '') is not null and nullif(btrim(pr.forma_presentacion), '') is not null
                          and nullif(btrim(pr.concentracion), '') is not null and nullif(btrim(pr.condicion_almacenamiento), '') is not null
                     from wms.producto_regulatorio pr where pr.producto_id = p_producto), false)
$$;

-- Aprobar un lote exige el producto completo (y, como antes, validado y con el registro vigente).
do $$ begin
  if position('producto_completo' in pg_get_functiondef('wms.validar_movimiento(uuid)'::regprocedure)) = 0 then
    perform wms._parchar_funcion('validar_movimiento',
      $q$        if exists (select 1 from wms.producto_regulatorio pr where pr.producto_id = r.producto_id and pr.por_validar) then$q$,
      $q$        if not wms.producto_completo(r.producto_id) then
          raise exception 'El producto está pendiente de Dirección Técnica: faltan sus datos regulatorios. Complétalos en su ficha antes de aprobar sus lotes' using errcode = 'P0001';
        end if;
        if exists (select 1 from wms.producto_regulatorio pr where pr.producto_id = r.producto_id and pr.por_validar) then$q$);
  end if;
end $$;

-- En el piloto, Compras crea los productos: el WMS no escribe en el catálogo.
do $$ declare v_oid oid; begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'crear_producto' order by p.oid desc limit 1;
  if v_oid is not null and position('los productos se crean en Compras' in pg_get_functiondef(v_oid)) = 0 then
    perform wms._parchar_funcion('crear_producto',
      $q$  if nullif(trim(p_codigo), '') is null or nullif(trim(p_descripcion), '') is null then$q$,
      $q$  if coalesce(wms._modo_piloto(), true) then
    raise exception 'En el piloto los productos se crean en Compras: el WMS no escribe en el catálogo. Aquí solo completas sus datos regulatorios' using errcode = 'P0001';
  end if;
  if nullif(trim(p_codigo), '') is null or nullif(trim(p_descripcion), '') is null then$q$);
  end if;
end $$;

-- editar_regulatorio: presentación y principio activo no se tocan en el piloto (se corrigen en Compras).
do $$ begin
  if position('se corrigen en Compras' in pg_get_functiondef('wms.editar_regulatorio(uuid, jsonb, text)'::regprocedure)) = 0 then
    perform wms._parchar_funcion('editar_regulatorio', $q$  perform wms._exigir_regulatorio();$q$,
      $q$  perform wms._exigir_regulatorio();
  if coalesce(wms._modo_piloto(), true) and (coalesce(p_datos, '{}'::jsonb) ? 'presentacion' or coalesce(p_datos, '{}'::jsonb) ? 'principio_activo') then
    raise exception 'En el piloto presentación y principio activo se corrigen en Compras: el WMS no escribe en el catálogo' using errcode = 'P0001';
  end if;$q$);
  end if;
end $$;

-- Permisos de ejecución (default-deny): no se agrega ninguna función a la API; `producto_completo` es interna (la usa validar_movimiento).
revoke execute on all functions in schema wms from public;
