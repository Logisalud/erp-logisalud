-- Reconcilia el catalogo de productos contra el exportado de NubeFact.
--
-- Fuente de verdad: catalogo de la cuenta de NubeFact en produccion
-- (RUC 20610284508), 426 filas, entregado por el usuario el 2026-08-13.
--
-- Que hace:
--   1. Actualiza products.descripcion con la del catalogo (es mas completa
--      que la que teniamos).
--   2. Crea una NUEVA VERSION en product_tax_profiles cuando la afectacion
--      difiere. Nunca sobrescribe la vigente: el trigger
--      close_previous_tax_profile cierra la anterior con vigente_hasta.
--      Las columnas de precio de proveedor (vvf, vvd, costo referencial,
--      fecha de vigencia) se arrastran a la version nueva para no perderlas.
--
-- Mapeo de TIPO DE AFECTACION (IGV): '10' -> GRAVADO 18%, '30' -> INAFECTO 0%.
--
-- EXCEPCION CONFIRMADA POR EL USUARIO (2026-08-13): la familia DAPHA 10 y
-- DUO DAPHA 10, con sus bonificaciones, queda INAFECTA pase lo que diga el
-- catalogo -- que para los diez codigos dice '10' (GRAVADO), y esta mal.
-- Ver docs/business-rules.md. Si NubeFact corrige su catalogo, esta
-- excepcion se quita explicitamente, no se deja vencer en silencio.
--
-- DSCTO1 ("DESCUENTO") se excluye: no es un producto sino la linea de
-- descuento que NubeFact usa al facturar. Es la unica fila del catalogo sin
-- tipo de afectacion.
--
-- La migracion es re-ejecutable: si nada difiere, no escribe nada.

-- Tablas de trabajo. Sin `on commit drop`: el runner de migraciones puede
-- aplicar cada sentencia en su propia transaccion, y ahi la tabla moriria
-- antes de usarse. Se borran explicitamente al final.
drop table if exists _nubefact_catalogo;
create temporary table _nubefact_catalogo (
  codigo text primary key,
  descripcion text not null,
  afectacion text not null check (afectacion in ('10', '30'))
);

