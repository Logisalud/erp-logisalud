# WMS — Salidas (RUT): diagnóstico y plan

> **Estado:** primera entrega, **solo documento, sin código** (2026-10-14). Nada de esto está construido ni aprobado.
> **Revisión 4 (2026-10-14):** agrega la **salida tipo B** (por cuenta de un cliente de almacenamiento) como parte del plan, con su seguridad de aislamiento entre propietarios (P0), los códigos de producto múltiples y la entrega al transportista del cliente (§2.5, §3 «Salida tipo B», §4.9, §6). Registra además la nomenclatura Rack-Columna.Nivel, el COA por lote, los productos vencidos, las salidas sin venta, la vida útil mínima de 60 días y las firmas del LS-FR.43.03 (§2.5).
> **Revisión 3 (2026-10-14):** incorpora las **decisiones de Sebas** (§2.4: D-51, secuencia del Master con orden/hoja de picking, FEFO único con su excepción, paquete documental, roles, orden de PRs, paralelo con Odoo) y contrasta el diagnóstico con el **formato LS-FR.43.03** ya subido (§0 y §5.4).
> **Revisión 2 (2026-10-14):** contrastado con el **Master TO-BE v2** (subido después de la primera versión). Lo que cambió está en §0 y marcado «Master».
> **Principio rector:** el proceso gobierna al software. Si algo de aquí contradice una regla ya cerrada, **no la cambio**: la reporto (sección 2.3).
> **Arquitectura y costos (aclaración de Sebas, 2026-10-14):** se mantiene la arquitectura del WMS tal como está (Next.js en Vercel, schema `wms` en el Supabase consolidado `erp-cobranzas`, ledger append-only, `Repositorio` + demo, migraciones a mano). Cuentas disponibles: **Supabase Pro, Vercel Pro y Resend Pro**. «Sin costos adicionales» deja de ser una restricción dura: un costo menor que mejore el WMS es aceptable, **pero cada uno se anota y se avisa antes de contratarlo** (nunca se contrata en silencio).
> **Etiquetas** (se usan en todo el documento):
> **[A]** requisito confirmado del proceso (RUT o decisión tuya) · **[B]** recomendación mía · **[C]** hipótesis por validar.

## 0. Fuentes revisadas

1. **Master `LOGISALUD_RUT_TOBE_Master_v2.xlsx`: recibido y leído completo** (9 hojas de gestión + las 11 hojas RUT). Verifiqué celda por celda que **las 11 hojas RUT del Master son idénticas a la hoja `03_TO-BE` de cada RUT** (solo cambia el título): no hay contradicción Master↔RUT en los pasos del proceso. Las contradicciones nuevas están en el Master mismo y contra reglas ya cerradas (§2.3, conflictos 15 a 18).
2. Los 11 RUT, leídos completos (AS-IS, Diagnóstico, TO-BE, Implementación). Están en `docs/wms/salidas/`, no en `procesos/salidas/`. No existe RUT-06; RUT-13 quedó integrado en RUT-11; RUT-14 no se toca.
3. **Formato LS-FR.43.03: recibido y contrastado** (`docs/wms/formatos/LS-FR.43.03 Planificación de ruta.docx`). Coincide campo por campo con el mapa del Master (hoja `02_LS-FR43.03`): encabezado USUARIO, PLACA VEHÍCULO, FECHA, CONDUCTOR, AUX. TRANSPORTE, HORA SALIDA / LLEGADA, N.° PÁG.; tabla de **10 filas** con N.°, CLIENTE, N.° GUÍA, N.° CAJAS, DETALLE (ENTREGA / RECOJO), TEMPERATURA «15 °C – 25 °C», HORA DE ENTREGA, OBSERVACIONES; pie con firmas **CONDUCTOR** y **DIRECTOR TÉCNICO**. Encabezado del formato: «PLANIFICACIÓN DE RUTA · Cód. POE LS-POE.07.05 · Cód. Formato LS-FR.43.03 · vigencia 01-09-2026 a 01-09-2028»; pie: «Este documento no puede ser reproducido ni fotocopiado sin autorización de **LOGISSA S.A.C.**»; lleva logo. **No hay contradicción Master↔formato.** Detalles que ni el Master ni los RUT decían: el formato tiene **una sola pareja de firmas** (no se ve si se firma cada página o solo la última) y la razón social del pie es LOGISSA S.A.C.; ambos se suman a las preguntas de DT (§7).
4. **Decisiones pendientes de DT (hoja `08_Decisiones_DT`):** son exactamente seis —USUARIO, N.° CAJAS vs bultos, temperatura, documento físico en ruta, firmas, retención/archivo— y coinciden con la lista de D-53; no hay una séptima.
5. **Jerarquía aplicada:** decisiones tuyas y reglas cerradas > Master > RUT > tus aclaraciones de esta conversación > AS-IS > código. Donde el Master o un RUT choca con una regla cerrada, gana la regla y lo reporto.

## 1. Cómo entiendo el proceso de punta a punta

### 1.1 El flujo (contrastado con los 11 RUT)

```
Pedido listo (Pedidos: READY_FOR_OPERATIONS)
  │  importación idempotente → bandeja del WMS            [elegible; corte 4:00 p. m., excepciones autorizadas]
  ▼
RUT-01 Ruta planificada (ID + versión; vehículo compatible, conductor, auxiliar)  ──► crea el registro base LS-FR.43.03
  ▼
RUT-03 Asignación FEFO por línea (lote + ubicación) → ORDEN DE PICKING ordenada por recorrido (teléfono y HOJA imprimible)
  │      confirmación ubicación-producto-lote-cantidad
  │      ├─ discrepancia de ubicación ≠ «no hay stock real» → conteo/ajuste, línea bloqueada
  │      └─ sin stock → el pedido se bloquea ANTES de emitir documentos
  ▼  zona «pendiente de conformidad»
RUT-04 Conformidad independiente (persona ≠ picker, 100 % de las unidades)
  │      └─ no conforme → zona «Observado» → corrección → se revalida
  ▼  «Conforme para despacho»  (habilita dos trabajos en paralelo)
RUT-02 Documentación final (GRE y factura con los lotes REALMENTE despachados,        RUT-05 Embalaje y bultos (ID/QR, «1 de 3»)
         tomados de lo confirmado; N.° de guía registrado; paquete documental)
  └────────────────────────────┬─────────────────────────────────────────────────────┘
                               ▼  «Listo para carga» = conforme + embalado + GRE + paquete documental completo
RUT-08 Coordinación (recursos, citas, ubicaciones, requisitos) ── completa la ruta
  ▼
RUT-07 Carga (checklist del vehículo, escaneo de bultos) → conciliación → «Liberar unidad» → «Salida confirmada»
  ▼  (movimiento definitivo de stock)
RUT-09 En ruta: Llegué → resultado (Entrega / Recojo / No entregado / Rechazado) + POD + temperatura
  │      └─ RUT-10 incidencia (catálogo de causas, playbook) → reprogramación = nuevo intento, no ruta nueva
  ▼
Retorno de unidad → RUT-11 Cierre conciliado (pedidos, bultos, cargos, incidencias) → genera LS-FR.43.03
  ▼
RUT-12 Retornos:  «No entregado» → zona Retorno reservado (sigue reservado al cliente)
                  «Rechazado»    → Área de Devoluciones → ingreso tipo Devolución YA EXISTENTE (D-31)
```

### 1.2 Lo que el TO-BE cambia de verdad (y por qué importa para el software)

| Cambio | RUT | Efecto en el sistema |
|---|---|---|
| Los documentos definitivos (GRE, factura) se emiten **después** de la conformidad, no antes | 02, 03 | Se acaban las anulaciones por falta de stock. El WMS debe poder bloquear un pedido antes de cualquier documento. |
| La conformidad es un control **independiente**; Transporte deja de recontar | 04, 07 | Una sola barrera de contenido. Transporte controla bultos, sellos, documentos y carga. |
| Existe el **bulto** con ID | 05 | Nueva unidad logística: se escanea al cargar y al retornar. |
| **Liberar unidad** + **Salida confirmada** como eventos | 07 | Hoy no hay OK de salida formal; el stock se valida horas después en Odoo (que el WMS reemplaza). |
| Tracking por **eventos** (no por WhatsApp + Excel) | 09 | Los datos del LS-FR.43.03 se capturan **una vez**, durante la ruta. |
| Reprogramar = **nuevo intento** sobre el mismo pedido; nunca se edita una GRE | 08, 10, 12 | Historial de intentos; anulación/reemisión formal. |
| El LS-FR.43.03 **lo genera el WMS** al cierre | 11 | Se elimina el llenado a mano que hoy hacen los transportistas. |

### 1.3 Lo que no cambia (reglas que las salidas heredan) [A]
Nunca stock negativo · el ledger es la fuente del stock y nada se borra (reversas vinculadas) · Aprobado no vuelve a Cuarentena · devolución nunca pasa por Cuarentena (D-31) · solo se despacha stock Aprobado del propietario del pedido · quien prepara no verifica · cada ubicación tiene propietario (áreas compartidas admiten varios) · un dato se escribe una sola vez · **FEFO únicamente** (el lote Aprobado, sin bloqueo y con cantidad suficiente que vence primero), con **una sola excepción controlada** (§2.4).

## 2. Qué se reutiliza, qué se extiende y qué conflictos encontré

### 2.1 Se reutiliza tal cual [B]
| Pieza ya construida | Para qué sirve en salidas |
|---|---|
| **Ledger append-only + saldos derivados + candados por celda + reversas** (0002) | La salida, el retorno y el picking se registran con `postear_movimiento`; el «no negativo» ya lo garantiza el CHECK del saldo y el candado serializa a dos pickers sobre la misma celda. |
| **`wms.tipos_movimiento` como tabla** (no enum) | Se agregan `SALIDA` y `RETORNO` con un `insert`; el diseño original ya lo preveía (gate-0 §D). |
| **`partidas.referencia_tipo/id`** y **`wms.correlativos`** | Referencia al pedido/ruta y numeración (RT-AAAA-NNNNN, B-… para bultos) sin inventar un mecanismo nuevo. |
| **Dos personas: ejecutar → verificar** (0007: `ordenes_movimiento`, reserva de unidades, token idempotente, alerta de 24 h, verificación línea por línea) | **Picking = ejecutar, conformidad = verificar.** Es el mismo patrón con otro destino; la verificación línea por línea y el «una línea con diferencia queda abierta» encajan con RUT-04. |
| **Unidades reservadas / en tránsito visibles** (mapa, buscador, drawer, historia del lote) y **exclusión del conteo** | Las unidades en picking se muestran igual: no desaparecen del inventario hasta que se verifican. |
| **Flujo de devolución completo** (solicitud tipo DEVOLUCION, acta de recepción, acta organoléptica LS-FR.55.02, `decidir_acta_organoleptica` → Aprobado o Bajas/Rechazados, origen separado del estado) | RUT-12 «Rechazado»: se reutiliza, no se duplica (regla cerrada). |
| **Propietarios, posiciones, asignaciones con vigencia**, `posicion_acepta()` | Staging y áreas compartidas (Embalaje K-M2, Despacho K-1..K-7) ya existen en el seed de topología. |
| **Roles en tabla propia** (ADR-003), `tiene_permiso`, `usuario_roles` con vigencia | Se agregan roles de transporte (§4.6). El plan del Batch 4 ya prevé `jefe_transporte` y la columna `cargo` (migración 0010). |
| **Alertas, auditoría, expedientes, puerto `Repositorio` + modo demo, E2E por viewport, Impeccable** | Mismo andamiaje para las colas por rol. |
| **KPI Despacho previstos (D-44: OTIF, nivel de servicio, exactitud de despacho, tiempo de preparación)** y la tarjeta con tendencia | Solo falta alimentarlos. |

