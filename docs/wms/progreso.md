# WMS — Progreso

Para que otra sesión retome sin contexto. Última actualización: 2026-10-08 (cierre del Batch 1).

## Estado
- **Batch 1 (fundación, almacén y maestros): construido, verificado y APROBADO (2026-10-08).** PR abierto hacia `main`; **no se hace merge hasta que lo apruebes en GitHub.**
- **Batch 2 (entradas y calidad): en curso** (misma rama; ver "Batch 2" abajo).
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
- **D-28 aceptada:** el cambio de estado ocurre en el lugar → "Aprobado · por trasladar" (ADR-006), con plazo máximo configurable (`plazo_por_trasladar_horas`, 24 h por defecto) tras el cual se alerta al Jefe de Almacén. El valor lo definen Katia y Charlie (D-28b).
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
- **Fallo de deploys de `main` (hallazgo 2026-10-08):** al subir archivos a `main` el proyecto intentaba un deploy de Production que fallaba en 3 s con
  `ROOTDIR_NOT_EXIST`: `apps/wms` aún no existe en `main` (el código vive en la rama), y Vercel valida el Root Directory *antes* de ejecutar el filtro de build. No se crea
  ningún deploy de producción del WMS (el filtro cancela todo `production`). Mitigación aplicada: `enableAffectedProjectsDeployments: true` (Vercel omite proyectos sin cambios).
  **Sin verificar aún:** se comprueba en el próximo push a `main`. Cuando se haga el merge del PR, `apps/wms` existirá en `main` y esos deploys quedarán CANCELED por el filtro, no con error.
  Plan B si persiste: dejar el Root Directory vacío no es opción (rompe el build); lo correcto es el merge, o desconectar `main` como rama de producción en el proyecto.
- Cobranzas **no se tocó**: el rewrite `/wms` y la fila de `public.modulos` siguen pendientes (D-23); por eso la zona se prueba por su URL directa.

## Batch 2 — Entradas y calidad (en curso)
Ingresos de compra local (desde Compras), devolución y cliente; Solicitud de Ingreso editable con historial; lotes con avance "4 de 6" e invariante
SUM(lotes)=referencia; Acta de Recepción firmada (I-AAAAMM-NNNN); alertas a Katia (temperatura fuera de 15–25 °C, registro sanitario vencido que bloquea la aprobación);
inventario nace en Cuarentena (A-6..A-9); cola "Pendientes de Dirección Técnica"; Acta Organoléptica por producto y lote (muestra = ceil(√unidades)+1);
expediente por OC/acta con faltantes y cierre de Sandra; alerta de "por trasladar" vencido (D-28b) al Jefe de Almacén.

## Batch 3 — alcance ajustado (Kardex, 2026-10-08)
Ejemplos en `formatos/` (un PDF por lote, un Excel por producto). Además de carga inicial, movimientos internos, conteos y ajustes:
1. **Dos vistas.** (a) *Kardex / Tarjeta de Control de Existencias*: solo entradas y salidas, una fila por partida con saldo corrido; por producto (todos los lotes) o por lote;
   filtro por propietario y rango de fechas, con **saldo inicial** al comienzo del rango. Columnas del ejemplo: tipo de documento, N° de acta, fecha de acta, lote, proveedor/cliente,
   RUC, tipo y N° de documento, fecha de documento, ubicación, entrada, salida, saldo, tipo de ingreso y propietario.
   (b) *Historia completa del lote*: incluye movimientos internos, cambios de estado sanitario, conteos y ajustes, con usuario y fecha.
2. **Anulaciones y reversas** como filas vinculadas a la original; nunca se ocultan (el ejemplo las muestra como "Acta de Recepción (Anul.)").
3. **Devoluciones** se identifican por *tipo de ingreso*, no por el nombre del cliente.
4. **Cambio de propietario:** salida en el kardex del propietario anterior y entrada en el del nuevo.
5. **Exportación:** PDF (tarjeta formal como el ejemplo) y XLSX (exceljs). El RUC siempre como texto de 11 dígitos.
6. **Solo del ledger:** el kardex se deriva únicamente de `wms.partidas`; un test verifica que el saldo final coincide con `wms.saldos`.
7. **Salidas:** las columnas quedan listas (salidas de despacho aún no existen en este alcance).
8. **Decisión nueva D-29** (Katia): código controlado del formato de Kardex de Logisalud (el ejemplo usa CF-FO-010, que parece de otra empresa). Mientras tanto, código configurable.

## Bloqueado / pendiente
Ver `docs/wms/decisiones-pendientes.md` (D-01..D-29). Ninguna bloquea la aprobación del Batch 1.

## Para retomar
1. `git checkout feat/wms-batch-1 && git fetch && git merge origin/main`.
2. `npm install` en la raíz (workspaces; no instalar dentro de `apps/*`).
3. `export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` en este contenedor.
4. `npm run test:wms`, `npm run test:db:wms`, `npm run build:wms` y `apps/wms/scripts/e2e-por-viewport.sh`.
5. Leer `apps/wms/CLAUDE.md`, `gate-0.md` y `decisiones-pendientes.md`.
