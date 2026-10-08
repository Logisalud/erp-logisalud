# WMS — Progreso

Para que otra sesión retome sin contexto. Última actualización: 2026-10-08 (cierre del Batch 1).

## Estado
- **Batch 1 (fundación, almacén y maestros): construido, verificado y detenido. Esperando tu aprobación.**
  No se abrió ningún PR hacia `main` (la regla es "PR y merge nunca sin aprobación"): el Preview sale de la rama.
- Rama de trabajo: `feat/wms-batch-1`. Los documentos de `docs/wms/` viven en `main` (último merge: ver `git log`).
- **Nada en producción:** ninguna migración aplicada, ningún deploy a producción, ninguna variable de producción.
  Lecturas a producción: solo esquemas y, con tu autorización (D-24), el área y el rol de `public.perfiles`.

## Qué hay en el Batch 1
- `apps/wms` (Next 14.2.29, basePath `/wms`, `@logisalud/auth`, preset de `@logisalud/design-system`).
- **Migraciones** (no aplicadas): `0001` schema, roles, topología, propietarios, asignaciones con vigencia, auditoría; `0002` lotes,
  ledger append-only, saldos derivados, concurrencia, reversas, kardex; `0003` alta y validación de productos. Seed de topología generado.
- **Dominio** puro y probado: estados, zonas, propietario y vigencia, permisos, registro sanitario, vencimientos, búsqueda, mapa.
- **Pantallas:** login, Inicio por rol, Almacén (mapa SVG con capas Propietario/Estado/Ocupación, zoom/pan/ajustar, búsqueda que ilumina,
  rack de frente, drawer, subracks), búsqueda universal Ctrl/Cmd+K (producto, lote, ubicación), Productos (lista, detalle, alta por Sandra,
  validación por Katia), Propietarios, Auditoría, estados vacío/cargando/error/éxito.
- **Modo demostración** (D-27): datos de prueba en memoria, banner DEMO, sin base real; solo Preview/local, imposible en producción.

## Verificación (todo corrido sobre el código final)
| Qué | Resultado |
|---|---|
| Dominio y componentes (Vitest) | **82 pruebas, 13 archivos, en verde** |
| Base de datos (Vitest + Postgres 16 local, `auth.uid()` simulado) | **60 pruebas, 3 archivos, en verde** (RLS, ledger inmutable, estados, zonas, propietario, vigencia, concurrencia, reversas, kardex, auditoría, productos) |
| E2E Playwright en 4 viewports (modo demostración) | **114 pasan, 0 fallan**, 10 omitidas a propósito (mapa completo no va en teléfono) |
| `tsc --noEmit`, `next build` | OK |
| Regresión: compras (883 pruebas), pedidos (570 pruebas + lint), builds de compras, cobranzas y pedidos | **OK**; no se tocó ningún archivo de esas apps ni de `packages/` |
| Detector de Impeccable | 4 avisos "gris sobre color": falsos positivos (clases condicionales); sin cambios |
| Capturas | 101 en `docs/wms/screenshots/` (30 pantallas × viewports aplicables; índice en su README) |

Tests del prompt cubiertos en la base de datos y el dominio: 7 (RS vencido), 8, 9, 10, 11, 12, 13 (movimiento, verificador ≠ ejecutor, reversa),
14 (concurrencia), 17 (asignación vencida), 18 (RLS), 19 (kardex), 20 (auditoría). Los de Batch 2 (1–6, 15–16 completos) llegan con sus pantallas;
el 16 (búsqueda resalta posiciones y el drawer muestra producto/lote/propietario/estado) ya está cubierto por E2E.

