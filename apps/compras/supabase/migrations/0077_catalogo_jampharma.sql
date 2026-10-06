-- Catálogo de JAM Pharma, proveedor nuevo. (Sebas, 2026-10-06.)
--
-- Sale de la hoja "PARA OC LOGISALUD" de su lista de precios de setiembre
-- 2026: 35 productos, cada uno con su bonificado (BOJAM…), mismo esquema que
-- el resto del catálogo — el producto base guarda su `codigo_bonificacion` y
-- el bonificado existe como fila propia.
--
-- ── El precio: SIN IGV ───────────────────────────────────────────────────
-- `precio_compra` se guarda sin IGV, igual que todo el catálogo (ALLERGY-BIO:
-- 54.2373 × 1.18 = 64.00), porque la OC lo precarga como precio unitario y le
-- suma el 18% al subtotal (domain/orden-compra.ts, calcularTotales).
--
-- La columna amarilla del Excel ("PVF A DISTRIBUIDORA") YA TRAE IGV: es la
-- fórmula `= VVD + IGV`. Lo que se carga es la columna N ("VVD sin IGV"), y
-- se comprobó fila por fila que N × 1.18 da la amarilla al céntimo.
--
-- ── Tres productos exonerados de IGV ─────────────────────────────────────
-- EMPALIZ 10MG (JAM313), EMPALIZ 25MG (JAM314) y FLOXIGA 10MG (JAM315) son
-- antidiabéticos (empagliflozina, dapagliflozina), exonerados de IGV. En el
-- Excel su fórmula es distinta a propósito — `R/1` en vez de `R/1.18`, y la
-- columna de IGV vacía —, así que su precio es el total sin impuesto.
--
-- Se cargan con ese precio (81.12, 81.12, 51.48), que es la base real. PERO
-- la OC hoy no sabe de líneas exoneradas: le suma 18% a todo el subtotal, así
-- que una OC con estos tres saldría 18% más cara de lo que es. Queda anotado
-- como pendiente; no se tapa acá bajando el precio, porque eso dejaría la
-- base imponible mal en los libros.
--
-- ── Sin proveedor todavía ────────────────────────────────────────────────
-- `proveedor_id` queda null: JAM Pharma no existe como proveedor y el Excel no
-- trae su RUC, que es obligatorio. No se inventa. La búsqueda de productos de
-- la OC no filtra por proveedor, así que los productos se pueden usar igual;
-- cuando se cree el proveedor, se vinculan.
--
-- Unidades según el vocabulario ya normalizado (0071/0072): TABLETA,
-- CAPSULA, y "TAB. REC." → TABLETAS RECUB.
--
-- Re-ejecutable: `on conflict (codigo) do nothing`.

-- Productos base (35)
insert into catalogo.productos
  (codigo, codigo_proveedor, codigo_bonificacion, descripcion, presentacion, principio_activo, unidad_medida, precio_compra)
