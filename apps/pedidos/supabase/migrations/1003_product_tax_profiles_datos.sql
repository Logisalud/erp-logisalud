-- Unificación de Pedidos, parte 4: perfiles tributarios de los productos.
--
-- Origen: pedidos.product_tax_profiles del proyecto de Andrés, 217 filas.
-- Acá entran 167. Las 50 excluidas y el por qué están abajo — si alguien
-- pregunta algún día por qué no son 217, la respuesta es esta.
--
-- El producto se resuelve por `codigo`, no por el uuid del origen: los ids de
-- catalogo.productos se generaron nuevos al importar (ver 1002), así que el
-- product_id viejo no existe en esta base.
--
-- ===================================================================
-- QUÉ SE EXCLUYÓ Y POR QUÉ  (50 filas)
-- ===================================================================
-- 50 productos BSA* (los 50 de Biosana) tenían DOS filas cada uno:
--
--   fila A:  vigente_desde = 2026-08-02,  vigente_hasta = 2026-08-02
--   fila B:  vigente_desde = 2026-08-02,  vigente_hasta = null
--
-- Con afectación, tasa, VVF, VVD y costo referencial IDÉNTICOS entre las dos.
-- Eso no es historial: una vigencia que abre y cierra el mismo día, con los
-- mismos valores que la fila abierta, es la misma lista de precios importada
-- dos veces. Se conserva la fila abierta (B) y se descarta la cerrada (A).
--
-- NO es una decisión tributaria: no se cambió ninguna afectación, ninguna
-- tasa ni ningún importe. Solo se dejó de duplicar. Si alguna vez hiciera
-- falta reconstruir el estado exacto del origen, las 50 filas descartadas
-- son deducibles: por cada producto BSA*, una copia de su fila actual con
-- vigente_hasta = '2026-08-02'.
--
-- ===================================================================
-- QUÉ SÍ SE CONSERVÓ COMPLETO
-- ===================================================================
-- 5 productos tienen dos filas con valores REALMENTE distintos, y las dos
-- entran: DHP103, DHP107, DHP108, DHP416 y DHP425 pasan de INAFECTO (tasa 0)
-- a GRAVADO (tasa 18) el 2026-08-14. Ese sí es historial tributario y
-- borrarlo cambiaría cómo se factura hacia atrás.
--
-- Los otros 107 productos tenían una sola fila y entran tal cual.
--
--   217 en el origen  −  50 duplicadas  =  167 acá
--   167 filas sobre 162 productos  (los 5 de arriba aportan la fila extra)
--
-- Una rareza menor que se copió tal cual, sin corregir: DHP216 tiene
-- fecha_vigencia_proveedor = 1899-12-30, que es el cero del calendario de
-- Excel — o sea, una celda vacía leída como fecha. Es informativa, no entra
-- en ningún cálculo, y corregirla sería inventar un dato.
--
-- Re-ejecutable: borra las filas de estos productos antes de insertarlas.

delete from pedidos.product_tax_profiles
 where producto_id in (select id from catalogo.productos);

insert into pedidos.product_tax_profiles
  (producto_id, afectacion_tributaria, tasa_aplicable, vvf_sin_igv, vvd_sin_igv,
   costo_referencial_distribuidora, fecha_vigencia_proveedor, vigente_desde, vigente_hasta)
