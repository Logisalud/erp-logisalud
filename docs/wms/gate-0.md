# WMS Logisalud — Gate 0 (auditoría y propuesta)

Fecha: 2026-10-07 · Rama: `feat/wms-batch-1` · Estado: **actualizado con las respuestas del usuario; detenido, esperando confirmación para el Batch 1**.
Nada de lo descrito aquí está aplicado en ninguna base de datos ni desplegado.

Fuentes auditadas: `docs/wms/*` (reglas, topología, experiencia, visión), `procesos/*.xlsx`
(8), `formatos/` (3), `layouts/` (4 planos, adenda AJR, Excel de Odoo), `CONTEXTO.md`, los
`CLAUDE.md`, `packages/*`, las tres apps, CI, y — **solo lectura, solo esquemas, sin datos** —
los dos proyectos Supabase de producción.

Prioridad de documentos aplicada: reglas-negocio > topología > mapeos > formatos >
experiencia > visión > planos/CONTEXTO. Donde se contradicen, gana el mayor y se reporta en B.

---

## Decisiones de este Gate (ya tomadas con el usuario)

| Tema | Decisión |
|---|---|
| Next.js de `apps/wms` | **14.2.29 fijado exacto**, igual que cobranzas y compras. No hay razón funcional fuerte para otra. Motivos: `packages/auth` y `packages/design-system` resuelven `next` desde la raíz (hoy 14.2.29), así que una versión distinta duplicaría copias; `@supabase/ssr ^0.5.2` por el mismo motivo; React 18 (`useFormState`, no `useActionState`); Tailwind `^3.3.0`. |
| Exportación XLSX | **`exceljs` 4.4.0** (lee y escribe, con estilos; ya lo usa `apps/pedidos`). No se usa `xlsx` (SheetJS) de npm. |
| PDF de actas | **`@react-pdf/renderer` ^4.9** (ya lo usa `apps/compras`; consistente y sin Chromium en serverless). |
| Seguridad de dependencias | No es prioridad ahora. Deuda técnica registrada abajo, **sin acción**. |
| Playwright | `@playwright/test` 1.63 instalado; ruta del Chromium por `PLAYWRIGHT_CHROMIUM_PATH` (ver G). |
| Base de pruebas | **Postgres local** (16.15, verificado que corre). Nada con costo: ni branch de Supabase ni servicios pagos (§G). |
| Vercel | Aprobado solo si no genera costo. **Verificado: sí genera consumo de build → NO creado** (E.5, D-21). |
| Rack A | Llega a **A-27** (planos 2026, tabla de Diphasac, Odoo). `topologia.md` corregida en la rama; llega a `main` con el PR del Batch 1. |
| Cargo | **"Jefe de Almacén"** en la interfaz y en el acta (reglas-negocio.md corregido). |
| Recepciones | Una OC puede tener varias **solicitudes** de ingreso (entregas parciales); cada solicitud es un ingreso distinto en el WMS *(addendum 2026-10-08; antes: una recepción de Compras = un ingreso)*. |
| Quién aprueba | **Katia** registra Aprobado o Bajas/Rechazados al firmar el acta organoléptica; Charlie no ejecuta ese cambio. |
| Vencimiento | Fecha **completa** del producto físico; solo si el producto muestra mes y año → último día del mes. |

---

## A. Mapa técnico y qué reutilizar

### A.1 Dos proyectos Supabase en producción (verificado contra la base, solo esquemas)

| Proyecto | Contiene |
|---|---|
| `erp-cobranzas` (`qpkigzniatidsvnxikox`) — el **consolidado** | `public` (perfiles, clientes, documentos…), `compras`, `almacen`, `catalogo`, `cuentas_x_pagar`, `pedidos` (solo una parte: `cliente_config`, `price_lists`…) y otros. **No existe schema `wms`.** |
| `Logisalud_pedidos` (`dfqhxwkdflnkcjnysbwu`) | `pedidos` completo: `products` (270), `suppliers`, `inventory_sources` (2: central/regional), `warehouses` (2), `stock_lotes` (205), órdenes, despacho… |

→ El WMS va en el **consolidado** (donde viven `perfiles`, `catalogo.productos` y `almacen.recepciones`).
Pedidos sigue aparte (consistente con el CLAUDE.md raíz), por lo que cualquier integración de
stock con Pedidos es cruce de proyectos y queda fuera de alcance.

### A.2 Qué se reutiliza

| Pieza | Fuente | Cómo |
|---|---|---|
| Maestro de productos | `catalogo.productos` (509 filas, RLS: lee cualquier perfil; escribe `compras`, `direccion_tecnica`, `admin`) | Se reutiliza **tal cual**. Tiene `controla_lote`, `controla_vencimiento`, `unidad_medida`, `marca`, `principio_activo`, `proveedor_id` nullable (sirve para productos de clientes que no compramos). **No tiene registro sanitario**: ver C.1 (se agrega en una tabla 1:1 de `wms`, sin tocar `catalogo`). |
| Proveedores | `compras.proveedores` (22) | Solo lectura. Diphasac existe (RUC 20546207219, `tipo='ambos'`). Logissa, Triamed, Medic Pharma Lab y AJR Labs **no existen** en ninguna tabla. |
| Recepción de Compras | `almacen.recepciones` (11) + `recepciones_items` (33) + `recepciones_guias` (11) + `compras.ordenes_compra(_items)` | Solo lectura vía vistas `wms.v_oc_pendientes` (origen de la solicitud) y `wms.v_recepciones_compra` (solo para reconciliar lo que Charlie copia a Compras) (`security_invoker`). Es la **cantidad de referencia** de la compra local. |
| Auth y sesión | `@logisalud/auth` (`middlewareSesion`, `crearClienteServidor`, `perfilActual`, `exigirArea`, login/callback) | Reutilizar sin cambios. Compras es el modelo. |
| Marca / tokens | `@logisalud/design-system`: preset Tailwind, tokens CSS, `BrandMark` | Reutilizar el preset y el logo. **No hay componentes de UI** (botones, cards, inputs): el WMS los crea en `apps/wms/components`. |
| Estructura de app | `apps/compras` (`app/`, `domain/`, `services/`, `components/`, `lib/`, `tests/`) | Replicar. Mensajes para el usuario como valor de retorno (`ResultadoAccion`), Server Actions para escrituras. |
| Tests | Vitest 4 en compras (`@vitest-environment jsdom` por archivo, alias `server-only`, `supabase-mock`) | Replicar la configuración. |
| Excel / PDF | `exceljs` (pedidos), `@react-pdf/renderer` (compras) | Ver decisiones. |
| CI | `.github/workflows/ci.yml` (job por app) | Agregar job `wms`. |

### A.3 Qué NO existe y hay que construir
Schema `wms` y todo su modelo; rol/permisos de WMS (no hay rol ni área "wms" en `perfiles`);
tabla de propietarios; estado sanitario; ledger; auditoría compartida (Compras no tiene; Pedidos
tiene `pedidos.audit_logs` con trigger genérico, solo para su schema); Supabase local/stubs para
pruebas (descritos en prosa en la doc de Pedidos, **no están en el repo**); `.env.example` del WMS;
`dev/build/test:wms` en el `package.json` raíz; job de CI.

