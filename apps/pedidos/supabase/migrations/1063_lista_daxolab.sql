-- 1063 — Daxolab en el ERP de pedidos: proveedor nuevo, 65 productos y precios.
--
-- Laboratorio nuevo. Lista "LISTA_DE_PRECIOS_DAXOLAV.xlsx", entregada el
-- 2026-11-25, en tres líneas: DXL (marca, 12), DXG (genéricos, 12) y DXN
-- (nutracéuticos, 41). Los mismos 130 códigos entran al catálogo de compra
-- en `apps/compras` (migración 0093), con la misma descripción al carácter,
-- así que un producto es el mismo en los dos sistemas.
--
-- ── Los precios ──────────────────────────────────────────────────────
-- Se carga la columna "PRECIO CON IGV", que es el precio de VENTA. Es la
-- que corresponde: `price_list_items.precio` es con IGV desde la 0051.
-- Dividir por 1.18 acá dejaría todos los pedidos de Daxolab un 18% abajo.
--
-- Ojo con la otra columna del archivo: la amarilla ("PVF A DISTRIBUIDORA
-- NOV 2026") es el precio de COMPRA y no va acá — esa va al ERP de
-- compras, neteada.
--
-- Mismo precio en los seis canales, como se cargaron Intipharma y
-- Generion: la lista no distingue canal.
--
-- ── Sin escalas ──────────────────────────────────────────────────────
-- A diferencia de Generion (1048), este archivo trae UN solo precio por
-- producto: no hay tramos por cantidad. La columna CANTIDAD viene vacía en
-- las 65 filas. Así que no se cargan `promo_escalas`; el día que Daxolab
-- entregue escalas, es una migración aparte.
--
-- ── Los bonificados ──────────────────────────────────────────────────
-- Los 65 BO entran como productos propios y SIN precio, igual que los
-- BOGNR, BOJAM y BODHP que ya existen: son el mismo artículo que llega sin
-- costo. Sin ellos, el día que el almacén cargue stock de un bonificado el
-- importador lo rechazaría por código desconocido.
--
-- Nueve códigos de bonificado de la línea DXL venían en el archivo sin la
-- L (BODX04 … BODX12), mientras DXL001–003 y las 53 filas de DXG y DXN sí
-- la llevan. El usuario confirmó el 2026-11-25 que es un error de tipeo del
-- laboratorio y que van uniformados a BODXL04 … BODXL12.

-- Este archivo documenta una carga de datos que se aplicó a mano contra la
-- base (ver el README de migraciones). Se deja acá para que el repo tenga
-- el criterio y los números, no para re-ejecutarlo a ciegas: los `insert`
-- usan `on conflict do nothing`, así que re-correrlo no duplica nada.

insert into pedidos.suppliers (nombre, estado)
select 'Daxolab', 'activo'
where not exists (select 1 from pedidos.suppliers where nombre = 'Daxolab');

-- ---------------------------------------------------------------------
-- 1. Los 65 productos y sus 65 bonificados
-- ---------------------------------------------------------------------
insert into pedidos.products
  (codigo_interno, descripcion, presentacion, principio_activo, unidad_medida,
   codigo_bonificacion, supplier_id, estado)
select v.codigo, v.descripcion, v.presentacion, v.principio_activo, v.unidad, v.bonificado,
       (select id from pedidos.suppliers where nombre = 'Daxolab'), 'activo'
from (values
  ('DXL001', 'ABRIDAX JARABE 200 ml (Sabor Menta)', 'Jarabe x 200ml', 'Hedera Helix 39.50 mg / 5 ml x 200 ml', 'FRASCO JARABE', 'BODXL01'),
  ('DXL002', 'AMODAX CL Caja x 100 TAB RECUBIERTAS', 'Tab Caja x 100', 'Amoxicilina 500 mg + A Clavulanico 125mg', 'TABLETA', 'BODXL02'),
  ('DXL003', 'BANTER 4 MG', 'Tab Caja x 100', 'Dexametasona 4 mg', 'TABLETA', 'BODXL03'),
  ('DXL004', 'CELEDAXIB 200 MG CAJA X 100 CAP', 'Cáp Caja x 100', 'Celecoxib 200 mg', 'CAPSULA', 'BODXL04'),
  ('DXL005', 'CELEDAXIB 400 MG CAJA X 30 CAP', 'Cáp Caja x 30', 'Celecoxib 400 mg', 'CAPSULA', 'BODXL05'),
  ('DXL006', 'CEFTRIDAX 1 GR x 01 VIAL + Lidocaina', 'AMP x 1', 'Ceftriaxona 1G IM + Lidocaina', 'AMPOLLA', 'BODXL06'),
  ('DXL007', 'DESTOLAB Crema x 30 GR TUBO', 'Tubo x 30 GR', 'Permetrina 5 %', 'TUBO', 'BODXL07'),
  ('DXL008', 'DESTOLAB Crema x 60 GR TUBO', 'Tubo x 60 GR', 'Permetrina 5 %', 'TUBO', 'BODXL08'),
  ('DXL009', 'DERMODAX CREMA 20 GR', 'Tubo x 20 GR', 'Clotrimazol 1.0g + Gentamicina0.1g + Betametasona 0.05g', 'TUBO', 'BODXL09'),
  ('DXL010', 'NEURODAXIN FORTE CAJA x 3 AMPOLLAS', 'CAJA x 3 AMP ml', 'VIT. B1, B2, B3, B5, B6, B12', 'AMPOLLA', 'BODXL10'),
  ('DXL011', 'PULMO - REGENEREX 600 GR', 'Frasco x', 'Nutricion para /pacientes c/problema pulmonares', 'FRASCO', 'BODXL11'),
  ('DXL012', 'BALANCE DBT 600 GR', 'Frasco x', 'Nutricion para /pacientes Pre o Diabéticos', 'FRASCO', 'BODXL12'),
  ('DXG001', 'ACICLOVIR 400 MG Caja x 100 Tabletas', 'Tab Caja x 100', 'Aciclovir 400 mg', 'TABLETA', 'BODXG01'),
  ('DXG002', 'AZITROMICINA 500 MG Alu Alu CAJA X 100 TAB RECUB', 'Tab Caja x 100', 'Azitromicina 500 mg', 'TABLETA', 'BODXG02'),
  ('DXG003', 'AZITROMICINA 200mg/5mL 30 ML POLVO PARA SUSP.', 'SUSP. X 30 ml', 'Azitromicina 200mg/5mL Polvo 30 ML Susp. ( Sabor Banana)', 'POLVO SUSPENSIÓN', 'BODXG03'),
  ('DXG004', 'CELECOXIB 400 MG CAJA X 50 CAP', 'Cáp Caja x 50', 'Celecoxib 400 mg', 'CAPSULA', 'BODXG04'),
  ('DXG005', 'ETORICOXIB 90 MG', 'Tab Caja x 60', 'Etoricoxib 90 MG', 'TABLETA', 'BODXG05'),
  ('DXG006', 'ETORICOXIB 120 MG', 'Tab Caja x 60', 'Etoricoxib 120 MG', 'TABLETA', 'BODXG06'),
  ('DXG007', 'FLAVOXATO 200 MG Caja x 30 TAB RECUBIERTAS', 'Tab Rec Caja x 30', 'Flavoxato 200 MG ALU ALU', 'TABLETAS RECUB.', 'BODXG07'),
  ('DXG008', 'FENITOINA SÓDICO 100 mg Caja x 100 TAB RECUBIERTAS', 'Tab Caja x 100', 'Fenitoina Sódica 100 mg', 'TABLETA', 'BODXG08'),
  ('DXG009', 'KETOPROFENO 100 MG Caja x 100 Tab LIBERACION Prolongada', 'Tab Caja x 100', 'Ketoprofeno 100 MG Tab. Lib. Prolongada', 'TABLETA', 'BODXG09'),
  ('DXG010', 'LOSARTAN 50 mg CAJA X 100 TAB RECUBIERTA', 'Tab Caja x 100', 'Losartan 50 MG', 'TABLETA', 'BODXG10'),
  ('DXG011', 'PREGABALINA 75 MG', 'Caja Alu Alu x 30', 'Pregabalina 75 MG', 'CAPSULA', 'BODXG11'),
  ('DXG012', 'PREGABALINA 150 MG', 'Caja Alu Alu x 30', 'Pregabalina 150 MG', 'CAPSULA', 'BODXG12'),
  ('DXN001', 'VITA C PLUS 300 GR', 'Frasco 300 gr', 'Vitamina C 1000 MG (Sabor Naranja)', 'FRASCO', 'BODXN01'),
  ('DXN002', 'CALCIO FORTE 300 GR', 'Lata 300 gr', 'Citrato de Calcio + Vitamina D3 (Sabor Vainilla)', 'POTE', 'BODXN02'),
  ('DXN003', 'CALCIO FORTE CAJA X 10 GR CAJA x 30 Sachet', 'Sachet 10 gr', 'Citrato de Calcio + Vitamina D3 (Sabor Vainilla)', 'SACHETS', 'BODXN03'),
  ('DXN004', 'MUJER BALANCE Frasco x 120 Capsulas', 'Frasco x 120 Cap', 'Myo-Inositol, Inositol, Acido Folico, Vit D, Citrato', 'CAPSULA', 'BODXN04'),
  ('DXN005', 'NATU ZINC KIDS NIÑOS Y NIÑAS FRESA 300 GR', 'Frasco 300 gr', 'Citrato de Zinc 30 mg (Sabor Fresa)', 'FRASCO', 'BODXN05'),
  ('DXN006', 'PROPOMIEL 250 ML', 'Frasco 250 ML', 'Propolio + Palto + Miel', 'FRASCO', 'BODXN06'),
  ('DXN007', 'CITRATE PLUS Lata 350 GR', 'Lata 350 gr', 'Citrato de Magnesio (Frutos Rojos)', 'POTE', 'BODXN07'),
  ('DXN008', 'CITRATE PLUS SACHET 10 GR CAJA x 30 Sachet', 'Sachet 10 gr', 'Citrato de Magnesio (Frutos Rojos)', 'SACHETS', 'BODXN08'),
  ('DXN009', 'URO PLUS Lata 350 GR', 'Lata 350 gr', 'Citrato de Potasio (Naranja)', 'POTE', 'BODXN09'),
  ('DXN010', 'URO PLUS SACHET 10 GR CAJA x 30 Sachet', 'Sachet 10 gr', 'Citrato de Potasio (Naranja)', 'SACHETS', 'BODXN10'),
  ('DXN011', 'CLORU MAX PLUS 250 GR', 'Frasco 250 gr', 'Cloruro de Magnesio', 'FRASCO', 'BODXN11'),
  ('DXN012', 'CLORU MAX PLUS LIMA-LIMON 250 GR', 'Frasco 250 gr', 'Cloruro de Magnesio (Lima / Limon)', 'FRASCO', 'BODXN12'),
  ('DXN013', 'REGENEREX COMPLEX GEL ORAL (Sabor Maracuya)', 'Caja x 15 Sobres', 'Colágeno Hidrolizado 5g + Ácido Hialurónico 100 mg', 'SOBRES', 'BODXN13'),
  ('DXN014', 'HIDRO COLAG PREMIUN GEL ORAL (Sabor Maracuya)', 'Caja x 15 Sobres', 'Colágeno Hidrolizado 5g.', 'SOBRES', 'BODXN14'),
  ('DXN015', 'CARTIFLEX 600 GR (Sabor Naranja)', 'Frasco 600 gr', 'Colágeno Hidrolizado + Cartilago de Tiburon + Calcio', 'FRASCO', 'BODXN15'),
  ('DXN016', 'CONDRI PLUS 600 GR (Sabor Naranja)', 'Frasco 600 gr', 'Colágeno Hidrolizado + Condroitina + Glucosamina Sulfato', 'FRASCO', 'BODXN16'),
  ('DXN017', 'CONDRI PLUS 300 GR (Sabor Naranja)', 'Frasco 300 gr', 'Colágeno Hidrolizado + Condroitina + Glucosamina Sulfato', 'FRASCO', 'BODXN17'),
  ('DXN018', 'CONDRI PLUS SACHET 10 GR CAJA x 30 Sachet', 'Sachet 10 gr', 'Colágeno Hidrolizado + Condroitina + Glucosamina Sulfato', 'SACHETS', 'BODXN18'),
  ('DXN019', 'GLUCO PLUS 600 GR (Sabor Naranja)', 'Frasco 600 gr', 'Colágeno Hidrolizado + Glucosamina Sulfato + Calcio', 'FRASCO', 'BODXN19'),
  ('DXN020', 'GLUCO PLUS 300 GR (Sabor Naranja)', 'Frasco 300 gr', 'Colágeno Hidrolizado + Glucosamina Sulfato + Calcio', 'FRASCO', 'BODXN20'),
  ('DXN021', 'GLUCO PLUS SACHET 10 GR CAJA x 30 Sachet', 'Sachet 10 gr', 'Colágeno Hidrolizado + Glucosamina Sulfato + Calcio', 'SACHETS', 'BODXN21'),
  ('DXN022', 'NATU FLEX 600 GR (Sabor Maca)', 'Frasco 600 gr', 'Colágeno Hidrolizado + Magnesio + Zinc+ MACA', 'FRASCO', 'BODXN22'),
  ('DXN023', 'NATU FLEX 300 GR (Sabor Maca)', 'Frasco 300 gr', 'Colágeno Hidrolizado + Magnesio + Zinc+ MACA', 'FRASCO', 'BODXN23'),
  ('DXN024', 'HIDRO COLAG PREMIUN 350 GR (Sabor Naranja)', 'Frasco 300 gr', 'COLÁGENO HIDROLIZADO + VIT C', 'FRASCO', 'BODXN24'),
  ('DXN025', 'REGENEREX COMPLEX 300 GR (Sabor Frutos Rojos)', 'Lata 300 gr', 'Colágeno Hidrolizado + Ácido Hialurónico', 'POTE', 'BODXN25'),
  ('DXN026', 'REGENEREX PLUS 600 GR (Sabor Naranja)', 'Frasco 600 gr', 'Colágeno Hidrolizado + Ácido Hialurónico + Biotina + Q10', 'FRASCO', 'BODXN26'),
  ('DXN027', 'REGENEREX PLUS 300 GR (Sabor Naranja)', 'Frasco 300 gr', 'Colágeno Hidrolizado + Ácido Hialurónico + Biotina + Q10', 'FRASCO', 'BODXN27'),
  ('DXN028', 'REGENEREX PLUS SACHET 10 GR CAJA x 30 Sachet', 'Sachet 10 gr', 'Colágeno Hidrolizado + Ácido Hialurónico + Biotina + Q10', 'SACHETS', 'BODXN28'),
  ('DXN029', 'GOMITAS HIERRO KIDS (Sabor Fresa)', 'Frasco x 60', 'Gomitas Hierro, Fibra y Propoleo', 'FRASCO', 'BODXN29'),
  ('DXN030', 'GOMITAS ZINC KIDS (Sabor Piña)', 'Frasco x 60', 'Gomitas Zinc, Vitamina C y Propoleo', 'FRASCO', 'BODXN30'),
  ('DXN031', 'GOMITAS OMEGA 3 KIDS (Sabor Naranja)', 'Frasco x 60', 'Omega 3 DHA, ARA, EPA', 'FRASCO', 'BODXN31'),
  ('DXN032', 'GOMITAS MULTIVITAMINAS KIDS A, B, D, y E (Sabor Chicle)', 'Frasco x 60', 'Vitaminas A, B, D y E', 'FRASCO', 'BODXN32'),
  ('DXN033', 'GOMITAS REGENEREX PLUS (Sabor Uva)', 'Frasco x 60', 'Colágeno, Biotina, Resveratrol y VIT C', 'FRASCO', 'BODXN33'),
  ('DXN034', 'GOMITAS OMEGA 3,6 y 9 (Sabor Naranja)', 'Frasco x 60', 'Omega 3,6, y 9 DHA, ARA, EPA', 'FRASCO', 'BODXN34'),
  ('DXN035', 'GOMITAS MULTIVITAMINAS A, B, D, y E (Sabor Chicle)', 'Frasco x 60', 'Vitaminas A, B, D y E', 'FRASCO', 'BODXN35'),
  ('DXN036', 'GOMITAS MELATONINA 5 MG (Sabor Manzana)', 'Frasco x 60', 'Extractos naturales, Melatonina 5 mg', 'FRASCO', 'BODXN36'),
  ('DXN037', 'GOMITAS CALCIO FORTE (Sabor Pera)', 'Frasco x 60', 'Citrato de calcio + Vitamina D3', 'FRASCO', 'BODXN37'),
  ('DXN038', 'GOMITAS FLORA PLUS (Sabor Fresa)', 'Frasco x 60', 'Prebioticos y Probioticos', 'FRASCO', 'BODXN38'),
  ('DXN039', 'GOMITA VINAGRE DE MANZANA (Sabor Sandia)', 'Frasco x 60', 'Vinagre de Manzana +Inulina + VIT B12', 'FRASCO', 'BODXN39'),
  ('DXN040', 'GOMITAS AGUAJE (Sabor Guaraná)', 'Frasco x 60', 'Aguaje Roja +Fenogreco + Arginina', 'FRASCO', 'BODXN40'),
  ('DXN041', 'GOMITAS CITRATE PLUS (Sabor Frutos Rojos)', 'Frasco x 60', 'Citrato de Magnesio', 'FRASCO', 'BODXN41')
) as v(codigo, descripcion, presentacion, principio_activo, unidad, bonificado)
on conflict (codigo_interno) do nothing;

-- El bonificado hereda descripción, presentación y unidad de su base: es el
-- mismo artículo, sólo que llega sin costo.
insert into pedidos.products
  (codigo_interno, descripcion, presentacion, principio_activo, unidad_medida, supplier_id, estado)
select b.codigo_bonificacion, b.descripcion, b.presentacion, b.principio_activo,
       b.unidad_medida, b.supplier_id, 'activo'
from pedidos.products b
where b.codigo_interno like 'DX%' and b.codigo_bonificacion is not null
on conflict (codigo_interno) do nothing;

insert into pedidos.product_tax_profiles (product_id, afectacion_tributaria, tasa_aplicable, vigente_desde)
select p.id, 'GRAVADO', 18.00, current_date
from pedidos.products p
where (p.codigo_interno like 'DX%' or p.codigo_interno like 'BODX%')
  and not exists (select 1 from pedidos.product_tax_profiles t
                   where t.product_id = p.id and t.vigente_hasta is null);

-- ---------------------------------------------------------------------
-- 2. La lista de precios, igual en los seis canales
-- ---------------------------------------------------------------------
with lista as (
  insert into pedidos.price_lists (supplier_id, fecha_inicio, archivo_nombre, importado_por)
  select (select id from pedidos.suppliers where nombre = 'Daxolab'), current_date,
         'LISTA_DE_PRECIOS_DAXOLAV.xlsx',
         (select id from pedidos.profiles where email = 'aromero@logisalud.com')
  where not exists (
    select 1 from pedidos.price_list_items i
    join pedidos.products p on p.id = i.product_id
    where p.codigo_interno like 'DX%' and i.vigente_hasta is null)
  returning id
),
precios(codigo, precio) as (values
  ('DXL001', 15),
  ('DXL002', 100),
  ('DXL003', 40),
  ('DXL004', 50),
  ('DXL005', 50),
  ('DXL006', 6),
  ('DXL007', 28),
  ('DXL008', 38),
  ('DXL009', 6),
  ('DXL010', 36),
  ('DXL011', 65),
  ('DXL012', 65),
  ('DXG001', 35),
  ('DXG002', 78),
  ('DXG003', 7.5),
  ('DXG004', 55),
  ('DXG005', 50),
  ('DXG006', 60),
  ('DXG007', 27.5),
  ('DXG008', 36.5),
  ('DXG009', 42),
  ('DXG010', 9),
  ('DXG011', 15),
  ('DXG012', 28),
  ('DXN001', 25),
  ('DXN002', 40),
  ('DXN003', 50),
  ('DXN004', 60),
  ('DXN005', 25),
  ('DXN006', 13.5),
  ('DXN007', 40),
  ('DXN008', 35),
  ('DXN009', 40),
  ('DXN010', 35),
  ('DXN011', 20.5),
  ('DXN012', 20.5),
  ('DXN013', 42),
  ('DXN014', 38),
  ('DXN015', 68),
  ('DXN016', 68),
  ('DXN017', 40),
  ('DXN018', 65),
  ('DXN019', 68),
  ('DXN020', 40),
  ('DXN021', 55),
  ('DXN022', 68),
  ('DXN023', 40),
  ('DXN024', 38),
  ('DXN025', 50),
  ('DXN026', 68),
  ('DXN027', 40),
  ('DXN028', 55),
  ('DXN029', 26.5),
  ('DXN030', 26.5),
  ('DXN031', 26.5),
  ('DXN032', 26.5),
  ('DXN033', 26.5),
  ('DXN034', 26.5),
  ('DXN035', 26.5),
  ('DXN036', 26.5),
  ('DXN037', 26.5),
  ('DXN038', 26.5),
  ('DXN039', 26.5),
  ('DXN040', 26.5),
  ('DXN041', 26.5)
)
insert into pedidos.price_list_items (price_list_id, product_id, sales_channel_id, precio, vigente_desde)
select (select id from lista), p.id, c.id, pr.precio::numeric, current_date
from precios pr
join pedidos.products p on p.codigo_interno = pr.codigo
cross join pedidos.sales_channels c
where exists (select 1 from lista);
