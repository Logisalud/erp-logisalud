# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Usuario primario: el vendedor.** Toma el pedido **parado en la botica,
con el celular, con una mano ocupada y el cliente esperando**. Esa escena
manda: objetivos táctiles grandes, pocos pasos, nada de escritura larga, y
cada pantalla legible de un vistazo. Un diseño que solo funcione cómodo
sentado frente a una laptop es un diseño equivocado para esta app.

Otros roles, todos con permisos propios por RLS:

- **control_pedidos** — valida clientes nuevos y revisa la documentación
  electrónica. Es también la facturadora.
- **aprobador_comercial** — aprueba pedidos que caen en excepción.
- **operaciones** — prepara y despacha: elige la fuente de stock, captura
  lote y vencimiento, registra el transporte.
- **administrador** — maestros, configuración y cartera.

Los cuatro últimos trabajan desde escritorio; el vendedor, desde el
celular.

## Product Purpose

Módulo de toma, validación, despacho y documentación electrónica de
pedidos de LOGISALUD (distribución farmacéutica, Perú).

**El éxito es reemplazar el piloto de WhatsApp.** Hoy los pedidos llegan
como mensajes y alguien los transcribe a mano. El éxito es que el pedido
**entre una sola vez, bien, y no se retipee nunca más**: del vendedor a la
validación, al despacho y al comprobante, sin que nadie vuelva a copiar
datos de un lado a otro.

De ahí se sigue el estándar real de comparación: **cargar un pedido acá
tiene que ser al menos tan rápido y tan poco frustrante como escribirlo
por WhatsApp.** Si es más lento o más trabajoso, el vendedor vuelve al
chat y el módulo fracasa, por correcto que sea por dentro.

## Positioning

No es un ERP genérico adaptado: es el flujo de pedidos de LOGISALUD con
sus reglas fiscales peruanas adentro (RUC/DNI, tipo de comprobante,
guía de remisión, ubigeo) y con la cartera real ya cargada.

Lo que un producto vecino no puede copiar con verdad: **el pedido nace en
la mano del vendedor y llega hasta el borrador del comprobante sin
retipeo, con cada paso auditado y con las reglas de SUNAT aplicadas en la
base de datos, no en la interfaz.**

## Operating Context

Flujo del pedido, con los estados reales:

```
DRAFT → SUBMITTED → (validación automática)
      → NEW_CUSTOMER_VALIDATION / PENDING_COMMERCIAL_APPROVAL
      → READY_FOR_OPERATIONS → DISPATCHED
```

- **Toma** (`/pedidos/nuevo`, `/pedidos/[id]`) — el vendedor elige cliente,
  dirección y condición de pago, y carga líneas.
- **Validación** (`/control-pedidos/*`, `/aprobador-comercial`) — clientes
  nuevos y excepciones.
- **Despacho** (`/operaciones`, `/operaciones/[id]`) — fuente de stock,
  almacén, transporte, y lote/vencimiento por línea.
- **Documentación** (`/control-pedidos/documentos`) — borradores de
  comprobante y guía de remisión.
- **Maestros y configuración** (`/admin/*`) — productos, listas de precios,
  clientes, zonas, canales, despacho, empresa emisora, notificaciones.

Al pasar a `SUBMITTED` sale un correo con el detalle y un Excel adjunto.
Al confirmar el despacho se generan los dos borradores JSON.

## Capabilities and Constraints

**Confirmadas y en producción:** maestros, importador de listas de precios,
toma de pedido hasta `DISPATCHED`, cartera real de 3.402 clientes cargada
por importador CSV, notificación por correo con Excel, borradores de
comprobante y guía.

**Restricciones técnicas que el diseño no puede ignorar:**

- **Celulares modestos.** Gama media/baja, pantallas chicas, poca RAM y
  datos caros. Descarta efectos pesados, imágenes grandes y animación
  costosa. El peso de cada pantalla es una decisión de diseño, no un
  detalle de implementación.
- **PostgREST tope las respuestas en 1.000 filas.** Ningún catálogo grande
  se puede precargar para filtrar en el navegador: la búsqueda va al
  servidor. Ya causó un bug real en el selector de clientes.
- **RLS por zona.** El vendedor solo ve y encuentra clientes de su(s)
  zona(s). Toda búsqueda o listado hereda ese recorte.

**Bloqueos duros que son reglas de negocio, no fricción a eliminar:**

- Sin dirección de entrega activa **no se puede tomar el pedido**. Se
  captura en el mismo flujo, pero no se saltea.
- Cliente sin RUC de contribuyente válido queda restringido a **boleta**,
  por constraint en la base.