### 2.2 Se extiende (no se rediseña) [B]
1. **Tipos de movimiento:** `SALIDA` y `RETORNO`. `wms.validar_movimiento` fue **redefinida entera** en 0005 y en 0006; la nueva migración debe volver a copiar el cuerpo completo (riesgo de regresión: se cubre con las 180+ pruebas de base de datos existentes más pruebas nuevas por tipo).
2. **Áreas:** `EMBALAJE` y `DESPACHO` están `en_alcance = false` y **no tienen fila en `area_estado_admitido`**: hoy el ledger rechaza cualquier partida que entre ahí. Hay que habilitarlas (admitir `APROBADO`) y agregar las zonas nuevas (§2.3, conflicto 7).
3. **Reserva:** hoy «reservado» = unidades de movimientos internos abiertos, calculado en **dos lugares** (SQL en `ejecutar_movimiento` y TypeScript en `domain/inventario.ts`). Para salidas hay que generalizarlo a una sola fuente (`wms.reservas`) y que «disponible para mover» y «disponible para vender» salgan de ella. Si no se hace en una sola pieza, un Mover podría llevarse unidades prometidas a un pedido.
4. **Asignación FEFO (allocation):** no existe como regla; solo hay un orden por vencimiento al listar ubicaciones (`domain/inventario.ts:627`). Se necesita una función de asignación en dominio **y** en base de datos que, por línea de pedido, elija el lote **Aprobado, sin bloqueo, no vencido y con cantidad suficiente que vence primero**, y su celda (ubicación). **Solo FEFO**, con la excepción única de §2.4. «Sin bloqueo» hoy solo puede significar ubicación en conteo o retorno bloqueado para revisión: el **hold** de un lote Aprobado sigue pendiente de Katia (D-17 n.° 3), así que se prepara el punto de consulta (`lote_bloqueado()`) pero **no** se crea la forma de bloquear.
4b. **Orden de picking:** la asignación genera una **orden de picking** (ubicación, producto, lote, vencimiento, cantidad) **ordenada por recorrido del almacén**. Hoy las posiciones tienen rack, posición y nivel (y geometría aproximada para el mapa), pero **no un orden de recorrido**: se agrega un `orden_recorrido` configurable por posición (por defecto rack → posición → nivel; Charlie confirma el recorrido real). Existe en el teléfono y como **hoja de picking imprimible** (PDF con `@react-pdf/renderer`, ya usado en las actas) desde el primer día, para la transición y como respaldo.
4c. **Repositorio de documentos regulatorios (hoy no existe):** el WMS solo guarda `cert_analisis` (sí/no) en el acta organoléptica y una referencia de texto (`archivo_ref`) en `documentos_sustento`; **no usa Supabase Storage en ningún lado**. Se necesita un repositorio con archivos (COA por lote, registro sanitario por producto —ya existe `producto_regulatorio` con `registro_sanitario` y `rs_vence`—, certificado BPM por fabricante o laboratorio —hoy `fabricante` es texto libre—), con vigencia e historial. Ver §4.8.
5. **Conteo:** la pausa por conteo (`trg_pausa_por_conteo`) rechaza cualquier partida sobre una ubicación en conteo; el picking sobre esa ubicación debe mostrarse como «ubicación en conteo» y no como «no hay stock». Y el conteo debe **excluir** las unidades reservadas por picking, igual que ya excluye las en tránsito.
6. **Kardex e historia del lote:** el Kardex lleva «solo entradas y salidas»; hoy no hay salidas. `SALIDA` y `RETORNO` deben aparecer (el formato Farmacil ya tiene columna de salidas).
7. **Roles/permisos:** `usuario_roles.rol` tiene un `CHECK` con 7 valores y `permisos_rol.accion` otro con 8 acciones; ambos se amplían en una migración, junto con `Rol`/`Accion`/`ETIQUETA_ROL` en el dominio y el selector de la demo.
8. **Documentos de reglas:** `reglas-negocio.md` dice «Alcance actual: solo entradas y movimientos internos» y «Embalaje, Despacho: fuera de alcance». Se actualizan cuando apruebes este diagnóstico (no antes).
9. **CI:** el servicio es `postgres:16`; producción es 17.6 y pediste ensayar en 17. El contenedor solo trae 16 (no hay paquete 17), así que **la prueba en 17 solo puede correr en CI** (imagen `postgres:17`, sin costo). Un PR chico lo cambia (§6, S0b).

### 2.3 Conflictos y contradicciones (no resueltos; los dejo para tu decisión)

> Formato pedido: contradicción → impacto → alternativas → recomendación.

**1. (Resuelto) El Master ya está en el repo.** Estados, roles, KPI y mapa del LS-FR se contrastaron; ver conflictos 15 a 18 para lo que el Master trajo.

**2. Odoo (RESUELTO por Sebas, 2026-10-14): Odoo desaparece; el WMS lo reemplaza. No se integra ni se usa.** El Master (hoja `07_Roadmap`, integraciones P1 «Odoo/ERP») y RUT-07 (paso 9, «integra con ERP/Odoo») hablaban de sincronizar con Odoo; por esta decisión **esa integración se descarta**: «Salida confirmada» es el movimiento definitivo del WMS y no se envía a ningún ERP. Consecuencias que dejo anotadas:
- **Fuera del diseño:** la cola «por validar en Odoo», el reporte de conciliación con Odoo para salidas y cualquier escritura en Odoo.
- **El WMS pasa a ser la fuente de verdad de las salidas** (hoja de salida, lote y ubicación, validación de la salida). Lo que hoy se hace en Odoo —preparar la salida con ubicación y lote, imprimir la hoja de salida, validar la salida horas después, anular o revertir la salida de un rechazo— lo cubre el WMS.
- **Stock vendible para Pedidos (INV-01):** hoy es una carga manual diaria desde Odoo; pasa a publicarlo el WMS (§4.1).
- **Se mantiene** lo ya decidido sobre la **carga inicial** (una exportación única de Odoo tras el inventario general) y el **paralelo de 4 semanas**, que solo sirve para comparar y firmar diferencias (ver `carga-inicial-odoo.md`): mientras dure, Odoo se sigue usando por el equipo; **el WMS nunca lee ni escribe en Odoo**. **El paralelo de 4 semanas se mantiene (decidido por Sebas, 2026-10-14).**

**3. Pedidos ya tiene su propio módulo de despacho** (`pedidos.fulfillments`, `confirm_dispatch`, estado terminal `DISPATCHED`, `stock_levels`/`stock_lotes` manuales; 0045–0049) **que choca con las salidas del WMS:**
- *Qué choca:* (i) dos fuentes de verdad del despacho; (ii) Pedidos **no bloquea por falta de stock** («pendiente_de_stock») mientras el WMS nunca admite negativo ni stock no Aprobado; (iii) Pedidos elige la «fuente de stock» (central/regional) al despachar, mientras el WMS maneja propietario; (iv) `DISPATCHED` es terminal y no existe «no entregado / rechazado / reprogramado»; (v) `vehicles`/`drivers`/`transporters` son catálogos de solo nombre (sin placa, sin «calificado»).
- *Alternativas:* (a) convivir (dos registros: viola «un dato se escribe una sola vez»); (b) **Pedidos deja de despachar y solo recibe estados del WMS** (el WMS lo pone en `DISPATCHED` con un evento autenticado y crea el `fulfillment` equivalente para no romper reportes ni borradores de GRE); (c) el WMS ignora lo de Pedidos (duplica maestros).
- *Recomendación [B]:* **(b)**, con un feature flag para no apagar nada hasta el corte. **Es un cambio no aditivo en Pedidos: requiere tu aprobación explícita** (regla de `apps/wms/CLAUDE.md`). Hasta entonces, no se toca.

**4. Tercer conteo de Transporte: RUT-04 TO-BE paso 10 lo elimina; RUT-04 Implementación P1 dice «desactivar cuando el control digital esté estabilizado».** Mismo RUT, dos momentos. *Impacto:* es un control BPA; quitarlo del primer día puede ser un riesgo regulatorio. *Recomendación [B]:* construirlo **sin** reconteo, pero como parámetro `reconteo_transporte` (apagado) para poder encenderlo durante el piloto. **Decide Katia** (el AS-IS lo llama «Mantener mientras DT no cambie el criterio»).

**5. RUT-12 paso 1 reclasifica el retorno («No entregado» vs «Rechazado») que RUT-09 ya registró por parada.** Escribir el mismo dato dos veces viola «un dato se escribe una sola vez». *Recomendación [B]:* el resultado nace en la parada; al recibir el retorno el almacén **verifica** (bultos, sellos, cantidad) como en la recepción de ingresos; solo una diferencia obliga a corregir con motivo.

**6. La devolución existente exige pasos que no calzan con un rechazo de nuestro propio reparto.** El ingreso tipo Devolución pide *factura o boleta original*, una *solicitud autorizada por Sandra o Katia* (D-32) y un acta con firma del transportista (nombre, DNI, placa). *Impacto:* para un rechazo en ruta, la solicitud tendría que esperar una autorización humana antes de poder ubicar el retorno. *Alternativas:* (a) respetar D-32 tal cual (cuello de botella); (b) la solicitud nace **automática** desde la parada «Rechazado» con la factura/pedido ya conocidos, y se **autoriza** igualmente por Sandra/Katia pero sin bloquear el ingreso físico a la zona de Devoluciones. *Recomendación [B]:* (b) por ser aditiva, **pero es un cambio de proceso sanitario → decide Katia.**

**7. Zonas nuevas.** RUT-03 pide «Pendiente de conformidad» (staging), RUT-04 «Observado / pendiente de corrección» y RUT-12 «Retorno no entregado / reservado». **No existen en la topología** y su tipo de área BPA y ubicación física no están definidos. [C] «Pendiente de conformidad» podría ser Despacho K-1..K-7 (área compartida que ya existe). *Se eleva a Katia y Charlie, no lo resuelvo.* Mientras tanto se modelan como tipos de área configurables con `en_alcance = false` hasta confirmar.

**8. Reingreso de lo «No entregado» «sin evaluación de Katia» (decidido) vs el riesgo de cadena de frío/BPA.** El estado se mantiene Aprobado (no viola «Aprobado no vuelve a Cuarentena»), pero una mercadería que viajó con sello roto o temperatura fuera de 15–25 °C no debería volver silenciosamente al stock vendible. RUT-12 paso 3 pide verificar sellos y «condiciones de transporte aplicables». *Recomendación [B]:* el retorno con sello roto o temperatura fuera de rango **se bloquea** y escala a Katia; eso necesita el **«hold» (bloqueo temporal de un lote Aprobado)**, que sigue pendiente para Katia en reglas-negocio (pendiente 3, D-17). **Decide Katia.** No cambio tu regla: solo señalo que sin «hold» esa excepción no tiene dónde vivir.

**9. Nombres de la Ruta.** RUT-01 dice «Planificada / lista para preparación», RUT-08 «Ruta lista para ejecutar» y RUT-07 «Lista para carga». *Master:* la hoja `03_Estados_WMS` define **Borrador → Planificada → Lista para carga → Liberada → En ruta → Pendiente de cierre → Cerrada**; «Ruta lista para ejecutar» aparece solo como *salida de la etapa 8 del flujo*, no como estado. *Recomendación [B]:* adoptar los estados del Master y tratar «lista para ejecutar» como **condición calculada** (recursos, citas, ubicaciones y requisitos completos) que se exige para pasar a Lista para carga.

**10. «Recojo» aparece como resultado de parada (RUT-09, RUT-11) pero ningún RUT describe qué es** (¿recoger devoluciones del cliente? ¿recoger mercadería a terceros?). Si es un ingreso, tocaría el flujo de entradas. [C] Se pregunta a Roberto; no se construye hasta saberlo.

**11. (Reemplazado por decisión de Sebas) «Vencimiento mínimo del cliente» (RUT-03 paso 2).** Queda **fuera de esta fase**: el WMS asigna solo FEFO. Se registra como fase posterior (D-62): condición de vencimiento por línea indicada por el vendedor en Pedidos, vida útil mínima por cliente y verificación al instante en Pedidos. El modelo queda preparado, sin construirlo.

**12. Tipos de bulto por pallet:** RUT-04 clasifica el volumen S/M/L/XL (L = 1 pallet, XL = más). S y M salen de la cantidad de bultos; **L y XL requieren marcar «pallet»**, que no es peso ni dimensión. [C] Se ofrece como casilla opcional; si no es necesaria para el ranking, se omite.

**13. Transportista externo (Green Logistics, provincia):** RUT-08 lo registra, pero RUT-07, 09, 10 y 11 solo describen reparto propio. *Hueco de proceso* (sin escaneo de carga ni POD propio). [C] Entra después; en la primera fase una ruta externa es un caso simple (pedidos, ventana de recojo, responsable y evidencia).

**14. (Resuelto, D-57) Roberto es solo `jefe_transporte`**, sin permisos de Jefe de Almacén; el reemplazo del Jefe de Almacén es **Jasury**. Un usuario puede tener varios roles (la tabla ya lo permite). La conformidad es un **permiso propio**, asignable a quien corresponda (hoy Sandra). Cambia reglas-negocio (lista de reemplazos) y el plan del Batch 4.

**15. (Resuelto, D-60) Se mantiene el Master:** Conforme para despacho → Documentación completa → Listo para carga. Sebas precisó: el embalaje es **después** de la conformidad y el pedido pasa a «Listo para carga» **cuando está conforme, embalado, con GRE y con su paquete documental completo**. Interpretación que aplico y que puedes corregir: la cadena de estados visibles es la del Master, y «embalado» es una condición más que se exige al pasar a «Listo para carga».

**16. Estados que el Master no define y los RUT sí necesitan.** Faltan: **Bloqueado por stock** (RUT-03 paso 7), **Reprogramado** (el Master lo nombra como siguiente de «No entregado», pero sin fila), **Entregado** (se menciona en «En ruta → Llegó / Entregado», sin fila), **Cancelado**, y **todos los estados de Bulto y de Parada** (tú pediste estados por agregado, incluidos estos). Siguen en §5.2 como [C], marcados como «no están en el Master».

**17. KPI de Despacho: el Master propone 13 indicadores y D-44 (aprobada) fija 4 distintos** (OTIF, nivel de servicio, exactitud de despacho, tiempo de preparación). Solo **OTIF** coincide. *Por jerarquía gana D-44.* *Recomendación [B]:* los 4 de D-44 en Inicio/Indicadores; los 12 restantes del Master (exactitud de ubicación, picking sin discrepancias, First Pass Yield, errores detectados por Transporte, carga conciliada, salida en tiempo real, incidencias por 100 entregas, reprogramaciones por causa, cargos conciliados, LS-FR automático, tiempo de cierre, retornos segregados) como un grupo «Transporte y retornos» en Reportes. Metas: el Master dice «meta por definir», coherente con D-42 (medir un mes primero). A cada uno hay que fijarle «más es mejor / peor» (D-45): p. ej. «errores detectados por Transporte ≈ 0» y «incidencias por 100» son «menos es mejor». **Decide Sebas.**

**18. El Master nombra personas en los roles** («Roberto / Planificador de rutas», «Sandra / Conformidad», «Charlie», «Arlette»). Tu regla es roles, no nombres: los traduzco a **planificador de rutas** (`jefe_transporte`), **conformidad**, **responsable de almacén** y **administración/facturación**. Dato útil: el Master asigna hoy la conformidad a quien es asistente de Dirección Técnica; qué rol del WMS la ejerce queda abierto (D-57).

### 2.4 Decisiones de Sebas incorporadas (2026-10-14, revisión 3) [A]

**1. D-51 — el movimiento rack → staging se registra cuando Conformidad verifica** (coherente con D-41). Mientras tanto las unidades quedan **reservadas y visibles como «en tránsito»** (la vista de tránsito de Mover se extiende a las unidades en picking).