## Hallazgos y decisiones del Batch (detalle en `docs/wms/adr/` y `gate-0.md` § "Ajustes durante el Batch 1")
- **Bug real hallado por las pruebas:** `INSERT … ON CONFLICT` validaba el CHECK de saldos antes del conflicto y rechazaba toda salida. Corregido en 0002.
- **Bug real hallado por la revisión visual:** el mapa se reiniciaba al abrir el panel (re-render por URL). Corregido (`history.replaceState`).
- **D-28 nueva:** el cambio de estado ocurre en el lugar → aparece "Aprobado · por trasladar" (ADR-006). Necesita tu visto bueno y el de Katia/Charlie.
- **D-24:** 15 perfiles; `direccion_tecnica` tiene 2 y `almacen` 3. Falta cargar los roles en `wms.usuario_roles`.
- **Vercel:** proyecto `erp-logisalud-wms` creado (Preview, filtro de build por `apps/wms` y paquetes compartidos). Ver "Vercel" abajo.
- **Roll de estructura de Impeccable:** corrió degradado (sin retadores; el servicio externo no respondió); se construyó la estructura asignada ("capas primero").
  PRODUCT.md se infirió del brief y de `docs/wms/` (confirmado por ti en el Gate 0), sin entrevista adicional.

## Qué NO está verificado
- El adaptador de Supabase (`services/supabase`) **no se ejecutó contra una base real** (no hay base de pruebas): PostgREST, GoTrue, Storage y la RLS real de Compras quedan sin cubrir (ver `gate-0.md` §G.1).
- El MCP de Playwright sigue sin cargar en esta sesión; se verificó con Playwright directo.
- El login real (magic link) y los permisos por rol contra Supabase.

## Vercel (D-21: aprobado, costo de build aceptado)
- Proyecto **`erp-logisalud-wms`** (`prj_9mp6V9jAX0IE29eRFL4qSSIp8ADT`), repo `Logisalud/erp-logisalud`, Root Directory `apps/wms`, Next.js, Node 22.x.
- **Solo Preview.** Filtro de build (Ignored Build Step): se salta todo despliegue de producción y solo construye si cambió `apps/wms`, `packages/auth`,
  `packages/design-system`, `package.json` o `package-lock.json`. Variable `WMS_DEMO=1` solo en el entorno Preview. Protección de Vercel (SSO) activa.
- **Recarga y verificación (hecha):** se volvió a leer el proyecto y sus variables y quedaron guardados el framework, Node 22.x, `WMS_DEMO` solo en Preview y la protección.
  El filtro quedó demostrado por los hechos: el primer despliegue (que Vercel marcó como "production" por ser el primero del proyecto) quedó **CANCELED** por el filtro,
  sin construir; el siguiente, de Preview, construyó `apps/wms` desde su Root Directory y llegó a **READY**. El valor literal del filtro y del Root Directory no se
  pudo leer por la API disponible (solo se verificó por su efecto): conviene que lo mires una vez en Settings → Git y General.
- **URL de Preview** (rama `feat/wms-batch-1`): https://erp-logisalud-wms-git-feat-wms-batch-1-logisalud.vercel.app/wms/login
  (despliegue: https://erp-logisalud-mpzwehb05-logisalud.vercel.app/wms/login). Requiere iniciar sesión en Vercel (protección). Verifiqué con un enlace de acceso temporal que
  responde 200 con el banner DEMO y los 6 roles de prueba.
- Cobranzas **no se tocó**: el rewrite `/wms` y la fila de `public.modulos` siguen pendientes (D-23); por eso la zona se prueba por su URL directa.

## Siguiente (tras tu aprobación)
Batch 2 — Entradas y calidad (ingresos de compra local/devolución/cliente, actas, firma, alertas, cola de Dirección Técnica, expediente).
Antes: decidir D-28, D-11, D-12, D-13 y confirmar que Sandra/Katia/Charlie existan en `perfiles` con sus roles WMS.

## Bloqueado / pendiente
Ver `docs/wms/decisiones-pendientes.md` (D-01..D-28). Ninguna bloquea la aprobación del Batch 1.

## Para retomar
1. `git checkout feat/wms-batch-1 && git fetch && git merge origin/main`.
2. `npm install` en la raíz (workspaces; no instalar dentro de `apps/*`).
3. `export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` en este contenedor.
4. `npm run test:wms`, `npm run test:db:wms`, `npm run build:wms` y `apps/wms/scripts/e2e-por-viewport.sh`.
5. Leer `apps/wms/CLAUDE.md`, `gate-0.md` y `decisiones-pendientes.md`.
