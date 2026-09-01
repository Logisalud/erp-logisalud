-- Cierre manual de una OC con saldo pendiente que ya no se va a completar
-- (el proveedor avisó que no entrega el resto, se descontinuó el producto,
-- etc.). Es una acción MANUAL explícita de quien maneja Compras, con motivo
-- obligatorio — no un estado nuevo en el CHECK de
-- compras.ordenes_compra.estado (seguiría siendo 'cerrada', el mismo valor
-- que ya usa medio código del módulo) sino dos columnas nuevas que
-- distinguen POR QUÉ se cerró. Ambas nullable: una OC cerrada por el flujo
-- normal (recibida y facturada completa) las deja en null.
--
-- Los valores nullable + el CHECK solo evalúan filas con valor no nulo (en
-- SQL, NULL en un CHECK se trata como "no viola" — no hace falta
-- normalizar nada antes de agregar la columna, todas las filas existentes
-- quedan en null y pasan el CHECK sin tocarlas).

alter table compras.ordenes_compra
  add column if not exists cierre_tipo text check (cierre_tipo in ('completa', 'saldo_no_entregado')),
  add column if not exists cierre_motivo text;
