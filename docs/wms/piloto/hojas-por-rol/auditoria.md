# Hoja del piloto · Auditoría

**Quién:** quien revisa el piloto (solo lectura). **Entras por:** `/wms/login` → menú lateral. **Piloto:** Odoo sigue siendo el sistema oficial; tú revisas lo que el WMS registra como real.

## Qué hago
1. **Control → Auditoría:** reviso quién hizo qué, cuándo y por qué. Nada se edita ni se borra; filtro con la búsqueda, con «Sobre» y con las fechas «Desde» y «Hasta».
2. **Control → Kardex (historial):** sigo el recorrido de un lote, de la entrada a la salida.
3. **Control → Reportes:** reviso **Inventario**, **Vencimientos**, **Recepciones**, **Movimientos**, **Calidad** y **Exactitud del inventario**, y los bajo con el botón **Excel**.
4. **Control → Alertas** y **Almacén → Revisión diaria:** compruebo que las alertas se atienden y que la revisión de cada día se cerró.
5. **Salidas → Órdenes de salida:** verifico que cada salida del piloto tenga su número de pedido, su guía registrada (origen «Emitida en el panel de Nubefact (o en Odoo)») y su salida confirmada.
6. Cada semana anoto lo que encuentro y se lo paso a **Sebas** para el Go/No-Go (`docs/wms/piloto/go-no-go.md`).

## Qué NO hago
- No cambio ningún dato: mi rol es de lectura y el WMS no me deja.
- No pido que se «arregle» un registro: lo que está mal se corrige con una reversa o una anulación con motivo, hecha por quien corresponde.

## A quién aviso
- Un saldo negativo, una guía repetida o una acta sin firmar: **Sebas** y **Katia**, el mismo día.
- Una salida sin número de pedido: **Roberto**.

## Esto sigue en Odoo
La contabilidad, la facturación y el cuadre oficial del stock. Comparar el WMS contra Odoo no es parte del piloto.
