# Análisis del addendum "Flujo real de ingreso" (2026-10-08)

**Estado: solo análisis. Nada implementado.** El addendum gobierna sobre lo ya construido. Este documento responde A–G de la sección 37 del addendum
y propone el mecanismo del bloque "Cantidad física confirmada" para el copiado manual a Compras. Revisado: `apps/compras` (`domain/recepcion-tres-columnas.ts`,
`services/recepciones.ts`, `services/notas-credito.ts`, `services/ordenes-compra.ts`, `domain/orden-compra.ts`), los formatos LS-FR.05.05 y LS-FR.03.05,
todo `docs/wms/*` (incluidos REC-01 y REC-02), y el código y las migraciones de `apps/wms`.

## 0. Hallazgo principal (cambia lo que reporté como "construido")

Lo construido en el Batch 2 **invierte la flecha** del addendum:

| | Addendum | Batch 2 construido |
|---|---|---|
| Punto de partida de una compra local | Solicitud de Ingreso, prellenada desde la **OC** | Una recepción **ya registrada en Compras** (`almacen.recepciones`) |
| Quién captura la cantidad física | **WMS**, una sola vez | Compras (Charlie la escribe allí) y el WMS la toma como referencia |
| Lote y vencimiento | Declarados en la Solicitud; Almacén **verifica** | Almacén los **escribe desde cero** al recibir (`guardar_lotes`) |
| La Solicitud | Fuente: lo que se autoriza ingresar; editable con historial | Un *espejo* (JSON) que se arma a partir del ingreso; no gobierna nada |
| Cantidades | Seis magnitudes distintas | Una (`cantidad_referencia`) + suma de lotes |
| Devolución | Acta → Área Devoluciones, **sin pasar por Cuarentena** | Nace en Cuarentena (el estado) y la UI solo ofrece A-6..A-9 |

Se conserva sin cambios lo que no depende de la dirección del flujo: el ledger y los saldos, el estado por unidad (`procedencia_id`), las actas (recepción y organoléptica),
firmas con hash, inmutabilidad y anulación/reemisión, alertas, cola de Dirección Técnica, expediente, PDF, roles y auditoría. Lo que cambia es **cómo nace un ingreso** y **de dónde sale cada dato**.

---

## A. Modelo conceptual actualizado

Cinco objetos, cada uno con una pregunta distinta:

1. **Solicitud de Ingreso** (LS-FR.05.05) — *¿qué está autorizado a llegar?* Mercadería **esperada**, a nivel producto + lote + vencimiento + cantidad. **No crea stock.**
   Se edita hasta el cierre, siempre con historial. Su versión final es lo que se autoriza a ingresar. Mismo correlativo toda su vida (`SI-AAAA-NNNNN`, formato propuesto).
2. **Recepción física** — *¿qué contamos al llegar?* El acto de verificar la Solicitud contra lo físico, línea por línea: coincide / hay diferencia. Aquí viven bultos, paletas, temperatura, vehículo, horarios, tipo de conteo.
3. **Acta de Recepción** (LS-FR.03.05) — *¿qué ingresó físicamente?* Documento prellenado desde la Solicitud final y la recepción. Inmutable al firmarse; se anula y se reemite (el número anulado no se reutiliza).
4. **Inventario** — nace al confirmar el acta firmada, vía el ledger. Estado sanitario por unidad.
5. **Evaluación Organoléptica** — *¿cuál es su disposición sanitaria?* Por producto + lote. Es el gate sanitario.

**Invariante de un ingreso cerrado** (addendum §15): solicitud final = cantidad aceptada = acta (recibida) = suma de lotes = inventario creado. Se verifica en una sola función al confirmar.

**Las seis cantidades** (addendum §16), cada una en su lugar, ninguna colapsada:

