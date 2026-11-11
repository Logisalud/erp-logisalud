-- 0051 · La lista de órdenes de compra del WMS muestra y busca por la FECHA de la OC (Sebas, 2026-11-09): ayuda a encontrar la OC que se quiere recepcionar.
--
-- Las dos vistas de lectura de Compras (`wms.v_oc_lineas` y `wms.v_oc_items`, 0005) ganan dos columnas AL FINAL: `fecha_emision` y `fecha_entrega_estimada` (de `compras.ordenes_compra`).
-- Aditivo y solo lectura: no cambia ninguna columna existente, y las funciones del WMS las leen por nombre, así que no les afecta. La copia de las OC (`wms.oc_versiones`) NO cambia:
-- la fecha no entra en su huella, así que no se generan «cambios en la OC» falsos. Si Compras no tiene esas columnas, las vistas quedan como estaban. Re-ejecutable.

do $$ begin
  if to_regclass('compras.ordenes_compra') is not null and to_regclass('compras.ordenes_compra_items') is not null
     and to_regclass('compras.proveedores') is not null and to_regclass('catalogo.productos') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'compras' and table_name = 'ordenes_compra' and column_name = 'fecha_emision')
     and exists (select 1 from information_schema.columns where table_schema = 'compras' and table_name = 'ordenes_compra' and column_name = 'fecha_entrega_estimada') then
    execute $v$
      create or replace view wms.v_oc_lineas with (security_invoker = true) as
      select oc.id as oc_id, oc.codigo as oc_codigo, oc.estado as estado_oc, pv.id as proveedor_id,
             pv.razon_social as proveedor_nombre, pv.ruc as proveedor_ruc,
             oi.id as oc_item_id, oi.producto_id, p.codigo as producto_codigo, p.descripcion as producto_descripcion,
             oi.cantidad_pedida, coalesce(oi.cantidad_recibida, 0) as cantidad_recibida,
             oi.cantidad_pedida - coalesce(oi.cantidad_recibida, 0) as saldo,
             coalesce(oi.cantidad_facturada, 0) as cantidad_facturada,
             oc.fecha_emision, oc.fecha_entrega_estimada
        from compras.ordenes_compra oc
        join compras.proveedores pv on pv.id = oc.proveedor_id
        join compras.ordenes_compra_items oi on oi.oc_id = oc.id
        join catalogo.productos p on p.id = oi.producto_id
    $v$;
    execute $v$
      create or replace view wms.v_oc_items with (security_invoker = true) as
      select oc_id, oc_codigo, estado_oc, proveedor_id, proveedor_nombre, proveedor_ruc, oc_item_id, producto_id, producto_codigo, producto_descripcion,
             cantidad_pedida, cantidad_recibida, saldo, cantidad_facturada, fecha_emision, fecha_entrega_estimada
        from wms.v_oc_lineas where estado_oc in ('enviada', 'confirmada', 'parcialmente_recibida')
    $v$;
    execute 'grant select on wms.v_oc_lineas, wms.v_oc_items to authenticated';
  end if;
end $$;

-- Permisos (default-deny): sin funciones nuevas; se repite el cierre de siempre.
revoke execute on all functions in schema wms from public;
