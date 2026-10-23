# Seguimiento de pedidos para clientes de distribución — plan (S9b)

Estado: **PLAN. No se construye todavía** (pedido de Sebas, 2026-10-23). Nada de esto toca Pedidos sin la aprobación de Sebas (D-49).
Dónde va en el plan: **justo después de S9** (Mis rutas y tracking), porque los pasos «Llegó a tu dirección» y «Entregado» salen de los eventos de ruta de S9. Decisiones D-141 a D-148 en `decisiones-pendientes.md`.

## 0. En una frase

Cada pedido de un cliente de distribución tiene **un enlace público, largo e impredecible**, que el WMS crea junto con la Orden de Salida y le entrega a Pedidos. El vendedor lo copia desde Pedidos con un botón y se lo manda al cliente por donde prefiera. El cliente abre una página para celular, sin iniciar sesión, y ve una línea de tiempo que se actualiza sola. No ve nada interno.

## 1. Qué ve el cliente

Página `Tu pedido de Logisalud`, pensada primero para el celular (390×844), con la marca de Logisalud y nada más.

| Paso | Cuándo se marca | De dónde sale en el WMS |
|---|---|---|
| **Pedido recibido** | Cuando el almacén recibe el pedido y se crea su Orden de Salida | `salidas.creada_en` |
| **Preparando tu pedido** | Cuando empieza el picking (primer producto marcado o la hoja asignada a quien pickea) | `ordenes_picking` (inicio) |
| **Salió de almacén (en ruta)** | Cuando se confirma la salida | `confirmar_salida` (hora real de la salida) |
| **Llegó a tu dirección** | Cuando el conductor marca «Llegué» | evento de ruta de S9 |
| **Entregado** | Cuando el conductor marca «Entregado» | evento de ruta de S9 |

- Cada paso hecho muestra **fecha y hora** (hora de Lima, por ejemplo «23 oct, 3:45 p. m.»). Los pasos que faltan salen en gris, sin hora.
- **Sin hora estimada, en ningún lugar.** Ni «llega hoy», ni «entre 2 y 4».
- **Si no se entrega** («No entregado» o «Rechazado» de S9): el último paso cambia a un aviso neutral — *«No pudimos completar la entrega. Tu vendedor se comunicará contigo.»* — con su fecha y hora. Nunca se muestra el motivo interno, ni la diferencia entre «no entregado» y «rechazado».
- **Si el pedido se cancela** (SA-3): *«Este pedido ya no está en preparación. Tu vendedor se comunicará contigo.»* (texto por confirmar).
- **Si se reprograma** (S10/S11): el pedido se prepara con una **Orden de Salida nueva** y el **mismo enlace** pasa a mostrar la orden nueva. La línea de tiempo vuelve a «Preparando» con una nota neutral: *«Estamos preparando tu pedido de nuevo.»* El cliente no tiene que recibir otro enlace.
- **Se actualiza sola:** la página pregunta cada **15 segundos** mientras está visible (se pausa si la pestaña queda en segundo plano; después de 10 minutos baja a cada 60 s; se detiene en un estado final). Muestra «Actualizado hace X». Sin JavaScript, un `<noscript>` recarga cada 60 s.
- **Pregunta final, opcional, de un toque** (solo si se entregó): *«¿Cómo fue tu entrega?»* con **tres caritas con texto** (Mal · Regular · Muy bien; nunca solo ícono ni solo color). Botones de 48 px o más. Una sola respuesta por entrega; después dice «Gracias».
- **Lo que NUNCA muestra:** precios, importes, lotes, vencimientos, productos, cantidades, nombres ni teléfonos del personal, placa, fotos, firmas ni ninguna evidencia, motivos internos, ni la dirección. Tampoco el nombre del cliente. (Por confirmar: el **número del pedido** sí se muestra, para que el cliente reconozca que es el suyo — es el único dato de identificación y el cliente ya lo tiene en sus documentos.)
- Enlace inválido, revocado o vencido: **una sola pantalla idéntica** para los tres casos — *«Este enlace ya no está disponible. Si necesitas ayuda, comunícate con tu vendedor.»* — para que nadie pueda saber si un enlace existió.
- Accesibilidad: texto + ícono en cada estado, `aria-live="polite"` cuando cambia el estado, respeta «reducir movimiento», se lee bien a 360 px.