insert into _nubefact_catalogo (codigo, descripcion, afectacion) values
  ('BODHP019', 'MUCOFLUX 100 100MG CJA X 30 SOBRE.', '10'),
  ('DHP009', 'D - CORT 4 4 MG/ 2 ML CJA X 1 AMP.', '10'),
  ('BODHP002', 'DIPHACORTEN 5 MG/ 5 ML FCO X 120 ML', '10'),
  ('BODHP420', 'ALBENDAZOL 400 MG CJA X 50 TAB. MAST.', '10'),
  ('DHP027', 'A - FIEBRIN 1G/ 2ML CJA X 50 AMP.', '10'),
  ('PLGS09', 'NUTRIVIDA ADVANCE LATA X 1KG (SABOR VAINILLA)', '10'),
  ('BOP000015', 'BLACKY FE GUMMIES MULTIVITAMINICAS FCO X 70 GOM.', '10'),
  ('BODHP403', 'OMEPRAZOL 40 MG CJA X 10 VIALES', '10'),
  ('BOP000012', 'CIT-K  POTE X 200 GR', '10'),
  ('BOP000006', 'COLLAGEN PRETTY VITALS 10 GR CJA X 33 SACHETS', '10'),
  ('DHP409', 'ORFENADRINA CITRATO 100MG X 100 TAB LP', '10'),
  ('DHP404', 'DICLOFENACO SODICO 75 MG/ 3 ML CJA X 50 AMP.', '10'),
  ('BODHP404', 'DICLOFENACO SODICO 75 MG/ 3 ML CJA X 50 AMP.', '10'),
  ('BODHP104', 'DUO DAPHA 5 5 MG + 1000 MG CJA X 30 TAB. REC.', '10'),
  ('BODHP108', 'JAMOL 5 5 MG CJA X 30 TAB. REC.', '10'),
  ('BODHP107', 'GLICOFAST 1000 1000 MG CJA X 30 TAB. LIB. PROL.', '10'),
  ('PLGS05', 'COLLAGEN PRETTY VITALS LATA X 300 GR', '10'),
  ('PLGS17', 'SELENIO  500 MG FCO X 30 CAP.', '10'),
  ('BSA119', 'AGUA FEM 5GR CJA X 30 SACHETS', '10'),
  ('BOP000001', 'COLAGENO BIARTI FORT LATA X 300 GR', '10'),
  ('BOP000021', 'ZINC + L-ARGININA 500 MG FCO X 90 CAP.', '10'),
  ('PLGS23', 'OVAMET 40-1 X 120 CAP', '10'),
  ('PLGS15', 'BLACKY FE GUMMIES MULTIVITAMINICAS FCO X 70 GOM.', '10'),
  ('PLGS13', 'CIT-K 500 MG FCO X 100 CAP.', '10'),
  ('PLGS12', 'CIT-K  POTE X 200 GR', '10'),
  ('PLGS11', 'MELATONIN 5 MG FCO X 100 GOM.', '10'),
  ('PLGS10', 'MELATONIN 2 MG FCO X 100 GOM.', '10'),
  ('PLGS08', 'NUTRIVIDA KIDS LATA X 1KG (SABOR CHOCOLATE)', '10'),
  ('PLGS07', 'NUTRIVIDA KIDS LATA X 1KG (SABOR VAINILLA)', '10'),
  ('PLGS02', 'COLLAGEN BIOARTI FORT 10 GR CJA X 33 SACHETS', '10'),
  ('DHP417', 'CEFUROXIMA 500MG CJA X 10 TAB. REC.', '10'),
  ('DHP416', 'AMOXICILINA 250MG/ACIDO CLAVULANICO 62.5MG FCOX60 ML.', '10'),
  ('DHP415', 'CELECOXIB 400 MG CJA X 50 CAP.', '10'),
  ('DHP021', 'MUCOFLUX 600 600MG CJA X 30 SOBRE.', '10'),
  ('BSA107', 'FLEXIPLUS 5 GR CJA X 30 SACHETS', '10'),
  ('BSA106', 'FITO FEM 400 MG CJA X 100 CAPS', '10'),
  ('BSA105', 'EVAFORT 5GR CJA X 30 SACHETS', '10'),
  ('BSA104', 'CONTROL SUGAR 400 MG X 100 CAPS', '10'),
  ('BSA103', 'CALMA PLUS 5GR CJA X 30 SACHETS', '10'),
  ('BSA102', 'BIOPROPOL N CJA X 1 FCO X 120ML', '10'),
  ('BSA101', 'BIOPROPOL CJA X 1 FCO X 120 ML', '10'),
  ('BOP000022', 'PRADES AXTASANTINA & OMEGA CJA X 60 CAP', '10'),
  ('BOP000002', 'COLLAGEN BIOARTI FORT 10 GR CJA X 33 SACHETS', '10'),
  ('BODHP422', 'DICLOFENACO 100 MG CJA X 100 CAP. LIB. PROL.', '10'),
  ('BODHP419', 'METOCLOPRAMIDA 10 MG/ 2 ML  CJA X 10 AMP.', '10'),
  ('BODHP417', 'CEFUROXIMA 500MG CJA X 10 TAB. REC.', '10'),
  ('BODHP416', 'AMOXICILINA 250MG/ACIDO CLAVULANICO 62.5MG FCOX60 ML.', '10'),
  ('BODHP415', 'CELECOXIB 400 MG CJA X 50 CAP.', '10'),
  ('BODHP413', 'DIMENHIDRINATO 50MG/5ML CJA X 10 AMP.', '10'),
  ('BODHP015', 'DIPHARELAX PLUS 450MG+35MG CJAX100 TAB', '10'),
  ('BODHP009', 'D - CORT 4 4 MG/ 2 ML CJA X 1 AMP.', '10'),
  ('BODHP008', 'ALLER - CLORT 10 MG/ 1ML CJA X 1 AMP.', '10'),
  ('BODHP001', 'DIPHACOXIB 400 400 MG CJA X 30 CAP.', '10'),
  ('BOBSA326', 'BIONAX ANTIGRIPAL 325 MG +10 MG+5 MG+2 MG CJA X 100 TAB REC', '10'),
  ('BOBSA325', 'VIGOR MAX 100 MG CJA X 80 COMP REC', '10'),
  ('BOBSA324', 'SULFAVILL BALSÁMICO NF 800 MG/15 ML+160 MG/15 ML+250 MG /15 ML SUSP ORAL CJA X 1 FCO X 100 ML', '10'),
  ('BOBSA323', 'SANATRIM PEDIATRICO 200 MG/5ML +40 MG/5ML SUSP ORAL CJA X 1 FCO X 60 ML', '10'),
  ('BOBSA321', 'SANATRIM FORTE 800MG + 160MG CJA X 100 TAB REC', '10'),
  ('BOBSA319', 'NAPROXCOLL 550 MG CJA X 100 TAB REC', '10'),
  ('BOBSA311', 'BIONAX FORTE 500MG + 65MG CJA X 100 TAB REC', '10'),
  ('BOBSA310', 'BIONAX 550 550MG CJA X 100 TAB REC', '10'),
  ('BOBSA309', 'BIODOL 100 MG/5 ML SUSP ORAL CJA X 1 FCO X 60 ML', '10'),
  ('BOBSA308', 'BIO-DIGESTID 100 MG/ML SUSP ORAL CJA X 1 FCO X 20 ML', '10'),
  ('BOBSA307', 'BIOCORTEX 5 MG/5 ML SUSP ORAL CJA X 1 FCO X 100 ML', '10'),
  ('BOBSA306', 'BIOCORTEX 20 MG CJA X 100 TAB REC', '10'),
  ('BOBSA305', 'BIO-CISTENID 100 MG/5 ML POLV PARA SUSP ORAL CJA X 1 FCO X 60 ML', '10'),
  ('BOBSA304', 'BIO-CISTENID 500 MG CJA X 60 COMP REC', '10'),
  ('BOBSA303', 'BIO-ALER 10 MG CJA X 100 COMP REC', '10'),
  ('BOBSA107', 'FLEXIPLUS 5 GR CJA X 30 SACHETS', '10'),
  ('BOBSA106', 'FITO FEM 400 MG CJA X 100 CAPS', '10'),
  ('BOBSA105', 'EVAFORT 5GR CJA X 30 SACHETS', '10'),
  ('BOBSA104', 'CONTROL SUGAR 400 MG X 100 CAPS', '10'),
  ('BOBSA103', 'CALMA PLUS 5GR CJA X 30 SACHETS', '10'),
  ('BOBSA102', 'BIOPROPOL N CJA X 1 FCO X 120ML', '10'),
  ('BODHP201', 'DIPHANATUR 300 300 MG CJA X 60 CAP. BDA.', '10'),
  ('BOP000018', 'AGUAJE+FENOGRECO 500 MG FCO X 90 CAP.', '10'),
  ('BOP000020', 'MELENA DE LEON 500 MG FCO X 60 CAP.', '10'),
  ('PLGS22', 'ASTAXANTINA & OMEGA 500 MG FCO X 60 CAP.', '10'),
  ('DHP414', 'ACIDO TRANEXAMICO 1G/ 10ML CJA X 50 AMP', '10'),
  ('DHP413', 'DIMENHIDRINATO 50MG/5ML CJA X 10 AMP.', '10'),
  ('DHP412', 'METAMIZOL SODICO 1 G/ 2ML CJA X 50 AMP.', '10'),
  ('DHP411', 'CLORFENAMINA 10 MG/ ML CJA X 10 AMP.', '10'),
  ('DHP217', 'DIPHAZINC 20 20 MG CJA X 100 TAB', '10'),
  ('DHP017', 'DIPHADIC LONG 75 75 MG/ 3 ML CJA X 1 AMP.', '10'),
  ('DHP016', 'DIPHARELAX 60 60 MG/ 2 ML CJA X 1 AMP.', '10'),
  ('DHP015', 'DIPHARELAX PLUS 450MG+35MG CJAX100 TAB', '10'),
  ('DHP014', 'A - FIEBRIN 1G/ 2ML CJA X 1 AMP.', '10'),
  ('DHP013', 'DYOMIN H 450 MG +50 MG CJA X 30TAB. REC.', '10'),
  ('DHP012', 'BROLAXIL 5 5 MG CJA X 100 TAB.', '10'),
  ('BSA308', 'BIO-DIGESTID 100 MG/ML SUSP ORAL CJA X 1 FCO X 20 ML', '10'),
  ('BSA307', 'BIOCORTEX 5 MG/5 ML SUSP ORAL CJA X 1 FCO X 100 ML', '10'),
  ('BSA306', 'BIOCORTEX 20 MG CJA X 100 TAB REC', '10'),
  ('BSA305', 'BIO-CISTENID 100 MG/5 ML POLV PARA SUSP ORAL CJA X 1 FCO X 60 ML', '10'),
  ('BSA304', 'BIO-CISTENID 500 MG CJA X 60 COMP REC', '10'),
  ('BSA303', 'BIO-ALER 10 MG CJA X 100 COMP REC', '10'),
  ('BSA302', 'BELSUC 500 MG CJA X 30 TAB REC', '10'),
  ('BSA301', 'ALLERGY-BIO 5 MG CJA X 60 TAB REC', '10'),
  ('BODHP425', 'METFORMINA 1000 MG CJA X 30 TAB. LIB. PROL.', '10'),
  ('BODHP412', 'METAMIZOL SODICO 1 G/ 2ML CJA X 50 AMP.', '10'),
  ('BODHP411', 'CLORFENAMINA 10 MG/ ML CJA X 10 AMP.', '10'),
  ('DHP408', 'KETOROLACO 60 MG/ 2 ML CJA X 100 AMP.', '10'),
  ('DHP407', 'ESOMEPRAZOL 40 MG CJA X 30 COMP. GR.', '10'),
  ('DHP406', 'ESOMEPRAZOL 20 MG CJA X 30 COMP. GR.', '10'),
  ('DHP405', 'MOXIFLOXACINO 400 MG CJA X 5 TAB. REC.', '10'),
  ('DHP403', 'OMEPRAZOL 40 MG CJA X 10 VIALES', '10'),
  ('DHP402', 'OMEPRAZOL 20 MG CJA X 100 CAP. LIB. R.', '10'),
  ('DHP401', 'FENITOINA SODICA 100 MG CJA X 100 TAB. REC.', '10'),
  ('DHP400', 'ATROPINA SULFATO 1MG/ 1ML CJA X 10 AMP.', '10'),
  ('DHP309', 'GASA ESTERIL 10 CM X 10 CM CAJA X 50 SOBRES', '10'),
  ('DHP308', 'GASA ESTERIL 7.5 CM X 7.5 CM CAJA X 50 SOBRES', '10'),
  ('DHP307', 'GASA ESTERIL 5 CM X 5 CM CAJA X 50 SOBRES', '10'),
  ('DHP306', 'HISOPOS NADÓ X 500 BASTBIO/PTA/ALGODÓN', '10'),
  ('DHP305', 'HISOPOS NADÓ X 200 BASTBIO/PTA/ALGODÓN', '10'),
  ('DHP304', 'HISOPOS NADÓ X 100 BASTBIO/PTA/ALGODÓN', '10'),
  ('DHP303', 'HISOPOS NADÓ X 500 BASTFLEX/PTA/ALGODÓN', '10'),
  ('DHP302', 'HISOPOS NADÓ X 200 BASTFLEX/PTA/ALGODÓN', '10'),
  ('DHP301', 'HISOPOS NADÓ X 100 BASTFLEX/TOPE/ALGODÓN', '10'),
  ('DHP300', 'HISOPOS NADÓ X 100 BASTFLEX/PTA/ALGODÓN', '10'),
  ('DHP216', 'TERMÓMETRO DIGITAL (GRIPAMAX) DT-01A x 1UND', '10'),
  ('DHP215', 'NAYFLEX MUJER 200 MG CJA X 100 CAP. BDA.', '10'),
  ('DHP214', 'HEMZON CJA X 100 TAB. MAST.', '10'),
  ('DHP213', 'IBUCALM DUO 500 MG + 200 MG CJA X 100 CAP. BDA.', '10'),
  ('DHP212', 'IBUCALM FORTE 400 MG CJA X 100 CAP. BDA.', '10'),
  ('DHP211', 'IBUCALM 200 200 MG X 100 CAP. BDA.', '10'),
  ('DHP210', 'DYNACAL 1250 MG CAJA X 100 TAB. REC.', '10'),
  ('BOP000008', 'NUTRIVIDA KIDS LATA X 1KG (SABOR CHOCOLATE)', '10'),
  ('BODHP414', 'ACIDO TRANEXAMICO 1G/ 10ML CJA X 50 AMP', '10'),
  ('BODHP410', 'ORFENADRINA CITRATO 60 60 MG/ 2 ML CJA X 100 AMP.', '10'),
  ('BODHP409', 'ORFENADRINA CITRATO 100MG X 100 TAB LP', '10'),
  ('BODHP408', 'KETOROLACO 60 MG/ 2 ML CJA X 100 AMP.', '10'),
  ('BODHP407', 'ESOMEPRAZOL 40 MG CJA X 30 COMP. GR.', '10'),
  ('BODHP406', 'ESOMEPRAZOL 20 MG CJA X 30 COMP. GR.', '10'),
  ('BODHP405', 'MOXIFLOXACINO 400 MG CJA X 5 TAB. REC.', '10'),
  ('BODHP402', 'OMEPRAZOL 20 MG CJA X 100 CAP. LIB. R.', '10'),
  ('BODHP401', 'FENITOINA SODICA 100 MG CJA X 100 TAB. REC.', '10'),
  ('BODHP400', 'ATROPINA SULFATO 1MG/ 1ML CJA X 10 AMP.', '10'),
  ('BODHP215', 'NAYFLEX MUJER 200 MG CJA X 100 CAP. BDA.', '10'),
  ('BODHP213', 'IBUCALM DUO 500 MG + 200 MG CJA X 100 CAP. BDA.', '10'),
  ('BODHP212', 'IBUCALM FORTE 400 MG CJA X 100 CAP. BDA.', '10'),
  ('BODHP211', 'IBUCALM 200 200 MG X 100 CAP. BDA.', '10'),
  ('BODHP210', 'DYNACAL 1250 MG CAJA X 100 TAB. REC.', '10'),
  ('BODHP209', 'DIPHADIC LONG 2 % CJA X TBO X 50 G', '10'),
  ('BODHP206', 'DIPHA ZINC KID 10 MG/5 ML X FCO X 100 ML', '10'),
  ('BODHP205', 'PROSTAMICIL 320 320 MG CJA X 30 CAP. BDA', '10'),
  ('BODHP204', 'GRIPAMAX 325 MG + 10 MG + 5 MG CJA X 120 CAP. BDA.', '10'),
  ('BODHP202', 'DIPHANATUR 500 500 MG CJA X 30 CAP. BDA.', '10'),
  ('BODHP200', 'VITAMINA E 400 UI CJA. X 30 CAP. BDA.', '10'),
  ('BODHP106', 'DAPHA 10 10 MG CJA X 30 TAB. REC.', '10'),
  ('BODHP010', 'KETOMAX 60 MG/ 2ML CJA X 1 AMP.', '10'),
  ('BOP000005', 'COLLAGEN PRETTY VITALS LATA X 300 GR', '10'),
  ('BOP000023', 'OVAMET 40-1 X 120 CAP', '10'),
  ('DHP207', 'DIPHA ZINC KID 20 MG/5 ML  FCO X 120 ML', '10'),
  ('DHP206', 'DIPHA ZINC KID 10 MG/5 ML X FCO X 120 ML', '10'),
  ('DHP205', 'PROSTAMICIL 320 320 MG CJA X 30 CAP. BDA', '10'),
  ('DHP204', 'GRIPAMAX 325 MG + 10 MG + 5 MG CJA X 120 CAP. BDA.', '10'),
  ('DHP203', 'DIPHANATUR FORTE X 100 CAP. BDA.', '10'),
  ('DHP202', 'DIPHANATUR 500 500 MG CJA X 30 CAP. BDA.', '10'),
  ('DHP201', 'DIPHANATUR 300 300 MG CJA X 60 CAP. BDA.', '10'),
  ('DHP200', 'VITAMINA E 400 UI CJA. X 30 CAP. BDA.', '10'),
  ('DHP108', 'JAMOL 5 5 MG CJA X 30 TAB. REC.', '10'),
  ('BSA113', 'TOCOSH COMPLEX 5 GR CJA X 30 SACHETS', '10'),
  ('BOBSA316', 'FLEXI-BIO 15 MG CJA X 120 TAB REC', '10'),
  ('BOBSA315', 'CIPROLAN 500 500 MG CJA X 100 COMP REC', '10'),
  ('BOBSA314', 'BIORELAX 450 MG + 35 MG CJA X 100 TAB REC', '10'),
  ('BOBSA313', 'BIOPROSTOL 200 MCG CJA X 30 TAB', '10'),
  ('BOBSA312', 'BIONAX RELAX 300 MG +250 MG CJA X 100 COMP REC', '10'),
  ('BOBSA302', 'BELSUC 500 MG CJA X 30 TAB REC', '10'),
  ('BOBSA301', 'ALLERGY-BIO 5 MG CJA X 60 TAB REC', '10'),
  ('BOBSA208', 'WAWA CREM POTE X 60 GR', '10'),
  ('BOBSA207', 'VITACAPIL SHAMPOO CJA X 1 FCO X 380 ML', '10'),
  ('REU101', 'REUMA SOL NF 5% + 1.5% + 1.5% POTE x 100 G - UNGÜENTO', '10'),
  ('REU102', 'REUMA SOL NF 5% + 1.5% + 1.5% POTE x 60 G - UNGÜENTO', '10'),
  ('REU103', 'REUMA SOL NF 5% + 1.5% + 1.5% POTE x 30 G - UNGÜENTO', '10'),
  ('REU104', 'REUMA SOL NF 5% + 1.5% + 1.5% POTE x 20 G - UNGÜENTO', '10'),
  ('PLGS16', 'ASHWAGANDA 500 MG FCO X 120 CAP.', '10'),
  ('PLGS01', 'COLAGENO BIARTI FORT LATA X 300 GR', '10'),
  ('DHP425', 'METFORMINA 1000 MG CJA X 30 TAB. LIB. PROL.', '10'),
  ('DHP422', 'DICLOFENACO 100 MG CJA X 100 CAP. LIB. PROL.', '10'),
  ('DHP106', 'DAPHA 10 10 MG CJA X 30 TAB. REC.', '10'),
  ('DHP105', 'DAPHA 10 10 MG CJA X 10 TAB. REC.', '10'),
  ('DHP104', 'DUO DAPHA 5 5 MG + 1000 MG CJA X 30 TAB. REC.', '10'),
  ('DHP103', 'DUO DAPHA 5 5 MG + 1000 MG CJA X 10 TAB. REC.', '10'),
  ('DHP102', 'DUO DAPHA 10 10 MG + 1000 MG CJA X 30 TAB. REC.', '10'),
  ('DHP101', 'DUO DAPHA 10 10 MG + 1000 MG CJA X 10 TAB. REC.', '10'),
  ('DHP100', 'DAPHA 10 10 MG CJA X 30 TAB. REC.', '10'),
  ('DHP026', 'DIPHADIC LONG 100 100 MG CJA X 100 CAP. LIB. PROL.', '10'),
  ('DHP025', 'TEZEN 400 400 MG CJA X 50 TAB. MAST.', '10'),
  ('DHP024', 'DRAVOM 50MG/ 5ML CJA X 1 AMP.', '10'),
  ('DHP023', 'HIERROMAX 50 MG/ 5ML CJA X FCO X 150 ML', '10'),
  ('DHP020', 'MUCOFLUX 200 200MG CJA X 30 SOBRE.', '10'),
  ('DHP019', 'MUCOFLUX 100 100MG CJA X 30 SOBRE.', '10'),
  ('DHP018', 'DIPHARELAX 100 MG X 100 TAB LIB. PROL.', '10'),
  ('DHP011', 'DUOCLAMOX 500MG+125MG CJA X 10 TAB. REC.', '10'),
  ('DHP010', 'KETOMAX 60 MG/ 2ML CJA X 1 AMP.', '10'),
  ('DHP008', 'ALLER - CLORT 10 MG/ 1ML CJA X 1 AMP.', '10'),
  ('DHP007', 'D - CORT 8 8 MG/ 2 ML CJA X 1 AMP.', '10'),
  ('DHP006', 'DIPHAPASMOL 40 40 MG CJA X 30 TAB. REC.', '10'),
  ('DHP005', 'DIPHAXAMICO 1 G/ 10 ML CJA X 1 AMP.', '10'),
  ('DHP004', 'DIVALPRID 500 500 MG CJA X 100 TAB. LIB. P', '10'),
  ('DHP003', 'DIPHACORTEN  15 MG/ 5 ML FCO X 120 ML', '10'),
  ('DHP002', 'DIPHACORTEN 5 MG/ 5 ML FCO X 120 ML', '10'),
  ('DHP001', 'DIPHACOXIB 400 400 MG CJA X 30 CAP.', '10'),
  ('BSA326', 'BIONAX ANTIGRIPAL 325 MG +10 MG+5 MG+2 MG CJA X 100 TAB REC', '10'),
  ('BSA325', 'VIGOR MAX 100 MG CJA X 80 COMP REC', '10'),
  ('BSA324', 'SULFAVILL BALSÁMICO NF 800 MG/15 ML+160 MG/15 ML+250 MG /15 ML SUSP ORAL CJA X 1 FCO X 100 ML', '10'),
  ('BSA320', 'SANATRIM BALSÁMICO NF 800 MG/15ML +160 MG/15ML +250 MG/15ML SUSP ORAL CJA X 1 FCO X 100 ML', '10'),
  ('BSA319', 'NAPROXCOLL 550 MG CJA X 100 TAB REC', '10'),
  ('BSA318', 'MUCOSAN B PEDIÁTRICO 7.5 MG/5ML + 0.005MG/5ML SOL ORAL CJA X 1 FCO X 120 ML', '10'),
  ('BSA317', 'GRIPACOLL FUERTE 500 MG + 5 MG + 2 MG CJA X 200 TAB REC', '10'),
  ('BSA316', 'FLEXI-BIO 15 MG CJA X 120 TAB REC', '10'),
  ('BSA315', 'CIPROLAN 500 500 MG CJA X 100 COMP REC', '10'),
  ('BSA313', 'BIOPROSTOL 200 MCG CJA X 30 TAB', '10'),
  ('BSA312', 'BIONAX RELAX 300 MG +250 MG CJA X 100 COMP REC', '10'),
  ('BSA311', 'BIONAX FORTE 500MG + 65MG CJA X 100 TAB REC', '10'),
  ('BSA310', 'BIONAX 550 550MG CJA X 100 TAB REC', '10'),
  ('BSA309', 'BIODOL 100 MG/5 ML SUSP ORAL CJA X 1 FCO X 60 ML', '10'),
  ('BSA204', 'FLEXICREM CJA X 1 TUBO X 50 GR', '10'),
  ('BSA203', 'FITO ACNYL CJA X 1 TUBO X 20 GR', '10'),
  ('BSA202', 'BIO VARIX CJA X 1 TUBO X 60 GR', '10'),
  ('BSA201', 'BIO-PANTHENID CJA X 1 TUBO X 20 GR', '10'),
  ('BSA118', 'VIGOR NAT X 5 GR X C/SOBRE', '10'),
  ('BSA117', 'VITABEL 5 GR CJA X 30 SACHETS', '10'),
  ('BSA116', 'VITDEFENSE 400 MG CJA X 100 CAPS', '10'),
  ('BSA115', 'VIT CAMU CAMU 5GR CJA X 30 SOBRES', '10'),
  ('BSA114', 'V&M MACA CON VIT Y MIN 5 GR CJA X 30 SACHETS', '10'),
  ('BSA111', 'RENOVA HP VIT 400 MG CJA X 100 CAPS', '10'),
  ('BSA110', 'PROTHEPA 400 MG CJA X 100 CAPS', '10'),
  ('BOP000019', 'NAD + RESVERATROL 500 MG FCO X 60 CAP.', '10'),
  ('BOP000017', 'SELENIO  500 MG FCO X 30 CAP.', '10'),
  ('BOP000016', 'ASHWAGANDA 500 MG FCO X 120 CAP.', '10'),
  ('BOP000013', 'CIT-K 500 MG FCO X 100 CAP.', '10'),
  ('BOP000011', 'MELATONIN 5 MG FCO X 100 GOM.', '10'),
  ('BOP000010', 'MELATONIN 2 MG FCO X 100 GOM.', '10'),
  ('BOP000009', 'NUTRIVIDA ADVANCE LATA X 1KG (SABOR VAINILLA)', '10'),
  ('BOP000007', 'NUTRIVIDA KIDS LATA X 1KG (SABOR VAINILLA)', '10'),
  ('BOP000004', 'CITREM PLUS 5 GR CJA X 34 SACHETS', '10'),
  ('BOP000003', 'CITREM PLUS POTE X 300 GR', '10'),
  ('BODHP307', 'GASA ESTERIL 5 CM X 5 CM CAJA X 50 SOBRES', '10'),
  ('BODHP306', 'HISOPOS NADÓ X 500 BASTBIO/PTA/ALGODÓN', '10'),
  ('BODHP305', 'HISOPOS NADÓ X 200 BASTBIO/PTA/ALGODÓN', '10'),
  ('BODHP304', 'HISOPOS NADÓ X 100 BASTBIO/PTA/ALGODÓN', '10'),
  ('BODHP303', 'HISOPOS NADÓ X 500 BASTFLEX/PTA/ALGODÓN', '10'),
  ('BODHP302', 'HISOPOS NADÓ X 200 BASTFLEX/PTA/ALGODÓN', '10'),
  ('BODHP301', 'HISOPOS NADÓ X 100 BASTFLEX/TOPE/ALGODÓN', '10'),
  ('BODHP300', 'HISOPOS NADÓ X 100 BASTFLEX/PTA/ALGODÓN', '10'),
  ('BODHP216', 'TERMÓMETRO DIGITAL (GRIPAMAX) DT-01A x 1UND', '10'),
  ('BODHP103', 'DUO DAPHA 5 5 MG + 1000 MG CJA X 10 TAB. REC.', '10'),
  ('BODHP102', 'DUO DAPHA 10 10 MG + 1000 MG CJA X 30 TAB. REC.', '10'),
  ('BODHP101', 'DUO DAPHA 10 10 MG + 1000 MG CJA X 10 TAB. REC.', '10'),
  ('BODHP100', 'DAPHA 10 10 MG CJA X 30 TAB. REC.', '10'),
  ('BODHP026', 'DIPHADIC LONG 100 100 MG CJA X 100 CAP. LIB. PROL.', '10'),
  ('BODHP025', 'TEZEN 400 400 MG CJA X 50 TAB. MAST.', '10'),
  ('BODHP024', 'DRAVOM 50MG/ 5ML CJA X 1 AMP.', '10'),
  ('BODHP023', 'HIERROMAX 50 MG/ 5ML CJA X FCO X 150 ML', '10'),
  ('BODHP022', 'FEM DAY 1.5 MG CJA X 1 TAB.', '10'),
  ('BODHP021', 'MUCOFLUX 600 600MG CJA X 30 SOBRE.', '10'),
  ('BODHP020', 'MUCOFLUX 200 200MG CJA X 30 SOBRE.', '10'),
  ('BODHP017', 'DIPHADIC LONG 75 75 MG/ 3 ML CJA X 1 AMP.', '10'),
  ('BODHP014', 'A - FIEBRIN 1G/ 2ML CJA X 1 AMP.', '10'),
  ('BODHP013', 'DYOMIN H 450 MG +50 MG CJA X 30TAB. REC.', '10'),
  ('BODHP012', 'BROLAXIL 5 5 MG CJA X 100 TAB.', '10'),
  ('BODHP011', 'DUOCLAMOX 500MG+125MG CJA X 10 TAB. REC.', '10'),
  ('BOBSA320', 'SANATRIM BALSÁMICO NF 800 MG/15ML +160 MG/15ML +250 MG/15ML SUSP ORAL CJA X 1 FCO X 100 ML', '10'),
  ('BOBSA318', 'MUCOSAN B PEDIÁTRICO 7.5 MG/5ML + 0.005MG/5ML SOL ORAL CJA X 1 FCO X 120 ML', '10'),
  ('BOBSA317', 'GRIPACOLL FUERTE 500 MG + 5 MG + 2 MG CJA X 200 TAB REC', '10'),
  ('BOBSA205', 'VITABEL CREMA ANTIEDAD CJA X 1 POTE X 50 GR', '10'),
  ('BOBSA204', 'FLEXICREM CJA X 1 TUBO X 50 GR', '10'),
  ('BOBSA203', 'FITO ACNYL CJA X 1 TUBO X 20 GR', '10'),
  ('BOBSA202', 'BIO VARIX CJA X 1 TUBO X 60GR', '10'),
  ('BOBSA201', 'BIO-PANTHENID CJA X 1 TUBO X 20 GR', '10'),
  ('BOBSA117', 'VITABEL 5 GR CJA X 30 SACHETS', '10'),
  ('BOBSA112', 'RINATUR 400 MG CJA X 100 CAPS', '10'),
  ('BOBSA111', 'RENOVA HP VIT 400 MG CJA X 100 CAPS', '10'),
  ('BOBSA110', 'PROTHEPA 400 MG CJA X 100 CAPS', '10'),
  ('BOBSA109', 'FLUYMAX 400 MG CAJA X 100 CAPS', '10'),
  ('BOBSA108', 'FLEXIPLUS GC 4.5 GR CJA X 30 SACHETS', '10'),
  ('BOBSA101', 'BIOPROPOL CJA X 1 FCO X 120 ML', '10'),
  ('BODHP110', 'GLICOFAST 1000 1000 MG CJA X 10 TAB. LIB. PROL.', '30'),
  ('DRN001', 'ACIDO FOLICO 800 MCG FCO 100 CAPSULAS', '10'),
  ('DRN002', 'BEAUTY DARE POLVO POTE X 1.1KG', '10'),
  ('DRN003', 'BEAUTY DARE POLVO POTE X 600GR', '10'),
  ('DRN004', 'COLLAGEN FULL POLVO POTE X 1KG', '10'),
  ('DRN005', 'COLLAGEN FULL POLVO  POTE X 600GR', '10'),
  ('DRN006', 'DARE B COMPLEX JBE X 400ML', '10'),
  ('DRN008', 'DAREFEM POLVO POTE X 1KG', '10'),
  ('DRN009', 'DAREFLEX  POLVO POTE X 1KG', '10'),
  ('DRN010', 'DAREFLEX FCO X 100 CAPSULAS', '10'),
  ('DRN011', 'DAREFLEX POLVO POTE X 600GR', '10'),
  ('DRN012', 'DAREKIDS POLVO POTE X 1.1KG', '10'),
  ('DRN013', 'DAREKIDS POLVO POTE X 600GR', '10'),
  ('DRN014', 'DARESURE POLVO POTE X 1.1KG', '10'),
  ('DRN015', 'DARESURE POLVO POTE X 600GR', '10'),
  ('DRN016', 'DARETOS EXPECTORANTE JBE  X 250ML', '10'),
  ('DRN017', 'FIBRADAR POLVO POTE X 1KG', '10'),
  ('DRN018', 'FIBRADAR POLVO POTE X 600GR', '10'),
  ('DRN019', 'FULL B FCO X 100 CAPSULAS', '10'),
  ('DRN020', 'FULL-VITRUM POLVO POTE X 1KG', '10'),
  ('DRN021', 'GERIADAR POLVO POTE X 1.1KG', '10'),
  ('DRN022', 'GERIADAR POLVO POTE X 600G', '10'),
  ('DRN023', 'GESTADAR POLVO POTE X 1KG', '10'),
  ('DRN024', 'GLUCODAR POLVO POTE X 1.1 KG', '10'),
  ('DRN025', 'GLUCODAR POLVO POTE X 600GR', '10'),
  ('DRN026', 'HEPPADAR FCO X 100 TABLETAS', '10'),
  ('DRN027', 'HEPPADAR POLVO POTE X 1KG', '10'),
  ('DRN028', 'MAGNEFULL ARANDANOS POTE X 350GR', '10'),
  ('DRN029', 'MAGNEFULL LIMON POTE X 350GR', '10'),
  ('DRN030', 'MAGNEFULL NARANJA POTE X 350GR', '10'),
  ('DRN031', 'MAGNEFULL NEUTRO POTE X 350GR', '10'),
  ('DRN047', 'MAGNEFULL PIÑA POTE X 350 GR', '10'),
  ('DRN032', 'NEUMODAR POLVO POTE  X 1.1KG', '10'),
  ('DRN033', 'NEUMODAR POLVO POTE X 600GR', '10'),
  ('DRN034', 'OMEGA 3 ,OMEGA 6 Y OMEGA 9 FCO X 100 CAP', '10'),
  ('DRN035', 'REDOX C FORTE POLVO POTE X 1KG', '10'),
  ('DRN036', 'THERMODAR POLVO POTE X 1KG', '10'),
  ('DRN037', 'URODAR FORTE POTE X 1.1KG', '10'),
  ('DRN038', 'DAREPROPOL JBE X 120ML', '10'),
  ('DRN039', 'GUMMIES CURCUMA + KION MANDARINA X 60 UND', '10'),
  ('DRN040', 'GUMMIES KIDS CALCIO + VIT D3 PERA X 60 UND', '10'),
  ('DRN041', 'GUMMIES KIDS HIERRO + VIT C FRESA X 60 UND', '10'),
  ('DRN042', 'GUMMIES KIDS MULTIVITAMINICOS TUTIFRUTI X 60 UND', '10'),
  ('DRN043', 'GUMMIES KIDS OMEGA 3,6,9 NARANJA X 60 UND', '10'),
  ('DRN044', 'GUMMIES KIDS PROBIOTICOS X 60 UNID', '10'),
  ('DRN045', 'GUMMIES KIDS ZINC + VIT C PIÑA X 60 UND', '10'),
  ('DRN046', 'GUMMIES MELATONINA 5 MG MANZANA X 60 UND', '10'),
  ('BOD001', 'ACIDO FOLICO 800 MCG FCO 100 CAPSULAS', '10'),
  ('BOD002', 'BEAUTY DARE POLVO POTE X 1.1KG', '10'),
  ('BOD003', 'BEAUTY DARE POLVO POTE X 600GR', '10'),
  ('BOD004', 'COLLAGEN FULL POLVO POTE X 1KG', '10'),
  ('BOD005', 'COLLAGEN FULL POLVO  POTE X 600GR', '10'),
  ('BOD006', 'DARE B COMPLEX JBE X 400ML', '10'),
  ('BOD008', 'DAREFEM POLVO POTE X 1KG', '10'),
  ('BOD009', 'DAREFLEX  POLVO POTE X 1KG', '10'),
  ('BOD010', 'DAREFLEX FCO X 100 CAPSULAS', '10'),
  ('BOD011', 'DAREFLEX POLVO POTE X 600GR', '10'),
  ('BOD012', 'DAREKIDS POLVO POTE X 1.1KG', '10'),
  ('BOD013', 'DAREKIDS POLVO POTE X 600GR', '10'),
  ('BOD014', 'DARESURE POLVO POTE X 1.1KG', '10'),
  ('BOD015', 'DARESURE POLVO POTE X 600GR', '10'),
  ('BOD016', 'DARETOS EXPECTORANTE JBE  X 250ML', '10'),
  ('BOD017', 'FIBRADAR POLVO POTE X 1KG', '10'),
  ('BOD018', 'FIBRADAR POLVO POTE X 600GR', '10'),
  ('BOD019', 'FULL B FCO X 100 CAPSULAS', '10'),
  ('BOD020', 'FULL-VITRUM POLVO POTE X 1KG', '10'),
  ('BOD021', 'GERIADAR POLVO POTE X 1.1KG', '10'),
  ('BOD022', 'GERIADAR POLVO POTE X 600G', '10'),
  ('BOD023', 'GESTADAR POLVO POTE X 1KG', '10'),
  ('BOD024', 'GLUCODAR POLVO POTE X 1.1 KG', '10'),
  ('BOD025', 'GLUCODAR POLVO POTE X 600GR', '10'),
  ('BOD026', 'HEPPADAR FCO X 100 TABLETAS', '10'),
  ('BOD027', 'HEPPADAR POLVO POTE X 1KG', '10'),
  ('BOD028', 'MAGNEFULL ARANDANOS POTE X 350GR', '10'),
  ('BOD029', 'MAGNEFULL LIMON POTE X 350GR', '10'),
  ('BOD030', 'MAGNEFULL NARANJA POTE X 350GR', '10'),
  ('BOD031', 'MAGNEFULL NEUTRO POTE X 350GR', '10'),
  ('BOD47', 'MAGNEFULL PIÑA POTE X 350 GR', '10'),
  ('BOD032', 'NEUMODAR POLVO POTE  X 1.1KG', '10'),
  ('BOD033', 'NEUMODAR POLVO POTE X 600GR', '10'),
  ('BOD034', 'OMEGA 3 ,OMEGA 6 Y OMEGA 9 FCO X 100 CAP', '10'),
  ('BOD035', 'REDOX C FORTE POLVO POTE X 1KG', '10'),
  ('BOD036', 'THERMODAR POLVO POTE X 1KG', '10'),
  ('BOD037', 'URODAR FORTE POTE X 1.1KG', '10'),
  ('BOD038', 'DAREPROPOL JBE X 120ML', '10'),
  ('BOD039', 'GUMMIES CURCUMA + KION MANDARINA X 60 UND', '10'),
  ('BOD040', 'GUMMIES KIDS CALCIO + VIT D3 PERA X 60 UND', '10'),
  ('BOD041', 'GUMMIES KIDS HIERRO + VIT C FRESA X 60 UND', '10'),
  ('BOD042', 'GUMMIES KIDS MULTIVITAMINICOS TUTIFRUTI X 60 UND', '10'),
  ('BOD043', 'GUMMIES KIDS OMEGA 3,6,9 NARANJA X 60 UND', '10'),
  ('BOD044', 'GUMMIES KIDS PROBIOTICOS X 60 UNID', '10'),
  ('BOD045', 'GUMMIES KIDS ZINC + VIT C PIÑA X 60 UND', '10'),
  ('BOD046', 'GUMMIES MELATONINA 5 MG MANZANA X 60 UND', '10'),
  ('BODHP109', 'JAMOL 5 5 MG CJA X 10 TAB. REC.', '30'),
  ('PLGS21', 'ZINC + L-ARGININA 500 MG FCO X 90 CAP.', '10'),
  ('PLGS20', 'MELENA DE LEON 500 MG FCO X 60 CAP.', '10'),
  ('PLGS19', 'NAD + RESVERATROL 500 MG FCO X 60 CAP.', '10'),
  ('PLGS18', 'AGUAJE+FENOGRECO 500 MG FCO X 90 CAP.', '10'),
  ('PLGS04', 'CITREM PLUS 5 GR CJA X 34 SACHETS', '10'),
  ('PLGS03', 'CITREM PLUS POTE X 300 GR', '10'),
  ('DHP022', 'FEM DAY 1.5 MG CJA X 1 TAB.', '10'),
  ('BSA314', 'BIORELAX 450 MG + 35 MG CJA X 100 TAB REC', '10'),
  ('BSA109', 'FLUYMAX 400 MG CAJA X 100 CAPS', '10'),
  ('BSA108', 'FLEXIPLUS GC 4.5 GR CJA X 30 SACHETS', '10'),
  ('BODHP418', 'DEXAMETASONA FOSFATO 4 MG/ 2 ML CJA X 50 AMP.', '10'),
  ('BODHP018', 'DIPHARELAX 100 MG X 100 TAB LIB. PROL.', '10'),
  ('BODHP016', 'DIPHARELAX 60 60 MG/ 2 ML CJA X 1 AMP.', '10'),
  ('BOBSA322', 'SANATRIM FORTE 400 MG/5 ML+ 80 MG/5 ML SUSP ORAL CJA X 1 FCO X 100 ML', '10'),
  ('PLGS06', 'COLLAGEN PRETTY VITALS 10 GR CJA X 33 SACHETS', '10'),
  ('DHP420', 'ALBENDAZOL 400 MG CJA X 50 TAB. MAST.', '10'),
  ('DHP419', 'METOCLOPRAMIDA 10 MG/ 2 ML  CJA X 10 AMP.', '10'),
  ('DHP418', 'DEXAMETASONA FOSFATO 4 MG/ 2 ML CJA X 50 AMP.', '10'),
  ('XXXXXX', 'CAJA E INSERTO DIPHADIC LONG X 1 AMP', '10'),
  ('BODHP208', 'NATUVARIX 100 MG CJA X 60 CAP. BDA.', '10'),
  ('BODHP207', 'DIPHA ZINC KID 20 MG/5 ML  FCO X 120 ML', '10'),
  ('BODHP203', 'DIPHANATUR FORTE X 100 CAP. BDA.', '10'),
  ('DHP410', 'ORFENADRINA CITRATO 60 60 MG/ 2 ML CJA X 100 AMP.', '10'),
  ('BODHP214', 'HEMZON CJA X 100 TAB. MAST.', '10'),
  ('XXXX1', 'CAJA FENITOINA 100 MG CJA X 100 TAB. REC.', '10'),
  ('DHP208', 'NATUVARIX 100 MG CJA X 60 CAP. BDA.', '10'),
  ('DHP209', 'DIPHADIC LONG 2 % CJA X TBO X 50 G', '10'),
  ('DHP107', 'GLICOFAST 1000 1000 MG CJA X 30 TAB. LIB. PROL.', '10'),
  ('BSA323', 'SANATRIM PEDIATRICO 200 MG/5ML +40 MG/5ML SUSP ORAL CJA X 1 FCO X 60 ML', '10'),
  ('BSA322', 'SANATRIM FORTE 400 MG/5 ML+ 80 MG/5 ML SUSP ORAL CJA X 1 FCO X 100 ML', '10'),
  ('BSA321', 'SANATRIM FORTE 800MG + 160MG CJA X 100 TAB REC', '10'),
  ('BSA208', 'WAWA CREM POTE X 60 GR', '10'),
  ('BSA207', 'VITACAPIL SHAMPOO CJA X 1 FCO X 380 ML', '10'),
  ('BSA206', 'VITACAPIL ACONDICIONADOR CJA X 1 FCO X 380 ML', '10'),
  ('BSA205', 'VITABEL CREMA ANTIEDAD CJA X 1 POTE X 50 GR', '10'),
  ('BSA112', 'RINATUR 400 MG CJA X 100 CAPS', '10'),
  ('BODHP309', 'GASA ESTERIL 10 CM X 10 CM CAJA X 50 SOBRES', '10'),
  ('BODHP308', 'GASA ESTERIL 7.5 CM X 7.5 CM CAJA X 50 SOBRES', '10'),
  ('BODHP105', 'DAPHA 10 10 MG CJA X 10 TAB. REC.', '10'),
  ('BODHP007', 'D - CORT 8 8 MG/ 2 ML CJA X 1 AMP.', '10'),
  ('BODHP006', 'DIPHAPASMOL 40 40 MG CJA X 30 TAB. REC.', '10'),
  ('BODHP005', 'DIPHAXAMICO 1 G/ 10 ML CJA X 1 AMP.', '10'),
  ('BODHP004', 'DIVALPRID 500 500 MG CJA X 100 TAB. LIB. P', '10'),
  ('BODHP003', 'DIPHACORTEN  15 MG/ 5 ML FCO X 120 ML', '10'),
  ('BOBSA206', 'VITACAPIL ACONDICIONADOR CJA X 1 FCO X 380 ML', '10'),
  ('BOBSA116', 'VITDEFENSE 400 MG CJA X 100 CAPS', '10'),
  ('BOBSA115', 'VIT CAMU CAMU 5GR CJA X 30 SOBRES', '10'),
  ('BOBSA114', 'V&M MACA CON VIT Y MIN 5 GR CJA X 30 SACHETS', '10'),
  ('BOBSA113', 'TOCOSH COMPLEX 5 GR CJA X 30 SACHETS', '10'),
  ('DHP028', 'DRAVOM 50 MG/ 5ML CJA X 10 AMP', '10'),
  ('DRN048', 'FLORADAR POLVO POTE X 1.1KG', '10'),
  ('DRN007', 'DARE B KIDS JBE X 400ML', '10'),
  ('PLGS24', 'ASHWCALMEX 500 MG FCO X 120 CAP.', '10'),
  ('BOD007', 'DARE B KIDS JBE X 400ML', '10');

