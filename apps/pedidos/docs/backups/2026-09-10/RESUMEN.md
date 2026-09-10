# Respaldo del historial de pedidos — 2026-09-10

Tomado antes de vaciar el historial transaccional para arrancar la
operación real. Cierre de la etapa de pruebas: se probaron promociones,
bonificación manual, aprobaciones, despachos, correos y stock.

**Al momento de este respaldo NO se había borrado nada.** El borrado va en
la migración `1029_vaciar_historial_de_pedidos.sql`.

## Contenido

Un JSON por tabla, array de objetos con los nombres de columna de la base.

| Tabla | Filas | md5 de los ids ordenados |
|---|---:|---|
| `orders` | 75 | `578fb3bc51b00774eebaa0e58234017a` |
| `order_items` | 117 | `f9f18c59dcf709e1ada0c91c3f89d6d3` |
| `order_status_history` | 143 | `af4b3e393559ad90f2c81772990ca141` |
| `order_observations` | 6 | `d016f215b7c8ecf9ff34c4f8c16c6a5c` |
| `approval_requests` | 19 | `58da299da2a30b5b9950e58e3dcc091f` |
| `approval_decisions` | 12 | `220f0d9c5a7ea7e48ce0333abcdea9ef` |
| `fulfillments` | 6 | `4984252cd70c47528508f33187aa6c35` |
| `fulfillment_items` | 11 | `d2601f57e326cb628330d87804983dc7` |
| `notification_logs` | 52 | `ed835f27fb373edc20a6a23b800dd5d6` |
| `electronic_document_drafts` | 12 | `cada904c3d6b9132f2539c582a1e291c` |
| **Total** | **453** | |

El md5 se calculó **en la base y en el archivo por separado**, sobre la
lista de ids ordenada, y coincide en las diez tablas: el respaldo tiene
todas las filas y son las mismas. No es una verificación de adorno — un
respaldo truncado a mitad de la transferencia se ve idéntico a uno
completo.

## Estado del historial que se respalda

- Pedidos **#1 al #86** (75 filas: la numeración tiene huecos porque
  `orders.numero` se asigna al crear el borrador y hubo borradores
  abandonados — ver "Número de pedido" en `docs/business-rules.md`).
- Del **2026-08-03** al **2026-09-10**.
- 16 quedaron en borrador, 6 llegaron a despachados.

## `facturas_emitidas`: no existe en este proyecto

Se confirmó con `information_schema`: la tabla **no está creada** en el
proyecto de pedidos. La migración `1001_facturas_emitidas.sql` vive en este
repo pero referencia `public.clientes`, que es del proyecto de
Cobranzas/Compras, y nunca se aplicó acá. **No hay nada que respaldar ni
que borrar.** Si alguna vez se crea, su `pedido_id` no tiene clave foránea
contra `orders`, así que habrá que acordarse de incluirla a mano.

## Lo que NO se toca

Catálogo y maestros quedan intactos: `products`, `product_tax_profiles`,
`price_lists`, `price_list_items`, `promo_bonificaciones`, `promo_escalas`,
`promo_descuentos_condicionados`, `customers`, `customer_addresses`,
`sellers`, `ubigeos`, `stock_lotes`, `inventory_sources` y las cuentas de
usuario.

Además:

- **`audit_logs` (4.344 filas)** se conserva. Sus `entidad_id` van a
  apuntar a pedidos que ya no existen —es texto, no una FK—, y es a
  propósito: la auditoría es el registro de lo que pasó, incluido este
  borrado.
- **`order_notification_recipients` (4 filas)** es configuración, no
  historial: la lista de la oficina sigue igual.