## 2. El enlace: seguridad

| Tema | Decisión propuesta |
|---|---|
| **Token** | 256 bits, base64url (43 caracteres). Nunca el número ni el id del pedido. Se calcula como `HMAC-SHA256(SEGUIMIENTO_SECRETO, pedido ‖ versión)`; el secreto vive solo en variables de entorno |
| **Qué se guarda** | Solo el **hash SHA-256 del token** (para buscarlo) y la `versión`. La base de datos nunca guarda el enlace completo: si se filtra la tabla, no sirve para entrar. El WMS vuelve a calcular el token cuando necesita armar el enlace |
| **Sin inicio de sesión** | Ruta pública `/seguimiento/[token]` (en el WMS: `/wms/seguimiento/[token]`; ver §6). Sin cookies, sin analítica ni scripts de terceros |
| **Revocable** | El Jefe de Transporte o el Jefe de Almacén puede **revocar** el enlace de un pedido (con motivo) o **generar uno nuevo** (sube la `versión` y el anterior deja de funcionar). Queda en la auditoría. Pedidos recibe el aviso y borra el enlace viejo |
| **Vence** | **7 días después de la entrega** (parámetro `seguimiento_dias_tras_entrega`). Un pedido nunca entregado ni cancelado vence a los **30 días de creado** (parámetro). Después de vencer, la pantalla genérica |
| **Qué puede leer la página** | **Una sola función** `wms.seguimiento_publico(token)` (SECURITY DEFINER) que devuelve únicamente: pasos con hora, estado final y si ya hay respuesta. Se concede a un rol sin permisos sobre ninguna tabla. **No usa la llave de servicio** (regla del WMS: ninguna ruta salta RLS). Una segunda función `wms.seguimiento_responder(token, valor)` guarda la carita |
| **Prueba de que no hay fugas** | Prueba de base de datos que verifica el **conjunto exacto de campos** que devuelve la función (lista blanca) y que el rol público **no puede leer ninguna tabla** (`aislamiento.test.ts`) |
| **Cabeceras** | `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `robots.txt` que lo prohíbe, CSP estricta |
| **Fuerza bruta** | 2²⁵⁶ combinaciones: no se adivina. Aun así, límite de solicitudes por IP (regla de firewall de Vercel, sin costo) y respuesta idéntica para token inválido |

## 3. Qué órdenes tienen enlace

- **Sí:** pedidos de **clientes de distribución** (los que llegan por la bandeja y las ventas manuales tipo A, que siempre traen número de pedido).
- **No:** salidas por cuenta de un cliente de almacenamiento (tipo B), muestras y devoluciones al proveedor (tipo C): no hay vendedor ni cliente de distribución que las siga.
- El enlace nace con la **Orden de Salida** (dato pedido por Sebas). Una venta manual «por conciliar» ya lo tiene, atado al número de pedido que escribió el Jefe de Transporte; al conciliar no cambia.
- Una sola vigencia por **pedido**, no por orden: si hay reprogramación, el enlace sigue valiendo y apunta a la orden vigente.

## 4. Del WMS a Pedidos (contrato)

Se agregan al contrato `contrato-pedidos-guia.md` (el mismo transporte firmado `POST /integracion/wms/eventos`, `evento_id` idempotente, reintentos con la bandeja `eventos_pedidos`). **Tres eventos nuevos:**

```json
{ "evento_id": "uuid", "tipo": "SEGUIMIENTO", "creado_en": "…", "pedido_id": "ped-123", "pedido_numero": "PED-00123",
  "salida": "OS-2026-00012", "enlace": "https://…/seguimiento/<token>", "vence_en": null, "revocado": false }

{ "evento_id": "uuid", "tipo": "ESTADO_LOGISTICO", "creado_en": "…", "pedido_id": "ped-123", "pedido_numero": "PED-00123",
  "salida": "OS-2026-00012", "estado": "PREPARANDO", "ocurrido_en": "2026-10-23T20:45:00Z" }

