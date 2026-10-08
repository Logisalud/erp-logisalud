# Design — WMS Logisalud

Registro del mundo visual **construido** en el Batch 1 (modo Operar, mundo de marca heredado de `@logisalud/design-system`).
Escrito desde lo que existe en `app/`, `components/` y `domain/vista-mapa.ts`, no desde una intención previa.

## Mundo
Un plano vivo del almacén Lurín sobre gris verdoso de marca. El verde Logisalud es el único acento de acción; el teal es foco
y selección. Superficies blancas con borde de 1 px y sombras suaves (`shadow-xs/sm/md` del preset). Nada de gradientes ni
glassmorphism: lo que brilla es lo que pide atención.

## Color
- Neutros del preset (`gray-50…900`, con un pelo de verde). Fondo `bg-gray-50`, texto `text-gray-900`.
- Acción: `logisalud-green` `#4BB168` (botón primario, hover `green-600`, press `green-700`). Foco: anillo teal `#4ABCC2` al 45 %.
- **Estado sanitario** (siempre con texto + ícono): Aprobado = verde (`ShieldCheck`), Cuarentena = índigo (`Hourglass`),
  Bajas/Rechazados = rojo (`Ban`). Aviso = ámbar. Se evitó ámbar para Cuarentena porque ÁMBAR es una condición futura (VERDE/ÁMBAR).
- **Propietario** (siempre con letra): Logissa `#2F7644` (L), Diphasac `#2E7C80` (D), Triamed `#6B4FB3` (T), Medic Pharma Lab
  `#B45309` (M), AJR Labs `#A21C6B` (A). Definidos en `components/propietarios-color.ts`.

## Tipografía
Oswald (`font-heading`) en mayúsculas con tracking para títulos de pantalla y de sección; Poppins (`font-body`) para todo lo demás.
Números alineados (`.tabular`). Cuerpo ≥ 14 px; los rótulos del mapa son SVG de 14/10.5 unidades y escalan con el zoom.

## Estructura
- **Shell:** barra lateral (íconos en tablet, íconos + texto desde 1280 px), barra superior con la búsqueda universal (Ctrl/Cmd+K),
  navegación inferior de 5 destinos en teléfono con hoja "Más".
- **Almacén (capas primero):** una barra de capas (Propietario · Estado · Ocupación) decide qué responde el mapa; la leyenda debajo
  lleva los números de esa capa y filtra por propietario. El panel de posición (drawer) muestra el rack **de frente** (niveles 4→1,
  subracks en el nivel 1). En teléfono no hay plano: búsqueda y ubicaciones en texto por rack, y el drawer es una hoja inferior.
- **Inicio por rol:** "Qué necesita atención" (lista priorizada, no tarjetas iguales), unidades por estado, ubicaciones usadas por propietario.
- **Productos:** tabla en PC/tablet, tarjetas en teléfono; detalle con registro sanitario, validación (solo Dirección Técnica) y "Dónde está".

## Componentes
`ChipEstado`, `ChipRS`, `ChipValidacion`, `ChipPorVerificar`, `ChipPorTrasladar` (todos texto + ícono); `PaletaBusqueda` (modal con
debounce y descarte de respuestas viejas); `MapaAlmacen` (SVG, pan/zoom/ajustar/tamaño real, teclado); `DrawerPosicion`; `Shell`; `BannerDemo`.
Botones: píldora `btn-primary`/`btn-secondary` (≥ 48 px de alto), campos `campo` (48 px).

## Flujos de tarea con muchas líneas (Mover, revisión)
Se empieza por lo que la persona ya sabe (el origen) y se busca escribiendo, nunca en desplegables. Una sola acción principal, fija
abajo en el teléfono (sobre la barra de navegación) y en línea en pantallas grandes, con un resumen vivo («3 líneas · 126 u · B-1 → B-2»)
y, si falta algo, qué falta. Las líneas son filas marcables con casilla de 24 px y cantidad editable; el destino se valida al elegirlo
y explica por línea por qué no sirve. La revisión es por línea («Coincide» / «No coincide», con nota obligatoria en el segundo caso).

## Estados de pantalla
Vacío (con qué hacer), cargando (esqueleto con la forma de la pantalla), error (qué pasó y cómo seguir, con reintento), éxito
(mensaje corto, sin celebración desmedida). Sin emoji: íconos Lucide en un solo trazo.

## Movimiento
Una sola entrada con intención: panel lateral (200 ms) y hoja inferior (220 ms), con curva exponencial; respeta `prefers-reduced-motion`.

## Accesibilidad
Foco visible, objetivos ≥ 44–48 px, el mapa con `aria-label` por celda y teclado (+ − 0, flechas, Enter), búsqueda y lista como alternativa,
resultados de búsqueda anunciados con `aria-live`. El mapa nunca es el único camino.

## Pendiente (no construido)
Herramienta de calibración del plano, capas de vencimiento/diferencias, acciones del drawer (mover, contar, historial), estados de Contramuestra.
