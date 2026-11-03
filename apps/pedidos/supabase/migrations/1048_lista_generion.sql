-- 1048 — Generion en el ERP de pedidos: 40 productos, precios y escalas.
--
-- Lista "OCTUBRE - LISTA DE PRECIOS PARA FFVV - GENERION - OCT 2026",
-- entregada el 2026-10-29. Cada producto trae TRES tramos de precio por
-- cantidad; el primero es el precio de lista y los otros dos son escalas.
--
-- Requiere la 1044 (una escala por tramo): con el candado viejo —uno por
-- producto, canal y fecha— esta carga entraba a la mitad.
--
-- ── Los precios ──────────────────────────────────────────────────────
-- El archivo dice "PRECIO CON IGV" y `price_list_items.precio` TAMBIÉN es
-- con IGV desde la 0051, así que entran tal cual. Dividir por 1.18 acá
-- habría dejado todos los pedidos de Generion un 18% abajo.
--
-- Mismo precio en los seis canales, como se cargó Intipharma: la lista no
-- distingue canal.
--
-- ── Las escalas ──────────────────────────────────────────────────────
-- El motor (`aplicar_promociones`) aplica un PORCENTAJE sobre el precio de
-- lista, así que cada tramo se guarda como descuento, con el precio del
-- archivo al lado en `precio_promocional_declarado` para poder auditarlo.
-- Verificado: los 480 tramos reproducen el precio del archivo al céntimo.
--
-- ── Los bonificados ──────────────────────────────────────────────────
-- Los BOGNR entran como productos propios y SIN precio, igual que los
-- BOJAM y BODHP que ya existen: son el mismo artículo que llega sin costo.
-- Sin ellos, el día que el almacén cargue stock de un bonificado el
-- importador lo rechazaría por código desconocido.
--
-- ── Lo que el archivo deja abierto ───────────────────────────────────
-- Tres productos tienen el tercer tramo ACOTADO en vez de "a más":
-- GNR113 ("3 cajas"), GNR221 y GNR222 ("500 a 999"). El motor se queda
-- siempre con el tramo más profundo alcanzado, así que quien pida 1.000
-- unidades paga el precio del tramo 500-999. Es lo razonable, pero
-- conviene confirmarlo con Generion.

-- Este archivo documenta una carga de datos que se aplicó a mano contra la
-- base (ver el README de migraciones). Se deja acá para que el repo tenga
-- el criterio y los números, no para re-ejecutarlo a ciegas: los `insert`
-- usan `on conflict do nothing`, así que re-correrlo no duplica nada.

insert into pedidos.suppliers (nombre, estado)
select 'Generion', 'activo'
where not exists (select 1 from pedidos.suppliers where nombre = 'Generion');

-- ---------------------------------------------------------------------
-- 1. Los 40 productos y sus 40 bonificados
-- ---------------------------------------------------------------------
insert into pedidos.products
  (codigo_interno, descripcion, unidad_medida, codigo_bonificacion, supplier_id, estado)
select v.codigo, v.descripcion, v.unidad, v.bonificado,
       (select id from pedidos.suppliers where nombre = 'Generion'), 'activo'
