-- Puntos 3 y 4 de la ronda de hallazgos de Mariela (Contabilidad).
--
-- 3. Faltaban "Trámites y tasas notariales" y "Otros gastos autorizados" en
--    el desplegable de categorías de Reembolso/Anticipo
--    (gastos.categorias_gasto) — ya existían con ese mismo nombre en
--    cuentas_x_pagar.categorias_pago_directo (0024), pero eran tablas
--    distintas para flujos distintos; agregarlas ahí no las agrega acá.
--
-- 4. "Caja chica, reembolsos de gastos" y las dos variantes de "Gastos de
--    representación" no deberían estar en el desplegable de "Pago
--    directo" — esos casos ya tienen su propio camino (Caja chica como
--    módulo aparte; gastos de representación vía Reembolso/Anticipo, no
--    vía un pago directo a proveedor). Se desactivan (`activo = false`),
--    no se borran: la tabla ya tiene esa columna pensada para esto
--    (`services/obligaciones.ts::listarCategoriasPagoDirecto` ya filtra
--    por `activo = true`), y una obligación ya registrada con alguna de
--    estas categorías no debe perder su referencia.

insert into gastos.categorias_gasto (nombre)
select v.nombre from (
  values
    ('Trámites y tasas notariales'),
    ('Otros gastos autorizados')
) as v(nombre)
where not exists (
  select 1 from gastos.categorias_gasto c where c.nombre = v.nombre
);

update cuentas_x_pagar.categorias_pago_directo
set activo = false
where nombre in (
  'Caja chica, reembolsos de gastos',
  'Gastos de representación',
  'Gastos de representación, atención a clientes'
);
