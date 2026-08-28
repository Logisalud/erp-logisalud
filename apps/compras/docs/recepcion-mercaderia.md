# Recepción de mercadería en Almacén — descripción del flujo implementado

**Fase 1.10 del plan de Compras y Pagos: describir, no tocar.** Todo lo
de abajo es lo que ya existe en el código hoy; no se proponen cambios acá.
Módulo `apps/compras`, Bounded Context **Almacén**.

## 1. Pantallas (en el orden en que las recorre el usuario)

1. **`app/almacen/page.tsx`** — Inicio de Almacén. Lista las recepciones ya
   registradas (`listarRecepciones()`, máx. 100, más recientes primero) con
   OC, proveedor, fecha, guía y estado (`pendiente` / `conforme` /
   `con_discrepancia`, coloreado ámbar o verde). Botón primario único:
   "Registrar recepción" → `/almacen/recepciones/nueva`.

2. **`app/almacen/recepciones/nueva/page.tsx`** — Paso 1: elegir la OC.
   Lista, vía `listarOCsParaRecibir()`, las OC en estado `confirmada` o
   `parcialmente_recibida` que tienen al menos una línea con saldo
   pendiente (`cantidad_recibida < cantidad_pedida`). Cada tarjeta muestra
   código de OC, proveedor y cantidad de productos pendientes, y lleva a
   `/almacen/recepciones/nueva/[ocId]`.

3. **`app/almacen/recepciones/nueva/[ocId]/page.tsx`** — Paso 2: formulario
   de recepción para una OC concreta. Antes de renderizar el formulario
   valida con `puedeRecibirse(oc.estado)` (solo `confirmada` o
   `parcialmente_recibida`) y que existan líneas con saldo pendiente; si
   no, muestra un mensaje en vez del formulario. Renderiza
   `FormularioRecepcion` con las líneas de OC que aún tienen saldo.

4. **`app/almacen/recepciones/nueva/[ocId]/formulario.tsx`** (client
   component) — Formulario en sí: fecha de recepción (default hoy) y N° de
   guía de remisión a nivel cabecera; por cada línea de OC pendiente,
   campos "Cant. en guía", "Cant. física" (obligatoria), "Lote",
   "Vencimiento" (obligatorio solo si el producto controla vencimiento) y
   dos checkboxes: "Hay unidades dañadas" y "No es el producto pedido".
   Usa `useFormState`/`useFormStatus` (React 18) contra la Server Action
   `registrarRecepcionAction`.

5. **`app/almacen/recepciones/nueva/[ocId]/actions.ts`** — Server Action
   `registrarRecepcionAction`: arma el `BorradorRecepcion` desde el
   `FormData`, valida con `validarRecepcion()` (domain, todos los errores
   juntos, no el primero), llama a `registrarRecepcion()` (service) y
   redirige a `/almacen/recepciones/[id]` si todo sale bien.

6. **`app/almacen/recepciones/[id]/page.tsx`** — Detalle de una recepción
   ya registrada: datos de cabecera (proveedor, fecha, guía, estado) y, por
   cada línea, cantidades (guía/física/aceptada/rechazada), lote,
   vencimiento, y una etiqueta de discrepancia (o "Sin discrepancia" en
   verde). Si la línea tiene discrepancia y **no** está resuelta todavía,
   muestra la acción sugerida por la matriz estándar y embebe el
   formulario `ResolucionDiscrepancia`; si ya está resuelta, muestra qué se
   decidió y el comentario. Si la recepción entera está `conforme`,
   aparece el botón "Registrar obligación" → `/cuentas-por-pagar/nueva/[recepcionId]`.

7. **`app/almacen/recepciones/[id]/resolucion.tsx`** (client component) —
   Formulario por línea con discrepancia: un `<select>` "Decisión" con las
   5 acciones posibles, un campo numérico "Cantidad a aceptar" que solo
   aparece si la decisión es "Aceptar con otra cantidad", y un comentario
   opcional. Un solo botón "Guardar decisión".

