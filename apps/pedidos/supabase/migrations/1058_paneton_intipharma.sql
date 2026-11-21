-- 1058 — El panetón de Intipharma, activo y a S/ 0,01.
--
-- BOI000 "PANETON INTIPHARMA 900G" estaba creado desde antes pero en
-- `inactivo` y sin precio, así que no aparecía en ningún lado: ni para
-- pedir, ni en la lista de los que existen pero no se pueden pedir.
--
-- POR QUÉ UN CÉNTIMO Y NO CERO
--
-- Un producto sin precio no se puede agregar a un pedido: el buscador lo
-- muestra bloqueado porque no hay con qué valorizar la línea. Con S/ 0,01
-- entra al buscador como cualquier producto y, cuando corresponda
-- regalarlo, se marca como bonificación con el mecanismo que ya existe
-- desde la 1021 y la línea pasa a S/ 0,00.
--
-- El céntimo lo eligió el usuario el 2026-11-09 ("ponle un precio de 0.01
-- no importa, se va a dar por promoción"). No es el valor del panetón: es
-- el mínimo que deja que el producto exista en el circuito de pedidos.
--
-- Va en la lista de precios vigente de Intipharma, la del 2026-10-20, y no
-- en una lista nueva: no es un cambio de precios del proveedor, es un
-- producto que faltaba en la que ya está publicada.
--
-- LO QUE SE DESCARTÓ
--
-- Primero se armó una función (`agregar_bonificacion_suelta`) para poder
-- poner una línea gratis de un producto que no está en el pedido, que era
-- la forma de meter el panetón sin darle precio. El usuario la descartó
-- —el panetón se va a dar por promoción— y se borró de la base para que no
-- quedara una función que el repo no documenta. El SQL está en el PR #260,
-- cerrado, por si algún día hace falta.

update pedidos.products
   set estado = 'activo', updated_at = now()
 where codigo_interno = 'BOI000' and estado <> 'activo';

insert into pedidos.price_list_items (price_list_id, product_id, sales_channel_id, precio, vigente_desde)
select (select pl.id
          from pedidos.price_lists pl
          join pedidos.suppliers s on s.id = pl.supplier_id
         where s.nombre = 'Intipharma'
         order by pl.fecha_inicio desc
         limit 1),
       (select id from pedidos.products where codigo_interno = 'BOI000'),
       c.id, 0.01, current_date
  from pedidos.sales_channels c
 where not exists (
   select 1 from pedidos.price_list_items i
   where i.product_id = (select id from pedidos.products where codigo_interno = 'BOI000')
     and i.sales_channel_id = c.id
     and i.vigente_hasta is null);
