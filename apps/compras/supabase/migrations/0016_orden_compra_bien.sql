-- "Crear orden de compra de un bien": hasta ahora toda OC asumía líneas de
-- catalogo.productos (mercadería para revender). Un bien (equipos, muebles)
-- no es catálogo de reventa, así que no tiene fila en catalogo.productos —
-- sus líneas van con descripcion_libre en vez de producto_id.
--
-- `tipo` en la cabecera distingue el flujo para la UI y los reportes; no
-- hay CHECK cruzado cabecera/línea (validación de que 'mercaderia' siempre
-- use producto_id y 'bien' siempre use descripcion_libre) porque un CHECK
-- no puede mirar otra tabla — se exige en la Server Action que arma el
-- insert (services/ordenes-compra.ts).

alter table compras.ordenes_compra
  add column if not exists tipo text not null default 'mercaderia'
    check (tipo in ('mercaderia', 'bien'));

alter table compras.ordenes_compra_items
  alter column producto_id drop not null;

alter table compras.ordenes_compra_items
  add column if not exists descripcion_libre text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'ordenes_compra_items_producto_o_descripcion'
  ) then
    alter table compras.ordenes_compra_items
      add constraint ordenes_compra_items_producto_o_descripcion
      check (producto_id is not null or descripcion_libre is not null);
  end if;
end $$;