**2. Secuencia de salida (se mantiene el Master):**
- El WMS **asigna lote y ubicación a cada línea** (allocation) y genera la **ORDEN DE PICKING**: ubicación, producto, lote, vencimiento y cantidad, **ordenadas por recorrido** dentro del almacén. El picker la ve en el teléfono y existe como **HOJA DE PICKING imprimible desde el primer día** (transición y respaldo).
- **GRE y factura se emiten después de la conformidad**, con los **lotes realmente despachados, tomados de lo confirmado, sin volver a escribirlos**. La GRE no se conecta con SUNAT: el WMS **registra y guarda su número**.
- Embalaje después de la conformidad. **«Listo para carga» = conforme + embalado + con GRE + paquete documental completo.**

**3. Selección de lote: solo FEFO.**
- Asigna siempre el lote Aprobado, sin bloqueo y con cantidad suficiente que vence primero. **No se toca Pedidos.**
- **Única excepción:** el Jefe de Almacén (o su reemplazo) o el Jefe de Transporte pueden **cambiar el lote asignado a una línea antes del picking**, con **un único motivo fijo: «Cliente solicita vencimiento más largo»** (sin texto libre ni otros motivos).
- Validado en **dominio y base de datos**: el lote nuevo debe vencer **después** del asignado, estar Aprobado, sin bloqueo y con cantidad suficiente. Nunca stock negativo. Queda registrado quién, cuándo, lote anterior, lote nuevo y motivo.
- **Sin stock suficiente para una línea:** el sistema alerta **antes del picking** al Jefe de Transporte; el picker nunca lo descubre en el pasillo.
- **El picker no encuentra el lote asignado:** se registra la discrepancia y el sistema propone el siguiente FEFO válido (o, si la línea tenía la excepción, el siguiente lote que también venza después del original).
- **Trazabilidad:** lote asignado por FEFO → cambio por excepción (si hubo) → lote despachado.
- **Fase posterior (modelo preparado, sin construir; D-62):** condición de vencimiento por línea indicada por el vendedor en Pedidos («más lejano» o «que venza después de mes/año»), vida útil mínima por cliente y verificación al instante en Pedidos.

**4. Paquete documental por producto (nuevo requerimiento; D-63).**
- Repositorio: **COA por lote** (se adjunta en la recepción; el acta organoléptica ya pregunta si trae COA), **registro sanitario por producto** (ya existe en `producto_regulatorio`, con su vencimiento) y **certificado BPM por fabricante o laboratorio**, con vigencia.
- El **maestro del cliente** dice qué documentos exige (p. ej. BPM solo si el cliente lo pide).
- **Botón para el Jefe de Transporte:** imprimir el paquete de un pedido o de toda una ruta, con los documentos de los **lotes exactos** que se despachan, en **un solo PDF ordenado**.
- **Alerta** si falta un documento o está vencido, **antes de «Listo para carga»**.
- **Solo Dirección Técnica** sube o reemplaza documentos regulatorios, con historial. **Sin costo adicional** (Supabase Storage del plan Pro).

**5. D-57 — Roberto es solo `jefe_transporte`**, sin permisos de Jefe de Almacén (el reemplazo del Jefe de Almacén es Jasury). Un usuario puede tener varios roles. **La conformidad es un permiso propio**, asignable a quien corresponda (hoy Sandra), no atado a un cargo.

**6. D-59 — de acuerdo con el plan:** S0b (CI en Postgres 17), luego S1 y S2 sin pantallas, luego Pedidos, Rutas y Picking.

**7. Paralelo con Odoo: se mantiene, 4 semanas**, solo para comparar y firmar diferencias; el WMS nunca lee ni escribe en Odoo (D-50).

**Cómo interpreté lo que no dijiste (corrígeme si no es así):**
- *«Maestro del cliente» (punto 4):* los clientes siguen naciendo en Pedidos y el WMS no los crea ni los modifica. El **perfil documental del cliente** (qué documentos exige) se guarda **en el WMS, ligado al RUC**, y se muestra en la ficha de cliente del WMS. Así **no se toca Pedidos**.
- *COA:* lo adjunta **quien recibe** (parte del ingreso, con historial) y solo Dirección Técnica puede **reemplazarlo** una vez adjuntado; registro sanitario y BPM los sube solo Dirección Técnica. Esto concilia «se adjunta en la recepción» con «solo DT sube o reemplaza documentos regulatorios».
- *Picker no encuentra el lote:* primero propongo **el mismo lote en otra ubicación autorizada** (RUT-03 paso 5) y, si no hay, el siguiente FEFO válido; en ambos casos queda la discrepancia para conteo.
- *Un lote vencido nunca se asigna*, aunque esté Aprobado (salvaguarda mía).
- *Sin stock suficiente:* el pedido o la línea se bloquea y vuelve al planificador/Comercial (RUT-03 paso 7). Los **despachos parciales no están en ningún RUT**: queda como pregunta a Roberto/Comercial.

### 2.5 Ajustes de Sebas (2026-10-14, revisión 4) [A]

**1. Ubicaciones.** La nomenclatura es **Rack-Columna.Nivel** (A-10.2 = rack A, columna 10, nivel 2; niveles 1 a 4 **de abajo hacia arriba**). Las posiciones de **piso** (B, C, D y E-1 a E-7) **no tienen niveles**. El recorrido de picking se mantiene, **ordenando por la posición física de cada columna**. *(En el esquema, la columna `wms.posiciones.posicion` ya guarda ese número; solo cambia el nombre en la documentación, no hace falta migrar. `orden_recorrido` se calcula con la posición física de cada columna.)*

**2. COA por lote.** Cada lote recibido trae su COA y se adjunta **en la recepción**. **La carpeta existente se importa con la carga masiva.**

**3. Dos tipos de salida (cambia el plan; §4.9).** **A) Distribución** (stock de Logissa): el pedido nace en Pedidos, Logissa emite factura y GRE, FEFO asigna el lote; es lo que cubren los RUT. **B) Por cuenta de un cliente de almacenamiento** (Diphasac, AJR Labs, Medic Pharma Lab, Triamed): el cliente emite su propia factura y GRE, su usuario crea la orden de salida en el WMS indicando el lote, Logisalud pica, conforma, embala y despacha; el transporte puede ser recojo del cliente, ruta de Logisalud o transportista del cliente. **Reemplaza** la decisión anterior de dejar la salida de terceros fuera de la primera fase: **entra al plan**, después del núcleo de picking, conformidad y despacho, y **antes del paralelo con Odoo**, porque es requisito para apagar Odoo (hoy los clientes crean sus órdenes ahí).

**4. Productos vencidos.** Stock de **Logissa**: nunca sale vencido; lo vencido va por el flujo de Bajas. Stock de **un cliente**: puede ordenar la salida de un lote vencido **solo con un motivo que no sea venta** (destrucción, devolución al proveedor, pesquisa DIGEMID) y **con aprobación de Dirección Técnica** (a confirmar con Katia).

**5. Salidas sin venta de Logissa** (muestra, pesquisa DIGEMID, otros): autorizadas por el rol **«autoriza salidas sin venta»** (hoy Juan y Sebas), **sin el mínimo de 60 días**, pero **nunca vencidas**.

**6. Pedidos de venta de Logissa: vida útil mínima de 60 días** (parámetro configurable). Consecuencia: el FEFO asigna el lote que vence primero **entre los que tienen al menos 60 días**, y el «stock vendible» que se publica a Pedidos excluye los lotes con menos de 60 días.

**7. LS-FR.43.03:** firmas **solo al final, en la última página**; el pie «LOGISSA S.A.C.» **se mantiene tal cual**. *(Resuelve dos de las preguntas nuevas para DT; las seis de la hoja `08` siguen abiertas salvo la parte de firmas por página.)*

**Precisiones de la salida B:**
- **Flujo real:** el cliente consulta su stock en nuestro sistema → emite factura y GRE en su sistema con el lote elegido → crea la orden en el WMS con su usuario → picamos, conformamos y embalamos → **su transportista recoge**.
- **El stock que ve el cliente es su disponible real por lote y vencimiento** (saldo menos lo comprometido en sus órdenes en curso), porque con eso emite un documento tributario. La validación al crear la orden se mantiene.
- **Códigos de producto:** un producto tiene varios códigos: el nuestro de distribución, el del proveedor (se conserva, nunca se elimina) y el de cada cliente de almacenamiento (AJR0026 para AJR; Medic Pharma enviará los suyos). El cliente ve y busca con su código; **la búsqueda del WMS encuentra un producto por cualquiera**. *Revisado: `catalogo.productos` guarda `codigo` (el nuestro), `codigo_proveedor` (un solo texto) y `codigo_bonificacion`; **no hay códigos por cliente ni varios por proveedor**, así que hace falta una tabla nueva y aditiva (§4.7).*
- **Transporte en la salida B:** el cliente recoge con su transportista; **el LS-FR.43.03 no aplica** (solo cuando transporta Logisalud). Se registra la **ENTREGA AL TRANSPORTISTA DEL CLIENTE**: transportista, placa y conductor (tomados de su GRE), bultos entregados, hora y **firma en pantalla** de quien recoge. **Ese evento es la salida confirmada y el movimiento definitivo de stock.**

**Lo que no tengo registrado (te lo digo para no inventarlo):**
- **El ejemplo de GRE de AJR (EG07-00002031) no está en `docs/wms/referencias/`**: la carpeta solo trae `movimiento-tabla-demo.html`. Trabajo con los campos que describiste (lote y vencimiento por línea, código del cliente AJR0026, bonificación, destinatario, punto de llegada, transportista, placa, conductor y observaciones de temperatura). Súbelo para el diseño fino de la orden y de la futura lectura automática.
- Tres veces escribiste «como te indiqué»: **el recorrido de picking** (punto 1), **las salidas sin venta** (punto 5) y **los 60 días** (punto 6). **No tengo esas instrucciones anteriores en mi contexto** (solo los pasos que me diste aquí). Las registro **tal como las escribes ahora**; si había algún detalle más, dímelo y lo ajusto.

**Impacto en S0b, S1 y S2 (te lo aviso antes de seguir, como pediste):**
- **S0b no cambia** (CI en Postgres 17).
- **S1 sí cambia:** agrega el rol **`usuario_cliente` ligado a un propietario** y, antes que nada, el **aislamiento por propietario en la base de datos**. Hallazgo de seguridad (P0): hoy casi todas las tablas del WMS se leen con la política «`wms.es_usuario()`», que es verdadera para **cualquier** fila de `usuario_roles`; si el rol de cliente se guardara ahí sin más, **un usuario de cliente vería el stock de todos los propietarios**. Hay que cambiar `es_usuario()` para que no cuente al rol de cliente y definir políticas propias por propietario, con pruebas de aislamiento (D-68).
- **S2 sí cambia:** la asignación debe soportar **dos modos** (FEFO con mínimo de 60 días para A; lote indicado por el cliente para B), el **disponible real por propietario** (saldo menos lo comprometido), la regla de **vencidos** (Logissa nunca; cliente solo con motivo no-venta y aprobación de DT) y la reserva desde la creación de la orden B.
- Por eso **no empiezo S1 ni S2 hasta que lo confirmes**.

## 3. Gap analysis por RUT

Leyenda de severidad: **Crít** (impide operar o rompe una regla cerrada), **Alta**, **Media**. Prioridad: **P0** crítico para operación, integridad o regulación; **P1** necesario; **P2** mejora posterior. Capas: **F** frontend · **B** backend (acciones/servicios) · **DB** base de datos · **M** migración · **T** tests.
Estado actual en todas las filas: *no existe en el WMS* salvo donde se indica.

### RUT-01 Planificación y armado de rutas
| # | Requerimiento TO-BE | Fuente | Gap | Sev | Cambio | Pri |
|---|---|---|---|---|---|---|
| 1.1 | Cola de pedidos elegibles con corte 4:00 p. m. y excepciones autorizadas | A (TO-BE 1) | No hay importación de pedidos ni cola | Crít | F, B, DB, M, T. Parámetros `hora_corte_planificacion` (16:00) y excepción con autorizador | P0 |
| 1.2 | Maestro de cliente con coordenadas, cita/ventana, contacto, requisito de vehículo calificado | A (TO-BE 2; P0 datos) | Pedidos tiene dirección, ubigeo, contactos; **no** coordenadas, citas ni vehículo calificado (grep en 0013/1000) | Crít | Columnas aditivas en Pedidos (fuente: clientes nacen allí) + snapshot en el WMS. Carga de datos P0 la hace Comercial/Roberto | P0 |
| 1.3 | Agrupar por zona y proponer secuencia; Roberto ajusta | A | Sin módulo de rutas | Alta | F, B, DB, T. Propuesta simple por zona/ubigeo; mapa/ETA es P2 | P1 |
| 1.4 | Vehículo compatible con el pedido (bloquea incumplimiento de «vehículo calificado») | A | No hay maestro de vehículos con placa ni «calificado» | Crít | Tabla `vehiculos` (placa, calificado, estado) + validación en DB | P0 |
| 1.5 | Conductor y auxiliar desde la disponibilidad del día | A | No existen los roles ni la disponibilidad | Alta | Roles + `disponibilidad_transporte` (fecha, usuario, vehículo) | P1 |
| 1.6 | Ruta con ID y **versión**; todo cambio posterior queda trazado | A | — | Alta | `rutas` + `ruta_versiones` (mismo patrón que `solicitud_ingreso_versiones`) | P0 |
| 1.7 | Crear el registro base LS-FR.43.03 al confirmar | A | No existe el formato en el repo | Crít | `registros_ls_fr_43_03` ligado a la ruta (§4 y §5.4) | P0 |
| 1.8 | Sugerencia de ruteo/ETA | A (P2) | — | Media | Fuera de la primera entrega | P2 |

