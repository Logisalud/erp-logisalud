-- Las 18 bonificaciones que faltaban como producto.
--
-- 40 productos declaran un `codigo_bonificacion` (`BODHP008`, `BODHP217`…)
-- que NO existía como fila de `products`: el buscador no las encontraba
-- porque literalmente no había nada que encontrar. Sin el producto, la
-- excepción de precio cero de `1015` no servía de nada.
--
-- Se crean 18 de esas 40, elegidas con datos y confirmadas por el
-- administrador el 2026-09-02 (ver el reporte de priorización):
-- su par regular está ACTIVO y tiene precio vigente en los 6 canales, así
-- que se puede vender hoy y su bonificación se puede necesitar mañana.
--
-- Las otras 22 quedan fuera a propósito: 16 tienen el par inactivo, 4 no
-- tienen precio en ningún canal, `BODHP027` espera su precio de Clínicas y
-- `BODHP106` ya existía.
--
-- **Sin precio en price_list_items, a propósito.** Una bonificación se
-- entrega gratis: entra al pedido a S/ 0.00 explícito por la excepción de
-- `1015`. Darle precio la convertiría en un producto vendible más.

-- ---------------------------------------------------------------------
-- 1. Los productos
-- ---------------------------------------------------------------------

-- Todo se copia del par regular —descripción exacta incluida, que es lo
-- que hace que la UI pueda marcarlas con "(Bonificación)"— salvo:
--   * `codigo_bonificacion`, que queda null: una bonificación no tiene
--     bonificación propia.
--   * `nota_estado`, que deja de dónde salió cada fila.
insert into pedidos.products (
  codigo_interno, codigo_proveedor, descripcion, presentacion, supplier_id,
  marca, unidad_medida, estado, controla_lote, controla_vencimiento,
  principio_activo, codigo_bonificacion, nota_estado
)
select
  p.codigo_bonificacion,
  p.codigo_proveedor,
  p.descripcion,
  p.presentacion,
  p.supplier_id,
  p.marca,
  p.unidad_medida,
  'activo',
  p.controla_lote,
  p.controla_vencimiento,
  p.principio_activo,
  null,
  'Bonificación de ' || p.codigo_interno || '. Creada el 2026-09-02 por decisión del '
    || 'administrador; sin precio de lista, entra al pedido a S/ 0.00.'
from pedidos.products p
where p.codigo_bonificacion in (
  'BODHP002','BODHP003','BODHP007','BODHP008','BODHP016','BODHP019',
  'BODHP022','BODHP206','BODHP207','BODHP208','BODHP217','BODHP301',
  'BODHP303','BODHP304','BODHP402','BODHP405','BODHP407','BODHP408'
)
  -- Re-ejecutable: si ya se creó, no se duplica.
  and not exists (
    select 1 from pedidos.products bo where bo.codigo_interno = p.codigo_bonificacion
  );

-- ---------------------------------------------------------------------
-- 2. El perfil tributario
-- ---------------------------------------------------------------------

-- Hereda el del par regular. **Esto está sujeto a revisión con
-- Contabilidad** y no es una decisión cerrada: en el catálogo de NubeFact,
-- de 207 códigos BO sólo 2 son INAFECTO, sin criterio visible. Si
-- Contabilidad determina que una bonificación es una transferencia
-- gratuita y va INAFECTA por regla general, estas 18 filas se corrigen en
-- bloque versionando el perfil (nunca editándolo en su lugar).
-- Ver "Bonificaciones: tratamiento tributario" en docs/business-rules.md.
insert into pedidos.product_tax_profiles (product_id, afectacion_tributaria, tasa_aplicable)
select bo.id, tp.afectacion_tributaria, tp.tasa_aplicable
from pedidos.products bo
join pedidos.products regular on regular.codigo_bonificacion = bo.codigo_interno
join pedidos.product_tax_profiles tp
  on tp.product_id = regular.id and tp.vigente_hasta is null
where bo.codigo_interno in (
  'BODHP002','BODHP003','BODHP007','BODHP008','BODHP016','BODHP019',
  'BODHP022','BODHP206','BODHP207','BODHP208','BODHP217','BODHP301',
  'BODHP303','BODHP304','BODHP402','BODHP405','BODHP407','BODHP408'
)
  and not exists (
    select 1 from pedidos.product_tax_profiles existente
    where existente.product_id = bo.id and existente.vigente_hasta is null
  );
