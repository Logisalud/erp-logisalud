# Reglas de negocio — erp-logisalud-pedidos

Este documento existe para que las decisiones y supuestos de negocio no
vivan solo en la cabeza de quien las tomó. En Fase 1 no hay lógica de
pedidos todavía; lo de abajo son **supuestos documentados pendientes de
validar**, no reglas ya implementadas.

## Roles del módulo

| Rol | Responsabilidad |
|---|---|
| `vendedor` | Toma el pedido, principalmente desde celular en campo. |
| `control_pedidos` | Valida el pedido antes de la aprobación comercial. |
| `aprobador_comercial` | Aprueba condiciones comerciales (precio, crédito, promoción). |
| `operaciones` | Confirma despacho y asigna la fuente de stock. |
| `administrador` | Gestiona usuarios, roles y configuración del módulo. |

## Supuestos pendientes de validar (Fase 6)

Estos tres puntos están anotados aquí para que no se pierdan entre
fases, y para que cualquier implementación de negocio posterior los
trate como "a confirmar", no como reglas cerradas:

1. **Tratamiento tributario de unidades bonificadas.** El supuesto de
   trabajo por defecto (a confirmar con Contabilidad) es que las
   unidades bonificadas siguen el tratamiento tributario estándar del
   comprobante; no se ha validado con Contabilidad ningún caso especial
   (IGV, valor referencial, etc.). **No implementar lógica tributaria
   de bonificaciones sin esa confirmación.**

   **Contrastar con Contabilidad si la bonificación debería ser inafecta
   como regla general, o si estos 2 casos son simplemente un error de
   captura en NubeFact — de 207 códigos de bonificación en su catálogo,
   solo estos 2 aparecen como inafectos, sin patrón claro.**

   Los dos casos son `BODHP109` (JAMOL 5) y `BODHP110` (GLICOFAST 1000).
   Decisión del usuario (2026-08-14): se tratan como **posible error de
   carga en NubeFact, no como regla**. `0052` aplica lo que dice el
   catálogo porque es la fuente de verdad acordada, pero eso no zanja la
   pregunta de fondo.

2. **Umbral de retención evaluado por comprobante, no por pedido
   total.** El supuesto de trabajo es que la retención se calcula por
   cada comprobante emitido, no sobre la suma de un pedido que genere
   varios comprobantes. Esto afecta directamente el diseño de
   NubeFact/retenciones en fases posteriores y debe confirmarse con
   Contabilidad antes de fijar el cálculo.

3. **Asignación de fuente de stock.** La decisión de qué almacén/lote
   surte un pedido la toma **Operaciones al confirmar el despacho**,
   no el vendedor al momento de tomar el pedido. Esto implica que el
   modelo de datos de pedido debe permitir un estado "pendiente de
   asignación de stock" entre la aprobación comercial y el despacho.

## Fase 2 — Maestros

### Flujo de cliente nuevo

Un vendedor puede solicitar un cliente nuevo; el registro se crea en
`estado = PENDIENTE_DE_VALIDACION` y **no es utilizable en pedidos**
(la app de pedidos, Fase 4, deberá verificar `estado = ACTIVO` antes de
permitir usarlo — ver `domain/customers.ts`). Solo `control_pedidos` o
`administrador` pueden aprobar (→ `ACTIVO`) o rechazar
(→ `RECHAZADO`); el vendedor no puede editar ni autoaprobar su propia
solicitud. Ver [data-model.md](data-model.md) para el detalle de RLS.

### Zonas compartidas (caso excepcional)

El caso normal es 1 zona = 1 vendedor. Cuando 2+ vendedores comparten
cuota/comisión de una zona (excepción, no la regla), se registra en
`zone_assignment_participants` con su porcentaje de participación y
quién autorizó el acuerdo — nunca reemplaza la asignación normal en
`zone_assignments`, es información adicional.

### Tratamiento tributario de productos

Vive versionado en `product_tax_profiles`, nunca como campo simple en
`products` ni como algo que el vendedor pueda elegir al tomar un
pedido. Cambiar el tratamiento tributario de un producto no borra el
registro anterior — queda con `vigente_hasta` puesto, para que pedidos
pasados conserven el tratamiento que tenían al momento de crearse (ver
sección de snapshot histórico en data-model.md).

### Supuestos de Fase 2 pendientes de confirmar

- **Tasa de IGV sembrada (18%, vigente desde 2024-01-01)**: fecha de
  referencia razonable, no una fuente oficial confirmada — a validar
  con Contabilidad junto con los supuestos de Fase 6 de arriba.
- **Proveedor y código del producto de ejemplo "Dapha 10"**: el PRD no
  los especificó; se asumió Diphasac y un código placeholder
  (`DAPHA10-EJ`). No usar como dato de producción sin confirmar.

## Importador de listas de precios (sección 8 del PRD)

Ver [data-model.md](data-model.md) para el detalle técnico completo
(tablas, mapeo de columnas, función de publish). Acá solo las
decisiones de negocio:

- **"PVF A DISTRIBUIDORA" no es un precio de venta a ningún canal.**
  Es costo de referencia interno del proveedor hacia LOGISALUD como
  distribuidora. Guardarlo como `price_list_items` habría sido tratarlo
  como un precio de venta a cliente, que no es — por eso vive en
  `product_tax_profiles.costo_referencial_distribuidora`.

- **"FECHA V." se reinterpreta como vigencia del precio en la lista,
  no vencimiento de lote físico.** Es un supuesto explícito, **a
  confirmar con el proveedor/comercial**: el nombre de la columna en el
  Excel es ambiguo, y el vencimiento de lote real es responsabilidad de
  Operaciones con lotes físicos en Fase 5 — no debe confundirse ni
  mezclarse con esta fecha del maestro de productos.

- **PVF MAYORISTA/TOP alimenta dos canales (Mayorista y Tops) con el
  mismo precio.** Confirmado por el negocio, no una suposición — ambos
  canales comparten tarifa en la lista del proveedor.

- **Códigos LOGISALUD duplicados dentro de un archivo excluyen esas
  filas específicas de la publicación** (no se adivina cuál de las dos
  versiones es la correcta), pero **no bloquean el resto del
  archivo** — un catálogo de 95 productos con 3 códigos duplicados
  publica los 92 restantes. Ver supuesto #6 en data-model.md.

- **El producto de ejemplo "Dapha 10" (`DAPHA10-EJ`) sembrado en Fase 2
  queda obsoleto** en cuanto se importa la lista real de Diphasac (que
  trae su propio "Dapha 10" con código real `DHP106`, un producto
  distinto). Se desactiva el placeholder al hacer la importación real
  para no tener dos "Dapha 10" activos a la vez.