### RUT-02 Preparación documental
| # | Requerimiento | Fuente | Gap | Sev | Cambio | Pri |
|---|---|---|---|---|---|---|
| 2.1 | Solo pedidos «Conforme para despacho»; nada definitivo antes | A | — | Crít | Guard en DB: no se puede registrar documentación definitiva sobre un pedido no conforme | P0 |
| 2.2 | **Paquete documental por producto y por cliente** (decisión 4): COA por lote, registro sanitario, BPM del fabricante; el perfil del cliente dice qué exige | A (decisión de Sebas; supera el «perfil por cliente/producto/lote» del RUT) | No existe repositorio de archivos ni Storage; solo `cert_analisis` (sí/no) | Crít | Repositorio con vigencia e historial (§4.8), perfil documental del cliente en el WMS, PDF único por pedido o ruta, alerta antes de «Listo para carga» | P0 |
| 2.3 | **GRE con los lotes realmente despachados, tomados de lo confirmado** y con la **placa y fecha reales**; el WMS **registra el N.° de guía** y no la emite ante SUNAT | A (decisión de Sebas) | No hay GRE; hoy se usa la placa BKW757 | Crít | N.° de guía único por pedido-intento; las líneas de la guía salen de la conformidad (sin reescribir lote ni vencimiento). Emisión SUNAT/Nubefact: P2 | P1 / P2 |
| 2.4 | Factura disponible o la liberación se bloquea | A | La factura vive en Pedidos (`facturas_emitidas`) / facturación | Alta | Evento «factura disponible» desde Pedidos (§4.1); el WMS no factura | P1 |
| 2.5 | Retroalimentar Ruta y LS-FR con el N.° de guía (una sola vez) | A | — | Alta | Se escribe en `pedido_documentos`; la ruta y el LS-FR lo **leen** | P0 |
| 2.6 | «Documentación completa» solo con todos los obligatorios; faltante = bloqueo visible | A | — | Alta | Estado derivado, no una columna | P1 |
| 2.7 | Impresión por lote de la ruta | A (P2) | — | Media | Después | P2 |

### RUT-03 Picking
| # | Requerimiento | Fuente | Gap | Sev | Cambio | Pri |
|---|---|---|---|---|---|---|
| 3.1 | **Asignación (allocation) por línea y orden de picking** con stock reservado | A | No existe | Crít | `reservas` + `asignaciones` + `ordenes_picking`; la reserva física nace al planificar (§4.2). Alerta al Jefe de Transporte si falta stock, **antes** del picking | P0 |
| 3.2 | **Solo FEFO** (Aprobado, sin bloqueo, no vencido, cantidad suficiente) y **única excepción**: cambio de lote antes del picking, motivo fijo «Cliente solicita vencimiento más largo» | A (decisión 3; sustituye «criterio por línea» y «mínimo del cliente») | No hay asignación FEFO (solo un orden por vencimiento en la búsqueda) | Crít | `asignar_lote()` en dominio **y** DB; `cambiar_lote_asignado()` con validación (vence después, Aprobado, sin bloqueo, cantidad) y registro de quién/cuándo/anterior/nuevo/motivo; lote asignado → cambio → lote despachado | P0 |
| 3.2b | **Orden de picking ordenada por recorrido**, en teléfono y **hoja imprimible desde el primer día** | A (decisión 2) | No hay `orden_recorrido` en las posiciones | Alta | Columna configurable por posición (por defecto rack → posición → nivel; Charlie confirma); PDF de la hoja | P0 |
| 3.2c | **El picker no encuentra el lote asignado:** discrepancia + propuesta del siguiente FEFO válido (o, con la excepción, el siguiente que también venza después del original) | A (decisión 3) + B (primero el mismo lote en otra ubicación) | — | Crít | Función `proponer_reemplazo()`; la línea queda con discrepancia para conteo | P0 |
| 3.3 | Asignar picker y registrar responsable/hora de inicio | A | — | Alta | Patrón `ordenes_movimiento` (ejecutor) | P1 |
| 3.4 | Confirmar línea por línea (ubicación-producto-lote-cantidad); escaneo si se puede | A | No hay escaneo; el equipo usa **teléfonos personales** | Alta | Confirmación guiada primero; escaneo con la cámara (Context7 para la librería) P2 | P1 |
| 3.5 | **Discrepancia de ubicación** ≠ «no hay stock real»; sin búsqueda abierta | A | — | Crít | Ver 3.2c: dos resultados distintos en la tarea; la línea queda bloqueada y se deriva a conteo (INV-05) | P0 |
| 3.6 | Sin stock suficiente → bloquear el pedido **antes** de documentos | A | — | Crít | Estado `BLOQUEADO_POR_STOCK` con salida a planificador/Comercial | P0 |
| 3.7 | Registrar hora final, duración, lotes, responsable y errores | A | — | Alta | Eventos con `ts` y actor (auditoría) | P1 |
| 3.8 | Llevar el pedido a zona «Pendiente de conformidad» | A | Zona no existe / Despacho fuera de alcance | Crít | §2.2-2 y §2.3-7 | P0 |
| 3.9 | Corregir ubicaciones y conteos cíclicos (P0 de operación) | A | **Ya existe** (INV-05 + programación) | — | Solo seguirlos ejecutando | — |

### RUT-04 Conformidad
| # | Requerimiento | Fuente | Gap | Sev | Cambio | Pri |
|---|---|---|---|---|---|---|
| 4.1 | Cola digital «Pendiente de conformidad» (prioridad, hora de término, quién preparó) | A | — | Alta | F + vista | P1 |
| 4.2 | **Segregación de funciones:** conformidad ≠ picker | A + regla cerrada | El patrón existe (D-15) | Crít | Restricción en DB (`verificador_id <> ejecutor_id`, también contra `preparador_id`) | P0 |
| 4.3 | Verificar el 100 % (cliente/pedido, producto, cantidad, lote, vencimiento, estado externo) contra el picking digital | A | — | Crít | Verificación línea por línea | P0 |
| 4.4 | **Catálogo de no conformidades** (cantidad, producto, lote, vencimiento, daño, documento/dato, otro) | A | — | Alta | Tabla de catálogo + registro por línea | P1 |
| 4.5 | Zona «Observado»; bloquear avance; revalidar líneas afectadas | A | Zona nueva (conflicto 7) | Crít | Estado de pedido `OBSERVADO` + tarea de corrección | P0 |
| 4.6 | Eliminar la hoja física; horas automáticas | A | — | Alta | Conformidad digital | P1 |
| 4.7 | Métricas de picking/conformidad para ranking e incentivo (categoría por n.º de productos, volumen, errores, retrabajos) | A | — | Media | Vista derivada; mensual | P1 |
| 4.8 | Quitar el tercer conteo de Transporte | A (contradice a sí mismo) | Conflicto 4 | Alta | Parámetro `reconteo_transporte` | P1 |

### RUT-05 Embalaje y bultos
| # | Requerimiento | Fuente | Gap | Sev | Cambio | Pri |
|---|---|---|---|---|---|---|
| 5.1 | Solo «Conforme para despacho»; estándar de embalaje (frágiles: ampolletaje) | A | El estándar no existe (P0 de proceso) | Alta | Catálogo de reglas de embalaje por tipo de producto/destino (datos); aprueban Almacén y Calidad | P1 |
| 5.2 | **ID único de bulto y QR para todos los despachos, Lima incluido**; secuencia «1 de 3» | A | Hoy Lima **no** etiqueta; provincia usa Excel + etiquetera | Crít | `bultos` + etiqueta imprimible (PDF). **Costo:** QR por cámara de teléfono es gratis; impresora de etiquetas ya existe (provincia) | P0 |
| 5.3 | Registrar cantidad final de bultos; **equivalencia «bulto» ↔ «N.° cajas»** del LS-FR es **pregunta abierta a DT** | A + C | Bloqueado por Katia | Alta | Parámetro `cajas_equivale_a_bultos`; se construye parametrizable | P0 |
| 5.4 | Actualizar Ruta y LS-FR con el dato | A | — | Alta | Lectura derivada | P1 |
| 5.5 | Sin pesos ni dimensiones obligatorios | A (tu regla) | — | — | No se piden | — |
| 5.6 | Staging por ruta y «Listo para carga» | A | Zona por ruta | Alta | Posición de Despacho asignada a la ruta | P1 |

### RUT-07 Carga y salida
| # | Requerimiento | Fuente | Gap | Sev | Cambio | Pri |
|---|---|---|---|---|---|---|
| 7.1 | Checklist previo del vehículo (identidad/placa, limpieza, condición, calificación, controles) | A | No hay | Alta | `checklist_vehicular` (resultado por ítem) | P0 |
| 7.2 | Escanear cada bulto al cargar; bloquear equivocados o duplicados | A | — | Crít | Escaneo por cámara + validación en DB (el bulto pertenece a la ruta y no está cargado) | P0 |
| 7.3 | Transporte controla solo integridad externa, sello, documentos | A | — | Alta | Checklist, sin recontar contenido | P1 |
| 7.4 | **Conciliar:** pedidos de la ruta = cargados; bultos esperados = escaneados; diferencia bloquea o exige excepción autorizada | A | — | Crít | Función de conciliación + excepción con autorizador y motivo | P0 |
| 7.5 | **Liberar unidad** solo con conciliación, checklist, documentos y vehículo calificado | A | — | Crít | Acción protegida en DB (`liberar_unidad`) | P0 |
| 7.6 | **Salida confirmada** con hora real y **movimiento definitivo de stock** | A | No existe `SALIDA` en el ledger | Crít | Transaccional e idempotente (§4.3) | P0 |
| 7.7 | Actualizar el LS-FR con la hora real y dejar la ruta «En ruta» | A | — | Alta | Evento → registro | P1 |
| 7.8 | ~~Integración con ERP/Odoo~~ | A (descartado) | Conflicto 2 resuelto: Odoo desaparece | — | No se construye integración; el WMS es la fuente de verdad | — |

### RUT-08 Coordinación con transportistas
| # | Requerimiento | Fuente | Gap | Sev | Cambio | Pri |
|---|---|---|---|---|---|---|
| 8.1 | Recursos (vehículos, conductores, auxiliares) vinculados a cada ruta | A | Ver 1.4 y 1.5 | Alta | — | P1 |
| 8.2 | Datos de entrega desde el maestro, sin cadena Arlette → vendedor → WhatsApp | A | Ver 1.2 | Crít | Snapshot del cliente en el pedido importado | P0 |
| 8.3 | Placa real en la GRE; **nunca editar la fecha de una GRE existente** (anulación/reemisión formal) | A | Hoy se edita por fuera | Crít | Regla: un cambio con impacto documental marca el documento «por reemitir». **No invento reglas tributarias** | P0 (regla) |
| 8.4 | Cambios de cita/vehículo/conductor/secuencia = nueva versión de la ruta antes de salir | A | — | Alta | `ruta_versiones` | P0 |
| 8.5 | Contingencias (falla de vehículo, chofer ausente) con revalidación automática | A | — | Alta | Reasignar y revalidar compatibilidad | P1 |
| 8.6 | Transportista externo (Green Logistics) como entidad | A | Conflicto 13 | Media | `transportistas_externos`, simple | P2 |
| 8.7 | «Ruta lista para ejecutar» | A | Conflicto 9 | Media | Condición calculada | P1 |

### RUT-09 Monitoreo y seguimiento
| # | Requerimiento | Fuente | Gap | Sev | Cambio | Pri |
|---|---|---|---|---|---|---|
| 9.1 | Tablero de ruta en tiempo real (secuencia, pedidos, estado de parada) | A | — | Alta | Vista para jefe de transporte y vendedores | P1 |
| 9.2 | **«Mis rutas»** móvil: cliente, coordenadas, contacto, cita, guía y observaciones por parada | A + tu punto 6 | No existe vista móvil de transporte | Crít | Prioridad móvil (390×844) | P0 |
| 9.3 | Eventos: **Llegué, Entregado, Recojo, No entregado, Rechazado, Incidencia** con hora automática | A | — | Crít | `eventos_ruta` append-only | P0 |
| 9.4 | **Temperatura** por parada según método de DT | A + C | Método y momento **pendientes de Katia** | Alta | Campo parametrizable; bloqueado hasta su respuesta | P0 (bloqueado) |
| 9.5 | POD: foto/cargo firmado y sellado dentro del pedido | A | Hoy solo WhatsApp | Alta | Foto con compresión en el teléfono (Supabase Storage del plan Pro; se comprime en el teléfono para cuidar la cuota) | P1 |
| 9.6 | Cambio del orden real con motivo; el plan original queda | A | — | Media | Campos `secuencia_plan` / `secuencia_real` | P1 |
| 9.7 | **Retorno de unidad** → «Pendiente de cierre» | A | — | Alta | Evento | P1 |
| 9.8 | GPS / datalogger / ETA | A (P2; **GPS fuera del P1**, tu regla) | — | Media | No se hace | P2 |

### RUT-10 Incidencias y reprogramaciones
| # | Requerimiento | Fuente | Gap | Sev | Cambio | Pri |
|---|---|---|---|---|---|---|
| 10.1 | Incidencia desde la parada con tipo obligatorio, comentario, evidencia, hora, responsable | A | — | Alta | `incidencias` | P1 |
| 10.2 | **Catálogo de causas** (cliente cerrado, no atiende, dirección incorrecta, cita perdida —planificación interna o imprevisto de ruta—, rechazo, documento, pedido, vehículo, retraso/tráfico, otro) | A | — | Alta | Catálogo en tabla, editable por administración | P1 |
| 10.3 | **Playbook / matriz de autoridad por causa** (Transporte resuelve lo rutinario; escala lo excepcional) | A | **El contenido no está definido** (P0 de proceso: Roberto/Comercial/Calidad) | Alta | Estructura lista; contenido por decidir | P0 (bloqueado) |
| 10.4 | Regla 20 + hasta 10 minutos para cliente presente que no atiende (con registro) | A | — | Media | Temporizador en la parada; configurable | P1 |
| 10.5 | Dirección equivocada: registrar la correcta y **solicitar actualización del maestro** | A | — | Media | Solicitud hacia Pedidos (no editar el cliente desde el WMS) | P1 |
| 10.6 | **Reprogramar = nuevo intento** sobre el mismo pedido con motivo, fecha y prioridad | A | — | Crít | `intentos_entrega` (cada intento conserva su ruta y motivo) | P0 |
| 10.7 | Reprogramación con efecto documental: anulación/reemisión formal de la GRE; **no reutilizar una GRE si corresponde una nueva** | A | Regla tributaria sin validar | Alta | «Por reemitir» + **marcado para validar con Contabilidad/Arlette; no invento la regla** | P1 |
| 10.8 | Rechazo → resultado «Rechazado» → activa RUT-12 | A | — | Crít | Evento | P0 |
| 10.9 | Medición por causa, cliente, vendedor, ruta, transportista, recurrencia | A | — | Media | Reporte | P2 |

