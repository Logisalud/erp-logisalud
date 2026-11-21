-- 1057 — P Harmed entra al ERP: 34 productos, precios y escalas.
--
-- Lista "LISTA DE PRECIOS P HARMED", entregada el 2026-11-09. Es una línea
-- NUEVA: no existía el proveedor ni ninguno de sus productos. Cada uno trae
-- tres tramos de precio por cantidad; el primero es el precio de lista y los
-- otros dos son escalas.
--
-- Se sigue el mismo criterio que la 1048 (Generion), que a su vez sigue el
-- de Intipharma. Requiere la 1044 (una escala por tramo).
--
-- ── Los precios ──────────────────────────────────────────────────────
-- El archivo dice "PRECIO CON IGV" y `price_list_items.precio` TAMBIÉN es
-- con IGV desde la 0051, así que entran tal cual. Mismo precio en los seis
-- canales: la lista no distingue canal.
--
-- ── Las escalas ──────────────────────────────────────────────────────
-- El motor (`aplicar_promociones`) aplica un PORCENTAJE sobre el precio de
-- lista, así que cada tramo se guarda como descuento, con el precio del
-- archivo al lado en `precio_promocional_declarado` para poder auditarlo.
-- Verificado: los 68 tramos reproducen el precio del archivo al céntimo.
--
-- ── Los bonificados ──────────────────────────────────────────────────
-- Los BOPRD vienen con su código en el archivo, y entran como productos
-- propios SIN precio, igual que los BOGNR, BOJAM y BODHP: son el mismo
-- artículo que llega sin costo. Sin ellos, el día que el almacén cargue
-- stock de un bonificado el importador lo rechazaría por código desconocido.
--
-- ── Tres cosas que el archivo traía mal o incompletas ────────────────
--
-- 1. PRD208 (ZITROGAL x 3 TAB. REC.) viene con las tres escalas VACÍAS, sin
--    ningún precio. Decisión del usuario el 2026-11-09: no se crea todavía;
--    se suma cuando P Harmed mande su precio. Por eso son 34 y no 35.
--    Cuidado: si llega stock de ese código antes, el importador del almacén
--    lo va a rechazar.
--
-- 2. PRD804 (MIDOL EXTRA FUERTE x 100) traía el tramo de 3 unidades a
--    S/ 95,89 y el de 10 a S/ 97,89 — comprando más salía más caro, y el
--    motor se queda con el tramo más profundo alcanzado, así que quien
--    pidiera 10 cajas habría pagado dos soles más por caja que pidiendo 3.
--    El usuario confirmó que los dos precios están cruzados en el archivo,
--    así que acá van al revés: 3 un. a S/ 97,89 y 10 un. a S/ 95,89.
--
-- 3. PRD801 (ALICAM FORTE x 100) tiene el MISMO precio en los dos tramos,
--    S/ 16,60 para 3 y para 10. Se cargan los dos igual, tal como vienen:
--    el de 10 no agrega nada, pero tampoco molesta, y si mañana P Harmed lo
--    corrige se edita esa fila sola.
--
-- Este archivo documenta una carga de datos que se aplicó a mano contra la
-- base (ver el README de migraciones). Los `insert` usan `on conflict do
-- nothing`, así que re-correrlo no duplica nada.

insert into pedidos.suppliers (nombre, estado)
select 'P Harmed', 'activo'
where not exists (select 1 from pedidos.suppliers where nombre = 'P Harmed');

-- ---------------------------------------------------------------------
-- 1. Los 34 productos y sus 34 bonificados
-- ---------------------------------------------------------------------
insert into pedidos.products
  (codigo_interno, descripcion, unidad_medida, codigo_bonificacion, supplier_id, estado)
select v.codigo, v.descripcion, v.unidad, v.bonificado,
       (select id from pedidos.suppliers where nombre = 'P Harmed'), 'activo'
