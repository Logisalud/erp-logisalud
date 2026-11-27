-- 0093 — Lista de Daxolab en el catálogo de compra (65 productos + 65 bonificados).
--
-- Laboratorio nuevo. Lista entregada por el usuario el 2026-11-25
-- (LISTA_DE_PRECIOS_DAXOLAV.xlsx, 65 filas), en tres líneas: DXL (marca,
-- 12), DXG (genéricos, 12) y DXN (nutracéuticos, 41). Cada fila trae su
-- CÓDIGO LOGISALUD y su CÓDIGO BONIFICACIÓN, así que entran DOS filas por
-- producto, igual que Intipharma (0091) y Generion (0082): el regular, que
-- se compra, y el bonificado, que llega sin costo.
--
-- ── El precio ────────────────────────────────────────────────────────────
-- La columna amarilla del Excel —"PVF A DISTRIBUIDORA NOV 2026"— es el
-- precio de compra CON IGV, y `catalogo.productos.precio_compra` es NETO:
-- la OC le suma el 18% encima (`separarPorIgv` en domain/orden-compra.ts).
-- Se carga PVF / 1.18, con los 4 decimales que admite la columna.
--
-- La comprobación es del propio archivo: trae las columnas "VVD (SIN IGV)"
-- e "IGV (18%)", y VVD + IGV da exactamente la columna amarilla en las 65
-- filas. El neto que se carga acá coincide con esa VVD en las 65, al
-- cuarto decimal. Ninguna fila viene en cero ni vacía.
--
-- ── Los bonificados ──────────────────────────────────────────────────────
-- Los 65 BO van en **0.00 y no en null**, igual que los de Intipharma y
-- Generion: es lo que hace que la OC traiga la línea ya valorizada en cero
-- en vez de pedir que la tipeen. Un bonificado cuesta cero por definición.
--
-- Nueve códigos de bonificado de la línea DXL venían en el archivo sin la
-- L (BODX04 … BODX12), mientras DXL001–003 y las 53 filas de DXG y DXN sí
-- la llevan. El usuario confirmó el 2026-11-25 que es un error de tipeo del
-- laboratorio y que van uniformados a BODXL04 … BODXL12.
--
-- ── IGV ──────────────────────────────────────────────────────────────────
-- Las 65 filas traen la columna "IGV (18%)" calculada, así que
-- `exonerado_igv` queda en false, que es el default.
--
-- ── Qué NO entra ─────────────────────────────────────────────────────────
-- `proveedor_id` queda null: Daxolab todavía no existe en
-- `compras.proveedores` y nadie entregó su RUC. El buscador de la OC no
-- filtra por proveedor, así que no impide usarlos; cuando se dé de alta el
-- proveedor es un UPDATE de una línea.
--
-- MASTER PACK viene vacía en las 65 filas. FECHA VENCIMIENTO es la del lote
-- que ofrecen hoy, no del producto: ninguna de las dos se guarda.
--
-- Re-ejecutable: `on conflict (codigo) do nothing`.

insert into catalogo.productos
  (codigo, codigo_bonificacion, descripcion, presentacion, principio_activo, unidad_medida, precio_compra)
