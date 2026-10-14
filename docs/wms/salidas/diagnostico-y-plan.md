# WMS — Salidas (RUT): diagnóstico y plan

> **Estado:** primera entrega, **solo documento, sin código** (2026-10-14). Nada de esto está construido ni aprobado.
> **Revisión 2 (2026-10-14):** contrastado con el **Master TO-BE v2** (subido después de la primera versión). Lo que cambió está en §0 y marcado «Master».
> **Principio rector:** el proceso gobierna al software. Si algo de aquí contradice una regla ya cerrada, **no la cambio**: la reporto (sección 2.3).
> **Arquitectura y costos (aclaración de Sebas, 2026-10-14):** se mantiene la arquitectura del WMS tal como está (Next.js en Vercel, schema `wms` en el Supabase consolidado `erp-cobranzas`, ledger append-only, `Repositorio` + demo, migraciones a mano). Cuentas disponibles: **Supabase Pro, Vercel Pro y Resend Pro**. «Sin costos adicionales» deja de ser una restricción dura: un costo menor que mejore el WMS es aceptable, **pero cada uno se anota y se avisa antes de contratarlo** (nunca se contrata en silencio).
> **Etiquetas** (se usan en todo el documento):
> **[A]** requisito confirmado del proceso (RUT o decisión tuya) · **[B]** recomendación mía · **[C]** hipótesis por validar.

## 0. Fuentes revisadas

1. **Master `LOGISALUD_RUT_TOBE_Master_v2.xlsx`: recibido y leído completo** (9 hojas de gestión + las 11 hojas RUT). Verifiqué celda por celda que **las 11 hojas RUT del Master son idénticas a la hoja `03_TO-BE` de cada RUT** (solo cambia el título): no hay contradicción Master↔RUT en los pasos del proceso. Las contradicciones nuevas están en el Master mismo y contra reglas ya cerradas (§2.3, conflictos 15 a 18).
2. Los 11 RUT, leídos completos (AS-IS, Diagnóstico, TO-BE, Implementación). Están en `docs/wms/salidas/`, no en `procesos/salidas/`. No existe RUT-06; RUT-13 quedó integrado en RUT-11; RUT-14 no se toca.
3. **El archivo del formato LS-FR.43.03 sigue sin estar en `docs/wms/formatos/`.** Tengo su mapa de campos (hoja `02_LS-FR43.03` del Master), pero para el PDF fiel hace falta el formato mismo (diseño, código y versión: el Master indica vigencia 01-09-2026 a 01-09-2028).
4. **Jerarquía aplicada:** decisiones tuyas y reglas cerradas > Master > RUT > tus aclaraciones de esta conversación > AS-IS > código. Donde el Master o un RUT choca con una regla cerrada, gana la regla y lo reporto.

## 1. Cómo entiendo el proceso de punta a punta

### 1.1 El flujo (contrastado con los 11 RUT)