from (values
  ('PRD101', 'ARCOXIB 90 x 10 TAB. REC.', 'TABLETA', 'BOPRD101'),
  ('PRD102', 'ARCOXIB 120 x 10 TAB. REC.', 'TABLETA', 'BOPRD102'),
  ('PRD103', 'DOLOIBUPRESS FORTE x 20 TAB. REC.', 'TABLETA', 'BOPRD103'),
  ('PRD104', 'DOLOIBUPRESS FORTE x 100 TAB. REC.', 'TABLETA', 'BOPRD104'),
  ('PRD105', 'DOLO MIOPRESS FORTE x 100 TAB. REC.', 'TABLETA', 'BOPRD105'),
  ('PRD106', 'DOLO NEUROPRESS FORTE NF x 60 CÁP.', 'CAPSULA', 'BOPRD106'),
  ('PRD107', 'KETAXAL x 100 TAB. REC.', 'TABLETA', 'BOPRD107'),
  ('PRD108', 'NEUROPRESS 5000 x 60 TAB. REC.', 'TABLETA', 'BOPRD108'),
  ('PRD109', 'ORFEDRIN 100 x 100 TAB. DE LIB. PROL.', 'TABLETA', 'BOPRD109'),
  ('PRD201', 'BACCIDAL x 100 TAB. REC.', 'TABLETA', 'BOPRD201'),
  ('PRD202', 'DUCLONEX x 1 CÁP', 'CAPSULA', 'BOPRD202'),
  ('PRD203', 'LEVOXIDAL 500 x 10 TAB. REC.', 'TABLETA', 'BOPRD203'),
  ('PRD204', 'LEVOXIDAL 750 x 5 TAB. REC.', 'TABLETA', 'BOPRD204'),
  ('PRD205', 'PARDIL x 6 TAB. REC.', 'TABLETA', 'BOPRD205'),
  ('PRD206', 'PARDIL x 60 ML Polvo P/Suspensión oral', 'POLVO SUSPENSIÓN', 'BOPRD206'),
  ('PRD207', 'SULFACID FORTE x 100 TAB. REC.', 'TABLETA', 'BOPRD207'),
  ('PRD209', 'ZITROGAL x 30 TAB. REC.', 'TABLETA', 'BOPRD209'),
  ('PRD210', 'ZITROGAL x 30 ML Polvo P/Suspensión oral', 'POLVO SUSPENSIÓN', 'BOPRD210'),
  ('PRD301', 'ZINOXID 25 x 30 TAB.', 'TABLETA', 'BOPRD301'),
  ('PRD302', 'ZINOXID 50 x 30 TAB.', 'TABLETA', 'BOPRD302'),
  ('PRD401', 'ESPASMOLIT x 30 TAB. REC.', 'TABLETA', 'BOPRD401'),
  ('PRD501', 'NERVOPAX 75 x 30 CÁP.', 'CAPSULA', 'BOPRD501'),
  ('PRD502', 'NERVOPAX 150 x 30 CÁP.', 'CAPSULA', 'BOPRD502'),
  ('PRD601', 'DEXONA x 100 TAB.', 'TABLETA', 'BOPRD601'),
  ('PRD602', 'DICODRIN x 30 TAB. REC', 'TABLETA', 'BOPRD602'),
  ('PRD701', 'SILDEX 50 x 1 TAB. REC.', 'TABLETA', 'BOPRD701'),
  ('PRD702', 'SILDEX 100 x 1 TAB. REC', 'TABLETA', 'BOPRD702'),
  ('PRD703', 'UREN x 100 TAB. REC.', 'TABLETA', 'BOPRD703'),
  ('PRD704', 'UREN MAX x 100 TAB. REC', 'TABLETA', 'BOPRD704'),
  ('PRD801', 'ALICAM FORTE x 100 TAB.', 'TABLETA', 'BOPRD801'),
  ('PRD802', 'ESPASMEX x 100 TAB. REC.', 'TABLETA', 'BOPRD802'),
  ('PRD803', 'ESPASMEX COMPUESTO x 60 TAB. REC.', 'TABLETA', 'BOPRD803'),
  ('PRD804', 'MIDOL EXTRA FUERTE x 100 TAB. REC.', 'TABLETA', 'BOPRD804'),
  ('PRD905', 'NOCTIUM ZZZ x 30 TAB. REC.', 'TABLETA', 'BOPRD905')) as v(codigo, descripcion, unidad, bonificado)
on conflict (codigo_interno) do nothing;

