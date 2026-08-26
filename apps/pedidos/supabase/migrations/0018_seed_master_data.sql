-- Datos iniciales de Fase 2.

insert into pedidos.sales_channels (nombre) values
  ('Mayorista'),
  ('Horizontal'),
  ('Minicadenas'),
  ('Tops'),
  ('Clínicas'),
  ('Subdistribuidores')
on conflict (nombre) do nothing;

insert into pedidos.suppliers (nombre) values
  ('Diphasac'),
  ('Biosana'),
  ('Prades'),
  ('Dare Nutrition')
on conflict (nombre) do nothing;

-- Producto de ejemplo para tener un caso INAFECTO real desde el día
-- uno (supuesto: proveedor y código interno no estaban especificados
-- en el PRD, se asume Diphasac y un código de ejemplo — ver resumen de
-- supuestos).
insert into pedidos.products (codigo_interno, descripcion, supplier_id, unidad_medida)
select 'DAPHA10-EJ', 'Dapha 10', s.id, 'UND'
from pedidos.suppliers s
where s.nombre = 'Diphasac'
on conflict (codigo_interno) do nothing;

insert into pedidos.product_tax_profiles (product_id, afectacion_tributaria, tasa_aplicable, vigente_desde)
select p.id, 'INAFECTO', 0, '2024-01-01'
from pedidos.products p
where p.codigo_interno = 'DAPHA10-EJ'
on conflict do nothing;
