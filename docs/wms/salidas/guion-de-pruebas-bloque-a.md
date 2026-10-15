# Guion de pruebas — primera salida completa (tipo A, distribución)

Para probar a mano, en la vista previa (Preview) con datos de demostración. **Nada de esto toca una base real**: es una demostración que se reinicia sola.
Entra por `/wms/login`. Arriba de todas las pantallas hay un selector «Probar como»: así cambias de persona sin cerrar sesión.

> Orden recomendado. Cada paso dice **con quién entrar** y **qué deberías ver**.

## 1. Planificar la ruta (Jefe de Transporte)
1. Entra como **Jefe de Transporte** → menú **Rutas**. Ya hay una ruta planificada (RUT-…-00001) con un pedido de *Botica Salud Total*.
2. Ábrela. Verás el vehículo, el conductor, la parada y el chip **«Stock asignado»**. Abajo, el formato **LS-FR.43.03** con su botón «Ver el PDF» (A4 horizontal, firmas solo al final, pie «LOGISSA S.A.C.»).

## 2. Cambiar lotes antes del picking (Jefe de Transporte)
1. Menú **Salidas** → abre la salida del pedido *PED-DEMO-101*.
2. En la tabla, pulsa **Cambiar lotes** en la primera línea. Elige otro lote del desplegable: verás vencimiento, ubicación y cuánto hay; el sugerido por FEFO dice «sugerido».
3. Pulsa **Agregar lote** y reparte la cantidad en dos lotes (debe cerrar el total: te dice «Faltan X» o «Completo»).
4. Si eliges un lote que vence después de otro disponible, sale un aviso amarillo («Hay un lote que vence antes…»). **No te bloquea**; el cambio queda registrado sin pedirte motivo.
5. **Guardar lotes**. Aparece «Fuera de FEFO». El reporte **Cambios fuera de FEFO** (botón en la lista de Salidas) cuenta quién lo hizo.
6. Pulsa **Generar orden de picking**.

## 3. Picking (Auxiliar de almacén) — mejor desde el celular
1. Entra como **Auxiliar** → **Picking** → abre la orden. Cada línea sale en el orden del recorrido: ubicación grande, producto, lote, cantidad.
2. **Pickeado** en cada línea. Si no encuentras un lote: **No lo encuentro** → cuenta qué pasó → el WMS propone el mismo lote en otra ubicación o el siguiente por vencimiento → **Usar este**.
3. **Hoja para imprimir**: PDF con las líneas en orden de recorrido.

## 4. Conformidad (Asistente de Dirección Técnica, «Sandra»)
1. Entra como **Asistente de Dirección Técnica** → **Conformidad** → abre la orden.
2. Quien hizo el picking **no** puede dar la conformidad de su línea; Sandra sí. **Conforme** en cada línea (o **Observar** con tipo y nota: la línea vuelve a picking y se corrige).
3. Al dar la conformidad, las unidades pasan del rack a la zona de conformidad (el stock **todavía no sale**).

## 5. Guía de remisión y paquete documental (Asistente de DT o Jefe de Transporte)
1. **Salidas** → la salida → bloque **Documentación final**.
2. Si faltan documentos (COA del lote, registro sanitario vencido…) te lo dice con el nombre exacto, y el Jefe de Transporte recibe una alerta. Para completarlos: menú **Documentos** → **Carga masiva de COA** (nombra los PDF con el lote, ej. `COA_L2515.pdf`) o **Reemplazar** un registro sanitario (Dirección Técnica).
3. Registra el **N.° de la guía** (ej. `T001-00001234`; la guía se emite fuera del WMS). Sus líneas salen de lo confirmado. Si te equivocas: **Anular la guía** con motivo y registra la correcta.
4. **Imprimir paquete (un solo PDF)**: carátula + COA, registro sanitario y BPM de los lotes exactos. También existe en la ruta.

## 6. Embalaje (Auxiliar)
1. **Embalaje** → el pedido → elige **cuántos bultos** (− / +). La tabla lote × bulto empieza con todo en el bulto 1; reparte las unidades (cada lote debe cerrar y ningún bulto puede quedar vacío).
2. **Confirmar el embalaje**: salen los bultos **«1 de 2»**, cada uno con su **QR**, y las **etiquetas** en PDF.
3. En la lista de Salidas el pedido pasa a **«Lista para carga»** (conforme + embalado + guía + paquete completo).

## 7. Carga y salida (Jefe de Transporte)
1. **Carga de unidad** → la ruta. (1) **Checklist del vehículo**: marca Sí/No (un No pide nota) y guarda.
2. (2) **Cargar los bultos**: escribe o escanea el código (ej. `SAL-2026-00001-B1`) o pulsa «Marcar cargado». Repetir un escaneo no pasa nada.
3. (3) **Conciliación**: cada bulto dice «Cargado» o «Falta». Si falta uno, **no se puede liberar**; puedes **dejar ese pedido fuera de la salida** (con motivo).
4. **Liberar la unidad**. El stock **todavía no sale**.
5. **Confirmar la salida** (pide una segunda confirmación). **Aquí el stock sale**: míralo en **Kardex** (producto → fila «Salida» y el saldo baja). Repetir la confirmación no descuenta dos veces. El LS-FR.43.03 de la ruta ya lleva la hora real de salida, el N.° de guía y los bultos.

## Lo que NO está (a propósito)
- No hay conexión real con Pedidos (los pedidos son simulados) ni emisión de la guía ante SUNAT.
- El checklist del vehículo, las definiciones del LS-FR.43.03 (USUARIO, cajas = bultos, temperatura, copia física) y las zonas nuevas esperan a Dirección Técnica (Katia).
- Reprogramación, retorno y cierre de ruta (S9) no están en este bloque.
