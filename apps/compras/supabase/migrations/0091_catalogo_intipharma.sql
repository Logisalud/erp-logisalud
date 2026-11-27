-- 0091 — Lista de Intipharma en el catálogo de compra (14 productos + 14 bonificados).
--
-- Lista entregada por el usuario el 2026-11-21 (INTIPHARMA_PRECIOS.xlsx, 14
-- filas). Cada fila trae su CÓDIGO LOGISALUD (ITP0xx) y su CÓDIGO
-- BONIFICACIÓN (BOI0xx), así que entran DOS filas por producto, igual que
-- Generion (0082) y el resto del catálogo: el regular, que se compra, y el
-- bonificado, que llega sin costo. El vínculo queda declarado en
-- `codigo_bonificacion` del regular, que es de donde lo lee todo el módulo
-- (ver 0070).
--
-- Los 28 códigos son los mismos que ya tiene el ERP de pedidos para
-- Intipharma (ITP001–ITP014 y BOI001–BOI014, con la misma descripción al
-- carácter), así que un producto es el mismo en los dos sistemas.
--
-- ── El precio ────────────────────────────────────────────────────────────
-- La columna amarilla del Excel —"PVF A DISTRIBUIDORA OCT 2026"— es el
-- precio de compra CON IGV, y `catalogo.productos.precio_compra` es NETO:
-- la OC le suma el 18% encima (`separarPorIgv` en domain/orden-compra.ts).
-- Así que se carga PVF / 1.18, con los 4 decimales que admite la columna.
-- Reconstruido al revés, las 9 filas con precio vuelven a dar el valor del
-- archivo al céntimo; además el resultado coincide exactamente con la
-- columna "VVD (SIN IGV)" que trae el mismo Excel, que es la comprobación
-- que hizo el proveedor.
--
-- ── Los cinco sin precio ─────────────────────────────────────────────────
-- ITP010 a ITP014 (CLAVUBIOX, DOLALIVIO, las tres presentaciones de
-- FEBRIZOL) vienen en **0** en el archivo. Eso no es un precio de cero: es
-- un precio que todavía no entregaron. Se cargan con `precio_compra` null
-- —como los otros 110 del catálogo sin precio— y NO en 0.00, porque un cero
-- haría que el formulario de la OC traiga la línea valorizada en cero y
-- nadie se daría cuenta. Cuando llegue la lista con esos cinco, es un
-- UPDATE de cinco filas.
--
-- ── Los bonificados ──────────────────────────────────────────────────────
-- Los 14 BOI van en **0.00 y no en null**, igual que los de Generion: es lo
-- que hace que la OC traiga la línea ya valorizada en cero en vez de pedir
-- que la tipeen. Un bonificado cuesta cero por definición, a diferencia de
-- los cinco de arriba.
--
-- ── IGV ──────────────────────────────────────────────────────────────────
-- Las 14 filas llevan IGV (el Excel trae la columna "IGV (18%)" calculada
-- en todas), así que `exonerado_igv` queda en false, que es el default.
--
-- ── Qué NO entra ─────────────────────────────────────────────────────────
-- `proveedor_id` queda null. En `compras.proveedores` hay "CORPORATION
-- INTHERPHARMA S.A.C" (RUC 20515774182), que probablemente sea la misma
-- empresa, pero nadie lo confirmó todavía y asociar mal 28 productos es
-- peor que dejarlos sueltos: el buscador de la OC no filtra por proveedor,
-- así que no impide usarlos. Confirmado, es un UPDATE de una línea.
--
-- La columna MASTER PACK viene vacía en las 14 filas y FECHA VENCIMIENTO es
-- del lote que ofrecen hoy, no del producto: ninguna de las dos se guarda.
--
-- Re-ejecutable: `on conflict (codigo) do nothing`.

insert into catalogo.productos
  (codigo, codigo_bonificacion, descripcion, presentacion, principio_activo, unidad_medida, precio_compra)
