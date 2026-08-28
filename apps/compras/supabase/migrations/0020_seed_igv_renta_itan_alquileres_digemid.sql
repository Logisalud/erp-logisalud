-- Fase 1.7: faltaban IGV, Renta e ITAN en impuestos.tipos_impuesto — los que
-- ya existían (Essalud, ONP, AFP, Renta 4ta/5ta, Seguro Vida Ley) son todos
-- de planilla; estos tres son los que necesita el desplegable de tipo de
-- impuesto del cronograma de Fraccionamiento SUNAT. Y faltaban Alquileres y
-- Digemid en gastos.categorias_gasto. Re-ejecutable, mismo patrón que 0014.

insert into impuestos.tipos_impuesto (nombre)
select v.nombre from (
  values
    ('IGV'),
    ('Renta'),
    ('ITAN')
) as v(nombre)
where not exists (
  select 1 from impuestos.tipos_impuesto t where t.nombre = v.nombre
);

insert into gastos.categorias_gasto (nombre)
select v.nombre from (
  values
    ('Alquileres'),
    ('Digemid')
) as v(nombre)
where not exists (
  select 1 from gastos.categorias_gasto c where c.nombre = v.nombre
);