### RUT-11 Cierre de ruta y cargos
| # | Requerimiento | Fuente | Gap | Sev | Cambio | Pri |
|---|---|---|---|---|---|---|
| 11.1 | Conciliar todas las paradas: ningún pedido sin resultado | A | — | Crít | Condición de cierre en DB | P0 |
| 11.2 | Cargos físicos recibidos vs POD digital | A | — | Alta | Checklist de cargos | P1 |
| 11.3 | Cargo faltante → **tarea de recuperación** con responsable y fecha límite | A | — | Media | `tareas_recuperacion_cargo` | P1 |
| 11.4 | Derivar bultos retornados a RUT-12 y conciliar que ingresaron | A | — | Crít | Conciliación de bultos retornados | P0 |
| 11.5 | **Generar el LS-FR.43.03** (PDF imprimible, 10 filas por página, código/estructura/versión controlados) | A + tu §6 | No hay generador ni formato | Crít | §4.6 y §5.4 | P0 |
| 11.6 | Firmas físicas de Conductor y DT (hasta que Calidad apruebe otra cosa) | A + tu §6 | **Pendiente de Katia** | Alta | Espacios de firma en el PDF; sin firma electrónica | P0 |
| 11.7 | Resumen de cierre + cerrar solo si todo está conciliado; pendientes permitidos abiertos como tareas | A | — | Alta | Reporte de cierre | P1 |
| 11.8 | Archivo digital (LS-FR + POD + evidencias) vinculado a la ruta; retención | A + C | Retención **pendiente de Katia** | Alta | Expediente de ruta (patrón de `expedientes`) | P1 |

### RUT-12 Retornos y devoluciones
| # | Requerimiento | Fuente | Gap | Sev | Cambio | Pri |
|---|---|---|---|---|---|---|
| 12.1 | Recibir el retorno por bulto (escaneo) | A | Conflicto 5 (verificar, no reclasificar) | Crít | Verificación del retorno | P0 |
| 12.2 | «No entregado» → zona **Retorno reservado**, separada del stock disponible y de Devoluciones | A + tu decisión | Zona nueva (conflicto 7) | Crít | Zona + reserva vigente (§4.2) | P0 |
| 12.3 | Verificar integridad de bultos/sellos y condiciones de transporte antes de reutilizar | A | Conflicto 8 (hold) | Alta | Resultado apto / bloqueado → escalar | P1 |
| 12.4 | Mismo pedido, **nuevo intento**; no vuelve a conformidad (conserva la previa) | A | — | Alta | Transición `REPROGRAMADO → LISTO_PARA_CARGA` (bultos sellados) | P0 |
| 12.5 | «Rechazado» → Área de Devoluciones → **ingreso Devolución existente** (acta de devolución digital, acta organoléptica, decisión de Katia) | A + tu regla | Conflicto 6 | Crít | Reutilizar; adaptar la solicitud (§2.3-6) | P0 |
| 12.6 | Reversas documentarias y nota de crédito | A | Es de Pedidos/facturación | Alta | El WMS **emite el evento** «devolución confirmada»; no emite NC | P1 |
| 12.7 | Trazabilidad por pedido, lote, motivo, intento, actas y decisión sanitaria | A | — | Alta | Expediente de retorno | P1 |

### Salida tipo B — por cuenta de un cliente de almacenamiento (nuevo, no está en los RUT)
> No hay RUT para esta salida: es un requisito nuevo de Sebas (§2.5). Todo es **[A]** salvo donde se indica. Reutiliza picking, conformidad, embalaje, bultos y despacho de la salida A.

| # | Requerimiento | Gap | Sev | Cambio | Pri |
|---|---|---|---|---|---|
| B.1 | **Rol «Usuario de cliente» ligado a un propietario**; solo ve y opera el stock de su propietario | No existe. **`es_usuario()` lo dejaría leer todo** (hallazgo §2.5) | Crít | Rol + vínculo usuario-propietario; `es_usuario()` excluye al cliente; políticas por propietario en **RLS** (no solo interfaz); **pruebas de aislamiento entre propietarios** (lectura, escritura, funciones, vistas, Storage) | **P0** |
| B.2 | **Autenticación de usuarios externos** en el mismo proyecto Supabase que el personal | Los usuarios de cliente serían `authenticated` en el proyecto compartido: **Pedidos tiene 18 y Compras 5 políticas de lectura `using (true)`** para cualquier autenticado | Crít | **Decisión de Sebas (D-68):** endurecer esas políticas (cambio no aditivo en otras apps) o aislar a los clientes de otra forma. Sin resolverlo no se abre el acceso de clientes | **P0** |
| B.3 | **Orden de salida de cliente:** lote indicado por el cliente; GRE del cliente adjunta (PDF) y su número registrado | No existe | Crít | `ordenes_salida_cliente` + líneas (producto, lote, cantidad), GRE en Storage, N.° de guía | P0 |
| B.4 | **Validación al crear la orden:** el lote existe, es de ese propietario, está Aprobado, sin bloqueo y con cantidad suficiente; si no, avisa en ese momento | No existe | Crít | Función en DB (`crear_orden_salida_cliente`) + el mismo dominio; reserva al crear; nunca stock negativo | P0 |
| B.5 | **Disponible real del cliente** por lote y vencimiento (saldo − comprometido en sus órdenes en curso) | La vista de «disponible» solo conoce movimientos internos | Crít | Vista por propietario con reservas de órdenes B y A (§4.2) | P0 |
| B.6 | **Vencidos de cliente:** salida solo con motivo no-venta (destrucción, devolución al proveedor, pesquisa DIGEMID) y aprobación de DT | No existe | Alta | Motivo cerrado + aprobación de DT; Logissa nunca vencido. **Confirmar con Katia** | P1 |
| B.7 | **Códigos de producto múltiples** (nuestro, proveedor, cliente); búsqueda por cualquiera; el cliente ve el suyo | `catalogo.productos` solo tiene `codigo`, `codigo_proveedor` (texto único) y `codigo_bonificacion` | Alta | Tabla aditiva `wms.producto_codigos` (§4.7); índice de búsqueda; el código de proveedor **nunca se elimina** | P1 |
| B.8 | **Vista del cliente:** su stock por lote y vencimiento, crear órdenes y seguir su estado (pendiente, en preparación, lista, despachada, entregada); más adelante su Kardex e indicadores | No existe | Alta | Pantallas propias del cliente (Impeccable, 4 viewports); Kardex e indicadores: fase posterior | P1 |
| B.9 | **Picking, conformidad y embalaje** con el mismo flujo, pero **sin FEFO** (el lote lo fija el cliente); si el picker no encuentra el lote, discrepancia **sin sustituir por otro lote** | S5–S7 deben admitir los dos tipos de orden | Alta | Tipo de orden en las tareas; sin propuesta de reemplazo para B (otro lote lo decide el cliente) [B] | P0 |
| B.10 | **Transporte:** recojo del cliente, ruta de Logisalud (Ruta + LS-FR.43.03) o transportista del cliente | Solo existe el diseño de ruta propia | Alta | Campo «modalidad de transporte» en la orden; Ruta/LS-FR solo si transporta Logisalud | P1 |
| B.11 | **Entrega al transportista del cliente** = salida confirmada: transportista, placa y conductor (de su GRE), bultos, hora y **firma en pantalla** de quien recoge | No existe | Crít | Evento `ENTREGA_A_TRANSPORTISTA` que registra la `SALIDA` en el ledger; firma táctil (ya existe en actas) | P0 |
| B.12 | **Prellenar la orden leyendo la GRE del cliente** (PDF o XML) | — | Media | **Fase posterior**; no se construye ahora | P2 |
| B.13 | Quién crea las cuentas de usuario del cliente y cómo se les da de baja | No definido | Alta | Alta por Administración con vigencia (como `usuario_roles`); sin autoservicio | P1 |

## 4. Respuestas propuestas a los 7 puntos de arquitectura

### 4.1 Integración con Pedidos (otro proyecto Supabase) [B]
**Hechos:** Pedidos vive en `Logisalud_pedidos` (`dfqhxwkdflnkcjnysbwu`); el WMS, en `erp-cobranzas`. **Pedidos está planificado para consolidarse** en erp-cobranzas (`plan-unificacion-pedidos.md`, migraciones 1000+, D-39), pero todavía no. Un diseño que dependa de estar en proyectos distintos se rompe al consolidar.

**Propuesta: un puerto con dos adaptadores.** El WMS define un puerto `FuentePedidos` (como ya hace con `Repositorio`); la lógica no sabe de dónde vienen los datos.
- **Adaptador HTTP (hoy):** Pedidos expone **dos rutas** protegidas por **firma HMAC** (secreto compartido y rotable; sin service role del otro proyecto, sin exponer tablas):
  - `GET …/integracion/wms/pedidos-listos` → pedidos `READY_FOR_OPERATIONS` con *snapshot* (cliente, dirección, coordenadas, citas, vehículo calificado, líneas, factura/condición, versión).
  - `POST …/integracion/wms/eventos` → recibe eventos de salida del WMS (§4.4).
- **Adaptador SQL (tras consolidar):** una vista y una función en el mismo proyecto. Cambia el adaptador, no el dominio.
- **Dirección «entrada» (Pedidos → WMS): *pull* idempotente.** El WMS consulta (al abrir la bandeja y por una tarea programada) y hace `upsert` por `(pedido_id, versión)` en `wms.pedidos_despacho`. Reintentar nunca duplica. Si Pedidos no responde, el WMS sigue operando con lo ya importado y la bandeja muestra «última actualización hace X». Un pedido modificado en Pedidos después de importarse genera una nueva versión y **alerta** al planificador (no se pisa en silencio).
- **Dirección «salida» (WMS → Pedidos): *outbox*.** Cada evento relevante se escribe en `wms.eventos_salida` **en la misma transacción** que el cambio de estado, con clave de idempotencia (`pedido + tipo + intento`); un despachador los envía con reintentos y backoff. Si Pedidos está caído, nada se pierde ni bloquea el almacén; al volver, se entregan en orden. Pedidos aplica cada evento una sola vez (guarda la clave).
- **Stock vendible (INV-01, hoy carga manual diaria desde Odoo, que el WMS reemplaza):** el WMS publica `GET …/wms/api/stock-vendible` (también HMAC) con producto/lote/vencimiento/cantidad **vendible**; el importador que Pedidos ya tiene para `stock_lotes` lo consume en lugar del Excel. Es el reemplazo natural del paso manual. *Depende de que el stock del WMS sea real (carga inicial, hoy postergada hasta que existan salidas).*
- **Costo:** **ninguno nuevo**, todo cabe en lo que ya pagas: rutas serverless y **Vercel Cron** (Vercel Pro) para la importación programada; **Resend** para avisos por correo (pedido cambiado tras importarse, retorno sin ubicar, ruta pendiente de cierre); en Supabase Pro, `pg_cron` para los despachadores y revisiones periódicas, y **Realtime** si el tablero de ruta lo justifica. No hace falta una cola externa.
- **Riesgos:** secreto compartido (rotarlo; guardarlo solo en variables del entorno, **requiere tu aprobación para configurar variables en producción**); desfase de versión (mitigado por alerta); duplicados (idempotencia en ambos lados).
- **Cambios en Pedidos (aditivos, necesitan tu aprobación):** columnas de cliente (coordenadas, ventana de cita, vehículo calificado), las dos rutas, y la aplicación de eventos. Lo **no aditivo** (apagar `confirm_dispatch`; conflicto 3) se pide aparte.

### 4.2 Reserva: dónde nace cada una y cómo se concilian [B]
- **Pedidos gobierna la reserva comercial = «cuánto del producto está prometido»** (demanda, sin lote ni ubicación). Hoy **no existe** («ninguna reserva antes de despacho», `business-rules.md`).
- **El WMS gobierna la asignación física = «qué lote, de qué ubicación»** (`wms.reservas`: pedido-línea → celda `posición + producto + lote + propietario + estado + procedencia` + cantidad + lote asignado por FEFO y, si hubo, su cambio por la excepción).
- **Nace** cuando el pedido entra en una **ruta planificada** (RUT-03 paso 1: «ruta planificada y stock reservado»), no al importarlo: importar es solo ver demanda. En ese momento el WMS **asigna lote y ubicación a cada línea por FEFO** (§2.4) y, si una línea no alcanza, **alerta al Jefe de Transporte antes del picking**.
- **Se concilian así:** *stock vendible = saldo Aprobado en áreas Aprobados − reservas físicas del WMS − reserva comercial de Pedidos aún no importada*. Al importar un pedido, su reserva comercial se **reemplaza** por la asignación física (nunca se suman). El WMS devuelve a Pedidos «reservado por pedido» en el evento correspondiente.
- **Una sola fuente de «disponible»:** `disponible para mover` y `disponible para vender` se calculan de `wms.reservas` + movimientos internos abiertos (§2.2-3), en SQL, con candados; el TypeScript solo lo muestra.
- **Retorno reservado:** la reserva del pedido **sigue vigente** mientras el pedido siga vivo (RUT-12 paso 5), ahora sobre la celda de la zona de Retorno reservado.