drop table if exists _excepcion_dapha;
create temporary table _excepcion_dapha (codigo text primary key);
insert into _excepcion_dapha (codigo) values
  ('DHP100'),
  ('DHP101'),
  ('DHP102'),
  ('DHP105'),
  ('DHP106'),
  ('BODHP100'),
  ('BODHP101'),
  ('BODHP102'),
  ('BODHP105'),
  ('BODHP106');

do $reconciliacion$
declare
  v_total_catalogo integer;
  v_sin_match integer;
  v_desc integer;
  v_afect integer := 0;
  v_sin_perfil integer;
  v_fila record;
begin
  select count(*) into v_total_catalogo from _nubefact_catalogo;

  -- ---------- Reporte previo ----------
  select count(*) into v_sin_match
  from _nubefact_catalogo n
  where not exists (
    select 1 from pedidos.products p
    where upper(btrim(p.codigo_interno)) = n.codigo);

  raise notice '--- Reconciliacion NubeFact: % codigos en el catalogo ---', v_total_catalogo;
  raise notice 'Sin match en pedidos.products: %', v_sin_match;

  if v_sin_match > 0 then
    for v_fila in
      select n.codigo, n.descripcion from _nubefact_catalogo n
      where not exists (select 1 from pedidos.products p
                        where upper(btrim(p.codigo_interno)) = n.codigo)
      order by n.codigo
    loop
      raise notice '  SIN MATCH: % | %', v_fila.codigo, v_fila.descripcion;
    end loop;
  end if;

  -- Productos con match pero sin perfil tributario vigente: no se les puede
  -- versionar nada, y hay que saberlo.
  select count(*) into v_sin_perfil
  from pedidos.products p
  join _nubefact_catalogo n on upper(btrim(p.codigo_interno)) = n.codigo
  where not exists (select 1 from pedidos.product_tax_profiles t
                    where t.product_id = p.id and t.vigente_hasta is null);
  if v_sin_perfil > 0 then
    raise notice 'ATENCION: % producto(s) con match no tienen perfil tributario vigente; no se les versiono nada.', v_sin_perfil;
  end if;

  -- ---------- 1. Descripciones ----------
  select count(*) into v_desc
  from pedidos.products p
  join _nubefact_catalogo n on upper(btrim(p.codigo_interno)) = n.codigo
  where p.descripcion is distinct from n.descripcion;

  update pedidos.products p
  set descripcion = n.descripcion,
      updated_at = now()
  from _nubefact_catalogo n
  where upper(btrim(p.codigo_interno)) = n.codigo
    and p.descripcion is distinct from n.descripcion;

  raise notice 'Descripciones actualizadas: %', v_desc;

  -- ---------- 2. Afectacion tributaria (version nueva) ----------
  for v_fila in
    select p.id as product_id,
           upper(btrim(p.codigo_interno)) as codigo,
           t.afectacion_tributaria as antes,
           t.tasa_aplicable as tasa_antes,
           case n.afectacion when '10' then 'GRAVADO' else 'INAFECTO' end as despues,
           case n.afectacion when '10' then 18.00 else 0.00 end as tasa_despues,
           t.vvf_sin_igv, t.vvd_sin_igv,
           t.costo_referencial_distribuidora, t.fecha_vigencia_proveedor
    from pedidos.products p
    join _nubefact_catalogo n on upper(btrim(p.codigo_interno)) = n.codigo
    join pedidos.product_tax_profiles t
      on t.product_id = p.id and t.vigente_hasta is null
    where upper(btrim(p.codigo_interno)) not in (select codigo from _excepcion_dapha)
      and (t.afectacion_tributaria
             is distinct from case n.afectacion when '10' then 'GRAVADO' else 'INAFECTO' end
        or t.tasa_aplicable
             is distinct from case n.afectacion when '10' then 18.00 else 0.00 end)
    order by codigo
  loop
    insert into pedidos.product_tax_profiles (
      product_id, afectacion_tributaria, tasa_aplicable, vigente_desde,
      vvf_sin_igv, vvd_sin_igv, costo_referencial_distribuidora, fecha_vigencia_proveedor)
    values (
      v_fila.product_id, v_fila.despues, v_fila.tasa_despues, current_date,
      v_fila.vvf_sin_igv, v_fila.vvd_sin_igv,
      v_fila.costo_referencial_distribuidora, v_fila.fecha_vigencia_proveedor);

    v_afect := v_afect + 1;
    raise notice '  AFECTACION: % | % tasa % -> % tasa %',
      v_fila.codigo, v_fila.antes, v_fila.tasa_antes, v_fila.despues, v_fila.tasa_despues;
  end loop;

  raise notice 'Perfiles tributarios versionados en esta corrida: %', v_afect;

  -- La excepcion se reporta siempre, para que quede en el log que se aplico.
  raise notice 'Excepcion DAPHA 10 respetada: 10 codigos quedaron INAFECTOS sin importar el catalogo.';
