# Pedido → Factura → Cuenta por cobrar

Diseño del ciclo. **Nada aplicado**: `public.documentos` no se tocó. La versión
navegable de este documento es la que revisaron Sebas y Andrés.

## La estructura real de Cobranzas (leída de producción)

### `public.documentos` — 2.405 filas

PK `id uuid`. Clave natural: **`UNIQUE (tipo, serie, numero)`**.

| Columna | Tipo | Nota |
|---|---|---|
| `tipo` | char(2) | `01` factura · `03` boleta · `07` NC · `08` ND |
| `serie` | char(4) | check `^[A-Z0-9]{4}$` |
| `numero` | integer | check `> 0` |
| `cliente_ruc` | char(11) | FK → `clientes(ruc)` |
| `fecha_emision` | date | indexada |
| `fecha_vencimiento` | date | nullable; alimenta el aging |
| `moneda` | char(3) | default `PEN`, check `PEN|USD` |
| `importe_total` | numeric | check `>= 0` |
| `tipo_cambio` | numeric | nullable |
| `documento_relacionado_id` | uuid | FK a sí misma; NC/ND lo exigen |
| `anulado` | boolean | default `false` — **la pieza para revertir** |
| `observaciones` | text | libre |
| `forma_pago` | text | `CONTADO` \| `CREDITO` |
| `contado_pendiente` | boolean | override manual |
| `aceptado_sunat` | boolean | default `true` |

La referencian `pagos`, `letras`, `letra_documento` y
`whatsapp_mensajes_enviados`: **borrar una fila puede romper esas FKs**.

### `public.clientes` — 3.443 filas

PK `ruc char(11)`. La relación con documentos es directa y por RUC, sin id
interno de por medio: un pedido ya conoce el RUC y con eso alcanza.

### `v_saldos`

Vista, no tabla — **no se le escribe, se recalcula sola**:

1. Parte de `documentos` filtrando `tipo in ('01','03') and anulado = false and aceptado_sunat is not false`.
2. Resta notas de crédito y suma notas de débito, agrupadas por `documento_relacionado_id`.
3. Resta pagos (`sum(pagos.monto)` por `documento_id`), sin filtrar por estado de verificación bancaria.
4. Toma saldo y aging de `v_cobros` vía el CTE `cobros_agg`.

**Qué mueve el saldo:** insertar una factura viva lo sube; `anulado = true` lo
baja; un pago lo baja; una NC lo baja.

Dos detalles que el diseño respeta:

- **El corte de CONTADO está hardcodeado en `2026-08-11`.** Toda factura que
  salga de Pedidos es posterior, así que aparece pendiente hasta que se
  registre su cobro. Es correcto, pero hay que avisarlo para que no se lea
  como error.
- **`aceptado_sunat is not false` ya deja lista la integración con NubeFact**:
  una factura rechazada por SUNAT sale del saldo sola.

## El ciclo

### `pedidos.facturas_emitidas`

Entidad propia, no columnas sobre el pedido: un pedido puede tener más de una
factura si se anula y se re-emite.

Campos: `pedido_id`, `tipo`, `serie`, `numero`, `fecha_emision`,
`fecha_vencimiento`, `moneda`, `importe_total`, `tipo_cambio`,
`origen` (`manual|nubefact`), `storage_path`, `subido_por`,
`documento_id` → `public.documentos(id)`, y el espejo de anulación
(`anulada`, `anulada_por`, `anulada_en`, `motivo_anulacion`).

`UNIQUE (tipo, serie, numero)`: el número de comprobante es único en la
empresa, no por pedido.

### El enlace va del lado de Pedidos

`facturas_emitidas.documento_id` apunta a `documentos`, y con eso **no hace
falta ninguna columna nueva en `documentos`**. La trazabilidad se resuelve con
un join o una vista.

Si se quiere la columna en `documentos` para que la pantalla de Cobranzas
muestre el pedido de origen, la propuesta explícita —pendiente de aprobación—
es exactamente una: `pedido_id uuid null references pedidos.orders(id)`.

### Qué dispara la cuenta por cobrar

Una sola operación, `emitirFactura`, sobre el Aggregate Root del pedido:

1. Validar que el pedido se puede facturar y que no tenga ya una factura viva.
2. Subir el PDF al bucket `facturas-pedidos`, path `<YYYY>/<MM>/<serie>-<numero>.pdf`.
3. **Calcular el importe desde el pedido, en el servidor.** Si no coincide con
   el del PDF, se rechaza y se avisa la diferencia. Nadie tipea el monto.
4. Insertar en `facturas_emitidas` y en `public.documentos` **en una sola
   transacción**, vía `pedidos.emitir_factura(...)` con `security definer`.
5. Marcar el pedido como facturado, en la misma transacción.

**Por qué `security definer` y no la service role key:** darle la service role
a la app de Pedidos le da acceso total a la base, cobranzas incluida. La
función le da exactamente una capacidad: insertar una factura bien formada,
validando adentro el RUC, el importe, el tipo y el rol de quien llama.

### Listo para NubeFact

El campo `origen` y el punto de entrada único son lo que permite el cambio: hoy
la Server Action recibe los datos del formulario, mañana de la API. La función
que escribe en `documentos` no cambia. `facturas_emitidas` puede sumar
`nubefact_enlace` y `nubefact_respuesta jsonb` sin tocar nada.

## Anulación

`v_saldos` filtra `anulado = false`, así que **`anulado = true` saca la cuenta
del saldo sin borrar la fila**. Sin basura y sin romper FKs.

Dos situaciones distintas:

| Situación | Qué se hace |
|---|---|
| La factura se cargó mal y no llegó a ser válida ante SUNAT | `anulado = true` + espejo en `facturas_emitidas` con motivo y quién |
| La factura ya es válida ante SUNAT | **nota de crédito** (`tipo = '07'`) referenciando la factura. La emite Contabilidad, no Pedidos |

Tres reglas:

- **El número queda quemado.** La fila anulada conserva su
  `UNIQUE (tipo, serie, numero)`, que es lo que SUNAT espera. Re-emitir es una
  serie-número nueva con el mismo `pedido_id`.
- **Si ya tiene pagos, no se anula.** Existe `pagos.documento_id`: anularla
  dejaría el pago colgando y descuadraría la conciliación bancaria. La función
  rechaza y deriva a Contabilidad.
- **El PDF no se borra.** Es la evidencia de qué se cargó y por qué se anuló.

Pueden anular `admin` y `control_pedidos`. Un vendedor no.