### A.4 Riesgos del entorno existente que condicionan el diseño
1. **Hueco de acceso en Compras** (CONTEXTO.md:5-57): `compras.flags.acceso_abierto_temporal = true`
   en producción da a **cualquier perfil logueado** lectura y escritura sobre las tablas de los 8
   schemas existentes (incluye `almacen.*`). Consecuencia para el WMS: lo que lea de Compras puede
   cambiar después. → El WMS **guarda una copia (snapshot) de lo consumido** en el momento de
   confirmar el ingreso y marca divergencias; y su propio schema se crea **sin** esa policy temporal.
   No dependemos de que se apague.
2. **Lote, vencimiento, temperatura, bultos, paletas, placa** fueron retirados de la recepción de
   Compras (2026-09-18, "módulo de inventario aparte"). Las columnas `lote`/`fecha_vencimiento` de
   `almacen.recepciones_items` existen pero nadie las escribe: **el WMS es la única fuente** de esos datos.
3. **Unidad**: `catalogo.productos.unidad_medida` es texto descriptivo (TABLETA, AMPOLLA…), no
   "unidades"; las cantidades de Compras son `numeric(14,3)`. El ledger WMS usa **enteros** (ver C).
4. **Recepción de Compras no es atómica** (inserta cabecera, guías y líneas por separado y
   compensa borrando si falla). El WMS consume solo recepciones completas (≥1 línea).
5. **Migraciones**: en la base consolidada se aplican **a mano** (MCP `apply_migration` o SQL),
   no al mergear. Un schema nuevo exige además: exponerlo en Dashboard → Data API → Exposed
   schemas (lo hace Sebas; si falta, HTTP 406) y sumarlo a `public.schemas_compras_y_pagos()` +
   `select public.aplicar_grants_del_modulo();` (si falta, HTTP 403).
6. **`perfiles.area`/`rol` tienen CHECK**: agregar roles WMS ahí exige tocar una tabla de otro
   módulo. → Los roles del WMS viven en una tabla propia (`wms.usuario_roles`) y los lee un helper
   `wms.tiene_rol()`; `perfiles` solo se usa para identidad y nombre.

---

## B. Conflictos entre repo, reglas, mapeos, formatos y planos

Formato: **qué choca → quién gana → qué hago**.

