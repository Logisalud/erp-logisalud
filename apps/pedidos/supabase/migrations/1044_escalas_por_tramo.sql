-- Una escala por tramo, no una sola por producto.
--
-- `promo_escalas` tenía un único candado: (product_id, sales_channel_id,
-- vigente_desde). Nació para evitar dos versiones de la MISMA regla el
-- mismo día, pero de paso prohíbe lo que Intipharma trae en su lista: dos
-- tramos a la vez —4 cajas −3%, 8 cajas −8,82%— sobre el mismo producto.
--
-- El motor ya sabe resolverlo. `pedidos.aplicar_promociones` busca así:
--
--     and v_item.cantidad >= e.cantidad_minima
--     order by e.cantidad_minima desc, e.id desc
--     limit 1
--
-- es decir, de las escalas que el pedido alcanza se queda con la más
-- profunda. Con un solo tramo cargado eso era un `limit 1` sobre una fila;
-- con varios hace exactamente lo que se espera. No hay que tocarlo.
--
-- El candado nuevo agrega `cantidad_minima`: se siguen prohibiendo dos
-- reglas iguales el mismo día para el mismo umbral, que es lo que de
-- verdad importaba, y se permiten los tramos. Las filas que ya existen lo
-- cumplen todas (eran únicas por tres columnas; con cuatro lo siguen
-- siendo), así que el constraint entra sin normalizar nada.

alter table pedidos.promo_escalas
  drop constraint if exists promo_escalas_product_id_sales_channel_id_vigente_desde_key;

alter table pedidos.promo_escalas
  drop constraint if exists promo_escalas_tramo_unico;

alter table pedidos.promo_escalas
  add constraint promo_escalas_tramo_unico
  unique (product_id, sales_channel_id, vigente_desde, cantidad_minima);
