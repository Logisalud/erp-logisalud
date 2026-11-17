-- JAM Pharma se libera al sur chico de Lima.
--
-- El veto del 03/11 (`1053`) dejó entrar sólo a Ate, Santa Anita, La Molina,
-- Lurigancho-Chosica, Chaclacayo, La Victoria, San Luis, San Borja, Lince,
-- Lurín y Pachacámac. Del sur eso dejaba únicamente Lurín y Pachacámac: las
-- playas quedaron bloqueadas, y sí se vende ahí.
--
-- Esta migración saca del veto los cinco distritos del sur chico de Lima
-- provincia. Cañete (Asia, Mala, San Vicente, Cerro Azul…) nunca estuvo
-- vetada — el veto de JAM Pharma es sólo sobre Lima provincia, en el resto
-- del país no hay un solo distrito bloqueado.
--
-- Cieneguilla NO entra: es valle, no sur chico, y nadie la pidió.
--
-- De paso se corrige el `motivo` de los que quedan vetados. Decía una regla
-- que ya era falsa dos veces: no mencionaba Lima Norte ni Callao (abiertos
-- por la `1055` el 11/11) ni el sur chico que abre ésta. Un motivo que miente
-- es peor que no tenerlo, porque el que lo lee decide con él.
--
-- Antes: 280 distritos vetados, 22 de ellos en Lima provincia.
-- Después: 275 distritos vetados, 17 en Lima provincia.

delete from pedidos.territorio_vetado tv
using pedidos.ubigeos u
where tv.codigo_inei = u.codigo_inei
  and tv.supplier_id = (select id from pedidos.suppliers where nombre = 'JAM Pharma')
  and u.departamento = 'LIMA' and u.provincia = 'LIMA'
  and u.distrito in ('PUCUSANA','PUNTA HERMOSA','PUNTA NEGRA','SAN BARTOLO','SANTA MARIA DEL MAR');

update pedidos.territorio_vetado tv
set motivo = 'Lima Metropolitana: JAM Pharma no se distribuye en los distritos del centro y sur urbano de Lima. Sí se distribuye en Lima Este, Lima Norte, Callao, el valle (Lurín, Pachacámac) y el sur chico (Pucusana, Punta Hermosa, Punta Negra, San Bartolo, Santa María del Mar).'
where tv.supplier_id = (select id from pedidos.suppliers where nombre = 'JAM Pharma')
  and exists (
    select 1 from pedidos.ubigeos u
    where u.codigo_inei = tv.codigo_inei
      and u.departamento = 'LIMA' and u.provincia = 'LIMA'
  );

-- Guarda: si el conteo no da, algo más cambió el veto y hay que mirarlo.
do $$
declare n_total int; n_lima int;
begin
  select count(*) into n_total from pedidos.territorio_vetado
   where supplier_id = (select id from pedidos.suppliers where nombre = 'JAM Pharma');
  select count(*) into n_lima from pedidos.territorio_vetado tv
    join pedidos.ubigeos u on u.codigo_inei = tv.codigo_inei
   where tv.supplier_id = (select id from pedidos.suppliers where nombre = 'JAM Pharma')
     and u.departamento = 'LIMA' and u.provincia = 'LIMA';
  if n_total <> 275 or n_lima <> 17 then
    raise exception 'Veto de JAM Pharma inesperado: % distritos (% en Lima); se esperaba 275 (17 en Lima)', n_total, n_lima;
  end if;
end $$;