values
  ('DXL001', 'BODXL01', 'ABRIDAX JARABE 200 ml (Sabor Menta)', 'Jarabe x 200ml', 'Hedera Helix 39.50 mg / 5 ml x 200 ml', 'FRASCO JARABE', 10.1695),
  ('DXL002', 'BODXL02', 'AMODAX CL Caja x 100 TAB RECUBIERTAS', 'Tab Caja x 100', 'Amoxicilina 500 mg + A Clavulanico 125mg', 'TABLETA', 55.0847),
  ('DXL003', 'BODXL03', 'BANTER 4 MG', 'Tab Caja x 100', 'Dexametasona 4 mg', 'TABLETA', 21.1864),
  ('DXL004', 'BODXL04', 'CELEDAXIB 200 MG CAJA X 100 CAP', 'Cáp Caja x 100', 'Celecoxib 200 mg', 'CAPSULA', 21.1864),
  ('DXL005', 'BODXL05', 'CELEDAXIB 400 MG CAJA X 30 CAP', 'Cáp Caja x 30', 'Celecoxib 400 mg', 'CAPSULA', 29.661),
  ('DXL006', 'BODXL06', 'CEFTRIDAX 1 GR x 01 VIAL + Lidocaina', 'AMP x 1', 'Ceftriaxona 1G IM + Lidocaina', 'AMPOLLA', 3.39),
  ('DXL007', 'BODXL07', 'DESTOLAB Crema x 30 GR TUBO', 'Tubo x 30 GR', 'Permetrina 5 %', 'TUBO', 17.7966),
  ('DXL008', 'BODXL08', 'DESTOLAB Crema x 60 GR TUBO', 'Tubo x 60 GR', 'Permetrina 5 %', 'TUBO', 26.2715),
  ('DXL009', 'BODXL09', 'DERMODAX CREMA 20 GR', 'Tubo x 20 GR', 'Clotrimazol 1.0g + Gentamicina0.1g + Betametasona 0.05g', 'TUBO', 2.9659),
  ('DXL010', 'BODXL10', 'NEURODAXIN FORTE CAJA x 3 AMPOLLAS', 'CAJA x 3 AMP ml', 'VIT. B1, B2, B3, B5, B6, B12', 'AMPOLLA', 21.6092),
  ('DXL011', 'BODXL11', 'PULMO - REGENEREX 600 GR', 'Frasco x', 'Nutricion para /pacientes c/problema pulmonares', 'FRASCO', 38.1352),
  ('DXL012', 'BODXL12', 'BALANCE DBT 600 GR', 'Frasco x', 'Nutricion para /pacientes Pre o Diabéticos', 'FRASCO', 38.1352),
  ('DXG001', 'BODXG01', 'ACICLOVIR 400 MG Caja x 100 Tabletas', 'Tab Caja x 100', 'Aciclovir 400 mg', 'TABLETA', 25.4237),
  ('DXG002', 'BODXG02', 'AZITROMICINA 500 MG Alu Alu CAJA X 100 TAB RECUB', 'Tab Caja x 100', 'Azitromicina 500 mg', 'TABLETA', 55.0847),
  ('DXG003', 'BODXG03', 'AZITROMICINA 200mg/5mL 30 ML POLVO PARA SUSP.', 'SUSP. X 30 ml', 'Azitromicina 200mg/5mL Polvo 30 ML Susp. ( Sabor Banana)', 'POLVO SUSPENSIÓN', 5.0847),
  ('DXG004', 'BODXG04', 'CELECOXIB 400 MG CAJA X 50 CAP', 'Cáp Caja x 50', 'Celecoxib 400 mg', 'CAPSULA', 38.1356),
  ('DXG005', 'BODXG05', 'ETORICOXIB 90 MG', 'Tab Caja x 60', 'Etoricoxib 90 MG', 'TABLETA', 25.4237),
  ('DXG006', 'BODXG06', 'ETORICOXIB 120 MG', 'Tab Caja x 60', 'Etoricoxib 120 MG', 'TABLETA', 33.8983),
  ('DXG007', 'BODXG07', 'FLAVOXATO 200 MG Caja x 30 TAB RECUBIERTAS', 'Tab Rec Caja x 30', 'Flavoxato 200 MG ALU ALU', 'TABLETAS RECUB.', 16.9492),
  ('DXG008', 'BODXG08', 'FENITOINA SÓDICO 100 mg Caja x 100 TAB RECUBIERTAS', 'Tab Caja x 100', 'Fenitoina Sódica 100 mg', 'TABLETA', 22.4576),
  ('DXG009', 'BODXG09', 'KETOPROFENO 100 MG Caja x 100 Tab LIBERACION Prolongada', 'Tab Caja x 100', 'Ketoprofeno 100 MG Tab. Lib. Prolongada', 'TABLETA', 29.661),
  ('DXG010', 'BODXG10', 'LOSARTAN 50 mg CAJA X 100 TAB RECUBIERTA', 'Tab Caja x 100', 'Losartan 50 MG', 'TABLETA', 5.5085),
  ('DXG011', 'BODXG11', 'PREGABALINA 75 MG', 'Caja Alu Alu x 30', 'Pregabalina 75 MG', 'CAPSULA', 8.8983),
  ('DXG012', 'BODXG12', 'PREGABALINA 150 MG', 'Caja Alu Alu x 30', 'Pregabalina 150 MG', 'CAPSULA', 15.2542),
  ('DXN001', 'BODXN01', 'VITA C PLUS 300 GR', 'Frasco 300 gr', 'Vitamina C 1000 MG (Sabor Naranja)', 'FRASCO', 15.2542),
  ('DXN002', 'BODXN02', 'CALCIO FORTE 300 GR', 'Lata 300 gr', 'Citrato de Calcio + Vitamina D3 (Sabor Vainilla)', 'POTE', 25.4237),
  ('DXN003', 'BODXN03', 'CALCIO FORTE CAJA X 10 GR CAJA x 30 Sachet', 'Sachet 10 gr', 'Citrato de Calcio + Vitamina D3 (Sabor Vainilla)', 'SACHETS', 29.661),
  ('DXN004', 'BODXN04', 'MUJER BALANCE Frasco x 120 Capsulas', 'Frasco x 120 Cap', 'Myo-Inositol, Inositol, Acido Folico, Vit D, Citrato', 'CAPSULA', 33.8983),
  ('DXN005', 'BODXN05', 'NATU ZINC KIDS NIÑOS Y NIÑAS FRESA 300 GR', 'Frasco 300 gr', 'Citrato de Zinc 30 mg (Sabor Fresa)', 'FRASCO', 15.2542),
  ('DXN006', 'BODXN06', 'PROPOMIEL 250 ML', 'Frasco 250 ML', 'Propolio + Palto + Miel', 'FRASCO', 9.7458),
  ('DXN007', 'BODXN07', 'CITRATE PLUS Lata 350 GR', 'Lata 350 gr', 'Citrato de Magnesio (Frutos Rojos)', 'POTE', 25.4237),
  ('DXN008', 'BODXN08', 'CITRATE PLUS SACHET 10 GR CAJA x 30 Sachet', 'Sachet 10 gr', 'Citrato de Magnesio (Frutos Rojos)', 'SACHETS', 21.1864),
  ('DXN009', 'BODXN09', 'URO PLUS Lata 350 GR', 'Lata 350 gr', 'Citrato de Potasio (Naranja)', 'POTE', 25.4237),
  ('DXN010', 'BODXN10', 'URO PLUS SACHET 10 GR CAJA x 30 Sachet', 'Sachet 10 gr', 'Citrato de Potasio (Naranja)', 'SACHETS', 21.1864),
  ('DXN011', 'BODXN11', 'CLORU MAX PLUS 250 GR', 'Frasco 250 gr', 'Cloruro de Magnesio', 'FRASCO', 13.1356),
  ('DXN012', 'BODXN12', 'CLORU MAX PLUS LIMA-LIMON 250 GR', 'Frasco 250 gr', 'Cloruro de Magnesio (Lima / Limon)', 'FRASCO', 13.1356),
  ('DXN013', 'BODXN13', 'REGENEREX COMPLEX GEL ORAL (Sabor Maracuya)', 'Caja x 15 Sobres', 'Colágeno Hidrolizado 5g + Ácido Hialurónico 100 mg', 'SOBRES', 26.2714),
  ('DXN014', 'BODXN14', 'HIDRO COLAG PREMIUN GEL ORAL (Sabor Maracuya)', 'Caja x 15 Sobres', 'Colágeno Hidrolizado 5g.', 'SOBRES', 22.0336),
  ('DXN015', 'BODXN15', 'CARTIFLEX 600 GR (Sabor Naranja)', 'Frasco 600 gr', 'Colágeno Hidrolizado + Cartilago de Tiburon + Calcio', 'FRASCO', 48.3051),
  ('DXN016', 'BODXN16', 'CONDRI PLUS 600 GR (Sabor Naranja)', 'Frasco 600 gr', 'Colágeno Hidrolizado + Condroitina + Glucosamina Sulfato', 'FRASCO', 48.3051),
  ('DXN017', 'BODXN17', 'CONDRI PLUS 300 GR (Sabor Naranja)', 'Frasco 300 gr', 'Colágeno Hidrolizado + Condroitina + Glucosamina Sulfato', 'FRASCO', 25.4237),
  ('DXN018', 'BODXN18', 'CONDRI PLUS SACHET 10 GR CAJA x 30 Sachet', 'Sachet 10 gr', 'Colágeno Hidrolizado + Condroitina + Glucosamina Sulfato', 'SACHETS', 38.1356),
  ('DXN019', 'BODXN19', 'GLUCO PLUS 600 GR (Sabor Naranja)', 'Frasco 600 gr', 'Colágeno Hidrolizado + Glucosamina Sulfato + Calcio', 'FRASCO', 48.3051),
  ('DXN020', 'BODXN20', 'GLUCO PLUS 300 GR (Sabor Naranja)', 'Frasco 300 gr', 'Colágeno Hidrolizado + Glucosamina Sulfato + Calcio', 'FRASCO', 25.4237),
  ('DXN021', 'BODXN21', 'GLUCO PLUS SACHET 10 GR CAJA x 30 Sachet', 'Sachet 10 gr', 'Colágeno Hidrolizado + Glucosamina Sulfato + Calcio', 'SACHETS', 33.8983),
  ('DXN022', 'BODXN22', 'NATU FLEX 600 GR (Sabor Maca)', 'Frasco 600 gr', 'Colágeno Hidrolizado + Magnesio + Zinc+ MACA', 'FRASCO', 48.3051),
  ('DXN023', 'BODXN23', 'NATU FLEX 300 GR (Sabor Maca)', 'Frasco 300 gr', 'Colágeno Hidrolizado + Magnesio + Zinc+ MACA', 'FRASCO', 25.4237),
  ('DXN024', 'BODXN24', 'HIDRO COLAG PREMIUN 350 GR (Sabor Naranja)', 'Frasco 300 gr', 'COLÁGENO HIDROLIZADO + VIT C', 'FRASCO', 25.4237),
  ('DXN025', 'BODXN25', 'REGENEREX COMPLEX 300 GR (Sabor Frutos Rojos)', 'Lata 300 gr', 'Colágeno Hidrolizado + Ácido Hialurónico', 'POTE', 32.2034),
  ('DXN026', 'BODXN26', 'REGENEREX PLUS 600 GR (Sabor Naranja)', 'Frasco 600 gr', 'Colágeno Hidrolizado + Ácido Hialurónico + Biotina + Q10', 'FRASCO', 48.3051),
  ('DXN027', 'BODXN27', 'REGENEREX PLUS 300 GR (Sabor Naranja)', 'Frasco 300 gr', 'Colágeno Hidrolizado + Ácido Hialurónico + Biotina + Q10', 'FRASCO', 25.4237),
  ('DXN028', 'BODXN28', 'REGENEREX PLUS SACHET 10 GR CAJA x 30 Sachet', 'Sachet 10 gr', 'Colágeno Hidrolizado + Ácido Hialurónico + Biotina + Q10', 'SACHETS', 33.8983),
  ('DXN029', 'BODXN29', 'GOMITAS HIERRO KIDS (Sabor Fresa)', 'Frasco x 60', 'Gomitas Hierro, Fibra y Propoleo', 'FRASCO', 17.7966),
  ('DXN030', 'BODXN30', 'GOMITAS ZINC KIDS (Sabor Piña)', 'Frasco x 60', 'Gomitas Zinc, Vitamina C y Propoleo', 'FRASCO', 17.7966),
  ('DXN031', 'BODXN31', 'GOMITAS OMEGA 3 KIDS (Sabor Naranja)', 'Frasco x 60', 'Omega 3 DHA, ARA, EPA', 'FRASCO', 17.7966),
  ('DXN032', 'BODXN32', 'GOMITAS MULTIVITAMINAS KIDS A, B, D, y E (Sabor Chicle)', 'Frasco x 60', 'Vitaminas A, B, D y E', 'FRASCO', 17.7966),
  ('DXN033', 'BODXN33', 'GOMITAS REGENEREX PLUS (Sabor Uva)', 'Frasco x 60', 'Colágeno, Biotina, Resveratrol y VIT C', 'FRASCO', 17.7966),
  ('DXN034', 'BODXN34', 'GOMITAS OMEGA 3,6 y 9 (Sabor Naranja)', 'Frasco x 60', 'Omega 3,6, y 9 DHA, ARA, EPA', 'FRASCO', 17.7966),
  ('DXN035', 'BODXN35', 'GOMITAS MULTIVITAMINAS A, B, D, y E (Sabor Chicle)', 'Frasco x 60', 'Vitaminas A, B, D y E', 'FRASCO', 17.7966),
  ('DXN036', 'BODXN36', 'GOMITAS MELATONINA 5 MG (Sabor Manzana)', 'Frasco x 60', 'Extractos naturales, Melatonina 5 mg', 'FRASCO', 17.7966),
  ('DXN037', 'BODXN37', 'GOMITAS CALCIO FORTE (Sabor Pera)', 'Frasco x 60', 'Citrato de calcio + Vitamina D3', 'FRASCO', 17.7966),
  ('DXN038', 'BODXN38', 'GOMITAS FLORA PLUS (Sabor Fresa)', 'Frasco x 60', 'Prebioticos y Probioticos', 'FRASCO', 17.7966),
  ('DXN039', 'BODXN39', 'GOMITA VINAGRE DE MANZANA (Sabor Sandia)', 'Frasco x 60', 'Vinagre de Manzana +Inulina + VIT B12', 'FRASCO', 17.7966),
  ('DXN040', 'BODXN40', 'GOMITAS AGUAJE (Sabor Guaraná)', 'Frasco x 60', 'Aguaje Roja +Fenogreco + Arginina', 'FRASCO', 17.7966),
  ('DXN041', 'BODXN41', 'GOMITAS CITRATE PLUS (Sabor Frutos Rojos)', 'Frasco x 60', 'Citrato de Magnesio', 'FRASCO', 17.7966)
on conflict (codigo) do nothing;

-- Los 65 bonificados: mismo artículo, costo cero.
insert into catalogo.productos
  (codigo, descripcion, presentacion, principio_activo, unidad_medida, precio_compra)
select p.codigo_bonificacion, p.descripcion, p.presentacion, p.principio_activo, p.unidad_medida, 0.00
from catalogo.productos p
where p.codigo like 'DX%' and p.codigo_bonificacion is not null
on conflict (codigo) do nothing;