{ "evento_id": "uuid", "tipo": "ENCUESTA_ENTREGA", "creado_en": "…", "pedido_id": "ped-123", "pedido_numero": "PED-00123",
  "salida": "OS-2026-00012", "valor": 3, "respondida_en": "2026-10-23T22:10:00Z" }
```

- `estado`: `RECIBIDO`, `PREPARANDO`, `EN_RUTA`, `LLEGO`, `ENTREGADO`, `NO_ENTREGADO` (cubre «rechazado»), `CANCELADO`. Los estados que el WMS ya manda (`GUIA_EMITIDA`, `GUIA_ANULADA`) no cambian.
- `SEGUIMIENTO` se envía **al crear la orden** y de nuevo si el enlace se **revoca** o se **regenera** (con `revocado: true` o el enlace nuevo).
- `ENCUESTA_ENTREGA`: solo el valor (1 = Mal, 2 = Regular, 3 = Muy bien). **Sin comentarios libres, sin datos personales.**
- El WMS **no necesita el teléfono del cliente** y no lo recibe.
- Esto es parte de **S14 (lado Pedidos)**, que ya contempla «recibir eventos»; aquí se detalla lo que le toca a Pedidos para el seguimiento.

## 5. Qué cambia en Pedidos (propuesta; **no se implementa sin aprobación de Sebas, D-49**)

Todo **aditivo**: no se toca ninguna tabla, política ni función existente, ni `confirm_dispatch`, ni los estados del pedido.

1. **Base de datos (una migración nueva):**
   - `pedidos.seguimiento_logistico` (una fila por pedido): `enlace`, `estado_logistico`, `ultimo_evento_en`, `vence_en`, `revocado_en`, `encuesta_valor` (1–3), `encuesta_en`. RLS desde el `create table`: lo lee el **vendedor del pedido** y los roles de Operaciones y Control de Pedidos con las mismas reglas de visibilidad de los pedidos; **nadie escribe** desde la aplicación (solo la ruta de integración).
   - `pedidos.eventos_wms_recibidos (evento_id primary key)` para la idempotencia.
2. **Ruta de integración** `POST /integracion/wms/eventos` (la misma que ya exige el contrato de guías, D-80): verifica la firma HMAC y el plazo de 300 s (el verificador de referencia está en el WMS, `services/pedidos/firma.ts`; se copia, no se comparte código entre apps), guarda el evento y actualiza `seguimiento_logistico`. Responde `2xx` si ya lo había recibido.
3. **Pantalla del pedido** (`app/pedidos/[id]/page.tsx`, bloque nuevo «Seguimiento para tu cliente»):
   - Botón **«Copiar seguimiento»** → copia al portapapeles: *«Hola, aquí puedes seguir tu pedido de Logisalud en tiempo real: [enlace]»* y muestra «Copiado ✓» (con respaldo seleccionable si el navegador no deja copiar). El vendedor lo pega donde prefiera.
   - Estado logístico en palabras (con la misma etiqueta del cliente) y hora del último paso.
   - La **respuesta de satisfacción** (carita con texto y fecha) cuando ya llegó.
   - Si no hay enlace, el bloque no aparece: **las pantallas actuales quedan idénticas**. Si venció: «El enlace venció el [fecha]».
4. **Teléfono del cliente: no hace falta ahora.** Pedidos ya guarda el celular del cliente (`public.clientes.celular`, que `submit_order` exige y que el vendedor edita en el pedido). Una mejora posterior —un botón «Enviar por WhatsApp» con ese número— no necesita ningún campo nuevo. **Hoy no hay enlace directo a WhatsApp, ni WhatsApp Business API, ni costo.**
5. **Qué no se toca:** listas, filtros, estados (`DISPATCHED`, etc.), políticas existentes, importadores.

### Cómo se prueba que Pedidos sigue funcionando

1. **Migración aditiva y reversible**, probada en Postgres local: se corre toda la cadena de Pedidos antes y después y se compara el listado de `pg_policies`, columnas y funciones existentes (**la diferencia debe ser solo lo nuevo**).
2. **CI de Pedidos completa** (`lint`, `test`, `build`) sin tocar ninguna prueba existente; pruebas nuevas de dominio (armado del mensaje, etiquetas de estado) y de la ruta (firma válida, firma inválida, fuera de plazo, evento repetido, versión de enlace nueva).
3. **Prueba de contrato en los dos lados** con el mismo JSON de ejemplo (copiado, no compartido): lo que el WMS emite lo valida el esquema de Pedidos y viceversa.
4. **Interruptor natural:** sin eventos no cambia nada en pantalla; si se revierte la migración, la ruta queda sin efecto.
5. **Preview de Pedidos que prueba Sebas:** un script firmado manda eventos de ejemplo; se ve el botón, el estado y la carita, y se verifica que crear, enviar y despachar un pedido funciona igual que antes.

## 6. Dominio propio del enlace

- El WMS arma el enlace con un **parámetro**: `SEGUIMIENTO_BASE_URL` (por ejemplo `https://logisalud.com/seguimiento`). **Se guarda el token, nunca la URL completa**, así que cambiar de dominio no rompe ningún enlace ya entregado.
- Mientras no exista el dominio, el enlace usa la dirección del WMS (`…/wms/seguimiento/[token]`). La ruta interna es siempre la misma; el dominio propio es una **reescritura** (igual que la de Multi-Zones, D-23).
- **Pendiente para la salida a producción** (con aprobación de Sebas): el dominio, su certificado, la reescritura y las variables `SEGUIMIENTO_BASE_URL` y `SEGUIMIENTO_SECRETO`. Los enlaces de la versión anterior del dominio siguen valiendo.
- Alternativa descartada por ahora: una app aparte para el seguimiento. Se prefiere la zona del WMS (mismo código de estados, nada para sincronizar); la página queda aislada por la función pública y el rol sin permisos.