end $reconciliacion$;


-- ============================================================================
-- Desactivacion temporal de los productos que NubeFact no tiene
-- ============================================================================
--
-- Confirmado por el usuario el 2026-08-14 sobre el reporte de la vista previa.
-- Estos 16 productos estan activos en nuestro catalogo pero NO existen en el
-- catalogo de NubeFact, asi que hoy no se pueden facturar correctamente.
--
-- Se DESACTIVAN, no se borran: es reversible. Dejan de aparecer en el buscador
-- de "Nuevo pedido" (que filtra estado = 'activo') y siguen visibles en el
-- catalogo administrativo con la nota que explica por que.

alter table pedidos.products add column if not exists nota_estado text;

comment on column pedidos.products.nota_estado is
  'Por que el producto esta en su estado actual. Se muestra en el catalogo administrativo; no se usa en pedidos ni en documentos fiscales.';

do $desactivar$
declare
  v_codigos text[] := array[
    'DHP218','DHP219','DHP220','DHP221','DHP222','DHP223','DHP224','DHP225',
    'DHP226','DHP227','DHP228','DHP229','DHP421','DHP423','DHP424','PLGS14'];
  v_nota text := 'Inactivo temporalmente — no está en el catálogo de NubeFact, no se puede facturar. Contactar a quien administre la cuenta NubeFact para agregarlo.';
  v_desactivados integer;
  v_ya_inactivos integer;
  v_no_existen integer;
  v_fila record;
