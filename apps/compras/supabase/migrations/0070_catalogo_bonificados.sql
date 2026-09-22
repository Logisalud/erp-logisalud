-- Catálogo de compra actualizado (Excel de NubeFact, 2026-09-21).
--
-- Trae 427 filas; se cargan 424. Las 3 salteadas por pedido de Sebas son
-- artificios de facturación, no productos: DSCTO1 ("DESCUENTO"), XXXXXX y
-- XXXX1 (dos "CAJA ..." de la categoría DSCTO).
--
-- De las 424: 201 ya estaban (13 con la descripción cambiada, que se pisa con
-- la del Excel — decisión explícita de Sebas) y 223 son nuevas, de las cuales
-- 207 son BONIFICADOS (códigos BO*).
--
-- ── Qué NO trae este Excel ───────────────────────────────────────────────
-- Las cuatro columnas de precio vienen VACÍAS en las 427 filas, así que
-- `precio_compra` queda null en todo lo nuevo — igual que hoy en 39 de los
-- 216 productos ya cargados. `proveedor_id` también queda null: el archivo no
-- dice de qué proveedor se compra cada código.
--
-- ── De dónde sale `unidad_medida` ────────────────────────────────────────
-- El Excel trae 'BX' en 426 de 427 filas: es el código de NubeFact para
-- "caja", puesto por defecto, no el dato real. La tabla usa unidades
-- descriptivas (AMPOLLA, FRASCO, TABLETA RECUB.), así que copiar 'BX' habría
-- metido un valor ajeno a ese vocabulario y además falso para una ampolla o
-- un frasco.
--
-- En su lugar cada bonificado HEREDA la unidad de su producto base, que es el
-- mismo producto físico. El vínculo no se adivina por prefijo —no es
-- uniforme: DRN001→BOD001, PLGS09→BOP000009— sino que ya está declarado en
-- `catalogo.productos.codigo_bonificacion`, poblado en 214 de los 216
-- productos. 192 de los 207 bonificados se resuelven así; los otros 12
-- se emparejan con su base por descripción idéntica, porque esa base también
-- es nueva en este Excel.
--
-- Por eso los productos base van en un INSERT aparte y ANTES que los
-- bonificados: el `left join` que hereda la unidad no vería filas insertadas
-- en su mismo statement.
--
-- Quedan 18 filas en 'UND' porque no hay de dónde deducirla — los 16 códigos
-- nuevos que no son bonificados, más BODHP109 y BODHP110 (JAMOL y GLICOFAST
-- en presentación x 10, cuya base x 30 existe pero es otro empaque). Van
-- listadas al final para corregirlas a mano.
--
-- Re-ejecutable: los insert usan `on conflict (codigo) do nothing` y los
-- update son idempotentes.

-- ===================================================================
-- 1. Descripciones corregidas (13)
-- ===================================================================
-- Ojo con DHP218: no es una corrección de redacción sino otro producto
-- ("ALIVIADOL 550" → "DIPHA ZINC KID 10 MG/5 ML X FCO X 100 ML"). Confirmado
-- por Sebas. La fila estaba `inactivo`, sin precio y sin uso en ninguna OC,
-- así que no arrastra historia.
update catalogo.productos set descripcion = 'DIPHA ZINC KID 10 MG/5 ML X FCO X 100 ML', updated_at = now() where codigo = 'DHP218';
update catalogo.productos set descripcion = 'REUMA SOL NF 5% + 1.5% + 1.5% POTE x 100 G - UNGÜENTO', updated_at = now() where codigo = 'REU101';
update catalogo.productos set descripcion = 'REUMA SOL NF 5% + 1.5% + 1.5% POTE x 60 G - UNGÜENTO', updated_at = now() where codigo = 'REU102';
update catalogo.productos set descripcion = 'REUMA SOL NF 5% + 1.5% + 1.5% POTE x 30 G - UNGÜENTO', updated_at = now() where codigo = 'REU103';
update catalogo.productos set descripcion = 'REUMA SOL NF 5% + 1.5% + 1.5% POTE x 20 G - UNGÜENTO', updated_at = now() where codigo = 'REU104';
update catalogo.productos set descripcion = 'DIPHADIC LONG 100 100 MG CJA X 100 CAP. LIB. PROL.', updated_at = now() where codigo = 'DHP026';
update catalogo.productos set descripcion = 'BIONAX ANTIGRIPAL 325 MG +10 MG+5 MG+2 MG CJA X 100 TAB REC', updated_at = now() where codigo = 'BSA326';
update catalogo.productos set descripcion = 'COLLAGEN FULL POLVO  POTE X 600GR', updated_at = now() where codigo = 'DRN005';
update catalogo.productos set descripcion = 'DAREFLEX  POLVO POTE X 1KG', updated_at = now() where codigo = 'DRN009';
update catalogo.productos set descripcion = 'DARETOS EXPECTORANTE JBE  X 250ML', updated_at = now() where codigo = 'DRN016';
update catalogo.productos set descripcion = 'NEUMODAR POLVO POTE  X 1.1KG', updated_at = now() where codigo = 'DRN032';
update catalogo.productos set descripcion = 'DRAVOM 50 MG/ 5ML CJA X 10 AMP', updated_at = now() where codigo = 'DHP028';
update catalogo.productos set descripcion = 'DARE B KIDS JBE X 400ML', updated_at = now() where codigo = 'DRN007';

