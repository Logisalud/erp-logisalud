-- 1027 — Los 26 códigos que el stock real tenía y el catálogo no.
--
-- El archivo de stock del 09/09 trajo 26 códigos sin producto: 35 filas y
-- 10.205 unidades de mercadería real que no se podían cargar. La lista
-- maestra del usuario confirmó el patrón de bonificación por proveedor, y
-- con eso los 26 quedan identificados:
--
--   Diphasac       DHP###   ↔ BODHP###
--   Biosana        BSA###   ↔ BOBSA###
--   Dare Nutrition DRN###   ↔ BOD###
--   Prades         PLGS##   ↔ BOP0000##   ← este no lo teníamos identificado
--
-- Dos productos REGULARES tampoco existían (sospecha confirmada):
-- DHP109 (JAMOL 5 x10) y DHP110 (GLICOFAST 1000 x10). Se crean primero,
-- porque su bonificación hereda de ellos.
--
-- Criterio de las bonificaciones, el mismo de las 18 de la migración 1016:
-- producto real con su propio código, hereda del par regular la
-- descripción, el proveedor, la presentación y el PERFIL TRIBUTARIO, entra
-- ACTIVO (hay stock físico confirmado) y SIN precio de lista, porque no se
-- vende: se entrega.

-- ---------------------------------------------------------------------
-- 1. Los dos regulares que faltaban
-- ---------------------------------------------------------------------
-- Se derivan de su hermano de la misma familia (el de 30 tabletas), que es
-- lo único que cambia: la presentación.
insert into pedidos.products (
  codigo_interno, descripcion, presentacion, supplier_id, unidad_medida, estado, nota_estado)
select
  n.codigo,
  n.descripcion,
  n.presentacion,
  h.supplier_id,
  h.unidad_medida,
  'activo',
  'Creado el 2026-09-10: estaba en la lista maestra y en el stock real, pero no en el catálogo. '
    || 'Sin precio de lista todavía.'
from (values
  ('DHP109', 'JAMOL 5 5 MG CJA X 10 TAB. REC.', '5MG CJA X 10 TAB. REC.', 'DHP108'),
  ('DHP110', 'GLICOFAST 1000 1000 MG CJA X 10 TAB. LIB. PROL.', '1000MG CJA X 10 TAB. LIB. PROL.', 'DHP107')
) as n(codigo, descripcion, presentacion, hermano)
join pedidos.products h on h.codigo_interno = n.hermano
where not exists (select 1 from pedidos.products p where p.codigo_interno = n.codigo);

-- Perfil tributario: el mismo del hermano (INAFECTO en los dos casos, por
-- ser de la familia metabólica).
insert into pedidos.product_tax_profiles (product_id, afectacion_tributaria, tasa_aplicable, vigente_desde)
select nuevo.id, t.afectacion_tributaria, t.tasa_aplicable, current_date
from (values ('DHP109', 'DHP108'), ('DHP110', 'DHP107')) as n(codigo, hermano)
join pedidos.products nuevo on nuevo.codigo_interno = n.codigo
join pedidos.products h on h.codigo_interno = n.hermano
join pedidos.product_tax_profiles t on t.product_id = h.id and t.vigente_hasta is null
where not exists (
  select 1 from pedidos.product_tax_profiles tp
  where tp.product_id = nuevo.id and tp.vigente_hasta is null);

-- ---------------------------------------------------------------------
-- 2. Los 4 productos normales
-- ---------------------------------------------------------------------
-- Sin precio de lista: no lo tenemos. Quedan ACTIVOS pero NO se pueden
-- vender hasta que se cargue —submit_order aborta sin precio vigente—, que
-- es el mismo comportamiento de cualquier producto sin precio.
insert into pedidos.products (
  codigo_interno, descripcion, supplier_id, unidad_medida, estado, nota_estado)
select
  n.codigo,
  n.descripcion,
  r.supplier_id,
  case when r.unidad_medida ~ '^[0-9.]+$' then 'UND' else r.unidad_medida end,
  'activo',
  'Creado el 2026-09-10 desde el stock real del almacén. PENDIENTE: no tiene precio de lista, '
    || 'así que no se puede vender hasta cargarlo.'
from (values
  ('BSA119',  'AGUA FEM 5GR CJA X 30 SACHETS',      'BSA115'),
  ('DHP028',  'DRAVOM 50 MG/5ML CJA X 10 AMP',      'DHP024'),
  ('DRN048',  'FLORADAR POLVO POTE X 1.1KG',        'DRN017'),
  ('PLGS24',  'ASHWCALMEX 500 MG FCO X 120 CAP.',   'PLGS16')
) as n(codigo, descripcion, referencia)
join pedidos.products r on r.codigo_interno = n.referencia
where not exists (select 1 from pedidos.products p where p.codigo_interno = n.codigo);

