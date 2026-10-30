-- Catálogo de PHARMED, proveedor nuevo. (Sebas, 2026-10-30.)
--
-- Sale de la hoja "PARA OC LOGISALUD" de su lista de precios de octubre 2026
-- — misma plantilla que la de JAM Pharma (0077): 35 productos, cada uno con
-- su bonificado (BOPRD…), que existe como fila propia sin precio.
--
-- ── El precio: SIN IGV ───────────────────────────────────────────────────
-- `precio_compra` se guarda sin IGV, como todo el catálogo: la OC lo
-- precarga como precio unitario y le suma el 18%. La columna amarilla
-- ("PVF A DISTRIBUIDORA OCT 2026") YA TRAE IGV; lo que se carga es la
-- columna N ("VVD (SIN IGV)", fórmula =Q/1.18), y se comprobó fila por fila
-- que N × 1.18 da la amarilla al céntimo. Ningún producto es exonerado: en
-- los 35 el IGV es N × 0.18.
--
-- ZITROGAL x 3 TAB. REC. (PRD208) viene SIN precio en el Excel: se carga sin
-- precio y la OC lo pide a mano, en vez de inventar uno.
--
-- `codigo_proveedor` sale de la columna "CÓDIGO DIMEXA": aunque se llame
-- así, es el código con el que se identifica cada producto de Pharmed (Sebas,
-- 2026-10-30) — la columna "CODIGO PHARMED" del Excel está vacía. Cinco
-- productos vienen sin ese código (LEVOXIDAL 750, los tres ZITROGAL y
-- NOCTIUM ZZZ) y quedan sin él. Va en un UPDATE aparte, al final.
--
-- Unidades según el vocabulario ya normalizado (0071/0072): "TAB. REC." →
-- TABLETAS RECUB., "TABLETAS" → TABLETA, "CÁPSULA(S)" → CAPSULA, polvo para
-- suspensión → POLVO SUSPENSIÓN.
--
-- El proveedor y el vínculo producto → proveedor van al final (RUC pasado
-- por Sebas el 2026-10-30).
--
-- Re-ejecutable: `on conflict (codigo) do nothing`.

-- Productos base (35)
insert into catalogo.productos
  (codigo, codigo_bonificacion, descripcion, presentacion, principio_activo, unidad_medida, precio_compra)