## 7. Cómo se construiría (PRs chicos y apilados, después de S9)

| Paso | Qué | Depende de |
|---|---|---|
| **SG-1** | Datos y seguridad: `wms.seguimientos`, token y hash, funciones `seguimiento_publico` y `seguimiento_responder`, rol público, parámetros de vigencia; pruebas de base de datos (lista blanca de campos, sin lectura de tablas, token inválido = vencido = revocado, re-ejecutable) | S8, S9 |
| **SG-2** | La página pública para celular (390×844 manda), línea de tiempo, actualización cada 15 s, pantalla genérica, cabeceras, «demo» con controles para avanzar los estados; Impeccable + Playwright en los 4 viewports | SG-1 |
| **SG-3** | Revocar y regenerar (Jefe de Transporte / Almacén), encuesta de tres caritas, eventos `SEGUIMIENTO`, `ESTADO_LOGISTICO` y `ENCUESTA_ENTREGA` a la bandeja `eventos_pedidos`, contrato documentado y probado contra el doble de Pedidos | SG-2 |
| **SG-4** | **Lado Pedidos** (botón «Copiar seguimiento», campo del enlace, respuesta de satisfacción, ruta de eventos) | **Aprobación de Sebas (D-49)**; SG-3 y S14 |

Pruebas del WMS: dominio (mapa de estados a pasos, vigencia, token único y de 43 caracteres), base de datos (aislamiento del rol público, campos devueltos, una respuesta por entrega, la carita genera su evento), componentes, E2E en los 4 viewports con eventos simulados, y una prueba de que la página no hace ninguna llamada fuera de su origen.

## 8. Qué necesito que confirmes (con lo que haré por defecto)

1. **Vigencia:** 7 días tras la entrega y 30 días si nunca se entrega. *(por defecto, ambos parámetros)*
2. **«Pedido recibido»** = cuando el almacén crea la Orden de Salida (no cuando el vendedor registró el pedido en Pedidos). *(por defecto)*
3. **Número del pedido visible** en la página. *(por defecto: sí)*
4. **Cancelación:** el texto «Este pedido ya no está en preparación…». *(por defecto)*
5. **Reprogramación:** el mismo enlace sigue valiendo. *(por defecto)*
6. **Quién revoca o regenera:** Jefe de Transporte y Jefe de Almacén. *(por defecto)*
7. **Datos personales:** la página no muestra ningún dato personal del cliente ni del personal, y la carita es anónima; igual conviene que Contabilidad/Legal confirme que no hace falta aviso adicional.
