# Sistema de diseño — apps/cobranzas

Ver la hoja visual en `/cobranzas/sistema-diseno` (sin enlace en el menú
principal — entrar por URL directa).

## Por qué este paquete no usa `@logisalud/design-system` como preset

`packages/design-system` ya existe y ya tiene tokens reales (colores,
tipografía, radios, sombras) que coinciden con la identidad de marca —
no es un placeholder (el CLAUDE.md raíz tenía esa nota desactualizada,
corregida junto con este cambio). Lo consumen `apps/compras` y `apps/wms`
vía `presets: [require('@logisalud/design-system/tailwind-preset')]`.

**`apps/cobranzas` no puede hacer lo mismo.** Ese preset pisa la escala por
defecto de Tailwind (`gray`, `green`, `teal`, `rounded-sm/md/lg`,
`shadow-sm/md`) para reskinear pantallas viejas sin tocarlas — funciona
porque WMS y Compras son apps aisladas. Cobranzas comparte **un solo**
`app/layout.tsx`, un solo `globals.css` y un solo build de Tailwind con:

- `/v/[token]` — la vista del vendedor, sin login, usada por el piloto de
  WhatsApp. **No cambia en ninguna fase de este rediseño.**
- `/login` — vive en `packages/auth`, compartida con Pedidos/Compras.

Si el preset pisara `gray-500`/`rounded-md`/`shadow-sm`, esas dos pantallas
cambiarían de apariencia sin que nadie tocara un archivo suyo.

## La solución: tokens aditivos

`tailwind.config.js` lee los mismos valores del preset compartido (vía
`require('@logisalud/design-system/tailwind-preset')`, sin usarlo como
`presets: [...]`) y los expone bajo **nombres nuevos** que conviven con la
escala de Tailwind sin reemplazarla:

| Nombre nuevo (cobranzas) | Mismo valor que | Uso |
|---|---|---|
| `brand-green-50…900` | `green-*` del preset | Verde institucional — texto, fondos, bordes |
| `brand-teal-50…900` | `teal-*` del preset | Teal institucional — secundario |
| `ink-50…900` | `gray-*` del preset | Neutrales con matiz verdoso de marca |
| `rounded-ds-xs/input/card/xl/2xl` | `borderRadius.sm/md/lg/xl/2xl` del preset | Radios — nombres propios, no pisan `rounded-sm/md/lg` |
| `shadow-ds-xs/sm/md/lg/xl/brand` | `boxShadow.*` del preset | Sombras — nombres propios, no pisan `shadow-sm/md` |

**Para resincronizar** si el preset cambia: no hay que hacer nada manual —
`tailwind.config.js` lee los valores en build time desde
`@logisalud/design-system/tailwind-preset`. Si un día se agrega un color o
radio nuevo al preset, hay que agregar su alias aditivo acá a mano (no se
copian automáticamente los nombres, solo los valores que ya se mapearon).

`logisalud.green`/`logisalud.teal` (los nombres viejos, usados en código
anterior a este sistema) se mantienen intactos — no se tocan.

Tipografía: `font-oswald`/`font-poppins` ya existían antes de este cambio
(cargadas en `app/layout.tsx` con `next/font/google`, vía las variables CSS
`--font-oswald`/`--font-poppins`) — no hubo que agregar nada ahí. Los
alias `font-heading`/`font-body` (para pantallas compartidas con
`packages/auth`) tampoco se tocaron.

## Componentes — `components/ds/`

Viven en `apps/cobranzas`, NO en `packages/design-system` (ese paquete solo
trae tokens + `BrandMark`, no componentes de `core/`/`forms/`/`feedback/`
todavía — ver su propio README). Migrarlos a un paquete compartido de
verdad es un paso aparte y más grande, fuera de este rediseño.

| Componente | Para qué |
|---|---|
| `PageHeader` | Título + subtítulo + migas + acciones, consistente en toda pantalla nueva |
| `Badge` | Estado con semáforo (`ok`/`alerta`/`riesgo`/`critico`/`neutral`) |
| `Button` | Jerarquía primario/secundario/peligro, con estado `cargando` |
| `KpiCard` | Valor + meta + semáforo + variación — tarjetas de indicadores |
| `FilterBar` / `FilterField` | Contenedor de filtros |
| `DataTable` | Tabla genérica: encabezado fijo opcional, alineación por columna, fila destacada |
| `EstadoVacio` / `EstadoCargando` / `EstadoError` | Los tres estados que toda pantalla debe cubrir |
| `ConfirmDialog` | Confirmación para acciones irreversibles (anular, eliminar) |

Semáforo compartido en `components/ds/tokens.ts` (`SEMAFORO_CLASES` /
`SEMAFORO_LABEL`) — una sola definición de qué significa cada color, para
que las tarjetas KPI, los badges de fase y los indicadores usen el mismo
criterio visual.

Formato de números/fechas: `lib/formato.ts` (`fmtMoneda` → `S/ 1,234.56`,
`fmtFecha` → `dd/mm/aaaa`, `fmtEntero`, `fmtPorcentaje`). Nuevo para
pantallas que adopten el sistema de diseño — no reemplaza los `fmt`/
`fmtFecha` locales de pantallas viejas todavía (eso es trabajo pantalla por
pantalla en la Fase Final, con diff puramente de presentación).

## Íconos

`lucide-react` (misma versión que `apps/wms`, `^0.468.0`) — no había
ninguna librería de íconos en `apps/cobranzas` antes. Reemplaza los emojis
del menú y las pantallas, pantalla por pantalla, en la Fase Final.

## Qué NO cambia

- `/v/[token]` y sus componentes — ni un archivo, ni una clase, ni una
  dependencia que pueda afectar su render.
- `/login`, `packages/auth`, `packages/design-system` — no se editan.
- `apps/pedidos`, `apps/compras`, `apps/wms` — no se tocan.
- Lógica de negocio, SQL, API routes, exports — el rediseño es solo
  presentación (JSX + clases).