begin
  select count(*) into v_no_existen
  from unnest(v_codigos) c
  where not exists (select 1 from pedidos.products p
                    where upper(btrim(p.codigo_interno)) = c);

  select count(*) into v_ya_inactivos
  from pedidos.products p
  where upper(btrim(p.codigo_interno)) = any(v_codigos) and p.estado = 'inactivo';

  update pedidos.products p
  set estado = 'inactivo',
      nota_estado = v_nota,
      updated_at = now()
  where upper(btrim(p.codigo_interno)) = any(v_codigos)
    and p.estado = 'activo';
  get diagnostics v_desactivados = row_count;

  raise notice '--- Desactivacion por ausencia en NubeFact ---';
  raise notice 'Desactivados ahora: % | ya estaban inactivos: % | no existen en products: %',
    v_desactivados, v_ya_inactivos, v_no_existen;

  if v_no_existen > 0 then
    for v_fila in
      select c as codigo from unnest(v_codigos) c
      where not exists (select 1 from pedidos.products p
                        where upper(btrim(p.codigo_interno)) = c)
    loop
      raise notice '  NO EXISTE en products, nada que desactivar: %', v_fila.codigo;
    end loop;
  end if;

  -- La nota se refresca tambien en los que ya estaban inactivos por otro
  -- motivo, para que el catalogo diga la razon vigente y no una vieja.
  update pedidos.products p
  set nota_estado = v_nota, updated_at = now()
  where upper(btrim(p.codigo_interno)) = any(v_codigos)
    and p.estado = 'inactivo'
    and p.nota_estado is distinct from v_nota;
