-- PIEZA D — Beneficiario de cada tipo de impuesto.
--
-- Incluye la unificación de "Renta" e "Impuesto a la Renta": son el mismo
-- tributo (el segundo es el nombre completo del primero). Las categorías
-- que sí son conceptos distintos —4ta y 5ta— ya están sembradas aparte, y
-- lo que quedaba como "Renta"/"Impuesto a la Renta" es el de tercera
-- categoría. Autorizado por Sebas el 2026-09-11.
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

-- Unificación: queda "Impuesto a la Renta" (el nombre completo, que no se
-- confunde con las categorías 4ta/5ta) y "Renta" se DESACTIVA en vez de
-- borrarse. Nunca se borra una fila de catálogo: aunque hoy tenga 0 usos
-- (verificado en obligaciones_tributarias y en fraccionamientos_sunat), un
-- delete rompería cualquier referencia futura y perdería la traza de que
-- ese tipo existió.
update impuestos.tipos_impuesto set beneficiario = 'SUNAT'
 where lower(trim(nombre)) = 'impuesto a la renta'
   and beneficiario is distinct from 'SUNAT';

update impuestos.tipos_impuesto set activo = false
 where lower(trim(nombre)) = 'renta' and activo;
