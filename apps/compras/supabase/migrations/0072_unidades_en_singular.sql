-- Singular vs plural en las unidades de medida: el último par pendiente que
-- la 0071 dejó anotado a propósito.
--
-- Criterio que dio Sebas (2026-09-22): "el que se use más, ese es el
-- correcto". Los números al momento de escribir esto:
--
--   TABLETA           45      TABLETAS     4
--   CAPSULA           15      CAPSULAS    16
--   CAPSULA BLANDA    25
--
-- Tableta no tiene discusión: 45 contra 4.
--
-- Cápsula sí, porque el par está empatado (16 contra 15, una fila). El
-- desempate no arbitrario es `CAPSULA BLANDA`, que son 25 filas y está en
-- SINGULAR: contando toda la familia de cápsulas, el singular gana 40 a 16.
-- Elegir el plural habría obligado a mover esas 25 filas a "CAPSULAS
-- BLANDAS" para ganar 16 — mover más de lo que se arregla. Además Sebas
-- dictó "CÁPSULA" en singular para OVAMET el mismo día (ver 0071).
--
-- Con esto el catálogo queda en 18 unidades distintas; empezó en 24 antes de
-- la 0071.
--
-- Re-ejecutable.

update catalogo.productos set unidad_medida = 'TABLETA', updated_at = now()
  where unidad_medida = 'TABLETAS';

update catalogo.productos set unidad_medida = 'CAPSULA', updated_at = now()
  where unidad_medida = 'CAPSULAS';