| Cantidad | Dónde vive | Quién la escribe |
|---|---|---|
| `cantidad_oc` (pedida y saldo) | Compras (`ordenes_compra_items`); el WMS guarda copia de lectura en la línea de solicitud | Compras |
| `cantidad_solicitud_inicial` | Línea de solicitud, **inmutable** desde que se autoriza | Quien prepara la solicitud (Sandra/Katia; luego el cliente) |
| `cantidad_solicitud_final` | Línea de solicitud (valor vigente) + historial | Se corrige durante la recepción, con motivo |
| `cantidad_factura` | Compras (la declara Almacén en Compras, hoy) | Compras; el WMS solo la **lee** para mostrarla |
| `cantidad_fisica_confirmada` | Línea de recepción física | **WMS**, una sola vez |
| `cantidad_inventario` | Ledger (derivada, `wms.saldos`) | Nadie: se deriva |

**Calidad / devolución** (addendum §25–26): cuatro dimensiones separadas — `origen`, `ubicación`, `flujo_calidad`, `estado_sanitario`. Ver G y decisión D-31.

## B. Secuencia end-to-end

```
Compra local:  OC ─┐
                   ├─► SOLICITUD (programada) ─► LLEGA ─► RECEPCIÓN FÍSICA ─┬─ coincide ─┐
Cliente:  guía ────┘     lote+venc+cant+guía                (verificar)     │            │
                                                                            └─ diferencia ─► "Esperábamos 50, hay 45"
                                                                                  │          [Actualizar a 45] → nueva versión + motivo
                                                                                  └──────────┘
        ┌── SOLICITUD FINAL ─► ACTA prellenada ─► conteo definitivo ──┬─ coincide ─► firmas ─► CONFIRMAR ─► inventario
        │                                                              └─ difiere ─► vuelve a ajustar la solicitud (con historial)
        ▼
   normal ─► CUARENTENA (A-6..A-9) ─┐
   devolución ─► ÁREA DEVOLUCIONES ─┴─► EVALUACIÓN ORGANOLÉPTICA ─► decisión DT ─► APROBADO / BAJAS-RECHAZADOS
```

Notas de secuencia:
- El bucle de corrección no tiene límite fijo (aclaración 1). La **Solicitud** se corrige sobre el mismo correlativo; el **Acta** emitida se anula y se reemite con número nuevo.
- Estados de la Solicitud (propuesta): `BORRADOR` → `PROGRAMADA` (autorizada; "Esperado / Por llegar") → `EN_RECEPCION` → `CERRADA` (acta firmada y confirmada) | `ANULADA`.
  Con el portal de clientes se antepone `ENVIADA` (la crea el cliente; Sandra/Katia la autoriza). Ver D-32.
- Una OC puede tener **varias solicitudes** (entregas parciales) y una línea de OC puede dividirse en **varias líneas de solicitud** (un lote cada una).
- Rama económica (solo compra local): al confirmar, el WMS muestra la cantidad física confirmada para registrarla **a mano** en Compras (aclaración 2; mecanismo en H). Compras ejecuta su lógica de siempre.

## C. Fuentes de verdad (qué dato se escribe dónde)

| Dato | Se escribe en | Lo lee |
|---|---|---|
| OC, proveedor, precio, condiciones, saldo | Compras | WMS (solo lectura; prellena la solicitud) |
| Factura (número, archivo, cantidad facturada) | Compras (hoy lo registra Charlie allí) | WMS (enlaza en el expediente; muestra la cantidad) |
| Guía | Hoy se declara en la Solicitud (número) y en Compras (archivo) | WMS enlaza; no vuelve a pedir el archivo si ya está en Compras |
| Producto, lote, vencimiento, cantidad **esperada** | **Solicitud** (WMS) | Acta, evaluación |
| Cambios a lo anterior | Versiones de la Solicitud + registro de cambios (quién, cuándo, antes→después, motivo) | Auditoría, Kardex |
| Cantidad **física** confirmada, bultos, paletas, temperatura, vehículo, horarios, conteo | **Recepción física / Acta** (WMS) | Compras (copia manual hoy; automático después) |
| Ubicación, inventario, movimientos | Ledger (WMS) | Todos |
| Estado sanitario | Evaluación → decisión DT (WMS) | Todos |
| Consecuencia económica (entrega parcial, NC, excedente sin facturar, obligación, cierre de OC) | **Solo Compras** (`recepcion-tres-columnas`, `notas-credito`, `cerrarOCConSaldoPendiente`) | — |

