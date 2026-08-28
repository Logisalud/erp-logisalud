-- Carga las categorías de gasto y tipos de impuesto por defecto que
-- bloqueaban /gastos/nueva e /impuestos/nueva ("todavía no hay ninguna
-- categoría cargada" con cero forma de cargar una desde la pantalla).
-- Re-ejecutable: cada insert se guarda contra el nombre exacto, así que
-- un reintento tras un fallo no duplica filas.

insert into gastos.categorias_gasto (nombre)
select v.nombre from (
  values
    ('Combustible'),
    ('Útiles de oficina'),
    ('Pasajes'),
    ('Marketing'),
    ('Viáticos'),
    ('Mantenimiento de flota')
) as v(nombre)
where not exists (
  select 1 from gastos.categorias_gasto c where c.nombre = v.nombre
);

insert into impuestos.tipos_impuesto (nombre)
select v.nombre from (
  values
    ('Essalud'),
    ('ONP'),
    ('AFP'),
    ('Renta 4ta categoría'),
    ('Renta 5ta categoría'),
    ('Seguro Vida Ley')
) as v(nombre)
where not exists (
  select 1 from impuestos.tipos_impuesto t where t.nombre = v.nombre
);
