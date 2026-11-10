-- WMS Logisalud — migración 0008 (D-38): presentación y principio activo.
--
-- Viven SOLO en catalogo.productos. Compras (y DT/admin) los llena al CREAR un producto; una vez creado, solo Katia y Sandra
-- los editan, desde el WMS, con el mismo historial que los demás datos regulatorios (campo, antes, después, usuario, fecha, motivo).
--
-- NO SE APLICA SOLA. DECISIÓN DE SEBAS (4-nov-2026): la 0008 NO va en la ventana del piloto; se aplica AL FINAL, en el go-live, después de todas las demás
-- (docs/wms/aplicar-migraciones.md). Por eso la parte que cambia `editar_regulatorio` ya no reemplaza la función entera (borraría lo que las migraciones
-- 0035, 0040 y 0041 le agregaron): la PARCHA por texto, y es re-aplicable aunque ya se haya parchado. Aplicada en el orden de siempre (antes de la 0035) también funciona.
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
--    Se PARCHA la función que exista (la de la 0006, o la que ya tengan las migraciones posteriores); nunca se reemplaza entera.
-- ─────────────────────────────────────────────────────────────────────────────

-- Parche por texto (el mismo ayudante de las migraciones 0035, 0040 y 0041): falla en voz alta si el texto esperado no está.
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

do $$ begin
  -- Ya parchada (por esta misma migración): no se toca de nuevo.
  if position('v_catalogo' in pg_get_functiondef('wms.editar_regulatorio(uuid, jsonb, text)'::regprocedure)) = 0 then
    perform wms._parchar_funcion('editar_regulatorio', $q$  v_n integer := 0;$q$,
      $q$  v_n integer := 0;
  v_catalogo text[] := array['presentacion', 'principio_activo'];$q$);
    perform wms._parchar_funcion('editar_regulatorio', $q$foreach k in array v_campos loop$q$, $q$foreach k in array v_campos || v_catalogo loop$q$);
    perform wms._parchar_funcion('editar_regulatorio', $q$if not (k = any (v_campos)) then$q$, $q$if not (k = any (v_campos) or k = any (v_catalogo)) then$q$);
    -- Lo del catálogo se procesa aparte y sigue con el campo siguiente: antes/después, historial y la escritura en catalogo.productos (solo fuera del piloto).
    perform wms._parchar_funcion('editar_regulatorio', $q$    v_despues := nullif(trim(p_datos->>k), '');$q$,
      $q$    v_despues := nullif(trim(p_datos->>k), '');
    if k = any (v_catalogo) then
      if coalesce(wms._modo_piloto(), true) then
        raise exception 'En el piloto presentación y principio activo se corrigen en Compras: el WMS no escribe en el catálogo' using errcode = 'P0001';
      end if;
      execute format('select %I::text from catalogo.productos where id = $1', k) into v_antes using p_producto;
      if v_antes is distinct from v_despues then
        execute format('update catalogo.productos set %I = $1 where id = $2', k) using v_despues, p_producto;
        insert into wms.producto_regulatorio_cambios (producto_id, campo, antes, despues, usuario, motivo)
        values (p_producto, k, v_antes, v_despues, auth.uid(), trim(p_motivo));
        v_n := v_n + 1;
      end if;
      continue;
    end if;$q$);
  end if;
end $$;

grant execute on function wms.editar_regulatorio(uuid, jsonb, text) to authenticated;
revoke execute on all functions in schema wms from public;
