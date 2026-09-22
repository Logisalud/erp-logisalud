-- Unidades de medida: las 18 filas que quedaron en 'UND' al cargar el Excel
-- de NubeFact (ver 0070), más la unificación del vocabulario.
--
-- Las 18 las dictó Sebas (2026-09-22) mirando la lista. La 0070 no podía
-- deducirlas: el Excel trae 'BX' por defecto en todas y estas filas no tenían
-- un producto base del cual heredar.
--
-- Re-ejecutable: todo update es idempotente.

-- ===================================================================
-- 1. Las 18 que estaban en 'UND'
-- ===================================================================
-- "TODAS SON TABLETA DE LAS 18, EXCEPTO..." — las excepciones van abajo.
update catalogo.productos set unidad_medida = 'TABLETA', updated_at = now()
  where unidad_medida = 'UND' and codigo in (
    'DHP004',   -- DIVALPRID 500
    'DHP006',   -- DIPHAPASMOL 40
    'DHP011',   -- DUOCLAMOX
    'DHP012',   -- BROLAXIL 5
    'DHP013',   -- DYOMIN H
    'DHP015',   -- DIPHARELAX PLUS
    'DHP100',   -- DAPHA 10
    'DHP210',   -- DYNACAL 1250
    'DHP417',   -- CEFUROXIMA 500
    'BODHP109', -- JAMOL 5 x 10
    'BODHP110'  -- GLICOFAST 1000 x 10
  );

-- METOCLOPRAMIDA es inyectable. También su bonificado, que heredó el 'UND'
-- de ella en la 0070 porque en ese momento la base recién nacía.
update catalogo.productos set unidad_medida = 'AMPOLLA', updated_at = now()
  where unidad_medida = 'UND' and codigo in ('DHP419', 'BODHP419');

-- Los hisopos no son una tableta: son cuidado personal. Se les pone la misma
-- unidad que ya tienen sus seis hermanos (DHP301..DHP306), que es 'HISOPOS'
-- — la columna es `not null`, así que "no tiene unidad" no es una opción
-- posible; dejarlos en 'UND' los separaría de su propia familia.
update catalogo.productos set unidad_medida = 'HISOPOS', updated_at = now()
  where unidad_medida = 'UND' and codigo in ('DHP300', 'BODHP300');

-- VIGOR NAT: Sebas dijo "sobre"; se escribe 'SOBRES' porque es la forma que
-- ya usan las otras 26 filas del catálogo y el punto de esta migración es
-- justamente no multiplicar variantes.
update catalogo.productos set unidad_medida = 'SOBRES', updated_at = now()
  where unidad_medida = 'UND' and codigo = 'BSA118';

update catalogo.productos set unidad_medida = 'SACHETS', updated_at = now()
  where unidad_medida = 'UND' and codigo = 'BSA119';   -- AGUA FEM

update catalogo.productos set unidad_medida = 'POTE', updated_at = now()
  where unidad_medida = 'UND' and codigo = 'DRN048';   -- FLORADAR

-- OVAMET y ASHWCALMEX: sin tilde, por la regla de abajo.
update catalogo.productos set unidad_medida = 'CAPSULA', updated_at = now()
  where unidad_medida = 'UND' and codigo in ('PLGS23', 'PLGS24', 'BOP000023');

-- ===================================================================
-- 2. Vocabulario unificado
-- ===================================================================
-- El catálogo venía con el mismo concepto escrito de varias formas, de antes
-- de este Excel. Sebas eligió cuál queda en cada caso (2026-09-22). No es
-- cosmética: `unidad_medida` es texto libre, así que dos grafías del mismo
-- concepto se cuentan y se filtran como unidades distintas.

-- (a) Cápsulas sin tilde, "a todas" — incluye CÁPSULA BLANDA.
update catalogo.productos set unidad_medida = 'CAPSULA', updated_at = now()
  where unidad_medida = 'CÁPSULA';
update catalogo.productos set unidad_medida = 'CAPSULA BLANDA', updated_at = now()
  where unidad_medida = 'CÁPSULA BLANDA';

-- (b) Frasco de jarabe: queda 'FRASCO JARABE'.
update catalogo.productos set unidad_medida = 'FRASCO JARABE', updated_at = now()
  where unidad_medida in ('FCO JARABE', 'FRASCO JBE');

-- (c) Tableta recubierta: queda 'TABLETAS RECUB.'. OJO: 'TABLETA' a secas NO
-- se toca — Sebas fue explícito en que una tableta recubierta es otra cosa
-- que una tableta, así que acá se unifican solo las dos grafías de
-- "recubierta" entre sí.
update catalogo.productos set unidad_medida = 'TABLETAS RECUB.', updated_at = now()
  where unidad_medida = 'TABLETA RECUBIERTA';

-- ── Lo que queda sin unificar, a propósito ──────────────────────────────
-- 'CAPSULAS' (16 filas) y 'TABLETAS' (4) son plurales de 'CAPSULA' y
-- 'TABLETA'. No se tocaron porque Sebas resolvió el par con tilde y el de
-- frasco, no el de singular/plural, y elegirlo por mi cuenta sería inventar
-- un criterio. Pendiente de confirmar con él.
