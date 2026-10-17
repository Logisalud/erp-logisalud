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
