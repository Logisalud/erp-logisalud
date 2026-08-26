# Modelo de datos — Fase 2 (Maestros)

Este documento describe las tablas creadas en Fase 2: los maestros
sobre los que se apoyará el resto del sistema (pedidos, precios,
stock — fases posteriores). Todo vive en el schema `pedidos` (ver
[architecture.md](architecture.md)).

## Catálogos simples

`sales_channels`, `suppliers`, `zones`, `payment_terms`: mismo patrón
— `id`, `nombre` único, `estado` (`activo`/`inactivo`), lectura abierta
a cualquier usuario autenticado, escritura solo `administrador`.

Seed inicial:
- `sales_channels`: Mayorista, Horizontal, Minicadenas, Tops, Clínicas,
  Subdistribuidores.
- `suppliers`: Diphasac, Biosana, Prades, Dare Nutrition.

## Zonas y asignación de vendedores

- `zones`: catálogo de zonas.
- `zone_assignments`: asignación **normal** (1 zona = 1 vendedor
  titular). Un índice único parcial (`where vigencia_hasta is null`)
  garantiza una sola asignación activa por zona; un trigger
  `BEFORE INSERT` cierra automáticamente la asignación previa al
  insertar una nueva (mismo patrón de versionado que
  `product_tax_profiles`, ver abajo).
- `sellers`: catálogo real de vendedores del negocio (código de
  representante, nombre, zona), **deliberadamente desacoplado de
  `auth.users`** — `user_id` es nullable porque un vendedor puede
  existir en el catálogo antes de tener cuenta en la app. Se completa
  en Fase 4 cuando el vendedor se registre.
  - **Pendiente:** `zone_assignments.vendedor` es `uuid not null
    references auth.users(id)`, así que no se puede poblar desde
    `sellers` mientras `user_id` sea `NULL` (que es el caso de todo el
    seed inicial). Cuando en Fase 4 se complete `sellers.user_id`, un
    `INSERT ... SELECT zone_id, user_id FROM pedidos.sellers WHERE
    user_id IS NOT NULL` puebla `zone_assignments` trivialmente. Hasta
    entonces, la fuente de verdad de "qué zona tiene cada vendedor" es
    `sellers.zone_id`, no `zone_assignments`.
- `zone_assignment_participants`: caso **excepcional** de 2+ vendedores
  compartiendo cuota/comisión en una misma zona. Tabla separada, no
  reemplaza a `zone_assignments` — se usa solo cuando existe ese acuerdo
  puntual. Guarda `porcentaje_participacion`, vigencia y
  `usuario_autorizo`. Un trigger valida que la suma de porcentajes
  activos por zona no supere 100%.
- `pedidos.current_user_zone_ids()`: función `security definer` que
  resuelve las zonas del vendedor autenticado combinando ambas tablas
  (titular + participante). Es la base de las políticas RLS de
  `customers`/`customer_addresses`/`customer_contacts` para el rol
  `vendedor`.

## Clientes

- `customers`: incluye el flujo de "cliente nuevo" — un vendedor solo
  puede insertar en `estado = 'PENDIENTE_DE_VALIDACION'`
  (`ruc_o_documento`, `razon_social`, etc.); no tiene policy de
  `UPDATE`, así que no puede editar lo creado ni aprobarlo él mismo.
  Solo `control_pedidos` o `administrador` pueden hacer `UPDATE`
  (incluye aprobar → `ACTIVO` o rechazar → `RECHAZADO`).
- `customer_addresses`, `customer_contacts`: múltiples por cliente,
  visibilidad y escritura heredan la regla del cliente padre (zona para
  vendedor, control_pedidos/admin para aprobación).

Columnas agregadas más allá de lo pedido explícitamente en el PRD:
`solicitado_por`, `validado_por`, `fecha_validacion` — necesarias para
que el flujo de aprobación (quién pidió, quién aprobó, cuándo) sea
rastreable. Ver resumen de supuestos.

## Carga de la cartera real de clientes (`0041`)

La cartera real (3.399 clientes) se migró del sistema del piloto de
WhatsApp. El dato real obligó a extender el modelo de Fase 2:

### Columnas nuevas en `customers`

