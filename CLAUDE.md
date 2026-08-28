# erp-logisalud (monorepo)

Este repo contiene tres aplicaciones Next.js más `packages/auth` (login y
sesión, compartido de verdad — no es un placeholder). **Cada app tiene su
propio CLAUDE.md con las instrucciones específicas de ese proyecto — leelo
antes de tocar nada ahí:**

- `apps/cobranzas/CLAUDE.md` — ERP de Cuentas por Cobrar.
- `apps/pedidos/CLAUDE.md` — ERP de Pedidos / Operaciones.
- `apps/compras/CLAUDE.md` — Compras y Pagos. **Antes de construir
  cualquier pantalla nueva ahí, leé también
  `apps/compras/docs/modulo-compras-pagos.md`** — el documento único y
  obligatorio del módulo: modelo de datos completo de los 8 Bounded
  Contexts, Lenguaje Ubicuo y la Carta de Simplicidad UX. No son reglas
  opcionales ni un estilo sugerido: toda pantalla nueva de ese módulo tiene
  que respetarlas.

## Reglas que aplican a todo el monorepo

- **`apps/cobranzas` y `apps/compras` comparten un mismo proyecto Supabase
  consolidado** (`public.perfiles`/`public.area_responsables` son la base
  de auth de las dos). `apps/pedidos` todavía tiene su **proyecto Supabase
  aparte** — consolidarlo es una fase futura y separada. No cruces env vars
  ni migraciones entre `apps/pedidos` y las otras dos mientras siga así.
- Nada de código compartido entre apps más allá de `packages/auth`. Lo que
  se comparta a nivel visual va a `packages/design-system` cuando esa etapa
  arranque; hasta entonces es un placeholder y ninguna app depende de él.
- Gestor de paquetes: **npm workspaces**. Un solo `package-lock.json`, en la
  raíz. No agregues lockfiles dentro de `apps/*` ni corras `npm install`
  ahí adentro.
- Los comandos se corren desde la raíz (`npm run build:pedidos`,
  `npm run test:pedidos`, …) o con `--workspace <nombre>`.
- Cada app se buildea y deploya sola. Un cambio en una no debería requerir
  tocar la otra.

## Pendientes conocidos de la migración a monorepo

- `apps/pedidos/.github/` (skills/agents/hooks de la herramienta
  "impeccable") quedó dentro de la app. GitHub solo lee `.github/` de la
  raíz, así que esa tooling ya no la levanta GitHub — se movió a la raíz
  únicamente el workflow de CI. Si hace falta reactivarla, mover
  `agents/`, `hooks/` y `skills/` a la `.github/` raíz en un cambio aparte.
- `apps/cobranzas` no tiene ESLint configurado ni tests; su CI corre solo
  `build` (que sí hace type-check completo).
