# Datos regulatorios del producto: duplicidad con `catalogo.productos` (D-37) — reporte y propuesta

**Estado:** decidido por Sebas (2026-10-08, D-38): presentación y principio activo **siguen solo en `catalogo.productos`**; Compras los llena al crear el producto y, después, solo Katia y Sandra los editan desde el WMS con historial. **Pendiente de aprobar los cambios de permisos en Compras** antes de implementarlo: `propuesta-presentacion-principio-activo.md`. No se movió ningún dato.

## Qué pidió Sebas
Solo Katia y Sandra editan: registro sanitario, vencimiento (del registro), forma farmacéutica, concentración, presentación, fabricante,
principio activo y condición de almacenamiento. Si alguno ya existe en `catalogo.productos`, Compras o Pedidos: reportar y proponer cómo evitar duplicarlo.

## Qué existe hoy (verificado contra el esquema real, solo lectura)

| Dato | ¿Existe fuera del WMS? | Dónde | ¿Lo usa Compras/Pedidos? | Dónde lo guarda el WMS |
|---|---|---|---|---|
| Presentación | **Sí** | `catalogo.productos.presentacion` | Compras (alta y consulta de producto) | — (se muestra, no se edita en el WMS) |
| Principio activo | **Sí** | `catalogo.productos.principio_activo` | Compras | — (idem) |
| Marca | Sí (no pedida) | `catalogo.productos.marca` | Compras | — |
| Registro sanitario | No | — | — | `wms.producto_regulatorio.registro_sanitario` |
| Vencimiento del registro | No | — | — | `rs_vence` |
| Forma farmacéutica | No | — | — | `forma_presentacion` |
| Concentración | No | — | — | `concentracion` (0006) |
| Fabricante | No | — | — | `fabricante` |
| Condición de almacenamiento | No | — | — | `condicion_almacenamiento` (0006) |

`catalogo.productos` es **compartido** (Compras lo gestiona; Pedidos tiene su propio proyecto y su propio catálogo, que aún no se consolida).
Sus otros campos (`controla_lote`, `controla_vencimiento`, `meses_vida_util_minima_recepcion`, `peso_unitario`, `codigo_proveedor`, `precio_compra`, …)
son de Compras y no se tocan.

## Lo que implementé (sin tocar el catálogo)
- Seis campos regulatorios en `wms.producto_regulatorio`, editables **solo** con `wms.editar_regulatorio` (Katia/Sandra), con historial y motivo.
- **Presentación y principio activo NO se editan en el WMS**: viven en `catalogo.productos` y duplicarlos crearía dos verdades. El WMS los
  **muestra** (solo lectura) en la ficha del producto, en el acta y en el PDF.

## Opciones para presentación y principio activo

1. **Mantener donde están (recomendada por ahora).** Las edita quien hoy las edita en Compras. Katia/Sandra no pueden cambiarlas desde el WMS.
   - *Implicancia:* no cumple al pie de la letra «solo Katia y Sandra editan presentación y principio activo». Si debe cumplirse, ver 2.
2. **Permiso especial en el catálogo.** `wms.editar_regulatorio` también escribe `catalogo.productos.presentacion/principio_activo` (con historial en el WMS).
   - *Implicancia para Compras:* el WMS escribiría en su tabla (cambio **no aditivo**) y Compras seguiría pudiendo editar esos campos salvo que se les
     quite el permiso. Hay que acordar con Compras quién queda como editor.
3. **Mover la propiedad al WMS.** Los dos campos pasan a `wms.producto_regulatorio`; Compras los lee de ahí (vista).
   - *Implicancia:* migración de datos de los ~509 productos y cambio de pantallas de Compras. La mayor limpieza, el mayor costo.

**Recomendación:** opción 1 hoy; si Sebas confirma que Katia/Sandra deben ser dueñas de esos dos campos, opción 3 (en la fase de consolidación del catálogo),
pasando por Compras. **Decisión pendiente de Sebas.**

## Regla de actas firmadas
El contenido de un acta firmada es una foto (JSON + huella SHA-256) tomada al firmar. Editar luego el registro sanitario u otro dato **no altera** actas
ya firmadas (cubierto por un test de base de datos).