### 4.3 Movimiento definitivo de stock: picking, salida, no entregado, rechazado [A: D-51 decidido; el resto B]
Se usan **tres escalones**, todos por `postear_movimiento` (transaccionales, idempotentes por token/clave):

| Evento | Qué pasa en el ledger | Por qué |
|---|---|---|
| **Asignación FEFO y reserva** (pedido asignado a una ruta planificada) | **Nada en el ledger**; filas en `asignaciones` y `reservas` | No se mueve nada físico. Las unidades siguen en su rack y salen del «disponible». |
| **Picking confirmado por línea** | Nada todavía. La tarea queda «ejecutada» y las unidades figuran **en tránsito a staging** (mismo patrón que Mover) | Respeta tu decisión D-41 («el stock cambia solo al verificar»). |
| **Conformidad de la línea** (otra persona) | `MOVIMIENTO` rack → posición de staging («pendiente de conformidad») | La verificación independiente es lo que confirma la ubicación real; igual que Mover. |
| **Salida confirmada** | `SALIDA` desde staging: partida negativa por cada lote/bulto cargado; guarda `referencia = pedido + ruta`; **definitivo** | Es lo que dice el Master/RUT-07. Hora real = hora del evento. |
| **No entregado** (retorno verificado) | `RETORNO` (nuevo tipo) a la zona Retorno reservado, **estado Aprobado**, mismo lote/propietario/procedencia; **tope: nunca más de lo que salió** y vinculado a la `SALIDA` | Es el «reingreso físico». No es ingreso nuevo: conserva trazabilidad y no crea stock de la nada. |
| **Rechazado** | `INGRESO` tipo Devolución **existente** → estado Devoluciones en Área de Devoluciones → acta organoléptica → Aprobado o Bajas/Rechazados | Tu regla cerrada (D-31). |
| **Nueva salida del mismo pedido** (reprogramado) | `SALIDA` desde la zona Retorno reservado | Misma mecánica, otra celda de origen. |

**Alternativa que descarto [B]:** modelar «En ruta» como una ubicación virtual por ruta (el stock nunca sale del ledger hasta la entrega). Es más elegante para la conservación, pero **contradice el Master** (el movimiento definitivo ocurre en «Salida confirmada») y complica el Kardex y los reportes. Si prefieres esa, es una decisión tuya.

**Decidido (D-51, Sebas, 2026-10-14):** el movimiento rack → staging se registra **cuando Conformidad verifica** (coherente con D-41); mientras tanto las unidades quedan **reservadas y visibles como «en tránsito»**. La GRE y la factura **no mueven stock**: se emiten después de la conformidad con los lotes ya confirmados.

**Garantías en base de datos (con pruebas):** no negativo en cada escalón; `RETORNO ≤ SALIDA` por pedido-lote; una `SALIDA` por bulto cargado (no se carga dos veces); idempotencia (el mismo evento enviado dos veces no duplica); reversa vinculada si se cometió un error antes del cierre de ruta; una unidad no puede estar a la vez en dos escalones.

### 4.4 Pedidos y clientes de distribución; salida de terceros [A/B]
- Los clientes **nacen en Pedidos** (hoy `public.clientes` + `pedidos.cliente_config/cliente_direcciones/cliente_contactos`). **El WMS no crea clientes**: guarda un *snapshot* del cliente en cada pedido importado (nombre, RUC, dirección y datos de entrega tal como estaban), para que el historial no cambie si el maestro cambia.
- **Salida de stock de terceros (Diphasac, AJR Labs, Medic Pharma Lab, Triamed): ahora SÍ entra al plan** (decisión del 2026-10-14; **sustituye** a «fuera de la primera fase»). Es la **salida tipo B**, con su propio diseño en §4.9. La línea, la reserva, el bulto y el movimiento llevan `propietario_id` (ya es parte de la celda de saldo) y la regla «solo se despacha stock Aprobado **del propietario de la orden**» se valida en la base de datos.

### 4.5 GRE [A/B]
No se emite ante SUNAT en las primeras fases. El WMS **registra el N.° de guía** (una sola vez, con serie-correlativo y fecha) y lo usa en la Ruta, el Pedido y el LS-FR.43.03. Si una reprogramación o cambio afecta el documento, el WMS lo marca **«por reemitir»** y deja visible el bloqueo; **no valida ni inventa reglas tributarias** (se marca «para validar con Contabilidad/facturación»). La integración Nubefact u otra va después (RUT-02 P2, roadmap del Master).

### 4.6 Transporte: roles y «Mis rutas» [B]
Roles (no nombres), ampliando `usuario_roles.rol` y `permisos_rol`; el **cargo** que se muestra sigue siendo aparte (columna `cargo`, migración 0010):

| Rol | Puede | No puede |
|---|---|---|
| `jefe_transporte` | Planificar y versionar rutas, asignar recursos, **cambiar el lote asignado** (excepción FEFO), **imprimir el paquete documental** de un pedido o ruta, recibir la alerta de stock insuficiente, autorizar excepciones de carga, **liberar unidad**, decidir incidencias que escalan, cerrar ruta, ver todo el transporte | Dar la conformidad de contenido; ajustar inventario |
| `conductor` | Ver **sus** rutas; checklist del vehículo; escanear carga; **confirmar salida**; registrar eventos y retorno de unidad; firmar el LS-FR físicamente | Liberar unidad; planificar; cerrar ruta |
| `auxiliar_transporte` | **Usuario principal en la ruta (teléfono):** «Mis rutas», Llegué, resultado, temperatura, POD, incidencias, escaneo de bultos | Liberar unidad; cerrar ruta; cambiar el plan |
| *(conformidad)* | Dar la conformidad de un pedido que **no preparó** (permiso propio `dar_conformidad`, asignable a quien corresponda; hoy Sandra) | Conformar su propio picking |
| `auxiliar` (existente) | Picking; embalaje (según estándar) | Conformidad de lo que preparó |
| `jefe_almacen` / `reemplazo_jefe` (existentes; el reemplazo es **Jasury**) | Además, **cambiar el lote asignado** por la excepción FEFO | Planificar rutas; liberar unidad |

- **Roberto (decidido, D-57):** solo `jefe_transporte`, **sin** permisos de Jefe de Almacén. El reemplazo del Jefe de Almacén es **Jasury**. **Un usuario puede tener varios roles** (la tabla `usuario_roles` ya lo permite: `unique (user_id, rol, desde)`), p. ej. quien da la conformidad y además es auxiliar.
- **Permisos por operación [B]:** hoy las acciones son 8 genéricas; para salidas conviene permisos con nombre de operación (`planificar_ruta`, `liberar_unidad`, `confirmar_salida`, `dar_conformidad`, `cambiar_lote_asignado`, `imprimir_paquete_documental`, `gestionar_documentos_regulatorios` (solo Dirección Técnica), `cerrar_ruta`, `gestionar_incidencia`…), de modo que **cada regla se pregunte por la operación y no por el rol**; así «¿quién da la conformidad?» (hoy Sandra, que es asistente de DT) se resuelve con datos, no con código.
- **Vista «Mis rutas» (móvil, prioridad de diseño):** una sola columna; la **siguiente parada** arriba y grande; botones de 48 px mínimo; secuencia de pantallas: *Llegué → resultado → temperatura (si DT lo exige) → foto del cargo → observación*; funciona con señal débil (borrador local, como el modo tabla de Mover); un teléfono personal basta (QR/cámara, sin hardware nuevo). Cada pantalla se pasa por Impeccable y Playwright en los 4 viewports.

### 4.7 Maestros: dónde viven (revisado en Pedidos, Cobranzas y Compras) [B]
| Maestro | Qué ya existe | Propuesta |
|---|---|---|
| **Clientes** | `public.clientes` (Cobranzas, fuente) + `pedidos.cliente_config`, `cliente_direcciones` (dirección, ubigeo, referencia), `cliente_contactos`. **Sin coordenadas, citas, vehículo calificado ni requisitos documentales.** | Extender **en Pedidos** (columnas aditivas; clientes nacen allí). El WMS solo lee el *snapshot*. |
| **Vehículos / personal de transporte** | `pedidos.vehicles/drivers/transporters`: **solo nombre y descripción** (sin placa ni «calificado»). Cobranzas y Compras: nada. | Maestro **en el WMS** (recurso operativo): `vehiculos` (placa, calificado, estado) y disponibilidad diaria; el personal son **usuarios con rol** (todos tienen usuario propio). No se duplica el catálogo de nombres de Pedidos: cuando Pedidos deje de despachar (conflicto 3), ese catálogo queda obsoleto. |
| **Perfil documental del cliente** (qué documentos exige: p. ej. BPM solo si lo pide) | No existe. | **En el WMS, ligado al RUC** del cliente (los clientes siguen naciendo en Pedidos; no se toca Pedidos). Ver §4.8. |
| **Códigos de producto** | `catalogo.productos.codigo` (el nuestro), `codigo_proveedor` (un texto), `codigo_bonificacion`. **No hay códigos por cliente ni varios por proveedor.** | Tabla **aditiva en el WMS** `wms.producto_codigos` (`producto_id`, `tipo` = DISTRIBUCION · PROVEEDOR · CLIENTE, `propietario_id` solo para CLIENTE, `codigo`; único por tipo + propietario + código). Se **siembra** con `codigo` y `codigo_proveedor` **sin tocar ni borrar** el catálogo; los de cliente (AJR0026…) se cargan por importación (Medic Pharma enviará los suyos). La búsqueda del WMS (producto, lote, ubicación, Ctrl+K) busca en todos; el cliente ve y busca con el suyo. |
| **Productos / lotes / propietarios** | `catalogo.productos`, `wms.lotes`, `wms.propietarios` | Se reutilizan. |

### 4.8 Paquete documental por producto (decisión 4) [A/B]
**Qué hay hoy:** solo `cert_analisis` (sí/no) en el acta organoléptica, `producto_regulatorio` (registro sanitario, `rs_vence`, `fabricante` como texto libre) y una referencia de texto `archivo_ref` en `documentos_sustento`. **No hay archivos ni Supabase Storage en el WMS.**

**Modelo propuesto [B]:**
- `wms.documentos_regulatorios` (una fila por versión, **append-only**): `tipo` (`COA` · `REGISTRO_SANITARIO` · `BPM`), alcance (`lote_id`, `producto_id` o `fabricante_id`), `archivo_ref` (ruta en un bucket **privado** de Supabase Storage), `hash`, `vigente_desde`, `vigente_hasta`, `subido_por`, `subido_en`, `reemplaza_a`. Reemplazar = nueva versión que apunta a la anterior; nada se borra.
- `wms.fabricantes`: hoy el fabricante es texto libre. Se crea el maestro (laboratorio/fabricante) y `producto_regulatorio.fabricante_id` **nullable y aditivo**; la equiparación de nombres existentes la revisa Dirección Técnica (no se adivina).
- `wms.perfil_documental_cliente` (por **RUC**): qué tipos exige el cliente (COA, registro sanitario, BPM, idioma, copias…). Lo mantienen quienes definan Calidad y Roberto; no modifica al cliente en Pedidos.
- **Quién escribe:** COA lo adjunta quien recibe (dentro del ingreso, con historial) y **solo Dirección Técnica lo reemplaza**; registro sanitario y BPM los sube y reemplaza **solo Dirección Técnica**. Se aplica en RLS y en funciones (`wms.subir_documento_regulatorio`), no solo en pantalla.
- **Paquete de un pedido:** para cada línea, el WMS toma **el lote realmente despachado** (de lo confirmado en conformidad), junta el COA de ese lote, el registro sanitario del producto y el BPM del fabricante (según lo que exige el cliente) y arma **un solo PDF ordenado** (portada con índice, luego por línea). **Paquete de una ruta** = los de sus pedidos en el orden de entrega.
- **Alertas antes de «Listo para carga»:** falta un documento exigido, o está vencido (`vigente_hasta` < hoy), o su vigencia vence antes de la entrega. Un pedido con documento faltante **no pasa a «Listo para carga»** (guard en base de datos).
- **Tecnología:** `pdf-lib` (licencia MIT) para unir PDFs y `@react-pdf/renderer` (ya usado) para portada e índice; se consulta Context7 antes de integrarlos. Archivos aceptados: PDF (imágenes JPG/PNG se convierten al subirlas) [C].
- **Costo:** **ninguno adicional**; el plan Pro de Supabase incluye Storage. Los archivos se comprimen/limitan por tamaño.
- **Límite de las pruebas:** la base local (Postgres) **no cubre Storage** ni sus políticas (ya dicho en gate-0 §G.1). Se prueban en base de datos los permisos, vigencias e historial de la tabla; las políticas del bucket se verifican en el Preview.

### 4.9 Salida tipo B: por cuenta de un cliente de almacenamiento [A/B]
**Flujo:** el cliente consulta su disponible real → emite su factura y su GRE (con su RUC como remitente) en su propio sistema → crea la **orden de salida** en el WMS con su usuario, adjunta el PDF de la GRE y registra su número → el WMS valida y **reserva** → Logisalud pica, conforma y embala (mismo flujo que A) → el cliente recoge con su transportista → **entrega al transportista del cliente** (salida confirmada).

**Diferencias con la salida A [A]:** no hay Pedidos, ni factura ni GRE de Logissa, ni FEFO (el lote lo indica el cliente), ni mínimo de 60 días; el propietario es el cliente; el LS-FR.43.03 solo si transporta Logisalud.

**Estados de la orden (del cliente) [A/C]:** `Pendiente → En preparación → Lista → Despachada → Entregada` (+ `Cancelada` [C]). *Pregunta abierta:* ¿quién marca «Entregada» cuando el transportista es del cliente?, ¿es el propio cliente?, ¿o «Despachada» ya es lo último que sabe el WMS?

