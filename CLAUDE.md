# erp-logisalud (monorepo)

Este repo contiene dos aplicaciones Next.js independientes más un paquete
compartido todavía vacío. **Cada app tiene su propio CLAUDE.md con las
instrucciones específicas de ese proyecto — leelo antes de tocar nada ahí:**

- `apps/cobranzas/CLAUDE.md` — ERP de Cuentas por Cobrar.
- `apps/pedidos/CLAUDE.md` — ERP de Pedidos / Operaciones.

## Reglas que aplican a todo el monorepo

- Las dos apps usan **proyectos Supabase distintos** y no comparten esquema.
  Unificar las bases es una fase futura y separada: no cruces conexiones,
  env vars ni migraciones entre `apps/cobranzas` y `apps/pedidos`.
- Nada de código compartido entre apps por ahora. Lo que se comparta va a
  `packages/design-system` cuando esa etapa arranque; hasta entonces es un
  placeholder y ninguna app depende de él.
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