values
((select id from catalogo.productos where codigo='BSA101'),'GRAVADO',18.00,16.1017,12.8814,15.2000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA102'),'GRAVADO',18.00,16.1017,12.8814,15.2000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA103'),'GRAVADO',18.00,80.5085,64.4068,76.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA104'),'GRAVADO',18.00,75.4237,60.3390,71.2000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA105'),'GRAVADO',18.00,82.2034,65.7627,77.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA106'),'GRAVADO',18.00,82.2034,65.7627,77.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA107'),'GRAVADO',18.00,82.2034,65.7627,77.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA108'),'GRAVADO',18.00,95.5932,76.4746,90.2400,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA109'),'GRAVADO',18.00,74.5763,59.6610,70.4000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA110'),'GRAVADO',18.00,82.2034,65.7627,77.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA111'),'GRAVADO',18.00,82.2034,65.7627,77.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA112'),'GRAVADO',18.00,82.2034,65.7627,77.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA113'),'GRAVADO',18.00,95.5932,76.4746,90.2400,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA114'),'GRAVADO',18.00,82.2034,65.7627,77.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA115'),'GRAVADO',18.00,82.2034,65.7627,77.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA116'),'GRAVADO',18.00,82.2034,65.7627,77.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA117'),'GRAVADO',18.00,82.2034,65.7627,77.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA201'),'GRAVADO',18.00,19.0678,15.2542,18.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA202'),'GRAVADO',18.00,21.1017,16.8814,19.9200,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA203'),'GRAVADO',18.00,19.0678,15.2542,18.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA204'),'GRAVADO',18.00,19.0678,15.2542,18.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA205'),'GRAVADO',18.00,29.6610,23.7288,28.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA206'),'GRAVADO',18.00,22.4576,17.9661,21.2000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA207'),'GRAVADO',18.00,19.0678,15.2542,18.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA208'),'GRAVADO',18.00,15.9322,12.7458,15.0400,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA301'),'GRAVADO',18.00,67.7966,54.2373,64.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA302'),'GRAVADO',18.00,76.2712,61.0169,72.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA303'),'GRAVADO',18.00,50.8475,40.6780,48.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA304'),'GRAVADO',18.00,207.6271,166.1017,196.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA305'),'GRAVADO',18.00,20.3390,16.2712,19.2000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA306'),'GRAVADO',18.00,101.6949,81.3559,96.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA307'),'GRAVADO',18.00,13.4746,10.7797,12.7200,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA308'),'GRAVADO',18.00,10.1695,8.1356,9.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA309'),'GRAVADO',18.00,8.3898,6.7119,7.9200,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA310'),'GRAVADO',18.00,72.0339,57.6271,68.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA311'),'GRAVADO',18.00,67.7966,54.2373,64.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA312'),'GRAVADO',18.00,101.6949,81.3559,96.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA313'),'GRAVADO',18.00,50.8475,40.6780,48.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA314'),'GRAVADO',18.00,101.6949,81.3559,96.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA315'),'GRAVADO',18.00,127.1186,101.6949,120.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA316'),'GRAVADO',18.00,67.7966,54.2373,64.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA317'),'GRAVADO',18.00,110.1695,88.1356,104.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA318'),'GRAVADO',18.00,12.2881,9.8305,11.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA319'),'GRAVADO',18.00,67.7966,54.2373,64.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA320'),'GRAVADO',18.00,11.4407,9.1525,10.8000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA321'),'GRAVADO',18.00,63.5593,50.8475,60.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA322'),'GRAVADO',18.00,10.5932,8.4746,10.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA323'),'GRAVADO',18.00,8.3898,6.7119,7.9200,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA324'),'GRAVADO',18.00,11.4407,9.1525,10.8000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='BSA325'),'GRAVADO',18.00,169.4915,135.5932,160.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP001'),'GRAVADO',18.00,35.5932,29.1864,34.4400,'2027-12-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP002'),'GRAVADO',18.00,9.7712,8.0124,9.4546,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP003'),'GRAVADO',18.00,12.1017,9.9234,11.7096,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP005'),'GRAVADO',18.00,4.7797,3.9193,4.6248,'2026-11-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP007'),'GRAVADO',18.00,2.0763,1.7025,2.0090,'2026-05-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP008'),'GRAVADO',18.00,3.3898,2.7797,3.2800,'2026-04-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP009'),'GRAVADO',18.00,1.7542,1.4385,1.6974,'2026-08-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP010'),'GRAVADO',18.00,4.2373,3.4746,4.1000,'2026-11-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP014'),'GRAVADO',18.00,2.1186,1.7373,2.0500,'2028-02-28','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP016'),'GRAVADO',18.00,2.7119,2.2237,2.6240,'2026-11-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP017'),'GRAVADO',18.00,2.3305,1.9110,2.2550,'2028-03-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP018'),'GRAVADO',18.00,32.9492,27.0183,31.8816,'2028-01-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP019'),'GRAVADO',18.00,21.0051,17.2242,20.3245,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP020'),'GRAVADO',18.00,18.6017,15.2534,17.9990,'2027-05-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP021'),'GRAVADO',18.00,28.2627,23.1754,27.3470,'2027-05-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP022'),'GRAVADO',18.00,2.1186,1.7373,2.0500,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP023'),'GRAVADO',18.00,11.3559,9.3119,10.9880,'2028-02-29','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP024'),'GRAVADO',18.00,1.9661,1.6122,1.9024,'2028-01-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP025'),'GRAVADO',18.00,110.1695,90.3390,106.6000,'2028-04-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP027'),'GRAVADO',18.00,126.6949,103.8898,122.5900,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP101'),'INAFECTO',0.00,null,null,null,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP102'),'GRAVADO',18.00,132.2034,113.6949,134.1600,'2027-02-28','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP103'),'INAFECTO',0.00,null,null,null,null,'2026-08-02','2026-08-13'),
((select id from catalogo.productos where codigo='DHP103'),'GRAVADO',18.00,null,null,null,null,'2026-08-14',null),
((select id from catalogo.productos where codigo='DHP104'),'GRAVADO',18.00,67.1186,57.7220,68.1120,'2027-02-28','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP105'),'INAFECTO',0.00,null,null,null,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP106'),'INAFECTO',0.00,null,78.7200,78.7200,'2027-02-28','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP107'),'INAFECTO',0.00,null,43.0000,43.0000,'2028-09-01','2026-08-02','2026-08-13'),
((select id from catalogo.productos where codigo='DHP107'),'GRAVADO',18.00,null,43.0000,43.0000,'2028-09-01','2026-08-14',null),
((select id from catalogo.productos where codigo='DHP108'),'INAFECTO',0.00,null,77.4000,77.4000,'2027-08-01','2026-08-02','2026-08-13'),
((select id from catalogo.productos where codigo='DHP108'),'GRAVADO',18.00,null,77.4000,77.4000,'2027-08-01','2026-08-14',null),
((select id from catalogo.productos where codigo='DHP200'),'GRAVADO',18.00,13.5593,11.1186,13.1200,'2027-06-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP201'),'GRAVADO',18.00,102.0000,83.6400,98.6952,'2027-04-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP202'),'GRAVADO',18.00,90.7627,74.4254,87.8220,'2027-04-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP203'),'GRAVADO',18.00,109.2458,92.8589,109.5735,'2028-02-29','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP204'),'GRAVADO',18.00,67.7966,57.6271,68.0000,'2027-08-01','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP205'),'GRAVADO',18.00,50.0847,41.0695,48.4620,'2027-02-28','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP206'),'GRAVADO',18.00,15.9746,13.0992,15.4570,'2026-11-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP207'),'GRAVADO',18.00,15.7288,12.8976,15.2192,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP208'),'GRAVADO',18.00,38.1356,31.2712,36.9000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP209'),'GRAVADO',18.00,13.9831,11.4661,13.5300,'2028-05-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP211'),'GRAVADO',18.00,30.5085,25.9322,30.6000,'2027-12-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP212'),'GRAVADO',18.00,42.3729,36.0169,42.5000,'2027-12-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP213'),'GRAVADO',18.00,49.1525,41.7797,49.3000,'2027-12-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP214'),'GRAVADO',18.00,25.4237,20.8475,24.6000,'2028-01-01','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP215'),'GRAVADO',18.00,27.9661,23.7712,28.0500,'2027-04-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP216'),'GRAVADO',18.00,8.6441,7.0881,8.3640,'1899-12-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP217'),'GRAVADO',18.00,63.5593,52.1186,61.5000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP218'),'GRAVADO',18.00,101.6949,83.3898,98.4000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP219'),'GRAVADO',18.00,3.8136,3.1271,3.6900,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP220'),'GRAVADO',18.00,3.8136,3.1271,3.6900,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP221'),'GRAVADO',18.00,16.9492,13.8983,16.4000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP222'),'GRAVADO',18.00,21.1864,17.3729,20.5000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP223'),'GRAVADO',18.00,50.8475,41.6949,49.2000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP224'),'GRAVADO',18.00,63.5593,52.1186,61.5000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP225'),'GRAVADO',18.00,55.0847,45.1695,53.3000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP226'),'GRAVADO',18.00,90.7627,74.4254,87.8220,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP227'),'GRAVADO',18.00,102.0000,83.6400,98.6952,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP228'),'GRAVADO',18.00,109.2458,89.5815,105.7062,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP229'),'GRAVADO',18.00,84.7458,69.4915,82.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP301'),'GRAVADO',18.00,3.6356,3.0903,3.6465,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP302'),'GRAVADO',18.00,2.5424,2.1610,2.5500,'2027-02-07','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP303'),'GRAVADO',18.00,7.8983,6.7136,7.9220,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP304'),'GRAVADO',18.00,2.3814,2.0242,2.3885,'2026-03-03','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP305'),'GRAVADO',18.00,2.9661,2.5212,2.9750,'2027-04-07','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP306'),'GRAVADO',18.00,6.7797,5.7627,6.8000,'2027-05-07','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP307'),'GRAVADO',18.00,17.7966,15.1271,17.8500,'2030-07-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP308'),'GRAVADO',18.00,32.2034,27.3729,32.3000,'2030-07-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP309'),'GRAVADO',18.00,53.3898,45.3814,53.5500,'2030-07-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP400'),'GRAVADO',18.00,9.2966,7.6232,8.9954,'2027-09-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP401'),'GRAVADO',18.00,18.6017,15.2534,17.9990,'2028-02-29','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP402'),'GRAVADO',18.00,8.0508,6.6017,7.7900,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP403'),'GRAVADO',18.00,15.5593,12.7586,15.0552,'2028-03-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP404'),'GRAVADO',18.00,16.4831,13.5161,15.9490,'2028-03-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP405'),'GRAVADO',18.00,18.6017,15.2534,17.9990,'2030-02-28','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP406'),'GRAVADO',18.00,6.6525,5.4551,6.4370,'2027-01-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP407'),'GRAVADO',18.00,9.0763,7.4425,8.7822,'2027-01-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP408'),'GRAVADO',18.00,71.1949,58.3798,68.8882,'2027-12-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP409'),'GRAVADO',18.00,13.4407,11.0214,13.0052,'2027-10-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP410'),'GRAVADO',18.00,71.1864,58.3729,68.8800,'2027-04-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP411'),'GRAVADO',18.00,2.9661,2.4322,2.8700,'2028-03-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP412'),'GRAVADO',18.00,25.4237,20.8475,24.6000,'2027-10-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP413'),'GRAVADO',18.00,6.9068,5.6636,6.6830,'2028-04-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP414'),'GRAVADO',18.00,103.3898,84.7797,100.0400,'2027-12-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP415'),'GRAVADO',18.00,42.3729,34.7458,41.0000,'2027-12-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP416'),'INAFECTO',0.00,null,null,null,null,'2026-08-02','2026-08-13'),
((select id from catalogo.productos where codigo='DHP416'),'GRAVADO',18.00,null,null,null,null,'2026-08-14',null),
((select id from catalogo.productos where codigo='DHP418'),'GRAVADO',18.00,16.4831,13.5161,15.9490,'2027-08-31','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP420'),'GRAVADO',18.00,72.0339,59.0678,69.7000,'2028-04-30','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP421'),'GRAVADO',18.00,47.1186,38.6373,45.5920,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP422'),'GRAVADO',18.00,33.0508,28.0932,33.1500,'2028-07-01','2026-08-02',null),
((select id from catalogo.productos where codigo='DHP423'),'INAFECTO',0.00,null,null,null,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP424'),'GRAVADO',18.00,50.8475,41.6949,49.2000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='DHP425'),'INAFECTO',0.00,null,null,16.3200,'2028-07-01','2026-08-02','2026-08-13'),
((select id from catalogo.productos where codigo='DHP425'),'GRAVADO',18.00,null,null,16.3200,'2028-07-01','2026-08-14',null),
((select id from catalogo.productos where codigo='PLGS01'),'GRAVADO',18.00,70.3390,56.2712,66.4000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS02'),'GRAVADO',18.00,72.0339,57.6271,68.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS03'),'GRAVADO',18.00,47.4576,37.9661,44.8000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS04'),'GRAVADO',18.00,31.3559,25.0847,29.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS05'),'GRAVADO',18.00,70.3390,56.2712,66.4000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS06'),'GRAVADO',18.00,62.7119,50.1695,59.2000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS07'),'GRAVADO',18.00,62.7119,50.1695,59.2000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS08'),'GRAVADO',18.00,62.7119,50.1695,59.2000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS09'),'GRAVADO',18.00,72.0339,57.6271,68.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS10'),'GRAVADO',18.00,35.5932,28.4746,33.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS11'),'GRAVADO',18.00,40.6780,32.5424,38.4000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS12'),'GRAVADO',18.00,33.0508,26.4407,31.2000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS13'),'GRAVADO',18.00,33.0508,26.4407,31.2000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS14'),'INAFECTO',0.00,null,null,null,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS15'),'GRAVADO',18.00,20.7627,16.6102,19.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS16'),'GRAVADO',18.00,52.5424,42.0339,49.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS17'),'GRAVADO',18.00,37.2881,29.8305,35.2000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS18'),'GRAVADO',18.00,39.8305,31.8644,37.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS19'),'GRAVADO',18.00,52.5424,42.0339,49.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS20'),'GRAVADO',18.00,50.8475,40.6780,48.0000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS21'),'GRAVADO',18.00,56.7797,45.4237,53.6000,null,'2026-08-02',null),
((select id from catalogo.productos where codigo='PLGS22'),'GRAVADO',18.00,60.1695,48.1356,56.8000,null,'2026-08-02',null);