8. **`app/almacen/recepciones/[id]/actions.ts`** — Server Action
   `resolverDiscrepanciaAction`: lee la decisión del `FormData`, llama a
   `resolverDiscrepancia()` (service) y hace `revalidatePath` de la misma
   pantalla de detalle.

No hay pantalla propia para editar `matriz_resolucion_discrepancias` (solo
admin puede escribirla vía RLS, sección 5) ni para subir
`storage_path_guia_recibida` / `storage_path_factura_proveedor` (ver
sección 7, "Gaps").

## 2. Modelo de datos (`supabase/migrations/0001_compras_pagos_schemas.sql`)

### `almacen.recepciones` (líneas 210-226)

Cabecera de una recepción física contra una OC.

- `id` — PK.
- `oc_id` — FK a `compras.ordenes_compra`; una recepción siempre cuelga de
  una OC.
- `recibido_por` — FK a `auth.users`, quien registró la recepción (Charlie
  / Jose Carlos / Sandra Chau en el lenguaje del negocio).
- `fecha_recepcion` — timestamptz, fecha real de llegada de la mercadería
  (default `now()`, editable en el formulario).
- `guia_remision` — texto libre, número de guía.
- `storage_path_guia_recibida` — ruta al archivo de la guía escaneada con
  sello de recibido, sube Charlie (comentario inline en la migración).
- `storage_path_factura_proveedor` — ruta a la factura física entregada
  junto con la mercadería, también sube Charlie.
- `conforme` — boolean, se llena cuando la recepción cierra conforme.
- `fecha_conformidad` — timestamptz; "se llena cuando la recepción queda
  cerrada -> dispara el cálculo de vencimiento de pago" (comentario de la
  propia migración). Es el campo que consume Cuentas por Pagar (sección 6).
- `estado` — `'pendiente' | 'conforme' | 'con_discrepancia'`, default
  `'pendiente'`.
- `observaciones` — texto libre.

### `almacen.recepciones_items` (líneas 228-244)

Una fila por línea de OC recibida en esa recepción.

- `id` — PK.
- `recepcion_id` — FK a `almacen.recepciones`, `on delete cascade`.
- `oc_item_id` — FK a `compras.ordenes_compra_items`.
- `cantidad_guia` — numeric, opcional, informativo (no clasifica).
- `cantidad_fisica` — numeric, obligatorio, lo que Charlie contó
  físicamente.
- `lote` — texto, opcional (obligatorio de facto solo si el producto
  controla lote).
- `fecha_vencimiento` — date, opcional salvo que el producto controle
  vencimiento.
- `estado_calidad` — `'bueno' | 'danado' | 'vencido' | 'por_vencer'`,
  default `'bueno'`.
- `tipo_discrepancia` — uno de `'ninguna','faltante','sobrante',
  'producto_erroneo','danado','vencido','por_vencer','lote_no_informado'`.
- `cantidad_aceptada` — numeric, cuánto de lo físico entra a
  stock/factura.
- `cantidad_rechazada` — numeric, default 0.
- `observaciones` — texto libre.

Hay además una FK diferida que agrega
`compras.notas_credito.recepcion_item_id → almacen.recepciones_items(id)`,
porque `notas_credito` se crea antes en el archivo que `recepciones_items`.

### `almacen.matriz_resolucion_discrepancias` (líneas 257-277)

Tabla de referencia, semilla fija (`insert ... on conflict do nothing`),
editable solo por `admin` (RLS, sección 5). Una fila por cada uno de los 7
tipos de discrepancia posibles:

| tipo_discrepancia | accion_estandar | requiere_nota_credito | requiere_reposicion |
|---|---|---|---|
| `faltante` | Recibir lo físico real; solicitar NC o reposición por la diferencia | true | true |
| `sobrante` | Rechazar el excedente salvo autorización expresa | false | false |
| `producto_erroneo` | Rechazo total de la línea, no ingresa a stock | false | true |
| `danado` | Rechazar unidades dañadas; solicitar NC o reposición | true | true |
| `vencido` | Rechazo total, nunca se recibe producto vencido | true | false |
| `por_vencer` | Rechazo salvo autorización puntual del responsable de Almacén | false | false |
| `lote_no_informado` | Recibir con observación, validar con Compras | false | false |

