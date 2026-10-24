# Hoja del piloto · Jefe de Transporte

**Quién:** Roberto. **Entras por:** `/wms/login` → menú lateral. **Piloto:** Odoo sigue siendo el sistema oficial; el WMS maneja como real **solo las salidas de una ruta o de un día fijo por semana, con número de pedido**.

## Qué hago
1. **Salidas → Nueva salida:** creo la orden (tipo A) con el número de pedido, el cliente y las líneas. Solo para el pedido del día del piloto.
2. **Salidas → Rutas → Nueva ruta:** pongo fecha, vehículo, conductor y auxiliar, agrego los pedidos y pulso **Confirmar ruta**.
3. **Salidas → Órdenes de salida →** la orden → **Generar orden de picking**. Sigue el picking y la conformidad (otra persona).
4. **La guía:** la emito **en el panel de Nubefact (o en Odoo)**. Luego, en la orden, pulso **Registrar guía emitida** y escribo número, fecha, estado y enlace (opcional). Con la conformidad completa ya se puede registrar.
5. Si me equivoqué: **Anular la guía** con el motivo, emito la correcta en el panel y la registro de nuevo. Un número ya registrado no se vuelve a usar.
6. **Despacho y transporte → Cargar la unidad:** checklist del vehículo (**Guardar el checklist**), carga de bultos, **Liberar la unidad** y **Confirmar la salida**: ahí baja el stock.
7. Al volver el vehículo: **Cerrar la ruta**.

## Qué NO hago
- No emito la guía desde el WMS durante el piloto.
- No creo salidas de otros pedidos ni de otros días: siguen en Odoo.
- No confirmo la salida con bultos sin cargar.

## A quién aviso
- Guía registrada con un error: **Sandra** y **Sebas** (Pedidos recibe el aviso de la anulación).
- Falta stock o lote en el picking: **Charlie**.
- Documento faltante del cliente: **Katia**.

## Esto sigue en Odoo
Facturación, toma y validación de pedidos, stock oficial, las demás rutas y los días fuera del piloto.
