-- ============================================================================
-- ¿Qué pedidos quedaron con el total inflado por el bug de IGV duplicado?
--
-- SOLO LECTURA: no corrige nada.
--
-- Pegá todo en el SQL Editor de Supabase y dale Run. Es lo mismo que `0051`
-- deja en un `raise notice` al aplicarse, pero consultable cuando quieras y
-- sin tener que buscar en los logs.
--
-- Cómo se reconoce una línea afectada: su `total` guardado equivale a
-- cantidad × precio × (1 + tasa/100) —la fórmula vieja— y NO a
-- cantidad × precio, que es la correcta. Se compara con tolerancia de un
-- céntimo para no marcar diferencias de redondeo.
--
-- Las líneas INAFECTO nunca se vieron afectadas: no se les sumaba IGV.
-- ============================================================================

with afectadas as (
  select oi.id, oi.order_id, oi.cantidad, oi.precio_unitario, oi.tasa_igv,
         oi.total                                          as total_guardado,
         round(oi.cantidad * oi.precio_unitario, 2)        as total_correcto,
         oi.total - round(oi.cantidad * oi.precio_unitario, 2) as diferencia
  from pedidos.order_items oi
  where oi.afectacion_tributaria = 'GRAVADO'
    and oi.tasa_igv > 0
    and abs(oi.total - round(oi.cantidad * oi.precio_unitario * (1 + oi.tasa_igv / 100), 2)) < 0.02
    and abs(oi.total - round(oi.cantidad * oi.precio_unitario, 2)) >= 0.02
)
-- A) El conteo
select 'RESUMEN' as seccion,
       null::bigint as numero_pedido,
       null::text as estado,
       count(*)::text || ' línea(s) en ' || count(distinct order_id)::text || ' pedido(s)' as detalle,
       round(sum(diferencia), 2)::text as cobrado_de_mas
from afectadas

union all

-- B) Pedido por pedido, para decidir qué hacer con cada uno
select 'PEDIDO',
       o.numero,
       o.estado,
       count(*)::text || ' línea(s) afectada(s)',
       round(sum(a.diferencia), 2)::text
from afectadas a
join pedidos.orders o on o.id = a.order_id
group by o.numero, o.estado

order by seccion, numero_pedido;

-- ---------------------------------------------------------------------------
-- Si hace falta el detalle línea por línea de un pedido concreto:
--
-- select oi.cantidad, oi.precio_unitario, oi.tasa_igv, oi.subtotal, oi.igv,
--        oi.total as total_guardado,
--        round(oi.cantidad * oi.precio_unitario, 2) as total_correcto,
--        p.codigo_interno, p.descripcion
-- from pedidos.order_items oi
-- join pedidos.orders o on o.id = oi.order_id
-- join pedidos.products p on p.id = oi.product_id
-- where o.numero = <NUMERO_DE_PEDIDO>
-- order by p.codigo_interno;
--
-- ---------------------------------------------------------------------------
-- IMPORTANTE: los pedidos en DRAFT se corrigen solos al enviarse, porque
-- `pedidos.submit_order` recalcula todas las líneas con la fórmula nueva.
-- Los que ya pasaron de DRAFT conservan lo que se grabó y no se tocan sin
-- una decisión explícita: son el histórico.
-- ============================================================================
