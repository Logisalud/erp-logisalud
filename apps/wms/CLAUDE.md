# apps/wms

WMS de Logisalud. Documentos de negocio en `docs/wms/` (raíz del monorepo).
Alcance actual: entradas y movimientos internos. **Antes de tocar nada lee
`docs/wms/gate-0.md`, `docs/wms/progreso.md` y `docs/wms/decisiones-pendientes.md`.**

## Obligaciones para todas las sesiones

**Documentos (si se contradicen, gana el de arriba y se reporta):**
1. `docs/wms/reglas-negocio.md` · 2. `topologia.md` · 3. `procesos/*.xlsx` (hoja 03_TO-BE) ·
4. `formatos/` (los PDF generados respetan sus campos y códigos) · 5. `experiencia.md` ·
6. `vision.md` (norte, NO instrucciones) · 7. `layouts/` y `CONTEXTO.md`.
Los documentos viven en `main`; el código, en `feat/wms-batch-1`. Se traen con `git merge origin/main`.

**Prohibido sin aprobación expresa del usuario:** PR o merge a main; migraciones, deploy o
variables en producción; crear el proyecto Vercel (solo Preview, y solo si lo aprueba);
cualquier cambio en compras, pedidos o cobranzas que no sea aditivo (vistas, grants);
usar la base de producción para pruebas (Supabase MCP: solo lectura de esquemas).