-- ==================================================================
-- 2. Productos base nuevos (16)
-- ==================================================================
-- Primero estos: 12 bonificados heredan su unidad.
insert into catalogo.productos (codigo, descripcion) values
  ('BSA119', 'AGUA FEM 5GR CJA X 30 SACHETS'),
  ('PLGS23', 'OVAMET 40-1 X 120 CAP'),
  ('DHP417', 'CEFUROXIMA 500MG CJA X 10 TAB. REC.'),
  ('DHP015', 'DIPHARELAX PLUS 450MG+35MG CJAX100 TAB'),
  ('DHP013', 'DYOMIN H 450 MG +50 MG CJA X 30TAB. REC.'),
  ('DHP012', 'BROLAXIL 5 5 MG CJA X 100 TAB.'),
  ('DHP300', 'HISOPOS NADÓ X 100 BASTFLEX/PTA/ALGODÓN'),
  ('DHP210', 'DYNACAL 1250 MG CAJA X 100 TAB. REC.'),
  ('DHP100', 'DAPHA 10 10 MG CJA X 30 TAB. REC.'),
  ('DHP011', 'DUOCLAMOX 500MG+125MG CJA X 10 TAB. REC.'),
  ('DHP006', 'DIPHAPASMOL 40 40 MG CJA X 30 TAB. REC.'),
  ('DHP004', 'DIVALPRID 500 500 MG CJA X 100 TAB. LIB. P'),
  ('BSA118', 'VIGOR NAT X 5 GR X C/SOBRE'),
  ('DHP419', 'METOCLOPRAMIDA 10 MG/ 2 ML  CJA X 10 AMP.'),
  ('DRN048', 'FLORADAR POLVO POTE X 1.1KG'),
  ('PLGS24', 'ASHWCALMEX 500 MG FCO X 120 CAP.')
on conflict (codigo) do nothing;