`accion_estandar` es "la única fuente de verdad de lo que dice cada
acción" (comentario de `domain/recepcion.ts`): el dominio solo la traduce
a números (`cantidadAceptada`/`cantidadRechazada`) para tener un valor por
defecto sin esperar la resolución humana.

### `almacen.resoluciones_discrepancia` (líneas 279-291)

Registro de la decisión tomada sobre una línea con discrepancia.

- `id` — PK.
- `recepcion_item_id` — FK a `almacen.recepciones_items` (no única).
- `tipo_discrepancia` — copia del tipo de la línea al momento de resolver.
- `accion_sugerida` — columna presente pero **no se llena** en
  `resolverDiscrepancia()` (ver gap, sección 7).
- `accion_tomada` — una de `'aceptado_segun_sugerencia',
  'aceptado_con_ajuste','rechazado','nota_credito_solicitada',
  'reposicion_solicitada'`.
- `comentario` — texto libre, opcional.
- `decidido_por` — FK a `auth.users`.
- `fecha_decision` — timestamptz, default `now()`.

## 3. Clasificación automática de discrepancias (`domain/recepcion.ts`)

Lógica pura (sin Next/Supabase), en `clasificarLinea()` (líneas 81-113),
invocada desde `services/recepciones.ts` al registrar la recepción.

**Insumos por línea** (`LineaRecepcionInput`): `cantidadPedidaPendiente`
(pedida − ya recibida en recepciones previas), `cantidadGuia`,
`cantidadFisica`, `lote`, `fechaVencimiento`, y dos flags manuales:
`danado`, `productoErroneo`. También `fechaRecepcion` y los datos del
producto (`controlaLote`, `controlaVencimiento`, `mesesVidaUtilMinima` =
`catalogo.productos.meses_vida_util_minima_recepcion`).

**Paso 1 — estado de calidad** (líneas 85-94):

- Parte de `'danado'` si el checkbox está marcado, si no `'bueno'`.
- Si el producto controla vencimiento y hay fecha informada:
  - `fechaVencimiento < fechaRecepcion` → `'vencido'` (pisa incluso a
    `'danado'`).
  - Si no, y el estado no es ya `'danado'`: se calculan los **meses
    completos** entre recepción y vencimiento (`mesesEntre()`, año×12+mes,
    sin días sueltos); si `meses < mesesVidaUtilMinima` → `'por_vencer'`.

**Paso 2 — tipo de discrepancia**, por precedencia estricta (líneas
96-104):

`producto_erroneo > vencido > danado > por_vencer > lote_no_informado >
faltante/sobrante > ninguna`

1. `productoErroneo` marcado → `'producto_erroneo'`.
2. `estadoCalidad === 'vencido'` → `'vencido'`.
3. `estadoCalidad === 'danado'` → `'danado'`.
4. `estadoCalidad === 'por_vencer'` → `'por_vencer'`.
5. Producto controla lote y no se informó → `'lote_no_informado'`.
6. `cantidadFisica < cantidadPedidaPendiente` → `'faltante'`.
7. `cantidadFisica > cantidadPedidaPendiente` → `'sobrante'`.
8. Si nada aplica → `'ninguna'`.

El comentario del código justifica el orden: "vencido pesa más que dañado
porque 'nunca se recibe producto vencido' es una regla sin excepción;
dañado sí puede tener autorización puntual".

**Cómo se determina `por_vencer`**: solo si `controlaVencimiento === true`
y hay fecha informada, la fecha no ya pasó (si pasó es `vencido`), el
estado de calidad todavía no es `'danado'`, y los meses enteros entre
`fechaRecepcion` y `fechaVencimiento` son menores que
`mesesVidaUtilMinima` del producto.

**Paso 3 — cantidad aceptada/rechazada sugerida**, `accionSugerida()`
(líneas 122-148):

- `vencido`, `danado`, `producto_erroneo`, `por_vencer` → rechazo total.
- `sobrante` → se acepta hasta lo pedido, se rechaza el excedente.
- `faltante`, `lote_no_informado`, `ninguna` → se acepta todo lo físico
  (la diferencia con lo pedido queda como discrepancia informativa, no
  como rechazo).

