# Contrato Pedidos → WMS: pedidos listos para operaciones (S3)

Estado: **diseño aprobado por Sebas (D-80, 2026-10-14); la ejecución queda diferida hasta la salida a producción del WMS** — no se crea la ruta en Pedidos ni las variables en producción antes. Contrato del lado del WMS, probado contra un doble (`apps/wms/tests/services/fuente-pedidos.test.ts`). **No se tocó Pedidos.** Para que el
WMS traiga pedidos reales, Pedidos tiene que exponer la ruta de abajo (cambio **aditivo**, necesita la aprobación de Sebas) y las dos variables del WMS
tienen que configurarse (en producción, también con su aprobación). Mientras tanto, la bandeja funciona con la fuente de demostración y, sin
configurar, dice «La conexión con Pedidos todavía no está configurada» y sigue con lo ya importado.

## Ruta que expone Pedidos

`GET {WMS_PEDIDOS_URL}/integracion/wms/pedidos-listos`

Devuelve los pedidos en `READY_FOR_OPERATIONS` (los que Operaciones ya puede tomar), cada uno con su **versión**: un número entero desde 1 que sube cada
vez que el pedido se modifica después de quedar listo. Sin service role del otro proyecto y sin exponer tablas.

```json
{
  "generado_en": "2026-10-14T15:00:00Z",
  "pedidos": [
    {
      "pedidoId": "uuid-o-id-estable-del-pedido",
      "numero": "PED-2026-00123",
      "version": 2,
      "estado": "READY_FOR_OPERATIONS",
      "fecha": "2026-10-13",
      "modificadoEn": "2026-10-14T09:12:00Z",
      "cliente": {
        "id": "uuid-del-cliente", "nombre": "Botica Salud Total SAC", "ruc": "20512345671",
        "direccion": "Av. Arequipa 1450, Lince", "distrito": "Lince",
        "coordenadas": { "lat": -12.0867, "lng": -77.0336 },
        "ventanaCita": "L-V 8:00-12:00", "vehiculoCalificado": "Camioneta"
      },
      "vendedor": "Nombre del vendedor", "condicionPago": "Contado", "factura": "F001-00045", "observaciones": "Entrega con cadena de frío.",
      "lineas": [
        { "lineaId": "id-estable-de-la-línea", "productoCodigo": "LIZI-10", "descripcion": "Lizinopril 10 mg", "cantidad": 20 }
      ]
    }
  ]
}
```

Reglas del contrato (las valida el dominio del WMS y otra vez la base de datos, `wms.registrar_importacion_pedidos`):

- `pedidoId` y `lineaId` son **estables** entre versiones (así el WMS sabe qué línea cambió de cantidad, cuál se agregó y cuál se quitó).
- `productoCodigo` es el **código de producto que ya comparten Compras y el WMS**. Un código que el WMS no tiene se importa igual y se marca «No está en el catálogo del WMS».
- `cantidad` entera mayor que cero; `version` entera desde 1; `estado` solo `READY_FOR_OPERATIONS`.
- Un pedido mal formado se **descarta con su motivo** y no tumba a los demás.
- No hay precios ni importes: el WMS no calcula ni valida lo tributario.

## Firma HMAC

Cada solicitud lleva dos encabezados:

| Encabezado | Valor |
|---|---|
| `x-wms-timestamp` | Segundos Unix (UTC) del momento de la solicitud |
| `x-wms-firma` | `sha256=` + HMAC-SHA256 en hexadecimal con el secreto compartido |

Texto que se firma (cuatro líneas separadas por `\n`): `timestamp`, método en mayúsculas, ruta con su query (`/integracion/wms/pedidos-listos`) y el SHA-256
hexadecimal del cuerpo (vacío en un `GET`). Pedidos **rechaza con 401/403** si falta algún encabezado, si la firma no coincide (comparación en tiempo
constante) o si el `timestamp` se aparta más de **300 segundos** de su reloj: una captura no se puede repetir. El secreto se rota cambiando la variable
en ambos lados. La implementación de referencia (y su verificador, que Pedidos puede copiar) está en `apps/wms/services/pedidos/firma.ts`.

## Variables del WMS (solo en el entorno; producción únicamente con aprobación de Sebas)

| Variable | Qué es |
|---|---|
| `WMS_PEDIDOS_URL` | Base de la API de Pedidos, sin la ruta (p. ej. `https://pedidos.logisalud.pe/api`) |
| `WMS_PEDIDOS_SECRETO` | El secreto compartido de la firma |

## Cómo se comporta el WMS

- **Idempotente:** importar dos veces lo mismo no duplica; una versión más vieja que la vigente no pisa nada.
- **Versión nueva:** la anterior queda como historia, el pedido pasa a «Cambió: revisar» con lo que cambió en palabras y se crea la alerta
  `PEDIDO_CAMBIADO` para el Jefe de Transporte (si el pedido ya tenía una salida, la alerta la nombra). Nadie pisa nada en silencio.
- **Si Pedidos no responde** (o rechaza la firma, o contesta algo inválido): queda el intento fallido, la bandeja sigue con lo ya importado y muestra
  «Última actualización hace X».
- **Cuándo se importa:** hoy, al pulsar «Actualizar desde Pedidos» (Jefe de Transporte o Jefe de Almacén). La importación programada (Vercel Cron) llega con la
  planificación de rutas (S4); no necesita nada nuevo del contrato.
- **Para consolidar Pedidos con este proyecto:** se cambia el adaptador (`services/pedidos/fuente-pedidos.ts`) por uno SQL; el dominio y la base de datos no cambian.

## Ventas manuales «por conciliar» (SA-2, tipo A)
Una venta que no llegó por la bandeja se crea en el WMS con el **número de pedido** y los datos del cliente escritos a mano (RUC, razón social, dirección, ubigeo); queda `por_conciliar`. Cuando exista la conexión real (D-80), el WMS hará esto al importar o al consultar ese número en Pedidos (punto de enganche: el puerto `FuentePedidos`, `services/pedidos/fuente-pedidos.ts`; hoy lo reemplaza la unión por número de pedido en `wms.trg_unir_pedido_a_orden_manual`):
1. **El pedido existe** y está `READY_FOR_OPERATIONS`; si no, la orden sigue «por conciliar» con el aviso.
2. **El cliente coincide** (RUC); si no, aviso al Jefe de Transporte (hoy ya lo avisa la unión). Los datos del cliente se toman del pedido y reemplazan lo escrito a mano.
3. **Las líneas** de la orden se comparan con las del pedido; las diferencias las decide el vendedor del pedido (SA-3).
4. Al conciliar: `por_conciliar = false`, la referencia pasa a `pedido_id` y se vincula `pedidos_despacho.salida_id`.
El aviso de guía emitida a Pedidos lleva `pedido_numero` aunque la orden siga por conciliar (campo `por_conciliar`): con él Pedidos encuentra su pedido y factura. A Pedidos solo se le avisa de ventas.