```
Pedido listo (Pedidos: READY_FOR_OPERATIONS)
  │  importación idempotente → bandeja del WMS            [elegible; corte 4:00 p. m., excepciones autorizadas]
  ▼
RUT-01 Ruta planificada (ID + versión; vehículo compatible, conductor, auxiliar)  ──► crea el registro base LS-FR.43.03
  ▼
RUT-03 Picking (FEFO / lote pedido por el cliente; confirmación ubicación-producto-lote-cantidad)
  │      ├─ discrepancia de ubicación ≠ «no hay stock real» → conteo/ajuste, línea bloqueada
  │      └─ sin stock → el pedido se bloquea ANTES de emitir documentos
  ▼  zona «pendiente de conformidad»
RUT-04 Conformidad independiente (persona ≠ picker, 100 % de las unidades)
  │      └─ no conforme → zona «Observado» → corrección → se revalida
  ▼  «Conforme para despacho»  (habilita dos trabajos en paralelo)
RUT-02 Documentación final (GRE con placa y fecha reales, factura, protocolos)      RUT-05 Embalaje y bultos (ID/QR, «1 de 3»)
  └────────────────────────────┬─────────────────────────────────────────────────────┘
                               ▼  staging por ruta → «Listo para carga»
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
Nunca stock negativo · el ledger es la fuente del stock y nada se borra (reversas vinculadas) · Aprobado no vuelve a Cuarentena · devolución nunca pasa por Cuarentena (D-31) · solo se despacha stock Aprobado del propietario del pedido · quien prepara no verifica · cada ubicación tiene propietario (áreas compartidas admiten varios) · un dato se escribe una sola vez · FEFO por defecto, con lote o vencimiento pedido por línea.

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
4. **FEFO:** no existe como regla. Solo hay un orden por vencimiento al listar ubicaciones de un producto (`domain/inventario.ts:627`). Se necesita una función de selección en dominio **y** en base de datos (criterio solicitado, lote sugerido, lote despachado; lote Aprobado, sin bloqueo, con cantidad suficiente).
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
- **Se mantiene** lo ya decidido sobre la **carga inicial** (una exportación única de Odoo tras el inventario general) y el **paralelo de 4 semanas**, que solo sirve para comparar y firmar diferencias (ver `carga-inicial-odoo.md`): mientras dure, Odoo se sigue usando por el equipo; **el WMS nunca lee ni escribe en Odoo**. Si ya no quieres ese paralelo, dímelo y lo quito del plan.

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

**11. «Vencimiento mínimo del cliente» (RUT-03 paso 2)** es un dato del cliente que no existe en ninguna regla cerrada. Se suma a las reglas de FEFO como parámetro por cliente [C]. Pregunta a Roberto/Comercial.

**12. Tipos de bulto por pallet:** RUT-04 clasifica el volumen S/M/L/XL (L = 1 pallet, XL = más). S y M salen de la cantidad de bultos; **L y XL requieren marcar «pallet»**, que no es peso ni dimensión. [C] Se ofrece como casilla opcional; si no es necesaria para el ranking, se omite.

**13. Transportista externo (Green Logistics, provincia):** RUT-08 lo registra, pero RUT-07, 09, 10 y 11 solo describen reparto propio. *Hueco de proceso* (sin escaneo de carga ni POD propio). [C] Entra después; en la primera fase una ruta externa es un caso simple (pedidos, ventana de recojo, responsable y evidencia).

**14. Documentación de las reglas vs. tu mensaje:** «Roberto es Jefe de Transporte (hoy con permisos de Jefe de Almacén)» y reglas-negocio lo lista como **reemplazo de Charlie**. Si se le dan permisos propios de transporte, ¿conserva `reemplazo_jefe`? (afecta quién verifica movimientos internos). **Decide Sebas.**

**15. Master (`03_Estados_WMS`) encadena Conforme → Documentación completa → Listo para carga, y su flujo pone RUT-02 antes que RUT-05; pero RUT-04 (paso 9) y RUT-05 (paso 1) dicen que la conformidad habilita **los dos a la vez**.** *Impacto:* decide si Almacén puede embalar mientras Administración espera la factura, o si el embalaje espera a los documentos. *Alternativas:* (a) secuencia estricta del Master (más simple, más lenta); (b) **paralelo**: «Documentación completa» y «Embalado» como dos condiciones y «Listo para carga» cuando ambas se cumplen (§5.2). *Recomendación [B]:* (b), que conserva los nombres del Master. *Por jerarquía el Master gana: si no dices nada, sigo (a).* **Decide Sebas.**

**16. Estados que el Master no define y los RUT sí necesitan.** Faltan: **Bloqueado por stock** (RUT-03 paso 7), **Reprogramado** (el Master lo nombra como siguiente de «No entregado», pero sin fila), **Entregado** (se menciona en «En ruta → Llegó / Entregado», sin fila), **Cancelado**, y **todos los estados de Bulto y de Parada** (tú pediste estados por agregado, incluidos estos). Siguen en §5.2 como [C], marcados como «no están en el Master».

**17. KPI de Despacho: el Master propone 13 indicadores y D-44 (aprobada) fija 4 distintos** (OTIF, nivel de servicio, exactitud de despacho, tiempo de preparación). Solo **OTIF** coincide. *Por jerarquía gana D-44.* *Recomendación [B]:* los 4 de D-44 en Inicio/Indicadores; los 12 restantes del Master (exactitud de ubicación, picking sin discrepancias, First Pass Yield, errores detectados por Transporte, carga conciliada, salida en tiempo real, incidencias por 100 entregas, reprogramaciones por causa, cargos conciliados, LS-FR automático, tiempo de cierre, retornos segregados) como un grupo «Transporte y retornos» en Reportes. Metas: el Master dice «meta por definir», coherente con D-42 (medir un mes primero). A cada uno hay que fijarle «más es mejor / peor» (D-45): p. ej. «errores detectados por Transporte ≈ 0» y «incidencias por 100» son «menos es mejor». **Decide Sebas.**

**18. El Master nombra personas en los roles** («Roberto / Planificador de rutas», «Sandra / Conformidad», «Charlie», «Arlette»). Tu regla es roles, no nombres: los traduzco a **planificador de rutas** (`jefe_transporte`), **conformidad**, **responsable de almacén** y **administración/facturación**. Dato útil: el Master asigna hoy la conformidad a quien es asistente de Dirección Técnica; qué rol del WMS la ejerce queda abierto (D-57).

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
| 2.2 | Perfil documental por cliente/producto/lote (factura, OC, RS, BPA/BPM, COA, idioma, copias) | A | Hoy vive en la memoria de Roberto | Alta | Tabla `perfil_documental` + checklist generado por pedido. P0 de proceso: confirmar la matriz | P1 |
| 2.3 | GRE con **fecha real** y **placa del vehículo asignado** (no genérica) | A | No hay GRE; hoy se usa la placa BKW757 | Crít | **Primera fase: solo registrar N.° de guía** (tu decisión). La emisión SUNAT/Nubefact va después (P2) | P1 / P2 |
| 2.4 | Factura disponible o la liberación se bloquea | A | La factura vive en Pedidos (`facturas_emitidas`) / facturación | Alta | Evento «factura disponible» desde Pedidos (§4.1); el WMS no factura | P1 |
| 2.5 | Retroalimentar Ruta y LS-FR con el N.° de guía (una sola vez) | A | — | Alta | Se escribe en `pedido_documentos`; la ruta y el LS-FR lo **leen** | P0 |
| 2.6 | «Documentación completa» solo con todos los obligatorios; faltante = bloqueo visible | A | — | Alta | Estado derivado, no una columna | P1 |
| 2.7 | Impresión por lote de la ruta | A (P2) | — | Media | Después | P2 |

### RUT-03 Picking
| # | Requerimiento | Fuente | Gap | Sev | Cambio | Pri |
|---|---|---|---|---|---|---|
| 3.1 | Tareas de picking desde la ruta planificada, con stock reservado | A | No existe | Crít | `reservas` + `tareas_picking`. Reserva física nace al planificar (§4.2) | P0 |
| 3.2 | FEFO + vencimiento mínimo del cliente + múltiples lotes; **criterio pedido por línea** (lote o vencimiento más lejano) | A (tu regla) + C (mínimo del cliente) | No hay FEFO. Solo un orden por vencimiento en la búsqueda | Crít | Función `sugerir_lotes()` en dominio **y** DB; guardar criterio solicitado, sugerido y despachado; respetar solo si es Aprobado, sin bloqueo y con cantidad suficiente | P0 |
| 3.3 | Asignar picker y registrar responsable/hora de inicio | A | — | Alta | Patrón `ordenes_movimiento` (ejecutor) | P1 |
| 3.4 | Confirmar línea por línea (ubicación-producto-lote-cantidad); escaneo si se puede | A | No hay escaneo; el equipo usa **teléfonos personales** | Alta | Confirmación guiada primero; escaneo con la cámara (Context7 para la librería) P2 | P1 |
| 3.5 | **Discrepancia de ubicación** ≠ «no hay stock real»; consultar alternativas autorizadas; sin búsqueda abierta | A | — | Crít | Dos resultados distintos en la tarea; la línea queda bloqueada y se deriva a conteo (INV-05) | P0 |
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

## 4. Respuestas propuestas a los 7 puntos de arquitectura

### 4.1 Integración con Pedidos (otro proyecto Supabase) [B]
**Hechos:** Pedidos vive en `Logisalud_pedidos` (`dfqhxwkdflnkcjnysbwu`); el WMS, en `erp-cobranzas`. **Pedidos está planificado para consolidarse** en erp-cobranzas (`plan-unificacion-pedidos.md`, migraciones 1000+, D-39), pero todavía no. Un diseño que dependa de estar en proyectos distintos se rompe al consolidar.

**Propuesta: un puerto con dos adaptadores.** El WMS define un puerto `FuentePedidos` (como ya hace con `Repositorio`); la lógica no sabe de dónde vienen los datos.
- **Adaptador HTTP (hoy):** Pedidos expone **dos rutas** protegidas por **firma HMAC** (secreto compartido y rotable; sin service role del otro proyecto, sin exponer tablas):
  - `GET …/integracion/wms/pedidos-listos` → pedidos `READY_FOR_OPERATIONS` con *snapshot* (cliente, dirección, coordenadas, citas, vehículo calificado, líneas, criterio de lote, factura/condición, versión).
  - `POST …/integracion/wms/eventos` → recibe eventos de salida del WMS (§4.4).
- **Adaptador SQL (tras consolidar):** una vista y una función en el mismo proyecto. Cambia el adaptador, no el dominio.
- **Dirección «entrada» (Pedidos → WMS): *pull* idempotente.** El WMS consulta (al abrir la bandeja y por una tarea programada) y hace `upsert` por `(pedido_id, versión)` en `wms.pedidos_despacho`. Reintentar nunca duplica. Si Pedidos no responde, el WMS sigue operando con lo ya importado y la bandeja muestra «última actualización hace X». Un pedido modificado en Pedidos después de importarse genera una nueva versión y **alerta** al planificador (no se pisa en silencio).
- **Dirección «salida» (WMS → Pedidos): *outbox*.** Cada evento relevante se escribe en `wms.eventos_salida` **en la misma transacción** que el cambio de estado, con clave de idempotencia (`pedido + tipo + intento`); un despachador los envía con reintentos y backoff. Si Pedidos está caído, nada se pierde ni bloquea el almacén; al volver, se entregan en orden. Pedidos aplica cada evento una sola vez (guarda la clave).
- **Stock vendible (INV-01, hoy carga manual diaria desde Odoo, que el WMS reemplaza):** el WMS publica `GET …/wms/api/stock-vendible` (también HMAC) con producto/lote/vencimiento/cantidad **vendible**; el importador que Pedidos ya tiene para `stock_lotes` lo consume en lugar del Excel. Es el reemplazo natural del paso manual. *Depende de que el stock del WMS sea real (carga inicial, hoy postergada hasta que existan salidas).*
- **Costo:** **ninguno nuevo**, todo cabe en lo que ya pagas: rutas serverless y **Vercel Cron** (Vercel Pro) para la importación programada; **Resend** para avisos por correo (pedido cambiado tras importarse, retorno sin ubicar, ruta pendiente de cierre); en Supabase Pro, `pg_cron` para los despachadores y revisiones periódicas, y **Realtime** si el tablero de ruta lo justifica. No hace falta una cola externa.
- **Riesgos:** secreto compartido (rotarlo; guardarlo solo en variables del entorno, **requiere tu aprobación para configurar variables en producción**); desfase de versión (mitigado por alerta); duplicados (idempotencia en ambos lados).
- **Cambios en Pedidos (aditivos, necesitan tu aprobación):** columnas de cliente (coordenadas, ventana de cita, vehículo calificado, mínimo de vencimiento), las dos rutas, y la aplicación de eventos. Lo **no aditivo** (apagar `confirm_dispatch`; conflicto 3) se pide aparte.

### 4.2 Reserva: dónde nace cada una y cómo se concilian [B]
- **Pedidos gobierna la reserva comercial = «cuánto del producto está prometido»** (demanda, sin lote ni ubicación). Hoy **no existe** («ninguna reserva antes de despacho», `business-rules.md`).
- **El WMS gobierna la asignación física = «qué lote, de qué ubicación»** (`wms.reservas`: pedido-línea → celda `posición + producto + lote + propietario + estado + procedencia` + cantidad + criterio solicitado).
- **Nace** cuando el pedido entra en una **ruta planificada** (RUT-03 paso 1: «ruta planificada y stock reservado»), no al importarlo: importar es solo ver demanda.
- **Se concilian así:** *stock vendible = saldo Aprobado en áreas Aprobados − reservas físicas del WMS − reserva comercial de Pedidos aún no importada*. Al importar un pedido, su reserva comercial se **reemplaza** por la asignación física (nunca se suman). El WMS devuelve a Pedidos «reservado por pedido» en el evento correspondiente.
- **Una sola fuente de «disponible»:** `disponible para mover` y `disponible para vender` se calculan de `wms.reservas` + movimientos internos abiertos (§2.2-3), en SQL, con candados; el TypeScript solo lo muestra.
- **Retorno reservado:** la reserva del pedido **sigue vigente** mientras el pedido siga vivo (RUT-12 paso 5), ahora sobre la celda de la zona de Retorno reservado.

### 4.3 Movimiento definitivo de stock: picking, salida, no entregado, rechazado [B]
Recomiendo **tres escalones**, todos por `postear_movimiento` (transaccionales, idempotentes por token/clave):

| Evento | Qué pasa en el ledger | Por qué |
|---|---|---|
| **Reserva** (ruta planificada) | **Nada en el ledger**; fila en `reservas` | No se mueve nada físico. Las unidades siguen en su rack y salen del «disponible». |
| **Picking confirmado por línea** | Nada todavía. La tarea queda «ejecutada» y las unidades figuran **en tránsito a staging** (mismo patrón que Mover) | Respeta tu decisión D-41 («el stock cambia solo al verificar»). |
| **Conformidad de la línea** (otra persona) | `MOVIMIENTO` rack → posición de staging («pendiente de conformidad») | La verificación independiente es lo que confirma la ubicación real; igual que Mover. |
| **Salida confirmada** | `SALIDA` desde staging: partida negativa por cada lote/bulto cargado; guarda `referencia = pedido + ruta`; **definitivo** | Es lo que dice el Master/RUT-07. Hora real = hora del evento. |
| **No entregado** (retorno verificado) | `RETORNO` (nuevo tipo) a la zona Retorno reservado, **estado Aprobado**, mismo lote/propietario/procedencia; **tope: nunca más de lo que salió** y vinculado a la `SALIDA` | Es el «reingreso físico». No es ingreso nuevo: conserva trazabilidad y no crea stock de la nada. |
| **Rechazado** | `INGRESO` tipo Devolución **existente** → estado Devoluciones en Área de Devoluciones → acta organoléptica → Aprobado o Bajas/Rechazados | Tu regla cerrada (D-31). |
| **Nueva salida del mismo pedido** (reprogramado) | `SALIDA` desde la zona Retorno reservado | Misma mecánica, otra celda de origen. |

**Alternativa que descarto [B]:** modelar «En ruta» como una ubicación virtual por ruta (el stock nunca sale del ledger hasta la entrega). Es más elegante para la conservación, pero **contradice el Master** (el movimiento definitivo ocurre en «Salida confirmada») y complica Kardex y el reporte contra Odoo. Si prefieres esa, es una decisión tuya.

**Decisión que te pido (Sebas):** si el movimiento rack → staging debe esperar la verificación de Conformidad (recomendado, coherente con D-41) o registrarse apenas el picker confirma (más fiel a lo físico, pero se escribe en el ledger algo que nadie ha verificado).

**Garantías en base de datos (con pruebas):** no negativo en cada escalón; `RETORNO ≤ SALIDA` por pedido-lote; una `SALIDA` por bulto cargado (no se carga dos veces); idempotencia (el mismo evento enviado dos veces no duplica); reversa vinculada si se cometió un error antes del cierre de ruta; una unidad no puede estar a la vez en dos escalones.

### 4.4 Pedidos y clientes de distribución; salida de terceros [A/B]
- Los clientes **nacen en Pedidos** (hoy `public.clientes` + `pedidos.cliente_config/cliente_direcciones/cliente_contactos`). **El WMS no crea clientes**: guarda un *snapshot* del cliente en cada pedido importado (nombre, RUC, dirección y datos de entrega tal como estaban), para que el historial no cambie si el maestro cambia.
- **Salida de stock de terceros** (Diphasac, AJR Labs, Triamed, Medic Pharma Lab): **fuera de la primera fase** [A]. Se deja preparado: cada línea de pedido, reserva, bulto y movimiento lleva `propietario_id` (ya es parte de la celda de saldo); la regla «solo se despacha stock Aprobado **del propietario del pedido**» ya se valida en la base de datos. Se anota como pendiente (D-5x, abajo).

### 4.5 GRE [A/B]
No se emite ante SUNAT en las primeras fases. El WMS **registra el N.° de guía** (una sola vez, con serie-correlativo y fecha) y lo usa en la Ruta, el Pedido y el LS-FR.43.03. Si una reprogramación o cambio afecta el documento, el WMS lo marca **«por reemitir»** y deja visible el bloqueo; **no valida ni inventa reglas tributarias** (se marca «para validar con Contabilidad/facturación»). La integración Nubefact u otra va después (RUT-02 P2, roadmap del Master).

### 4.6 Transporte: roles y «Mis rutas» [B]
Roles (no nombres), ampliando `usuario_roles.rol` y `permisos_rol`; el **cargo** que se muestra sigue siendo aparte (columna `cargo`, migración 0010):

| Rol | Puede | No puede |
|---|---|---|
| `jefe_transporte` | Planificar y versionar rutas, asignar recursos, autorizar excepciones de carga, **liberar unidad**, decidir incidencias que escalan, cerrar ruta, ver todo el transporte | Dar la conformidad de contenido; ajustar inventario |
| `conductor` | Ver **sus** rutas; checklist del vehículo; escanear carga; **confirmar salida**; registrar eventos y retorno de unidad; firmar el LS-FR físicamente | Liberar unidad; planificar; cerrar ruta |
| `auxiliar_transporte` | **Usuario principal en la ruta (teléfono):** «Mis rutas», Llegué, resultado, temperatura, POD, incidencias, escaneo de bultos | Liberar unidad; cerrar ruta; cambiar el plan |
| *(conformidad)* | Dar la conformidad de un pedido que **no preparó** | Conformar su propio picking |
| `auxiliar` (existente) | Picking; embalaje (según estándar) | Conformidad de lo que preparó |

- **Roberto (Jefe de Transporte):** pasaría a `jefe_transporte`; si conserva `reemplazo_jefe` para almacén es una decisión tuya (conflicto 14).
- **Permisos por operación [B]:** hoy las acciones son 8 genéricas; para salidas conviene permisos con nombre de operación (`planificar_ruta`, `liberar_unidad`, `confirmar_salida`, `dar_conformidad`, `cerrar_ruta`, `gestionar_incidencia`…), de modo que **cada regla se pregunte por la operación y no por el rol**; así «¿quién da la conformidad?» (hoy Sandra, que es asistente de DT) se resuelve con datos, no con código.
- **Vista «Mis rutas» (móvil, prioridad de diseño):** una sola columna; la **siguiente parada** arriba y grande; botones de 48 px mínimo; secuencia de pantallas: *Llegué → resultado → temperatura (si DT lo exige) → foto del cargo → observación*; funciona con señal débil (borrador local, como el modo tabla de Mover); un teléfono personal basta (QR/cámara, sin hardware nuevo). Cada pantalla se pasa por Impeccable y Playwright en los 4 viewports.

### 4.7 Maestros: dónde viven (revisado en Pedidos, Cobranzas y Compras) [B]
| Maestro | Qué ya existe | Propuesta |
|---|---|---|
| **Clientes** | `public.clientes` (Cobranzas, fuente) + `pedidos.cliente_config`, `cliente_direcciones` (dirección, ubigeo, referencia), `cliente_contactos`. **Sin coordenadas, citas, vehículo calificado ni requisitos documentales.** | Extender **en Pedidos** (columnas aditivas; clientes nacen allí). El WMS solo lee el *snapshot*. |
| **Vehículos / personal de transporte** | `pedidos.vehicles/drivers/transporters`: **solo nombre y descripción** (sin placa ni «calificado»). Cobranzas y Compras: nada. | Maestro **en el WMS** (recurso operativo): `vehiculos` (placa, calificado, estado) y disponibilidad diaria; el personal son **usuarios con rol** (todos tienen usuario propio). No se duplica el catálogo de nombres de Pedidos: cuando Pedidos deje de despachar (conflicto 3), ese catálogo queda obsoleto. |
| **Perfil documental** (qué documentos exige cada cliente/producto/lote) | No existe. | Maestro **en el WMS** (lo operan Almacén y Calidad). |
| **Productos / lotes / propietarios** | `catalogo.productos`, `wms.lotes`, `wms.propietarios` | Se reutilizan. |

## 5. Modelo de dominio objetivo

### 5.1 Agregados y relaciones [B]
```
PedidoDespacho (snapshot de Pedidos, versionado)  1──* LineaPedido (producto, cantidad, criterio_lote, lote_sugerido, lote_despachado)
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
- *Conflicto 15:* el Master los encadena; RUT-04/05 los habilitan a la vez. Por jerarquía, se sigue el Master salvo que decidas el paralelo.
- *Propuesta (no están en el Master):* `Elegible` (importado, antes de asignarse), `Bloqueado por stock`, `Reprogramado` (de `No entregado`, vuelve a `Listo para carga` **sin repetir conformidad**), `Entregado`, `Cancelado`.

