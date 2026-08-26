# erp-logisalud-pedidos

Módulo de toma, validación, despacho y documentación electrónica de
pedidos de LOGISALUD (distribuidora farmacéutica). Repo independiente
de `erp-logisalud` (ERP de Cuentas por Cobrar), pero de la misma
familia visual de marca.

> **Fase 1 (base técnica).** Este README describe únicamente la base
> técnica: auth, RLS, estructura de carpetas y CI. No hay pantallas de
> negocio, motor de precios, stock ni NubeFact todavía — ver
> [docs/business-rules.md](docs/business-rules.md).

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS 3 · Supabase
(Postgres + Auth + RLS) · Vercel

## Requisitos previos

- Node.js 18.18+ (usado en desarrollo: ver `.nvmrc` si existe, o Node
  LTS actual)
- Una cuenta y proyecto en [Supabase](https://supabase.com) — este
  módulo usa el schema Postgres `pedidos` dentro de un proyecto que
  puede ser compartido con otros sistemas (ver
  [docs/architecture.md](docs/architecture.md))

## Setup local

```bash
npm install
cp .env.example .env.local
```

Completar en `.env.local` las variables de tu proyecto Supabase (URL,
anon key, service role key). Nunca commitear `.env.local` — ver
[docs/security.md](docs/security.md).

Aplicar las migraciones en `supabase/migrations/` contra tu proyecto
Supabase (vía Supabase CLI `supabase db push`, o pegando el SQL en el
SQL Editor del dashboard, en orden de numeración).

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev     # servidor de desarrollo
npm run build   # build de producción
npm run start   # servir el build de producción
npm run lint     # eslint
```

## Estructura de carpetas

Ver [docs/architecture.md](docs/architecture.md) para el detalle y el
razonamiento detrás de cada carpeta.

```
app/  components/  features/  lib/  services/  domain/
supabase/migrations/  tests/  docs/
```

## Documentación

- [docs/architecture.md](docs/architecture.md) — decisiones técnicas:
  schema Postgres dedicado, modelo de roles/RLS, mecanismo de auditoría.
- [docs/security.md](docs/security.md) — manejo de credenciales y de la
  service role key.
- [docs/business-rules.md](docs/business-rules.md) — roles del módulo y
  supuestos de negocio pendientes de validar.
- [CLAUDE.md](CLAUDE.md) — guía para trabajar en este repo con Claude
  Code.