**Validación previa a guardar** (`validarRecepcion`, líneas 192-221):
exige `ocId`, `fechaRecepcion`, al menos una línea con `cantidadFisica >
0`, ninguna cantidad negativa, y **no** exige lote aunque el producto lo
controle (la ausencia de lote es una discrepancia clasificada, no un
bloqueo), pero **sí** exige `fechaVencimiento` cuando el producto controla
vencimiento — no existe un tipo de discrepancia "vencimiento no
informado" en la matriz.

## 4. Registro de la recepción y efectos inmediatos (`services/recepciones.ts`, `registrarRecepcion`, líneas 126-238)

1. Verifica que la OC exista y que `puedeRecibirse(oc.estado)`.
2. Filtra las líneas del borrador con `cantidadFisica > 0`.
3. Por cada línea, calcula `pendiente = cantidad_pedida − cantidad_recibida`
   y llama a `clasificarLinea()`.
4. Inserta la cabecera en `almacen.recepciones` con `estado: 'pendiente'`.
5. Inserta las líneas en `almacen.recepciones_items` ya clasificadas; si
   falla, borra la cabecera recién creada.
6. Por cada línea, **suma** `cantidadAceptada` a
   `ordenes_compra_items.cantidad_recibida` — lectura-y-escritura, no
   incremento atómico. Ver gap de concurrencia, sección 7.
7. Llama a `actualizarEstadoOC()`: si `cantidad_recibida >=
   cantidad_pedida` en todos los ítems, la OC pasa a `'recibida_completa'`;
   si no, a `'parcialmente_recibida'`.
8. Evalúa `recepcionQuedaConforme()` asumiendo que ninguna línea con
   discrepancia está resuelta todavía — solo puede dar `conforme = true`
   en este punto si **ninguna línea** tuvo discrepancia. Si es así,
   actualiza la cabecera a `estado: 'conforme', conforme: true,
   fecha_conformidad: new Date().toISOString()`. Si no, queda
   `'con_discrepancia'`.

## 5. Resolución de discrepancias

**Quién puede resolver** — RLS (`0002_compras_pagos_rls.sql`, líneas
205-248):

- Lectura de `recepciones`, `recepciones_items`,
  `matriz_resolucion_discrepancias` y `resoluciones_discrepancia`:
  cualquier usuario autenticado con área asignada.
- Escritura de `recepciones` y `recepciones_items`: solo áreas `almacen`
  o `admin`.
- Escritura de `matriz_resolucion_discrepancias`: solo `admin`.
- **Insertar en `resoluciones_discrepancia`**: solo si `decidido_por =
  auth.uid()` **y** el usuario es `es_jefe_de('almacen')` o `es_admin()`
  — solo el responsable/jefe de Almacén (hoy Sebas) puede resolver una
  discrepancia, no cualquier persona del área que recibe (Charlie, Jose
  Carlos, Sandra Chau reciben; Sebas resuelve — comentario literal en el
  SQL).

**Acciones disponibles** (`ResolucionInput.accionTomada`):

1. `aceptado_segun_sugerencia` — confirma la cantidad ya calculada.
2. `aceptado_con_ajuste` — permite especificar
   `cantidadAceptadaAjustada` (0 a la cantidad física, sugerencia como
   default).
3. `rechazado` — fuerza `cantidadAceptada = 0`.
4. `nota_credito_solicitada` — registra la decisión sin cambiar la
   cantidad aceptada.
5. `reposicion_solicitada` — ídem, sin cambiar cantidad.

**Lógica de `resolverDiscrepancia()`** (líneas 434-518):

1. Exige usuario autenticado y lee la línea; rechaza si
   `tipo_discrepancia === 'ninguna'`.
2. Calcula `nuevaAceptada` según la acción tomada (ver arriba).
3. Inserta la fila en `almacen.resoluciones_discrepancia`.
4. Si `delta = nuevaAceptada − cantidad_aceptada_actual ≠ 0`: actualiza
   `recepciones_items.cantidad_aceptada`/`cantidad_rechazada`, propaga el
   delta a `ordenes_compra_items.cantidad_recibida`, y vuelve a llamar
   `actualizarEstadoOC()`.
