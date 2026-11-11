# Ruta `pedidos-listos` para el WMS: plan de reversa

**Qué es.** `GET /api/integracion/wms/pedidos-listos`: entrega al WMS los pedidos listos para despacho (contrato: `docs/wms/salidas/contrato-pedidos-wms.md`). Es **aditiva y de solo lectura**: solo hace `select`, no escribe tablas, auditoría, contadores ni logs, y **no hay migraciones**. Va firmada con HMAC (`x-wms-timestamp`, `x-wms-firma`) con el secreto `WMS_PEDIDOS_SECRETO`; sin ese secreto rechaza todo (503).

**Archivos nuevos** (nada existente se modificó): `app/api/integracion/wms/pedidos-listos/route.ts`, `services/wms-pedidos-listos.ts`, `domain/wms-pedidos-listos.ts`, `lib/wms-firma.ts` y sus pruebas en `tests/`.

## Cómo se revierte

1. **Revertir el merge** en `main` (`git revert -m 1 <merge>`): es un solo cambio y no deja nada que deshacer en la base, porque no hay migraciones.
2. **Vercel (proyecto de Pedidos):** quitar la variable `WMS_PEDIDOS_SECRETO`. Aun sin revertir el código, quitarla basta para cerrar la ruta: sin secreto responde 503 a todo.
3. **Rotar el secreto** (si se sospecha que se filtró): cambiar el valor en Pedidos y en el WMS a la vez.

## Qué verificar después

- `GET /api/integracion/wms/pedidos-listos` sin encabezados: tras revertir el código responde **404**; si solo se quitó la variable, **503**. Nunca 200.
- La app de Pedidos sigue igual: login, `/pedidos`, `/operaciones` y el cron `/api/cron/diario` abren sin error.
- En el WMS, «Actualizar desde Pedidos» muestra el aviso de fallo y la bandeja sigue con lo ya importado (es el comportamiento previsto del contrato).
- No quedan filas nuevas en `pedidos.audit_logs` por esta ruta (nunca escribió).

## Límites conocidos de esta primera versión

- Pedidos no tiene hoy un estado `CANCELLED` ni una columna de versión: la ruta ya sabe entregar un pedido cancelado (con `motivoCancelacion` tomado de `order_status_history`), pero mientras Pedidos no lo cancele no saldrá ninguno. La `version` se deriva de cuántas veces el pedido entró a «listo» o «cancelado» en el historial.
- No se envían `coordenadas` ni `ventanaCita` del cliente (Pedidos no los guarda); `numero` es el correlativo de Pedidos (p. ej. `"123"`), no `PED-2026-00123`.
- Sin paginación ni parámetro `desde`: el contrato no los define; la ruta devuelve todos los pedidos listos.
