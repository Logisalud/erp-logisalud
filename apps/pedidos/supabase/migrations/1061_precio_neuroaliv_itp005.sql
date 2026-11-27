-- 1061 — Corrección del precio de venta de ITP005 (NEUROALIV 1000 Iny IM).
--
-- La lista de Intipharma cargada el 2026-10-20 dejó este producto en S/ 24,00.
-- El 2026-11-24 el usuario confirmó la lista corregida del proveedor:
--
--     1 a 5      30,00   (margen 40,00%)
--     6 a 11     29,10   (margen 38,14%)
--     12 a más   27,35   (margen 34,20%)
--
-- Los porcentajes de esa lista son MARGEN sobre el precio de venta, no
-- descuento: con el costo de 18,00 —el PVF a distribuidora con IGV que está
-- cargado en el catálogo de compras (migración 0091)— (30−18)/30 = 40%,
-- (29,10−18)/29,10 = 38,14% y (27,35−18)/27,35 = 34,20%. Las tres cuadran,
-- que es lo que confirma que la columna es margen.
--
-- ── Qué se corrige ───────────────────────────────────────────────────────
-- El precio que cobra el vendedor sale de `price_list_items`: el motor de
-- escalas todavía no se aplica solo al armar el pedido (ver la nota en
-- domain/products.ts). Así que lo que realmente cambia la venta es el precio
-- base, que pasa de 24,00 a 30,00 en los SEIS canales —hoy el producto tiene
-- el mismo precio en todos, y la lista corregida tampoco distingue canal—.
--
-- Las dos escalas se dejan coherentes con el precio nuevo: el descuento del
-- proveedor no cambió (3% y 8,82%), lo que estaba mal era la base sobre la
-- que se aplicaba. 30 × 0,97 = 29,10 exacto, y 30 × 0,9118 = 27,354, que a
-- dos decimales es el 27,35 de la lista. Sólo se actualiza
-- `precio_promocional_declarado`, que es el precio que declaró el proveedor.
--
-- ── Qué NO se toca ───────────────────────────────────────────────────────
-- Las 16 líneas de pedido que ya usaron este producto: `order_items` guarda
-- su propio `precio_unitario`, así que un pedido viejo sigue valiendo lo que
-- valía. Cambiar eso sería reescribir historia vendida.
--
-- Tampoco se toca el resto de la lista de Intipharma. Los otros 13 productos
-- están cargados con un margen uniforme de 25% o 30% sobre el costo, y
-- ITP005 también lo estaba (24 sobre 18 es 25%): esta corrección lo lleva a
-- 40%, que es lo que pidió el usuario para ESTE producto.
--
-- Respaldo de las filas afectadas: `price_list_items_backup_20261124_itp005`
-- y `promo_escalas_backup_20261124_itp005`.
--
-- Re-ejecutable: los UPDATE filtran por el valor viejo.

create table if not exists pedidos.price_list_items_backup_20261124_itp005 as
select i.* from pedidos.price_list_items i
  join pedidos.products p on p.id = i.product_id
 where p.codigo_interno = 'ITP005';

create table if not exists pedidos.promo_escalas_backup_20261124_itp005 as
select e.* from pedidos.promo_escalas e
  join pedidos.products p on p.id = e.product_id
 where p.codigo_interno = 'ITP005';

update pedidos.price_list_items i
   set precio = 30.0000
  from pedidos.products p
 where p.id = i.product_id
   and p.codigo_interno = 'ITP005'
   and i.precio = 24.0000;

update pedidos.promo_escalas e
   set precio_promocional_declarado = 29.1000
  from pedidos.products p
 where p.id = e.product_id
   and p.codigo_interno = 'ITP005'
   and e.cantidad_minima = 6
   and e.precio_promocional_declarado = 23.2800;

update pedidos.promo_escalas e
   set precio_promocional_declarado = 27.3500
  from pedidos.products p
 where p.id = e.product_id
   and p.codigo_interno = 'ITP005'
   and e.cantidad_minima = 12
   and e.precio_promocional_declarado = 21.8832;

insert into pedidos.audit_logs (actor, accion, entidad, entidad_id, datos_antes, datos_despues)
select null, 'corregir_precio_lista', 'products', p.id,
       jsonb_build_object('codigo','ITP005','precio',24.0000,'escala_6_11',23.2800,'escala_12_mas',21.8832),
       jsonb_build_object('codigo','ITP005','precio',30.0000,'escala_6_11',29.1000,'escala_12_mas',27.3500,
                          'origen','lista corregida de Intipharma confirmada por el usuario el 2026-11-24')
  from pedidos.products p
 where p.codigo_interno = 'ITP005';
