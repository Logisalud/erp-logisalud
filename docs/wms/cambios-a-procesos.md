# Cambios a los procesos REC-01 y REC-02 (versión 1.2 — borrador)

**Estado: «Borrador — pendiente de revisión».** Las versiones anteriores **no se tocaron**; las nuevas son archivos aparte:

| Proceso | Original (intacto) | Nueva versión (borrador) |
|---|---|---|
| REC-01 Gestión de recepciones | `procesos/REC-01_Gestion-de-recepciones_TO-BE_v1.1_CORREGIDO.xlsx` | `procesos/REC-01_Gestion-de-recepciones_TO-BE_v1.2_BORRADOR.xlsx` |
| REC-02 Registro de inventario | `procesos/REC-02_Registro-de-inventario_TO-BE_v1.0.xlsx` | `procesos/REC-02_Registro-de-inventario_TO-BE_v1.2_BORRADOR.xlsx` |

En cada v1.2 solo cambian las hojas `03_TO-BE` (pasos, objetivo, cierre) y `04_Implementación`, y se agrega la hoja `05_Cambios_v1.2` con el detalle.
`01_AS-IS` y `02_Diagnóstico` se conservan tal cual. Cada archivo lleva el aviso «BORRADOR — PENDIENTE DE REVISIÓN» en la hoja 03.

## Qué cambia

| Tema | Antes | Ahora (v1.2) | Decisión |
|---|---|---|---|
| Primer paso | La recepción empezaba al llegar la mercadería | **La Solicitud de Ingreso (SI-AAAA-NNNNN) es lo primero**; sin ella no hay acta ni stock | Addendum, D-31..D-35 |
| Acta de Recepción | Se llenaba en el momento | **Sale prellenada desde la solicitud final** (cantidad inicial, final y recibida); firma electrónica con usuario; DNI y placa del transportista; PDF y Excel | D-11, D-12 |
| Diferencias | Se resolvían en el acta o fuera del sistema | Verificación por línea («Coincide» / «Hay una diferencia»); la diferencia ajusta la solicitud con motivo, historial y alertas a Sandra y Katia | Addendum |
| Devoluciones | Todo ingreso pasaba por Cuarentena | **Nacen en el estado Devoluciones**, nunca en Cuarentena; su acta organoléptica las lleva a Aprobado o Bajas/Rechazados; el origen es un dato aparte | **D-31** |
| Cantidad física | Se registraba en Compras (fuente) | **El WMS es el dueño**; la copia a Compras es manual y temporal, con conciliación OK / FALTA / NO COINCIDE | D-36 |
| Producto nuevo (REC-02) | Lo validaba Dirección Técnica | Katia o Sandra cargan los datos regulatorios, rigen de inmediato y cada cambio queda con motivo | D-37 |
| Registro de inventario (REC-02) | Charlie registraba en Odoo contra la recepción de Compras | El inventario nace al confirmar el ingreso en el WMS (sin paso de digitación) | Addendum |
| Doble control | No explícito | El verificador es distinto de quien preparó y de quien ejecutó | D-15 |
| Aprobado por trasladar | Sin plazo | Plazo configurable, 24 h | D-28b |

## Lo que sigue abierto (no se inventó respuesta)
Katia: **D-01** (stock ya almacenado de Diphasac: ¿Cuarentena?, prioridad), hold, documentos de baja, contramuestra, muestreo √n+1 y la práctica de «Calidad».
D-36: integración WMS → Compras (`integracion-wms-compras.md`). D-37: presentación y principio activo (`regulatorio-duplicidad.md`).

## Siguiente paso
Revisión de Dirección Técnica y Almacén. Si se aprueban, se renombran como versión vigente (sin sobrescribir el historial) y se actualizan las referencias.


## INV-02 Movimientos entre ubicaciones — ajuste del 2026-10-09 (Sebas)
**El original `procesos/INV-02_Movimientos-entre-ubicaciones_TO-BE_v1.0.xlsx` no se tocó.** Lo que cambia en el WMS respecto de su hoja `03_TO-BE`:

| Tema | Antes (TO-BE v1.0 y Batch 3) | Ahora |
|---|---|---|
| Autorización | El Jefe autorizaba cada movimiento antes de moverlo | **Se elimina el paso de autorización**: la indicación es verbal y no se registra en el sistema |
| Personas | Preparó, autorizó, movió y verificó | **Solo dos:** *Ejecutado por* (quien crea el movimiento en el sistema y mueve la mercadería: la misma persona) y *Verificado por* (otro auxiliar, el Jefe o su reemplazo; nunca quien ejecutó) |
| Flujo | preparar → autorizar → mover → verificar | **ejecutar → verificar** |
| Líneas | Un origen y un destino por orden | Varios productos en una operación, **cada línea con su origen y su destino** (con origen y destino por defecto opcionales) |
| Stock | Cambia al confirmar | Cambia **al verificar cada línea**; desde que se ejecuta, las unidades quedan **reservadas** |
| Diferencia | Dejaba abierto el movimiento | Deja abierta **solo la línea** con diferencia; el Jefe o su reemplazo la resuelve por separado |
| Referencia | MI-AAAA-NNNNN | Igual, visible en la lista (tabla), el detalle, la búsqueda universal y la historia del lote |