from (values
  ('GNR101', 'ALIBRA 10MG CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR101'),
  ('GNR102', 'CLOROPHEN 4MG CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR102'),
  ('GNR103', 'DOLOPIREX 200MG+500MG CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR103'),
  ('GNR104', 'DOLOPRESS 50MG CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR104'),
  ('GNR105', 'DOLOPRESS FLASH CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR105'),
  ('GNR106', 'EXADIOL 200MG CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR106'),
  ('GNR107', 'LERTAMINE 5MG CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR107'),
  ('GNR108', 'METEORFLAT 80MG CAJA X 120 TAB. MAST.', 'TABLETA MASTICABLE', 'BOGNR108'),
  ('GNR109', 'MIOLENE 500MG + 65MG CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR109'),
  ('GNR110', 'NAPROCOP 550MG CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR110'),
  ('GNR111', 'NERVOGEN CAJA X 48 TABLETAS', 'TABLETA', 'BOGNR111'),
  ('GNR112', 'NONGRIPP ANTIGRIPAL NF CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR112'),
  ('GNR113', 'NONGRIPP MAX. POTENCIA CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR113'),
  ('GNR114', 'TALIDEX 20MG CAJA X 1 TABLETA', 'TABLETA', 'BOGNR114'),
  ('GNR115', 'TALIDEX 20MG CAJA X 4 TABLETAS', 'TABLETA', 'BOGNR115'),
  ('GNR116', 'VOXAMINE 50MG CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR116'),
  ('GNR117', 'ZARIDON 1GR CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR117'),
  ('GNR118', 'ZARIDON FLEX CAJA X  60 TABLETAS', 'TABLETA', 'BOGNR118'),
  ('GNR201', 'AZITROMICINA 500MG CAJA X 50 TABLETAS', 'TABLETA', 'BOGNR201'),
  ('GNR202', 'BISOPROLOL 5MG CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR202'),
  ('GNR203', 'BROMURO DE OTILONIO 40MG - NUEVO CAJA X  30 TABLETAS', 'TABLETA', 'BOGNR203'),
  ('GNR204', 'DEFLAZACORT 6MG CAJA POR 10 TABLETAS', 'TABLETA', 'BOGNR204'),
  ('GNR205', 'DEFLAZACORT 30MG CAJA POR 10 TABLETAS', 'TABLETA', 'BOGNR205'),
  ('GNR206', 'ETORICOXIB 90MG CAJA POR 10 TABLETAS', 'TABLETA', 'BOGNR206'),
  ('GNR207', 'ETORICOXIB 120MG CAJA POR 10 TABLETAS', 'TABLETA', 'BOGNR207'),
  ('GNR208', 'FENAZOPIRIDINA 100 MG CAJA POR 100 TABLETAS', 'TABLETA', 'BOGNR208'),
  ('GNR209', 'FLUCONAZOL 150 MG CAJA X 1 CÁPSULA', 'CAPSULA', 'BOGNR209'),
  ('GNR210', 'LEVOFLOXACINO 500MG CAJA POR 10 TABLETAS', 'TABLETA', 'BOGNR210'),
  ('GNR211', 'LEVOFLOXACINO 750MG CAJA POR 5 TABLETAS', 'TABLETA', 'BOGNR211'),
  ('GNR212', 'LOSARTAN 50MG CAJA X 100 TABLETAS', 'TABLETA', 'BOGNR212'),
  ('GNR213', 'NITAZOXANIDA 500MG CAJA POR 6 TABLETAS', 'TABLETA', 'BOGNR213'),
  ('GNR214', 'NITAZOXANIDA 100MG/5ML FCO 60 ML', 'FRASCO', 'BOGNR214'),
  ('GNR215', 'ORFENADRINA 100MG CAJA POR 100 TABLETAS', 'TABLETA', 'BOGNR215'),
  ('GNR216', 'PARACETAMOL 1GR CAJA POR 100 TABLETAS', 'TABLETA', 'BOGNR216'),
  ('GNR217', 'PREGABALINA 75MG - NUEVO CAJA X 30 CÁPSULAS', 'CAPSULA', 'BOGNR217'),
  ('GNR218', 'PREGABALINA 150MG - NUEVO CAJA X 30 CÁPSULAS', 'CAPSULA', 'BOGNR218'),
  ('GNR219', 'RIVAROXABAN 15MG CAJA POR 30 TABLETAS', 'TABLETA', 'BOGNR219'),
  ('GNR220', 'RIVAROXABAN 20MG CAJA POR 30 TABLETAS', 'TABLETA', 'BOGNR220'),
  ('GNR221', 'SILDENAFILO 50MG CAJA X 1 TABLETA', 'TABLETA', 'BOGNR221'),
  ('GNR222', 'SILDENAFILO 100MG CAJA X 1 TABLETA', 'TABLETA', 'BOGNR222')
) as v(codigo, descripcion, unidad, bonificado)
on conflict (codigo_interno) do nothing;

-- El bonificado hereda descripción y unidad de su base: es el mismo
-- artículo, sólo que llega sin costo.
insert into pedidos.products (codigo_interno, descripcion, unidad_medida, supplier_id, estado)
select b.codigo_bonificacion, b.descripcion, b.unidad_medida, b.supplier_id, 'activo'
from pedidos.products b
where b.codigo_interno like 'GNR%' and b.codigo_bonificacion is not null
on conflict (codigo_interno) do nothing;

insert into pedidos.product_tax_profiles (product_id, afectacion_tributaria, tasa_aplicable, vigente_desde)
select p.id, 'GRAVADO', 18.00, current_date
from pedidos.products p
where (p.codigo_interno like 'GNR%' or p.codigo_interno like 'BOGNR%')
  and not exists (select 1 from pedidos.product_tax_profiles t
                   where t.product_id = p.id and t.vigente_hasta is null);

