# ADR del WMS

Decisiones técnicas **reversibles** tomadas durante la construcción (las de negocio, sanitarias o regulatorias van a
`../decisiones-pendientes.md`). Formato: contexto → decisión → consecuencias.

| ADR | Tema |
|---|---|
| [001](001-estado-por-unidad.md) | El estado sanitario vive en cada unidad (procedencia), no en el lote |
| [002](002-visual-warehouse-svg.md) | Visual Warehouse en SVG |
| [003](003-roles-en-tabla-propia.md) | Roles del WMS en una tabla propia |
| [004](004-ledger-saldos-concurrencia.md) | Ledger append-only, saldos derivados y candados |
| [005](005-demo-y-pruebas.md) | Modo demostración, pruebas con Postgres local y E2E sin PostgREST |
| [006](006-cambio-de-estado-en-el-lugar.md) | El cambio de estado ocurre en el lugar; Aprobado "por trasladar" |
| [007](007-ux-estados-y-emoji.md) | UX: estados, vacíos, errores y uso de emoji |
