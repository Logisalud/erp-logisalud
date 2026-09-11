-- PIEZA D — Beneficiario de cada tipo de impuesto.
--
-- ⚠️ ESTA MIGRACIÓN NO SE APLICÓ TODAVÍA. Falta la confirmación de Mariela
-- sobre si "Renta" e "Impuesto a la Renta" son el mismo concepto o si quiso
-- separar el pago a cuenta mensual de la regularización anual. Esos dos
-- tipos quedan deliberadamente FUERA de este script.
--
-- Modelo elegido (opción i): el catálogo guarda un beneficiario POR DEFECTO
-- y cada obligación tributaria puede sobreescribirlo. Ocho de los diez
-- tipos le pagan a SUNAT y un valor fijo los modela bien, pero dos no:
--
--  - AFP: la empresa puede tener empleados en varias administradoras a la
--    vez (Integra, Prima, Profuturo, Habitat), así que un único valor fijo
--    sería falso apenas haya gente en dos AFP distintas.
--  - Seguro Vida Ley: no es un tributo. Es una póliza obligatoria (D.L. 688)
--    con una aseguradora privada, que se licita y se cambia.
--
-- Desdoblar el catálogo por administradora se descartó: obliga a tocarlo
-- cada vez que aparece una AFP o cambia la aseguradora, y con Vida Ley ni
-- siquiera funciona (no se crea un tipo por compañía de seguros).

alter table impuestos.tipos_impuesto
  add column if not exists beneficiario text;

comment on column impuestos.tipos_impuesto.beneficiario is
  'A quién se le paga este tributo, por defecto. Sugerencia editable en cada obligación — ver obligaciones_tributarias.beneficiario.';

alter table impuestos.obligaciones_tributarias
  add column if not exists beneficiario text;

comment on column impuestos.obligaciones_tributarias.beneficiario is
  'Beneficiario real de ESTA obligación. Null = se usa el del tipo. Existe para AFP (varias administradoras) y Seguro Vida Ley (la aseguradora cambia).';

-- Los ocho tipos sin ninguna duda. Por nombre y no por id: los ids son
-- gen_random_uuid() y no se pueden hardcodear (ver la nota de apply_migration).
update impuestos.tipos_impuesto set beneficiario = 'SUNAT'
 where lower(trim(nombre)) in ('essalud', 'onp', 'renta 4ta categoría', 'renta 5ta categoría', 'igv', 'itan')
   and beneficiario is distinct from 'SUNAT';

-- Los dos que rompen el modelo: queda el default más útil, sabiendo que se
-- sobreescribe por fila.
update impuestos.tipos_impuesto set beneficiario = 'AFP (indicar cuál en cada obligación)'
 where lower(trim(nombre)) = 'afp' and beneficiario is null;

update impuestos.tipos_impuesto set beneficiario = 'Compañía de seguros (indicar cuál en cada obligación)'
 where lower(trim(nombre)) = 'seguro vida ley' and beneficiario is null;

-- 'Renta' e 'Impuesto a la Renta' quedan SIN beneficiario a propósito,
-- esperando la definición de Mariela.
