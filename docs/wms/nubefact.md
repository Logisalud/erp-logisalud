# Guía de remisión electrónica con Nubefact (OS-3)

Estado: **simulador listo; entorno de pruebas y producción sin validar**. Nada se emite en producción hasta que Sebas lo apruebe (D-91).

## Cómo se elige el entorno

| Variable | Qué hace |
|---|---|
| `NUBEFACT_MODO` | `SIMULADOR` (por defecto), `PRUEBA` o `PRODUCCION`. En la demostración siempre es el simulador. |
| `NUBEFACT_URL`, `NUBEFACT_TOKEN` | Credenciales de Nubefact. **Solo variables de entorno**: no van en el código ni en la base. |
| `NUBEFACT_PRODUCCION_APROBADA` | Debe valer `SI` para que `PRODUCCION` emita. El candado: lo pone Sebas cuando lo apruebe. |

Pantalla: antes de emitir se ve el entorno («Simulador: la guía no existe ante SUNAT», «Entorno de pruebas de Nubefact» o «Producción: la guía es real»).

## Qué se envía

Mensaje de «generar guía» remitente (tipo de comprobante 7), armado por `domain/guia-electronica.ts`:
destinatario (RUC, nombre, dirección y ubigeo del pedido), productos **línea por lote** (código, descripción con lote, cantidad en NIU), punto de partida Lurín (ubigeo `150119` y dirección del parámetro `guia_partida_direccion`), motivo `01` venta, transporte privado `02`, número de bultos (de la conformidad), peso bruto (12 kg por defecto, editable), vehículo (placa de la ruta), conductor (nombre y DNI de la ruta; licencia solo en pruebas y producción) y una observación de almacenamiento con el pedido, la Orden de Salida y los lotes con su vencimiento.

El Jefe de Transporte solo confirma **fecha de inicio del traslado** y **peso bruto**.

## Qué se guarda

Número, estado de SUNAT (aceptada / pendiente), enlace al PDF y al XML, el entorno, lo enviado y lo recibido. Si SUNAT **rechaza**, no se registra nada: se muestra el error en palabras (tabla en `mensajeHumanoSunat`) y se corrige y reenvía. La guía **nunca se edita ni se borra**.

## Anulación

Tres casos, solo el Jefe de Transporte y con motivo (D-90). La baja ante SUNAT **no se hace sola**: sus reglas (plazo, medio, si procede tras iniciar el traslado) y el soporte de la API están en parámetros `PENDIENTE` (`sunat_baja_plazo_horas`, `sunat_baja_tras_inicio_traslado`, `nubefact_baja_soportada`). Una guía de Nubefact anulada queda con `baja_sunat = PENDIENTE` para hacerla a mano.

## Pendiente antes de producción

1. Validar los nombres de los campos contra el **entorno de pruebas de Nubefact** (el formato de la respuesta y el encabezado de autorización están escritos según la documentación pública y sin probar).
2. Serie definitiva, dirección exacta del almacén de Lurín, licencia y DNI de los conductores.
3. Reglas de baja de SUNAT (Contabilidad y Nubefact).
4. Conexión real con Pedidos (D-80, D-92).
