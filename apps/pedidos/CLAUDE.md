# CLAUDE.md

Guía para trabajar en `erp-logisalud-pedidos` con Claude Code.

## Qué es este repo

Módulo de toma, validación, despacho y documentación electrónica de
pedidos de LOGISALUD. **Repo independiente** de `erp-logisalud` (ERP de
Cuentas por Cobrar) — no asumir código, tablas ni convenciones de ese
repo salvo la identidad visual de marca.

Estado: Fase 1 (base técnica), Fase 2 (maestros: clientes, zonas,
productos, proveedores, canales, condiciones de pago, configuración
tributaria) y Fase 4 (pedidos hasta `READY_FOR_OPERATIONS`, importador de
listas de precios) completadas. La cartera real de clientes ya está
cargada vía importador CSV (ver "Carga de la cartera real de clientes" en
[docs/data-model.md](docs/data-model.md)).

No hay todavía motor de promociones/escalas, gestión de stock, despacho
real, integración NubeFact ni cálculo de retenciones — eso es Fase 5 en
adelante. Antes de implementar cualquiera de esos, leer
[docs/business-rules.md](docs/business-rules.md) y
[docs/data-model.md](docs/data-model.md) — hay supuestos de negocio
marcados explícitamente como "pendientes de confirmar con Contabilidad".

## Stack y convenciones

- Next.js 14 (App Router), TypeScript, Tailwind CSS 3.
- Supabase: todas las tablas de este módulo van en el schema `pedidos`
  (nunca `public`) — ver [docs/architecture.md](docs/architecture.md).
  Los clientes de Supabase (`lib/supabase/*`) ya fijan
  `db: { schema: 'pedidos' }`.
- RLS activado en toda tabla nueva desde el `create table`, no como
  paso posterior.
- La service role key solo se usa en `lib/supabase/admin.ts` (importa
  `server-only`) y desde `services/`. Nunca importar ese cliente desde
  un componente `"use client"`.
- Auditoría de acciones de negocio: llamar a `services/audit-log.ts`
  (`logAudit`) explícitamente desde la Server Action / Route Handler
  que hace el cambio. No asumir que existe un trigger genérico — la
  única excepción es `user_roles`, que sí tiene trigger de respaldo.

## Estructura de carpetas

- `app/` — rutas y layouts (App Router).
- `components/` — UI reutilizable, sin lógica de negocio.
- `features/` — módulos de negocio (UI + hooks de una feature).
- `lib/` — utilidades transversales sin efectos de negocio.
- `services/` — lógica de servidor con efectos (datos, integraciones).
- `domain/` — tipos y reglas de dominio puras, sin dependencias de
  Next.js/Supabase.
- `supabase/migrations/` — migraciones SQL numeradas secuencialmente.
- `docs/` — decisiones de arquitectura, seguridad y reglas de negocio.

Para elegir una fila de un catálogo grande (clientes, productos) usar
`components/combobox.tsx` en vez de un `<select>`: un `<select>` obliga a
precargar las opciones, y los catálogos grandes no caben (PostgREST tope
las respuestas en 1.000 filas). El combobox recibe una función `onSearch`
que consulta al servidor, y ya trae debounce, teclado y descarte de
respuestas viejas.

Fechas que vienen de importaciones de Excel: mostrarlas siempre con
`formatearFechaProveedor()` de `domain/fechas.ts`, nunca crudas. Excel cuenta
los días desde el 30/12/1899, así que una celda vacía leída como fecha llega
convertida en ese día — un vacío disfrazado de fecha. El dato crudo se
conserva tal cual en la base (corregirlo sería inventar información), pero en
pantalla se muestra "No informado". Hay un caso real: el producto `DHP216`
tiene `fecha_vigencia_proveedor = 1899-12-30`. El helper además formatea a
partir del texto y no vía `new Date`, porque un ISO de solo fecha se
interpreta en UTC y al mostrarlo en hora de Perú retrocede un día.

Los tests de componentes van en `tests/components/`, con
`// @vitest-environment jsdom` en la primera línea — el resto de la suite
corre en Node.

## Identidad de marca

- Colores: `logisalud.green` (#4BB168), `logisalud.teal` (#4ABCC2) —
  definidos en `tailwind.config.ts`.
- Tipografías: Oswald (`font-heading`) para títulos, Poppins
  (`font-body`, pesos 400-700) para cuerpo — cargadas vía
  `next/font/google` en `app/layout.tsx`.
- Fondo `bg-gray-50`, texto `text-gray-900`.
- Tarjetas: usar las clases utilitarias `.card` (borde gris sutil) y
  `.card-highlight` (borde 2px color de marca) definidas en
  `app/globals.css`. Sin gradientes ni sombras agresivas —
  `hover:shadow-sm` / `hover:shadow-md` como máximo.
- Mobile-first: el usuario principal es el vendedor desde el celular.
  Botones y touch targets grandes (`.btn-primary`/`.btn-secondary`
  usan `min-h-12`).

## Al agregar una migración nueva

Numerar secuencialmente (`0006_...sql`), y si la tabla es sensible
(maneja permisos, dinero, o documentos fiscales), evaluar si necesita
un trigger de auditoría de respaldo además de la llamada a `logAudit()`
desde la capa de servicio — ver la sección de auditoría en
[docs/architecture.md](docs/architecture.md) para el criterio.

**Las migraciones se aplican solas al mergear a `main`** (integración de
Supabase con GitHub), así que hay que probarlas antes del merge. El
contenedor trae `postgresql-16`: se puede correr la cadena completa
contra una base local stubbeando lo que da Supabase — ver "Migraciones"
en [docs/architecture.md](docs/architecture.md).

Dos trampas concretas, ambas encontradas en producción:

- Un `CHECK` nuevo **se valida contra la tabla entera** al crearse. Si
  puede haber filas que no cumplan, hay que normalizarlas en la misma
  migración *antes* de agregar el constraint.
- Escribir cada migración **re-ejecutable** (`if not exists`, `drop
  policy if exists`): un reintento tras un fallo es lo normal.

## Antes de implementar lógica de negocio de pedidos

No implementar precios, promociones, stock, NubeFact ni retenciones sin
antes revisar [docs/business-rules.md](docs/business-rules.md) — varios
supuestos ahí están marcados explícitamente como no confirmados con
Contabilidad.