**Validación al crear la orden (dominio y base de datos) [A]:** para cada línea, el lote existe, **es de ese propietario**, está Aprobado, sin bloqueo y con cantidad suficiente (descontando lo comprometido en sus órdenes en curso); si no, **avisa en ese momento**. Vencidos: solo con motivo no-venta y aprobación de DT (B.6). Una orden se puede cancelar mientras no haya empezado el picking; al cancelar se libera la reserva.

**Aislamiento entre propietarios (P0) [A]:**
- Rol `usuario_cliente` + tabla de vínculo usuario → propietario (con vigencia). Un usuario de cliente solo ve y opera el stock, lotes, órdenes, documentos y Kardex de **su** propietario.
- **En la base de datos, con RLS**, no solo en la interfaz: políticas por propietario en `saldos`, `lotes`, `movimientos`/`partidas` (vistas), órdenes, documentos y Storage; `es_usuario()` **no** cuenta al rol de cliente; las funciones `security definer` revisan el propietario; ninguna vista ni función devuelve filas de otro propietario.
- **Pruebas específicas de aislamiento** (en `tests/db`): dos propietarios, dos usuarios de cliente y un usuario de personal; cada tabla, vista y función se prueba con intentos de lectura y escritura cruzados.
- **Autenticación externa en el proyecto compartido:** ver B.2 y D-68. *Hasta que Sebas decida, no se abre ningún acceso de cliente.*

**Códigos:** cada línea de la orden guarda el producto del WMS y el código con que el cliente lo pidió (AJR0026) para que su documento y nuestra hoja coincidan.

**Entrega al transportista del cliente [A]:** registra transportista, placa y conductor (de su GRE), bultos entregados, hora y firma en pantalla de quien recoge; este evento **es la salida confirmada** y escribe la `SALIDA` en el ledger (mismo escalón que A). Los bultos se escanean como en la carga (S8).

**Ruta de Logisalud o recojo del cliente [A]:** si transporta Logisalud, aplican Ruta y LS-FR.43.03 con las filas de las órdenes B; si el cliente recoge, solo la entrega al transportista.

**Fase posterior [A]:** prellenar la orden leyendo la GRE del cliente (PDF o XML); Kardex e indicadores del cliente.

## 5. Modelo de dominio objetivo

### 5.1 Agregados y relaciones [B]
```
PedidoDespacho (snapshot de Pedidos, versionado)  1──* LineaPedido (producto, cantidad)
LineaPedido    1──* Asignacion (lote FEFO + celda) 0..1 CambioLoteExcepcion (quién, cuándo, lote anterior, lote nuevo, motivo fijo)
Asignacion     ── lote asignado (FEFO) → lote cambiado (excepción) → lote despachado
OrdenSalidaCliente (tipo B: propietario, GRE del cliente, modalidad de transporte, estado) 1──* LineaOrdenSalida (producto WMS + código del cliente, lote indicado, cantidad) ── reserva al crear · EntregaATransportista (transportista, placa, conductor, bultos, hora, firma) ── UsuarioCliente ──▶ Propietario · ProductoCodigo (DISTRIBUCION · PROVEEDOR · CLIENTE)
OrdenPicking 1──* LineaOrdenPicking (ubicación, producto, lote, vencimiento, cantidad, orden_recorrido)   ← teléfono + HOJA imprimible
DocumentoRegulatorio (COA por lote · RS por producto · BPM por fabricante; versiones con vigencia) · PerfilDocumentalCliente (por RUC) · PaqueteDocumental (PDF por pedido o ruta)
PedidoDespacho 1──* IntentoEntrega (n.º, ruta, fecha, motivo, N.° guía)   ← reprogramar crea un intento, no un pedido
LineaPedido    1──* Reserva (celda, cantidad)                              ← asignación física (Pedidos gobierna la comercial)
Ruta 1──* RutaVersion (vehículo, conductor, auxiliar, secuencia de paradas, motivo del cambio)
Ruta 1──* Parada (cliente snapshot, secuencia_plan/real, cita)  1──* EventoRuta (Llegué, resultado, temperatura, POD, hora)
Parada *──* IntentoEntrega
TareaPicking 1──* LineaPicking (celda esperada, celda real, resultado: OK / DISCREPANCIA_UBICACION / SIN_STOCK)
Conformidad  1──* LineaConformidad 1──* NoConformidad (catálogo)
Bulto (ID, «n de N», QR, sello, estado) ── pertenece a PedidoDespacho e IntentoEntrega; se escanea en carga y en retorno
ChecklistVehicular · ConciliacionCarga (pedidos y bultos esperados = cargados)
Incidencia (catálogo de causas, playbook, evidencia)  ── nace en Parada
Retorno (por bulto, verificado) ── NO_ENTREGADO → RETORNO al ledger / RECHAZADO → ingreso Devolución existente
Cargo (físico) · TareaRecuperacionCargo
RegistroLS_FR_43_03 1──* FilaLS_FR (una por parada)  ── nace al confirmar la Ruta; se enriquece; genera el PDF al cerrar
Vehiculo · DisponibilidadTransporte · TransportistaExterno · PerfilDocumental · ReglaEmbalaje · ParametrosSalidas
```
Ledger: `SALIDA` y `RETORNO` (nuevos) con `referencia_tipo = 'pedido'|'ruta'`. Todo evento es **append-only con actor y hora** (nada se edita; una corrección es un evento nuevo o una reversa vinculada).

### 5.2 Estados **por agregado** (no hay una columna `status` única)
**Master** = definido en `03_Estados_WMS` [A]. **Propuesta** = no está en el Master [C].

**Ruta (Master):** `Borrador → Planificada → Lista para carga → Liberada → En ruta → Pendiente de cierre → Cerrada`. *Propuesta:* `Cancelada` lateral.
«Lista para carga» exige que todos los pedidos requeridos estén conformes, documentados y embalados, y que la condición «lista para ejecutar» (RUT-08) esté cumplida.

**Pedido (Master):** `Asignado a Ruta → Picking en curso → Pendiente de conformidad ⇄ Observado → Conforme para despacho → Documentación completa → Listo para carga → Cargado → En ruta → (Entregado | No entregado | Rechazado)`.
- **D-60 resuelto: se sigue el Master.** «Listo para carga» exige además estar **embalado** (embalaje es posterior a la conformidad) y tener **GRE registrada** y **paquete documental completo** (sin documento faltante ni vencido).
- *Propuesta (no están en el Master):* `Elegible` (importado, antes de asignarse), `Bloqueado por stock` (sin stock suficiente: se alerta al Jefe de Transporte **antes** del picking), `Reprogramado` (de `No entregado`, vuelve a `Listo para carga` **sin repetir conformidad**), `Entregado`, `Cancelado`.

**Retorno (Master):** `Retorno reservado → (nuevo intento)`. *Propuesta:* antes, `Por verificar` (bultos, sellos) y el lateral `Bloqueado para revisión`.
**Devolución (Master):** `Pendiente evaluación organoléptica → Aprobado | Bajas/Rechazados`. Es exactamente el estado sanitario `DEVOLUCIONES` ya existente (D-31): **no se crea un estado nuevo**; solo se vincula con el rechazo y con la parada.

**Parada (no está en el Master):** `Pendiente → Llegué → Entregada | Recojo | No entregada | Rechazada` (+ `Omitida` con motivo).
**Bulto (no está en el Master):** `Creado → Sellado → En staging → Cargado → Entregado | Retornado`.
**Tarea de picking (no está en el Master):** `Pendiente → Asignada → En curso → Completa`; laterales `Con discrepancia` y `Bloqueada`.
**Orden de picking (no está en el Master):** `Generada → Asignada a picker → En curso → Completa`; laterales `Con discrepancia` y `Bloqueada`.
**Registro LS-FR.43.03 (no está en el Master):** `Base → Enriquecido → En ejecución → Completo → Generado → Archivado`.

**Cómo se validan las transiciones [A]:** funciones SQL `security definer` (no DML directo, como el resto del WMS); cada una verifica rol/permiso, estado de origen y precondiciones, registra **actor, fecha y motivo** en el historial y es **idempotente** (token o clave de evento); la interfaz solo muestra lo que la base ya garantiza.

### 5.3 Controles duplicados y estados innecesarios (crítica de los RUT) [B]
- *Tercer conteo* (conflicto 4) y *reclasificación del retorno* (conflicto 5): duplican un control o un dato.
- *Documentación revisada dos veces* (RUT-02 checklist y RUT-07 paso 7): no es duplicado si el segundo es **lectura del primero**; se construye así.
- *«Documentación completa» y «Listo para carga» como estados:* son derivables.
- *Observado:* mover físicamente el pedido a otra zona exige un movimiento más; conviene que sea un **movimiento sin verificación adicional** dentro del mismo hecho de la no conformidad (si no, la regla de dos personas obligaría a otra persona a verificar un traslado de ida y de vuelta). **Pregunta a Charlie.**
- *Riesgos operativos que el TO-BE no cierra:* conectividad en ruta; teléfonos personales (batería, cámara); un solo Jefe de Transporte como autorizador único (cuello de botella que RUT-10 ya critica); la factura de Arlette como condición de salida (si el sistema de facturación cae, la ruta no libera: ¿excepción autorizada?).

### 5.4 LS-FR.43.03 [A/B]
**Principio: el usuario genera la ruta, el WMS genera el documento.**
- Nace **al confirmar la ruta** (placa, conductor, auxiliar, fecha, clientes y orden); se enriquece con **guía y cajas** antes de salir (RUT-02/05), con **hora real de salida** (RUT-07) y con los eventos de ruta —entrega/recojo, temperatura, hora de entrega, observaciones— (RUT-09); se genera el **PDF oficial** al cierre (RUT-11): código, estructura y versión controlados, **10 filas por página**, con espacios de firma física de Conductor y DT (hasta que Calidad apruebe otra cosa).
- **Se construye parametrizable.** Las 6 definiciones de Katia quedan como parámetros **bloqueados** (visibles en la pantalla de configuración como «pendiente de DT»), y **no bloquean el resto**: significado de *USUARIO*, *N.° CAJAS* frente a bultos, método y momento de la *temperatura*, si viaja una copia física prellenada, firmas, y retención/archivo.
- **Detalles del Master (hoja `02_LS-FR43.03`):** HORA SALIDA = evento *Salida confirmada*; **HORA LLEGADA = evento *Retorno de unidad*** (llegada a Lurín, no llegada al cliente); N.° PÁG. automático (10 filas por página); temperatura **por fila**, con captura guiada en la fase 1 y datalogger solo si se valida en la fase 2; el WMS puede generar un documento **de pre-salida** (prellenado) y el **final**, según lo que decida DT sobre la copia física. El código, la versión y la vigencia (01-09-2026 a 01-09-2028) del formato son **parámetros**, para que un cambio de versión no obligue a tocar código.
- **Contrastado con el formato real (`LS-FR.43.03 Planificación de ruta.docx`):** el PDF respeta el encabezado («PLANIFICACIÓN DE RUTA», Cód. POE LS-POE.07.05, Cód. Formato LS-FR.43.03, vigencia 01-09-2026 a 01-09-2028), la tabla de 10 filas con sus columnas (N.°, CLIENTE, N.° GUÍA, N.° CAJAS, DETALLE ENTREGA/RECOJO, TEMPERATURA 15 °C–25 °C, HORA DE ENTREGA, OBSERVACIONES), las firmas CONDUCTOR y DIRECTOR TÉCNICO, el logo y el pie «Este documento no puede ser reproducido ni fotocopiado sin autorización de LOGISSA S.A.C.». **Decidido por Sebas (2026-10-14): las firmas van solo al final, en la última página, y el pie «LOGISSA S.A.C.» se mantiene tal cual.**
- **Primer entregable de este bloque:** el PDF con datos de prueba, para que Calidad valide el diseño del formato mientras se construye el resto. Hace falta el archivo real del formato (§0.3).

## 6. Plan por PRs pequeños, con dependencias reales

> Cada PR: rama propia, CI en verde antes de pedir aprobación, **Postgres 16 local (el del contenedor) y Postgres 17 en CI**, migración con «qué resuelve, SQL, riesgo, compatibilidad y reversa probada», Impeccable en cada pantalla, Playwright en 4 viewports, `decisiones-pendientes.md` y `progreso.md` al día. Las migraciones de salidas empiezan en **0011** (la 0010 está reservada al cargo y a un posible índice de volumen, Batch 4). **Nada se aplica a una base real.**
> **Orden aprobado (D-59):** S0b → S1 → S2 (sin pantallas) → Pedidos (S3) → Rutas (S4) → Picking (S5).