El WMS **no copia ni reimplementa** la lógica OC vs Factura vs Físico. No se toca `apps/compras`.

## D. Contradicciones encontradas

**En documentos (priorizados según `apps/wms/CLAUDE.md`):**

1. `reglas-negocio.md` — encabezado **"Tipos de ingreso (todos nacen en Cuarentena)"**: la generalización incorrecta a corregir (aclaración 3).
2. `reglas-negocio.md` — tabla de tipos: "Compra local · cantidad de referencia = Recepción registrada en Compras". Con el addendum la referencia es la **Solicitud final**.
3. `reglas-negocio.md` — "Una OC puede tener varias recepciones; **cada recepción de Compras es un ingreso distinto**": ahora cada **solicitud** es un ingreso; la relación con la recepción de Compras es de reconciliación, no de origen.
4. `reglas-negocio.md` — "Fuentes de verdad": atribuye a Compras la "cantidad física agregada (compra local)". El addendum: la cantidad física es del **WMS**.
5. `reglas-negocio.md` — "Invariante: SUM(lotes) = cantidad de referencia" y "Recepción §1/§5/§7": la solicitud se "prellena" pero hoy es solo el formato; §7 "datos del acta que no vienen de Compras" ya no es el corte correcto (vienen de la Solicitud o son físicos).
6. `reglas-negocio.md` — tabla de **Zonas BPA**: "Devoluciones (por propietario): Cuarentena con origen devolución". Contradice §25–26 (la devolución no pasa por Cuarentena).
7. `vision.md` §13: "inventario nace en CUARENTENA" sin distinguir devolución, y el mensaje de ejemplo "Compras registró 6 unidades y aquí hemos identificado 7" (el UX nuevo: "Esperábamos 6 y encontramos 7").
8. `gate-0.md` C.6 (tabla de referencia por tipo), C.7 (el ejemplo del lote ABC y "nacen en Cuarentena" para todo origen), A.2 (Recepción de Compras como "cantidad de referencia"), línea 162.
9. **Procesos TO-BE `REC-01` (paso 5: "Registrar en Compras la cantidad física") y `REC-02` (pasos 1 y 3, "la cantidad física de Compras es la referencia"; futuro "Compras envía la recepción al WMS")**: describen la flecha contraria. Son archivos fuente (`procesos/*.xlsx`); **no los toqué**: los actualiza quien los mantiene, o me lo pides.
10. `decisiones-pendientes.md`: D-03 (cada recepción de Compras = un ingreso), D-04 (la referencia es lo aceptado en Compras), D-19 (alerta de divergencia WMS vs Compras) — ver F: D-19 cambia de sentido.
11. `progreso.md` (Batch 2) y `adr/008`: describen el flujo antiguo.

**En código (`apps/wms`):**

12. `0002` `validar_movimiento`: "Todo ingreso nace en Cuarentena y solo suma unidades" (aplica a todo `INGRESO`).
13. `0001` matriz `area_estado_admitido`: `DEVOLUCIONES` admite `CUARENTENA` con origen `DEVOLUCION`.
14. `0004` `crear_ingreso` (nace de una recepción de Compras), `guardar_lotes` (lote y vencimiento tecleados; solo A-6..A-9 / DEVOLUCIONES), `confirmar_ingreso` (siempre estado CUARENTENA), `v_recepciones_compra` como origen, `snapshot_compras` + `revisar_divergencias`.
15. UI: pantalla *Nuevo ingreso* (elige recepción de Compras), `EditorLotes` (escribe lote/vencimiento), el mensaje "Los lotes suman 7 y la referencia es 6" (la lógica debe ser "esperábamos / encontramos"), la semilla de demostración y las pruebas "devolución nace en Cuarentena" (DB y servicios).

