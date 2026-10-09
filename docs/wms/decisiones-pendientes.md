# WMS — Decisiones pendientes

Cada decisión bloquea **solo su pieza**; el resto sigue. Tipo: N = negocio, S = sanitaria,
R = regulatoria, D = datos, O = operativa/permiso.
Actualizado: 2026-10-09 (D-39 registrada; PR #169 aprobado y mergeado; autoridad de ajustes confirmada: solo Katia) · 2026-10-08 (Batch 1 aprobado; addendum de ingreso D-31..D-35; decisiones de Sebas D-11/12/13/15/28b/29/30 resueltas; D-36 en dos fases y D-37 nuevas; D-38 propuesta).

**Ninguna decisión abierta impide el Batch 1.** El Gate 0 fue confirmado y el Batch 1 está en curso.

## Abiertas

| ID | Tipo | Tema | Pieza que bloquea | ¿Bloquea Batch 1? | Propuesta mientras tanto | Decide |
|---|---|---|---|---|---|---|
| D-01 | S | **Preguntar a Katia — prioridad.** Compra a Diphasac de stock ya guardado: ¿nace en Cuarentena o conserva Aprobado? | Ingreso de compra a Diphasac | No | **Se mantiene el supuesto: nace en Cuarentena** | Katia |
| D-36 | O | **Aprobado en dos fases (2026-10-08).** El dueño de la cantidad física es el WMS. **Fase 1:** Compras muestra, junto a su campo de recepción, la cantidad confirmada en el WMS (**solo lectura**, vista aditiva del WMS). **Fase 2:** Compras toma la cantidad del WMS automáticamente y se **elimina la copia manual**. **Se implementan después del Batch 3 y antes de la salida a producción.** Nada de esto está implementado; entre tanto sigue la copia manual con conciliación (OK / FALTA / NO COINCIDE). Detalle y qué cambia para Compras en `integracion-wms-compras.md` | Integración WMS → Compras | No | Copia manual + conciliación y alertas | Sebas (aprobó el enfoque); implementar tras el Batch 3 con aprobación del cambio en Compras |
| D-38 | O | **Presentación y principio activo** siguen viviendo **solo** en `catalogo.productos` (sin duplicar). Compras los puede llenar **al crear** un producto; después de creado, **solo Katia y Sandra** los editan, desde la ficha del WMS, con el mismo historial (campo, antes, después, usuario, fecha, motivo obligatorio). **Aprobado el enfoque; NO implementado:** antes hay que aprobar los cambios de permisos en Compras (ver `propuesta-presentacion-principio-activo.md`) | Edición de presentación y principio activo en el WMS | No | Se muestran en solo lectura | Sebas (aprobar la propuesta de permisos) |
| D-39 | O | **Consolidación de Pedidos en `erp-cobranzas` (decidido 2026-10-09).** Cuando Pedidos se consolide, **su importador (listas de precios) y su edición de productos no deben escribir presentación ni principio activo** en `catalogo.productos`: el trigger de D-38 (`proteger_presentacion_principio`, migración 0008) rechaza ese cambio a toda sesión de aplicación (`authenticated`/`anon`); solo lo permiten `postgres`/`service_role` (cargas) y `wms.editar_regulatorio` (Katia y Sandra, con historial). Hoy ningún proceso automático los escribe, así que no hay conflicto; el conflicto aparecería con esa consolidación. | Consolidación de Pedidos (fase futura) | No | Al planear esa fase: quitar esas dos columnas del importador y de la edición de productos de Pedidos (o hacerlos solo al crear) y probar contra el trigger | Sebas |
| D-42 | N | **Metas y semáforos de los KPI** (`kpis.md`). **Decidido (2026-10-09, Sebas):** no se definen todavía. Los KPI se **miden durante un mes con operación real** y después se fijan metas con Katia y Charlie. Mientras tanto se muestran valores sin meta ni color. | Semáforos en reportes | No | Sin metas; medir un mes | Katia y Charlie (tras el mes de medición) |
| D-43 | O | **Prueba de volumen y paginación en servidor** de los reportes y del modo tabla. **Decidido (2026-10-09, Sebas):** se resuelve en el **Batch 4**, junto con la prueba de volumen con la base de datos real que enviará Sebas. Hoy los reportes filtran en el navegador (hasta ~2 000–5 000 filas) y la descarga trae todo. | Reportes grandes | No | «Ver más» en pantalla; descarga completa | Batch 4 |
| D-06 | D | E-9.1 y E-10.1 de Logissa | Carga de posiciones | No | Se crean de Logissa, "por verificar" | Charlie |
| D-08 | S | A-13.1, J-11.1, J-11.3, J-13.4: Odoo las trae en Stock; topología las pone en otra área | Carga inicial (Batch 3) | No | Área de topología; stock existente sin confirmar | Katia |
| D-09 | S | Estado sanitario del stock inicial de Odoo (supuesto: Aprobado) | Carga inicial en real (Batch 3) | No | La herramienta no confirma sin decisión | Katia |
| D-10 | R | Adenda AJR: solo se ve la firma de Logissa; el punto SEGUNDO no tiene contenido | Vigencia de AJR | No | Se registra "por confirmar firma" | Sebas |
| D-17 | S | **Siguen abiertos para Katia:** hold, documentos de baja, contramuestra, muestreo √n+1 y la práctica de «Calidad». Pendientes 2–7 de reglas-negocio.md (destino de rechazados, hold, documentos de baja, contramuestra, muestreo, "Calidad") | Cada pieza respectiva (Batch 2/3) | No | No se implementan; muestreo parametrizado | Katia |
| D-22 | O | Exponer el schema `wms` en Data API y registrarlo en `schemas_compras_y_pagos()` | Pruebas contra Supabase real | No (con Postgres local no hace falta) | Pendiente | Sebas |
| D-23 | O | Fila en `public.modulos` y rewrite `/wms` en cobranzas | Acceso desde erp.logisalud.com | No | No se toca | Sebas |
| D-26 | N | Exportación de Odoo con stock real (producto, lote, vencimiento, cantidad por ubicación): no está en el repo; el Excel de `layouts/` es solo el árbol de ubicaciones | Carga inicial en real (Batch 3) | No | Herramienta con datos de prueba | Sebas |

## Resueltas (2026-10-08, decisiones de Sebas)

| ID | Resolución | Dónde quedó |
|---|---|---|
| D-31 *(ratificada)* | Se **mantiene el estado `DEVOLUCIONES`**: las devoluciones nacen ahí, nunca pasan por Cuarentena y su acta organoléptica las lleva a Aprobado o Bajas/Rechazados. **El origen del ingreso es un dato separado del estado** (`partidas.origen`, `ingresos.tipo`) para que los reportes filtren por origen. La regla antigua «Devolución no es un estado» queda **reemplazada** (ver nota en reglas-negocio.md y vision.md): ninguna sesión futura debe marcarla como conflicto. | reglas-negocio.md; vision.md; ADR-009 |
| D-37 | **Datos regulatorios del producto:** solo Katia (Dirección Técnica) y Sandra (asistente), con la **misma autoridad y sin validación adicional**, editan registro sanitario, vencimiento, forma farmacéutica, concentración, fabricante y condición de almacenamiento (y, cuando se resuelva la duplicidad con `catalogo.productos`, presentación y principio activo). Aplicado en base de datos (RLS y funciones). Cada cambio guarda campo, valor anterior, valor nuevo, usuario, fecha y **motivo obligatorio**. Las actas firmadas conservan los datos como estaban al firmarse. | migración 0006; `docs/wms/regulatorio-duplicidad.md` |
| D-40 | Confirmada (2026-10-09): **solo Katia autoriza ajustes de inventario**; Sandra (asistente de Dirección Técnica) no. Aplicado en dominio y base de datos, con test (cambia D-18 solo en el sentido de excluir a Sandra explícitamente). | `apps/wms/tests/db/inventario.test.ts`, ADR-011 |
| D-41 | Decidida (2026-10-09, ajuste de Sebas): **movimientos internos con solo dos personas** (ejecutado por = quien crea y mueve; verificado por = otro auxiliar, el Jefe o su reemplazo, nunca el ejecutor), **sin autorización previa en el sistema** (indicación verbal) y **una línea por producto con su propio origen y destino**. Reemplaza el flujo preparar → autorizar → ejecutar → verificar del Batch 3 y D-15 pasa a «verificador ≠ ejecutor». | `reglas-negocio.md`, `cambios-a-procesos.md`, ADR-011 |
| D-11 | Aprobada: firma electrónica con **usuario logueado** (+ huella) para las actas; firma táctil del transportista con nombre, DNI y placa. | reglas-negocio.md; ADR-008 |
| D-12 | Aprobada: el formato de recepción lleva el **DNI del transportista** y «Ingreso de cliente» (marcado en OTROS con texto). | PDF del Acta de Recepción |
| D-13 | Aprobada: numeración del acta organoléptica **`O-AAAAMM-NNNN`**. | acta organoléptica |
| D-15 | Aprobada y reforzada: **quien hace un movimiento no puede validarlo**. El verificador debe ser una persona distinta de quien lo **preparó** y de quien lo **ejecutó**. Aplicado en dominio y en base de datos. | migración 0006; `domain/verificacion.ts`; tests |
| D-28b | Aprobada: «Aprobado · por trasladar» **24 horas**, configurable (`plazo_por_trasladar_horas`). | wms.parametros |
| D-29 | Resuelta: no hay código controlado. Se usa **«LS-FR-KDX (provisional)»**, parámetro configurable `kardex_codigo_formato`, visible como provisional en el PDF. **Ya no bloquea el Batch 3.** | migración 0006; wms.parametros |
| D-30 | Aprobada: umbral de alerta de vencimiento **90 días**, configurable (`lote_dias_alerta_vencimiento`), **más** alerta de lote ya vencido. En el Batch 3 el reporte de vencimientos incluye **vencidos y por vencer, con buckets configurables**. | wms.parametros; alertas; Batch 3 |

## Resueltas (2026-10-07)

| ID | Resolución | Dónde quedó |
|---|---|---|
| D-02 | Quien registra Aprobado o Bajas/Rechazados es Katia, al firmar el acta organoléptica en el WMS. Charlie no ejecuta ese cambio. | reglas-negocio.md (Estado sanitario) |
| D-03 | *(Reemplazada por el addendum 2026-10-08)* Una OC puede tener varias **solicitudes**; cada solicitud es un ingreso distinto. | reglas-negocio.md (Tipos de ingreso); gate-0.md C.6 |
| D-05 | El rack A llega a A-27 (los planos lo dibujan). Se corrige `topologia.md` en la rama; llega a `main` con el PR del Batch 1. | topologia.md |
| D-14 | El cargo es "Jefe de Almacén" en la interfaz y en el acta. | reglas-negocio.md (Roles) |
| D-20 | Base de pruebas: Postgres local, sin costo adicional (ni branch de Supabase ni servicios pagos). | gate-0.md §G |
| D-04 | Lo rechazado en la puerta no entra al WMS: la **Solicitud final** es lo autorizado a ingresar (antes: lo que registraba Compras). | gate-0.md C.6 |
| D-07 | Las posiciones sin propietario (I-8.1..I-8.4, J-12.4) quedan libres. | Seed de topología |
| D-16 | Unidades enteras, las mismas de Compras. | gate-0.md C.6; CHECK de enteros en el ledger |
| D-18 | Los ajustes los aprueba Katia. | gate-0.md D |
| D-19 | *(Cambia de sentido con el addendum)* La cantidad física nace en el WMS; si lo que se copia a Compras no coincide, el WMS alerta (`POR_REGISTRAR_EN_COMPRAS` / `NO_COINCIDE_CON_COMPRAS`). Nunca cambia solo. | gate-0.md (alertas, Batch 2) |
| D-21 | Se crea el proyecto Vercel `erp-logisalud-wms`, solo Preview, con filtro para construir únicamente cuando cambie `apps/wms` o sus paquetes compartidos. Vercel Pro; costo de build aprobado. Tras configurarlo se recarga y verifica. | gate-0.md E.5; progreso.md |
| D-24 | Autorizada la lectura en producción, solo lectura, **del área y el rol** de `public.perfiles` (nada más: sin nombres). **Resultado:** 15 perfiles; `direccion_tecnica` tiene 2 (1 admin y 1 operativo), `almacen` tiene 3 (operativos). Es compatible con Katia y Sandra en Dirección Técnica, pero **no puedo decir quién es quién** sin leer nombres. Hay solo 3 perfiles de almacén para unas 6 personas: el resto aún no tiene perfil (hay 34 en `usuarios_esperados`). Los roles WMS se asignan en `wms.usuario_roles`. | progreso.md |
| D-25 | Del transportista se registran nombre, DNI y placa. | reglas-negocio.md; formato LS-FR.03.05 |
| D-28 | **Aceptada** el 2026-10-08: el estado "Aprobado · por trasladar" existe (cambio de estado en el lugar, ADR-006) con un plazo máximo configurable. El plazo lo definen Katia y Charlie (ver D-28b); por defecto 24 horas. | ADR-006; `wms.parametros` |
| D-31 | Una devolución espera su evaluación en el estado nuevo **DEVOLUCIONES («Devoluciones»)**, un estado sanitario propio, en el Área de Devoluciones, y nunca pasa por Cuarentena. Pasa a Aprobado o Bajas/Rechazados previa su Acta Organoléptica (2026-10-08). | reglas-negocio.md; migración 0005; ADR-009 |
| D-32 | Sandra y Katia autorizan las solicitudes; con el portal de clientes, el cliente la crea y ellos la autorizan (2026-10-08). | ADR-009 |
| D-33 | Si llega más que el saldo de la OC: el WMS registra lo físico y alerta `EXCEDE_OC` a Katia y a Compras; no lo resuelve (2026-10-08). | ADR-009 |
| D-34 | Solicitud con formato **SI-AAAA-NNNNN** (por año); toda diferencia entre solicitud inicial y final notifica a Sandra y a Katia (2026-10-08). | ADR-009 |
| D-35 | Un lote declarado distinto del físico deja de ser rechazo automático: es un **ajuste explícito con motivo** y con historial (2026-10-08). | ADR-009 |
| D-27 | Modo demostración con datos de prueba: **solo en Preview**, aviso visible "DEMO", sin conexión a ninguna base real, imposible de activar en producción. | gate-0.md §G; `apps/wms/lib/demo.ts` |
| — | Estado sanitario por unidad (no por lote): el lote ABC aprobado + nueva entrega del mismo lote nace en Cuarentena con su propia acta; la aprobación no se hereda y la anterior no vuelve a Cuarentena. | gate-0.md C.7 (`procedencia_id`) |
| — | Vencimiento: se registra la fecha completa del producto físico; solo si el producto muestra mes y año se usa el último día del mes. | reglas-negocio.md (Recepción 2) |
