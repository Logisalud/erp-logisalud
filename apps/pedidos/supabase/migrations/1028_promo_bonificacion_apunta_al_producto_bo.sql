-- 1028 — La bonificación automática entrega el producto BO, no el regular.
--
-- Hasta acá `promo_bonificaciones.producto_bonificado_id` estaba en null en
-- todas las reglas, o sea "la línea gratis es el MISMO producto". Con el
-- stock real cargado eso quedó corto: el almacén lleva la bonificación como
-- su propio SKU (BODHP200 tiene 133 unidades físicas, aparte de las 241 de
-- DHP200), así que la línea gratis tiene que consumir ESE stock y no el del
-- producto que se paga.
--
-- Se apunta sólo donde el par existe (`products.codigo_bonificacion`), que
-- hoy son 8 reglas de 4 productos: DHP104, DHP107, DHP200 y DHP308.
--
-- Lo que NO cambia: el correo y el Excel se ven exactamente igual. Ya
-- mostraban el código con el prefijo BO —lo calculaba
-- `codigoVisibleDeLineaGratis` para la presentación— y la descripción del
-- producto BO es la misma que la del regular. El único cambio real es de
-- qué stock sale la línea gratis, que es el punto.
--
-- Probado el 2026-09-10 contra la base real, en una transacción abortada:
-- 2 VITAMINA E (DHP200) del canal Horizontal dan
-- "DHP200 x2 @ S/16.00 [LISTA] · BODHP200 x2 @ S/0.00 [PROMO_BONIFICACION]".
update pedidos.promo_bonificaciones pb
set producto_bonificado_id = b.id
from pedidos.products r, pedidos.products b
where pb.product_id = r.id
  and b.codigo_interno = r.codigo_bonificacion
  and pb.producto_bonificado_id is null;