- **`vendedor_id`** (FK a `sellers`) — el vendedor titular del cliente.
  No se puede derivar de `zona_id`: en el dato real hay clientes
  atendidos por un vendedor distinto al titular de su zona (venían con
  `vendedor_manual_id` en el origen). La RLS de lectura sigue siendo por
  zona (`customers_select`), no por esta columna — agregarla no cambió
  quién ve a quién.
- **`zona_asignada_manualmente`** (boolean) — preserva el flag
  `zona_manual` del origen: la zona se fijó a mano y no se derivó del
  código de zona del vendedor. Informativo para Control de Pedidos.
- **`distrito` / `provincia` / `departamento`** — geografía referencial,
  deliberadamente en `customers` y **no** en `customer_addresses`: el
  origen no trae dirección ni ubigeo (0 de 3.399 filas) y
  `customer_addresses.direccion` es `not null`. Esta geografía **no**
  habilita un pedido; para eso hace falta una `customer_addresses` real.

### Constraint `customers_boleta_only_sin_ruc_valido`

Un documento que no es RUC de contribuyente obliga a
`tipo_comprobante_permitido = 'BOLETA'`. Va como CHECK y no como
validación de servicio a propósito: **tiene que sobrevivir a que Control
de Pedidos apruebe al cliente**. Aprobar no habilita factura; lo único
que la habilita es corregir `ruc_o_documento` a un RUC real, y ahí el
constraint deja de aplicar por sí solo. Espejo en TS:
`domain/customers.ts` (`esRucContribuyenteValido`).

La condición es `btrim(ruc_o_documento) ~ '^(10|15|17|20)[0-9]{9}$'`.
Dos detalles que importan:

- **Exige el RUC completo, no solo el prefijo.** `'20123'` y
  `'2099999999'` empiezan bien y no son RUC. Una versión anterior
  chequeaba solo los dos primeros caracteres y los dejaba pasar como
  FACTURA.
- **`btrim`** para que un espacio accidental alrededor de un RUC legítimo
  no lo degrade a BOLETA.

El regex de TS (`RUC_CONTRIBUYENTE` en `domain/customers.ts`) es idéntico
a propósito: si TS fuera más permisivo que SQL, el importador intentaría
grabar `FACTURA` en filas que la BD rechaza.

#### Por qué la migración normaliza los datos antes de crear el constraint

Un CHECK se valida contra la tabla entera al crearse. Como
`tipo_comprobante_permitido` tiene default `'FACTURA'`, **cualquier**
cliente preexistente con documento no-RUC hace fallar el `ALTER` con
`check constraint ... is violated by some row`. Y eso ocurre en cuanto
existe un solo cliente creado desde el flujo de "cliente nuevo" de la
app, que acepta cualquier string como documento — no hace falta ningún
dato raro sembrado. La primera versión de `0041` no lo contemplaba y falló
al aplicarse en producción.

Por eso `0041` primero hace `update ... set tipo_comprobante_permitido =
'BOLETA'` sobre las filas que no cumplen, y después agrega el constraint.
Se eligió eso y **no** un `NOT VALID`: la regla de negocio dice que sin
RUC válido el cliente va a BOLETA, así que aplicarla al dato viejo *es* la
regla, no una excepción. Un `NOT VALID` dejaría filas permanentemente en
contra de la regla y haría fallar cualquier `VALIDATE CONSTRAINT` futuro.
La migración emite un `NOTICE` con cuántas filas corrigió.

`0041` es re-ejecutable (`add column if not exists`, `create table if not
exists`, `drop policy if exists` antes de cada `create policy`, y el
constraint guardado por `pg_constraint`), porque un intento fallido y un
reintento son el caso normal al aplicar a mano.

### Tablas nuevas

- **`customer_seller_reassignments`** — historial de cambios de cartera
  (`vendedor_anterior_id`, `vendedor_nuevo_id`, `fecha_reasignacion`,
  `fuente`). Visibilidad heredada del cliente padre; escritura solo
  `control_pedidos`/`administrador`. `fuente = 'migracion_piloto'` marca
  lo migrado, para que reimportar lo reemplace sin tocar lo registrado
  desde la app (`fuente = 'app'`).