**Retorno (Master):** `Retorno reservado → (nuevo intento)`. *Propuesta:* antes, `Por verificar` (bultos, sellos) y el lateral `Bloqueado para revisión`.
**Devolución (Master):** `Pendiente evaluación organoléptica → Aprobado | Bajas/Rechazados`. Es exactamente el estado sanitario `DEVOLUCIONES` ya existente (D-31): **no se crea un estado nuevo**; solo se vincula con el rechazo y con la parada.

**Parada (no está en el Master):** `Pendiente → Llegué → Entregada | Recojo | No entregada | Rechazada` (+ `Omitida` con motivo).
**Bulto (no está en el Master):** `Creado → Sellado → En staging → Cargado → Entregado | Retornado`.
**Tarea de picking (no está en el Master):** `Pendiente → Asignada → En curso → Completa`; laterales `Con discrepancia` y `Bloqueada`.
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
- **Primer entregable de este bloque:** el PDF con datos de prueba, para que Calidad valide el diseño del formato mientras se construye el resto. Hace falta el archivo real del formato (§0.3).

## 6. Plan por PRs pequeños, con dependencias reales

> Cada PR: rama propia, CI en verde antes de pedir aprobación, **solo Postgres local (16 en el contenedor) y Postgres 17 en CI**, migración con «qué resuelve, SQL, riesgo, compatibilidad y reversa probada», Impeccable en cada pantalla, Playwright en 4 viewports, `decisiones-pendientes.md` y `progreso.md` al día. Las migraciones de salidas empiezan en **0011** (la 0010 está reservada al cargo y a un posible índice de volumen, Batch 4). **Nada se aplica a una base real.**