**No contradice (conviene dejar escrito):** REC-01 acota "ingreso **por compra**" a Cuarentena; no hay conflicto con él. La contradicción es la generalización a "todo ingreso" en documentación propia del WMS.

## E. Cambios de arquitectura necesarios

1. **La Solicitud pasa a ser la entidad primaria** (hoy es un JSON derivado). El ingreso se *deriva* de ella, no al revés.
2. **Prellenado desde la OC**: nueva vista de solo lectura `wms.v_oc_pendientes` (OC en `confirmada`/`parcialmente_recibida` con saldo por línea). Reemplaza a `v_recepciones_compra` como **origen** (esta queda solo para reconciliar).
3. **Verificación en vez de digitación**: `guardar_lotes` desaparece como pantalla de captura; se reemplaza por *verificar línea* (coincide / diferencia → ajustar solicitud con motivo).
4. **Una función de ajuste** (`ajustar_solicitud`) que es la única vía para cambiar cantidad/lote/vencimiento/producto/guía de una línea: crea versión, registra cada cambio campo a campo y exige motivo. El acta nunca se edita (se anula).
5. **Acta prellenada desde la Solicitud final**; cantidad establecida = solicitud final, recibida = conteo; si difieren, se vuelve al ajuste (no se cierra).
6. **Destino por origen**: la devolución va al Área de Devoluciones. Requiere el cambio de modelo de G.
7. **Reconciliación con Compras** (reemplaza a la alerta de divergencia): al confirmar, el WMS espera ver en Compras `cantidad_recibida(OC item) = base_antes + confirmado`; mientras no coincida, queda "Por registrar en Compras" o "No coincide".
8. **Preparación del portal de clientes**: columna `origen_creacion` (`INTERNO`/`CLIENTE`), estado `ENVIADA`, rol `cliente_portal` con RLS por `propietario_id`, y un conjunto cerrado de acciones permitidas (crear/editar su solicitud mientras no esté autorizada; ver estado). Prohibido: estado sanitario, movimientos, cerrar acta. No se construye el portal ahora.
9. **No cambia**: ledger, saldos, `procedencia_id` (pasa a apuntar a la línea de recepción), actas/firmas/hash, alertas, organoléptica, expediente, PDF, auditoría.

## F. Tablas / eventos propuestos (nombres en español; equivalencia con los del addendum entre paréntesis)

- `wms.solicitudes_ingreso` (*inbound_request*): `id`, `numero` (SI-AAAA-NNNNN), `tipo` (COMPRA_LOCAL/DEVOLUCION/INGRESO_CLIENTE), `propietario_id`, `estado`, `oc_id` (→ Compras, nullable), `contraparte_*`, `guia_numero`, `doc_original_*` (devolución), `fecha_prevista`, `motivo`, `origen_creacion`, `creado_por`, `autorizado_por/en`, `version_actual`, `cerrada_en`.
- `wms.solicitud_ingreso_lineas` (*inbound_request_lines*): `id`, `solicitud_id`, `oc_item_id` (nullable; **varias líneas por oc_item**), `producto_id`, `registro_sanitario` (copia), `lote`, `vence`, `vence_texto_original`, `cantidad` (vigente = final), `cantidad_inicial` (inmutable), `cantidad_oc_pedida`, `cantidad_oc_saldo` (copias de lectura), `compras_recibida_antes` (base para reconciliar), `estado_linea`.
- `wms.solicitud_ingreso_versiones` (*version/history*): foto completa inmutable por versión (ya existe; se mantiene) + `motivo`, `editado_por`.
- `wms.solicitud_ingreso_cambios` (*history, campo a campo*): `solicitud_id`, `linea_id`, `campo`, `antes`, `despues`, `motivo`, `usuario`, `ts`. Inmutable. Permite "50 → 45, Charlie, 08/10/2026 10:42, motivo".
- `wms.recepciones_fisicas` (*receipt*): `id`, `solicitud_id`, datos propios de la recepción (bultos, paletas, temperatura, vehículo, horarios, tipo de conteo, verificaciones), `estado`, `movimiento_id`, `confirmado_en`. (Hoy esas columnas están en `ingresos`; se mueven o `ingresos` se convierte en esta tabla.)
- `wms.recepcion_lineas` (*receipt_lines*): `recepcion_id`, `solicitud_linea_id`, `verificacion` (PENDIENTE/COINCIDE/DIFERENCIA), `cantidad_establecida`, `cantidad_recibida`, `posicion_id` (destino), `observaciones`. Su `id` es la `procedencia_id` del ledger.
- `wms.actas_recepcion`, `acta_firmas`, `actas_organolepticas`, `alertas`, `expedientes`*: se mantienen; el acta pasa a leer solicitud final + recepción.
- **Eventos / alertas nuevas:** `SOLICITUD_AJUSTADA` (informativo para Sandra/Katia cuando la final difiere de la inicial), `EXCEDE_OC` (llegó o se autorizó más que el saldo de la OC; **no se resuelve solo**, D-33), `POR_REGISTRAR_EN_COMPRAS` y `NO_COINCIDE_CON_COMPRAS` (reemplazan a `DIVERGENCIA_COMPRAS`).
- Vistas de lectura: `v_oc_pendientes`, `v_esperado` (mercadería programada / por llegar; **fuera** de `saldos`), `v_cantidades_ingreso` (las seis cantidades lado a lado).
- Parámetros: ninguno nuevo obligatorio.

