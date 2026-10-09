-- WMS Logisalud — migración 0008 (D-38): presentación y principio activo.
--
-- Viven SOLO en catalogo.productos. Compras (y DT/admin) los llena al CREAR un producto; una vez creado, solo Katia y Sandra
-- los editan, desde el WMS, con el mismo historial que los demás datos regulatorios (campo, antes, después, usuario, fecha, motivo).
--
-- NO SE APLICA SOLA: se aplica a mano junto con el resto de la salida a producción (docs/wms/plan-aplicacion-produccion.md).
-- Re-ejecutable. Aditiva: no cambia policies, grants ni columnas de Compras; solo agrega un trigger a catalogo.productos.
-- Sin `drop … if exists`: las comprobaciones de existencia son explícitas.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trigger de protección: una sesión de aplicación (rol `authenticated`/`anon`) no cambia esos dos campos.
--    No se bloquea INSERT, ni el resto de columnas, ni las cargas por migración o importación (postgres / service_role),
--    ni `wms.editar_regulatorio` (security definer: corre con el rol dueño de la función, no como `authenticated`).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function wms.trg_proteger_presentacion_principio() returns trigger
language plpgsql set search_path = wms, pg_temp as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.presentacion is distinct from old.presentacion or new.principio_activo is distinct from old.principio_activo) then
    raise exception 'Presentación y principio activo los edita Dirección Técnica desde el WMS' using errcode = '42501';
  end if;
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'proteger_presentacion_principio' and tgrelid = 'catalogo.productos'::regclass) then
    create trigger proteger_presentacion_principio before update of presentacion, principio_activo on catalogo.productos
      for each row execute function wms.trg_proteger_presentacion_principio();
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. editar_regulatorio acepta presentacion y principio_activo (viven en catalogo.productos) con el mismo historial.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function wms.editar_regulatorio(p_producto uuid, p_datos jsonb, p_motivo text)
returns integer language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v wms.producto_regulatorio;
  k text;
  v_antes text;
  v_despues text;
  v_n integer := 0;
  v_campos text[] := array['registro_sanitario', 'rs_vence', 'forma_presentacion', 'concentracion', 'fabricante', 'condicion_almacenamiento'];
  v_catalogo text[] := array['presentacion', 'principio_activo'];
begin
  perform wms._exigir_regulatorio();
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Todo cambio de datos regulatorios necesita su motivo' using errcode = 'P0001';
  end if;
  if not exists (select 1 from catalogo.productos where id = p_producto) then
    raise exception 'El producto no existe en el catálogo' using errcode = 'P0001';
  end if;
  for k in select jsonb_object_keys(coalesce(p_datos, '{}'::jsonb)) loop
    if not (k = any (v_campos) or k = any (v_catalogo)) then
      raise exception 'Ese dato no se edita aquí: %', k using errcode = 'P0001';
    end if;
  end loop;
  insert into wms.producto_regulatorio (producto_id, creado_por, estado_validacion, validado_por, validado_en)
  values (p_producto, auth.uid(), 'VALIDADO', auth.uid(), now())
  on conflict (producto_id) do nothing;
  select * into v from wms.producto_regulatorio where producto_id = p_producto for update;
  foreach k in array v_campos || v_catalogo loop
    if not (p_datos ? k) then continue; end if;
    v_despues := nullif(trim(p_datos->>k), '');
    if k = any (v_catalogo) then
      execute format('select %I::text from catalogo.productos where id = $1', k) into v_antes using p_producto;
    else
      execute format('select %I::text from wms.producto_regulatorio where producto_id = $1', k) into v_antes using p_producto;
    end if;
    if v_antes is not distinct from v_despues then continue; end if;
    if k = any (v_catalogo) then
      execute format('update catalogo.productos set %I = $1 where id = $2', k) using v_despues, p_producto;
    elsif k = 'rs_vence' then
      execute 'update wms.producto_regulatorio set rs_vence = $1::date where producto_id = $2' using v_despues, p_producto;
    else
      execute format('update wms.producto_regulatorio set %I = $1 where producto_id = $2', k) using v_despues, p_producto;
    end if;
    insert into wms.producto_regulatorio_cambios (producto_id, campo, antes, despues, usuario, motivo)
    values (p_producto, k, v_antes, v_despues, auth.uid(), trim(p_motivo));
    v_n := v_n + 1;
  end loop;
  select * into v from wms.producto_regulatorio where producto_id = p_producto;
  if nullif(trim(v.registro_sanitario), '') is not null and v.rs_vence is null then
    raise exception 'Falta el vencimiento del registro sanitario' using errcode = 'P0001';
  end if;
  update wms.producto_regulatorio set estado_validacion = 'VALIDADO', observacion = null, validado_por = auth.uid(), validado_en = now()
   where producto_id = p_producto;
  if v_n > 0 then
    perform wms.registrar_audit('regulatorio_editado', 'producto_regulatorio', p_producto::text, null, p_datos, p_motivo);
  end if;
  return v_n;
end $$;

grant execute on function wms.editar_regulatorio(uuid, jsonb, text) to authenticated;
