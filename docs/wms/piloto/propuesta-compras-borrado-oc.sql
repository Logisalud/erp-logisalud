-- PROPUESTA PARA COMPRAS — NO SE HA APLICADO EN NINGUNA BASE. La aprueba Sebas; la aplica quien lleva las migraciones de Compras (apps/compras), no el WMS.
--
-- Por qué: hoy `authenticated` tiene DELETE sobre `compras.ordenes_compra` y `compras.ordenes_compra_items` (políticas `for all`) y no hay ningún trigger: cualquier usuario con acceso
-- puede borrar una OC aunque el WMS ya la haya copiado (`wms.oc_versiones`) o ya haya recibido mercadería contra ella. El WMS conserva su copia, pero la OC real desaparecería.
--
-- Qué hace: un trigger BEFORE DELETE en las dos tablas que rechaza el borrado si la OC tiene huella en el WMS (alguna copia en `wms.oc_versiones` o alguna solicitud de ingreso
-- en `wms.solicitudes_ingreso` con su código). Solo deja borrar borradores sin esa huella. Para todo lo demás, Compras ya tiene «anular» (`anulado_*`).
-- Compras lee del WMS solo para esto, a través de una función de seguridad definida; NO muestra nada del WMS en sus pantallas («recibido según almacén» sigue sin existir durante el piloto).
--
-- Re-ejecutable. Si el esquema `wms` aún no existe (antes de la ventana), la función no bloquea nada.

create or replace function compras.tiene_huella_en_wms(p_oc uuid) returns boolean
language plpgsql stable security definer set search_path = compras, pg_temp as $$
declare v_codigo text; v_huella boolean := false;
begin
  if to_regclass('wms.oc_versiones') is null then return false; end if;
  select codigo into v_codigo from compras.ordenes_compra where id = p_oc;
  execute 'select exists (select 1 from wms.oc_versiones where oc_id = $1)' into v_huella using p_oc;
  if not v_huella and v_codigo is not null and to_regclass('wms.solicitudes_ingreso') is not null then
    execute 'select exists (select 1 from wms.solicitudes_ingreso where oc_codigo = $1)' into v_huella using v_codigo;
  end if;
  return v_huella;
end $$;
revoke execute on function compras.tiene_huella_en_wms(uuid) from public;

create or replace function compras.trg_no_borrar_oc_con_huella() returns trigger
language plpgsql as $$
declare v_oc uuid; v_estado text;
begin
  v_oc := case tg_table_name when 'ordenes_compra' then old.id else old.oc_id end;
  select estado into v_estado from compras.ordenes_compra where id = v_oc;
  -- Solo se puede borrar un borrador que el almacén nunca vio. Si el encabezado ya no existe (se borra en cascada), no hay nada que comprobar.
  if v_estado is not null and v_estado <> 'borrador' then
    raise exception 'Esta orden de compra no se borra: ya salió de borrador. Anúlala en su lugar.' using errcode = 'P0001';
  end if;
  if compras.tiene_huella_en_wms(v_oc) then
    raise exception 'Esta orden de compra no se borra: el almacén ya la copió o recibió mercadería contra ella. Anúlala en su lugar.' using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists no_borrar_oc_con_huella on compras.ordenes_compra;
create trigger no_borrar_oc_con_huella before delete on compras.ordenes_compra for each row execute function compras.trg_no_borrar_oc_con_huella();
drop trigger if exists no_borrar_item_oc_con_huella on compras.ordenes_compra_items;
create trigger no_borrar_item_oc_con_huella before delete on compras.ordenes_compra_items for each row execute function compras.trg_no_borrar_oc_con_huella();