- **`legacy_vendor_snapshots`** — snapshot histórico de cartera del
  sistema de cobranzas (`ruc`, `vendedor_id_snapshot`, `fuente`,
  `fecha_carga`). Solo referencia: **no** define el vendedor actual de
  nadie y ningún flujo del sistema lo consulta. Sin FK a `customers` a
  propósito (guarda el `ruc` tal como vino) y sin policy de
  `INSERT`/`UPDATE`/`DELETE` para `authenticated` — se carga una única
  vez con la service role key y desde la app es de solo lectura.

### Importador (`services/customers-import.ts`)

Mismo patrón que el de listas de precios: preview → confirmación →
publicación, con reporte de filas rechazadas. Se eligió importador por
sobre un seed SQL versionado porque son 3.399 razones sociales y 456
celulares — PII que no debe quedar en el historial de git.

Recibe dos CSV: clientes y vendedores. Del de vendedores lee
**únicamente** `id` y `codigo`, para traducir el uuid del sistema de
origen al `codigo_representante`; el archivo de origen trae además una
columna `token_acceso` con tokens en claro que se descarta y nunca se
persiste (ver `buildLegacyVendorMap` en `domain/customer-import.ts`).

Es idempotente: los clientes se upsertan por `ruc_o_documento`, y el
historial migrado y el snapshot legacy se reemplazan en vez de
acumularse. Usa la service role key porque crea clientes en `ACTIVO`,
algo que ninguna policy de RLS permite — queda registrado en
`audit_logs` con el actor real (`importar_cartera_clientes`).

El origen no trae condición de pago ni canal, y cada caso se resolvió
distinto porque las consecuencias de dejarlos en null son distintas:

- **`condicion_pago_habitual_id` queda en `null`** para los 3.399. La
  columna ya era nullable desde `0012`, así que no hizo falta ni cambio de
  schema ni un valor centinela tipo `SIN_DEFINIR` — que además habría
  contaminado el catálogo `payment_terms` con una fila que no es una
  condición de pago real. El vendedor elige la condición al armar cada
  pedido. Para que eso no dispare excepción administrativa, ver `0043`
  más abajo.
- **`canal_id` se asigna a `Horizontal`** para los 3.399, como supuesto
  temporal explícito. Acá null no era opción: `submit_order` (`0036`)
  aborta con "El cliente no tiene canal de venta asignado; no se puede
  calcular precio", porque el precio se busca por canal en
  `price_list_items`. Sin este default la cartera entera quedaría
  inoperativa. Se corrige cliente por cliente cuando el negocio entregue
  la clasificación real.

### `0043` — condición habitual en null no es excepción administrativa

La bifurcación automática dispara `ADMINISTRATIVE_EXCEPTION` cuando la
condición del pedido difiere de la habitual del cliente. Con la habitual
en null no hay nada que comparar, así que cualquier condición que elija
el vendedor debe pasar.

Ojo con la asimetría entre las dos implementaciones, que es la razón por
la que esta migración existe:

- En **SQL**, `payment_terms_id <> NULL` evalúa a `NULL`, y un `elsif`
  trata `NULL` como falso — así que el comportamiento correcto ya
  ocurría, pero **por accidente** de la lógica ternaria de Postgres, no
  porque estuviera escrito. Cualquiera que envuelva la condición en un
  `coalesce`, la niegue, o la mueva a un `CASE` la rompe sin notarlo.
  `0043` reemplaza `submit_order` y `reevaluate_order` con la condición
  explícita (`is not null and <>`). No cambia el comportamiento; lo hace
  intencional.
- En **TypeScript** sí estaba mal: `5 !== null` es `true`, así que
  `computeAutomaticValidationOutcome` devolvía `ADMINISTRATIVE_EXCEPTION`
  y **divergía del servidor**. Corregido en `domain/orders.ts`.

Es un buen recordatorio de por qué el archivo de dominio dice que si SQL
y TS divergen, gana SQL.

## Productos y tratamiento tributario

- `products`: datos del producto. **No** incluye ningún campo de
  tratamiento tributario.
- `product_tax_profiles`: el tratamiento tributario vive acá,
  versionado por `vigente_desde`/`vigente_hasta`. Un índice único
  parcial permite un solo perfil activo por producto; un trigger
  `BEFORE INSERT` cierra el perfil anterior el día antes de que empiece
  el nuevo. **Nunca se borra un registro histórico** — insertar un
  nuevo perfil solo le pone fecha de fin al anterior.
