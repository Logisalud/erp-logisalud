-- 1049 — Las escalas de Intipharma, que esperaban a la 1044.
--
-- Los precios de Intipharma se cargaron el 2026-10-20 (14 productos,
-- ITP001–ITP014). Las escalas quedaron afuera ese día porque el candado de
-- `promo_escalas` admitía UNA por producto, canal y fecha, y la lista trae
-- dos tramos: −3% y −8,82%. Con la 1044 aplicada, entran.
--
-- Los dos descuentos son los mismos para los catorce productos; lo que
-- cambia es a partir de cuántas cajas (4/8 o 6/12, según el producto).
--
-- El precio del archivo queda en `precio_promocional_declarado` para poder
-- auditarlo: verificado que los 168 tramos lo reproducen al céntimo.
--
-- ── Lo que NO entra ──────────────────────────────────────────────────
-- La "promoción navideña" (un panetón por cada 8 o 12 cajas, en 9 de los
-- 14 productos). Decisión del usuario del 2026-10-20: dejarla fuera del
-- motor. El panetón existe como producto —BOI000, sólo para ver stock, no
-- se vende— pero entregarlo se coordina a mano. Si alguna vez se quiere
-- automático, es una bonificación, no una escala.

with tramos(codigo, cantidad_minima, pct, precio, etiqueta) as (values
('ITP001', 4, 3.00, 77.6, '4 a 7'),('ITP001', 8, 8.82, 72.944, '8 a más'),
('ITP002', 4, 3.00, 24.25, '4 a 7'),('ITP002', 8, 8.82, 22.795, '8 a más'),
('ITP003', 6, 3.00, 38.8, '6 a 11'),('ITP003', 12, 8.82, 36.472, '12 a más'),
('ITP004', 6, 3.00, 32.01, '6 a 11'),('ITP004', 12, 8.82, 30.0894, '12 a más'),
('ITP005', 6, 3.00, 23.28, '6 a 11'),('ITP005', 12, 8.82, 21.8832, '12 a más'),
('ITP006', 4, 3.00, 43.65, '4 a 7'),('ITP006', 8, 8.82, 41.031, '8 a más'),
('ITP007', 2, 3.00, 155.2, '2 a 3'),('ITP007', 4, 8.82, 145.888, '4 a más'),
('ITP008', 4, 3.00, 87.3, '4 a 7'),('ITP008', 8, 8.82, 82.062, '8 a más'),
('ITP009', 6, 3.00, 43.65, '6 a 11'),('ITP009', 12, 8.82, 41.031, '12 a más'),
('ITP010', 4, 3.00, 24.25, '4 a 7'),('ITP010', 8, 8.82, 22.795, '8 a más'),
('ITP011', 6, 3.00, 4.85, '6 a 11'),('ITP011', 12, 8.82, 4.559, '12 a más'),
('ITP012', 6, 3.00, 7.6048, '6 a 11'),('ITP012', 12, 8.82, 7.1485, '12 a más'),
('ITP013', 6, 3.00, 6.79, '6 a 11'),('ITP013', 12, 8.82, 6.3826, '12 a más'),
('ITP014', 4, 3.00, 23.28, '4 a 7'),('ITP014', 8, 8.82, 21.8832, '8 a más')
)
insert into pedidos.promo_escalas
  (product_id, sales_channel_id, cantidad_minima, porcentaje_descuento,
   precio_promocional_declarado, etiqueta_origen, vigente_desde)
select p.id, c.id, t.cantidad_minima, t.pct::numeric, t.precio::numeric,
       'Intipharma oct-2026 · ' || t.etiqueta, current_date
from tramos t
join pedidos.products p on p.codigo_interno = t.codigo
cross join pedidos.sales_channels c
on conflict (product_id, sales_channel_id, vigente_desde, cantidad_minima) do nothing;
