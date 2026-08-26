# erp-logisalud

Monorepo de los sistemas internos de Logisalud.

```
erp-logisalud/
├── apps/
│   ├── cobranzas/      # ERP de Cuentas por Cobrar (Next.js 14 + Supabase)
│   └── pedidos/        # ERP de Pedidos / Operaciones (Next.js 14 + Supabase)
└── packages/
    └── design-system/  # Placeholder — UI compartida (todavía vacío)
```

Las dos apps son **independientes**: cada una tiene su propio proyecto
Supabase, sus propias variables de entorno y su propio deploy. El monorepo
solo comparte el repositorio y el árbol de dependencias de npm.

## Requisitos

Node >= 22 (lo pide `apps/pedidos`; `apps/cobranzas` funciona igual).

## Instalación

```bash
npm install        # una sola vez, en la raíz — instala ambas apps
```

Se usan **npm workspaces**: hay un único `package-lock.json` en la raíz y un
único `node_modules` hoisteado. No corras `npm install` dentro de
`apps/*`.

## Comandos

Desde la raíz:

```bash
npm run dev:cobranzas     npm run dev:pedidos
npm run build:cobranzas   npm run build:pedidos
npm run lint:cobranzas    npm run lint:pedidos
                          npm run test:pedidos
```

O directamente por workspace:

```bash
npm run <script> --workspace erp-logisalud-cobranzas
npm run <script> --workspace erp-logisalud-pedidos
```

## Variables de entorno

Cada app carga su propio `.env.local`, **dentro de su carpeta** (Next lee el
`.env.local` del directorio desde el que se ejecuta, no el de la raíz):

- `apps/cobranzas/.env.local` — ver `apps/cobranzas/.env.local.example`
- `apps/pedidos/.env.local` — ver `apps/pedidos/.env.example`

Apuntan a **proyectos Supabase distintos**. Unificarlos es una fase
posterior y separada; no mezclar.

## Deploy (Vercel)

Un proyecto de Vercel por app, cada uno con su **Root Directory**:

| App       | Root Directory    | Notas                                        |
|-----------|-------------------|----------------------------------------------|
| Cobranzas | `apps/cobranzas`  | Los crons viven en `apps/cobranzas/vercel.json` |
| Pedidos   | `apps/pedidos`    | —                                            |

Vercel detecta npm workspaces solo: instala desde la raíz del repo y
buildea el Root Directory indicado. Conviene activar en cada proyecto
"Include files outside the Root Directory" (viene activo por defecto en
monorepos) y, opcionalmente, *Ignored Build Step* para no redeployar una app
cuando el cambio fue en la otra.