insert into pedidos.products
  (codigo_interno, descripcion, unidad_medida, supplier_id, estado)
select b.codigo_bonificacion, b.descripcion, b.unidad_medida, b.supplier_id, 'activo'
from pedidos.products b
where b.codigo_interno like 'PRD%' and b.codigo_bonificacion is not null
on conflict (codigo_interno) do nothing;

-- Todos gravados: no hay en esta línea ningún producto de los inafectos
-- (los de diabetes, ver la 1056).
insert into pedidos.product_tax_profiles (product_id, afectacion_tributaria, tasa_aplicable, vigente_desde)
select p.id, 'GRAVADO', 18.00, current_date
from pedidos.products p
where (p.codigo_interno like 'PRD%' or p.codigo_interno like 'BOPRD%')
  and not exists (select 1 from pedidos.product_tax_profiles t
                   where t.product_id = p.id and t.vigente_hasta is null);

-- ---------------------------------------------------------------------
-- 2. La lista de precios (primer tramo), igual en los seis canales
-- ---------------------------------------------------------------------
with lista as (
  insert into pedidos.price_lists (supplier_id, fecha_inicio, archivo_nombre, importado_por)
  select (select id from pedidos.suppliers where nombre = 'P Harmed'), current_date,
         'LISTA_DE_PRECIOS_P_HARMED.xlsx',
         (select id from pedidos.profiles where email = 'aromero@logisalud.com')
  where not exists (
    select 1 from pedidos.price_list_items i
    join pedidos.products p on p.id = i.product_id
    where p.codigo_interno like 'PRD%' and i.vigente_hasta is null)
  returning id
),
precios(codigo, precio) as (values
  ('PRD101', 30.3),
  ('PRD102', 32.85),
  ('PRD103', 20),
  ('PRD104', 90.01),
  ('PRD105', 73.01),
  ('PRD106', 57.16),
  ('PRD107', 36.55),
  ('PRD108', 119.32),
  ('PRD109', 70.03),
  ('PRD201', 61.02),
  ('PRD202', 1.6),
  ('PRD203', 33.15),
  ('PRD204', 21),
  ('PRD205', 16),
  ('PRD206', 16),
  ('PRD207', 34.02),
  ('PRD209', 90),
  ('PRD210', 22),
  ('PRD301', 22.5),
  ('PRD302', 24),
  ('PRD401', 67.49),
  ('PRD501', 85.51),
  ('PRD502', 123.01),
  ('PRD601', 45.08),
  ('PRD602', 14.5),
  ('PRD701', 0.92),
  ('PRD702', 1.24),
  ('PRD703', 49.01),
  ('PRD704', 95.01),
  ('PRD801', 19.5),
  ('PRD802', 69.99),
  ('PRD803', 48),
  ('PRD804', 99.9),
  ('PRD905', 33))
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
  ('PRD101', 3, 5.28, 28.7, '3 a 9'),
  ('PRD101', 10, 12.41, 26.54, '10 a más'),
  ('PRD102', 3, 6.42, 30.74, '3 a 9'),
  ('PRD102', 10, 13.21, 28.51, '10 a más'),
  ('PRD103', 3, 5, 19, '3 a 19'),
  ('PRD103', 20, 10, 18, '20 a más'),
  ('PRD104', 3, 3.36, 86.99, '3 a 9'),
  ('PRD104', 10, 7.78, 83.01, '10 a más'),
  ('PRD105', 3, 3.01, 70.81, '3 a 9'),
  ('PRD105', 10, 5, 69.36, '10 a más'),
  ('PRD106', 4, 5.3, 54.13, '4 a 39'),
  ('PRD106', 40, 9.9, 51.5, '40 a más'),
  ('PRD107', 3, 15.16, 31.01, '3 a 9'),
  ('PRD107', 10, 20.66, 29, '10 a más'),
  ('PRD108', 4, 2.45, 116.4, '4 a 9'),
  ('PRD108', 10, 4.95, 113.41, '10 a más'),
  ('PRD109', 3, 28.6, 50, '3 a 9'),
  ('PRD109', 10, 31.46, 48, '10 a más'),
  ('PRD201', 3, 5.75, 57.51, '3 a 9'),
  ('PRD201', 10, 23.01, 46.98, '10 a más'),
  ('PRD202', 30, 2.5, 1.56, '30 a 59'),
  ('PRD202', 60, 5, 1.52, '60 a más'),
  ('PRD203', 3, 7, 30.83, '3 a 9'),
  ('PRD203', 10, 13.48, 28.68, '10 a más'),
  ('PRD204', 3, 4.76, 20, '3 a 9'),
  ('PRD204', 10, 7.24, 19.48, '10 a más'),
  ('PRD205', 3, 18.75, 13, '3 a 19'),
  ('PRD205', 20, 37.5, 10, '20 a más'),
  ('PRD206', 3, 18.75, 13, '3 a 19'),
  ('PRD206', 20, 37.5, 10, '20 a más'),
  ('PRD207', 3, 5.94, 32, '3 a 9'),
  ('PRD207', 10, 11.88, 29.98, '10 a más'),
  ('PRD209', 3, 2.22, 88, '3 a 9'),
  ('PRD209', 10, 6.67, 84, '10 a más'),
  ('PRD210', 3, 4.55, 21, '3 a 9'),
  ('PRD210', 10, 9.09, 20, '10 a más'),
  ('PRD301', 3, 8.89, 20.5, '3 a 9'),
  ('PRD301', 10, 17.78, 18.5, '10 a más'),
  ('PRD302', 3, 8.33, 22, '3 a 9'),
  ('PRD302', 10, 16.67, 20, '10 a más'),
  ('PRD401', 3, 6.67, 62.99, '3 a 9'),
  ('PRD401', 10, 11.1, 60, '10 a más'),
  ('PRD501', 5, 1.75, 84.01, '5 a 9'),
  ('PRD501', 10, 3.51, 82.51, '10 a más'),
  ('PRD502', 5, 2.45, 120, '5 a 9'),
  ('PRD502', 10, 4.89, 116.99, '10 a más'),
  ('PRD601', 3, 14.6, 38.5, '3 a 9'),
  ('PRD601', 10, 26.82, 32.99, '10 a más'),
  ('PRD602', 5, 10.41, 12.99, '5 a 19'),
  ('PRD602', 20, 15.03, 12.32, '20 a más'),
  ('PRD701', 300, 4.35, 0.88, '300 a 499'),
  ('PRD701', 500, 8.7, 0.84, '500 a más'),
  ('PRD702', 300, 3.23, 1.2, '300 a 499'),
  ('PRD702', 500, 6.45, 1.16, '500 a más'),
  ('PRD703', 3, 2.06, 48, '3 a 9'),
  ('PRD703', 10, 4.12, 46.99, '10 a más'),
  ('PRD704', 3, 2.12, 93, '3 a 9'),
  ('PRD704', 10, 4.23, 90.99, '10 a más'),
  ('PRD801', 3, 14.87, 16.6, '3 a 9'),
  ('PRD801', 10, 14.87, 16.6, '10 a más'),
  ('PRD802', 3, 2.84, 68, '3 a 9'),
  ('PRD802', 10, 5.7, 66, '10 a más'),
  ('PRD803', 3, 3.13, 46.5, '3 a 9'),
  ('PRD803', 10, 6.25, 45, '10 a más'),
  ('PRD804', 3, 2.01, 97.89, '3 a 9'),
  ('PRD804', 10, 4.01, 95.89, '10 a más'),
  ('PRD905', 3, 4.55, 31.5, '3 a 9'),
  ('PRD905', 10, 9.09, 30, '10 a más'))
insert into pedidos.promo_escalas
  (product_id, sales_channel_id, cantidad_minima, porcentaje_descuento,
   precio_promocional_declarado, etiqueta_origen, vigente_desde)
select p.id, c.id, t.cantidad_minima, t.pct::numeric, t.precio::numeric,
       'P Harmed nov-2026 · ' || t.etiqueta, current_date
from tramos t
join pedidos.products p on p.codigo_interno = t.codigo
cross join pedidos.sales_channels c
on conflict (product_id, sales_channel_id, vigente_desde, cantidad_minima) do nothing;