| PR | Qué | Depende de | Notas |
|---|---|---|---|
| **S0** | Este documento + decisiones registradas en `decisiones-pendientes.md`/`progreso.md`/`reglas-negocio.md` | Tu aprobación del diagnóstico | Solo docs |
| **S0b** | CI en Postgres 17 | — | Pequeño; permite ensayar en la versión de producción |
| **S1** | **Cimientos de datos:** tipos `SALIDA`/`RETORNO`; áreas `EMBALAJE`/`DESPACHO` habilitadas; zonas nuevas **configurables** (sin activar hasta la respuesta de Katia/Charlie); roles `jefe_transporte`, `conductor`, `auxiliar_transporte` y permisos por operación; `vehiculos` | Decisiones 2.3-7 y 2.3-14 (puede avanzar con lo configurable) | Migración 0011. Tests de base de datos |
| **S2** | **Núcleo de stock de salidas:** `reservas`, «disponible/vendible» en una sola fuente, **FEFO** (dominio + DB, criterio solicitado/sugerido/despachado), escalones de §4.3, invariantes (no negativo, `RETORNO ≤ SALIDA`, idempotencia) | S1 | **El PR más riesgoso y el primero con lógica.** Sin pantallas. Concurrencia probada. Reajusta el cálculo de «disponible» de Mover (no debe romper sus 180 pruebas) |
| **S3** | **Bandeja de pedidos + puerto `FuentePedidos`:** adaptador demo y adaptador HTTP (HMAC); snapshot; versionado; alertas de cambio | S1; **tu aprobación de los cambios aditivos en Pedidos** | Sin tocar Pedidos hasta aprobar; el contrato se prueba contra un doble |
| **S4** | **Rutas (RUT-01 y parte de 08):** planificación, versiones, compatibilidad de vehículo, corte 4 p. m., disponibilidad de personal | S1, S3 | Registro base LS-FR.43.03 al confirmar |
| **S4b** | **LS-FR.43.03 — modelo y PDF con datos de prueba** (10 filas/página) | S4; archivo del formato | **Se adelanta a propósito:** es el entregable regulatorio crítico y sus 6 definiciones dependen de Katia; que lo vea cuanto antes |
| **S5** | **Picking (RUT-03) y Conformidad (RUT-04):** colas por rol, discrepancia ≠ sin stock, bloqueo por stock, no conformidades, zona Observado | S2, S3 (**no** necesita S4 si se acepta un arranque temporal sin ruta: opción a decidir) | Móvil primero para el picker |
| **S6** | **Documentación (RUT-02):** perfil documental, checklist, N.° de guía manual | S5 | Sin emisión GRE |
| **S7** | **Embalaje y bultos (RUT-05):** ID/QR, etiquetas, staging por ruta | S5 | Context7 para QR/cámara |
| **S8** | **Carga y salida (RUT-07):** checklist vehicular, escaneo, conciliación, **Liberar unidad**, **Salida confirmada** (ledger `SALIDA`), Kardex con salidas | S2, S4, S6, S7 | Aquí el stock sale de verdad |
| **S9** | **Mis rutas y tracking (RUT-09):** eventos, POD, temperatura (según DT), retorno de unidad | S8 | **Prioridad móvil**; el 390×844 manda |
| **S10** | **Incidencias y reprogramación (RUT-10):** catálogo, playbook, intentos | S9 | Contenido del playbook, de Roberto |
| **S11** | **Retornos y devoluciones (RUT-12):** `RETORNO`, Retorno reservado, ingreso Devolución adaptado | S8, S9, S10; respuestas de Katia | |
| **S12** | **Cierre (RUT-11):** conciliación, cargos, resumen, PDF oficial final, expediente de ruta | S9, S11, S4b | |
| **S13** | **KPI de Despacho (D1–D4 de D-44)** y grupo «Transporte y retornos» con los indicadores del Master (conflicto 17) | S8–S12 | Tiempo de preparación, OTIF, etc. |
| **S14** | **Lado Pedidos** (estado logístico, recibir eventos, apagar `confirm_dispatch` tras el corte) | Tu aprobación; S3, S8 | **No aditivo en parte** |