values
  ('JAM101', 'MD77', 'BOJAM101', 'CITROFLOW K 1080 MG CAJA X 20 TABLETAS', 'Caja x 20 Tabletas', 'CITRATO DE POTASIO 1080MG', 'TABLETA', 25.4492),
  ('JAM102', 'MD11', 'BOJAM102', 'CITROFLOW K 1080 MG CAJA X 50 TABLETAS', 'Caja x 50 Tabletas', 'CITRATO DE POTASIO 1080MG', 'TABLETA', 63.4576),
  ('JAM103', 'MD60', 'BOJAM103', 'ORIFLOW DUO PRO 0.5MG + 0.4 MG CAJA X 30 CAPSULAS', 'Caja x 30 Capsulas', 'DUTASTARIDA 0.5MG + TAMSULOSINA 0.4MG', 'CAPSULA', 121.6271),
  ('JAM104', 'MD1', 'BOJAM104', 'ORIFLOW 0.4MG CAJA X 30 CÁPSULAS', 'Caja x 30 Cápsulas', 'TAMSULOSINA 0.4MG', 'CAPSULA', 51.5593),
  ('JAM105', 'MD8', 'BOJAM105', 'DOXAZIN 4MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'DOXAZOSINA 4MG', 'TABLETAS RECUB.', 100.4746),
  ('JAM106', 'MD10', 'BOJAM106', 'FENACINA 5MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'SOLIFENACINA 5MG', 'TABLETAS RECUB.', 98.4915),
  ('JAM107', 'MD85', 'BOJAM107', 'FENACINA DUO 5MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'TAMSULOSINA 30MG + SOLIFENACINA 6MG', 'TABLETAS RECUB.', 131.6746),
  ('JAM108', 'MD3', 'BOJAM108', 'FLAVOSEX 200MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'CLORH. DE FLAVOXATO 200MG', 'TABLETAS RECUB.', 50.2373),
  ('JAM109', 'MD58', 'BOJAM109', 'LEVOFLOW 500MG CAJA X 7 TABLETAS', 'Caja x 7 Tabletas', 'LEVOFLOXACINO 500MG', 'TABLETAS RECUB.', 25.0525),
  ('JAM110', 'MD59', 'BOJAM110', 'LEVOFLOW 750MG CAJA X 5 TABLETAS', 'Caja x 5 Tabletas', 'LEVOFLOXACINO 750MG', 'TABLETAS RECUB.', 27.5314),
  ('JAM201', 'MD36', 'BOJAM201', 'TENSOFLOW 5MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'CLORH. DE CICLOBENZAPRINA 5MG', 'TABLETAS RECUB.', 52.8153),
  ('JAM202', 'MD5', 'BOJAM202', 'TENSOFLOW 10MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'CLORH. DE CICLOBENZAPRINA 10MG', 'TABLETAS RECUB.', 56.1864),
  ('JAM203', 'MD6', 'BOJAM203', 'TENSOFLOW 15MG CAJA X 30 CAPSULAS', 'Caja x 30 Capsulas', 'CLORH. DE CICLOBENZAPRINA 15MG', 'CAPSULA', 50.2373),
  ('JAM204', 'MD20', 'BOJAM204', 'COX TOR 120MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'ETORICOXIB 120MG', 'TABLETAS RECUB.', 39.5288),
  ('JAM205', 'MD13', 'BOJAM205', 'JAMSUPRAL 1G CAJA X 100 TABLETAS', 'Caja x 100 Tabletas', 'PARACETAMOL 1G', 'TABLETA', 13.1542),
  ('JAM301', 'MD21', 'BOJAM301', 'IRBECARD 150MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'IRBESARTAN 150MG', 'TABLETAS RECUB.', 17.8475),
  ('JAM302', 'MD24', 'BOJAM302', 'OLMECARD 20MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'OLMESARTAN 20MG', 'TABLETAS RECUB.', 44.9492),
  ('JAM303', 'MD25', 'BOJAM303', 'OLMECARD 40MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'OLMESARTAN 40MG', 'TABLETAS RECUB.', 64.7797),
  ('JAM304', 'MD26', 'BOJAM304', 'OLMECARD H 40MG + 12.5MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'OLMESARTAN 40 MG+ HCTZ 12.5MG', 'TABLETAS RECUB.', 88.5763),
  ('JAM305', 'MD27', 'BOJAM305', 'OLMECARD H 40MG + 25 MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'OLMESARTAN 40MG + HCTZ 25MG', 'TABLETAS RECUB.', 91.2203),
  ('JAM306', 'MD47', 'BOJAM306', 'TELCAR 40MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'TELMISARTAN 40MG', 'TABLETAS RECUB.', 30.4068),
  ('JAM307', 'MD48', 'BOJAM307', 'TELCAR 80MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'TELMISARTAN 80MG', 'TABLETAS RECUB.', 44.9492),
  ('JAM308', 'MD50', 'BOJAM308', 'TELCARD H 80MG + 12.5MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'TELMISARTAN 80MG + HCTZ 12.5MG', 'TABLETAS RECUB.', 91.2203),
  ('JAM309', 'MD33', 'BOJAM309', 'ROSTATIN 10MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'ROSUVASTATINA 10MG', 'TABLETAS RECUB.', 25.7797),
  ('JAM310', 'MD34', 'BOJAM310', 'ROSTATIN 20MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'ROSUVASTATINA 20MG', 'TABLETAS RECUB.', 39.0000),
  ('JAM311', 'MD44', 'BOJAM311', 'LIXAVAN 15MG CAJA X 10 TABLETAS', 'Caja x 10 Tabletas', 'RIVAROXABAN 15MG', 'TABLETAS RECUB.', 25.1186),
  ('JAM312', 'MD45', 'BOJAM312', 'LIXAVAN 20MG CAJA X 10 TABLETAS', 'Caja x 10 Tabletas', 'RIVAROXABAN 20MG', 'TABLETAS RECUB.', 25.1186),
  ('JAM313', 'MD80', 'BOJAM313', 'EMPALIZ 10MG CAJA X 28 TABLETAS', 'Caja x 28 Tabletas', 'EMPAGLIFLOZINA 10 MG', 'TABLETAS RECUB.', 81.1200),
  ('JAM314', 'MD81', 'BOJAM314', 'EMPALIZ 25MG CAJA X 28 TABLETAS', 'Caja x 28 Tabletas', 'EMPAGLIFLOZINA 25 MG', 'TABLETAS RECUB.', 81.1200),
  ('JAM315', 'MS86', 'BOJAM315', 'FLOXIGA 10MG CAJA X 28 TABLETAS', 'Caja x 28 Tabletas', 'DAPAGLIFOSINA 10MG', 'TABLETAS RECUB.', 51.4800),
  ('JAM316', 'MD78', 'BOJAM316', 'APILTOX 2.5MG CAJA X 28 TABLETAS', 'Caja x 28 Tabletas', 'APIXABAN 2.5MG', 'TABLETAS RECUB.', 34.9017),
  ('JAM317', 'MD79', 'BOJAM317', 'APILTOX 5MG CAJA X 28 TABLETAS', 'Caja x 28 Tabletas', 'APIXABAN 5MG', 'TABLETAS RECUB.', 37.6780),
  ('JAM401', 'MD28', 'BOJAM401', 'DEPULOX 30MG CAJA X 30 CAPSULAS', 'Caja x 30 Capsulas', 'DULOXETINA 30MG', 'CAPSULA', 90.5593),
  ('JAM402', 'MD29', 'BOJAM402', 'DEPULOX 60MG CAJA X 30 CAPSULAS', 'Caja x 30 Capsulas', 'DULOXETINA 60MG', 'CAPSULA', 97.8305),
  ('JAM403', 'MD56', 'BOJAM403', 'DONESTA 10MG CAJA X 30 TABLETAS', 'Caja x 30 tabletas', 'DONEPEZILO 10MG', 'TABLETAS RECUB.', 80.6441)
on conflict (codigo) do nothing;

-- Bonificados (35). Sin precio: es lo que el laboratorio regala, y así está
-- el resto de los BO del catálogo.
insert into catalogo.productos
  (codigo, descripcion, presentacion, principio_activo, unidad_medida)
values
  ('BOJAM101', 'CITROFLOW K 1080 MG CAJA X 20 TABLETAS', 'Caja x 20 Tabletas', 'CITRATO DE POTASIO 1080MG', 'TABLETA'),
  ('BOJAM102', 'CITROFLOW K 1080 MG CAJA X 50 TABLETAS', 'Caja x 50 Tabletas', 'CITRATO DE POTASIO 1080MG', 'TABLETA'),
  ('BOJAM103', 'ORIFLOW DUO PRO 0.5MG + 0.4 MG CAJA X 30 CAPSULAS', 'Caja x 30 Capsulas', 'DUTASTARIDA 0.5MG + TAMSULOSINA 0.4MG', 'CAPSULA'),
  ('BOJAM104', 'ORIFLOW 0.4MG CAJA X 30 CÁPSULAS', 'Caja x 30 Cápsulas', 'TAMSULOSINA 0.4MG', 'CAPSULA'),
  ('BOJAM105', 'DOXAZIN 4MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'DOXAZOSINA 4MG', 'TABLETAS RECUB.'),
  ('BOJAM106', 'FENACINA 5MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'SOLIFENACINA 5MG', 'TABLETAS RECUB.'),
  ('BOJAM107', 'FENACINA DUO 5MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'TAMSULOSINA 30MG + SOLIFENACINA 6MG', 'TABLETAS RECUB.'),
  ('BOJAM108', 'FLAVOSEX 200MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'CLORH. DE FLAVOXATO 200MG', 'TABLETAS RECUB.'),
  ('BOJAM109', 'LEVOFLOW 500MG CAJA X 7 TABLETAS', 'Caja x 7 Tabletas', 'LEVOFLOXACINO 500MG', 'TABLETAS RECUB.'),
  ('BOJAM110', 'LEVOFLOW 750MG CAJA X 5 TABLETAS', 'Caja x 5 Tabletas', 'LEVOFLOXACINO 750MG', 'TABLETAS RECUB.'),
  ('BOJAM201', 'TENSOFLOW 5MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'CLORH. DE CICLOBENZAPRINA 5MG', 'TABLETAS RECUB.'),
  ('BOJAM202', 'TENSOFLOW 10MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'CLORH. DE CICLOBENZAPRINA 10MG', 'TABLETAS RECUB.'),
  ('BOJAM203', 'TENSOFLOW 15MG CAJA X 30 CAPSULAS', 'Caja x 30 Capsulas', 'CLORH. DE CICLOBENZAPRINA 15MG', 'CAPSULA'),
  ('BOJAM204', 'COX TOR 120MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'ETORICOXIB 120MG', 'TABLETAS RECUB.'),
  ('BOJAM205', 'JAMSUPRAL 1G CAJA X 100 TABLETAS', 'Caja x 100 Tabletas', 'PARACETAMOL 1G', 'TABLETA'),
  ('BOJAM301', 'IRBECARD 150MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'IRBESARTAN 150MG', 'TABLETAS RECUB.'),
  ('BOJAM302', 'OLMECARD 20MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'OLMESARTAN 20MG', 'TABLETAS RECUB.'),
  ('BOJAM303', 'OLMECARD 40MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'OLMESARTAN 40MG', 'TABLETAS RECUB.'),
  ('BOJAM304', 'OLMECARD H 40MG + 12.5MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'OLMESARTAN 40 MG+ HCTZ 12.5MG', 'TABLETAS RECUB.'),
  ('BOJAM305', 'OLMECARD H 40MG + 25 MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'OLMESARTAN 40MG + HCTZ 25MG', 'TABLETAS RECUB.'),
  ('BOJAM306', 'TELCAR 40MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'TELMISARTAN 40MG', 'TABLETAS RECUB.'),
  ('BOJAM307', 'TELCAR 80MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'TELMISARTAN 80MG', 'TABLETAS RECUB.'),
  ('BOJAM308', 'TELCARD H 80MG + 12.5MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'TELMISARTAN 80MG + HCTZ 12.5MG', 'TABLETAS RECUB.'),
  ('BOJAM309', 'ROSTATIN 10MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'ROSUVASTATINA 10MG', 'TABLETAS RECUB.'),
  ('BOJAM310', 'ROSTATIN 20MG CAJA X 30 TABLETAS', 'Caja x 30 Tabletas', 'ROSUVASTATINA 20MG', 'TABLETAS RECUB.'),
  ('BOJAM311', 'LIXAVAN 15MG CAJA X 10 TABLETAS', 'Caja x 10 Tabletas', 'RIVAROXABAN 15MG', 'TABLETAS RECUB.'),
  ('BOJAM312', 'LIXAVAN 20MG CAJA X 10 TABLETAS', 'Caja x 10 Tabletas', 'RIVAROXABAN 20MG', 'TABLETAS RECUB.'),
  ('BOJAM313', 'EMPALIZ 10MG CAJA X 28 TABLETAS', 'Caja x 28 Tabletas', 'EMPAGLIFLOZINA 10 MG', 'TABLETAS RECUB.'),
  ('BOJAM314', 'EMPALIZ 25MG CAJA X 28 TABLETAS', 'Caja x 28 Tabletas', 'EMPAGLIFLOZINA 25 MG', 'TABLETAS RECUB.'),
  ('BOJAM315', 'FLOXIGA 10MG CAJA X 28 TABLETAS', 'Caja x 28 Tabletas', 'DAPAGLIFOSINA 10MG', 'TABLETAS RECUB.'),
  ('BOJAM316', 'APILTOX 2.5MG CAJA X 28 TABLETAS', 'Caja x 28 Tabletas', 'APIXABAN 2.5MG', 'TABLETAS RECUB.'),
  ('BOJAM317', 'APILTOX 5MG CAJA X 28 TABLETAS', 'Caja x 28 Tabletas', 'APIXABAN 5MG', 'TABLETAS RECUB.'),
  ('BOJAM401', 'DEPULOX 30MG CAJA X 30 CAPSULAS', 'Caja x 30 Capsulas', 'DULOXETINA 30MG', 'CAPSULA'),
  ('BOJAM402', 'DEPULOX 60MG CAJA X 30 CAPSULAS', 'Caja x 30 Capsulas', 'DULOXETINA 60MG', 'CAPSULA'),
  ('BOJAM403', 'DONESTA 10MG CAJA X 30 TABLETAS', 'Caja x 30 tabletas', 'DONEPEZILO 10MG', 'TABLETAS RECUB.')
on conflict (codigo) do nothing;

-- ── El proveedor, y el vínculo ───────────────────────────────────────────
-- RUC pasado por Sebas el 2026-10-06. `condicion_pago_dias` queda en el
-- default (30) porque la lista de precios no dice el plazo pactado: hay que
-- confirmarlo con JAM y corregirlo desde la ficha del proveedor.
insert into compras.proveedores (ruc, razon_social, tipo)
select '20604137510', 'JAM PHARMACEUTICAL SAC', 'mercaderia'
where not exists (select 1 from compras.proveedores where ruc = '20604137510');

update catalogo.productos
   set proveedor_id = (select id from compras.proveedores where ruc = '20604137510'),
       updated_at = now()
 where (codigo like 'JAM%' or codigo like 'BOJAM%')
   and proveedor_id is null;
