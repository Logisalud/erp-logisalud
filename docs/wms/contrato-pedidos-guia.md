# Contrato WMS → Pedidos: avisos de guía (OS-3)

Pedidos emite la factura y necesita la guía. Cuando se **emite** o se **anula** una guía, el WMS envía un aviso a Pedidos. **Este contrato lo tiene que implementar Pedidos** (requisito de salida a producción, D-80 y D-92); hasta que Sebas apruebe la conexión real, los avisos quedan en la bandeja del WMS (`wms.eventos_pedidos`) y se reintentan.

## Transporte

`POST {WMS_PEDIDOS_URL}/integracion/wms/eventos` con cuerpo JSON y los mismos encabezados de firma de la lectura de pedidos:

- `x-wms-timestamp`: segundos desde 1970.
- `x-wms-firma`: `sha256=` + HMAC-SHA256 con el secreto compartido (`WMS_PEDIDOS_SECRETO`) de `hora \n POST \n ruta \n sha256(cuerpo)`. Una solicitud de más de 5 minutos no vale.

Respuesta: `2xx` = recibido. Cualquier otro código (o sin respuesta) deja el aviso pendiente y el WMS lo reintenta. **Pedidos debe tratar `evento_id` como idempotente** (el mismo aviso puede llegar más de una vez).

## `GUIA_EMITIDA`

```json
{
  "evento_id": "uuid", "tipo": "GUIA_EMITIDA", "creado_en": "2026-10-19T10:00:00Z",
  "guia": "T001-00000057", "origen": "NUBEFACT", "entorno": "PRODUCCION",
  "enlace": "https://…/guia.pdf", "enlace_xml": "https://…/guia.xml", "estado_sunat": "ACEPTADA",
  "salida": "OS-2026-00012", "pedido_id": "ped-123", "pedido_numero": "PED-00123",
  "fecha_traslado": "2026-10-20", "bultos": 2,
  "lineas": [ { "producto_codigo": "P-1", "producto": "Paracetamol 500 mg", "lote": "L2515", "vence": "2028-06-30", "cantidad": 20 } ]
}
```

`origen` puede ser `NUBEFACT`, `MANUAL` (contingencia) o `CLIENTE` (la GRE que trae un cliente de almacenamiento). En el simulador y en pruebas el `entorno` es `SIMULADOR` o `PRUEBA`: **Pedidos no debe facturar con ellos**.

## `GUIA_ANULADA`

Mismos campos más `caso` (1, 2 o 3), `motivo`, `baja_sunat` (`PENDIENTE`, `NO_APLICA` o `HECHA`) y un `aviso`. **El WMS no modifica la factura**: Contabilidad decide si se anula o si corresponde una nota de crédito. Después de un caso 2 llegará un nuevo `GUIA_EMITIDA` para el mismo pedido con otro número.

## Factura: quién la emite y cómo vuelve (SA-3, D-130)

La factura la emite **Pedidos** (dueño de precios, descuentos, IGV, condiciones y crédito; Cobranzas depende de ella). El WMS **no factura** y **nadie digita la factura a mano**:

1. Cuando SUNAT **acepta** la guía, el WMS envía `GUIA_EMITIDA` (arriba) con el **número de guía** (`guia`) y las **líneas con lote, vencimiento y cantidad** (`lineas[].lote`, `vence`, `cantidad`, salidas de lo confirmado en la conformidad), más `pedido_id` y `pedido_numero` para ligarlo. Eso es todo lo que Pedidos necesita para generar la factura automáticamente. (Verificado: el evento lleva exactamente eso; en simulador y pruebas el `entorno` lo marca y Pedidos no debe facturar.)
2. Pedidos factura y devuelve el estado al WMS **dentro del contrato `pedidos-listos`**: el campo `factura` del pedido (p. ej. `"F001-00045"`) llega en la siguiente versión del pedido. Un cambio de versión que solo trae la factura no cambia la Orden de Salida.
3. La Orden de Salida muestra «Factura: pendiente / facturada F001-00045» **solo como lectura**. Una orden sin pedido vinculado (o por conciliar): «Pendiente».

**La parte de Pedidos (consumir `GUIA_EMITIDA`, facturar y publicar `factura`) queda solo documentada**: se implementa con la aprobación de Sebas (D-49). Mientras tanto, los avisos esperan en la bandeja del WMS (`eventos_pedidos`) y se reintentan.

## Seguimiento para el cliente (PLAN, S9b — no implementado; D-141 a D-148)

Para el seguimiento público de un pedido, el WMS enviará a Pedidos tres eventos más por este mismo transporte firmado: `SEGUIMIENTO` (el enlace del pedido; también al revocarlo o regenerarlo), `ESTADO_LOGISTICO` (`RECIBIDO`, `PREPARANDO`, `EN_RUTA`, `LLEGO`, `ENTREGADO`, `NO_ENTREGADO`, `CANCELADO`) y `ENCUESTA_ENTREGA` (valor 1–3 de la carita). Todos idempotentes por `evento_id`. El WMS no necesita el teléfono del cliente. Formato, qué cambiaría en Pedidos (botón «Copiar seguimiento», campo del enlace, respuesta de satisfacción) y cómo se prueba que Pedidos sigue funcionando: `salidas/seguimiento-de-pedidos.md`. **Nada en Pedidos sin la aprobación de Sebas (D-49).**