## G. Reglas actuales a eliminar o modificar

**Eliminar:** "todos los tipos de ingreso nacen en Cuarentena"; "la referencia es la recepción de Compras"; "cada recepción de Compras es un ingreso"; "Compras es fuente de la cantidad física"; escribir lote/vencimiento desde cero en la recepción.

**Modificar:**
- Invariante: SUM(lotes) = **solicitud final** (no la de Compras). Mensajes: "Esperábamos X y encontramos Y".
- Ingreso normal: Acta → Cuarentena → Evaluación (sin cambio). **Devolución: Acta → Área Devoluciones → Evaluación.** Constraint en base: un ingreso con origen `DEVOLUCION` solo puede nacer en área `DEVOLUCIONES`; uno de compra/cliente, solo en `CUARENTENA`.
- Zonas BPA: la fila "Devoluciones" deja de decir "Cuarentena con origen devolución".
- D-19: de "alerta de divergencia por cambio en Compras" a "reconciliación del copiado manual" (`POR_REGISTRAR_EN_COMPRAS` / `NO_COINCIDE_CON_COMPRAS`).
- D-03/D-04: se reemplazan por la regla de solicitudes (una OC, varias solicitudes).

**Decisión de modelo que necesito de ti (D-31): ¿qué estado sanitario tiene una devolución mientras espera evaluación?** El addendum pide no pasarla por Cuarentena y no inventar `sanitary_state = DEVOLUCION`.
- **Opción A (recomendada):** agregar el estado `SIN_DECISION` ("En evaluación") usado solo por devoluciones; transiciones `SIN_DECISION → APROBADO` y `→ BAJAS_RECHAZADOS`; el origen sigue en `origen = DEVOLUCION`, la ubicación en `DEVOLUCIONES`, y "no vendible" se deriva de que el estado no es `APROBADO`. Es lo más literal y mantiene "Aprobado nunca vuelve a Cuarentena".
- Opción B: conservar `CUARENTENA` como estado y solo cambiar la ubicación. Cambia menos código pero deja que la pantalla diga "Cuarentena" para una devolución, que es justo lo que el addendum prohíbe.

## H. Mecanismo del bloque "Cantidad física confirmada" (integración manual WMS → Compras)

**Principio:** el WMS no escribe en Compras (hoy es manual, sin sincronización). Solo **hace imposible equivocarse al copiar**.

