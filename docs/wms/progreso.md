# WMS — Progreso

Para que otra sesión retome sin contexto. Última actualización: 2026-10-08 (Batches 1 y 2 y addendum **mergeados a main** [PR #168, `537379e`]; Batch 3 construido en `feat/wms-batch-3`, pendiente de tu aprobación).

## Estado
- **Batches 1 y 2 y addendum de ingreso: aprobados y mergeados a `main` (PR #168, 2026-10-08).** El merge no creó deploys de producción del WMS (guarda en `apps/wms/vercel.json`) y los builds de compras, cobranzas, pedidos y auth quedaron READY.
- **Batch 3 (inventario en operación): construido; ver «Batch 3» abajo; espera tu aprobación.**
- Rama de trabajo: `feat/wms-batch-3`. Los documentos de `docs/wms/` viven en `main` (último merge: ver `git log`).
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

## Batch 2 — Entradas y calidad (construido; ver verificación abajo)
**Qué hay:** ingresos de compra local (desde la recepción de Compras), devolución e ingreso de cliente · Solicitud de Ingreso editable con historial de versiones ·
lotes con avance "4 de 6", invariante SUM(lotes)=referencia y vencimiento mes/año → último día · Acta de Recepción (I-AAAAMM-NNNN) generada, firmada por Jefe de Almacén,
Dirección Técnica, responsable de conteo (usuario logueado) y transportista (firma táctil, nombre, DNI, placa), inmutable, con anulación y reemisión vinculada ·
confirmación: el inventario nace en Cuarentena (A-6..A-9) · alertas (temperatura fuera de 15–25 °C, RS vencido que bloquea la aprobación, divergencia con Compras,
"Aprobado · por trasladar" vencido) · cola "Pendientes de Dirección Técnica" · Acta Organoléptica por producto y lote (checklist de LS-FR.55.02, muestra = techo(√n)+1,
la llena Sandra, decide y firma Katia) · expediente por OC/acta con faltantes y cierre de Sandra · PDF de ambas actas · búsqueda por OC y acta.
**Migración 0004** (no aplicada) + parámetros `plazo_por_trasladar_horas` (24), `muestreo_constante`, `kardex_codigo_formato`. ADR-008.
**Modo demostración:** selector "Probar como" en el banner para firmar el acta con varias personas sin volver al login.
**Verificación del Batch 2 (sobre el código final):** dominio/componentes/servicios **123 pruebas** · base de datos (Postgres 16 local) **89 pruebas** (29 nuevas de entradas) ·
E2E en los 4 viewports: **48/48** en 1440, 1280 y 1024 y **42/42** en 390 (las omitidas son del mapa completo) · `tsc` y `next build` OK · regresión: compras 883 pruebas, pedidos 570 pruebas,
builds de compras, cobranzas y pedidos OK; no se tocó ningún archivo de esas apps. Detector de Impeccable: 1 hallazgo real (borde grueso en el avance) corregido; el resto son falsos positivos de clases condicionales.
Pruebas del prompt cubiertas: 1–9 y 18–20 (más 14, 17, 19 del Batch 1). Los 10–13, 15 y 17 completos llegan con el Batch 3.
**Bugs hallados por las pruebas en este batch:** el E2E expuso un servidor huérfano entre viewports (script corregido) y una regresión mía del lienzo de firma (callback inestable).
**No verificado:** el adaptador de Supabase de entradas (misma limitación que el Batch 1); la vista `wms.v_recepciones_compra` contra las tablas reales de Compras
(se probó con réplicas mínimas); la validez legal de las firmas (D-11); los PDF se revisaron como archivo, no impresos.
**Ajustes tras la revisión de Sebas (2026-10-08):**
1. *"No encontramos eso" al entrar a una entrada desde el Preview:* causa más probable — en Vercel cada petición puede caer en una instancia distinta y cada una armaba su propia copia de los datos de prueba con ids aleatorios; el enlace de una instancia no existía en otra. En local se recorrieron 125 enlaces como 4 roles sin ninguno roto. Corrección: ids de la siembra deterministas (los de las alertas salen de su clave) + prueba que arma dos instancias y compara. **Limitación que sigue:** lo que alguien crea o firma en el Preview vive solo en esa instancia; no se pudo reproducir en el Preview (el contenedor no alcanza vercel.app).
2. *Alerta de vencimiento de lotes (D-30):* `LOTE_POR_VENCER` (Jefe de Almacén) y `LOTE_VENCIDO` (Dirección Técnica) sobre lo que sigue en el inventario salvo Bajas/Rechazados; umbral `lote_dias_alerta_vencimiento` (90); una alerta por lote y tipo; enlaza al mapa filtrado por lote. `wms.revisar_vencimientos()`.
3. Etiqueta "Productos esperando tu validación" → "Registros sanitarios esperando tu validación" (con la explicación).
4. La acta reemitida entra al expediente (antes solo estaba la original).
5. Las alertas con lote (por trasladar, vencimientos) llevan un enlace "ver en el mapa".
**Decisiones que siguen abiertas y tocan este batch:** D-01, D-11, D-12, D-13, D-28b, D-30.

## Addendum de flujo de ingreso (2026-10-08) — construido, pendiente de tu aprobación
Docs corregidos (reglas, visión, gate-0, decisiones D-31..D-37, ADR-009), migraciones **0005 y 0006 escritas y probadas en Postgres local, sin aplicar**, dominio, modo demo y pantallas.
- Solicitud primaria `SI-AAAA-NNNNN`; verificación por línea; historial campo a campo; «Cantidad física confirmada» con Copiar y estado ámbar/verde/rojo; estado `DEVOLUCIONES` (D-31 ratificada: sin Cuarentena; origen como dato aparte, `v_stock_por_origen`).
- **D-37 (0006):** solo Katia y Sandra editan registro sanitario, vencimiento, forma farmacéutica, concentración, fabricante y condición de almacenamiento — misma autoridad, sin validación adicional, en base de datos (`editar_regulatorio`, sin DML directo), con historial (campo, antes, después, usuario, fecha, motivo obligatorio). Actas firmadas conservan los datos (test). Se retiró el flujo «por validar / observado». Presentación y principio activo viven en `catalogo.productos`: ver `regulatorio-duplicidad.md` (**decisión pendiente tuya**).
- **D-15:** el verificador ≠ preparador ≠ ejecutor, en dominio (`puedeVerificar`) y en base de datos, con test. **D-29:** parámetro `kardex_codigo_formato` provisional. D-11/12/13/28b/30 aprobadas (ver `decisiones-pendientes.md`).
- **Descargas:** Solicitud de Ingreso (PDF y Excel), Acta de Recepción (PDF y Excel), Acta Organoléptica (PDF y Excel, también en borrador, marcada como tal).
- Documentos nuevos: `integracion-wms-compras.md` (D-36, opciones sin implementar), `regulatorio-duplicidad.md`, `cambios-a-procesos.md` + REC-01/REC-02 v1.2 **borrador** (originales intactos), `plan-aplicacion-produccion.md` (solo documento) y el script de reversa probado `supabase/rollback/wms_0001_a_0006_rollback.sql`.
- Pruebas: ver la tabla «Verificación final» abajo.
- **No verificado:** adaptador Supabase contra base real (nunca se corrió contra una); columnas de Compras solo contra stubs en las pruebas locales (se verificaron en solo lectura el 2026-10-08); el estado del Preview es por instancia.
- Abiertas para Katia: **D-01 (prioridad)**, hold, documentos de baja, contramuestra, muestreo √n+1, práctica de «Calidad». Abierta: D-36 (integración con Compras).

## Batch 3 — Inventario en operación (construido; pendiente de tu aprobación)
Rama `feat/wms-batch-3` (desde `main` con los Batches 1 y 2 y el addendum ya mergeados, PR #168). **Nada aplicado en ninguna base.** Migración **0007** (sin aplicar), ADR-011.
**Qué hay:**
1. **Kardex** (por producto o por lote; filtro por propietario y rango de fechas con saldo inicial; solo entradas y salidas del libro mayor; reversas como filas vinculadas; devoluciones por tipo de ingreso) en pantalla, **PDF** y **Excel** (columnas del formato de ejemplo; RUC como texto; código del formato `LS-FR-KDX (provisional)` configurable, D-29) · **historia completa del lote** (ingresos, movimientos internos, cambios de estado, ajustes y reversas con quién preparó, movió y verificó) · **vencimientos** (D-30: vencidos y por vencer con tramos configurables `vencimiento_tramos_dias`).
2. **Movimientos internos (INV-02, D-15):** *(reemplazado el 2026-10-09: ver Batch 3b; ahora solo ejecutar → verificar, sin autorización)* preparar → autorizar (Jefe) → mover → verificar y confirmar (otra persona); el stock cambia solo al confirmar; con diferencia queda abierto y avisa al Jefe; reserva de unidades; zona y propietario validados al preparar y en el libro.
3. **Conteos cíclicos (INV-05):** programación por ubicación, **conteo a ciegas aplicado en la base** (el saldo solo se lee por una función que lo oculta), segundo conteo de otra persona, causa, **ajuste propuesto por el Jefe y autorizado por Dirección Técnica** (con sustento y fila en el Kardex), escalamiento con evidencia, **ubicación en conteo = no se mueve**, cierre con causa y acción.
4. **Carga inicial:** CSV con vista previa fila por fila, borrador y confirmación **solo después de la decisión de Dirección Técnica sobre el estado del stock inicial (D-09)**. En el demo y en pruebas se usa con datos de prueba.
5. **Arreglos transversales:** migraciones 0001–0005 sin `drop … if exists` (prueba que lo exige y que una base nueva no emite avisos); prueba de búsqueda robusta; contrastes sin avisos de Impeccable; en el demo se agrega el rol «Reemplazo del Jefe» para poder probar D-15 con tres personas; `apps/wms/vercel.json` evita el deploy automático desde `main` (no hay producción del WMS hasta que se apruebe).
**Verificación (sobre el código final):**
| Qué | Resultado |
|---|---|
| Dominio, servicios y componentes (Vitest) | **181 pruebas, 20 archivos, en verde** |
| Base de datos (Postgres 16 local, cadena 0001–0007 + seed) | **136 pruebas, 7 archivos, en verde** (18 nuevas de inventario, reversa de la cadena completa, migraciones sin `drop … if exists`) |
| E2E Playwright, 4 viewports (modo demostración) | **1440: 66 · 1280: 66 · 1024: 66 · 390: 60**, 0 fallan (las omitidas son del mapa completo en teléfono) |
| `tsc`, `next build` (wms, compras, cobranzas, pedidos) | OK |
| Regresión: Compras 883 y Pedidos 570 pruebas | OK, sin cambios en esas apps |
| Detector de Impeccable | 0 hallazgos |
**No incluido en este batch (dicho con claridad):** revisión diaria (INV-04), KPIs, exportación de stock vendible a Pedidos (INV-01), el **movimiento de cambio de propietario** (el Kardex ya lo reconoce, pero no existe el tipo de movimiento) y la **carga inicial con datos reales** (falta la exportación de Odoo, D-26; D-08/D-09 siguen abiertas).
**No verificado:** el adaptador de Supabase contra una base real (ni las funciones nuevas por PostgREST); el rendimiento de `kardex_filas` con volumen real; el estado del Preview es por instancia (puede reiniciarse).
**Después del Batch 3 y antes de la salida a producción (aprobado por Sebas):** integración WMS → Compras en dos fases (D-36) y, si se aprueba, la edición de presentación y principio activo con permisos en Compras (D-38).

### Rediseño del flujo «Mover» (cambio de plan, sobre el mismo PR)
- **Búsqueda en vez de desplegables** (nombre, código, lote o ubicación; resultados al escribir, con espera y descarte de respuestas viejas). **Se empieza por el origen:** eliges la ubicación, ves todo su contenido, marcas líneas (cantidad editable, por defecto el total) o «Mover todo», y eliges **un solo destino**, que se **valida al instante** (propietario, área y estado) con un mensaje por línea antes de enviar.
- **Movimiento multilínea:** una autorización, una revisión línea por línea; si una línea tiene diferencia solo esa queda abierta, las demás se confirman (migración 0007 editada en sitio —aún sin aplicar en ninguna base— con `revisar_movimiento`, `resolver_movimiento` por línea y `posiciones_bloqueadas`).
- **Teléfono:** buscador grande, acción principal fija sobre la barra de navegación, mínimo tipeo (motivos rápidos).
- Pruebas nuevas: base de datos (multilínea, diferencia en una sola línea, revisión incompleta rechazada, validación por línea, solo Katia autoriza ajustes), dominio (buscar origen, validar destino) y E2E de los dos flujos en los 4 viewports (1440: 66 · 1280: 66 · 1024: 66 · 390: 60). Detector de Impeccable: 0 hallazgos.
- **Autoridad de ajustes:** el marcador `[ELIGE …]` del pedido llegó sin elegir. Se dejó **como está en la base: solo Katia autoriza ajustes de inventario** (Sandra no), ahora con test. Si quieres que Sandra también pueda, es un cambio de una línea.

### D-38 (presentación y principio activo): construido, sin aplicar
Migración **0008** + reversa + 11 pruebas de base de datos (ver `propuesta-presentacion-principio-activo.md`). **Revisión previa de procesos automáticos** (solo lectura del repo): ninguno de los importadores, sincronizaciones o jobs de las apps actualiza esos campos hoy; solo hay cargas únicas por migración SQL (`0070`, `0077` de Compras; `1002` y similares de Pedidos) y el script manual `scripts/migrar-datos-pedidos.ts`, que corren como `postgres`/`service_role` y no se bloquean. Riesgo futuro: al consolidar Pedidos en este proyecto, su importador de listas de precios o su edición de productos deberán dejar de escribir estos dos campos o hacerlo como `service_role`. Pruebas: WMS base de datos **153** en verde; Compras **883**.

## Batch 3b — en curso (rama `feat/wms-batch-3b`, desde `main` con el Batch 3 ya mergeado: PR #169)
**Primer punto, pedido por Sebas (con su ajuste del 2026-10-09, que reemplaza lo anterior sobre movimientos): Mover en dos personas y con productos de distintos orígenes.**
- **Solo dos personas, sin autorización:** *ejecutado por* (quien crea el movimiento y mueve; la misma persona) y *verificado por* (otro auxiliar, el Jefe o su reemplazo; nunca el ejecutor). Flujo **ejecutar → verificar**; el stock cambia al verificar cada línea y las unidades quedan reservadas desde que se ejecuta. 0007 (sin aplicar) rehecha: `ejecutar_movimiento(lineas, motivo)`, sin `autorizar_movimiento` ni `preparar_movimiento`, sin columnas de preparador ni de autorización.
- **Lista en tabla** (PC y tablet): referencia MI-AAAA-NNNNN, fecha, desde, hacia («Varios»), propietario, líneas y unidades, ejecutado por, verificado por y estado; búsqueda, filtros (estado, fechas, propietario, ejecutado por, ubicación), orden por columna, «Por atender» y **vistas guardadas** por persona. Detalle con las líneas en tabla. **Teléfono:** una fila compacta por movimiento (origen → destino y cantidad), sin desplazamiento horizontal. La referencia también sale en la búsqueda universal y en la historia del lote (el Kardex del formato lleva solo entradas y salidas).
- **Origen y destino por defecto** opcionales en la cabecera; cada línea puede cambiar de origen (otra ubicación o lote del mismo producto) o de destino; los destinos que no sirven para la línea salen deshabilitados con su motivo.
- Una orden con N líneas; cada línea con su producto, lote, propietario, origen, destino y cantidad. Se autoriza una vez y se verifica en una sola revisión, línea por línea; si una línea tiene diferencia solo esa queda abierta y el Jefe la resuelve por separado (ya funcionaba en la base; ahora con tests de orígenes distintos).
- **Agregar por producto** (nombre, código, principio activo o lote → todas las ubicaciones con lote, vencimiento, propietario, estado y disponible; marcas varias con su cantidad) **o por ubicación** (ver el contenido y «Mover todo»). **Destino de la cabecera** que heredan las líneas, con destino propio por línea. **Validación por línea** contra su destino, con mensaje humano, antes de enviar y repetida en la base. Lista de líneas con totales, cantidad editable y quitar; en teléfono, una tarjeta por línea y la acción fija abajo.
- **Disponible = saldo − reservado** por movimientos abiertos. Corregido un hueco de 0007 (sin aplicar): dos líneas de la misma celda dentro de una orden podían pasar de lo que hay. **Cambio de regla:** un movimiento abierto ya no bloquea la ubicación entera (solo reserva sus unidades); solo un conteo la bloquea.
- Pruebas: base de datos **178**, dominio/demo/componentes **205**, E2E en 4 viewports (**1440: 72 · 1280: 72 · 1024: 72 · 390: 66**), Compras **883**; `tsc` y builds de wms, compras, cobranzas y pedidos OK. Detector de Impeccable: 0 hallazgos.
- También en la rama: ficha de producto con presentación y principio activo editables por Katia y Sandra con historial (D-38), migración 0009 (revisión diaria, conteos semanales, vistas guardadas, exactitud) con 20 pruebas de base de datos; **sus pantallas aún no están construidas** (siguen después de tu aprobación de este punto).

### Crear movimientos en **modo tabla** (referencia: `docs/wms/referencias/movimiento-tabla-demo.html`) — construido
- **PC y tablet:** una fila por producto con #, Producto (buscador dentro de la celda: en cuántas ubicaciones está y el total), Origen · lote (todas sus ubicaciones por vencimiento, con lote, vence, estado, propietario y disponible), Vence / Propietario / Estado (autocompletados del lote), Disponible, Destino (las que no sirven salen deshabilitadas con el motivo en palabras), Cantidad con «Todo (N)» y Quitar. Bajo cada fila, un mensaje neutral si falta algo («Elige a dónde va.») o rojo si hay un error («Solo hay 48 u disponibles en F-3.1. No se puede mover lo que no existe.»). Las listas se abren en un panel bajo la fila.
- **Cabecera:** destino por defecto opcional (se aplica a las líneas sin destino; las que no pueden ir ahí quedan sin destino y se avisa cuántas; las líneas nuevas lo toman si es válido) y motivo con opciones rápidas.
- **Disponible real** = saldo − lo que otras líneas de la misma orden sacan del mismo lote y ubicación − lo reservado por otros movimientos en curso. Una ubicación en conteo no aparece como origen ni como destino.
- **Barra inferior fija** «X de Y líneas listas · N u · K destinos»; «Revisar y ejecutar» solo con todas las líneas completas y sin errores y con motivo. **Resumen previo:** «Vas a mover N unidades en M líneas, hacia K destinos. Motivo: …» con la lista completa; «Volver a editar» / «Ejecutar movimiento».
- **Al ejecutar:** las unidades quedan reservadas y **en tránsito**; origen y destino muestran «X u en tránsito, por verificar» en el mapa (marca en la celda y en el drawer), el buscador universal (ubicación y lote) y la historia del lote; no se puede programar un conteo en una ubicación con movimientos por verificar. Alerta al Jefe si pasa de 24 h sin verificar (parámetro `movimiento_sin_verificar_horas`).
- **Verificación rápida:** por línea «Coincide» / «Hay una diferencia» y «Marcar todo como «Coincide»»; «Confirmar verificación» solo con todas las líneas con resultado. Si abre el ejecutor, ve el panel con los botones deshabilitados y el aviso.
- **Borrador que no se pierde:** se guarda solo en el dispositivo (localStorage por usuario); al volver se ofrece «Seguir con ese borrador» o «Empezar de cero». Nunca se muestra como ejecutado algo que el servidor no confirmó: si no hay respuesta, el borrador sigue y «Reintentar» reutiliza el mismo `token` (la base no duplica el movimiento).
- **Teléfono:** sin tabla horizontal; cada línea es una fila compacta (producto, origen → destino, cantidad y su mensaje) que se edita en una hoja inferior con pasos Producto → Origen → Destino → Cantidad; barra de resumen y acción principal fijas abajo.
- **Búsqueda tolerante** (sin tildes ni mayúsculas, parcial) en productos, lotes, ubicaciones, mapa, destinos y programación de conteos.
- **No hecho / pendiente:** la **prueba de volumen** (esperando tu base con datos reales); el adaptador de Supabase de estas pantallas sigue sin ejecutarse contra una base real (solo el modo demo y la base local de pruebas).

### Revisión diaria (INV-04), conteos semanales (INV-05) y reportes — construido
- **Revisión diaria** (`/revision-diaria`): el Jefe (o su reemplazo) hace el recorrido de 4 focos —orden y circulación, limpieza, ubicaciones y situaciones anormales—, marca cada foco «sin problemas» o anota **pendientes con responsable obligatorio** (crítico, puede afectar producto, ubicación como texto). **No mueve stock ni decide estados.** Un foco con pendientes abiertos no queda «sin problemas»; no se cierra con focos sin revisar; un pendiente que puede afectar producto avisa a Dirección Técnica. Los pendientes se arrastran de una revisión a la siguiente hasta que su responsable (o el Jefe) los resuelve y el Jefe los verifica o los reabre con su nota; filtro «Solo los importantes». El auxiliar ve «Tienes N pendientes» y resuelve los suyos.
- **Conteos semanales** (`/conteos`): los **3 conteos de la semana** se programan por **rotación** (se sugieren las ubicaciones que hace más tiempo no se cuentan o nunca se contaron; no se repiten dentro de la semana; las que tienen movimientos por verificar no se ofrecen). «Contar ahora» genera el conteo real (ubicaciones en pausa); se cancela con motivo mientras no se genere. El **conteo extra por incidencia** exige decir la incidencia, queda registrado como programación EXTRA y no cuenta entre los 3. Navegación por semana.
- **Reportes** (`/reportes`): inventario, ocupación por propietario, recepciones, calidad, movimientos (una fila por línea), exactitud del inventario (solo conteos cerrados; muestra el % de exactitud) y auditoría. Cada uno con filtros (texto sin tildes ni mayúsculas, selección, rangos de fecha), **vistas guardadas por persona**, tabla en PC/tablet y **tarjetas en el teléfono**, descarga **CSV (con BOM) y Excel** con los mismos filtros, y permisos por rol (exactitud solo para quien gestiona; auditoría solo para quien audita; la descarga también lo comprueba). Definiciones, fórmulas y responsables en `docs/wms/kpis.md` (15 indicadores).
- Código: `domain/operacion.ts`, `domain/reportes.ts`, `services/repositorio-operacion.ts` (+ demo y Supabase, **este último sin ejecutarse contra una base real**), migración 0009 (sin aplicar; 20 pruebas de base de datos).
- **Pendiente / no verificado:** metas y semáforos de los KPI (D-42); prueba de volumen con base real (D-43); el adaptador de Supabase de operación y reportes no corrió contra una base real.

## Bloqueado / pendiente
Ver `docs/wms/decisiones-pendientes.md` (D-01..D-29). Ninguna bloquea la aprobación del Batch 1.

## Para retomar
1. `git checkout feat/wms-batch-1 && git fetch && git merge origin/main`.
2. `npm install` en la raíz (workspaces; no instalar dentro de `apps/*`).
3. `export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` en este contenedor.
4. `npm run test:wms`, `npm run test:db:wms`, `npm run build:wms` y `apps/wms/scripts/e2e-por-viewport.sh`.
5. Leer `apps/wms/CLAUDE.md`, `gate-0.md` y `decisiones-pendientes.md`.