- `tax_configurations`: parámetros tributarios **generales** del
  sistema (ej. tasa de IGV vigente), también versionados por fecha,
  pero **no ligados a un producto**. La diferencia con
  `product_tax_profiles`:
  - `product_tax_profiles` responde "¿este producto está gravado o
    inafecto, y a qué tasa?" — es una decisión por producto.
  - `tax_configurations` responde "¿cuál es la tasa de IGV vigente hoy
    en el Perú?" — es un parámetro del sistema tributario en general,
    independiente de cualquier producto puntual. Un producto `GRAVADO`
    normalmente usa la tasa de `tax_configurations` como su
    `tasa_aplicable`, pero el dato queda copiado en el perfil del
    producto al momento de crearlo (no se resuelve en vivo desde
    `tax_configurations` en cada consulta).

Seed: producto de ejemplo `Dapha 10` (`codigo_interno = 'DAPHA10-EJ'`)
como `INAFECTO`, asociado a Diphasac. Ver supuestos. **Superado por
datos reales**: al importar la lista real de Diphasac, el "Dapha 10"
real llega con su propio código (`DHP106`) como un producto distinto —
el placeholder `DAPHA10-EJ` queda huérfano y se desactiva (ver
importador de listas de precios, abajo).

## Importador de listas de precios (Excel de proveedor)

Sección 8 del PRD. Flujo de 3 pasos: **preview** (parsea el Excel,
valida, no toca la base) → **validación** (se muestra al admin) →
**publicar** (solo tras confirmación explícita, escribe todo en una
transacción). El parser en sí es dominio puro
(`domain/price-list-import.ts`, sin dependencia de Excel ni de
Supabase) — lee el archivo `services/price-lists.ts` con `exceljs`.

### Tablas nuevas

- `price_lists`: una fila por **importación/publicación** de un
  proveedor (no una por canal — el Excel trae los 6 canales en un solo
  archivo). Versionado igual que `product_tax_profiles`: un índice
  único parcial permite solo una lista activa (`fecha_fin is null`) por
  proveedor, y un trigger `BEFORE INSERT` cierra la anterior al
  publicar una nueva. Reimportar el mismo proveedor **nunca sobrescribe**
  — crea una versión nueva. Guarda `archivo_nombre` y
  `archivo_storage_path` (bucket privado `price-lists` en Supabase
  Storage, accedido solo desde el cliente admin server-side — sin
  policies de `storage.objects` porque no hay acceso directo desde el
  navegador) e `importado_por`.
- `price_list_items`: precio por `(product_id, sales_channel_id)`,
  versionado **por sí mismo** (`vigente_desde`/`vigente_hasta`, mismo
  patrón que `product_tax_profiles`) y no solo por pertenecer a una
  `price_lists`. `price_list_id` es **nullable**: una corrección puntual
  de precio (pantalla de detalle de producto, ver más abajo) inserta
  una fila con `price_list_id = null` — no viene de una reimportación,
  pero igual queda versionada como cualquier otra: el trigger cierra
  automáticamente la fila vigente anterior para ese producto+canal.
  Esto se agregó al construir la pantalla de detalle de producto: con
  el diseño original (versionado solo a nivel de `price_lists`), una
  corrección de un solo canal de un solo producto habría forzado a
  cerrar la lista completa del proveedor, afectando a todos los demás
  productos de esa lista sin necesidad.
- `pedidos.publish_price_list(...)`: función `SECURITY INVOKER` (no
  definer) que hace todo el publish —upsert de products, insert
  versionado de product_tax_profiles, insert de price_list_items— en
  una sola transacción de Postgres. Al ser invoker, las políticas RLS
  de administrador de cada tabla se siguen aplicando normalmente; no
  duplica ese chequeo.

### Columnas nuevas en `products` / `product_tax_profiles`