-- ==================================================================
-- 3. Bonificados (207)
-- ==================================================================
-- `nuevo(codigo, descripcion, base)` es el Excel; el left join trae la unidad
-- del producto base y cae a 'UND' cuando ese base no existe.
insert into catalogo.productos (codigo, descripcion, unidad_medida)
select n.codigo, n.descripcion, coalesce(b.unidad_medida, 'UND')
from (values
  ('BODHP019', 'MUCOFLUX 100 100MG CJA X 30 SOBRE.', 'DHP019'),
  ('BODHP002', 'DIPHACORTEN 5 MG/ 5 ML FCO X 120 ML', 'DHP002'),
  ('BODHP420', 'ALBENDAZOL 400 MG CJA X 50 TAB. MAST.', 'DHP420'),
  ('BOP000015', 'BLACKY FE GUMMIES MULTIVITAMINICAS FCO X 70 GOM.', 'PLGS15'),
  ('BODHP403', 'OMEPRAZOL 40 MG CJA X 10 VIALES', 'DHP403'),
  ('BOP000012', 'CIT-K  POTE X 200 GR', 'PLGS12'),
  ('BOP000006', 'COLLAGEN PRETTY VITALS 10 GR CJA X 33 SACHETS', 'PLGS06'),
  ('BODHP404', 'DICLOFENACO SODICO 75 MG/ 3 ML CJA X 50 AMP.', 'DHP404'),
  ('BODHP104', 'DUO DAPHA 5 5 MG + 1000 MG CJA X 30 TAB. REC.', 'DHP104'),
  ('BODHP108', 'JAMOL 5 5 MG CJA X 30 TAB. REC.', 'DHP108'),
  ('BODHP107', 'GLICOFAST 1000 1000 MG CJA X 30 TAB. LIB. PROL.', 'DHP107'),
  ('BOP000001', 'COLAGENO BIARTI FORT LATA X 300 GR', 'PLGS01'),
  ('BOP000021', 'ZINC + L-ARGININA 500 MG FCO X 90 CAP.', 'PLGS21'),
  ('BOP000022', 'PRADES AXTASANTINA & OMEGA CJA X 60 CAP', 'PLGS22'),
  ('BOP000002', 'COLLAGEN BIOARTI FORT 10 GR CJA X 33 SACHETS', 'PLGS02'),
  ('BODHP422', 'DICLOFENACO 100 MG CJA X 100 CAP. LIB. PROL.', 'DHP422'),
  ('BODHP419', 'METOCLOPRAMIDA 10 MG/ 2 ML  CJA X 10 AMP.', 'DHP419'),
  ('BODHP417', 'CEFUROXIMA 500MG CJA X 10 TAB. REC.', 'DHP417'),
  ('BODHP416', 'AMOXICILINA 250MG/ACIDO CLAVULANICO 62.5MG FCOX60 ML.', 'DHP416'),
  ('BODHP415', 'CELECOXIB 400 MG CJA X 50 CAP.', 'DHP415'),
  ('BODHP413', 'DIMENHIDRINATO 50MG/5ML CJA X 10 AMP.', 'DHP413'),
  ('BODHP015', 'DIPHARELAX PLUS 450MG+35MG CJAX100 TAB', 'DHP015'),
  ('BODHP009', 'D - CORT 4 4 MG/ 2 ML CJA X 1 AMP.', 'DHP009'),
  ('BODHP008', 'ALLER - CLORT 10 MG/ 1ML CJA X 1 AMP.', 'DHP008'),
  ('BODHP001', 'DIPHACOXIB 400 400 MG CJA X 30 CAP.', 'DHP001'),
  ('BOBSA326', 'BIONAX ANTIGRIPAL 325 MG +10 MG+5 MG+2 MG CJA X 100 TAB REC', 'BSA326'),
  ('BOBSA325', 'VIGOR MAX 100 MG CJA X 80 COMP REC', 'BSA325'),
  ('BOBSA324', 'SULFAVILL BALSÁMICO NF 800 MG/15 ML+160 MG/15 ML+250 MG /15 ML SUSP ORAL CJA X 1 FCO X 100 ML', 'BSA324'),
  ('BOBSA323', 'SANATRIM PEDIATRICO 200 MG/5ML +40 MG/5ML SUSP ORAL CJA X 1 FCO X 60 ML', 'BSA323'),
  ('BOBSA321', 'SANATRIM FORTE 800MG + 160MG CJA X 100 TAB REC', 'BSA321'),
  ('BOBSA319', 'NAPROXCOLL 550 MG CJA X 100 TAB REC', 'BSA319'),
  ('BOBSA311', 'BIONAX FORTE 500MG + 65MG CJA X 100 TAB REC', 'BSA311'),
  ('BOBSA310', 'BIONAX 550 550MG CJA X 100 TAB REC', 'BSA310'),
  ('BOBSA309', 'BIODOL 100 MG/5 ML SUSP ORAL CJA X 1 FCO X 60 ML', 'BSA309'),
  ('BOBSA308', 'BIO-DIGESTID 100 MG/ML SUSP ORAL CJA X 1 FCO X 20 ML', 'BSA308'),
  ('BOBSA307', 'BIOCORTEX 5 MG/5 ML SUSP ORAL CJA X 1 FCO X 100 ML', 'BSA307'),
  ('BOBSA306', 'BIOCORTEX 20 MG CJA X 100 TAB REC', 'BSA306'),
  ('BOBSA305', 'BIO-CISTENID 100 MG/5 ML POLV PARA SUSP ORAL CJA X 1 FCO X 60 ML', 'BSA305'),
  ('BOBSA304', 'BIO-CISTENID 500 MG CJA X 60 COMP REC', 'BSA304'),
  ('BOBSA303', 'BIO-ALER 10 MG CJA X 100 COMP REC', 'BSA303'),
  ('BOBSA107', 'FLEXIPLUS 5 GR CJA X 30 SACHETS', 'BSA107'),
  ('BOBSA106', 'FITO FEM 400 MG CJA X 100 CAPS', 'BSA106'),
  ('BOBSA105', 'EVAFORT 5GR CJA X 30 SACHETS', 'BSA105'),
  ('BOBSA104', 'CONTROL SUGAR 400 MG X 100 CAPS', 'BSA104'),
  ('BOBSA103', 'CALMA PLUS 5GR CJA X 30 SACHETS', 'BSA103'),
  ('BOBSA102', 'BIOPROPOL N CJA X 1 FCO X 120ML', 'BSA102'),
  ('BODHP201', 'DIPHANATUR 300 300 MG CJA X 60 CAP. BDA.', 'DHP201'),
  ('BOP000018', 'AGUAJE+FENOGRECO 500 MG FCO X 90 CAP.', 'PLGS18'),
  ('BOP000020', 'MELENA DE LEON 500 MG FCO X 60 CAP.', 'PLGS20'),
  ('BODHP425', 'METFORMINA 1000 MG CJA X 30 TAB. LIB. PROL.', 'DHP425'),
  ('BODHP412', 'METAMIZOL SODICO 1 G/ 2ML CJA X 50 AMP.', 'DHP412'),
  ('BODHP411', 'CLORFENAMINA 10 MG/ ML CJA X 10 AMP.', 'DHP411'),
  ('BOP000008', 'NUTRIVIDA KIDS LATA X 1KG (SABOR CHOCOLATE)', 'PLGS08'),
  ('BODHP414', 'ACIDO TRANEXAMICO 1G/ 10ML CJA X 50 AMP', 'DHP414'),
  ('BODHP410', 'ORFENADRINA CITRATO 60 60 MG/ 2 ML CJA X 100 AMP.', 'DHP410'),
  ('BODHP409', 'ORFENADRINA CITRATO 100MG X 100 TAB LP', 'DHP409'),
  ('BODHP408', 'KETOROLACO 60 MG/ 2 ML CJA X 100 AMP.', 'DHP408'),
  ('BODHP407', 'ESOMEPRAZOL 40 MG CJA X 30 COMP. GR.', 'DHP407'),
  ('BODHP406', 'ESOMEPRAZOL 20 MG CJA X 30 COMP. GR.', 'DHP406'),
  ('BODHP405', 'MOXIFLOXACINO 400 MG CJA X 5 TAB. REC.', 'DHP405'),
  ('BODHP402', 'OMEPRAZOL 20 MG CJA X 100 CAP. LIB. R.', 'DHP402'),
  ('BODHP401', 'FENITOINA SODICA 100 MG CJA X 100 TAB. REC.', 'DHP401'),
  ('BODHP400', 'ATROPINA SULFATO 1MG/ 1ML CJA X 10 AMP.', 'DHP400'),
  ('BODHP215', 'NAYFLEX MUJER 200 MG CJA X 100 CAP. BDA.', 'DHP215'),
  ('BODHP213', 'IBUCALM DUO 500 MG + 200 MG CJA X 100 CAP. BDA.', 'DHP213'),
  ('BODHP212', 'IBUCALM FORTE 400 MG CJA X 100 CAP. BDA.', 'DHP212'),
  ('BODHP211', 'IBUCALM 200 200 MG X 100 CAP. BDA.', 'DHP211'),
  ('BODHP210', 'DYNACAL 1250 MG CAJA X 100 TAB. REC.', 'DHP210'),
  ('BODHP209', 'DIPHADIC LONG 2 % CJA X TBO X 50 G', 'DHP209'),
  ('BODHP206', 'DIPHA ZINC KID 10 MG/5 ML X FCO X 120 ML', 'DHP206'),
  ('BODHP205', 'PROSTAMICIL 320 320 MG CJA X 30 CAP. BDA', 'DHP205'),
  ('BODHP204', 'GRIPAMAX 325 MG + 10 MG + 5 MG CJA X 120 CAP. BDA.', 'DHP204'),
  ('BODHP202', 'DIPHANATUR 500 500 MG CJA X 30 CAP. BDA.', 'DHP202'),
  ('BODHP200', 'VITAMINA E 400 UI CJA. X 30 CAP. BDA.', 'DHP200'),
  ('BODHP106', 'DAPHA 10 10 MG CJA X 30 TAB. REC.', 'DHP106'),
  ('BODHP010', 'KETOMAX 60 MG/ 2ML CJA X 1 AMP.', 'DHP010'),
  ('BOP000005', 'COLLAGEN PRETTY VITALS LATA X 300 GR', 'PLGS05'),
  ('BOP000023', 'OVAMET 40-1 X 120 CAP', 'PLGS23'),
  ('BOBSA316', 'FLEXI-BIO 15 MG CJA X 120 TAB REC', 'BSA316'),
  ('BOBSA315', 'CIPROLAN 500 500 MG CJA X 100 COMP REC', 'BSA315'),
  ('BOBSA314', 'BIORELAX 450 MG + 35 MG CJA X 100 TAB REC', 'BSA314'),
  ('BOBSA313', 'BIOPROSTOL 200 MCG CJA X 30 TAB', 'BSA313'),
  ('BOBSA312', 'BIONAX RELAX 300 MG +250 MG CJA X 100 COMP REC', 'BSA312'),
  ('BOBSA302', 'BELSUC 500 MG CJA X 30 TAB REC', 'BSA302'),
  ('BOBSA301', 'ALLERGY-BIO 5 MG CJA X 60 TAB REC', 'BSA301'),
  ('BOBSA208', 'WAWA CREM POTE X 60 GR', 'BSA208'),
  ('BOBSA207', 'VITACAPIL SHAMPOO CJA X 1 FCO X 380 ML', 'BSA207'),
  ('BOP000019', 'NAD + RESVERATROL 500 MG FCO X 60 CAP.', 'PLGS19'),
  ('BOP000017', 'SELENIO  500 MG FCO X 30 CAP.', 'PLGS17'),
  ('BOP000016', 'ASHWAGANDA 500 MG FCO X 120 CAP.', 'PLGS16'),
  ('BOP000013', 'CIT-K 500 MG FCO X 100 CAP.', 'PLGS13'),
  ('BOP000011', 'MELATONIN 5 MG FCO X 100 GOM.', 'PLGS11'),
  ('BOP000010', 'MELATONIN 2 MG FCO X 100 GOM.', 'PLGS10'),
  ('BOP000009', 'NUTRIVIDA ADVANCE LATA X 1KG (SABOR VAINILLA)', 'PLGS09'),
  ('BOP000007', 'NUTRIVIDA KIDS LATA X 1KG (SABOR VAINILLA)', 'PLGS07'),
  ('BOP000004', 'CITREM PLUS 5 GR CJA X 34 SACHETS', 'PLGS04'),
  ('BOP000003', 'CITREM PLUS POTE X 300 GR', 'PLGS03'),
  ('BODHP307', 'GASA ESTERIL 5 CM X 5 CM CAJA X 50 SOBRES', 'DHP307'),
  ('BODHP306', 'HISOPOS NADÓ X 500 BASTBIO/PTA/ALGODÓN', 'DHP306'),
  ('BODHP305', 'HISOPOS NADÓ X 200 BASTBIO/PTA/ALGODÓN', 'DHP305'),
  ('BODHP304', 'HISOPOS NADÓ X 100 BASTBIO/PTA/ALGODÓN', 'DHP304'),
  ('BODHP303', 'HISOPOS NADÓ X 500 BASTFLEX/PTA/ALGODÓN', 'DHP303'),
  ('BODHP302', 'HISOPOS NADÓ X 200 BASTFLEX/PTA/ALGODÓN', 'DHP302'),
  ('BODHP301', 'HISOPOS NADÓ X 100 BASTFLEX/TOPE/ALGODÓN', 'DHP301'),
  ('BODHP300', 'HISOPOS NADÓ X 100 BASTFLEX/PTA/ALGODÓN', 'DHP300'),
  ('BODHP216', 'TERMÓMETRO DIGITAL (GRIPAMAX) DT-01A x 1UND', 'DHP216'),
  ('BODHP103', 'DUO DAPHA 5 5 MG + 1000 MG CJA X 10 TAB. REC.', 'DHP103'),
  ('BODHP102', 'DUO DAPHA 10 10 MG + 1000 MG CJA X 30 TAB. REC.', 'DHP102'),
  ('BODHP101', 'DUO DAPHA 10 10 MG + 1000 MG CJA X 10 TAB. REC.', 'DHP101'),
  ('BODHP100', 'DAPHA 10 10 MG CJA X 30 TAB. REC.', 'DHP100'),
  ('BODHP026', 'DIPHADIC LONG 100 100 MG CJA X 100 CAP. LIB. PROL.', 'DHP026'),
  ('BODHP025', 'TEZEN 400 400 MG CJA X 50 TAB. MAST.', 'DHP025'),
  ('BODHP024', 'DRAVOM 50MG/ 5ML CJA X 1 AMP.', 'DHP024'),
  ('BODHP023', 'HIERROMAX 50 MG/ 5ML CJA X FCO X 150 ML', 'DHP023'),
  ('BODHP022', 'FEM DAY 1.5 MG CJA X 1 TAB.', 'DHP022'),
  ('BODHP021', 'MUCOFLUX 600 600MG CJA X 30 SOBRE.', 'DHP021'),
  ('BODHP020', 'MUCOFLUX 200 200MG CJA X 30 SOBRE.', 'DHP020'),
  ('BODHP017', 'DIPHADIC LONG 75 75 MG/ 3 ML CJA X 1 AMP.', 'DHP017'),
  ('BODHP014', 'A - FIEBRIN 1G/ 2ML CJA X 1 AMP.', 'DHP014'),
  ('BODHP013', 'DYOMIN H 450 MG +50 MG CJA X 30TAB. REC.', 'DHP013'),
  ('BODHP012', 'BROLAXIL 5 5 MG CJA X 100 TAB.', 'DHP012'),
  ('BODHP011', 'DUOCLAMOX 500MG+125MG CJA X 10 TAB. REC.', 'DHP011'),
  ('BOBSA320', 'SANATRIM BALSÁMICO NF 800 MG/15ML +160 MG/15ML +250 MG/15ML SUSP ORAL CJA X 1 FCO X 100 ML', 'BSA320'),
  ('BOBSA318', 'MUCOSAN B PEDIÁTRICO 7.5 MG/5ML + 0.005MG/5ML SOL ORAL CJA X 1 FCO X 120 ML', 'BSA318'),
  ('BOBSA317', 'GRIPACOLL FUERTE 500 MG + 5 MG + 2 MG CJA X 200 TAB REC', 'BSA317'),
  ('BOBSA205', 'VITABEL CREMA ANTIEDAD CJA X 1 POTE X 50 GR', 'BSA205'),
  ('BOBSA204', 'FLEXICREM CJA X 1 TUBO X 50 GR', 'BSA204'),
  ('BOBSA203', 'FITO ACNYL CJA X 1 TUBO X 20 GR', 'BSA203'),
  ('BOBSA202', 'BIO VARIX CJA X 1 TUBO X 60GR', 'BSA202'),
  ('BOBSA201', 'BIO-PANTHENID CJA X 1 TUBO X 20 GR', 'BSA201'),
  ('BOBSA117', 'VITABEL 5 GR CJA X 30 SACHETS', 'BSA117'),
  ('BOBSA112', 'RINATUR 400 MG CJA X 100 CAPS', 'BSA112'),
  ('BOBSA111', 'RENOVA HP VIT 400 MG CJA X 100 CAPS', 'BSA111'),
  ('BOBSA110', 'PROTHEPA 400 MG CJA X 100 CAPS', 'BSA110'),
  ('BOBSA109', 'FLUYMAX 400 MG CAJA X 100 CAPS', 'BSA109'),
  ('BOBSA108', 'FLEXIPLUS GC 4.5 GR CJA X 30 SACHETS', 'BSA108'),
  ('BOBSA101', 'BIOPROPOL CJA X 1 FCO X 120 ML', 'BSA101'),
  ('BODHP110', 'GLICOFAST 1000 1000 MG CJA X 10 TAB. LIB. PROL.', null),
  ('BOD001', 'ACIDO FOLICO 800 MCG FCO 100 CAPSULAS', 'DRN001'),
  ('BOD002', 'BEAUTY DARE POLVO POTE X 1.1KG', 'DRN002'),
  ('BOD003', 'BEAUTY DARE POLVO POTE X 600GR', 'DRN003'),
  ('BOD004', 'COLLAGEN FULL POLVO POTE X 1KG', 'DRN004'),
  ('BOD005', 'COLLAGEN FULL POLVO  POTE X 600GR', 'DRN005'),
  ('BOD006', 'DARE B COMPLEX JBE X 400ML', 'DRN006'),
  ('BOD008', 'DAREFEM POLVO POTE X 1KG', 'DRN008'),
  ('BOD009', 'DAREFLEX  POLVO POTE X 1KG', 'DRN009'),
  ('BOD010', 'DAREFLEX FCO X 100 CAPSULAS', 'DRN010'),
  ('BOD011', 'DAREFLEX POLVO POTE X 600GR', 'DRN011'),
  ('BOD012', 'DAREKIDS POLVO POTE X 1.1KG', 'DRN012'),
  ('BOD013', 'DAREKIDS POLVO POTE X 600GR', 'DRN013'),
  ('BOD014', 'DARESURE POLVO POTE X 1.1KG', 'DRN014'),
  ('BOD015', 'DARESURE POLVO POTE X 600GR', 'DRN015'),
  ('BOD016', 'DARETOS EXPECTORANTE JBE  X 250ML', 'DRN016'),
  ('BOD017', 'FIBRADAR POLVO POTE X 1KG', 'DRN017'),
  ('BOD018', 'FIBRADAR POLVO POTE X 600GR', 'DRN018'),
  ('BOD019', 'FULL B FCO X 100 CAPSULAS', 'DRN019'),
  ('BOD020', 'FULL-VITRUM POLVO POTE X 1KG', 'DRN020'),
  ('BOD021', 'GERIADAR POLVO POTE X 1.1KG', 'DRN021'),
  ('BOD022', 'GERIADAR POLVO POTE X 600G', 'DRN022'),
  ('BOD023', 'GESTADAR POLVO POTE X 1KG', 'DRN023'),
  ('BOD024', 'GLUCODAR POLVO POTE X 1.1 KG', 'DRN024'),
  ('BOD025', 'GLUCODAR POLVO POTE X 600GR', 'DRN025'),
  ('BOD026', 'HEPPADAR FCO X 100 TABLETAS', 'DRN026'),
  ('BOD027', 'HEPPADAR POLVO POTE X 1KG', 'DRN027'),
  ('BOD028', 'MAGNEFULL ARANDANOS POTE X 350GR', 'DRN028'),
  ('BOD029', 'MAGNEFULL LIMON POTE X 350GR', 'DRN029'),
  ('BOD030', 'MAGNEFULL NARANJA POTE X 350GR', 'DRN030'),
  ('BOD031', 'MAGNEFULL NEUTRO POTE X 350GR', 'DRN031'),
  ('BOD47', 'MAGNEFULL PIÑA POTE X 350 GR', 'DRN047'),
  ('BOD032', 'NEUMODAR POLVO POTE  X 1.1KG', 'DRN032'),
  ('BOD033', 'NEUMODAR POLVO POTE X 600GR', 'DRN033'),
  ('BOD034', 'OMEGA 3 ,OMEGA 6 Y OMEGA 9 FCO X 100 CAP', 'DRN034'),
  ('BOD035', 'REDOX C FORTE POLVO POTE X 1KG', 'DRN035'),
  ('BOD036', 'THERMODAR POLVO POTE X 1KG', 'DRN036'),
  ('BOD037', 'URODAR FORTE POTE X 1.1KG', 'DRN037'),
  ('BOD038', 'DAREPROPOL JBE X 120ML', 'DRN038'),
  ('BOD039', 'GUMMIES CURCUMA + KION MANDARINA X 60 UND', 'DRN039'),
  ('BOD040', 'GUMMIES KIDS CALCIO + VIT D3 PERA X 60 UND', 'DRN040'),
  ('BOD041', 'GUMMIES KIDS HIERRO + VIT C FRESA X 60 UND', 'DRN041'),
  ('BOD042', 'GUMMIES KIDS MULTIVITAMINICOS TUTIFRUTI X 60 UND', 'DRN042'),
  ('BOD043', 'GUMMIES KIDS OMEGA 3,6,9 NARANJA X 60 UND', 'DRN043'),
  ('BOD044', 'GUMMIES KIDS PROBIOTICOS X 60 UNID', 'DRN044'),
  ('BOD045', 'GUMMIES KIDS ZINC + VIT C PIÑA X 60 UND', 'DRN045'),
  ('BOD046', 'GUMMIES MELATONINA 5 MG MANZANA X 60 UND', 'DRN046'),
  ('BODHP109', 'JAMOL 5 5 MG CJA X 10 TAB. REC.', null),
  ('BODHP418', 'DEXAMETASONA FOSFATO 4 MG/ 2 ML CJA X 50 AMP.', 'DHP418'),
  ('BODHP018', 'DIPHARELAX 100 MG X 100 TAB LIB. PROL.', 'DHP018'),
  ('BODHP016', 'DIPHARELAX 60 60 MG/ 2 ML CJA X 1 AMP.', 'DHP016'),
  ('BOBSA322', 'SANATRIM FORTE 400 MG/5 ML+ 80 MG/5 ML SUSP ORAL CJA X 1 FCO X 100 ML', 'BSA322'),
  ('BODHP208', 'NATUVARIX 100 MG CJA X 60 CAP. BDA.', 'DHP208'),
  ('BODHP207', 'DIPHA ZINC KID 20 MG/5 ML  FCO X 120 ML', 'DHP207'),
  ('BODHP203', 'DIPHANATUR FORTE X 100 CAP. BDA.', 'DHP203'),
  ('BODHP214', 'HEMZON CJA X 100 TAB. MAST.', 'DHP214'),
  ('BODHP309', 'GASA ESTERIL 10 CM X 10 CM CAJA X 50 SOBRES', 'DHP309'),
  ('BODHP308', 'GASA ESTERIL 7.5 CM X 7.5 CM CAJA X 50 SOBRES', 'DHP308'),
  ('BODHP105', 'DAPHA 10 10 MG CJA X 10 TAB. REC.', 'DHP105'),
  ('BODHP007', 'D - CORT 8 8 MG/ 2 ML CJA X 1 AMP.', 'DHP007'),
  ('BODHP006', 'DIPHAPASMOL 40 40 MG CJA X 30 TAB. REC.', 'DHP006'),
  ('BODHP005', 'DIPHAXAMICO 1 G/ 10 ML CJA X 1 AMP.', 'DHP005'),
  ('BODHP004', 'DIVALPRID 500 500 MG CJA X 100 TAB. LIB. P', 'DHP004'),
  ('BODHP003', 'DIPHACORTEN  15 MG/ 5 ML FCO X 120 ML', 'DHP003'),
  ('BOBSA206', 'VITACAPIL ACONDICIONADOR CJA X 1 FCO X 380 ML', 'BSA206'),
  ('BOBSA116', 'VITDEFENSE 400 MG CJA X 100 CAPS', 'BSA116'),
  ('BOBSA115', 'VIT CAMU CAMU 5GR CJA X 30 SOBRES', 'BSA115'),
  ('BOBSA114', 'V&M MACA CON VIT Y MIN 5 GR CJA X 30 SACHETS', 'BSA114'),
  ('BOBSA113', 'TOCOSH COMPLEX 5 GR CJA X 30 SACHETS', 'BSA113'),
  ('BOD007', 'DARE B KIDS JBE X 400ML', 'DRN007')
) as n(codigo, descripcion, base)
left join catalogo.productos b on b.codigo = n.base
on conflict (codigo) do nothing;