- **2 filas basura se colaron al catálogo real por validación
  insuficiente** (código presente pero sin descripción de producto) —
  ambas en el Excel de Biosana: `BSA326` (SKU sin descripción cargada
  en el Excel del proveedor) y una fila de leyenda ("LEYENDA: VVF=
  Valor de Venta Farmacia") cuyo texto cayó en la columna de código.
  Se borraron del catálogo (`products`, `product_tax_profiles` en
  cascada, `price_list_items` si tenían) y el importador ahora exige
  descripción de producto real, no solo código — ver data-model.md.

## Pantalla de detalle de producto

- **"Sin precio en ningún canal" es una advertencia visible en la
  lista general de productos**, no algo que solo se vea al entrar al
  detalle — para poder detectar huecos de precios de un vistazo sin
  tener que abrir cada producto.
- **La corrección puntual de precio es explícitamente para errores
  puntuales, no el flujo normal.** El flujo normal para actualizar
  precios sigue siendo reimportar el Excel del proveedor en Listas de
  precios — la UI lo deja dicho para no generar confusión sobre cuál
  es el camino correcto.

## Precios: las listas de canal YA INCLUYEN IGV

**Confirmado por el usuario el 2026-08-13.** Los precios de las listas
importadas —PVF Farma/Horizontal, PVF Mayorista/Top, PVF
Instituciones/Clínicas, PVF Subdistribuidores, PVF Minicadenas— son
**precio final al público**, no base imponible.

Por lo tanto, para un producto GRAVADO:

```
total    = cantidad × precio_unitario          (NO se multiplica por 1.18)
subtotal = total / (1 + tasa/100)              (base imponible, derivada)
igv      = total − subtotal                    (por resta, no por producto)
```

Para INAFECTO no hay nada que derivar: `subtotal = total`, `igv = 0`.

`subtotal` **no cambió de significado**: sigue siendo la base imponible, que
es lo que el comprobante necesita como `total_gravada`. El IGV se saca por
resta y no multiplicando la base, para que `subtotal + igv` dé exactamente
el total y no quede un céntimo suelto por redondear las dos partes por
separado.

El `valor_unitario` del comprobante (que va **sin** IGV) también se deriva
hacia atrás: `precio_unitario / (1 + tasa/100)`.

### El bug que esto corrige (`0051`)

Hasta `0051`, la lógica tomaba `price_list_items.precio` como base y le
sumaba el 18% encima. **Todo pedido con productos GRAVADO salía con el total
inflado un 18%.** Ejemplo real: 12 unidades a S/ 25.42 daban S/ 359.95 en
vez de S/ 305.04.

Estaba en cuatro lugares, y como el SQL es la capa autoritativa, arreglar
solo el TypeScript no habría alcanzado:

- `pedidos.submit_order` — recalcula todas las líneas al enviar.
- `pedidos.decide_approval_request` — al aprobar un precio especial.
- `calculateLineItem` en `domain/orders.ts`.
- `buildComprobanteBorrador` en `domain/nubefact-draft.ts`.

`pedidos.reevaluate_order` no recalcula líneas, así que no se tocó.

`0051` incluye una auditoría que **solo informa**: cuenta las líneas ya
grabadas cuyo total sigue la fórmula vieja y lo deja en un `raise notice`.
No corrige datos: qué hacer con esos pedidos es decisión del usuario.

## Bonificaciones: el prefijo `BO`

**Confirmado por el usuario el 2026-08-13.** Los códigos que empiezan con
`BO` son la versión de **bonificación** de su par regular (`BOBSA207` es la
bonificación de `BSA207`), y ambos traen la **misma descripción exacta**. En
pantalla se ven idénticos, y un vendedor puede agregar el equivocado sin
darse cuenta.

Se resuelve en presentación, sin tocar el dato: `displayNombreProducto`
(`domain/products.ts`) agrega `(Bonificación)` al nombre cuando el código
empieza con `BO`. Aplica en el buscador de productos, la lista de líneas del
pedido, el detalle del pedido, el maestro de productos, la bandeja de
Operaciones y el correo/Excel del pedido.

**No aplica en los documentos fiscales.** La descripción del comprobante y
de la guía es la del producto; marcar una bonificación ahí es una decisión
tributaria (transferencia gratuita), no de interfaz, y está sin resolver.

**Límite conocido:** la regla es el prefijo y nada más, así que un producto
regular cuyo código empiece con `BO` se marcaría por error. Hoy no hay
ninguno; si aparece, hay que endurecerlo exigiendo que exista el par sin el
prefijo.

## Reconciliación del catálogo contra NubeFact (`0052`)

La fuente de verdad del catálogo es la cuenta de **NubeFact en producción**
(RUC 20610284508). El export que entregó el usuario el 2026-08-13 trae **426
filas**, y `0052` reconcilia contra él: actualiza `products.descripcion` y
versiona `product_tax_profiles` cuando la afectación difiere.

Mapeo de `TIPO DE AFECTACIÓN (IGV)`: `10` → GRAVADO 18%, `30` → INAFECTO 0%.

Del catálogo, en números: **423 filas GRAVADO, 2 INAFECTO, 1 sin afectación**.
Cero códigos duplicados y cero descripciones vacías.

### `DSCTO1` no es un producto

Es la única fila sin tipo de afectación, con unidad `NIU` y categoría
`DESCUENTO`: es la **línea de descuento** que NubeFact usa al facturar, no un
producto. Queda **excluida** de la reconciliación. Por eso `0052` trabaja con
425 y no con 426.

### Las 2 filas INAFECTO son ambas bonificaciones — revisar

`BODHP109` (JAMOL 5) y `BODHP110` (GLICOFAST 1000) son las únicas dos
INAFECTO del catálogo, y las dos son códigos `BO`. Sus pares regulares
`DHP109` y `DHP110` **no existen en el catálogo**.

Que solo 2 de 207 bonificaciones sean inafectas parece inconsistente: o el
tratamiento correcto de una bonificación es inafecto y faltan 205, o esas dos
están mal. **Sin confirmar.** `0052` aplica lo que dice el catálogo porque es
la fuente de verdad acordada, pero esto merece revisión — se cruza con el
supuesto pendiente #1 de Fase 6 (tratamiento tributario de bonificaciones).

### 71 bonificaciones sin par regular en el catálogo

De los 207 códigos `BO`, **71 no tienen su par sin prefijo** en el catálogo
(por ejemplo `BOP000015`). No rompe nada —la regla de presentación es solo el
prefijo— pero significa que para esos 71 no se puede verificar la premisa de
que son "la bonificación de X".

### 16 productos desactivados por no estar en NubeFact

**Confirmado por el usuario el 2026-08-14** sobre el reporte de la vista
previa. Estos 16 estaban activos en nuestro catálogo pero **no existen en el
catálogo de NubeFact**, así que hoy no se pueden facturar:

```
DHP218  DHP219  DHP220  DHP221  DHP222  DHP223  DHP224  DHP225
DHP226  DHP227  DHP228  DHP229  DHP421  DHP423  DHP424  PLGS14
```

Se **desactivan, no se borran**: es reversible. `0052` los pasa a
`estado = 'inactivo'` y les escribe la razón en la columna nueva
`products.nota_estado`, que el catálogo administrativo muestra:

> Inactivo temporalmente — no está en el catálogo de NubeFact, no se puede
> facturar. Contactar a quien administre la cuenta NubeFact para agregarlo.

Dejan de aparecer en el buscador de "Nuevo pedido" porque esa pantalla ya
filtra por `estado = 'activo'`. Además `addOrderItem` rechaza un producto
inactivo aunque llegue por una petición armada a mano: la interfaz no es la
garantía.

Para reactivarlos alcanza con volverlos a `activo` y limpiar la nota, una vez
que existan en NubeFact.

### `DAPHA10-EJ`: borrado, con salvaguarda

El placeholder de Fase 2, obsoleto desde la importación real de Diphasac.
`0052` lo borra **solo si no tiene ninguna línea de pedido asociada**; si la
tiene, lo deja inactivo con su nota, porque borrar un producto referenciado
por un pedido rompería el histórico. Sus filas de `price_list_items` se van
con él cuando se borra (esa tabla no tiene `on delete cascade`).

### Los 279 códigos de NubeFact sin match: gap esperado

De los 425 códigos del catálogo, **279 no existen en nuestro `products`**, en
su mayoría bonificaciones `BO` y líneas de producto que no se importaron en
Fase 3.

**Queda sin acción a propósito.** No es un error de la reconciliación: es
consecuencia de que **promociones y bonificaciones siguen diferidas desde
Fase 3**, así que esas líneas nunca entraron al catálogo. Se resolverá cuando
se implemente el motor de promociones/bonificaciones, no antes.

Lo que sí importa mientras tanto: un pedido no puede incluir un producto que
no existe en nuestro catálogo, así que este gap no puede generar un
comprobante inválido. El riesgo va en la dirección contraria —productos
nuestros que NubeFact no tiene— y eso es justamente lo que resuelve la
desactivación de los 16.

### Cómo ver el reporte antes de mergear

`0052` imprime el reporte completo por `raise notice` al aplicarse (códigos
sin match, qué productos cambian de afectación, cuántas descripciones se
actualizaron). Para verlo **antes**, hay una consulta de solo lectura en
[consultas/preview-reconciliacion-nubefact.sql](consultas/preview-reconciliacion-nubefact.sql).

## Perfil tributario: la excepción DAPHA 10

**Confirmado por el usuario el 2026-08-13.** Al reconciliar el catálogo
contra el exportado de NubeFact (RUC 20610284508), estos diez códigos
**quedan INAFECTOS pase lo que diga ese catálogo** — el catálogo de NubeFact
tiene un error ahí:

```
DHP100  DHP101  DHP102  DHP105  DHP106
BODHP100  BODHP101  BODHP102  BODHP105  BODHP106
```

Es toda la familia **DAPHA 10** y **DUO DAPHA 10**, con sus bonificaciones.

Cualquier reconciliación futura contra NubeFact tiene que respetar esta
lista. Si en algún momento se confirma que el catálogo de NubeFact se
corrigió, hay que quitar la excepción explícitamente, no dejarla vencer en
silencio.

## Fase 4 — Pedidos

Máquina de estados completa, diagrama y tabla de transiciones en
[workflows.md](workflows.md). Acá solo las decisiones de negocio.

- **Acceso de administrador a "Nuevo pedido".** El rol `administrador`
  puede tomar un pedido igual que un vendedor, pero no está atado a una
  sola zona: al crear el pedido, elige explícitamente a nombre de qué
  vendedor/zona se registra (`resolveOrderSellerId` en
  `domain/orders.ts`). Un vendedor normal nunca ve ese selector — el
  suyo queda fijo a su propio `seller_id` vía RLS
  (`pedidos.current_seller_id()`, 0032).
- **`sellers` sigue desacoplado de `zone_assignments`.** El RLS de
  `orders`/`order_items` se particiona por `seller_id` directo (no por
  zona), porque `zone_assignments.vendedor` nunca se pobló a partir de
  `sellers.user_id` (ver "Pendiente" en data-model.md, sección de
  zonas). El RLS de `customers` no cambió — sigue funcionando por zona,
  tal como se diseñó en Fase 2.
- **Seller "sin vendedor de campo".** Para pedidos de administrador que
  no corresponden a ningún vendedor real, se creó un seller nuevo,
  **"OFICINA LOGISSA (SIN VENDEDOR ASIGNADO)"** (código `SINVEND`, sin
  zona) — deliberadamente con un nombre distinto al vendedor real ya
  existente "OFICINA LOGISSA" (código `CODI01`, zona DISTRIBUIDORAS,
  sembrado en 0021_seed_zonas_vendedores.sql), para no confundir
  reportes de ese canal con pedidos administrativos sin vendedor.
  Confirmado con el usuario el 2026-08-02.
- **Sellers de prueba para aromero@logisalud.com / sgonzales@logisalud.com**
  (`TEST001`/`TEST002`, sin zona). Es solo plumbing para un futuro
  "probar el flujo como vendedor puro" — como ambos ya tienen el rol
  `administrador`, el selector de vendedor les sigue apareciendo siempre
  en "Nuevo pedido" (el rol admin manda sobre la presencia de un seller
  vinculado). Para forzar el flujo estrictamente restringido de
  vendedor harían falta cuentas que SOLO tuvieran el rol `vendedor` —
  no se construyó ninguna feature de "suplantar rol" porque no fue
  pedida.
- **"Cliente nuevo" desde el pedido, agregado tras un bug reportado.**
  La primera versión de Fase 4 dejó la máquina de estados
  `NEW_CUSTOMER_VALIDATION` y las policies de RLS listas para un
  cliente en `PENDIENTE_DE_VALIDACION`, pero **no construyó ninguna
  pantalla/acción que realmente creara ese cliente** — el selector de
  "Nuevo pedido" solo permitía elegir clientes ya `ACTIVO`. Se agregó
  `services/customers.ts::requestNewCustomer()` + un mini-formulario
  "+ Cliente nuevo" en `new-order-form.tsx` que fuerza
  `estado = 'PENDIENTE_DE_VALIDACION'` sin importar el rol de quien lo
  crea (un admin podría insertar con cualquier estado según su propia
  policy de RLS, pero es una *solicitud*, no un alta directa). **Límite
  conocido, no nuevo de este fix:** la policy `customer_addresses_
  insert_vendedor` exige que la zona del cliente esté en
  `current_user_zone_ids()` del vendedor — como `zone_assignments`
  sigue sin poblarse (ver más arriba), un usuario con *solo* el rol
  `vendedor` (sin `administrador`) fallaría al crear la dirección del
  cliente nuevo. Hoy no es un problema práctico porque los únicos
  usuarios reales son administradores (que sí pueden vía
  `customer_addresses_write_control_o_admin`), pero queda anotado para
  cuando se registren vendedores reales.
- **Trigger de `ADMINISTRATIVE_EXCEPTION` (confirmado con el usuario,
  no es un supuesto abierto): la condición de pago elegida en el pedido
  es distinta de `customers.condicion_pago_habitual_id`.** No hay PRD
  accesible en el repo con el texto exacto de esta regla; se infirió de
  que ese campo existe justo para esta comparación y de que el cambio
  de condición de pago post-envío requiere una "approval_request de
  excepción" — y se confirmó explícitamente antes de implementar.
- **Auditoría explícita, no trigger genérico.** A diferencia de
  `customers`/`product_tax_profiles` (que tienen un trigger genérico de
  auditoría, 0017), los cambios de estado de pedido, condición de pago y
  decisiones de aprobación se auditan con llamadas explícitas a
  `logAudit()` desde `services/orders.ts`/`services/approvals.ts` —
  `order_status_history`/`approval_decisions` ya son más informativos
  que un diff jsonb genérico (tienen motivo/decisión estructurados), y
  duplicar ambos mecanismos sería redundante.
- **Recalculado de precios, nunca confiar en el navegador.** El precio
  de cada línea se recalcula una única vez, en `pedidos.submit_order()`
  (`SECURITY DEFINER`), que busca el precio vigente por sí misma en
  `price_list_items`/`product_tax_profiles` — nunca acepta un precio
  como parámetro, ni siquiera de un caller que sea código de servidor
  de confianza. Esto es intencional: una función que aceptara el precio
  ya calculado sería vulnerable a alguien que llame el RPC de Supabase
  directamente (sin pasar por la app) con un precio falso.
- **Límite conocido de los tests de dominio (6 y 7 del usuario).** Los
  tests de `resolveOrderSellerFilter` y "manipulación de precio" en
  `tests/domain/orders.test.ts` son un **proxy** de la garantía real,
  que vive en las policies RLS de `0033_orders_core.sql` y en que
  `pedidos.submit_order()` no acepta precios como parámetro — no hay
  infraestructura de Postgres local (pgTAP, Supabase local) en este
  repo para testear las policies en sí. TODO post-Fase-4: evaluar esa
  infraestructura si el equipo la necesita.
- **NO implementado en esta fase** (TODOs explícitos, ver también
  workflows.md): stock (ninguna reserva antes de despacho), promociones/
  bonificaciones/escalas de precio, GRE, factura/boleta real
  (NubeFact), despacho real. `READY_FOR_OPERATIONS` es el punto exacto
  donde cada uno de estos debería engancharse — ver workflows.md.

## Carga de la cartera real de clientes

Decisiones confirmadas con el negocio para migrar los 3.399 clientes del
sistema del piloto de WhatsApp. Ver `docs/data-model.md` para el detalle
de tablas y el importador.

### Tipo de comprobante por prefijo de documento

El comprobante permitido se deriva del documento del cliente, no se
elige a mano ni se deja en un default único:

| Documento | Qué es | `tipo_comprobante_permitido` |
|---|---|---|
| `20` + 9 dígitos | Persona jurídica | `FACTURA` |
| `10` + 9 dígitos | Persona natural con negocio | `FACTURA_O_BOLETA` |
| `15` / `17` + 9 dígitos | RUC de contribuyente residual, igualmente válido | `FACTURA_O_BOLETA` |
| cualquier otro | **No es RUC** — DNI en el campo de RUC, o RUC incompleto | `BOLETA` |

Un RUC son **11 dígitos**, no solo un prefijo: `20123` y `2099999999`
empiezan bien y no son RUC, así que van a `BOLETA`.

`FACTURA_O_BOLETA` es deliberado para persona natural: el vendedor elige
caso por caso al momento del pedido, no hay un default fijo por cliente.

La restricción a `BOLETA` sin RUC válido **sigue aplicando después de que
Control de Pedidos apruebe al cliente** — está garantizada por el
constraint `customers_boleta_only_sin_ruc_valido` en la BD, no por la
capa de servicio. Se levanta únicamente corrigiendo `ruc_o_documento` a
un RUC de contribuyente real. La ficha de validación muestra la alerta
"Posible DNI cargado como RUC — verificar documento real antes de
aprobar" y aclara que aprobar no habilita factura.

### Estado de entrada

- Documento con RUC válido (`10`/`15`/`17`/`20`) → **`ACTIVO`**. Son
  clientes que ya operan; saltan el flujo de validación, que está
  pensado para clientes nuevos.
- Documento sin RUC válido → **`PENDIENTE_DE_VALIDACION`**, para que
  Control de Pedidos verifique el documento real antes de habilitarlo.

### Un pedido nunca sale sin dirección de entrega

**Se bloquea, no se advierte.** Preferimos frenar la toma del pedido a
que salga un despacho sin dirección real. Es una decisión de negocio
explícita, no una limitación técnica.

La cartera migrada entró **sin ninguna dirección**: el archivo de origen
no trae `direccion` ni `ubigeo` (0 de 3.399 filas), y el
`distrito`/`provincia`/`departamento` que sí trae es geografía
referencial, no una dirección de entrega. Así que la primera vez que se
le vende a cada cliente migrado hay que capturarla.

Cómo se hace cumplir, en dos niveles:
- **Garantía dura**: `orders.customer_address_id` es `not null` (0033).
  Un pedido sin dirección no puede existir en la BD.
- **UX**: al elegir un cliente sin dirección activa, "Nuevo pedido"
  bloquea el botón de continuar y muestra "Este cliente no tiene
  dirección registrada, agrégala antes de continuar", con el formulario
  para crearla ahí mismo — sin mandar al vendedor a otra pantalla. La
  RLS de `customer_addresses` decide quién puede: el vendedor solo en su
  zona y a su nombre, `control_pedidos`/`administrador` en cualquiera.

Regla de dominio: `puedeTomarPedido` en `domain/customers.ts`.

### Condición de pago: sin habitual definida

Los 3.399 clientes migrados entran **sin condición de pago habitual**
(`condicion_pago_habitual_id = null`). El archivo de origen no trae el
dato y no se inventa uno por cliente: el vendedor elige la condición al
armar cada pedido, igual que ya funciona para clientes nuevos.

Consecuencia que hubo que resolver: la bifurcación automática manda a
`ADMINISTRATIVE_EXCEPTION` cuando la condición del pedido difiere de la
habitual del cliente. **Sin habitual definida no hay nada con qué
comparar, así que cualquier condición que elija el vendedor se acepta sin
excepción.** Implementado en `0043` (SQL, la autoridad) y en
`computeAutomaticValidationOutcome` (`domain/orders.ts`, el espejo que
alimenta la UI) — ver `docs/data-model.md` para por qué las dos
implementaciones no coincidían antes de este cambio.

El catálogo de condiciones de pago se completó en `0042`: además de
`Contado`, ahora existen `Crédito 30 / 45 / 60 / 90 / 120 días`.

**Pendiente:** asignar la condición habitual real cliente por cliente,
cuando el negocio la defina. Mientras no exista, el flujo funciona — pero
el sistema no puede detectar que un vendedor pidió una condición inusual
para ese cliente, porque no sabe cuál es la usual.

### Canal de venta: `Horizontal` como supuesto temporal

Los 3.399 entran con **canal `Horizontal`**. Es un supuesto explícito, no
un dato real: el archivo de origen no trae clasificación de canal.

A diferencia de la condición de pago, acá dejarlo en null no era una
opción: el precio se busca por canal en `price_list_items`, y
`submit_order` aborta con "El cliente no tiene canal de venta asignado;
no se puede calcular precio". Sin este default **ningún cliente de la
cartera podría recibir un pedido**. Este supuesto es, en la práctica, lo
que deja la cartera operativa.

**Pendiente:** el negocio va a entregar la clasificación real
(Mayorista / Horizontal / Minicadenas / Tops / Clínicas /
Subdistribuidores) para corregir caso por caso. Hasta entonces, todo
cliente migrado se cotiza a precio de canal Horizontal — si su canal real
era otro, **el precio que ve el vendedor es el equivocado**. Vale
priorizar esta corrección antes de operar a volumen.

### Qué queda pendiente de completar

- **Dirección de entrega** de los clientes migrados — se completa en
  demanda, desde el propio flujo de pedido.
- **Condición de pago habitual** — ver arriba.
- **Canal de venta real** — ver arriba. Es el más urgente de los tres:
  afecta el precio, no solo el flujo.
- **`es_agente_retencion`**: queda en el default `false`. El origen no lo
  trae, y sigue atado a los supuestos de retenciones de Fase 6.

### Asteriscos en la razón social

21 de los 3.399 clientes migrados traen la razón social con asteriscos
escritos al inicio, en cantidad variable y a veces con barras:
`'* BOTICA ...'`, `'**** ... S.C.R.L.'`, `'*****///INVERSIONES ...'`.

**No son un indicador del sistema**: no hay código que los genere — ni
score de relevancia, ni marca de debug. Venían así en el CSV del piloto de
WhatsApp, alguien los tipeó a mano allá y el importador los cargó
literales. Como `*` ordena antes que las letras, coparon la cabeza de
cualquier lista ordenada por nombre.

El selector de pedido los **limpia solo para mostrar**
(`displayRazonSocial` en `domain/customer-search.ts`); el dato original
queda intacto en `customers.razon_social`, y la búsqueda encuentra el
cliente igual escribiendo el nombre sin los asteriscos.

**Pendiente de decidir:** si en el piloto significaban algo (¿cliente
preferente? ¿moroso? ¿prioridad de visita?) hay que modelarlo en una
columna propia. Si no significaban nada, corresponde una migración que
normalice los 21 nombres. Hasta que alguien lo confirme, no se toca el
dato.

### Búsqueda de clientes en el flujo de pedido

La cartera son ~3.400 clientes, así que el selector **busca en el
servidor** (`searchActiveCustomers`), con debounce de 300 ms, coincidencia
`ilike '%término%'` sobre RUC/documento, razón social y nombre comercial, y
tope de 50 resultados. La lista que se ve sin escribir nada es solo la
primera página de 50, y la UI lo dice.

Es **un solo control**: un combobox (`components/combobox.tsx`) donde se
escribe y las sugerencias caen debajo del mismo campo; un click —o Enter
sobre la resaltada— deja el cliente elegido en el campo y cierra la lista.
Antes eran dos controles (un input de búsqueda y un `<select>` aparte que
había que volver a abrir), que es un paso de más en el celular, que es
desde donde el vendedor toma los pedidos.

El componente está escrito a mano porque el stack no trae ninguna librería
de combobox, y las que hay (shadcn/ui sobre Radix + cmdk) filtran del lado
del cliente sobre una lista precargada — exactamente lo que acá no se
puede hacer. El `<select>` manda el `customerId` por un input oculto; el
campo visible es solo UI, y escribir encima de una selección la deshace
para que el campo nunca muestre un cliente y envíe otro.

No se precarga la cartera en el navegador para filtrar ahí: **PostgREST
tope las respuestas en 1.000 filas**, así que hacerlo dejaba 2.248 clientes
(69% de la cartera) invisibles para el buscador sin ningún error a la
vista. Es el mismo tope que ya obligó a paginar el resumen de la cartera en
`services/customers-import.ts`.

La consulta corre con el cliente Supabase **del usuario**, nunca el de
service role, así que la RLS de `customers_select` aplica igual: un
vendedor solo encuentra clientes de su(s) zona(s) —ni siquiera buscando el
RUC exacto de uno ajeno— y un administrador busca sobre todos.

`0050` agrega índices GIN de `pg_trgm` sobre las tres columnas: un
`ilike '%...%'` no puede usar un btree, y sin ellos cada tecleada era un
seq scan de la cartera completa.

## Notificación por correo al enviar un pedido

Al pasar de `DRAFT` a `SUBMITTED` se manda un correo con el detalle del
pedido a los destinatarios activos de
`pedidos.order_notification_recipients`. Reemplaza la idea previa de un
PDF descargable en la app.

- **Contenido**: datos del cliente (razón social, RUC/documento, dirección
  de entrega, canal, zona), vendedor responsable, condición de pago,
  tabla de productos (código, descripción, cantidad, precio unitario,
  IGV, subtotal, total por línea), total general con IGV desglosado,
  fecha/hora de envío y número de pedido.
- **Los importes no se recalculan** para el correo: se suman las líneas
  que ya grabó `submit_order`. El correo no puede contradecir a la BD.
- **Nota obligatoria en el correo**: "Documento de control interno — no
  válido como comprobante de pago. El comprobante electrónico se genera
  al momento del despacho."
- **Lista vacía no es un error**: el pedido se envía igual y queda
  registrado como `sin_destinatarios` en `notification_logs` (y en
  `audit_logs`, porque ahí la causa es configuración pendiente).
- **Un fallo de envío no revierte nada**: el pedido ya está `SUBMITTED`.
  Queda como `fallido` en `notification_logs` para reintentar a mano.
- Solo el **administrador** gestiona la lista, en
  `/admin/configuracion/notificaciones`.

### Número de pedido

`orders.numero` es un correlativo global que asigna la BD al crear el
pedido — **incluido el borrador**, así que la numeración tiene huecos si
un borrador se abandona. Se aceptó a cambio de que el número sea estable
desde el minuto uno: si se asignara al enviar, el mismo pedido cambiaría
de identificador a mitad del flujo.

**No es un número de comprobante fiscal.** Ese lo emite el proveedor de
facturación electrónica al despachar, y no tiene por qué coincidir.

## Stock y Operaciones

### La fuente de stock la decide Operaciones, nunca el vendedor

El stock de fuentes distintas (`central` vs. `regional`) **no se mezcla
automáticamente**. La fuente se elige al confirmar el despacho, y por eso
`inventory_source_id` vive en `fulfillments` y no en `orders`: cuando el
vendedor toma el pedido todavía no se sabe —ni le corresponde decidir— de
qué almacén va a salir.

### El stock registrado es manual, y no bloquea el despacho

`stock_levels` es un **registro que Operaciones mantiene a mano**. No hay
integración en tiempo real con un ERP de inventario, así que el número
puede estar desfasado del almacén físico.

Consecuencia deliberada: **una línea sin stock registrado no bloquea el
despacho.** La UI avisa cuando lo preparado supera lo disponible, y la
línea se puede marcar como `pendiente_de_stock` con un comentario
obligatorio. Bloquear contra un número que sabemos que puede estar mal
frenaría despachos reales por un dato de mentira.

**TODO — integración real de inventario:** cuando exista, el punto de
enganche es `services/fulfillments.ts::getStockForOrder`, y ahí se decide
si la validación pasa a ser bloqueante. Mientras no exista, el criterio
es el de arriba.

### Qué exige confirmar un despacho

- Rol `operaciones` o `administrador`.
- El pedido en `READY_FOR_OPERATIONS` (esto impide el doble despacho).
- **Dirección de entrega activa.** Desde Fase 4 un pedido no puede
  enviarse sin dirección, así que esto es una red para pedidos legacy: si
  uno se cuela, se bloquea con un mensaje que dice qué hacer en vez de
  despachar a ninguna parte.
- **Todas** las líneas del pedido, una sola vez cada una — aunque alguna
  vaya en cantidad 0.
- **Lote** si el producto tiene `controla_lote`, y **fecha de
  vencimiento** si tiene `controla_vencimiento`.
- **Motivo obligatorio** en toda diferencia entre cantidad pedida y
  preparada.
- Transporte asignado: vehículo **con** chofer, o transportista externo.
  Un vehículo sin chofer no es una asignación completa.

Todo va en una sola transacción: si una línea no cumple, no se crea el
despacho ni se mueve el pedido.

### Qué ve el vendedor

Solo lectura: que su pedido salió, cuándo, de qué fuente, con qué
transporte, y qué se preparó de cada línea (con el motivo si hubo
diferencia). No puede editar nada — no existe policy de escritura para él
en `fulfillments` ni en `fulfillment_items`.

### Auditoría

Van a `audit_logs` con la acción `confirmar_despacho`: la fuente de stock
elegida, el almacén y el transporte, toda diferencia entre cantidad
pedida y preparada con su motivo, y las líneas marcadas como pendientes
de stock con su comentario.

## Documentación electrónica

### Estado: BORRADORES para revisión humana, sin integración

**La app NO llama a la API de NubeFact.** Al confirmar el despacho genera
dos JSON locales y los guarda en
`pedidos.electronic_document_drafts`:

1. **Comprobante** (factura o boleta), y
2. **Guía de remisión (GRE)**.

Ambos siguen la estructura *aproximada* documentada públicamente por
NubeFact, y llevan un bloque `_borrador` con el aviso, las advertencias
detectadas y la marca `quitar_este_bloque_antes_de_enviar`. Los nombres y
códigos de campo están **sin confirmar** contra el manual oficial: el
propósito de esta etapa es que la facturadora los compare campo por
campo.

Los revisan `administrador` y `control_pedidos`, en
`/control-pedidos/documentos`. El vendedor no los ve.

### Quién es el emisor

Los datos legales del emisor **no están hardcodeados** en el generador:
salen del singleton `pedidos.company_settings` (una sola fila, `id = 1`),
editable solo por `administrador` en `/admin/configuracion/empresa`. Ahí
viven razón social, RUC, domicilio fiscal, ubigeo, teléfono y email, y
alimentan el bloque de emisor de **ambos** documentos.

Si la fila no existe, la generación de borradores falla en voz alta en vez
de emitir un documento sin emisor. El destinatario, en cambio, sale
siempre del cliente del pedido.

### Descripción de los items de la GRE

La GRE describe cada producto con el mismo formato que la facturadora usa
hoy a mano:

```
<nombre del producto> LT: <lote> FV: DD/MM/AAAA
```

Ejemplo real: `VITACAPIL SHAMPOO CJA X 1 FCO X 380 ML LT: 2030056 FV:
31/03/2029`.

El lote y el vencimiento los captura Operaciones por línea al confirmar el
despacho, así que la descripción se arma con lo **efectivamente
despachado**, no con lo pedido — y las cantidades de la GRE son las
`cantidad_preparada`, no las pedidas. Si una línea va sin lote o sin
vencimiento, se omite ese fragmento en vez de escribir `LT: null`.

### TODO — Pendiente

> Pendiente: reemplazar generación de borrador por llamada real a la API
> de NubeFact (POST a la ruta configurada con el token), una vez
> confirmada la estructura exacta de campos contra el manual oficial y
> rotado el token de forma segura (variables de entorno
> `NUBEFACT_API_URL` y `NUBEFACT_API_TOKEN`, nunca en el repo).

El gancho está marcado con el mismo TODO en tres lugares:
`pedidos.confirm_dispatch` (`0046`), `services/fulfillments.ts` (donde se
llama a la generación) y `domain/nubefact-draft.ts`.

Va **después** de que el despacho quedó grabado y el pedido pasó a
`DISPATCHED`, y la generación **nunca lanza**: un fallo no puede revertir
un despacho físico que ya ocurrió — el mismo criterio que la notificación
por correo al enviar el pedido. Cuando exista la emisión real, deberá
quedar registrada con su propio estado, reintentable, como
`notification_logs`.

### Huecos conocidos que el borrador reporta como advertencia

Estos no son bugs del generador: son datos que el modelo todavía no tiene
y que hay que resolver antes de emitir de verdad.

- **`orders` no guarda qué comprobante eligió el vendedor.** Hoy nadie lo
  elige al tomar el pedido. Si el cliente admite `FACTURA_O_BOLETA`, el
  borrador asume **FACTURA** y lo marca como advertencia. Resolverlo pide
  una decisión: o se agrega el selector al flujo de pedido, o la
  facturadora lo define al emitir.
- **Serie y número son placeholder.** La serie la autoriza SUNAT y el
  correlativo fiscal lo lleva NubeFact; `orders.numero` es el número
  interno del pedido y **no** el del comprobante.
- **`peso_bruto_total` está incompleto.** La GRE lo exige, y
  `products.peso_unitario_futuro` quedó sin cargar para casi todo el
  catálogo. El borrador calcula con lo que hay y lista los productos sin
  peso.
- **Solo un almacén tiene dirección cargada.** `warehouses.direccion` y
  `warehouses.ubigeo_codigo` existen desde `0049`, y **Almacén Central
  Lima** ya los tiene (`CAR. PANAMERICANA SUR KM.29.5 INT.A-08`, ubigeo
  `150119`): un pedido que sale de ahí genera la GRE con
  `punto_de_partida_direccion` y `punto_de_partida_ubigeo` resueltos y
  **sin advertencia**. Los demás almacenes siguen en `null` a propósito —
  nadie confirmó su dirección real — y el borrador los advierte hasta que
  se completen desde `/admin/maestros/despacho` o la BD.
- **El ubigeo de llegada depende del cliente.** Sale de
  `orders.ubigeo_snapshot`; si el cliente se cargó sin ubigeo, el
  borrador advierte `punto_de_llegada_ubigeo` vacío.

Recordatorio que sigue aplicando: los clientes sin RUC de contribuyente
válido están restringidos a `BOLETA` por constraint. Si el borrador
resuelve factura para uno de ellos, lo advierte.

### Descarga directa desde la app, sin depender del correo

El correo puede fallar sin bloquear el pedido, así que **ninguna descarga
depende de que se haya enviado**. Los tres archivos se pueden bajar desde la
app en cualquier momento:

| Archivo | Dónde | Quién |
|---|---|---|
| Excel del pedido | Botón "Descargar Excel" en `/pedidos/[id]` | Quien pueda ver el pedido |
| JSON de comprobante | "Descargar .json" en `/control-pedidos/documentos/[orderId]` | `administrador`, `control_pedidos` |
| JSON de guía | Ídem | Ídem |

**El Excel es el mismo archivo que va adjunto al correo**, no una segunda
versión: la ruta `/pedidos/[id]/excel` usa `loadOrderEmailData` +
`buildOrderExcel`, las mismas funciones. Si el Excel cambia, cambia en los dos
lados a la vez. Se rearma en cada descarga desde el pedido, así que refleja el
IGV corregido de `0051` aunque el correo se haya mandado antes.

**Los permisos los decide la RLS, no una segunda lista.** La ruta primero lee
el pedido con el cliente del usuario; si `orders_select` no se lo muestra,
devuelve 404. Así no hay dos reglas de permisos que se puedan desincronizar.

Los JSON **no se regeneran** al descargarlos: se sirven los borradores que
`confirm_dispatch` grabó en `electronic_document_drafts`. Por eso el detalle
del pedido **enlaza** a la sección de documentos en vez de duplicar la
generación — un solo lugar arma esos JSON, y es el despacho.

### Excel adjunto en el correo del pedido

El correo que sale al pasar a `SUBMITTED` lleva adjunto
`pedido-[numero]-[fecha].xlsx` con el encabezado del pedido, la tabla de
líneas y el total general. Se genera con `exceljs` (ya en el stack por el
importador de listas de precios).

Los importes **no se recalculan** para el Excel: se suman las líneas que
grabó `submit_order`, igual que el cuerpo del correo, para que el adjunto
no pueda contradecir a la BD. Si generar el Excel falla, **el correo sale
igual sin adjunto** — perder el adjunto es malo, no avisar es peor.

## Condición de pago con días de crédito a mano (`1010`, `1012`)

El catálogo cubre `Contado` y `Crédito 30 / 45 / 60 / 90 / 120 días`.
Cuando el cliente negocia otro plazo —15 días, 75 días— el vendedor no
tenía dónde anotarlo: elegía la opción más parecida y el dato real se
perdía.

Se agregó **una** opción de entrada libre, `Crédito (otro número de
días)`, marcada con `payment_terms.permite_dias_libres`. El número que
escribe el vendedor va en `orders.dias_credito_solicitados`, no en el
catálogo: dos pedidos con la misma condición pueden pedir 15 y 75, y
sumar una fila al catálogo por cada plazo lo volvería una condición
"estándar" más, que es exactamente lo contrario de lo que se quiere.

Reglas, todas en la base porque es la autoridad:

- **Siempre cae en `ADMINISTRATIVE_EXCEPTION`**, incluso si el cliente
  no tiene condición habitual definida (que es el caso de los 3.399
  clientes migrados). No hay contra qué comparar porque, por
  definición, no es una condición estándar: Administración tiene que
  ver el plazo antes de que el pedido salga a Operaciones.
- **Coherencia condición ↔ días**, sostenida por el trigger
  `check_dias_credito_coherentes`: con la opción libre el número es
  obligatorio, y con cualquier condición estándar tiene que quedar
  `null`. Un pedido que dijera "Contado" arrastrando 15 días fantasma
  no puede existir. No es un `CHECK` porque la regla mira otra tabla.
- **Rango 1 a 365 días** (`orders_dias_credito_rango_check`).
- La opción libre **no puede ser la condición habitual de un cliente**:
  las pantallas de cliente la filtran del selector. Un plazo distinto
  en cada pedido no es una costumbre contra la cual comparar.

En pantalla, en el correo y en el Excel la condición se muestra con
`etiquetaCondicionPago()`: con días a mano dice `Crédito 15 días (no
estándar)` y no el nombre del catálogo, que no informa nada.

## El administrador fija precio sin aprobación (`1011`, `1012`)

Cualquier precio distinto al de lista abría una solicitud
(`approval_requests`) y frenaba el pedido en `COMMERCIAL_EXCEPTION`.
Para un vendedor eso es el control que corresponde; para el
administrador es pedirse permiso a sí mismo.

Ahora hay dos caminos según el rol de quien arma el pedido:

- **Vendedor:** sin cambios. Solicitud de descuento, pedido frenado
  hasta que un aprobador comercial la resuelva.
- **Administrador:** el precio se aplica directo a la línea vía
  `pedidos.set_item_special_price()`. No se crea solicitud, el pedido
  no espera a nadie y la validación automática sigue su curso normal.

La autoridad la verifica el RPC con `pedidos.is_admin()` sobre los roles
reales de la sesión, no la pantalla: una Server Action llamada a mano
por un vendedor rebota en la base (probado).

Dos detalles que hacían falta para que funcione de verdad:

- `submit_order` **no resincroniza** las líneas con
  `precio_fijado_por_admin = true`. Antes de `1012`, el bucle de envío
  sobrescribía `precio_unitario` con el precio de lista vigente de
  todas las líneas, así que el precio que el administrador acababa de
  fijar se perdía justo al enviar el pedido. Tampoco cuenta como
  `priceDrift`: no cambió solo, lo cambió él.
- `order_items.precio_lista_original` guarda el precio de lista del
  momento del cambio, para que el correo y el Excel puedan mostrar los
  dos precios (`lista S/ 2.50 → fijado por administración S/ 1.00`).

Queda auditado en `pedidos.audit_logs` con acción
`fijar_precio_especial_admin`: los dos precios, el motivo y
`sin_aprobacion_comercial: true`.

## Carga masiva de stock (`services/stock-import.ts`)

El stock sigue siendo **registro manual** —no hay integración con un
ERP de inventario— pero ya no se carga de a uno: hay importador
CSV/Excel en `/admin/maestros/stock`, mismo patrón que precios y
clientes (vista previa primero, publicar después).

- Columnas: `codigo_producto`, `inventory_source` (por nombre) y
  `cantidad_disponible`. La cabecera no tiene que ser la primera fila y
  los nombres admiten variantes.
- La escritura es un **upsert sobre la PK
  `(product_id, inventory_source_id)`**: actualiza el registro que ya
  existe y crea el que no. Cargar dos veces el mismo archivo no
  duplica.
- La vista previa dice cuántos se crean, cuántos se actualizan, cuántos
  quedan igual y **qué códigos de producto no existen**. Una fila que
  no resuelve nunca se descarta en silencio: "cargué 150 y quedaron
  148" sin decir cuáles es la forma más rápida de perderle la confianza
  a un importador.
- Una fuente **inactiva** se reporta distinto de una **inexistente**:
  decir "no existe" empujaría al usuario a crear un duplicado.

## Un pedido, un hilo de correo (`1013`)

Los tres avisos de un pedido —enviado, cae en excepción comercial, se
resuelve la excepción— llegaban como tres conversaciones separadas. Ahora
van como un solo hilo, con threading de verdad y no "mismo asunto":

- `Message-ID` en el primer correo, guardado en
  `orders.email_thread_message_id`. Ese es el ancla del hilo.
- En los siguientes, `In-Reply-To` con el **último** mensaje del hilo (no
  el primero: es lo que espera un cliente al reconstruir el árbol) y
  `References` con la cadena completa desde el ancla, en orden y sin
  repetidos. `In-Reply-To` solo agrupa en Gmail, pero se le escapa a
  Outlook.
- Asunto: el **mismo** asunto base del hilo (`Nuevo pedido #123 —
  FARMACIA QUEEN`) prefijado con `Re: `, idempotente para que nunca
  quede `Re: Re: ` —que es justo lo que hace que Outlook abra otra
  conversación—. Qué avisa cada correo se lee en el título del cuerpo,
  no en el asunto.

**El `Message-ID` es el de Resend, leído después de enviar** (`1014`). El
primer intento fue generarlo nosotros y mandarlo en `headers`, y no
funciona: comprobado contra el encabezado real de un correo recibido en
Outlook, **Resend reescribe el `Message-ID` de salida** con su propio
formato (`@…amazonses.com`) e ignora el valor personalizado. El correo 2
referenciaba entonces un id que nunca existió en el correo 1, así que
ningún cliente podía enlazarlos. `In-Reply-To` y `References` sí se
respetan tal cual se envían.

El flujo real es: enviar, y con el `id` interno que devuelve el POST
consultar `GET /emails/{id}` — cuya respuesta trae `message_id`, además
de `id`, `to`, `from`, `subject`, `html`, `text`, `cc`, `bcc`,
`reply_to`, `created_at`, `scheduled_at`, `last_event`, `tags` y
`object`. Ese `message_id` es el que se guarda.

**Ya no se manda `Message-ID` propio**: era ruido, y encima invitaba a
armar la cadena con ids inexistentes.

Un correo puede quedar **en cola** en el momento del envío: ahí Resend
todavía no le asignó `message_id`, y la consulta vuelve vacía. Se
reintenta un par de veces con esperas cortas (el vendedor ya vio "pedido
enviado", no se lo hace esperar más) y, si no aparece, el **aviso
siguiente resuelve el hueco** antes de armar su cadena, buscando el
`message_id` a partir del `proveedor_message_id` que sí quedó guardado.
El hilo se recupera solo en vez de quedar partido por un timing de un
segundo. Por lo mismo, un id fabricado por la implementación vieja
(`<pedido-N.…>`) se ignora y se reemplaza por el real.

La cadena se arma con `notification_logs.message_id`, que guarda con qué
`Message-ID` salió cada aviso. **Un envío fallido no entra en la cadena**
(su log queda sin `message_id`): referenciar un correo que no llegó a
ninguna bandeja rompería el emparentado de los que sí salieron. Y si el
primer correo falla, el siguiente que salga abre el hilo.

**Pendiente de confirmar en producción:** que Resend respete el
`Message-ID` propio en vez de reescribirlo. Si lo reescribe, el
`In-Reply-To` apunta a un id que nadie tiene y el agrupamiento se cae;
se verifica con "Mostrar original" en el primer correo. La alternativa
sería leer el `Message-ID` real por la API de Resend después de enviar.

## Cliente nuevo: el comprobante se deriva del documento

`requestNewCustomer` no seteaba `tipo_comprobante_permitido`, así que la
fila tomaba el default de la tabla (`FACTURA`). Con un DNI en el campo de
RUC —el caso más común de cliente nuevo— eso viola
`customers_boleta_only_sin_ruc_valido` y el registro reventaba con un
error de servidor en pantalla ("An error occurred in the Server Components
render"). Reproducido con los datos reales del reporte: `pepito`,
documento `74453490`.

Ahora se deriva con `resolveTipoComprobantePermitido()`, el mismo criterio
que ya usaba el importador de la cartera: 20… → `FACTURA`, 10…/15…/17… →
`FACTURA_O_BOLETA`, y cualquier otra cosa → `BOLETA`.

**Segunda causa, distinta, del mismo síntoma:** un vendedor que registra
un cliente en una zona que **no es la suya**. El INSERT pasa, pero el
`RETURNING` no: `customers_select` filtra por
`current_user_zone_ids()`, y Postgres reporta eso como *"new row violates
row-level security policy"*. Se corrige en dos capas — la pantalla sólo
ofrece las zonas propias del vendedor (`listZonasSeleccionables`), la
Server Action revalida contra esa misma lista, y los dos errores de base
que este formulario puede provocar se traducen a mensajes legibles en vez
de llegar crudos a la pantalla.

## Aprobación masiva de los clientes con DNI cargado como RUC

Los 150 clientes que quedaron `PENDIENTE_DE_VALIDACION` con la
advertencia "Posible DNI cargado como RUC" se aprobaron **en bloque**, por
autorización explícita del administrador, sin revisión individual.

- Pasaron a `ACTIVO`, con `validado_por` y `fecha_validacion`.
- **`tipo_comprobante_permitido` sigue en `BOLETA`**: no cambia nada, no
  tienen RUC de contribuyente válido y el constraint lo sostiene. Aprobar
  al cliente no lo convierte en facturable.
- Auditado en `pedidos.audit_logs` con acción `aprobar_clientes_masivo`:
  una fila con la lista de ids, el criterio usado, quién lo autorizó y
  que fue masiva y no individual. Los 150 cambios de estado además quedan
  uno por uno por el trigger `customers_audit`.

## "Repetir último pedido": eliminado

Se quitó por completo — botón, Server Action (`repetirUltimoPedido`),
servicio (`repeatLastOrder`) y el helper que existía sólo para decidir si
mostrarlo (`sellerTienePedidos`). **No se dejó comentado**: código muerto
que nadie ejecuta se desincroniza en silencio con el resto (esa función ya
había necesitado dos arreglos por cambios ajenos), y el historial de git
lo conserva si alguna vez se quiere volver a habilitar.

## Cambiar contraseña: cualquier rol

La pantalla vivía en `/admin/perfil` y por lo tanto sólo la alcanzaba un
administrador — justo el rol que menos la necesita. Se movió a `/perfil`,
que sólo exige estar autenticado, y el menú de usuario la ofrece a todos.
`/admin/perfil` queda como redirección. El componente y la Server Action
son los mismos, incluida la reautenticación con la contraseña actual:
tener la sesión abierta no alcanza para cambiarla.

## Las observaciones del pedido salen en el correo y en el Excel

El vendedor escribe ahí lo que no entra en ninguna línea ("entregar antes
del viernes", "coordinar con Rosa") y hasta ahora no salía del sistema:
quien prepara el despacho no las veía.

**Se muestran TODAS, de la más vieja a la más nueva**, no sólo la última:
son pocas (una o dos por pedido) y forman una conversación — quedarse con
la última esconde el pedido original. Incluye las de Control de Pedidos
además de las del vendedor, con fecha, autor (resuelto contra `profiles`)
y el contexto de la excepción cuando lo tienen: para quien despacha valen
lo mismo. En el Excel van después de los totales y antes de la nota legal.

## Bonificaciones: se pueden cargar a mano, a S/ 0.00

Los códigos `BO…` no aparecían en el buscador de productos porque
`esOfrecibleEnPedido` exigía precio vigente y casi ninguno lo tiene: se
entregan gratis. Y el bloqueo de verdad estaba en `submit_order`, que
levantaba *"Sin precio vigente para el producto X"* y tumbaba el envío
**entero** por una sola línea de bonificación.

Ahora una bonificación sin precio de lista entra con **S/ 0.00
explícito**, en el buscador y al enviar. Es una excepción angosta y
deliberada: para cualquier otro producto, "no tiene precio" es un dato que
falta y la línea se sigue bloqueando, en vez de valorizarse en cero por
accidente. La regla vive en `domain/products.ts` (`admitePrecioCero`) y su
espejo en SQL en `1015`.

Esto **no** es el motor de promociones automáticas (escalas, "3+1",
bonificación calculada por volumen), que sigue pendiente de diseño a la
espera del archivo de promociones. Sólo permite cargar a mano una
bonificación ya acordada con el cliente.

## Las 18 bonificaciones creadas como producto (`1016`)

Los códigos `BO…` no aparecían en el buscador por una razón más simple que
la del precio: **no existían como fila de `products`**. De 40 productos que
declaran un `codigo_bonificacion`, sólo `BODHP106` existía —y por
accidente: el proveedor lo puso como una fila más de su lista de precios—.
Sin el producto, la excepción de precio cero de `1015` no habilitaba nada.

Se crearon **18**, confirmadas por el administrador el 2026-09-02 sobre un
reporte de priorización. El criterio, con datos: **par regular ACTIVO y con
precio vigente en los 6 canales**, o sea productos que hoy se pueden vender
y cuya bonificación se puede necesitar mañana.

```
BODHP002  BODHP003  BODHP007  BODHP008  BODHP016  BODHP019
BODHP022  BODHP206  BODHP207  BODHP208  BODHP217  BODHP301
BODHP303  BODHP304  BODHP402  BODHP405  BODHP407  BODHP408
```

Cada una copia del par regular la descripción **exacta**, presentación,
unidad de medida, proveedor, código de proveedor y principio activo. La
descripción idéntica es deliberada: es lo que hace que
`displayNombreProducto` pueda marcarlas con `(Bonificación)` y que esa
marca sea lo único que las distingue en el buscador — ver "Bonificaciones:
el prefijo `BO`".

**Sin precio en `price_list_items`, a propósito.** Se entregan gratis:
entran al pedido a S/ 0.00 explícito por la excepción de `1015`. Darles
precio las convertiría en un producto vendible más.

Las otras 22 quedaron fuera y siguen sin existir como producto: 16 tienen
el par regular inactivo, 4 no tienen precio en ningún canal (familia DAPHA
y una amoxicilina), `BODHP027` espera el precio de Clínicas de su par y
`BODHP106` ya existía.

### El tratamiento tributario de estas 18 NO está resuelto

Heredan el perfil de su par regular: las 18 quedaron **GRAVADO 18%**. Es lo
único defendible con la información de hoy, pero **no es una decisión de
Contabilidad**, y conviene tratarlo como provisional:

- En el catálogo de NubeFact, de **207 códigos `BO` sólo 2 son INAFECTO**
  (`BODHP109` JAMOL 5 y `BODHP110` GLICOFAST 1000), sin criterio visible
  que explique por qué esas dos y no las otras 205.
- Si el tratamiento correcto de una bonificación es el de **transferencia
  gratuita** —y por lo tanto INAFECTA por regla general—, entonces estas 18
  están mal y hay que corregirlas.

**Cómo corregirlas si Contabilidad lo determina:** versionando el perfil
(cerrar el vigente con `vigente_hasta` e insertar el nuevo), nunca
editándolo en su lugar. Los pedidos ya emitidos conservan su afectación
porque `order_items` la copia al enviarse. Se cruza con el supuesto
pendiente #1 de Fase 6.

## Qué NO cubre esta fase

Explícitamente fuera de alcance por ahora (ver README y CLAUDE.md):

- Promociones, bonificaciones y escalas de precio — se implementan en
  un paso posterior, cuando exista esa información de Biosana y
  Prades. `products.codigo_bonificacion` ya se guarda desde ahora para
  no perder el dato mientras tanto.
- Pantalla dedicada de asignación de zonas — se gestiona vía
  SQL/dashboard de Supabase por ahora.
- Gestión de stock **transaccional** (reservas, descuento automático al
  despachar, kardex). El nivel de stock se registra a mano o se carga
  masivamente; nada lo mueve solo.
- Integración con NubeFact (documentación electrónica).
- Cálculo real de retenciones.
- Integración con Odoo.