end $desactivar$;

-- ============================================================================
-- Borrado del producto de prueba DAPHA10-EJ
-- ============================================================================
--
-- Placeholder sembrado en Fase 2 que quedo obsoleto al importar la lista real
-- de Diphasac (ver docs/business-rules.md). El usuario confirmo borrarlo.
--
-- Solo se borra si NO tiene ningun pedido asociado. Si tiene, se desactiva:
-- un producto referenciado por un pedido no se puede borrar sin romper el
-- historico, y el historico de pedidos no se toca.

do $borrar_ejemplo$
declare
  v_id uuid;
  v_pedidos integer;
  v_precios integer;
begin
  select id into v_id from pedidos.products where codigo_interno = 'DAPHA10-EJ';

  if v_id is null then
    raise notice 'DAPHA10-EJ: no existe, nada que hacer.';
    return;
  end if;

  select count(*) into v_pedidos from pedidos.order_items where product_id = v_id;

  if v_pedidos > 0 then
    update pedidos.products
    set estado = 'inactivo',
        nota_estado = 'Producto de ejemplo de Fase 2, obsoleto. No se borra porque tiene pedidos asociados; se desactiva para que no se pueda usar.',
        updated_at = now()
    where id = v_id;
    raise notice 'DAPHA10-EJ: tiene % linea(s) de pedido asociadas. NO se borro; quedo inactivo.', v_pedidos;
    return;
  end if;

  -- Sin pedidos: se borra. Sus precios de lista se van con el, porque solo
  -- existen para sostener a este producto de prueba (price_list_items no
  -- tiene on delete cascade, asi que hay que quitarlos a mano).
  delete from pedidos.price_list_items where product_id = v_id;
  get diagnostics v_precios = row_count;

  -- product_tax_profiles y stock_levels si tienen cascade.
  delete from pedidos.products where id = v_id;

  raise notice 'DAPHA10-EJ: sin pedidos asociados, BORRADO (y % fila(s) de price_list_items que solo lo sostenian a el).', v_precios;
end $borrar_ejemplo$;

drop table if exists _nubefact_catalogo;
drop table if exists _excepcion_dapha;
