-- 0050 · Código de bonificación (BO…): una sola ficha regulatoria (D-213, decisión de Sebas 2026-11-09).
--
-- Un código «BO…» es el MISMO producto que su código normal, solo que para bonificación. Compras guarda el vínculo en el producto normal (`catalogo.productos.codigo_bonificacion` = el código BO).
-- Los datos regulatorios (registro sanitario, fabricante, forma, concentración, almacenamiento, validación) se completan UNA sola vez, en el producto normal; el BO toma siempre lo del normal.
--
-- Cómo: el BO tiene su fila en `wms.producto_regulatorio` como espejo del normal (así las 17 funciones que la leen —validar_movimiento, producto_completo, las actas…— no cambian). El espejo
-- lo mantiene un trigger (cada vez que cambia la fila del normal) y `wms.sincronizar_bonificaciones()` (cuando Compras liga un BO después, y se llama en cada revisión de las OC).
-- Editar el BO desde la aplicación edita al producto normal (`editar_regulatorio` redirige). El WMS no escribe en el catálogo de Compras.
-- Un BO sin producto normal (o un vínculo roto) sigue como cualquier producto, con su propia ficha. Re-ejecutable.

-- El producto normal de un BO; para cualquier otro producto, él mismo.
create or replace function wms.producto_base_de(p_producto uuid) returns uuid
language sql stable security definer set search_path = wms, catalogo, pg_temp as $$
  select coalesce((select n.id from catalogo.productos b
                     join catalogo.productos n on n.codigo_bonificacion = b.codigo and n.id <> b.id
                    where b.id = p_producto order by n.codigo limit 1), p_producto)
$$;

-- Copia la ficha del producto normal a su BO (si lo tiene y la ficha existe).
create or replace function wms._espejar_bonificacion(p_base uuid) returns void
language plpgsql security definer set search_path = wms, catalogo, pg_temp as $$
declare v_bo uuid;
begin
  select b.id into v_bo from catalogo.productos n
    join catalogo.productos b on b.codigo = nullif(btrim(n.codigo_bonificacion), '') and b.id <> n.id
   where n.id = p_base order by b.codigo limit 1;
  if v_bo is null then return; end if;
  insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, fabricante, forma_presentacion, estado_validacion, observacion, creado_por, creado_en,
                                        validado_por, validado_en, concentracion, condicion_almacenamiento, fabricante_id, por_validar, sin_material_envase)
  select v_bo, registro_sanitario, rs_vence, fabricante, forma_presentacion, estado_validacion, observacion, creado_por, creado_en,
         validado_por, validado_en, concentracion, condicion_almacenamiento, fabricante_id, por_validar, sin_material_envase
    from wms.producto_regulatorio where producto_id = p_base
  on conflict (producto_id) do update set
    registro_sanitario = excluded.registro_sanitario, rs_vence = excluded.rs_vence, fabricante = excluded.fabricante, forma_presentacion = excluded.forma_presentacion,
    estado_validacion = excluded.estado_validacion, observacion = excluded.observacion, validado_por = excluded.validado_por, validado_en = excluded.validado_en,
    concentracion = excluded.concentracion, condicion_almacenamiento = excluded.condicion_almacenamiento, fabricante_id = excluded.fabricante_id,
    por_validar = excluded.por_validar, sin_material_envase = excluded.sin_material_envase;
end $$;

-- Cada vez que cambia la ficha de un producto normal, su BO la copia (el espejo no dispara otro espejo).
create or replace function wms.trg_espejar_bonificacion() returns trigger
language plpgsql security definer set search_path = wms, catalogo, pg_temp as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  perform wms._espejar_bonificacion(new.producto_id);
  return null;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'espejar_bonificacion' and tgrelid = 'wms.producto_regulatorio'::regclass and not tgisinternal) then
    create trigger espejar_bonificacion after insert or update on wms.producto_regulatorio
      for each row execute function wms.trg_espejar_bonificacion();
  end if;
end $$;

-- Pone al día todos los BO (lo que Compras ligó después, o un BO que alguien tocó): siempre manda la ficha del producto normal.
create or replace function wms.sincronizar_bonificaciones() returns integer
language plpgsql security definer set search_path = wms, catalogo, pg_temp as $$
declare r record; n integer := 0;
begin
  for r in select pr.producto_id from wms.producto_regulatorio pr join catalogo.productos p on p.id = pr.producto_id
            where nullif(btrim(p.codigo_bonificacion), '') is not null loop
    perform wms._espejar_bonificacion(r.producto_id); n := n + 1;
  end loop;
  return n;
end $$;

-- Editar los datos de un BO edita los de su producto normal (un solo lugar). Se parcha por texto la función vigente; si ya está parchada no hace nada.
do $$
declare
  v_def text := pg_get_functiondef('wms.editar_regulatorio(uuid, jsonb, text)'::regprocedure);
  v_nuevo text;
begin
  if v_def like '%wms.producto_base_de(p_producto)%' then return; end if;
  v_nuevo := replace(v_def, E'begin\n  perform wms._exigir_regulatorio();', E'begin\n  p_producto := wms.producto_base_de(p_producto);   -- un BO usa la ficha de su producto normal (0050)\n  perform wms._exigir_regulatorio();');
  if v_nuevo = v_def then raise exception 'editar_regulatorio no tiene el arranque esperado: no se parcha'; end if;
  execute v_nuevo;
end $$;

-- En cada revisión de las OC (cada 30 min al abrir Entradas) se ponen al día los BO que Compras haya ligado desde entonces. Un fallo aquí no tumba la revisión.
do $$
declare
  v_def text := pg_get_functiondef('wms.sincronizar_ocs_si_toca(integer)'::regprocedure);
  v_nuevo text;
begin
  if v_def like '%sincronizar_bonificaciones()%' then return; end if;
  v_nuevo := replace(v_def, E'r := wms.sincronizar_ocs_abiertas();', E'r := wms.sincronizar_ocs_abiertas();\n    begin perform wms.sincronizar_bonificaciones(); exception when others then null; end;');
  if v_nuevo = v_def then raise exception 'sincronizar_ocs_si_toca no tiene la llamada esperada: no se parcha'; end if;
  execute v_nuevo;
end $$;

-- Relleno inicial: todos los BO que ya tengan producto normal con ficha.
select wms.sincronizar_bonificaciones();

-- Permisos (default-deny): todo lo nuevo es interno; la aplicación sigue llamando solo a editar_regulatorio.
revoke execute on all functions in schema wms from public;