-- ==================================================================
-- 4. El vínculo base → bonificado que faltaba (13)
-- ==================================================================
-- Estas bases no tenían `codigo_bonificacion` porque su bonificado no
-- existía todavía. Se escribe ahora para que el próximo Excel se pueda
-- cruzar igual que este.
update catalogo.productos set codigo_bonificacion = 'BODHP004', updated_at = now()
  where codigo = 'DHP004' and codigo_bonificacion is distinct from 'BODHP004';
update catalogo.productos set codigo_bonificacion = 'BODHP006', updated_at = now()
  where codigo = 'DHP006' and codigo_bonificacion is distinct from 'BODHP006';
update catalogo.productos set codigo_bonificacion = 'BODHP011', updated_at = now()
  where codigo = 'DHP011' and codigo_bonificacion is distinct from 'BODHP011';
update catalogo.productos set codigo_bonificacion = 'BODHP012', updated_at = now()
  where codigo = 'DHP012' and codigo_bonificacion is distinct from 'BODHP012';
update catalogo.productos set codigo_bonificacion = 'BODHP013', updated_at = now()
  where codigo = 'DHP013' and codigo_bonificacion is distinct from 'BODHP013';
update catalogo.productos set codigo_bonificacion = 'BODHP015', updated_at = now()
  where codigo = 'DHP015' and codigo_bonificacion is distinct from 'BODHP015';
