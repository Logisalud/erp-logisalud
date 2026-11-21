-- 0092 — Los cinco precios que faltaban de Intipharma.
--
-- La 0091 cargó los 14 productos de Intipharma, pero cinco —ITP010 a
-- ITP014— venían en 0 en el Excel y quedaron con `precio_compra` null a
-- propósito: un 0 no era "gratis" sino un precio que el proveedor todavía
-- no había entregado, y cargarlo en cero habría hecho que la OC trajera
-- esas líneas valorizadas en cero sin que nadie lo notara.
--
-- El 2026-11-21 el usuario mandó el archivo completo. Los nueve precios ya
-- cargados vienen idénticos (se verificó fila por fila), así que esto toca
-- sólo las cinco filas que estaban en null; el `where precio_compra is
-- null` lo garantiza además de dejarla re-ejecutable.
--
-- Mismo criterio que la 0091: la columna amarilla es el PVF a distribuidora
-- CON IGV y `precio_compra` es neto, así que se carga PVF / 1.18 con 4
-- decimales. El resultado coincide dígito a dígito con la columna "VVD (SIN
-- IGV)" del mismo Excel en las cinco filas.
--
--   ITP010  CLAVUBIOX 1000          17.500  ->  14.8305
--   ITP011  DOLALIVIO PEDIÁTRICO     3.500  ->   2.9661
--   ITP012  FEBRIZOL GOTAS           5.488  ->   4.6508
--   ITP013  FEBRIZOL JBE             4.900  ->   4.1525
--   ITP014  FEBRIZOL TABS           16.800  ->  14.2373
--
-- El PVF de FEBRIZOL GOTAS trae tres decimales en el archivo (5,488); al
-- céntimo es 5,49. Se respeta el valor del archivo y no se redondea antes
-- de dividir: el neto sale de 5,488 / 1.18, que es lo que dice su propia
-- columna VVD.
--
-- Los bonificados (BOI010–BOI014) siguen en 0.00: un bonificado cuesta cero
-- por definición y eso no cambió.

update catalogo.productos set precio_compra = 14.8305 where codigo = 'ITP010' and precio_compra is null;
update catalogo.productos set precio_compra =  2.9661 where codigo = 'ITP011' and precio_compra is null;
update catalogo.productos set precio_compra =  4.6508 where codigo = 'ITP012' and precio_compra is null;
update catalogo.productos set precio_compra =  4.1525 where codigo = 'ITP013' and precio_compra is null;
update catalogo.productos set precio_compra = 14.2373 where codigo = 'ITP014' and precio_compra is null;
