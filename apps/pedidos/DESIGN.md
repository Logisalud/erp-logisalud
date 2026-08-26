# Design

Sistema visual de `erp-logisalud-pedidos`, escrito **desde lo construido**
en el rediseño de la toma de pedido (`app/pedidos/nuevo`, `app/pedidos/[id]`).
Describe lo que existe, no lo que se pretendía.

`PRODUCT.md` manda sobre la verdad de producto; este archivo, sobre lo
visual. Donde se contradigan, gana `PRODUCT.md`.

## Compromiso

**El estándar de la categoría, ejecutado a fondo.** Decisión del usuario
por encima de la dirección que salió sorteada: la interfaz se ve como lo
que cualquiera espera de un módulo de pedidos, y la ambición se gasta en
acabado —espaciado, jerarquía, estados, microcopy, accesibilidad,
rendimiento— y no en originalidad formal.

Vara de acabado: **Shopify** (densidad respirada, targets móviles),
**Stripe** (precisión numérica, microcopy de error), **Linear** (pulido de
detalle, velocidad percibida).

## Escena, y lo que fuerza

El vendedor **de pie en la botica, con el celular, una mano ocupada y el
cliente esperando**, de día y con luz de frente. De ahí salen tres reglas
que no son de gusto:

- **Tema claro y de alto contraste.** Un tema oscuro se lava bajo esa luz.
- **Texto secundario nunca por debajo de `slate-600`** (`rgb(71,85,105)`,
  ~7:1 sobre blanco). El gris elegante no se lee al sol.
- **48px de alto mínimo** en todo lo que se toca.

## Color

Estrategia **contenida**: neutros más un acento, que es lo que corresponde
cuando el visitante viene a operar y no a que lo convenzan.

| Rol | Valor | Uso |
|---|---|---|
| Acción primaria | `logisalud.green` `#4BB168` | Solo el botón que hace avanzar el pedido |
| Informativo | `logisalud.teal` `#4ABCC2` | Avisos y acciones terciarias; nunca acción primaria |
| Fondo de página | `slate-50` | El papel de la app |
| Superficie | `#FFFFFF` | Paneles |
| Borde sutil | `slate-200` | Separadores y paneles |
| Borde fuerte | `slate-300` | Campos, donde el borde ES la afordancia |
| Texto | `slate-900` / `slate-600` | Principal / secundario |

Verde y teal son **marca y no se replantean** (`tailwind.config.ts`).

Sobre verde y teal el texto no usa el color de marca crudo, que no llega a
contraste: usa sus versiones oscurecidas `#276b3b` y `#1c6d71`.

**El color nunca es la única señal.** Cada aviso lleva su ícono, y cada
estado de pedido lleva su etiqueta en palabras además de su color.

## Tipografía

- **Oswald** (`font-heading`) en títulos, con `tracking-tight`.
- **Poppins** (`font-body`) en cuerpo.
- Ambas por `next/font/google` — self-hosted, sin pedido a un tercero.
- **`.cifra`** aplica `tabular-nums` a todo dinero y cantidad. Sin esto los
  totales bailan al cambiar de dígito, que es justo lo que hace dudar al
  vendedor cuando le canta el total al cliente.

## Componentes

Definidos en `app/globals.css`:

| Clase | Qué es |
|---|---|
| `.panel` | Superficie base: borde 1px, radio `xl`, sombra con desplazamiento y desenfoque reales |
| `.campo` | Input/select: 48px, borde `slate-300`, borde verde al foco |
| `.etiqueta` | Label de campo |
| `.btn-primary` | Acción que avanza. Verde. Uno por pantalla |
| `.btn-secondary` | Acción alternativa. Borde neutro sobre blanco |
| `.btn-ghost` | Acción terciaria dentro de una fila (quitar) |
| `.aviso-bloqueo` | El flujo se frena por una regla de negocio (ámbar) |
| `.aviso-error` | Algo salió mal (rojo) |
| `.aviso-ok` | Confirmación (verde) |
| `.aviso-info` | Contexto (teal) |
| `.barra-pie` | Barra fija al pie, con `env(safe-area-inset-bottom)` |

`.card` quedó como alias de `.panel` para las pantallas todavía no
rediseñadas.

### Íconos

Set propio en `components/icons.tsx`: grilla de 24, trazo 1.75, extremos
redondeados, `currentColor`. **Prohibido usar glifos Unicode o emoji como
íconos** — se renderizan con la fuente del sistema, cambian entre Android e
iOS y nunca combinan.

### Combobox

`components/combobox.tsx` es el control para elegir de un catálogo. Recibe
`onSearch` y ya trae debounce, teclado, ARIA y descarte de respuestas
viejas. **Se usa en vez de un `<select>` en todo catálogo grande**: un
`<select>` obliga a precargar, y PostgREST corta en 1.000 filas.

## Composición

- Contenedor `max-w-4xl`, `p-4` en móvil y `p-6` desde `sm`.
- Ritmo de separación: `gap-4` entre secciones, `gap-3` dentro de un grupo.
- Un solo `.btn-primary` por pantalla.
- **El total va fijo al pie**, siempre visible, porque es el dato que el
  vendedor le canta al cliente. El contenido lleva `pb-28` para que la
  última línea nunca quede tapada.

## Motion

**Una sola pieza en toda la pantalla**: la línea recién agregada entra con
`linea-entra` (220ms, ease-out exponencial), desde su estado final, así que
sin JS el contenido igual está visible. `prefers-reduced-motion` la
desactiva junto con toda transición.

No hay motion decorativo. La restricción de celulares de gama media/baja lo
hace una decisión de rendimiento, no de gusto.

## Estados

Toda pantalla resuelve, explícitamente: vacío, cargando, error, guardado,
foco de teclado, y el bloqueo de negocio con su salida.

**Los bloqueos duros se explican, no se disimulan.** Cuando el flujo frena
—sin dirección, sin RUC válido, cambio de cliente que movería precios— el
mensaje dice el problema **y la salida**, ahí mismo.

## Lo que este sistema rechaza

- Glifos Unicode o emoji como íconos.
- Kickers o antetítulos arriba de un título.
- Texto con gradiente; el énfasis sale de peso o tamaño.
- Sombras duras sin desenfoque.
- Vidrio y desenfoque como decoración.
- Monoespaciada como disfraz de "técnico"; para cifras va `tabular-nums`.
- Tarjetas iguales de ícono + título + texto como estructura de página.
- Color como única señal de estado.