5. Relee todas las líneas de la recepción y sus resoluciones; recalcula
   `recepcionQuedaConforme()` con `resuelta = tiene alguna fila en
   resoluciones_discrepancia`.
6. Si queda conforme, actualiza la cabecera a `estado: 'conforme',
   conforme: true, fecha_conformidad: new Date().toISOString()`.

**Regla de cierre** — `recepcionQuedaConforme()` (líneas 150-159): la
recepción entera puede cerrarse conforme solo si **todas** las líneas
cumplen `tipoDiscrepancia === 'ninguna' || resuelta`. Una línea sin
discrepancia nunca bloquea el cierre; una línea con discrepancia sin
resolución sí lo bloquea indefinidamente hasta que el jefe de Almacén
decida.

## 6. `fecha_conformidad` / `conforme` y efecto en Cuentas por Pagar

`fecha_conformidad` se llena en dos únicos puntos: al registrar la
recepción si de entrada no hay ninguna discrepancia, o al resolver la
última discrepancia pendiente. En ambos casos con `new Date().toISOString()`
— la fecha/hora en que el sistema cierra la recepción como conforme, no la
fecha de recepción física ni la de la OC ni la de la factura.

Efecto downstream, en `services/obligaciones.ts`:

- `obtenerRecepcionParaObligar()` solo devuelve datos si
  `recepcion.estado === 'conforme' && recepcion.fecha_conformidad`.
- `registrarObligacionDesdeRecepcion()` repite la comprobación y usa
  `domain/obligacion.ts::calcularFechaVencimientoReal(recepcion.fecha_conformidad,
  condicionPagoDias)` — **regla de negocio 3**: "la fecha de vencimiento
  del PAGO se calcula desde la fecha de CONFORMIDAD de la recepción (nunca
  la fecha de la OC ni la de la factura) más la condición de pago del
  proveedor (o de la OC si la sobreescribe)". Condición usada:
  `oc.condiciones_pago_dias ?? proveedor.condicion_pago_dias`.
- `registrarObligacionDesdeRecepcion()` corre además la conciliación de 3
  vías (`conciliarLineas()`) entre lo pedido, lo recibido por Almacén y lo
  facturado, y decide el estado inicial de la obligación (`'registrada'`
  si concilia, `'observada'` si no).
- Una recepción solo puede generar **una** obligación:
  `registrarObligacionDesdeRecepcion()` revisa que no exista ya una fila
  en `cuentas_x_pagar.obligaciones` con `recepcion_id = borrador.recepcionId`.

## 7. Gaps / limitaciones conocidas, ya documentadas en el código

- **Concurrencia en `cantidad_recibida`**: la actualización es
  lectura-y-escritura, no atómica; aceptable solo mientras una única
  persona de Almacén reciba a la vez (comentario explícito en
  `services/recepciones.ts`) — si hubiera turnos simultáneos en la misma
  OC habría que revisar esto (RPC con `for update` o un trigger que sume).
- **`resoluciones_discrepancia.accion_sugerida`**: existe como columna
  pero `resolverDiscrepancia()` no la llena al insertar — queda siempre
  `null` en la práctica actual.
- **Documentos de la recepción** (`storage_path_guia_recibida`,
  `storage_path_factura_proveedor`): existen como columnas y se leen para
  heredarlos a la obligación, pero no hay ningún formulario ni Server
  Action en `app/almacen/**` que las escriba — `registrarRecepcion()`
  nunca las setea en el `insert`. Hoy siempre quedan `null` salvo que se
  carguen por otra vía no localizada en este árbol.
- **Recepciones concurrentes sobre la misma línea**: el comentario de
  `mapaResolucionesPorItem()` anticipa un escenario — "si algún día se
  permitiera más de una resolución por línea, la última manda" — que hoy
  no ocurre porque la UI oculta el formulario de resolución en cuanto
  existe una resolución.
