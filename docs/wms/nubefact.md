# Guía de remisión electrónica con Nubefact (OS-3)

Estado: **simulador listo, escrito contra el manual oficial «API Nubefact – Guía de Remisión» (v1.7); entorno de pruebas y producción sin validar**. Nada se emite en producción hasta que Sebas lo apruebe (D-91).

## Cómo se elige el entorno

| Variable | Qué hace |
|---|---|
| `NUBEFACT_MODO` | `SIMULADOR` (por defecto), `PRUEBA` o `PRODUCCION`. En la demostración siempre es el simulador. |
| `NUBEFACT_URL`, `NUBEFACT_TOKEN` | Credenciales de Nubefact. **Solo variables de entorno**: no van en el código ni en la base. |
| `NUBEFACT_PRODUCCION_APROBADA` | Debe valer `SI` para que `PRODUCCION` emita. El candado: lo pone Sebas cuando lo apruebe. |

Pantalla: antes de emitir se ve el entorno («Simulador: la guía no existe ante SUNAT», «Entorno de pruebas de Nubefact» o «Producción: la guía es real»).

## Cómo funciona con Nubefact (dos pasos)

1. **Generar** (`generar_guia`): el WMS pide su siguiente número de la serie (`guia_correlativos`; Nubefact no lo asigna, es un entero sin ceros) y envía la guía. Nubefact la recibe y la manda a SUNAT: todavía **no hay PDF ni XML**. La guía queda registrada «en espera de SUNAT».
2. **Consultar** (`consultar_guia`, con serie y número): si SUNAT la aceptó, trae el PDF, el XML y el CDR. El WMS consulta una vez apenas emite y, si SUNAT aún no responde, la pantalla ofrece **«Consultar estado en SUNAT»**. Recién con la guía aceptada se avisa a Pedidos y se puede cargar la orden.
   Si SUNAT la **rechaza**, la guía se anula con el motivo en palabras y se emite otra.

La autenticación es el token **tal cual** en el encabezado `Authorization` (sin prefijo).

## Qué se envía

Mensaje de «generar guía» remitente (tipo de comprobante 7), armado por `domain/guia-electronica.ts`:
destinatario (RUC, nombre y dirección del pedido; ubigeo de llegada), productos **línea por lote** (código, descripción con lote, cantidad en NIU), punto de partida Lurín (ubigeo `150119`, dirección del parámetro `guia_partida_direccion`, establecimiento `0000`), motivo `01` venta, transporte privado `02`, número de bultos (de la conformidad), peso bruto en `KGM` (12 kg por defecto, editable), placa de la ruta **sin guiones**, conductor (DNI, nombre y apellidos por separado, licencia de 9–10 caracteres) y una observación con el pedido, la Orden de Salida y los lotes con su vencimiento. Serie `TTT1` (la de una guía remitente empieza con T).

El Jefe de Transporte solo confirma **fecha de inicio del traslado** y **peso bruto** (y la licencia si el conductor no la tiene guardada: columna `licencia` de `personal_transporte`).

## Qué se guarda

Número, estado de SUNAT (en espera / aceptada / rechazada), enlaces al PDF, XML y CDR, el entorno, lo enviado y lo recibido. La guía **nunca se edita ni se borra** (solo se completan sus enlaces mientras está en espera).

## Anulación

Tres casos, solo el Jefe de Transporte y con motivo (D-90). La baja ante SUNAT **no se hace sola**: sus reglas (plazo, medio, si procede tras iniciar el traslado) están en parámetros `PENDIENTE`; según el manual de Nubefact una guía **solo se da de baja desde el portal de SUNAT con Clave SOL**, no por la API (`nubefact_baja_soportada = NO`) (`sunat_baja_plazo_horas`, `sunat_baja_tras_inicio_traslado`, `nubefact_baja_soportada`). Una guía de Nubefact anulada queda con `baja_sunat = PENDIENTE` para hacerla a mano.

## Pendiente antes de producción

1. Probar el flujo completo contra el **entorno de pruebas de Nubefact** (los campos siguen el manual; falta ver cómo responde `consultar_guia` mientras SUNAT no acepta).
2. Confirmar serie (TTT1) y **último número ya usado** para arrancar el correlativo, la dirección exacta del almacén de Lurín, y licencia y DNI de los conductores. Un número consumido por un envío que Nubefact rechazó antes de SUNAT queda sin usar: confirmar con Contabilidad si un hueco en la serie es aceptable.
3. Reglas de baja de SUNAT (Contabilidad y Nubefact).
4. Conexión real con Pedidos (D-80, D-92).