values
  ('ITP001', 'BOI001', 'DIGESAN ENZIMA DIGESTIVAS CJA X 100 CAPS', 'Caja x 100 Cápsulas', 'Pancreatina 100mg + Pepsina 25mg + Papaína 50mg + Diastasa 15mg + Lipasa 13mg + Celulasa 15mg', 'CAPSULA', 50.8475),
  ('ITP002', 'BOI002', 'D3 VITAL CJA X 30 CAPS', 'Caja x 30 Cápsulas Blandas', 'Vitamina D3 x 2,000 UI', 'CAPSULA BLANDA', 15.8898),
  ('ITP003', 'BOI003', 'GRIPSIN PLUS CJA X 50 SBRS X 2 TABS REC', 'Caja x 50 Sobres x 2 Tab Rec.', 'Paracetamol 325mg + Clorfenamina 2mg + Fenilefrina 5mg + Dextrometorfano 10mg', 'SOBRES', 25.4237),
  ('ITP004', 'BOI004', 'MINOX CAPILAR SPRAY FCO X 60ML', 'Spray Frasco x 60 ML', 'Minoxidil 5% Solución Tópica', 'FRASCO', 20.9746),
  ('ITP005', 'BOI005', 'NEUROALIV 1000 INY IM CJA X 3 AMP X 2 ML', 'Caja x 3 Amp x 2 ML', 'Vit B1 (100mg) + B6 (100mg) + B12 (1,000mcg) x 2 ml', 'AMPOLLA', 15.2542),
  ('ITP006', 'BOI006', 'NOVITEL DHA CJA X 30 CAPS BDAS', 'Caja x 30 Cápsulas Blandas', 'DHA, EPA, Multivitaminas, Hierro, Yodo, Probióticos', 'CAPSULA BLANDA', 28.6017),
  ('ITP007', 'BOI007', 'NOVOBION 5000 CJA X 100 CAPS', 'Caja x 100 Cápsulas', 'Vit B1 (100mg) + B6 (100mg) + B12 (5,000mcg)', 'CAPSULA', 101.6949),
  ('ITP008', 'BOI008', 'URSOCOLIK 300 CJA X 30 TABS', 'Caja x 30 Tabletas', 'Acido ursodesoxicólico 300mg', 'TABLETA', 57.2034),
  ('ITP009', 'BOI009', 'VITALONE CJA X 4 CAPS BDAS', 'Caja x 4 Cápsulas Blandas', 'Vit D3 x 50,000 UI (Colecalciferol)', 'CAPSULA BLANDA', 28.6017),
  ('ITP010', 'BOI010', 'CLAVUBIOX 1000 CJA X 14 TABS REC', 'Caja x 14 Tab. Rec.', 'Amoxicilina 875 mg + Acido Clavulánico 125 mg', 'TABLETAS RECUB.', null),
  ('ITP011', 'BOI011', 'DOLALIVIO PEDIÁTRICO FCO X 60 ML', 'Frasco x 60 ML', 'Paracetamol 160mg/5ml', 'FRASCO', null),
  ('ITP012', 'BOI012', 'FEBRIZOL GOTAS FCO GOTERO X 10 ML', 'Frasco Gotero x 10 ML', 'Metamizol 500mg/ml', 'FRASCO', null),
  ('ITP013', 'BOI013', 'FEBRIZOL JBE FCO X 50 ML', 'Frasco x 50 ML', 'Metamizol 250mg/5ml', 'FRASCO JARABE', null),
  ('ITP014', 'BOI014', 'FEBRIZOL CJA X 100 TABS', 'Caja x 100 Tabletas', 'Metamizol 500mg', 'TABLETA', null)
on conflict (codigo) do nothing;

insert into catalogo.productos
  (codigo, descripcion, presentacion, unidad_medida, precio_compra)
values
  ('BOI001', 'DIGESAN ENZIMA DIGESTIVAS CJA X 100 CAPS', 'Caja x 100 Cápsulas', 'CAPSULA', 0.0000),
  ('BOI002', 'D3 VITAL CJA X 30 CAPS', 'Caja x 30 Cápsulas Blandas', 'CAPSULA BLANDA', 0.0000),
  ('BOI003', 'GRIPSIN PLUS CJA X 50 SBRS X 2 TABS REC', 'Caja x 50 Sobres x 2 Tab Rec.', 'SOBRES', 0.0000),
  ('BOI004', 'MINOX CAPILAR SPRAY FCO X 60ML', 'Spray Frasco x 60 ML', 'FRASCO', 0.0000),
  ('BOI005', 'NEUROALIV 1000 INY IM CJA X 3 AMP X 2 ML', 'Caja x 3 Amp x 2 ML', 'AMPOLLA', 0.0000),
  ('BOI006', 'NOVITEL DHA CJA X 30 CAPS BDAS', 'Caja x 30 Cápsulas Blandas', 'CAPSULA BLANDA', 0.0000),
  ('BOI007', 'NOVOBION 5000 CJA X 100 CAPS', 'Caja x 100 Cápsulas', 'CAPSULA', 0.0000),
  ('BOI008', 'URSOCOLIK 300 CJA X 30 TABS', 'Caja x 30 Tabletas', 'TABLETA', 0.0000),
  ('BOI009', 'VITALONE CJA X 4 CAPS BDAS', 'Caja x 4 Cápsulas Blandas', 'CAPSULA BLANDA', 0.0000),
  ('BOI010', 'CLAVUBIOX 1000 CJA X 14 TABS REC', 'Caja x 14 Tab. Rec.', 'TABLETAS RECUB.', 0.0000),
  ('BOI011', 'DOLALIVIO PEDIÁTRICO FCO X 60 ML', 'Frasco x 60 ML', 'FRASCO', 0.0000),
  ('BOI012', 'FEBRIZOL GOTAS FCO GOTERO X 10 ML', 'Frasco Gotero x 10 ML', 'FRASCO', 0.0000),
  ('BOI013', 'FEBRIZOL JBE FCO X 50 ML', 'Frasco x 50 ML', 'FRASCO JARABE', 0.0000),
  ('BOI014', 'FEBRIZOL CJA X 100 TABS', 'Caja x 100 Tabletas', 'TABLETA', 0.0000)
on conflict (codigo) do nothing;
