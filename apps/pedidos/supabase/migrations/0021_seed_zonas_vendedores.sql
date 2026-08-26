-- Catálogo real inicial de zonas y vendedores.
-- Reproducible: usa ON CONFLICT, se puede correr de nuevo sin duplicar.
-- Excluidos a propósito (no forman parte de este seed):
--   ELIZABETH QUIROGA (CRP1010), ROXANA FERNANDEZ (CRP1002),
--   CELIO VARILLAS (CRP1003), CESAR AGUILAR (CRP1005),
--   y la KARINA BENDEZÚ de código CRP1006 (inactiva; solo se carga la
--   de código CRP1008).

begin;

insert into pedidos.zones (nombre, codigo_zona)
values
  ('INSTITUCIONES', 'LIMV03'),
  ('ZONA 01', 'LIMH01'),
  ('ZONA 02', 'LIMH02'),
  ('ZONA 04', 'LIMH04'),
  ('ZONA 05', 'LIMH05'),
  ('ZONA 06', 'LIMH06'),
  ('ZONA 07', 'LIMH07'),
  ('ZONA 08', 'LIMH08'),
  ('ZONA 09', 'LIMV01'),
  ('ZONA 10', 'LIMV02'),
  ('ZONA 11', 'CHIM01'),
  ('ZONA 12', 'TRUM02'),
  ('ZONA 13', 'AREM01'),
  ('ZONA 14', 'CUZM02'),
  ('ZONA 15', 'HYOM01'),
  ('ZONA 16', 'HYOM02'),
  ('ZONA 17', 'TRUM03'),
  ('DISTRIBUIDORAS', 'DIST01')
on conflict (nombre) do update
  set codigo_zona = excluded.codigo_zona;

insert into pedidos.sellers (codigo_representante, nombre_completo, zone_id, estado)
select v.codigo_representante, v.nombre_completo, z.id, 'activo'
from (values
  ('CKA2003', 'TERESA SAMANEZ', 'LIMV03'),
  ('CRP1011', 'SUSANA RAMOS', 'LIMH01'),
  ('CRP1001', 'LUIS VARGAS', 'LIMH02'),
  ('CRP1012', 'LUPE CASTRO', 'LIMH04'),
  ('CRP1009', 'CRISTIAN BARREDA', 'LIMH05'),
  ('CRP1007', 'CINTHYA VILCHEZ', 'LIMH06'),
  ('CRP1008', 'KARINA BENDEZÚ', 'LIMH07'),
  ('CRP1004', 'KAREM PARIONA', 'LIMH08'),
  ('CKA2001', 'TITO MINGUILLO', 'LIMV01'),
  ('CKA2002', 'MARYSABEL PERALTA', 'LIMV02'),
  ('DTRU02', 'MILAGROS SOTO', 'CHIM01'),
  ('DTRU01', 'OMAR RUBIO', 'TRUM02'),
  ('DAQP01', 'MALENA GAONA', 'AREM01'),
  ('DCUZ01', 'JENIFER MADRID', 'CUZM02'),
  ('DHYO02', 'JESSICA MENDOZA', 'HYOM01'),
  ('DHYO01', 'FABIOLA SAMANIEGO', 'HYOM02'),
  ('DTRU03', 'OMAR QUEVEDO', 'TRUM03'),
  ('CODI01', 'OFICINA LOGISSA', 'DIST01')
) as v(codigo_representante, nombre_completo, codigo_zona)
join pedidos.zones z on z.codigo_zona = v.codigo_zona
on conflict (codigo_representante) do update
  set nombre_completo = excluded.nombre_completo,
      zone_id = excluded.zone_id;

commit;
