# ADR-010 — Datos regulatorios sin validación adicional, con historial (D-37, D-15)

Fecha: 2026-10-08. Estado: aceptada (decisión de Sebas). Migración 0006 (sin aplicar).

## Contexto
El Batch 1 modelaba «Sandra crea el producto; Katia lo valida» (`PENDIENTE → VALIDADO/OBSERVADO`). Sebas decidió que **solo Katia y Sandra** editan los datos regulatorios, con la
**misma autoridad y sin validación adicional**, y que todo cambio deje rastro.

## Decisión
1. Se retiran `validar_producto` y `actualizar_regulatorio` y las policies de escritura sobre `wms.producto_regulatorio`. La escritura es **solo** por
   `wms.editar_regulatorio(producto, datos jsonb, motivo)` y `wms.crear_producto(...)` (security definer, rol `asistente_dt` o `direccion_tecnica`). Los usuarios no tienen INSERT/UPDATE directo.
2. Cada campo cambiado inserta una fila en `wms.producto_regulatorio_cambios` (campo, antes, después, usuario, fecha, **motivo obligatorio**), inmutable (triggers de update/delete/truncate).
3. Aprobar un lote exige registro sanitario y su vencimiento cargados y vigentes (`validar_movimiento`); ya no existe «validado por Dirección Técnica».
4. Campos editables: registro sanitario, vencimiento del registro, forma farmacéutica, concentración, fabricante, condición de almacenamiento. Presentación y principio activo **no se duplican**: viven en
   `catalogo.productos` (Compras); ver `regulatorio-duplicidad.md`.
5. Las actas firmadas guardan una foto (JSON + SHA-256) y no se alteran cuando cambia el registro sanitario.
6. **D-15:** `movimientos.preparador_id` y la restricción `verificador_id <> preparador_id` (además de `<> ejecutor_id`); `validar_movimiento` lo repite con mensaje claro.

## Consecuencias
- La UI pierde el panel de validación, la cola «por validar» y el filtro de validación; gana el editor con motivo y el historial en la ficha del producto.
- Se mantiene la columna `estado_validacion` en la tabla solo por compatibilidad (siempre `VALIDADO`); no se usa en reglas.
- Reversible mientras 0006 no esté aplicada.