**CI en verde antes de cualquier merge:** nunca se hace (ni se propone) un merge con la CI de GitHub
Actions en rojo, aunque Vercel esté en verde. Vercel solo prueba que compila; la CI corre dominio, base de
datos, build y E2E en los 4 viewports. Si la CI está roja, primero se arregla (o se reporta y se espera la
decisión del usuario). Antes de pedir la aprobación de un PR se revisa el resultado del job
«apps/wms — dominio, base de datos, build y E2E» y se informa su estado. (Origen: 2026-10-10, la CI del WMS
estuvo roja desde el 8-oct en el paso `test:e2e` y se mergearon #169 y #170 mirando solo Vercel.)

**Paginación:** toda lectura de más de 1.000 filas usa `traerTodo`, que ordena siempre por la clave única de
la tabla (`services/supabase/claves.ts`). Una tabla nueva se registra ahí antes de leerla. Paginar con
`.range()` sin orden determinista repite y pierde filas.

**Datos y reglas:** schema `wms` en el Supabase consolidado; RLS desde la primera migración;
ninguna API route salta RLS con service role; reglas sanitarias, de zona y de propietario en
dominio **y** en base de datos; saldos derivados de un ledger append-only; nada se borra ni se
oculta (correcciones = reversas vinculadas); actas firmadas inmutables (solo anulación con
motivo y reemisión vinculada); concurrencia con locks en funciones SQL; topología, propietarios y
asignaciones (con vigencia y documento) son configuración, no código. Las migraciones se
escriben re-ejecutables y **se aplican a mano** (nunca al mergear).

**Operaciones sobre una base real:** si una herramienta falla o se cuelga durante una operación sobre una base real
(Supabase MCP u otra), **detente y avisa al usuario**. No cambies de método, no reintentes con otra herramienta ni modifiques el SQL
(quitar líneas, partir en bloques, etc.) sin su aprobación expresa. Después de un fallo solo se hacen lecturas para reportar el estado.
(Origen: 2026-10-08, `apply_migration` se colgó sobre erp-cobranzas y se siguió por otro camino sin avisar.)

**Decisiones:** técnicas y reversibles → decide y documenta en un ADR. De negocio, sanitarias,
regulatorias, destructivas o de fuente de verdad → detén solo esa pieza, regístrala en
`decisiones-pendientes.md` y sigue con lo demás. Mantén `progreso.md` al día.

**Versiones:** Next 14.2.29 exacto, React 18 (`useFormState`), `@supabase/ssr ^0.5.2`,
Tailwind ^3.3, `exceljs` 4.4.0 (XLSX), `@react-pdf/renderer` (actas). No agregues `xlsx` (SheetJS).

**Skills:**
- **Impeccable** (`.claude/skills/impeccable`): establece el contexto de diseño (`PRODUCT.md`,
  `DESIGN.md`) antes de la primera pantalla y audita/pule **cada pantalla antes de su commit**.
- **Playwright:** `@playwright/test` para E2E; MCP de Playwright (o Playwright directo mientras el
  MCP esté pendiente) para verificar cada flujo en **1440×900, 1280×800, 1024×768 y 390×844**,
  con screenshots en `docs/wms/screenshots/`.
- Reutiliza `@logisalud/auth` y `@logisalud/design-system` (preset Tailwind y `BrandMark`; no
  trae componentes de UI).

**Experiencia:** "alegre en la superficie, riguroso por debajo". Paridad funcional PC/teléfono
con distinta presentación (mapa completo en PC/tablet; en teléfono, búsqueda y ubicación en
texto). Español peruano con **tuteo** (el código viejo de compras usa voseo: aquí no), nada en
inglés. Cada pantalla tiene vacío, cargando, error y éxito. Estados con texto + ícono, nunca
solo color. Firma del transportista en pantalla táctil.

**Cierre de cada batch:** dominio, UX (auditoría Impeccable), tests en verde, 4 viewports, sin
regresiones en Compras/Pedidos y docs al día → reporta en `progreso.md`, abre el PR hacia main
con la URL de Preview y **detente hasta que el usuario apruebe**. Si algo falla, detente y reporta.

## Tests E2E (Playwright)

- Se corren desde la raíz: `npm run test:e2e --workspace erp-logisalud-wms`.
- Config en `playwright.config.ts`. **No fijes `executablePath` en el código.**
  El Chromium se toma de la variable de entorno `PLAYWRIGHT_CHROMIUM_PATH`;
  si no existe, Playwright usa su navegador por defecto.
- Contenedor de Claude Code (trae Chromium preinstalado; `playwright install`
  no se corre ahí):

  ```bash
  export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium
  ```

- CI y máquinas locales: no definir la variable y correr
  `npx playwright install chromium` una vez.
- Para verificar pantallas, viewport móvil de referencia: 390×844.

## MCP de Playwright (pendiente)

`.mcp.json` en la raíz lo declara, pero no se cargó en la sesión. Activarlo:
aprobar el servidor del proyecto (`/mcp`), reiniciar la sesión, y agregar a
los `args` `"--executable-path", "/opt/pw-browsers/chromium"` en el contenedor.
Mientras tanto, verificar con Playwright directo.

## Comandos y pruebas

- Desde la raíz: `npm run dev:wms`, `build:wms`, `test:wms` (dominio y componentes), `test:db:wms` (base de datos), `test:e2e:wms`.
- **Modo demostración local:** `WMS_DEMO_LOCAL=1 npm run dev:wms` (datos de prueba en memoria, banner DEMO, sin base real).
  En Vercel solo se activa en Preview con `WMS_DEMO=1`; en producción la app **se niega a arrancar** si hay una bandera puesta.
- **Pruebas de base de datos:** `npm run test:db:wms` levanta el Postgres 16 local (`scripts/db-local.sh`) y corre las migraciones
  contra un schema `auth` simulado. No cubre PostgREST, GoTrue ni Storage (docs/wms/gate-0.md §G.1).
- **E2E en 4 viewports + capturas:** `npm run build:wms` y luego
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium apps/wms/scripts/e2e-por-viewport.sh` (reinicia el servidor entre viewports).
  Las capturas quedan en `docs/wms/screenshots/<pantalla>/<viewport>.png`.
- Migraciones: `apps/wms/supabase/migrations/` (0001–0009), re-ejecutables, **se aplican a mano**; seed de topología generado con
  `npm run seed:topologia --workspace erp-logisalud-wms`. Ver `docs/wms/aplicar-migraciones.md`.
- Diseño: `PRODUCT.md` y `DESIGN.md` de esta carpeta; ADR en `docs/wms/adr/`.