| PR | Qué | Depende de | Notas |
|---|---|---|---|
| **S0** | Este documento + decisiones registradas en `decisiones-pendientes.md`/`progreso.md`/`reglas-negocio.md`/`plan-batch-4.md` (PR #184) | CI en verde y tu aprobación | Solo docs |
| **S0b** | CI en Postgres 17 | S0 mergeado | Pequeño; permite ensayar en la versión de producción (el contenedor solo trae 16) |
| **S1** | **Cimientos de datos y aislamiento por propietario:** tipos `SALIDA` y `RETORNO`; áreas `EMBALAJE` y `DESPACHO` habilitadas; zonas nuevas **configurables y apagadas**; **`orden_recorrido`** por posición (columna física; piso sin niveles); **roles** `jefe_transporte`, `conductor`, `auxiliar_transporte`, **`usuario_cliente` ligado a un propietario** y «autoriza salidas sin venta»; permisos por operación (`dar_conformidad`, `cambiar_lote_asignado`, `imprimir_paquete_documental`, `gestionar_documentos_regulatorios`…); **`es_usuario()` no cuenta al cliente** y políticas por propietario con **pruebas de aislamiento** (P0); alertas dirigidas a `jefe_transporte`; `vehiculos` | S0b; **tu confirmación del cambio** | Migración 0011. **Cambió con la salida B** (antes sin rol de cliente ni aislamiento). Un usuario con varios roles. No se abre ningún acceso de cliente hasta resolver D-68 |
| **S2** | **Núcleo de stock de salidas, sin pantallas:** `reservas`, `asignaciones` y `ordenes_picking` (datos); **«disponible» y «vendible» en una sola fuente, por propietario** (saldo − comprometido); **dos modos de asignación:** **A** = FEFO entre lotes Aprobados, sin bloqueo, **no vencidos y con ≥ 60 días** (parámetro) y **B** = lote indicado por el cliente con validación completa; **reglas de vencidos** (Logissa nunca; cliente solo con motivo no-venta y aprobación de DT; salidas sin venta sin los 60 días pero nunca vencidas); cambio de lote por la excepción única; alerta de stock insuficiente **antes** del picking; propuesta de reemplazo (solo en A); escalones de §4.3 con el movimiento rack → staging **al verificar la conformidad**; invariantes (no negativo, `RETORNO ≤ SALIDA`, idempotencia) | S1 | **El PR más riesgoso; cambió con la salida B y los 60 días.** Pruebas de concurrencia y de propietario. Reajusta el «disponible» de Mover y la vista de tránsito sin romper sus pruebas |
| **S3** | **Bandeja de pedidos + puerto `FuentePedidos`:** adaptador demo y HTTP (HMAC); snapshot; versionado; alertas de cambio. **No se toca Pedidos para el FEFO.** | S1; **tu aprobación de los cambios aditivos en Pedidos** | El contrato se prueba contra un doble hasta que apruebes |
| **S6a** | **Repositorio de documentos regulatorios:** COA por lote (adjuntado en la recepción), registro sanitario por producto, BPM por fabricante (con `fabricantes`), vigencias e historial, permisos (solo DT reemplaza/sube RS y BPM), perfil documental del cliente por RUC, alertas de faltante o vencido | S1 (independiente de S3–S5) | Supabase Storage (plan Pro, sin costo adicional). Extiende de forma aditiva el ingreso (COA) |
| **S4** | **Rutas (RUT-01 y parte de 08):** planificación, versiones, compatibilidad de vehículo, corte 4 p. m., disponibilidad de personal. Al asignar un pedido a la ruta se ejecuta la asignación FEFO (S2) | S1, S3 | Registro base LS-FR.43.03 al confirmar |
| **S4b** | **LS-FR.43.03 — modelo y PDF con datos de prueba** (10 filas/página; encabezado, firmas y pie del formato real; versión y vigencia como parámetros) | S4; el formato ya está | **Se adelanta a propósito:** su bloqueo depende de personas (Katia), no de código |
| **S5** | **Picking y Conformidad (RUT-03 y 04):** orden de picking en el teléfono **y HOJA DE PICKING imprimible desde el primer día**; discrepancia ≠ sin stock; propuesta de reemplazo; conformidad con permiso propio y verificador ≠ picker; no conformidades; zona Observado | S2, S4 | Móvil primero para el picker. Colas por rol |
| **S6b** | **Documentación final (RUT-02):** checklist, **N.° de guía** registrado (GRE y factura salen de los lotes confirmados), **botón «Imprimir paquete»** (pedido o ruta, un solo PDF ordenado) y alerta antes de «Listo para carga» | S5, S6a | Sin emisión SUNAT |
| **S7** | **Embalaje y bultos (RUT-05):** ID/QR, etiquetas, staging por ruta; «Listo para carga» = conforme + embalado + GRE + paquete completo | S5, S6b | Context7 para QR/cámara |
| **S8** | **Carga y salida (RUT-07):** checklist vehicular, escaneo, conciliación, **Liberar unidad**, **Salida confirmada** (ledger `SALIDA`), Kardex con salidas | S2, S4, S7 | Aquí el stock sale de verdad. Sin integración con Odoo |
| **B1** | **Códigos de producto múltiples** (`wms.producto_codigos`: distribución, proveedor, cliente), siembra desde el catálogo sin tocarlo, importación de códigos de cliente y búsqueda por cualquiera | S2 | Aditivo; el código de proveedor nunca se elimina |
| **B2** | **Orden de salida de cliente — datos y validación:** orden y líneas, GRE adjunta (Storage) y número, **validación al crear** (lote del propietario, Aprobado, sin bloqueo, cantidad suficiente, vencidos), reserva, **disponible real**, cancelación | S1, S2, B1; **D-68 resuelto para abrir acceso real** | Sin pantallas. **Pruebas de aislamiento entre propietarios** (P0) |
| **B3** | **Vista del cliente:** su stock por lote y vencimiento (con su código), crear órdenes, seguir su estado | B2 | Impeccable + 4 viewports; móvil y PC |
| **B4** | **Picking, conformidad y embalaje para órdenes B** (sin FEFO; lote fijado) y modalidad de transporte | S5, S7, B2 | Reutiliza las colas por rol |
| **B5** | **Entrega al transportista del cliente** (transportista, placa, conductor, bultos, hora, firma en pantalla) = **salida confirmada** (`SALIDA`); ruta de Logisalud con LS-FR si aplica | S8, B4 | Cierra la salida B |
| **B6** | *(Fase posterior)* Prellenar la orden leyendo la GRE (PDF/XML); Kardex e indicadores del cliente | B5 | No se construye ahora |
| **S9** | **Mis rutas y tracking (RUT-09):** eventos, POD, temperatura (según DT), retorno de unidad | S8 | **Prioridad móvil**; el 390×844 manda |
| **S10** | **Incidencias y reprogramación (RUT-10):** catálogo, playbook, intentos | S9 | Contenido del playbook, de Roberto |
| **S11** | **Retornos y devoluciones (RUT-12):** `RETORNO`, Retorno reservado, ingreso Devolución adaptado | S8, S9, S10; respuestas de Katia | |
| **S12** | **Cierre (RUT-11):** conciliación, cargos, resumen, PDF oficial final, expediente de ruta | S9, S11, S4b | |
| **S13** | **KPI de Despacho (D1–D4 de D-44)** y grupo «Transporte y retornos» con los indicadores del Master (conflicto 17) | S8–S12 | Tiempo de preparación, OTIF, etc. |
| **S14** | **Lado Pedidos** (estado logístico, recibir eventos, apagar `confirm_dispatch` tras el corte) | Tu aprobación; S3, S8 | **No aditivo en parte** |

**Cómo queda el orden (con la salida B):** **S0b → S1 → S2** (sin pantallas; S1 y S2 ahora incluyen el aislamiento por propietario y los dos modos de asignación) → **S3** (Pedidos) → **S4** (Rutas) → **S5** (Picking y Conformidad) → S6a/S6b (documentos) → **S7** (Embalaje) → **S8** (Carga y salida A) → **B1 → B2 → B3 → B4 → B5** (salida tipo B) → S9–S14 (seguimiento, incidencias, retornos, cierre, KPI, lado Pedidos) → **paralelo con Odoo** (4 semanas). La salida B queda **después** del núcleo de picking, conformidad y despacho y **antes** del paralelo, como pediste. S6a y B1 se pueden construir en paralelo con S3–S5.

**Por qué este orden y no el de los RUT:** el repositorio sugiere empezar por lo que todo lo demás consume y se prueba sin pantallas —**el stock, las reservas y la asignación FEFO (S2)**— y no por «Rutas» (RUT-01), que es lo más visible pero lo que menos riesgo de integridad carga. El PDF del LS-FR (S4b) sube en el orden porque su bloqueo depende de personas. El repositorio de documentos (S6a) es independiente del picking y se puede construir en paralelo, y es útil desde ya porque el COA se adjunta **en la recepción**. El roadmap del Master pone Ruta, luego Almacén, Transporte y Cierre; este plan respeta esa secuencia y antepone S1 a S3, que el roadmap no menciona.

## 7. Qué falta para que empiece el código y qué sigue abierto

**Para empezar S0b → S1 → S2 no falta ninguna respuesta.** Solo falta que **#184 tenga la CI en verde y tú apruebes su merge.** Todo lo de abajo se resuelve en paralelo y **no bloquea** S0b, S1 ni S2 (donde importa, queda configurable y apagado).

### Sebas
1. **Pedidos y su módulo de despacho (D-49, conflicto 3):** ¿Pedidos deja de despachar y recibe los estados del WMS (recomendado, con *flag* hasta el corte)? Es no aditivo. Se necesita para S14, no para S1/S2.
2. **Aprobar los cambios aditivos en Pedidos** (columnas de cliente, rutas de integración, aplicación de eventos) y el **secreto HMAC en variables** (producción: solo con tu aprobación). Se necesita para S3.
3. **KPI (D-61, conflicto 17):** los 4 de D-44 en Inicio y los 12 del Master como grupo aparte. Se necesita para S13.
4. **Calendario de la consolidación de Pedidos** (afecta solo el adaptador, no el dominio).
5. **Confirmar mis interpretaciones de §2.4** (perfil documental del cliente guardado en el WMS por RUC; COA adjuntado por quien recibe y reemplazado solo por DT; «Listo para carga» exige además estar embalado).
6. **D-68 (P0): autenticación de los usuarios de cliente.** Entrarían al **mismo proyecto Supabase** que el personal; en ese proyecto, **Pedidos tiene 18 y Compras 5 políticas de lectura `using (true)`** (cualquier autenticado lee). Opciones: (a) **endurecer** esas políticas para exigir perfil de personal (cambio **no aditivo** en Pedidos y Compras, con tu aprobación y pruebas de regresión); (b) **proyecto Supabase aparte** para clientes (costo y réplica de datos); (c) **no abrir** acceso de clientes hasta consolidar y endurecer. Recomiendo **(a)**, que además ya conviene por sí misma. Sin esta decisión no abro ningún acceso de cliente (B2 en adelante); S1 y S2 avanzan.
6b. **Lo que no tengo registrado:** el ejemplo de GRE de AJR (no está en `docs/wms/referencias/`) y las instrucciones previas sobre el recorrido, las salidas sin venta y los 60 días (§2.5).
6c. **Confirmar el cambio de S1 y S2** por la salida B (§2.5) antes de empezar.
7. **Costos (ninguno se contrata sin avisarte):** hoy todo cabe en Supabase, Vercel y Resend Pro. Posibles costos menores futuros: rollos de etiquetas, capacidad de Supabase si la prueba de volumen lo pide, API de mapas y mensajería (P2).

### Katia
1. **Las definiciones del LS-FR.43.03** (hoja `08_Decisiones_DT`): significado de USUARIO; N.° CAJAS frente a bultos; método y momento de la temperatura; si viaja una copia física prellenada; **retención y archivo**; y quién firma por el Director Técnico. *(Ya decidido por Sebas: firmas solo al final, en la última página, y el pie «LOGISSA S.A.C.» tal cual.)*
1b. **Vencidos de un cliente de almacenamiento:** puede ordenar la salida de un lote vencido solo con motivo que no sea venta (destrucción, devolución al proveedor, pesquisa DIGEMID) y con tu aprobación. ¿Lo confirmas? ¿Qué documento respalda cada motivo?
2. **Zonas «Observado», «Retorno reservado» y «Pendiente de conformidad»:** tipo de área BPA (con Charlie).
3. **Tercer conteo de Transporte** (conflicto 4): ¿se elimina el día uno o tras el piloto?
4. **Solicitud de Devolución para un rechazo en ruta** (conflicto 6): ¿nace automática con autorización posterior?
5. **Reingreso de «No entregado»** (conflicto 8): ¿qué lo bloquea (sello roto, temperatura fuera de rango)? y el **«hold»** de un lote Aprobado (pendiente 3 de reglas-negocio): el FEFO ya consulta «sin bloqueo», pero **no se construye la forma de bloquear** hasta que lo decidas.
6. **Documentos regulatorios:** ¿el COA es obligatorio por cada lote?, ¿qué vigencia mínima debe tener un BPM o registro para entrar al paquete?, ¿se acepta el archivo en imagen o solo PDF?

### Charlie
1. **Recorrido real del picking** (para `orden_recorrido`): ¿el orden por defecto rack → posición → nivel sirve o hay un recorrido distinto por pasillos?
2. Ubicación física y señalización de las zonas nuevas.
3. Cuántos auxiliares por turno para picking y conformidad; estándar de embalaje por tipo de producto/destino; etiquetas de Lima (hoy no se usan).
4. ¿El traslado a la zona «Observado» necesita verificación aparte?

### Roberto
1. **Datos de clientes** (coordenadas, citas, vehículo calificado) y **perfil documental del cliente** (qué documentos exige cada uno): ¿quién los carga y desde cuándo?
2. **Playbook por causa** (RUT-10): qué resuelve Transporte solo y qué escala.
3. **«Recojo»:** ¿qué es exactamente?
4. **Excepciones al corte de las 4:00 p. m.:** ¿quién las autoriza?
5. **Green Logistics / provincia:** flujo y evidencia.
6. **Despachos parciales:** ningún RUT los describe; si falta stock en una línea, el pedido se bloquea y vuelve a Comercial. ¿Se despacha parcial alguna vez?
7. Cuál es hoy el vehículo calificado (el AS-IS menciona un Hyundai y la placa BKW757 declarada en las guías).

## 8. Por dónde empezar

1. **Ahora:** CI de #184 en verde → tu aprobación del merge.
2. **S0b** (CI en Postgres 17), pequeño y en rama propia.
3. **S1 y S2 en una rama nueva**, sin pantallas, con pruebas de concurrencia e invariantes en Postgres 16 local y 17 en CI. Es donde se juega la integridad (asignación FEFO, reservas, escalones de stock).
4. **En paralelo, sin código:** Roberto y Comercial empiezan el P0 de datos de clientes; Katia y Charlie deciden las zonas nuevas y las definiciones del LS-FR; Dirección Técnica puede ir reuniendo los COA, registros sanitarios y BPM que alimentarán el repositorio (S6a).
5. **Nada de esto toca una base real, ni Pedidos, ni producción.** Cualquier cambio en Pedidos (aditivo o no) se detiene hasta tu aprobación explícita.
