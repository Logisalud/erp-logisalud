# Hoja del piloto · Jefe de Transporte

**Quién:** Roberto. **Entras por:** `/wms/login` → menú lateral. **Piloto:** Odoo sigue siendo el sistema oficial; el WMS maneja como real **solo las salidas de una ruta o de un día fijo por semana, con número de pedido**.

## Qué hago
1. **Salidas → Nueva salida:** creo la orden (tipo A) con el número de pedido, el cliente y las líneas. Solo para el pedido del día del piloto.
2. **Salidas → Rutas → Nueva ruta:** pongo fecha, vehículo, conductor y auxiliar, agrego los pedidos y pulso **Confirmar ruta**.
3. **Salidas → Órdenes de salida →** la orden → **Generar orden de picking**. Sigue el picking y la conformidad (otra persona).
4. **La guía:** con la conformidad completa, en la orden genero la **Orden de Salida** (queda asignado el siguiente número de la serie; se puede imprimir). Cuando la orden tiene ruta, vehículo y conductor, el WMS **envía la guía a Nubefact con ese mismo número**. En el piloto va a la **cuenta DEMO (modo PRUEBA)**: no es documento oficial; la guía oficial sigue saliendo como hoy.
5. Si me equivoqué: **cancelo la guía asignada** con el motivo (su número no se reutiliza y quien factura recibe el aviso «no facturar») o **anulo la guía**. Un pedido que «ya no sale» se cancela en una sola acción.
6. **Despacho y transporte → Cargar la unidad:** checklist del vehículo (**Guardar el checklist**), carga de bultos, **Liberar la unidad** y **Confirmar la salida**: ahí baja el stock.
7. Al volver el vehículo: **Cerrar la ruta**.

## Qué NO hago
- No uso la guía del WMS como documento oficial durante el piloto (va a la cuenta de prueba de Nubefact).
- No creo salidas de otros pedidos ni de otros días: siguen en Odoo.
- No confirmo la salida con bultos sin cargar.

## A quién aviso
- Guía registrada con un error: **Sandra** y **Sebas** (Pedidos recibe el aviso de la anulación).
- Falta stock o lote en el picking: **Charlie**.
- Documento faltante del cliente: **Katia**.

## Esto sigue en Odoo
Facturación, toma y validación de pedidos, stock oficial, las demás rutas y los días fuera del piloto.