- El despacho lo confirma **Operaciones**, nunca el vendedor. La fuente de
  stock también.
- `DISPATCHED` es terminal: no hay anulación de despacho.

**Explícitamente indeciso, no inventar:**

- El **canal de venta real** de la cartera: los 3.402 clientes entraron
  como `Horizontal`, que es un supuesto temporal y afecta el precio.
- La **condición de pago habitual** quedó nula para la cartera migrada.
- **Quién elige el comprobante** cuando el cliente admite factura o
  boleta: hoy nadie lo elige al tomar el pedido.
- **Peso de los productos** (`peso_unitario_futuro`), que la guía de
  remisión exige.

No existen todavía: motor de promociones y escalas, stock en tiempo real,
integración real con NubeFact, ni cálculo de retenciones.

## Brand Commitments

**Fijo, no se replantea:**

- Colores `logisalud.green` **#4BB168** y `logisalud.teal` **#4ABCC2**
  (`tailwind.config.ts`).
- Tipografías **Oswald** para títulos y **Poppins** para cuerpo, cargadas
  vía `next/font/google`.

**Libre para replantear:** grilla, tarjetas, formularios, navegación,
espaciado, jerarquía, estados y animación. El usuario lo confirmó
explícitamente: el sistema de componentes actual (`.card`, `.btn-primary`,
`bg-gray-50`) es el incumbente, no un compromiso.

Idioma: **español rioplatense-neutro peruano**, tuteo, sin jerga de
desarrollo en pantallas de usuario.

**Convención sobre apuesta formal (preferencia permanente).** Ante la
elección entre una dirección visual con apuesta y el estándar de la
categoría, el usuario eligió el estándar. Queda como compromiso: la
interfaz se ve como lo que cualquiera espera de un módulo de pedidos, y la
ambición se gasta en acabado —espaciado, jerarquía, estados, microcopy,
accesibilidad, rendimiento— y no en originalidad formal. Ejecutar la
convención a fidelidad completa, sin ironía y sin gestos raros colados por
el costado.

**La vara de acabado son Shopify (admin y POS), Stripe (dashboard) y
Linear.** No como referencias visuales a copiar, sino como el nivel de
terminación que este producto tiene que alcanzar: la densidad respirada y
los targets móviles de Shopify, la precisión numérica y el microcopy de
error de Stripe, y el pulido de detalle y la velocidad percibida de
Linear.

## Evidence on Hand

- **Cartera real cargada**: 3.402 clientes, 3.248 activos, con zonas y
  vendedores reales. 21 razones sociales traen asteriscos tipeados a mano
  del piloto de WhatsApp; se limpian solo para mostrar.
- **Datos fiscales reales del emisor** en `pedidos.company_settings`, y la
  dirección y ubigeo confirmados del Almacén Central Lima.
- **Formato real de guía de remisión** ya emitida, replicado en los
  borradores (`<nombre> LT: <lote> FV: DD/MM/AAAA`).
- **Documentación viva**: `docs/business-rules.md`, `docs/data-model.md`,
  `docs/workflows.md`, `docs/architecture.md`.

**Lo que NO existe y no se debe fabricar:** testimonios, métricas de uso,
casos de éxito, comparativas con competidores, precios de licencia y
cualquier claim de resultados. Tampoco hay imágenes de producto ni fotos
de los usuarios.

## Product Principles

1. **La escena manda: de pie, una mano, cliente esperando.** Cualquier
   decisión que se sienta bien en un monitor y mal parado en una botica
   está mal tomada.
2. **El estándar a vencer es WhatsApp.** Más rápido y menos frustrante que
   escribir un mensaje, o el vendedor vuelve al chat.
3. **Un dato se escribe una vez.** El módulo existe para eliminar el
   retipeo; cualquier pantalla que obligue a recapturar algo que el
   sistema ya sabe es un defecto de producto.
4. **Los bloqueos duros se explican, no se disimulan.** Cuando el flujo
   frena —sin dirección, sin RUC válido, sin stock— la pantalla dice qué
   pasa y cómo salir, ahí mismo.
5. **La verdad vive en la base de datos.** Las reglas fiscales y de
   permisos se aplican en SQL; la interfaz las refleja, nunca las
   reemplaza ni las contradice.

## Accessibility & Inclusion

- **Objetivos táctiles grandes**: el piso actual es `min-h-12`, por la
  escena de uso de pie y con una mano.
- **Legibilidad con luz difícil**: se usa de día, en mostradores
  iluminados de frente. El contraste real importa más que la elegancia
  del gris.
- No hay un estándar formal comprometido (WCAG AA u otro). Queda como
  decisión abierta, no como hecho.