| # | Conflicto | Resolución |
|---|---|---|
| B1 | **Rack A.** topologia.md decía que los planos 2026 dibujan hasta A-21. Verificado en los 4 PDFs 2026: **sí dibujan A-10 a A-27** (DIPHASAC .pdf lo asigna "A-14.1 al A-27.1, A-10.2 al A-27.2…"). El plano AJR 2023 citado no está en el repo y está desactualizado. | **RESUELTO por el usuario:** el rack A llega a A-27. `topologia.md` ya está corregida en la rama; A-22..A-27 se cargan como posiciones normales (no "por verificar"). |
| B2 | **E-9.1 y E-10.1** no figuran en la tabla de Logissa. Los planos las dibujan; Odoo las tiene; el total de Logissa (123 pallets rack = 221.40 m³) solo cuadra si se cuentan. | Se crean a nombre de Logissa, **"por verificar"**. |
| B3 | **Posiciones sin propietario** pero dibujadas y presentes en Odoo (en Stock): **I-8.1..I-8.4** y **J-12.4**. | Se crean **libres** (sin asignación) y "por verificar". Si Odoo trae stock ahí, la carga inicial lo reporta como anomalía (F). |
| B4 | **Posiciones que topologia.md pone en un área distinta de donde Odoo las trae** (Odoo: bajo `Stock`): A-13.1 (Devoluciones de MPL), J-11.1 (Contramuestra de MPL), J-11.3 (Bajas de MPL), J-13.4 (Contramuestra de Diphasac). | topologia.md manda para el **área**; qué estado sanitario tiene el stock que hoy hay ahí es decisión sanitaria → `decisiones-pendientes.md` D-08. |
| B5 | **Odoo no tiene subracks** (`E-8.1` e `I-1.1` son una sola ubicación); topología pide `E-8.1.1..4` e `I-1.1.1..4`. Odoo tampoco trae A-1..A-9, A-M1, K-1..K-7, K-M2 ni la posición de "Calidad" como código. | Se crean en WMS desde topología. Carga inicial: `E-8.1`/`I-1.1` → exige instrucción de a qué subrack va cada unidad (F). "Calidad" no se migra. |
| B6 | **26 posiciones esperadas por topología no existen en Odoo** (Logissa G-1.1, G-1.3, G-1.4, G-3.1, G-4.1, G-5.1, G-6.1, E-8.1.1-4; AJR G-7.1..G-10.1, J-13.1, J-13.3, A-11.1; Diphasac A-12.1, J-13.2, y J-12.1/J-12.2 que están bajo Bajas; Triamed I-1.1.1-4). | Normal: son posiciones nuevas o contratos recientes. Se crean en WMS; Odoo no las valida. |
| B7 | **Adenda AJR**: topología la registra vigente desde 01/05/2026 y coincide posición por posición (G-7..G-10 niv. 1-4, J-13.3, J-13.1, A-11.1). Pero en la imagen **solo se ve la firma de Logissa**; el recuadro de AJR Labs está vacío aunque el archivo se llama "FIRMADO". El punto SEGUNDO habla de cambios "desde 01/04/2025" sin listar contenido. Los 4 planos de agosto 2026 no muestran a AJR (posiciones sin asignar). | La asignación se registra con vigencia 01/05/2026 y el PDF como sustento, **marcada "por confirmar firma"**. D-10. |
| B8 | **Quién registra "Aprobado"**: mapeos INV-03/REC-01 dicen que Charlie registra Aprobado tras la decisión de Katia; reglas dice que Katia decide y firma en el WMS. | **RESUELTO:** Katia registra Aprobado o Bajas/Rechazados al firmar el acta organoléptica en el WMS. Charlie **no** ejecuta ese cambio. (reglas-negocio.md actualizado). |
| B9 | **INV-02 "no revisa la decisión de DT"** vs reglas "el sistema bloquea salir de Cuarentena sin Aprobado + acta firmada + mismo propietario". | Gana reglas: el bloqueo es del sistema (dominio y BD). |
| B10 | **Vencimiento solo mes/año**: la práctica usa fecha completa; reglas fija último día del mes. | **RESUELTO:** se registra la fecha completa del producto físico; solo si el producto muestra mes y año se usa el último día del mes (se conserva el texto original). reglas-negocio.md actualizado. |
| B11 | **Transportista**: mapeo AS-IS dice que no firma; reglas lo hace firmar en pantalla con nombre, DNI y placa. El formato LS-FR.03.05 **no tiene campo DNI** (sí NOMBRE, FIRMA, FECHA, HORA) y la placa va en otro bloque. | Gana reglas. El PDF agrega DNI → es un cambio a un formato controlado: D-12. |
| B12 | **Tipos de ingreso en formatos**: LS-FR.03.05 tiene IMPORTACIÓN / COMPRA LOCAL / DEVOLUCIÓN / OTROS (sin "Ingreso de cliente"); LS-FR.05.05 agrega TRASLADO INTERNO. Reglas: compra local, devolución, ingreso de cliente (importación y traslado fuera de alcance). | Gana reglas. "Ingreso de cliente" se imprime en el casillero OTROS con texto; importación/traslado quedan en el modelo como valores deshabilitados (punto de extensión). D-12. |
| B13 | **Rechazados**: mapeos AS-IS devuelven observados al proveedor; reglas: "lo rechazado en Cuarentena nunca vuelve al proveedor" (destino pendiente de Katia). Una devolución al proveedor además es una salida. | Gana reglas. No se modela salida a proveedor. |
| B14 | **Muestreo**: mapeo REC-01 "criterio definido por DT" y revisión del 100% de cajas (AS-IS); reglas fija techo(√n)+1 (pendiente #6 de Katia). | Se implementa techo(√n)+1 **parametrizado** (una función con constante configurable) hasta que Katia confirme. |
| B15 | **Temperatura**: mapeos piden medirla sin rango; reglas: 15–25 °C, se recibe y se alerta. | Gana reglas. Rango en configuración. |
| B16 | **Roles/nombres**: reglas usa "Responsable de Almacén" (roles) y "Jefe de Almacén" (firma del acta; también el formato). Mapeos solo nombran a Charlie como autorizador de movimientos (Roberto/Jasury no aparecen). Mapeo INV-05 nombra a Mariela Casiano para ajustes; reglas solo a Katia. | **RESUELTO (cargo):** "Jefe de Almacén" en la interfaz y en el acta; rol técnico `jefe_almacen`. Ajustes: solo Katia (reglas); D-18 sigue abierta. |
| B17 | **Mapeos de devolución e ingreso de cliente no existen**; REC-02/03 solo cubren compra local. Visión dice "no definir todavía el flujo de devoluciones"; reglas ya lo definen. | Gana reglas. Se implementa lo que dicen reglas; lo no mapeado (p. ej. checklist específico de devolución) se registra como pendiente. |
| B18 | **Visión** pide el WMS completo (picking, despacho, holds, VERDE/ÁMBAR, stock vendible); **alcance del prompt** lo excluye. Visión no incluye la transición Cuarentena → Bajas/Rechazados que reglas sí tiene. | Gana alcance + reglas. Puntos de extensión en D. |
| B19 | **INV-01 (stock para Comercial)** y publicación a Pedidos: fuera de alcance, y Pedidos está en otro proyecto Supabase. | Fuera. Punto de extensión documentado (E.8). |
| B20 | **README/CONTEXTO** dicen que `/pedidos` es un rewrite; en el código no existe (es un link externo en `public.modulos`). El CLAUDE.md raíz dice que `design-system` es placeholder, pero compras lo consume. CLAUDE.md de cobranzas dice "sin auth", pero ya usa `@logisalud/auth`. El CLAUDE.md de pedidos dice que las migraciones ya no se aplican solas; su `architecture.md` dice que sí. | Ruido ya conocido. Para el WMS: **migraciones a mano**, `@logisalud/auth` real, design-system = preset + logo. Se corrige el CLAUDE.md raíz cuando se mergee (agregar `apps/wms`). |
| B21 | **Mapeos**: columna G ("¿Qué se entrega?") desfasada en INV-02/03, REC-01/02; pasos vacíos INV-02 A17, INV-03 A18/A19. | Se usó el texto de los pasos; los resultados sueltos de la columna G se usaron solo como pista (REC-01: "Solicitud de Ingreso preparada", "Acta de Recepción completada", "Expediente digital cerrado"). |
| B22 | **Formato LS-FR.55.02**: el archivo tiene 17 hojas de ejemplo con códigos viejos (POE.DT.RP.04.04, fecha 2018, Gabblan) y la plantilla vigente es la hoja 18 `FR.DT.SP.04.01` (vigente 01-09-2026 a 01-09-2029). **No tiene numeración propia.** Los otros dos formatos vigan 2 años. | Se usa solo la hoja 18. Numeración del acta organoléptica: D-13. |
| B23 | **Plano DIPHASAC** rotula la fila J "APROBADOS/CONTROLADOS"; reglas dice "no hay productos controlados". TRIAMED I-1.1.4: 1.2×1×1.1 m declara 1.20 m³ (equivale a altura 1.0). | Nombre de área = "Aprobados". Las dimensiones se guardan como dato informativo de capacidad, no como regla. |
| B24 | **Compras → WMS: cantidad "pedida/establecida"** del acta (LS-FR.03.05 "CANTIDAD ESTABLECIDA") viene de la OC/factura; Compras guarda `cantidad_factura` y `cantidad_fisica`. Reglas: la cantidad de referencia de compra local es la **recepción registrada en Compras** (cantidad física). | Referencia = `cantidad_fisica` agregada por línea; "establecida" = `cantidad_factura`. |
| B25 | **Visión/experiencia**: estados vacíos con emoji distinto para lo mismo; experiencia pide "no abusar de emojis" pero los usa en cada ejemplo; "cargando" no está definido. | Criterio único en el ADR de UX (Batch 1): emoji solo en éxito/vacío, nunca en errores ni en documentos formales. |

Conflictos de **inconsistencia entre fuentes de verdad** detectados en producción que no dependen del WMS (para tu información, **no los toco**):
- RLS **desactivado** en 3 tablas de respaldo de `Logisalud_pedidos`: `pedidos.promo_escalas_backup_20261006`, `pedidos.promo_bonificaciones_backup_20261006`, `pedidos.promo_descuentos_cond_backup_20261006`. Quedan expuestas a la anon key. SQL de remediación sugerido por el advisor: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` (decídelo tú: habilitar sin políticas las bloquea para todos).

---

## C. Contratos

### C.1 Producto (con registro sanitario)
- Identidad: `catalogo.productos.id` (uuid). El WMS **no copia** descripción ni código: los lee por vista.
- Datos regulatorios en **`wms.producto_regulatorio`** (1:1 con el producto; evita modificar `catalogo` y respeta "Compras y Pedidos solo aditivo"):
  `producto_id` PK/FK, `registro_sanitario`, `rs_vence` (date), `fabricante`, `forma_presentacion`,
  `creado_por` (Sandra), `validado_por` / `validado_en` (Katia), `estado_validacion`
  (`PENDIENTE`|`VALIDADO`|`OBSERVADO`).
- **Alta por Sandra, validación por Katia**: Sandra crea el producto (en `catalogo.productos` por su
  RLS de `direccion_tecnica`, a través de una acción del WMS) y su fila regulatoria; Katia la valida.
  Un producto sin validar no puede recibir ingreso (regla de dominio y BD).
- RS vencido: `rs_vence < hoy` ⇒ alerta inmediata a Katia y **bloqueo de aprobación** del lote (regla 4 de Recepción).
- Productos de clientes no comprados: compatibles (`proveedor_id` y `precio_compra` son nullable).
- ⚠️ Pendiente: confirmar que el área de Sandra en `perfiles` es `direccion_tecnica` (D-30).

### C.2 Lote
`wms.lotes`: `id`, `producto_id`, `codigo`, `vence` (date, **último día** del mes si el dato fue mes/año),
`vence_texto_original` (p. ej. "02/2027"), `propietario_id`. Único `(producto_id, codigo, propietario_id)`.
Un lote físico de dos propietarios son dos lotes (el propietario es parte de la identidad del saldo).
**El lote es solo identidad (producto + código + vencimiento + propietario): no lleva estado sanitario.**
Si llega otra entrega con el mismo producto, código y propietario se reutiliza el mismo lote, pero con
el mismo vencimiento; con otro vencimiento la base lo rechaza ("mismo lote con otra fecha").

### C.3 Propietario (vs `inventory_source_id`)
- `wms.propietarios`: `id`, `codigo` (`LOGISSA`…), `razon_social`, `ruc`, `es_dueno_del_almacen`
  (solo Logissa), `proveedor_id` nullable (→ `compras.proveedores`; hoy solo Diphasac), `activo`.
  Seed: Logissa, Diphasac, Triamed, Medic Pharma Lab, AJR Labs. RUC de Logissa y AJR salen de la
  adenda; los demás se completan por configuración.
- **No es** `pedidos.inventory_sources` (`central`/`regional`): esa es la *fuente de stock para
  despachar* de Pedidos, no el dueño. Se deja un punto de extensión `wms.propietario_fuente_stock`
  (propietario ↔ fuente) para cuando se integre Pedidos; hoy no se crea nada.
- "Diphasac → Logissa solo por conducto regular": una compra a Diphasac de stock ya guardado
  genera una solicitud de compra local con propietario Logissa cuyo inventario nace en Cuarentena (supuesto
  pendiente de Katia, D-01).

### C.4 Posición
`wms.posiciones`: `id`, `codigo` único (nomenclatura de topología: `A-10.2`, `E-8.1.3`, `B-1`),
`rack`, `posicion`, `nivel`, `subnivel`, `forma` (`RACK`|`PISO`|`MESA`|`SUBRACK`), `tipo_area`
(→ `wms.tipos_area`), `activa`, `por_verificar` + `nota_verificacion`, dimensiones informativas.
`wms.tipos_area`: Recepción, Cuarentena, Devoluciones, Aprobados, Bajas/Rechazados, Contramuestra,
Embalaje, Despacho; con `es_compartida` (Recepción, Cuarentena, Embalaje, Despacho) y `en_alcance`.
`wms.area_estado_admitido` (la matriz de reglas "Zonas BPA", **como datos**): (tipo_area, estado, origen_requerido).

### C.5 Asignación con vigencia
`wms.asignaciones_posicion`: `posicion_id`, `propietario_id`, `desde`, `hasta` (null = abierta),
`documento_id` (→ `wms.documentos_sustento`: contrato/adenda/plano con fecha y archivo),
`estado_confirmacion`. Restricción de BD: para posiciones **no compartidas**, rangos `[desde,hasta)`
**no se solapan** (exclusion constraint con `btree_gist`); las compartidas admiten varios a la vez.
Regla: un cambio de asignación **no mueve stock**; una asignación vencida hace que la posición
deje de aceptar ingreso/movimiento del propietario anterior, lo ya guardado se queda (test 17).

### C.6 Origen y cantidad de ingreso por tipo *(reescrito 2026-10-08 por el addendum de flujo de ingreso)*
| Tipo | Se origina en | Referencia obligatoria | Nace en |
|---|---|---|---|
| Compra local | **Solicitud de Ingreso** prellenada desde la OC (varias solicitudes por OC; varias líneas por línea de OC) | OC (+ guía; la factura vive en Compras) | Cuarentena (A-6..A-9) |
| Devolución | Solicitud con guía de devolución | **Factura o boleta original** (bloquea si falta) | **Área de Devoluciones**, estado Devoluciones |
| Ingreso de cliente | Solicitud con la guía del cliente; propietario = el cliente | Guía | Cuarentena (A-6..A-9) |
Invariante de un ingreso cerrado: `solicitud final = cantidad aceptada = acta (recibida) = suma de lotes = inventario creado`. La cantidad física se
captura **una sola vez, en el WMS**; Compras la consume (hoy, copiándola a mano). Unidades **enteras**. Detalle en `analisis-addendum-inbound.md`.

### C.7 Estado
Cuatro valores en tabla de catálogo (`wms.estados_sanitarios`: `CUARENTENA`, `DEVOLUCIONES` («Devoluciones», solo devoluciones: espera su evaluación), `APROBADO`, `BAJAS_RECHAZADOS`),
no `enum` de Postgres (permite extender). Transiciones permitidas en `wms.transiciones_estado`
(datos): Cuarentena→Aprobado, Cuarentena→Bajas/Rechazados, Devoluciones→Aprobado, Devoluciones→Bajas/Rechazados, Aprobado→Bajas/Rechazados (con sustento).
**Aprobado→Cuarentena: prohibido** por trigger de BD **y** por dominio. Estado, condición, ubicación,
propietario y origen son columnas distintas. `condicion` (VERDE/ÁMBAR) existe **nullable**, con
CHECK "solo si estado = APROBADO", sin UI.

**¿Dónde vive el estado sanitario? En cada unidad contada, no en el lote.** El ledger y el saldo se
identifican por **(posición, producto, lote, propietario, estado, `procedencia_id`)**; `procedencia_id`
es el `ingreso_lote` que dio origen a esas unidades (la entrega concreta, con su acta). Caso: el lote ABC
ya está Aprobado por una recepción anterior y llega otra entrega del mismo lote:
1. La entrega nueva es **otro ingreso** (cada solicitud lo es). Sus unidades **nacen** en
   Cuarentena (A-6..A-9) con su propia procedencia. Nacer en Cuarentena es un ingreso, no una transición,
   así que no choca con "Aprobado→Cuarentena prohibido".
2. Las unidades antiguas siguen Aprobadas en su rack: nada las toca. Por eso **nunca vuelven a Cuarentena**.
3. La nueva **no hereda** la aprobación: el pase a Aprobado es un `CAMBIO_ESTADO` que exige el acta
   organoléptica firmada **de esa procedencia** (Batch 2) y solo puede mover hasta las unidades que esa
   procedencia todavía tiene en Cuarentena. Aprobar la entrega 2 no aprueba la 3 aunque compartan lote.
4. Resultado: el lote ABC tiene a la vez dos celdas de saldo (una Aprobada, otra en Cuarentena). Las
   consultas "por lote" suman ambas, pero muestran el desglose por estado. La búsqueda y el mapa
   siempre muestran el estado junto a la cantidad.
Esto **ajusta el modelo**: se agrega `procedencia_id` a `partidas` y a `saldos` (antes solo estaba en el
ingreso). En Batch 1 es una columna sin FK (los ingresos llegan en el Batch 2); el Batch 2 agrega la FK.

### C.8 Documentos firmados
Ciclo: `BORRADOR` → `FIRMADA` → (`ANULADA` con motivo y `reemitida_como` vinculada). Trigger de BD:
una fila `FIRMADA` no admite UPDATE salvo el paso a `ANULADA` (motivo, usuario, fecha obligatorios);
nunca DELETE. La reemisión crea un acta **nueva** con `reemplaza_a`. Cada firma guarda: rol de
firma, usuario (login) o datos del transportista (nombre, DNI, placa, imagen de la firma),
fecha/hora, y el **hash SHA-256** del contenido canónico del acta al firmar (verificable).
Actas: Recepción (LS-FR.03.05, `I-AAAAMM-correlativo`), Evaluación Organoléptica (LS-FR.55.02,
una por producto y lote; numeración: D-13), Solicitud de Ingreso (LS-FR.05.05, editable con
historial: versiones inmutables, no se firma).

---

## D. Modelo de datos v0.1 (schema `wms`)

Convenciones: `uuid` PK, `created_at/by`, RLS activo desde el `create table`, **todas** las
tablas con grants solo a `authenticated`, sin política "acceso temporal", migraciones
re-ejecutables, ninguna API route con service role para servir negocio.

**Configuración (datos, no código):** `propietarios`, `tipos_area`, `area_estado_admitido`,
`estados_sanitarios`, `transiciones_estado`, `posiciones`, `posicion_geometria` (x, y, ancho, alto,
rotación, `aproximada` bool, `plano_ref`), `calibraciones_plano`, `documentos_sustento`,
`asignaciones_posicion`, `parametros` (rango de temperatura 15–25, constante del muestreo, etc.),
catálogos (`motivos_movimiento`, `causas_diferencia`, `tipos_pendiente`, `tipos_documento`,
`tipos_movimiento` ← **tabla, no enum**: se agregan SALIDA/PICKING… después sin migrar tipos).

**Personas y permisos:** `usuario_roles` (user_id → `auth.users`, rol, desde, hasta). Roles:
`direccion_tecnica` (Katia: decide y firma estados), `asistente_dt` (Sandra), `jefe_almacen` (Charlie, "Jefe de Almacén"),
`reemplazo_jefe` (Roberto, Jasury), `auxiliar`, `auditoria_lectura`, `admin_wms`. Helper
`wms.tiene_rol(...)` (security definer, `search_path` fijo) usado por todas las policies.
`wms.permisos_rol` (rol → acciones: ver, ejecutar, verificar, aprobar, ajustar, configurar, exportar, auditar).

**Maestros:** `producto_regulatorio` (1:1 `catalogo.productos`), `lotes`.

**Entradas:** `ingresos` (tipo, propietario, `compra_recepcion_id` nullable, referencia de documento,
estado, `snapshot_compras jsonb`, `temperatura_c`, `alerta_temperatura`), `ingreso_lineas`
(producto, `cantidad_referencia`), `ingreso_lotes` (línea → lote, cantidad, vence), `solicitudes_ingreso`
+ `solicitud_ingreso_versiones`, `actas_recepcion`, `actas_organolepticas`, `acta_firmas`,
`alertas` (tipo: `TEMPERATURA`, `RS_VENCIDO`; destinatario; estado), `expedientes`,
`expediente_documentos` (enlaza, no duplica), `expediente_faltantes` (documento, responsable, estado).

**Ledger y saldos:**
- `movimientos` (cabecera: tipo → `tipos_movimiento`, flujo `PREPARADO`→`EN_VERIFICACION`→`CONFIRMADO` |
  `ABIERTO_CON_DIFERENCIA` | `REVERTIDO`, motivo, ejecutor, verificador, `reversa_de`, referencia de origen).
- `partidas` (**el ledger**, append-only): `movimiento_id`, `posicion_id`, `producto_id`, `lote_id`,
  `propietario_id`, `estado`, `procedencia_id` (entrega que originó las unidades), `condicion` (nullable), `origen_ingreso` (dimensión), `delta` (entero ≠ 0),
  `fecha`. Un movimiento interno = dos partidas (−origen, +destino) en la misma transacción.
  Trigger: **prohíbe UPDATE y DELETE**. Reversa = movimiento nuevo con `reversa_de`.
- `saldos`: **derivado**. Mantenido solo por un trigger de `partidas` y reconciliable
  (`wms.verificar_saldos()` compara contra `SUM(partidas)`); `CHECK (cantidad >= 0)`. Si el volumen no
  lo exige, se reemplaza por vista (ADR-004).
- **Concurrencia (test 14):** toda escritura al ledger pasa por funciones SQL
  (`wms.postear_movimiento`, …) que toman `pg_advisory_xact_lock` sobre cada celda
  (posición, producto, lote, propietario, estado) en **orden determinista** (evita deadlock) y
  validan saldo suficiente en la misma transacción; el segundo usuario recibe un error tipado que la
  UI traduce ("Alguien más ya movió estas unidades. Actualiza y vuelve a intentar.").
- Validaciones de **zona, propietario y estado** dentro de esas mismas funciones y como triggers
  sobre `partidas` (defensa en profundidad): destino del mismo propietario vigente; estado admitido
  por la matriz del área; Cuarentena→rack solo con Aprobado + acta organoléptica firmada; Rechazado
  solo a Bajas/Rechazados del mismo propietario; verificador ≠ ejecutor.

**Inventarios y revisión:** `conteos` (programación 3/semana, alcance), `conteo_lineas` (conteo ciego:
la UI y la función **no devuelven** el esperado hasta cerrar el primer conteo), `reconteos` (otra
persona), `posicion_pausas`, `ajustes` (antes, después, motivo, evidencia; requiere aprobación
`direccion_tecnica` y genera partida), `revisiones_diarias` + `pendientes_revision` (4 focos,
responsable, estado).

**Auditoría:** `audit_events` (append-only, trigger anti-UPDATE/DELETE): actor, momento, evento,
entidad, `antes`/`despues` jsonb, motivo, fuente. Se escribe **dentro** de las funciones de
negocio (misma transacción), no desde la app, para que no se pueda olvidar.

**Vistas de integración (aditivas):** `wms.v_recepciones_compra` (`security_invoker`) sobre
`almacen.*` + `compras.*` + `catalogo.productos`. En Compras/Pedidos **no se modifica nada** más
que, si hiciera falta, un `grant usage`/`select` explícito.

### Puntos de extensión (sin construir)
Salidas: `tipos_movimiento` extensible + `partidas` con `referencia_tipo/id` para pedido/picking.
VERDE/ÁMBAR: columna `condicion` + tabla `eventos_condicion` futura. Hold: tabla `holds` futura
referenciando celdas de saldo; `saldo_disponible` = saldo − holds. Origen: `origen_ingreso` ya es
dimensión (compra, devolución, cliente; importación/traslado deshabilitados). Importaciones: el
tipo de ingreso existe deshabilitado. Integración Pedidos: `propietario_fuente_stock` +
`eventos_integracion` (outbox) futuros. Capas del mapa: registro de capas por clave.

---

## E. Arquitectura de `apps/wms`

### E.1 Estructura
```
apps/wms/
  app/ (login, auth/callback, inicio, almacen/{mapa,posiciones}, buscar, productos, ingresos,
        calidad, movimientos, conteos, revision-diaria, reportes, auditoria, configuracion, api/)
  domain/      reglas puras (sin Next ni Supabase): estados, zonas, muestreo, invariante de lotes…
  services/    efectos (Supabase con anon + RLS; escritura vía funciones SQL)
  components/  UI propia (botones, tablas→cards, drawer, mapa, firma)
  lib/         env, navegación, formato de fechas/números, exceljs, react-pdf
  supabase/migrations/   numeración propia, p. ej. 0001_wms_base.sql (re-ejecutables)
  tests/{domain,services,components,db}   e2e/   PRODUCT.md  DESIGN.md  CLAUDE.md
```
- `next.config.js`: `basePath: '/wms'`, `env.NEXT_PUBLIC_BASE_PATH='/wms'`, `images.unoptimized: true`,
  y todas las trampas ya documentadas en compras (assets de `public/` con prefijo manual, `fetch`
  de cliente con basePath, `redirect` con `request.nextUrl.clone()`, "Atrás" con pila en memoria).
- `middleware.ts` con `middlewareSesion` (matcher literal, sin basePath). Tailwind con el preset del
  design-system y `content` que incluya `packages/auth/src`.
- Roles en servidor **y** en BD; la UI solo oculta. Inicio por rol.
- Mensajes para personas como valor de retorno (`ResultadoAccion`), español peruano con tuteo
  (nota: el código existente de compras usa voseo; el WMS **no**). El cargo de Charlie se muestra siempre como "Jefe de Almacén".

### E.2 Visual Warehouse — ADR-002 (propuesto): **SVG**
~330 posiciones (Odoo 314 + áreas) y unos cientos de nodos como máximo: SVG renderiza esto con
fluidez, da accesibilidad (cada posición es un elemento con `role`/`aria-label`), hit-testing y
estilos por capa sin código extra, y se exporta/prueba con Playwright. Canvas solo se justifica con
miles de nodos. Pan/zoom por transformaciones y *pointer events*; capas como grupos (`<g>`);
geometría en `posicion_geometria` (editable); **layout aproximado marcado como tal** con herramienta
de calibración (escalar/mover racks sobre una imagen del plano). Referencia de disposición
(aproximada, de los PDFs): columnas verticales de racks J | I,H | G,F | E | D,C,B (pasillos entre J|I, H|G, F|E, D|C);
posiciones 10 (o 13 en J) arriba y 1 abajo; rack A horizontal inferior con A-27 a la izquierda;
Cuarentena A-9..A-6 y Recepción A-5..A-1 + A-M1 hacia el este; Despacho K-7..K-1 sobre Recepción; entrada
de mercadería al este. En teléfono: sin plano; búsqueda + "dónde está" en texto + drawer.
Drag-and-drop solo **prepara** un movimiento.

### E.3 Firma electrónica
Firma simple con usuario logueado: re-autenticación corta (código de 6 dígitos del login) al
firmar + sello de tiempo + hash SHA-256 del contenido canónico + usuario. Transportista: lienzo táctil
(`pointer events`, PNG) + nombre, DNI, placa; imagen en bucket privado `wms-firmas`. **Validez
regulatoria/ante DIGEMID de este tipo de firma: pendiente D-11** (decisión regulatoria; el
modelo admite agregar proveedor de firma digital después sin rehacer).

### E.4 Generación de actas (PDF)
`@react-pdf/renderer` en Route Handler del servidor, A4 apaisado, **replicando los campos y
códigos de los formatos** (cabecera con Cod. POE/Formato y vigencia, tablas, 3 bloques de firmas,
pie "no podrá ser reproducido…"). Se genera desde el contenido firmado y se verifica contra el hash.
El nombre/versión del formato vigente va en `parametros`, no en código.

### E.5 Proyecto Vercel `erp-logisalud-wms` — **NO CREADO (hay costo)**
Condición del usuario: crearlo solo si no genera costo adicional. Se verificó con la facturación del equipo
`logisalud` (solo lectura): el equipo tiene **facturación por consumo** (un día de muestra: USD 0.40 facturados,
USD 1.07 de costo efectivo; **"Build CPU Minutes" USD 0.308**, el renglón más caro; existe además "Additional
Team Seats"; no pude leer el nombre del plan). Un proyecto nuevo enlazado a Git construye en cada push de
la rama y cada build consume minutos de build, así que **sí agrega costo** (pequeño, no cuantificable con
precisión). Por la condición, **no lo creé**. Detalle y opciones en `decisiones-pendientes.md` (D-21).

Si decides crearlo, la configuración prevista es:
1. Proyecto `erp-logisalud-wms`, repo `Logisalud/erp-logisalud`, Root Directory `apps/wms`, Next.js, Node 22.
2. **Solo Preview**; sin Production Branch; **Ignored Build Step** para construir solo cuando cambie `apps/wms`.
3. Variables solo Preview: ninguna de producción. Sin service role. El Preview usará el modo demostración (D-27).
4. Cobranzas (raíz de `erp.logisalud.com`) **no se toca**: rewrite `/wms`, `rutasPublicas` y `public.modulos` quedan para después (D-23).
5. Los `*.vercel.app` están protegidos en cobranzas; el rewrite hacia un Preview protegido puede fallar → se valida con la URL directa.
6. Tras crearlo: **recargar y verificar que la configuración quedó guardada** (Root Directory, Ignored Build Step, ramas, variables) y reportarlo.

### E.6 Roles y permisos — ADR-003: tabla propia `wms.usuario_roles`
Ver A.4.6. Evita migrar CHECKs de `perfiles` y mantiene el cambio aditivo.

### E.7 Ledger y saldos — ADR-004 / E.8 Extensión
Ver D. Salidas, Pedidos, VERDE/ÁMBAR y hold quedan como columnas/tablas futuras documentadas.

---

## F. Carga inicial desde Odoo

**Entrada:** `Ubicaciones fisicas de almacén (1).xlsx` = **solo el árbol de ubicaciones** (314 filas
únicas, una columna "Ubicaciones", prefijo `LWDIP/…`). **No trae stock, propietario ni estado.** El
inventario real (producto, lote, vencimiento, cantidad por ubicación) viene en la exportación
posterior al inventario general, que **aún no está en el repo**.

**Mapeo de ubicaciones (propuesto):**
- Código de posición = último tramo de la ruta (`A-10.2`, `B-1`…): ya sigue la nomenclatura de topología.
- Contenedores → área: `Bajas/Rechazados` (J-12.1, J-12.2), `Contramuestra` (J-12.3), `Devoluciones`
  (A-10.1); `Stock` = racks. `Cuarentena` existe vacío. `Stock/Calidad` **no se migra**.
- Almacén: siempre `LWDIP` = almacén DHP/Diphasac en Odoo (reglas).
- **Propietario: nunca se deduce de Odoo**; sale de `asignaciones_posicion` (topología).
- Estado sanitario: Odoo no lo trae. Supuesto: lo de racks `Stock` es Aprobado (inventario general) —
  **decisión sanitaria de Katia (D-09)**; hasta entonces la carga inicial no confirma.

**Validaciones de la herramienta (todas con reporte, nada se corrige en silencio):**
1. Toda ubicación mapea a una posición existente (o se reporta "huérfana").
2. El propietario inferido de la posición coincide con el del stock (si el archivo trae propietario).
3. Área ↔ estado compatible con la matriz (Bajas ↔ `BAJAS_RECHAZADOS`, etc.).
4. Posiciones "por verificar" (A-22..A-27, E-9.1, E-10.1, I-8.x, J-12.4) → se cargan marcadas.
5. `E-8.1`/`I-1.1` (sin subrack en Odoo) → requieren instrucción manual; no se adivina.
6. Cantidad entera ≥ 0; lote y vencimiento válidos; producto existe en `catalogo.productos` o se reporta.
7. Duplicados (mismo producto/lote/posición) se suman o se reportan según regla elegida; la
   carga es **idempotente** (clave `lote_carga` + hash de fila) y deja `audit_events`.
8. La carga genera partidas de tipo `CARGA_INICIAL` en una sola transacción; se puede **revertir
   completa** por reversa vinculada, nunca por borrado.

**Anomalías ya detectadas:** B3, B4, B5, B6. **Ensayo:** antes de usarla en real propongo correrla con
una copia de la exportación en una base de prueba (Preview/branch) y revisar el reporte contigo.

---

## G. Cómo corren los E2E en este entorno

Decisión: **Postgres local**, sin ningún servicio con costo (ni branch de Supabase).

Hechos verificados:
- Playwright 1.63 instalado; el navegador por defecto de 1.63 **no está descargado**, pero hay Chromium
  en `/opt/pw-browsers/chromium` → `PLAYWRIGHT_CHROMIUM_PATH` (ver `apps/wms/CLAUDE.md`). El smoke test pasa a 390×844.
- **Postgres 16.15 local arranca y funciona** (`pg_ctlcluster 16 main start`; extensiones `btree_gist`, `pgcrypto`,
  `pg_trgm`, `uuid-ossp` disponibles; **`pgtap` no**, así que los tests de BD van con Vitest + `pg`).
- **Spike de la simulación (ya probado y descartado, base borrada):** schema `auth` con `auth.users` y
  `auth.uid()` leyendo `request.jwt.claim.sub`; roles `anon`/`authenticated`/`service_role`; una policy RLS por
  `auth.uid()` con `set role authenticated` mostró a cada usuario solo sus filas; la `exclusion constraint`
  (`btree_gist`) rechazó una asignación solapada; y una segunda sesión **no** obtuvo el `pg_advisory_xact_lock`
  tomado por la primera. Es decir: RLS, vigencias sin solape y concurrencia se pueden probar en local.
- Docker: el CLI existe pero el *daemon* no responde (no lo uso). GitHub Releases devolvió 403, así que no puedo
  bajar PostgREST ni el CLI de Supabase. npm sí responde.
- No hay Supabase local ni stubs en el repo: los creo yo (script versionado) en el Batch 1.

**Estrategia (tres capas, sin costo):**
1. **Dominio (Vitest):** reglas puras: muestreo, invariante, estados, zonas, propietario, verificador.
2. **Base de datos (Vitest + `pg` contra Postgres 16 local):** script de stubs versionado
   (`auth.users`, `auth.uid()`, roles, `storage`) + la cadena de migraciones del WMS + tests de triggers, RLS,
   ledger inmutable, concurrencia (dos conexiones), kardex. Aquí viven los tests 9-15, 17-20.
3. **E2E (Playwright, 4 viewports):** `next dev` con un **adaptador de datos de prueba** (los `services/` consumen
   un puerto; en E2E el puerto usa `pg` contra el mismo Postgres local y las mismas migraciones) y login de
   prueba **solo con `WMS_E2E=1`** (excluido del build de producción por una prueba de CI).

### G.1 Qué NO cubre la simulación (documentado, no escondido)
| No cubierto | Por qué importa | Cómo se mitiga |
|---|---|---|
| **PostgREST / API HTTP**: serialización, `Prefer`, filtros, embebido, errores 406/403 de schema no expuesto | Un fallo de exposición o de grants solo aparece contra Supabase real | Grants explícitos en migración y prueba SQL de `has_schema_privilege`/`has_table_privilege` para `authenticated`; lista de verificación manual para Sebas (D-22) |
| **GoTrue / sesión real**: JWT firmado, expiración, cookies, magic link, `@supabase/ssr` | El login real no se ejercita | Contrato de la sesión aislado en un módulo; login de prueba solo con `WMS_E2E=1`; verificación manual del login en el primer despliegue real |
| **Claims reales del JWT** (`role`, `aud`, `app_metadata`) | Mi `auth.uid()` solo lee `sub` | Las policies solo usan `auth.uid()`; se prohíbe usar otros claims |
| **Storage** (buckets, policies de `storage.objects`, URLs firmadas) | Firmas del transportista y PDF | Stub mínimo de `storage`; el acceso a archivos se prueba aparte en la primera prueba real |
| **Realtime, Edge Functions, cron, extensiones propias de Supabase** | No se usan en el alcance | N/A |
| **Diferencias de versión de Postgres** (local 16.15 vs Supabase 17.6) | Cambios de comportamiento menores | Solo SQL estándar; sin features de 17 |
| **Datos y RLS reales de Compras** (`almacen.*`, `compras.*`, `catalogo.*`, `perfiles`, flag `acceso_abierto_temporal`) | La vista `wms.v_recepciones_compra` lee tablas de otro módulo | En local se crean réplicas mínimas con la **misma estructura** (copiada de los esquemas de producción leídos); el comportamiento real de RLS de Compras queda sin verificar hasta una prueba real |
| **Rendimiento con volumen real** | Mapa y reportes | Seed con volumen realista (≈330 posiciones, miles de partidas) y medición local; no equivale a producción |

**MCP de Playwright — pasos exactos para activarlo (pendiente técnico):**
1. Reiniciar la sesión de Claude Code en la raíz del repo (los servidores de `.mcp.json` solo cargan al arrancar).
2. Aprobar el servidor `playwright` cuando Claude Code lo ofrezca (o `/mcp` → habilitar `playwright`).
3. Verificar que existan herramientas `mcp__playwright__*` (`browser_navigate`, `browser_resize`, `browser_take_screenshot`).
4. En este contenedor, agregar a `args` de `.mcp.json`: `"--executable-path", "/opt/pw-browsers/chromium"`
   (no hay Chromium de la versión que el MCP descargaría; no probado todavía).
5. Confirmar salida a npm (`npx -y @playwright/mcp@latest`); `registry.npmjs.org` responde.
6. Hasta que funcione: se verifican pantallas con **Playwright directo** (scripts en `apps/wms/e2e/` y screenshots en `docs/wms/screenshots/`).

---

## H. Plan de commits y decisiones pendientes

### Batch 1 — Fundación, almacén y maestros
1. `wms: contexto de diseño Impeccable (PRODUCT.md, DESIGN.md) y ADR-001..004`
2. `wms: app Next.js 14.2.29 (basePath /wms), auth, layout, scripts raíz y job de CI`
3. `wms: migración 0001 — schema, roles, config de topología, audit_events (RLS desde el inicio)`
4. `wms: migración 0002 — ledger inmutable, saldos derivados, funciones y triggers de dominio`
5. `wms: dominio puro + tests Vitest (estados, zonas, propietario, asignación con vigencia)`
6. `wms: tests de base de datos (Postgres local con stubs)`
7. `wms: seed de topología y propietarios desde topologia.md (con "por verificar")`
8. `wms: maestro de productos y regulatorio (alta Sandra, validación Katia)`
9. `wms: Visual Warehouse (SVG, zoom/pan/fit, búsqueda, rack frontal, drawer, capa propietario)`
10. `wms: búsqueda universal (Ctrl/Cmd+K) e inicio por rol`
11. `wms: E2E en 4 viewports + screenshots + auditoría Impeccable`
Cierre: progreso.md, PR hacia main con URL de Preview, **STOP**.

Batch 2 (entradas y calidad) y Batch 3 (inventario en operación, kardex, reportes, KPIs, carga inicial) según el prompt.

### Decisiones pendientes
Ver `docs/wms/decisiones-pendientes.md`. **Bloquean solo su pieza**; el resto sigue.

### Qué necesito de ti para arrancar el Batch 1
1. Confirmar este Gate actualizado.
2. Decidir D-21 (Vercel: crear aceptando el costo de builds, crear con Ignored Build Step, o esperar al cierre).
3. Decidir D-27 (Preview sin base de pruebas: modo demostración propuesto).
4. (Opcional) Confirmar el área de Sandra en `perfiles` (D-24); si me autorizas, lo leo solo-lectura (solo `area` y `rol`).
Nada de lo abierto impide empezar el Batch 1 (ver `decisiones-pendientes.md`).

---

## Deuda técnica registrada (sin acción)

`npm audit` sobre el monorepo: **19 vulnerabilidades** (1 crítica, 14 altas, 4 moderadas). Ninguna
afecta a `apps/wms` ni a `packages/auth`.

| Severidad | Paquete | Apps afectadas | Nota |
|---|---|---|---|
| Crítica | `next` 14.x | cobranzas, compras, pedidos | Dos RCE (servidores Windows; optimizador de imágenes con AVIF) corregidos solo desde 15.5.24. **No hay parche dentro de 14.x**: la 14.2.35 es la última y cierra solo los DoS y algunos moderados. Cobranzas y compras (14.2.29) podrían subir a 14.2.35 como pedidos. Aplicabilidad real por verificar: Vercel corre Linux; compras usa `unoptimized`. |
| Alta | `postcss` | cobranzas, compras, pedidos | Arreglo llega con next 16.4.0 |
| Alta | `tailwindcss` (+ braces, chokidar, micromatch, fast-glob, postcss-nested, postcss-selector-parser) | cobranzas, compras, pedidos | Arreglo = Tailwind 4 (cambio mayor) |
| Alta | `xlsx` | cobranzas, compras | Sin arreglo disponible en npm |
| Alta | `eslint-config-next` (+ glob, @next/eslint-plugin-next) | pedidos | Arreglo = 16.4.0 |
| Alta | `undici` | compras (solo pruebas, vía jsdom) | |
| Alta | `js-yaml`, `brace-expansion`, `source-map-js` | pedidos (eslint) / transitivas | |
| Moderada | `exceljs` (vía `uuid`) | pedidos | El "arreglo" propuesto es bajar a 3.4.0; el aviso es de uuid v3/v5/v6 con buffer. WMS usa exceljs 4.4.0 por consistencia. |

Fuera de las dependencias: **RLS desactivado** en 3 tablas de respaldo de promociones de
`Logisalud_pedidos` (B, última nota).

---

## Qué no pude verificar
- Docker: el daemon no responde; no probé imágenes.
- Descargas desde GitHub (403): sin PostgREST ni CLI de Supabase.
- MCP de Playwright con `--executable-path`: no probado.
- Estado real de Vercel (proyectos, variables) y del flag `acceso_abierto_temporal` en producción: no consultados en vivo.
- Si `public.clientes` contiene a Triamed, Medic Pharma Lab o AJR Labs: no leí datos de producción (solo esquemas).
- Área de Sandra, Katia y el resto del equipo en `public.perfiles`: no leí filas.

---

## Ajustes durante el Batch 1 (lo que cambió respecto de este Gate)

| Tema | Gate 0 | Lo construido | Por qué |
|---|---|---|---|
| E2E | Adaptador `pg` contra Postgres local | E2E sobre el repositorio **demo** en memoria; la RLS, el ledger y la concurrencia se prueban en SQL (`tests/db`, 60 pruebas) | Más simple y sin servicios; lo que no cubre está en §G.1. ADR-005 |
| `condicion` (VERDE/ÁMBAR) | Columna nullable ya creada | **No se creó**: se agrega con una migración aditiva cuando se construya | Evitar una columna sin uso en el ledger |
| Estado vs zona | Matriz validada en toda partida | La matriz se valida al **entrar** unidades; el cambio de estado ocurre en el lugar (Aprobado "por trasladar") | Las reglas lo exigen: ADR-006, D-28 |
| `procedencia_id` | En `partidas` y `saldos`, sin FK | Igual; la FK llega con los ingresos (Batch 2) | ADR-001 |
| Alta de producto | Insert desde la app | Funciones `wms.crear_producto` / `validar_producto` / `actualizar_regulatorio` (atómicas, con chequeo de rol) | Escribir en `catalogo.productos` requiere security definer |
| Bug hallado | — | `INSERT … ON CONFLICT` validaba el CHECK de saldos antes del conflicto y rechazaba toda salida; corregido en 0002 | Lo detectaron las pruebas de movimientos |
| Supabase | Adaptador de lectura/escritura | Escrito (`services/supabase`) pero **sin ejecutar contra una base real** | No hay base de pruebas; D-20/D-22 |



## Ajustes por el addendum de flujo de ingreso (2026-10-08)
`analisis-addendum-inbound.md` (A–H) y las decisiones D-31 a D-35 gobiernan sobre las secciones A.2 (Recepción de Compras como referencia), C.6, C.7, D (entradas) y sobre
cualquier mención de que "todo ingreso nace en Cuarentena". Implementación: migración `0005` (no aplicada) y ADR-009.
