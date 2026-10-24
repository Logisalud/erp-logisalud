-- Transporte inicial (SB-A, D-159): los dos conductores reales de hoy, el vehículo de Hans y el «conductor en documentos» temporal (Michele).
-- Datos de configuración, escritos a mano (no se generan). Se aplica a mano DESPUÉS de la migración 0031. Re-ejecutable: no pisa lo que ya exista.
--   · Hans: licencia de conducir cargada; su documento de identidad está PENDIENTE (se completa en Rutas → Personal y vehículos, o con
--     wms.guardar_documentos_personal). Mientras tanto los documentos llevan a Michele (parámetro temporal), así que no estorba.
--   · Michele: datos tomados de la guía GALAPHARMA S.A.C. TTT1-2887 (docs/wms/referencias): carné de extranjería y licencia.
--   · Vehículo de Hans: BWO902 (DFSK K05S).
-- Cuando se quite el interruptor (migración que borra la fila `conductor_en_documentos`), los documentos llevarán al conductor real de cada ruta.

insert into wms.personal_transporte (nombre, funcion, documento_tipo, dni, licencia, activo) values
  ('Hans', 'CONDUCTOR', 'DNI', null, 'Q75084250', true),
  ('Michele Yermain Mauriello Diaz', 'CONDUCTOR', 'CE', '004780086', 'Q004780086', true)
on conflict (lower(btrim(nombre)), funcion) do nothing;

insert into wms.vehiculos (placa, descripcion, tipo, calificado, apto_cadena_frio, activo)
select 'BWO902', 'DFSK K05S', 'PROPIO', false, false, true
where not exists (select 1 from wms.vehiculos where upper(replace(placa, '-', '')) = 'BWO902');

-- «Conductor en documentos»: por ahora Michele. Solo si el interruptor existe (0031) y todavía no se eligió a nadie.
update wms.parametros
   set valor = (select id::text from wms.personal_transporte where lower(btrim(nombre)) = lower('Michele Yermain Mauriello Diaz') and funcion = 'CONDUCTOR'),
       nota = 'Lo dejó así la carga inicial (SB-A): por ahora los documentos llevan a Michele. TEMPORAL: se quita cuando Sebas avise.'
 where clave = 'conductor_en_documentos' and valor = ''
   and exists (select 1 from wms.personal_transporte where lower(btrim(nombre)) = lower('Michele Yermain Mauriello Diaz') and funcion = 'CONDUCTOR');