-- ---------------------------------------------------------------------
-- 2. La lista de precios (primer tramo), igual en los seis canales
-- ---------------------------------------------------------------------
with lista as (
  insert into pedidos.price_lists (supplier_id, fecha_inicio, archivo_nombre, importado_por)
  select (select id from pedidos.suppliers where nombre = 'Generion'), current_date,
         'OCTUBRE - LISTA DE PRECIOS PARA FFVV - GENERION - OCT 2026.xlsx',
         (select id from pedidos.profiles where email = 'aromero@logisalud.com')
  where not exists (
    select 1 from pedidos.price_list_items i
    join pedidos.products p on p.id = i.product_id
    where p.codigo_interno like 'GNR%' and i.vigente_hasta is null)
  returning id
),
precios(codigo, precio) as (values
  ('GNR101', 35),
  ('GNR102', 35),
  ('GNR103', 90),
  ('GNR104', 25),
  ('GNR105', 120.25),
  ('GNR106', 42),
  ('GNR107', 71),
  ('GNR108', 108),
  ('GNR109', 24),
  ('GNR110', 50),
  ('GNR111', 45),
  ('GNR112', 45),
  ('GNR113', 69),
  ('GNR114', 6),
  ('GNR115', 13.8),
  ('GNR116', 60),
  ('GNR117', 30),
  ('GNR118', 42.5),
  ('GNR201', 46),
  ('GNR202', 70),
  ('GNR203', 54),
  ('GNR204', 7.05),
  ('GNR205', 14.2),
  ('GNR206', 12),
  ('GNR207', 14),
  ('GNR208', 14),
  ('GNR209', 0.8),
  ('GNR210', 7.5),
  ('GNR211', 7.2),
  ('GNR212', 14),
  ('GNR213', 7.5),
  ('GNR214', 10),
  ('GNR215', 23),
  ('GNR216', 24),
  ('GNR217', 17.5),
  ('GNR218', 25.5),
  ('GNR219', 112.27),
  ('GNR220', 112.27),
  ('GNR221', 0.78),
  ('GNR222', 1.05)
)
insert into pedidos.price_list_items (price_list_id, product_id, sales_channel_id, precio, vigente_desde)
select (select id from lista), p.id, c.id, pr.precio::numeric, current_date
from precios pr
join pedidos.products p on p.codigo_interno = pr.codigo
cross join pedidos.sales_channels c
where exists (select 1 from lista);