**Por qué este orden y no el de los RUT:** el repositorio sugiere empezar por lo que todo lo demás consume y es testeable sin pantallas —**el stock y las reservas (S2)**— y no por «Rutas» (RUT-01), que es lo más visible pero lo que menos riesgo de integridad carga. El PDF del LS-FR (S4b) sube en el orden porque su bloqueo depende de personas, no de código. Y **Picking no necesita realmente la ruta** (solo el pedido y su stock): si prefieres operar Picking/Conformidad antes de tener Rutas, la dependencia de S5 con S4 se puede relajar (cambia el TO-BE: pregunta tuya).

## 7. Preguntas que bloquean de verdad (por quién decide)

### Sebas
1. **Sube también el archivo del formato LS-FR.43.03** a `docs/wms/formatos/` (el Master ya está; falta el formato mismo para el PDF fiel).
2. **Pedidos y su módulo de despacho** (conflicto 3): ¿Pedidos deja de despachar y recibe los estados del WMS (recomendado, con *flag* hasta el corte)? Es no aditivo.
3. **Aprobar los cambios aditivos en Pedidos** (columnas de cliente, rutas de integración, aplicación de eventos) y **el secreto HMAC en variables** (producción: solo con tu aprobación).
4. ~~Odoo durante el paralelo~~ **Resuelto: Odoo desaparece y no se integra.** Solo confírmame si el paralelo de 4 semanas (solo comparar) sigue.
5. **Escalón rack → staging:** ¿al verificar la conformidad (recomendado) o al confirmar el picker? (§4.3)
6. **Roberto:** ¿conserva `reemplazo_jefe` además de `jefe_transporte`? (conflicto 14)
7. **¿Picking antes que Rutas?** (§6, S5/S4). El roadmap del Master pone Ruta primero, luego Almacén, Transporte y Cierre; mi orden respeta esa secuencia pero antepone S1–S3 (datos, stock, pedidos) que el roadmap no menciona.
7b. **Conflicto 15** (secuencia o paralelo de documentación y embalaje) y **conflicto 17** (los 4 KPI de D-44 + los 12 del Master como grupo aparte).
8. **Calendario de la consolidación de Pedidos** (afecta solo el adaptador, no el dominio).
9. **Costos (ninguno se contrata sin avisarte):** dentro de lo que ya pagas están Storage para las fotos de POD, Vercel Cron, `pg_cron`, Realtime y Resend. **Costos menores que podrían convenir:** impresora/rollos de etiquetas para los QR de Lima; compute adicional de Supabase si la prueba de volumen lo pide; una API de mapas/geocodificación para coordenadas de clientes y ruteo asistido (P2); mensajería a clientes (WhatsApp/SMS) en P2. Te los presento con precio estimado cuando toque cada uno.

