# ADR-011 — Inventario en operación (Batch 3): movimientos con tres personas, conteos a ciegas, ajustes autorizados y Kardex derivado

Fecha: 2026-10-08. Estado: propuesta técnica, reversible mientras 0007 no esté aplicada. Migración 0007 (sin aplicar).

## Contexto
El Batch 3 agrega lo que ocurre después del ingreso: Kardex, movimientos internos (INV-02), conteos cíclicos y ajustes (INV-05) y la carga inicial. Ya existían el libro mayor
append-only (`wms.partidas`), los saldos derivados y la regla D-15 (verificador ≠ preparador ≠ ejecutor).

## Decisiones
1. **El Kardex y la historia del lote se derivan solo del libro mayor** (`wms.kardex_filas`, `wms.historia_lote`). El Kardex incluye ingresos, carga inicial, ajustes y reversas de esos; **no**
   los movimientos internos ni los cambios de estado (no cambian la cantidad del propietario). Un test verifica que el saldo final coincide con `wms.saldos`.
2. **Un movimiento interno es una orden con su propio ciclo** (`ordenes_movimiento`: preparado → autorizado → ejecutado → confirmado, o con diferencia / anulado). **El libro solo se escribe al confirmar**,
   y ahí `postear_movimiento` guarda a las tres personas. Para que el verificador (que es quien dispara el posteo) no quede como «ejecutor», `confirmar_movimiento` fija un contexto transaccional
   (`wms.orden_ctx`) que `postear_movimiento` **vuelve a comprobar contra la orden** (estado, verificador = quien llama, tipo MOVIMIENTO): un usuario no puede falsificarlo por la API.
   D-15 queda en tres capas: dominio, funciones y restricciones de la tabla (`verificador <> preparador`, `<> ejecutor`).
3. **Con diferencia no se cuadra nada**: la orden queda abierta (`CON_DIFERENCIA`), avisa al Jefe y se reintenta o se anula con nota. Las cantidades no se editan.
4. **Reserva**: las unidades de una orden abierta no se pueden reservar dos veces.
5. **Conteo ciego en la base**: `conteo_lineas` no tiene política de lectura; el contador solo accede por `conteo_lineas_para`, que oculta el saldo y los conteos de otros.
   El Jefe/DT ven el saldo de una línea recién cuando su primer conteo terminó. El segundo conteo es de otra persona (restricción de tabla).
   **Una ubicación en conteo no se mueve**: un trigger sobre `partidas` lo impide (salvo el ajuste del propio conteo).
6. **Ajuste = propuesta + autorización**: lo propone el Jefe (con causa registrada y dos conteos iguales) y lo autoriza Dirección Técnica (otra persona); recién entonces se escribe un `AJUSTE` en el libro con su sustento.
   Rechazar lo deja escalado, con nota.
7. **Carga inicial**: administración sube el CSV, se revisa fila por fila (sin escribir) y se guarda como borrador; **no se confirma sin que Dirección Técnica decida el estado del stock inicial (D-09)**.
8. **Migraciones sin `drop … if exists`**: se verifica con `pg_*` antes de borrar (la herramienta MCP se colgó con ese patrón). Se reescribieron 0001–0005 en ese sentido y hay una prueba que lo exige.

## Alternativas descartadas
- Escribir el movimiento al «ejecutar» y corregir con reversa si falla la verificación: ensuciaba el libro y el Kardex con pares de partidas.
- Ocultar el saldo del conteo solo en la interfaz: se podría leer por la API.

## Consecuencias / pendientes
- Cambio de propietario (kardex de ambos propietarios): el Kardex ya lo reconoce, pero **no existe aún el tipo de movimiento** que lo registra.
- Revisión diaria (INV-04), KPIs y la exportación de stock vendible (INV-01) no se construyeron en este batch.
- El adaptador de Supabase no se ejecutó contra una base real.