update catalogo.productos set codigo_bonificacion = 'BODHP026', updated_at = now()
  where codigo = 'DHP026' and codigo_bonificacion is distinct from 'BODHP026';
update catalogo.productos set codigo_bonificacion = 'BODHP100', updated_at = now()
  where codigo = 'DHP100' and codigo_bonificacion is distinct from 'BODHP100';
update catalogo.productos set codigo_bonificacion = 'BODHP210', updated_at = now()
  where codigo = 'DHP210' and codigo_bonificacion is distinct from 'BODHP210';
update catalogo.productos set codigo_bonificacion = 'BODHP300', updated_at = now()
  where codigo = 'DHP300' and codigo_bonificacion is distinct from 'BODHP300';
update catalogo.productos set codigo_bonificacion = 'BODHP417', updated_at = now()
  where codigo = 'DHP417' and codigo_bonificacion is distinct from 'BODHP417';
update catalogo.productos set codigo_bonificacion = 'BODHP419', updated_at = now()
  where codigo = 'DHP419' and codigo_bonificacion is distinct from 'BODHP419';
update catalogo.productos set codigo_bonificacion = 'BOP000023', updated_at = now()
  where codigo = 'PLGS23' and codigo_bonificacion is distinct from 'BOP000023';

-- ── Pendiente manual: unidad_medida real de estas 18 filas ──────────────
--   BODHP109     JAMOL 5 5 MG CJA X 10 TAB. REC.
--   BODHP110     GLICOFAST 1000 1000 MG CJA X 10 TAB. LIB. PROL.
--   BSA118       VIGOR NAT X 5 GR X C/SOBRE
--   BSA119       AGUA FEM 5GR CJA X 30 SACHETS
--   DHP004       DIVALPRID 500 500 MG CJA X 100 TAB. LIB. P
--   DHP006       DIPHAPASMOL 40 40 MG CJA X 30 TAB. REC.
--   DHP011       DUOCLAMOX 500MG+125MG CJA X 10 TAB. REC.
--   DHP012       BROLAXIL 5 5 MG CJA X 100 TAB.
--   DHP013       DYOMIN H 450 MG +50 MG CJA X 30TAB. REC.
--   DHP015       DIPHARELAX PLUS 450MG+35MG CJAX100 TAB
--   DHP100       DAPHA 10 10 MG CJA X 30 TAB. REC.
--   DHP210       DYNACAL 1250 MG CAJA X 100 TAB. REC.
--   DHP300       HISOPOS NADÓ X 100 BASTFLEX/PTA/ALGODÓN
--   DHP417       CEFUROXIMA 500MG CJA X 10 TAB. REC.
--   DHP419       METOCLOPRAMIDA 10 MG/ 2 ML  CJA X 10 AMP.
--   DRN048       FLORADAR POLVO POTE X 1.1KG
--   PLGS23       OVAMET 40-1 X 120 CAP
--   PLGS24       ASHWCALMEX 500 MG FCO X 120 CAP.