### Katia
1. **Las 6 definiciones del LS-FR.43.03:** significado de USUARIO; N.° CAJAS frente a bultos; método y momento de la temperatura; si viaja una copia física prellenada; firmas; retención y archivo.
2. **Zonas «Observado» y «Retorno reservado»:** tipo de área BPA (con Charlie) y si «pendiente de conformidad» es Despacho.
3. **Tercer conteo de Transporte** (conflicto 4): ¿se elimina el día uno o tras el piloto?
4. **Solicitud de Devolución para un rechazo en ruta** (conflicto 6): ¿nace automática con autorización posterior?
5. **Reingreso de «No entregado»** (conflicto 8): ¿qué lo bloquea (sello roto, temperatura fuera de rango) y el **«hold»** (pendiente 3 de reglas-negocio)?
6. **Mínimo de vencimiento por cliente** y estándar de embalaje de frágiles (con Charlie).

### Charlie
1. Ubicación física de las zonas nuevas y cómo se señalizan.
2. ¿**Quién da la conformidad** (rol) y cuántos auxiliares por turno para picking/conformidad?
3. Estándar de embalaje por tipo de producto/destino; etiquetas de Lima (hoy no se usan).
4. ¿El traslado a la zona «Observado» necesita verificación aparte?

### Roberto
1. **Datos de clientes** (coordenadas, citas, vehículo calificado): ¿quién los carga y desde cuándo? (P0 de datos de RUT-01 y 08)
2. **Playbook por causa** (RUT-10): qué resuelve Transporte solo y qué escala.
3. **«Recojo»**: ¿qué es exactamente?
4. **Excepciones al corte de las 4:00 p. m.**: ¿quién las autoriza?
5. **Green Logistics / provincia:** flujo y evidencia.
6. Cuál es hoy el vehículo calificado (el AS-IS menciona un Hyundai y la placa BKW757 declarada en las guías).

## 8. Por dónde empezar

1. **Hoy:** que revises este documento y respondas lo marcado a **Sebas** (en particular 2, 4, 5 y 7b: definen el diseño del stock y de los estados).
2. **Primer PR después de tu aprobación: S0 (docs) + S0b (CI en Postgres 17).** Son baratos y desbloquean todo.
3. **Primer PR de código: S1 + S2**, es decir, **los cimientos de datos y el núcleo de stock de salidas**, sin pantallas, con pruebas de concurrencia y de invariantes en Postgres 16 local y 17 en CI. Es donde se juega la integridad; conviene verlo antes de levantar una sola pantalla.
4. **En paralelo, desde ya (sin código):** que Roberto empiece el P0 de datos de clientes y que Katia y Charlie decidan las zonas nuevas, porque son lo que más tarda.
5. **Nada de esto toca una base real, ni Pedidos, ni producción.** Cualquier cambio en Pedidos (aditivo o no) se detiene hasta tu aprobación explícita.