-- Perfil tributario: el del producto de referencia de su mismo proveedor y
-- familia. No se inventa una tasa: se copia de uno real.
insert into pedidos.product_tax_profiles (product_id, afectacion_tributaria, tasa_aplicable, vigente_desde)
select nuevo.id, t.afectacion_tributaria, t.tasa_aplicable, current_date
from (values ('BSA119','BSA115'), ('DHP028','DHP024'), ('DRN048','DRN017'), ('PLGS24','PLGS16'))
  as n(codigo, referencia)
join pedidos.products nuevo on nuevo.codigo_interno = n.codigo
join pedidos.products r on r.codigo_interno = n.referencia
join pedidos.product_tax_profiles t on t.product_id = r.id and t.vigente_hasta is null
where not exists (
  select 1 from pedidos.product_tax_profiles tp
  where tp.product_id = nuevo.id and tp.vigente_hasta is null);

-- ---------------------------------------------------------------------
-- 3. Las 22 bonificaciones
-- ---------------------------------------------------------------------
-- El par regular ya existe en los 22 casos (los dos que faltaban se
-- crearon arriba). La unidad de medida de los PLGS del catálogo trae un
-- NÚMERO en vez de una unidad —dato mal cargado en su importación, ver
-- docs/data-model.md—, así que no se propaga: en ese caso va 'UND'.
create temporary table pares_bonificacion (codigo text, regular text) on commit drop;
insert into pares_bonificacion (codigo, regular) values
  ('BODHP023', 'DHP023'), ('BODHP025', 'DHP025'), ('BODHP101', 'DHP101'),
  ('BODHP103', 'DHP103'), ('BODHP104', 'DHP104'), ('BODHP107', 'DHP107'),
  ('BODHP109', 'DHP109'), ('BODHP110', 'DHP110'), ('BODHP200', 'DHP200'),
  ('BODHP308', 'DHP308'),
  ('BOP000001', 'PLGS01'), ('BOP000002', 'PLGS02'), ('BOP000003', 'PLGS03'),
  ('BOP000005', 'PLGS05'), ('BOP000006', 'PLGS06'), ('BOP000012', 'PLGS12'),
  ('BOP000013', 'PLGS13'), ('BOP000018', 'PLGS18'), ('BOP000019', 'PLGS19'),
  ('BOP000021', 'PLGS21'), ('BOP000022', 'PLGS22'), ('BOP000023', 'PLGS23');

insert into pedidos.products (
  codigo_interno, descripcion, presentacion, supplier_id, unidad_medida, estado, nota_estado)
select
  b.codigo,
  r.descripcion,
  r.presentacion,
  r.supplier_id,
  case when r.unidad_medida ~ '^[0-9.]+$' then 'UND' else r.unidad_medida end,
  'activo',
  'Bonificación de ' || r.codigo_interno || '. Creada el 2026-09-10 desde el stock real del '
    || 'almacén; sin precio de lista porque no se vende, se entrega como bonificación.'
from pares_bonificacion b
join pedidos.products r on r.codigo_interno = b.regular
where not exists (select 1 from pedidos.products p where p.codigo_interno = b.codigo);

-- Hereda el perfil tributario del par regular, sin excepción: una
-- bonificación de un producto INAFECTO no puede salir GRAVADA.
insert into pedidos.product_tax_profiles (product_id, afectacion_tributaria, tasa_aplicable, vigente_desde)
select bono.id, t.afectacion_tributaria, t.tasa_aplicable, current_date
from pares_bonificacion b
join pedidos.products bono on bono.codigo_interno = b.codigo
join pedidos.products r on r.codigo_interno = b.regular
join pedidos.product_tax_profiles t on t.product_id = r.id and t.vigente_hasta is null
where not exists (
  select 1 from pedidos.product_tax_profiles tp
  where tp.product_id = bono.id and tp.vigente_hasta is null);

-- El vínculo declarativo en el catálogo: el regular apunta al código de su
-- bonificación. Es lo que lee la pantalla de producto.
update pedidos.products r
set codigo_bonificacion = b.codigo, updated_at = now()
from pares_bonificacion b
where r.codigo_interno = b.regular
  and r.codigo_bonificacion is distinct from b.codigo
  and exists (select 1 from pedidos.products p where p.codigo_interno = b.codigo);
