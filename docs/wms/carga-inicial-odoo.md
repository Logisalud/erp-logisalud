# WMS — Carga inicial desde Odoo (para cuando existan las salidas)

> **Estado: postergada.** Sin salidas en el WMS, su stock no puede cuadrar con Odoo (decisión de Sebas, 2026-10-10). Este documento deja el formato y el procedimiento listos; no se ejecuta nada hasta que existan las salidas.

## Archivo que se necesita

Excel o CSV. **Una fila = una combinación única de producto, lote, posición y estado.** Separadores `,` `;` o tabulación; fechas `dd/mm/aaaa` o `aaaa-mm-dd`; encabezados con o sin tilde (los reconoce `parsearCargaInicial`, `apps/wms/domain/inventario.ts`).

| Columna | Alias aceptado | Obligatoria | Contenido |
|---|---|---|---|
| `producto` | `codigo` | Sí | Código del producto, igual que en el catálogo |
| `lote` | | Sí | Lote del fabricante |
| `vence` | `vencimiento` | Sí | Fecha de vencimiento |
| `propietario` | | Sí | Dueño del stock |
| `posicion` | `ubicacion` | Sí | Posición física del almacén |
| `estado` | | Sí | Aprobado, Cuarentena, etc. |
| `cantidad` | | Sí | Unidades, número positivo |

## Reglas para el stock con datos incompletos (decididas)

- **Sin lote o sin vencimiento: no entra como Aprobado.**
- Primero se intenta completar en el inventario general (revisión física del lote).
- Lo que no se pueda completar entra en **Cuarentena**, para la decisión de Katia (Dirección Técnica).

## Procedimiento (cuando toque)

1. **Corte:** se acuerda fecha y hora; Odoo sin movimientos durante la carga.
2. **Exportación** de Odoo con las columnas de arriba (Sebas).
3. **Validación sin cargar** (Claude): formato, productos no encontrados, lotes duplicados, vencimientos imposibles, filas sin lote o vencimiento (van a la lista de Cuarentena). Informe de errores.
4. **Corrección** hasta 0 errores (Sebas, con Katia y Charlie para lotes dudosos).
5. **Ensayo** en la base local: total de unidades por propietario igual al de Odoo; `wms.verificar_saldos()` sin filas.
6. **Muestra física** (Katia y Charlie): ~30 posiciones contadas contra el sistema.
7. **Carga definitiva** el día del corte, con respaldo previo y conciliación posterior.
8. **Operación en paralelo con Odoo: 4 semanas.** Cada viernes, reporte «WMS vs. Odoo» por producto, lote y propietario; cada diferencia se clasifica (error de captura, error en Odoo, movimiento aún no registrado, pendiente) y **toda diferencia debe quedar explicada y firmada por Katia y Charlie**.

## Quién hace qué

| Quién | Qué |
|---|---|
| Sebas | Exportación de Odoo, fecha de corte |
| Claude | Validador, informe, carga, conciliación, reporte semanal |
| Katia | Decisión sobre lo que entra en Cuarentena; firma de diferencias |
| Charlie | Muestra física; firma de diferencias |
