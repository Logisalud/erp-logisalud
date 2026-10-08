# ADR-001 — El estado sanitario vive en cada unidad, no en el lote

**Contexto.** El lote ABC ya está Aprobado por una recepción anterior y llega otra entrega del mismo lote. La nueva debe
pasar por Cuarentena con su propia acta, sin heredar la aprobación, y la anterior no puede volver a Cuarentena.

**Decisión.** `wms.lotes` es solo identidad (producto + código + vencimiento + propietario). El ledger (`partidas`) y los
saldos se identifican por `(posición, producto, lote, propietario, estado, procedencia_id)`; `procedencia_id` es la entrega
que originó las unidades. Una entrega nueva **nace** en Cuarentena (un ingreso no es una transición). Aprobar es un
`CAMBIO_ESTADO` que mueve solo las unidades de esa procedencia.

**Consecuencias.** Un lote puede tener a la vez celdas Aprobadas y en Cuarentena; las consultas "por lote" suman y muestran el
desglose por estado. El mismo lote no puede tener dos vencimientos (`wms.asegurar_lote`). Probado en
`tests/db/ledger.test.ts` ("el lote ABC").
