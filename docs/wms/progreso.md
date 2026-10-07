# WMS — Progreso

Para que otra sesión retome sin contexto. Última actualización: 2026-10-07.

## Estado
- **Gate 0: entregado y actualizado con las respuestas del usuario (2026-10-07); esperando confirmación para el Batch 1.** No se ha escrito código del WMS
  (más allá de la config de Playwright). Ver `docs/wms/gate-0.md`.
- Rama de trabajo: `feat/wms-batch-1` (código del WMS). Los documentos de `docs/wms/` viven en `main`;
  se traen con `git merge origin/main`. Último merge: 2026-10-07 (sin conflictos).
- **PR y merge a main nunca sin aprobación. Nada en producción** (ni migraciones, ni deploy, ni variables).

## Hecho
- Entorno: `@playwright/test` 1.63 instalado (raíz); `apps/wms/playwright.config.ts` lee
  `PLAYWRIGHT_CHROMIUM_PATH`; smoke test a 390×844 en verde con
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- Impeccable instalado en `.claude/skills/impeccable`. MCP de Playwright declarado en `.mcp.json`
  pero **no cargado** (pasos en gate-0.md §G).
- Auditoría completa (Gate 0): repo, documentos, formatos, planos, Excel de Odoo, esquemas de producción (solo lectura).

## Decisiones tomadas
- Base de pruebas: **Postgres local** (verificado: 16.15 corre; spike de RLS/auth.uid()/exclusión/locks OK). Sin servicios con costo.
- Vercel `erp-logisalud-wms`: **no creado** — hay consumo de build facturable (D-21).
- Rack A hasta A-27 (topologia.md corregida); cargo "Jefe de Almacén"; cada recepción de Compras = un ingreso; Katia registra Aprobado/Bajas al firmar; vencimiento = fecha completa del producto físico.
- Next 14.2.29 exacto (igual que cobranzas/compras); React 18; `@supabase/ssr ^0.5.2`; Tailwind ^3.3.
- `exceljs` 4.4.0 para XLSX; `@react-pdf/renderer` para actas.
- Vulnerabilidades de dependencias: deuda técnica registrada, sin acción.

## Siguiente (tras la confirmación del Gate 0)
Batch 1 — ver plan de commits en gate-0.md §H. Primero: contexto de diseño con Impeccable
(`PRODUCT.md`/`DESIGN.md`) y ADR-001..004, antes de la primera pantalla.

## Bloqueado / pendiente
Ver `docs/wms/decisiones-pendientes.md` (D-01..D-27). Ninguna impide empezar el Batch 1; D-21 y D-27 antes de cerrarlo.

## Para retomar
1. `git checkout feat/wms-batch-1 && git fetch && git merge origin/main`.
2. `npm install` en la raíz (workspaces; no instalar dentro de `apps/*`).
3. `export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` en este contenedor.
4. Leer `apps/wms/CLAUDE.md` (obligaciones) y gate-0.md.