1. **Dónde aparece:** en el detalle del ingreso de compra local, **arriba de todo**, desde que el acta está firmada y hasta que Compras la refleje (después queda como registro). Tarjeta con borde teal de 2 px (mismo lenguaje que el panel de decisión de Dirección Técnica), nunca colapsada.
2. **Qué muestra, por línea de OC** (no por lote: Compras trabaja por producto): producto · **cantidad física confirmada en tipografía grande** (`font-heading`, 3xl, tabular) · "de X esperadas en la solicitud".
   Si una línea de OC se dividió en varios lotes, se muestra la **suma** ("45 = 30 + 15") para copiar el total.
3. **Instrucción fija, en lenguaje de Almacén:** "Cantidad física confirmada: 45 — usa este valor al registrarlo en Compras." Más: "Ya está confirmada aquí: no la cuentes de nuevo."
4. **Acciones:** botón **Copiar** por línea (portapapeles; confirma con "Copiado" anunciado por lector de pantalla) y **Copiar todo** cuando hay varias líneas; y un enlace directo a la pantalla de recepción de esa OC en Compras (`/compras/almacen/recepciones/nueva/{ocId}`), que abre con la OC ya elegida.
5. **Estados de la tarjeta (texto + ícono, nunca solo color):**
   - Ámbar — *Falta registrarla en Compras.*
   - Verde — *Registrada en Compras: 45 ✓ coincide.*
   - Rojo — *Compras tiene 44 y aquí se confirmó 45.* Se corrige en Compras (o se ajusta aquí con acta anulada y reemitida, según dónde esté el error).
6. **Cómo sabe el WMS que ya se registró:** lee de Compras (solo lectura) la `cantidad_recibida` acumulada de cada línea de OC y espera `compras_recibida_antes + Σ confirmado en WMS`. Funciona con entregas parciales y no depende de adivinar qué recepción de Compras corresponde a cuál solicitud.
7. **Recordatorios:** aviso en Inicio para el Jefe de Almacén y sus reemplazos ("Cantidades por registrar en Compras: N"), insignia en *Entradas*, y la alerta `POR_REGISTRAR_EN_COMPRAS` si pasa el plazo (parámetro; valor por definir). La cifra también va en el PDF del acta, bajo "Cantidad física confirmada".
8. **Lo que explícitamente NO hace:** no escribe en Compras, no sincroniza, no resuelve diferencias económicas ni excedentes.

## Decisiones nuevas para ti (no las asumo)

- **D-31** — Estado sanitario de la devolución mientras espera evaluación (A o B arriba).
- **D-32** — ¿Quién **autoriza** una solicitud antes de que llegue la mercadería (Sandra y Katia hoy; con el portal, la crea el cliente y la autoriza Sandra/Katia)? ¿Se exige autorización para pasar a `PROGRAMADA`?
- **D-33** — Llegan más unidades que el saldo de la OC (ej. OC 50, llegan 55): el WMS acepta y registra lo físico y emite `EXCEDE_OC`, **sin resolverlo**. ¿A quién se escala? (propuesta: Katia y Compras).
- **D-34** — Formato del correlativo de la solicitud (propuesta `SI-AAAA-NNNNN`, como tu ejemplo) y qué cambios exigen aviso a Sandra/Katia (propuesta: toda diferencia entre inicial y final).
- Cambio de lote declarado por otro (ABC123 → XYZ999): hoy el lote con otro vencimiento se rechaza; bajo el addendum debe ser un ajuste explícito con motivo. Confirmo contigo la regla antes de tocarlo.

## Qué haría después de tu visto bueno (en este orden, todo en la misma rama, sin merge ni producción)

1. Corregir los documentos de D.1–D.8, D.10–D.11 (los `procesos/*.xlsx` los decides tú).
2. Migración `0005` (no aplicada): tablas de F, función `ajustar_solicitud`, constraint de destino por origen, vistas, decisión D-31.
3. Dominio + motor de demostración + adaptador Supabase + pantallas (verificar en vez de digitar, bloque de cantidad física).
4. Pruebas: ejemplos 20–23 del addendum como casos, invariante §15, historial campo a campo, devolución sin Cuarentena, reconciliación con Compras.