- `products.codigo_bonificacion`: viene del Excel ("CÓDIGO
  BONIFICACIÓN"); se guarda desde ya aunque no se usa todavía
  (promociones/bonificaciones son un paso posterior).
- `products.principio_activo`: "PRINCIPIO ACTIVO" (Diphasac/Biosana) o
  "COMPOSICIÓN" (Prades) — mismo campo conceptual, misma columna.
- `product_tax_profiles.vvf_sin_igv` / `.vvd_sin_igv`: costo de
  referencia del proveedor, no precio de venta.
- `product_tax_profiles.costo_referencial_distribuidora`: columna "PVF
  A DISTRIBUIDORA" del Excel. **Nunca es un price_list_item** — es
  costo de referencia interno, no un precio de venta a ningún canal.
  Vive versionada junto al resto del perfil tributario porque cambia
  con cada reimportación, igual que la tasa.
- `product_tax_profiles.fecha_vigencia_proveedor`: columna "FECHA V."
  del Excel, guardada tal cual la entrega el proveedor. Ver el supuesto
  explícito en [business-rules.md](business-rules.md) — no se asume
  que sea vencimiento de lote físico.

### Mapeo de columnas de canal → `sales_channels`

| Columna Excel | Canal(es) |
|---|---|
| PVF INSTITUCIONES | Clínicas |
| PVF SUBDISTRIB. | Subdistribuidores |
| PVF MINICADENAS | Minicadenas |
| PVF MAYORISTA/TOP | Mayorista **y** Tops (mismo valor, dos `price_list_items`) |
| PVF FARMA | Horizontal |

### Tratamiento tributario al importar

Si VVF e IGV vienen vacíos/"-" → `INAFECTO`, tasa 0. Si tienen valor →
`GRAVADO`, tasa = la vigente en `pedidos.tax_configurations` (no un
número fijo por fila) — reutiliza el parámetro sembrado en Fase 2, el
vendedor nunca elige esto.

### Validación: qué se omite al publicar y qué no

- **Error → se omite esa fila, el resto del archivo se publica
  igual**: fila sin CÓDIGO LOGISALUD; CÓDIGO LOGISALUD duplicado
  dentro del mismo archivo (se excluyen ambas filas del duplicado — no
  se adivina cuál es la correcta); fila con código pero **sin
  descripción de producto** (`MISSING_DESCRIPTION`); código o
  descripción que viene envuelto entre paréntesis, típico de una
  nota/aclaración (`SUSPICIOUS_NOTE`). El admin ve estas filas marcadas
  en el preview antes de confirmar publicar; no hace falta arreglar el
  Excel para poder cargar el resto de un catálogo válido. Se puede
  reimportar más adelante (nueva versión) una vez corregidas.
  - Encontrado con datos reales: el Excel de Biosana traía una fila con
    código `BSA326` pero sin descripción (un SKU sin datos completos) y
    una fila de leyenda ("LEYENDA: VVF= Valor de Venta Farmacia") cuyo
    texto cayó justo en la columna de código — ambas se colaban como
    "productos" con nombre vacío antes de este refuerzo. Ver
    business-rules.md.
- **No se omite** (advertencia, se muestra igual): precio vacío, en
  cero o "-" en una columna de canal → se guarda como "sin precio para
  ese canal", no como error.
- Filas de encabezado de sección (solo texto en la primera columna, el
  resto vacío) se omiten silenciosamente — no son producto ni error.

## Pantalla de detalle de producto y corrección puntual de precio

`/admin/maestros/productos/[id]` muestra, por producto: precios
vigentes por canal, costo de referencia (VVF/VVD/costo referencial
distribuidora), afectación tributaria, y el historial completo de
versiones de precio (agrupado en "vigentes" vs. "histórico", con el
origen de cada fila — "Importación" si tiene `price_list_id`,
"Corrección puntual" si no). También permite editar descripción,
presentación y flags de lote/vencimiento, y hacer una corrección
puntual de precio de un canal específico.

La corrección puntual **no** es el flujo normal (que sigue siendo
reimportar el Excel del proveedor) — la UI lo deja explícito. Técnica
y semánticamente usa el mismo mecanismo de versionado que el
importador: inserta una fila nueva en `price_list_items`, el trigger
cierra la anterior, nunca se sobrescribe ni se borra historial.

## Snapshot histórico

`orders` guarda `razon_social_snapshot`/`direccion_snapshot`/
`ubigeo_snapshot`/`canal_snapshot`/`zona_snapshot`/`vendedor_snapshot`,
copiados (no referenciados en vivo) en el momento exacto del envío
(`pedidos.submit_order()`, 0036). `order_items` copia
`precio_unitario`/`afectacion_tributaria`/`tasa_igv` de la misma forma.
Esto es intencional: un cambio posterior en customers/products/
product_tax_profiles/sellers/zones (p.ej. el cliente cambia de zona, o
un producto pasa de `INAFECTO` a `GRAVADO`) **no altera pedidos ya
enviados**. Los maestros son la fuente de verdad para pedidos *nuevos*
o para pedidos que siguen en `DRAFT`; un pedido `SUBMITTED` en adelante
lleva su propia copia congelada.

## Fase 4 — Pedidos

Ver [workflows.md](workflows.md) para el diagrama de estados completo
y [business-rules.md](business-rules.md) para las decisiones de
negocio (trigger de `ADMINISTRATIVE_EXCEPTION`, seller "sin vendedor",
sellers de prueba). Resumen técnico:

- **`orders`/`order_items`** (0033): `orders.estado` nunca se edita con
  un `UPDATE` directo — la policy `orders_update_draft` solo permite
  escribir mientras el pedido sigue en `DRAFT` (su propio `WITH CHECK`
  exige que la fila nueva también quede en `DRAFT`, así que ningún
  cliente puede sacar un pedido de `DRAFT` por su cuenta). La única
  forma de avanzar de estado es `pedidos.apply_order_transition()`
  (0036), `SECURITY DEFINER` con su propia verificación de rol/
  pertenencia — necesaria porque escribe a través de una frontera que
  el RLS de cliente no puede cruzar.
- **`order_status_history`/`order_observations`** (0034): historial de
  transiciones y comentarios libres. Sin policy de `INSERT` para
  `authenticated` en `order_status_history` — solo escribe
  `apply_order_transition()`.
- **`approval_requests`/`approval_decisions`** (0035): solicitudes de
  descuento y sus decisiones (aprobar/rechazar/aprobar otro precio/
  solicitar info). El estado de una solicitud (`PENDIENTE`→`RESUELTO`)
  solo lo cambia `pedidos.decide_approval_request()` (0036).
- **`pedidos.current_seller_id()`** (0032): resuelve el `seller_id` del
  usuario autenticado (`sellers.user_id = auth.uid()`). Particiona
  `orders`/`order_items` por vendedor **directo**, no por zona —
  `zone_assignments` (base del RLS de `customers`) sigue sin
  sincronizarse con `sellers.user_id` (ver "Pendiente" en la sección de
  zonas), así que depender de esa tabla para pedidos habría heredado el
  mismo desfase.
- **Recalculado de precios server-side, sin excepciones.**
  `pedidos.submit_order()` no acepta ningún precio como parámetro: los
  busca ella misma en `price_list_items`/`product_tax_profiles`
  vigentes, en el momento exacto de `DRAFT → SUBMITTED`, y nunca vuelve
  a tocarlos después (la reevaluación tras una excepción resuelta usa
  `pedidos.reevaluate_order()`, que solo re-decide la bifurcación).

## Notificación de pedidos (`0044`)

### `orders.numero`

Correlativo global legible, `bigint generated always as identity`. Se
agregó porque `orders` solo se identificaba por uuid, y un uuid no sirve
como referencia en el asunto de un correo ni para que Operaciones hable
del pedido por teléfono.

Dos detalles del `add column`:
- `generated always as identity` **numera también las filas existentes**
  al aplicar la migración, así que no hizo falta backfill aparte.
- Es `always` y no `by default`: el número lo asigna la BD, nunca el
  caller.

Se asigna al **crear** el pedido, no al enviarlo — así el número es
estable desde el borrador. Consecuencia aceptada: la numeración tiene
huecos cuando un borrador se abandona.

### `order_notification_recipients`

`id`, `email`, `nombre_referencial`, `activo`, `fecha_creacion`.

- Unique sobre `lower(email)`, no sobre `email`: el mismo buzón en
  distinta capitalización mandaría el correo dos veces.
- Índice parcial sobre `activo where activo` — la consulta del envío solo
  busca activos.
- Check de forma del email (`~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'`) como red
  mínima. La validación real la hace el proveedor al intentar entregar;
  no se pretende validar RFC 5322 con un constraint.
- RLS: policy `for all` solo para `administrador`. Sin lectura para otros
  roles.

### `notification_logs`

`order_id`, `tipo`, `estado` (`enviado` / `fallido` / `sin_destinatarios`),
`destinatarios text[]`, `proveedor`, `proveedor_message_id`,
`error_mensaje`, `created_at`.

`order_id` es `on delete set null`: si un pedido se borrara, el registro
de que se intentó notificar sigue siendo información útil.

RLS: `select` solo para `administrador`. **No hay policy de escritura**
para `authenticated` — el servicio escribe con la service role key,
porque si registrar un fallo de envío dependiera de una policy, el
registro del fallo podría fallar.

Ver `docs/architecture.md` para el proveedor de correo, las variables de
entorno y por qué el correo nunca bloquea el envío del pedido.

## Empresa emisora (`0049`)

### `company_settings` — singleton

Datos legales de **quien emite** los comprobantes y las guías: razón
social, RUC, dirección del domicilio fiscal, ubigeo, teléfono y email.

No cambian por cliente ni por pedido, así que no tienen por qué vivir en
cada documento: **alimentan los campos de EMISOR** del JSON de
documentación electrónica. El destinatario sale de `customers`.

Es un singleton de verdad: `id smallint primary key default 1 check (id =
1)`. Eso impide que aparezca una segunda fila y que el código tenga que
decidir "cuál de las dos es la buena".

RLS: lectura para cualquier autenticado — son datos que van impresos en
cada comprobante, no hay nada que ocultar, y la pantalla de
administración los necesita. Escritura solo `administrador`, desde
`/admin/configuracion/empresa`.

El `ubigeo_codigo` del emisor se sembró como `150119` (Lurín) **por
inferencia**: la dirección fiscal es la misma del Almacén Central Lima,
cuyo ubigeo está confirmado. Es editable desde la pantalla si el
domicilio fiscal difiere.

### `warehouses.direccion` y `warehouses.ubigeo_codigo`

`0045` creó `warehouses` con solo nombre y descripción, y el borrador de
guía venía advirtiendo "el almacén no tiene dirección". `0049` agrega las
dos columnas y carga el dato real confirmado del **Almacén Central
Lima**:

- `direccion`: `CAR. PANAMERICANA SUR KM.29.5 INT.A-08`
- `ubigeo_codigo`: `150119` (Lima - Lima - Lurín)

Los demás almacenes quedan en null **a propósito**: el borrador de guía
los sigue advirtiendo hasta que se confirme su dato real, en vez de
inventar una dirección.

El ubigeo es el código INEI de 6 dígitos (departamento + provincia +
distrito) y la guía lo exige como punto de partida.

## Índices de búsqueda de clientes (`0050`)

El selector de cliente del flujo de pedido busca con
`ilike '%término%'` sobre `razon_social`, `nombre_comercial` y
`ruc_o_documento`. Un patrón que **empieza** con comodín no puede usar un
btree, así que `0050` agrega tres índices GIN de `pg_trgm`:

- `customers_razon_social_trgm_idx`
- `customers_nombre_comercial_trgm_idx`
- `customers_ruc_o_documento_trgm_idx`

`pg_trgm` parte el texto en trigramas e indexa esos, que es la única forma
de que un `ilike` con comodín adelante use índice. Verificado con `explain`
sobre la cartera real: `Bitmap Index Scan on
customers_razon_social_trgm_idx` en vez del seq scan anterior.

El filtro por `estado = 'ACTIVO'` que acompaña cada búsqueda ya lo cubre
`customers_estado_idx` (`0012`).

**Por qué importa el detalle del tope:** la búsqueda tiene que correr en el
servidor porque PostgREST tope las respuestas en 1.000 filas, y precargar
la cartera al navegador dejaba 2.248 de los 3.248 clientes activos fuera
del alcance del buscador — sin error visible. Ver "Búsqueda de clientes en
el flujo de pedido" en [business-rules.md](business-rules.md).

## Auditoría

Todo cambio en `customers` y en `product_tax_profiles` queda en
`pedidos.audit_logs` vía trigger (`pedidos.audit_row_change()`,
generalización de `pedidos.audit_user_roles_change` de Fase 1) — no
depende de que el código de aplicación recuerde llamar a `logAudit()`.
El resto de maestros (canales, proveedores, zonas, condiciones de pago,
`products`) se audita desde la capa de servicio
(`services/catalog.ts`, `services/products.ts`) siguiendo el patrón por
defecto descrito en [architecture.md](architecture.md). Pedidos (Fase
4) sigue el mismo patrón explícito de servicio — ver business-rules.md
para por qué no se usó un trigger genérico ahí.

## RLS — resumen por rol

| Tabla | vendedor | control_pedidos | operaciones / aprobador_comercial | administrador |
|---|---|---|---|---|
| sales_channels, suppliers, zones, payment_terms, products, product_tax_profiles, tax_configurations | lectura | lectura | lectura | lectura + escritura |
| zone_assignments, zone_assignment_participants | lectura de las propias | lectura de todas | lectura de todas | lectura + escritura |
| customers, customer_addresses, customer_contacts | lectura scoped a zona; insert solo `PENDIENTE_DE_VALIDACION` | lectura + escritura (aprueba/rechaza) | lectura | lectura + escritura |
| price_lists, price_list_items | lectura | lectura | lectura | lectura + escritura (única forma de publicar) |
| orders, order_items, order_status_history, order_observations | lectura/escritura scoped a `seller_id` propio, solo en `DRAFT` | lectura de todas; decide `ADMINISTRATIVE_EXCEPTION` | aprobador_comercial: lectura de todas, decide `COMMERCIAL_EXCEPTION`; operaciones: lectura solo de `READY_FOR_OPERATIONS` | lectura + escritura de todas, cualquier transición |
| approval_requests, approval_decisions | crea/lee las de sus propios pedidos | — | aprobador_comercial: lectura + decide todas | lectura + escritura de todas |

## Supuestos tomados por falta de dato exacto en el PRD

Ver también [business-rules.md](business-rules.md).

1. **`customers`**: se agregaron `solicitado_por`, `validado_por`,
   `fecha_validacion` — el PRD no listaba estas columnas, pero el flujo
   de aprobación (punto g) no es implementable de forma auditable sin
   ellas.
2. **Producto de ejemplo "Dapha 10"**: el PRD no especificó proveedor ni
   código interno. Se asumió proveedor `Diphasac` (por ser el primero
   listado) y código `DAPHA10-EJ` como placeholder — **a confirmar**
   antes de usarse como dato real.
3. **`tax_configurations` (IGV)**: se sembró un registro `IGV = 18.00`
   vigente desde `2024-01-01` como fecha de referencia razonable, no
   como fuente oficial confirmada — **a confirmar con Contabilidad**
   (ver business-rules.md, Fase 6).
4. **Pantalla de asignación de zonas** (`zone_assignments`/
   `zone_assignment_participants`): el PRD no pidió explícitamente una
   pantalla para esto en el punto 3 (CRUD administrativo); se dejó el
   modelo y RLS completos, pero la asignación se gestiona por ahora vía
   SQL/dashboard de Supabase hasta que se priorice una pantalla
   dedicada.
5. **Vendedor: pantalla de toma de pedido construida en Fase 4**
   (`/pedidos/*`). La solicitud de cliente/dirección nueva sigue sin
   pantalla propia de vendedor — solo existe a nivel de RLS, pendiente
   para una fase posterior.
6. **Códigos LOGISALUD duplicados dentro de un mismo archivo se tratan
   como error** (no advertencia) y **se excluyen esas filas de la
   publicación** — no se adivina cuál de las dos vale, y el resto del
   archivo se publica igual. Descubierto con datos reales: el Excel de
   Diphasac traía 3 códigos duplicados (6 filas); bloquear el archivo
   completo por eso habría dejado afuera ~90 productos válidos sin
   necesidad. El admin ve las filas marcadas en el preview y decide si
   corrige el Excel y reimporta después.
7. **"OBS." y "MASTER PACK"** del Excel de proveedor no se guardan —
   no fueron pedidos explícitamente. Si se necesitan más adelante, es
   una columna nueva en `products`, no un rediseño.
8. **`price_lists.fecha_inicio`** siempre es la fecha de publicación
   (hoy), no algo que el admin pueda elegir todavía — mantiene la
   pantalla simple; adelantar/atrasar vigencia manualmente queda para
   cuando se necesite.