-- ---------------------------------------------------------------------
-- 3. Las escalas: los otros dos tramos, como descuento sobre la lista
-- ---------------------------------------------------------------------
with tramos(codigo, cantidad_minima, pct, precio, etiqueta) as (values
  ('GNR101', 2, 2.86, 34, '2 cajas'),
  ('GNR101', 3, 5.71, 33, '3 a más'),
  ('GNR102', 3, 5.71, 33, '3 a 4'),
  ('GNR102', 5, 14.29, 30, '5 a más'),
  ('GNR103', 3, 3.33, 87, '3 a 4'),
  ('GNR103', 5, 7.78, 83, '5 a más'),
  ('GNR104', 3, 8.00, 23, '3 a 4'),
  ('GNR104', 5, 16.00, 21, '5 a más'),
  ('GNR105', 2, 1.33, 118.65, '2 cajas'),
  ('GNR105', 3, 4.37, 115, '3 a más'),
  ('GNR106', 3, 4.76, 40, '3 a 4'),
  ('GNR106', 5, 9.52, 38, '5 a más'),
  ('GNR107', 2, 2.82, 69, '2 cajas'),
  ('GNR107', 3, 5.63, 67, '3 a más'),
  ('GNR108', 3, 5.00, 102.6, '3 a 4'),
  ('GNR108', 5, 10.00, 97.2, '5 a más'),
  ('GNR109', 4, 8.33, 22, '4 a 9'),
  ('GNR109', 10, 16.67, 20, '10 a más'),
  ('GNR110', 2, 4.00, 48, '2 cajas'),
  ('GNR110', 3, 8.00, 46, '3 a más'),
  ('GNR111', 2, 6.67, 42, '2 cajas'),
  ('GNR111', 3, 15.56, 38, '3 a más'),
  ('GNR112', 3, 4.44, 43, '3 a 4'),
  ('GNR112', 5, 8.89, 41, '5 a más'),
  ('GNR113', 2, 4.35, 66, '2 cajas'),
  ('GNR113', 3, 7.25, 64, '3 cajas'),
  ('GNR114', 25, 8.33, 5.5, '25 a 49'),
  ('GNR114', 50, 20.00, 4.8, '50 a más'),
  ('GNR115', 11, 10.14, 12.4, '11 a 19'),
  ('GNR115', 20, 16.67, 11.5, '20 a más'),
  ('GNR116', 3, 3.33, 58, '3 a 5'),
  ('GNR116', 6, 8.33, 55, '6 a más'),
  ('GNR117', 4, 6.67, 28, '4 a 9'),
  ('GNR117', 10, 13.33, 26, '10 a más'),
  ('GNR118', 3, 2.35, 41.5, '3 a 4'),
  ('GNR118', 5, 4.71, 40.5, '5 a más'),
  ('GNR201', 6, 6.52, 43, '6 a 29'),
  ('GNR201', 30, 13.04, 40, '30 a más'),
  ('GNR202', 3, 2.86, 68, '3 a 4'),
  ('GNR202', 5, 8.57, 64, '5 a más'),
  ('GNR203', 3, 6.67, 50.4, '3 a 4'),
  ('GNR203', 5, 11.11, 48, '5 a más'),
  ('GNR204', 10, 7.80, 6.5, '10 a 49'),
  ('GNR204', 50, 15.60, 5.95, '50 a más'),
  ('GNR205', 4, 8.45, 13, '4 a 9'),
  ('GNR205', 10, 16.90, 11.8, '10 a más'),
  ('GNR206', 6, 12.50, 10.5, '6 a 39'),
  ('GNR206', 40, 20.83, 9.5, '40 a más'),
  ('GNR207', 6, 10.71, 12.5, '6 a 39'),
  ('GNR207', 40, 21.43, 11, '40 a más'),
  ('GNR208', 5, 7.14, 13, '5 a 9'),
  ('GNR208', 10, 14.29, 12, '10 a más'),
  ('GNR209', 100, 2.50, 0.78, '100 a 299'),
  ('GNR209', 300, 6.25, 0.75, '300 a más'),
  ('GNR210', 10, 5.33, 7.1, '10 a 49'),
  ('GNR210', 50, 16.00, 6.3, '50 a más'),
  ('GNR211', 10, 5.56, 6.8, '10 a 49'),
  ('GNR211', 50, 15.28, 6.1, '50 a más'),
  ('GNR212', 4, 7.14, 13, '4 a 9'),
  ('GNR212', 10, 14.29, 12, '10 a más'),
  ('GNR213', 10, 6.67, 7, '10 a 19'),
  ('GNR213', 20, 13.33, 6.5, '20 a más'),
  ('GNR214', 4, 10.00, 9, '4 a 9'),
  ('GNR214', 10, 20.00, 8, '10 a más'),
  ('GNR215', 10, 8.70, 21, '10 a 49'),
  ('GNR215', 50, 17.39, 19, '50 a más'),
  ('GNR216', 4, 6.67, 22.4, '4 a 9'),
  ('GNR216', 10, 13.33, 20.8, '10 a más'),
  ('GNR217', 3, 5.71, 16.5, '3 a 4'),
  ('GNR217', 5, 11.43, 15.5, '5 a más'),
  ('GNR218', 3, 3.92, 24.5, '3 a 4'),
  ('GNR218', 5, 7.84, 23.5, '5 a más'),
  ('GNR219', 3, 0.91, 111.25, '3 a 4'),
  ('GNR219', 5, 1.80, 110.25, '5 a más'),
  ('GNR220', 3, 0.91, 111.25, '3 a 4'),
  ('GNR220', 5, 1.80, 110.25, '5 a más'),
  ('GNR221', 300, 3.85, 0.75, '300 a 499'),
  ('GNR221', 500, 10.26, 0.7, '500 a 999'),
  ('GNR222', 300, 2.86, 1.02, '300 a 499'),
  ('GNR222', 500, 9.52, 0.95, '500 a 999')
)
insert into pedidos.promo_escalas
  (product_id, sales_channel_id, cantidad_minima, porcentaje_descuento,
   precio_promocional_declarado, etiqueta_origen, vigente_desde)
select p.id, c.id, t.cantidad_minima, t.pct::numeric, t.precio::numeric,
       'Generion oct-2026 · ' || t.etiqueta, current_date
from tramos t
join pedidos.products p on p.codigo_interno = t.codigo
cross join pedidos.sales_channels c
on conflict (product_id, sales_channel_id, vigente_desde, cantidad_minima) do nothing;