values
  ('PRD101', 'BOPRD101', 'ARCOXIB 90 x 10 TAB. REC.', 'Caja x 10 Tab. Rec.', 'ETORICOXIB 90 MG', 'TABLETAS RECUB.', 22.4915),
  ('PRD102', 'BOPRD102', 'ARCOXIB 120 x 10 TAB. REC.', 'Caja x 10 Tab. Rec.', 'ETORICOXIB 120 MG', 'TABLETAS RECUB.', 24.161),
  ('PRD103', 'BOPRD103', 'DOLOIBUPRESS FORTE x 20 TAB. REC.', 'Caja x 20 Tab. Rec.', 'IBUPROFENO 200 MG + PARACETAMOL 500 MG', 'TABLETAS RECUB.', 15.2542),
  ('PRD104', 'BOPRD104', 'DOLOIBUPRESS FORTE x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'IBUPROFENO 200 MG + PARACETAMOL 500 MG', 'TABLETAS RECUB.', 70.3475),
  ('PRD105', 'BOPRD105', 'DOLO MIOPRESS FORTE x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'PARACETAMOL 450 MG + ORFENADRINA CITRATO 35 MG', 'TABLETAS RECUB.', 58.7797),
  ('PRD106', 'BOPRD106', 'DOLO NEUROPRESS FORTE NF x 60 CÁP.', 'Caja x 60 Cápsulas', 'DICLOFENACO SÓDICO 50 MG + VIT. B1 + VIT. B6 + VIT. B12', 'CAPSULA', 43.6441),
  ('PRD107', 'BOPRD107', 'KETAXAL x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'KETOROLACO TROMETAMINA 10 MG', 'TABLETAS RECUB.', 24.5763),
  ('PRD108', 'BOPRD108', 'NEUROPRESS 5000 x 60 TAB. REC.', 'Caja x 60 Tab. Rec.', 'VIT. B1 (100MG) + B6 (100MG) + B12 (5000MCG)', 'TABLETAS RECUB.', 96.1102),
  ('PRD109', 'BOPRD109', 'ORFEDRIN 100 x 100 TAB. DE LIB. PROL.', 'Caja x 100 Tab. LP', 'ORFENADRINA CITRATO 100 MG', 'TABLETAS RECUB.', 40.678),
  ('PRD201', 'BOPRD201', 'BACCIDAL x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'CIPROFLOXACINO 500 MG', 'TABLETAS RECUB.', 39.8136),
  ('PRD202', 'BOPRD202', 'DUCLONEX x 1 CÁP', 'Caja x 1 Cápsula', 'FLUCONAZOL 150 MG', 'CAPSULA', 1.2881),
  ('PRD203', 'BOPRD203', 'LEVOXIDAL 500 x 10 TAB. REC.', 'Caja x 10 Tab. Rec.', 'LEVOFLOXACINO 500 MG', 'TABLETAS RECUB.', 24.3051),
  ('PRD204', 'BOPRD204', 'LEVOXIDAL 750 x 5 TAB. REC.', 'Caja x 5 Tab. Rec.', 'LEVOFLOXACINO 750 MG', 'TABLETAS RECUB.', 16.5085),
  ('PRD205', 'BOPRD205', 'PARDIL x 6 TAB. REC.', 'Caja x 6 Tab. Rec.', 'NITAZOXANIDA 500 MG', 'TABLETAS RECUB.', 8.4746),
  ('PRD206', 'BOPRD206', 'PARDIL x 60 ML Polvo P/Suspensión oral', 'Fco x 60 Ml', 'NITAZOXANIDA 100 MG/5 ML', 'POLVO SUSPENSIÓN', 8.4746),
  ('PRD207', 'BOPRD207', 'SULFACID FORTE x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'SULFAMETOXAZOL + TRIMETOPRIMA 800 MG + 160 MG', 'TABLETAS RECUB.', 25.4068),
  ('PRD208', 'BOPRD208', 'ZITROGAL x 3 TAB. REC.', 'Caja x 3 Tab. Rec.', 'AZITROMICINA 500 MG', 'TABLETAS RECUB.', null),
  ('PRD209', 'BOPRD209', 'ZITROGAL x 30 TAB. REC.', 'Caja x 30 Tab. Rec.', 'AZITROMICINA 500 MG', 'TABLETAS RECUB.', 71.1864),
  ('PRD210', 'BOPRD210', 'ZITROGAL x 30 ML Polvo P/Suspensión oral', 'Fco x 30 Ml', 'AZITROMICINA 200 MG/5 ML', 'POLVO SUSPENSIÓN', 16.9492),
  ('PRD301', 'BOPRD301', 'ZINOXID 25 x 30 TAB.', 'Caja x 30 Tabletas', 'HIDROCLOROTIAZIDA 25 MG', 'TABLETA', 15.678),
  ('PRD302', 'BOPRD302', 'ZINOXID 50 x 30 TAB.', 'Caja x 30 Tabletas', 'HIDROCLOROTIAZIDA 50 MG', 'TABLETA', 16.9492),
  ('PRD401', 'BOPRD401', 'ESPASMOLIT x 30 TAB. REC.', 'Caja x 30 Tab. Rec.', 'BROMURO DE OTILONIO 40 MG', 'TABLETAS RECUB.', 50.8475),
  ('PRD501', 'BOPRD501', 'NERVOPAX 75 x 30 CÁP.', 'Caja x 30 Cápsulas', 'PREGABALINA 75 MG', 'CAPSULA', 69.9237),
  ('PRD502', 'BOPRD502', 'NERVOPAX 150 x 30 CÁP.', 'Caja x 30 Cápsulas', 'PREGABALINA 150 MG', 'CAPSULA', 99.1441),
  ('PRD601', 'BOPRD601', 'DEXONA x 100 TAB.', 'Caja x 100 Tab.', 'DEXAMETASONA 4 MG', 'TABLETA', 27.9576),
  ('PRD602', 'BOPRD602', 'DICODRIN x 30 TAB. REC', 'Caja x 100 Tab. Rec.', 'PREDNISONA 20 MG', 'TABLETAS RECUB.', 11.0085),
  ('PRD701', 'BOPRD701', 'SILDEX 50 x 1 TAB. REC.', 'Caja x 1 Tab. Rec.', 'SILDENAFILO 50 MG', 'TABLETAS RECUB.', 0.7119),
  ('PRD702', 'BOPRD702', 'SILDEX 100 x 1 TAB. REC', 'Caja x 1 Tab. Rec.', 'SILDENAFILO 100 MG', 'TABLETAS RECUB.', 0.9831),
  ('PRD703', 'BOPRD703', 'UREN x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'FENAZOPIRIDINA CLORHIDRATO 100 MG', 'TABLETAS RECUB.', 39.822),
  ('PRD704', 'BOPRD704', 'UREN MAX x 100 TAB. REC', 'Caja x 100 Tab. Rec.', 'FENAZOPIRIDINA CLORHIDRATO 200 MG', 'TABLETAS RECUB.', 77.1102),
  ('PRD801', 'BOPRD801', 'ALICAM FORTE x 100 TAB.', 'Caja x 100 Tab.', 'PARACETAMOL 500 MG', 'TABLETA', 14.0678),
  ('PRD802', 'BOPRD802', 'ESPASMEX x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'BUTILBROMURO DE ESCOPOLAMINA 10 MG', 'TABLETAS RECUB.', 55.9322),
  ('PRD803', 'BOPRD803', 'ESPASMEX COMPUESTO x 60 TAB. REC.', 'Caja x 60 Tab. Rec.', 'HIOSCINA N-BUTILBROMURO 10 MG + PARACETAMOL 500 MG', 'TABLETAS RECUB.', 38.1356),
  ('PRD804', 'BOPRD804', 'MIDOL EXTRA FUERTE x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'IBUPROFENO 200 MG + PARACETAMOL 500 MG', 'TABLETAS RECUB.', 81.2627),
  ('PRD905', 'BOPRD905', 'NOCTIUM ZZZ x 30 TAB. REC.', 'Caja x 30 Tab. Rec.', 'CLORHIDRATO DE DIFENHIDRAMINA 50 MG', 'TABLETAS RECUB.', 25.4237)
on conflict (codigo) do nothing;

-- Bonificados (35). Sin precio: es lo que el laboratorio regala.
insert into catalogo.productos
  (codigo, descripcion, presentacion, principio_activo, unidad_medida)
values
  ('BOPRD101', 'ARCOXIB 90 x 10 TAB. REC.', 'Caja x 10 Tab. Rec.', 'ETORICOXIB 90 MG', 'TABLETAS RECUB.'),
  ('BOPRD102', 'ARCOXIB 120 x 10 TAB. REC.', 'Caja x 10 Tab. Rec.', 'ETORICOXIB 120 MG', 'TABLETAS RECUB.'),
  ('BOPRD103', 'DOLOIBUPRESS FORTE x 20 TAB. REC.', 'Caja x 20 Tab. Rec.', 'IBUPROFENO 200 MG + PARACETAMOL 500 MG', 'TABLETAS RECUB.'),
  ('BOPRD104', 'DOLOIBUPRESS FORTE x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'IBUPROFENO 200 MG + PARACETAMOL 500 MG', 'TABLETAS RECUB.'),
  ('BOPRD105', 'DOLO MIOPRESS FORTE x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'PARACETAMOL 450 MG + ORFENADRINA CITRATO 35 MG', 'TABLETAS RECUB.'),
  ('BOPRD106', 'DOLO NEUROPRESS FORTE NF x 60 CÁP.', 'Caja x 60 Cápsulas', 'DICLOFENACO SÓDICO 50 MG + VIT. B1 + VIT. B6 + VIT. B12', 'CAPSULA'),
  ('BOPRD107', 'KETAXAL x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'KETOROLACO TROMETAMINA 10 MG', 'TABLETAS RECUB.'),
  ('BOPRD108', 'NEUROPRESS 5000 x 60 TAB. REC.', 'Caja x 60 Tab. Rec.', 'VIT. B1 (100MG) + B6 (100MG) + B12 (5000MCG)', 'TABLETAS RECUB.'),
  ('BOPRD109', 'ORFEDRIN 100 x 100 TAB. DE LIB. PROL.', 'Caja x 100 Tab. LP', 'ORFENADRINA CITRATO 100 MG', 'TABLETAS RECUB.'),
  ('BOPRD201', 'BACCIDAL x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'CIPROFLOXACINO 500 MG', 'TABLETAS RECUB.'),
  ('BOPRD202', 'DUCLONEX x 1 CÁP', 'Caja x 1 Cápsula', 'FLUCONAZOL 150 MG', 'CAPSULA'),
  ('BOPRD203', 'LEVOXIDAL 500 x 10 TAB. REC.', 'Caja x 10 Tab. Rec.', 'LEVOFLOXACINO 500 MG', 'TABLETAS RECUB.'),
  ('BOPRD204', 'LEVOXIDAL 750 x 5 TAB. REC.', 'Caja x 5 Tab. Rec.', 'LEVOFLOXACINO 750 MG', 'TABLETAS RECUB.'),
  ('BOPRD205', 'PARDIL x 6 TAB. REC.', 'Caja x 6 Tab. Rec.', 'NITAZOXANIDA 500 MG', 'TABLETAS RECUB.'),
  ('BOPRD206', 'PARDIL x 60 ML Polvo P/Suspensión oral', 'Fco x 60 Ml', 'NITAZOXANIDA 100 MG/5 ML', 'POLVO SUSPENSIÓN'),
  ('BOPRD207', 'SULFACID FORTE x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'SULFAMETOXAZOL + TRIMETOPRIMA 800 MG + 160 MG', 'TABLETAS RECUB.'),
  ('BOPRD208', 'ZITROGAL x 3 TAB. REC.', 'Caja x 3 Tab. Rec.', 'AZITROMICINA 500 MG', 'TABLETAS RECUB.'),
  ('BOPRD209', 'ZITROGAL x 30 TAB. REC.', 'Caja x 30 Tab. Rec.', 'AZITROMICINA 500 MG', 'TABLETAS RECUB.'),
  ('BOPRD210', 'ZITROGAL x 30 ML Polvo P/Suspensión oral', 'Fco x 30 Ml', 'AZITROMICINA 200 MG/5 ML', 'POLVO SUSPENSIÓN'),
  ('BOPRD301', 'ZINOXID 25 x 30 TAB.', 'Caja x 30 Tabletas', 'HIDROCLOROTIAZIDA 25 MG', 'TABLETA'),
  ('BOPRD302', 'ZINOXID 50 x 30 TAB.', 'Caja x 30 Tabletas', 'HIDROCLOROTIAZIDA 50 MG', 'TABLETA'),
  ('BOPRD401', 'ESPASMOLIT x 30 TAB. REC.', 'Caja x 30 Tab. Rec.', 'BROMURO DE OTILONIO 40 MG', 'TABLETAS RECUB.'),
  ('BOPRD501', 'NERVOPAX 75 x 30 CÁP.', 'Caja x 30 Cápsulas', 'PREGABALINA 75 MG', 'CAPSULA'),
  ('BOPRD502', 'NERVOPAX 150 x 30 CÁP.', 'Caja x 30 Cápsulas', 'PREGABALINA 150 MG', 'CAPSULA'),
  ('BOPRD601', 'DEXONA x 100 TAB.', 'Caja x 100 Tab.', 'DEXAMETASONA 4 MG', 'TABLETA'),
  ('BOPRD602', 'DICODRIN x 30 TAB. REC', 'Caja x 100 Tab. Rec.', 'PREDNISONA 20 MG', 'TABLETAS RECUB.'),
  ('BOPRD701', 'SILDEX 50 x 1 TAB. REC.', 'Caja x 1 Tab. Rec.', 'SILDENAFILO 50 MG', 'TABLETAS RECUB.'),
  ('BOPRD702', 'SILDEX 100 x 1 TAB. REC', 'Caja x 1 Tab. Rec.', 'SILDENAFILO 100 MG', 'TABLETAS RECUB.'),
  ('BOPRD703', 'UREN x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'FENAZOPIRIDINA CLORHIDRATO 100 MG', 'TABLETAS RECUB.'),
  ('BOPRD704', 'UREN MAX x 100 TAB. REC', 'Caja x 100 Tab. Rec.', 'FENAZOPIRIDINA CLORHIDRATO 200 MG', 'TABLETAS RECUB.'),
  ('BOPRD801', 'ALICAM FORTE x 100 TAB.', 'Caja x 100 Tab.', 'PARACETAMOL 500 MG', 'TABLETA'),
  ('BOPRD802', 'ESPASMEX x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'BUTILBROMURO DE ESCOPOLAMINA 10 MG', 'TABLETAS RECUB.'),
  ('BOPRD803', 'ESPASMEX COMPUESTO x 60 TAB. REC.', 'Caja x 60 Tab. Rec.', 'HIOSCINA N-BUTILBROMURO 10 MG + PARACETAMOL 500 MG', 'TABLETAS RECUB.'),
  ('BOPRD804', 'MIDOL EXTRA FUERTE x 100 TAB. REC.', 'Caja x 100 Tab. Rec.', 'IBUPROFENO 200 MG + PARACETAMOL 500 MG', 'TABLETAS RECUB.'),
  ('BOPRD905', 'NOCTIUM ZZZ x 30 TAB. REC.', 'Caja x 30 Tab. Rec.', 'CLORHIDRATO DE DIFENHIDRAMINA 50 MG', 'TABLETAS RECUB.')
on conflict (codigo) do nothing;

-- ── El proveedor, y el vínculo ───────────────────────────────────────────
-- RUC pasado por Sebas el 2026-10-30. La razón social va como "PHARMED", el
-- nombre con el que lo pasó: si en SUNAT figura distinto (ej. con S.A.C.),
-- se corrige desde la ficha del proveedor. `condicion_pago_dias` queda en
-- el default (30) — la lista de precios no dice el plazo pactado.
insert into compras.proveedores (ruc, razon_social, tipo)
select '20505578806', 'PHARMED', 'mercaderia'
where not exists (select 1 from compras.proveedores where ruc = '20505578806');

update catalogo.productos
   set proveedor_id = (select id from compras.proveedores where ruc = '20505578806'),
       updated_at = now()
 where (codigo like 'PRD%' or codigo like 'BOPRD%')
   and proveedor_id is null;

-- ── El código de cada producto (columna "CÓDIGO DIMEXA") ─────────────────
-- Solo donde todavía no tiene uno: re-ejecutable y no pisa una corrección
-- hecha a mano después.
update catalogo.productos p
   set codigo_proveedor = v.codigo_proveedor,
       updated_at = now()
  from (values
    ('PRD101', '28662'),
    ('PRD102', '28663'),
    ('PRD103', '28288'),
    ('PRD104', '28664'),
    ('PRD105', '28681'),
    ('PRD106', '280002'),
    ('PRD107', '28549'),
    ('PRD108', '28682'),
    ('PRD109', '28666'),
    ('PRD201', '28516'),
    ('PRD202', '280001'),
    ('PRD203', '28552'),
    ('PRD205', '28582'),
    ('PRD206', '28584'),
    ('PRD207', '28617'),
    ('PRD301', '28652'),
    ('PRD302', '28653'),
    ('PRD401', '280005'),
    ('PRD501', '280003'),
    ('PRD502', '280004'),
    ('PRD601', '28646'),
    ('PRD602', '28644'),
    ('PRD701', '28585'),
    ('PRD702', '28588'),
    ('PRD703', '28503'),
    ('PRD704', '28683'),
    ('PRD801', '28643'),
    ('PRD802', '28661'),
    ('PRD803', '28626'),
    ('PRD804', '28456')
  ) as v(codigo, codigo_proveedor)
 where p.codigo = v.codigo
   and p.codigo_proveedor is null;
