-- 1069 — JAM Pharma puede vender en Villa El Salvador.
--
-- El acuerdo original (1049) dejaba a JAM Pharma fuera del centro y el sur
-- urbano de Lima, y Villa El Salvador caía ahí. Administración lo liberó el
-- 2026-11-27.
--
-- Impacto: 126 clientes de Villa El Salvador pasan a poder comprar la línea.
-- Los distritos vetados de JAM Pharma quedan en 274 (eran 275); dentro de la
-- provincia de Lima, en 16 (eran 17).
--
-- Es un borrado de una fila y no un `update` de un campo "activo": la tabla
-- es la lista de dónde NO se puede vender, así que liberar un distrito es
-- sacarlo de la lista. Volver a vetarlo es un insert — está el motivo
-- original en el resto de las filas de Lima para copiarlo.
--
-- Aplicado a mano contra la base (ver el README de migraciones).
-- Re-ejecutable.
delete from pedidos.territorio_vetado
where supplier_id = (select id from pedidos.suppliers where nombre = 'JAM Pharma')
  and codigo_inei = '150142';  -- LIMA / LIMA / VILLA EL SALVADOR
