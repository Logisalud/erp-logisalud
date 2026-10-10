# WMS — Plan del Batch 4: preparación para producción

Estado: **propuesta, nada ejecutado.** Se ejecuta por partes, cada una con su aprobación.
Personas: **Claude** (código, pruebas, documentos), **Sebas** (decisiones, accesos, datos), **Katia** y **Charlie** (operación, validación, capacitación).

Hallazgos de la investigación que condicionan el plan:

1. **`traerTodo` pagina sin orden.** `services/supabase/util.ts` pagina con `.range()` y en 22 de sus usos no ordena. En Postgres, paginar sin `ORDER BY` puede repetir o perder filas entre páginas (el mismo bug que ya corrigió `apps/cobranzas/lib/fetchAll.ts`). PostgREST además corta en 1.000 filas. Es el riesgo n.º 1 con la base real.
2. **La CI de GitHub Actions del WMS está roja desde el 8-oct** en el paso `npm run test:e2e` (todas las corridas, incluidos los merges de #168/#169/#170). Unitarias, base de datos y build pasan. Hipótesis sin verificar: la CI corre los 4 viewports contra un solo servidor demo con estado en memoria compartido. Se arregla primero (punto 1, paso 1.0).
3. **Ninguna migración (0001–0009) está aplicada en ninguna base.** Los adaptadores Supabase nunca se ejecutaron contra una base real: la primera prueba real es también la primera vez que corren.
4. `plan-aplicacion-produccion.md` habla de 0001…0008; hay que actualizarlo a 0009.

---

## 0. Ajuste chico en las tarjetas de KPI (más es mejor / peor)

**Qué es «pp»:** *puntos porcentuales*. Es la diferencia entre dos porcentajes, no un porcentaje de un porcentaje. Si la exactitud pasó de 68,8 % a 84,4 %, subió **15,6 pp** (no «22,7 %»). Se usa para que no se confunda «subió 15,6 %» con «subió 15,6 puntos». Propuesta: en pantalla escribirlo en palabras («puntos»), sin la sigla.

**Cambio:**
- `domain/indicadores.ts`: cada indicador declara `mejorSiSube: boolean` (exactitud: sí; vencidos, recepciones con diferencia, tiempo en cuarentena: no; ocupación y otros neutros: se define con Katia).
- `variacion()` devuelve el texto con palabras: «↑ 16,4 puntos · empeoró», «↑ 15,6 puntos · mejoró», «sin cambio». Los indicadores sin sentido definido muestran solo la flecha.
- Sin colores, sin metas ni semáforos (D-42 sigue vigente).
- Pruebas unitarias de los 17 indicadores (sentido y texto); revisar tarjeta en 4 viewports; detector Impeccable en 0.

| Quién | Qué |
|---|---|
| Claude | Implementar, probar, mostrar en el Preview |
| Katia | Confirmar el sentido de cada indicador (lista de 17) |
| Sebas | Aprobar el texto |

Decisión: ¿«puntos» o «pp»? (recomiendo «puntos»). Riesgo: bajo; un indicador mal clasificado dice «mejoró» cuando no — por eso Katia confirma la lista.

---

## 1. Prueba de volumen y paginación en servidor (D-43)

**Paso 1.0 — Arreglar la CI E2E** (reproducir el fallo, correr un viewport por servidor como ya hace `e2e-por-viewport.sh`). Sin esto no hay red de seguridad para lo demás.

**Paso 1.1 — Paginación segura en `traerTodo`:** orden obligatorio por clave única (id; clientes por RUC; letra_documento por documento_id+letra_id). Cambiar la firma para que no se pueda llamar sin orden. Prueba con base local de 25.000 filas: contar, sin duplicados ni faltantes.

**Paso 1.2 — Paginación y filtros en el servidor** para reportes y modo tabla: página + orden + filtros se resuelven en el servidor (`range` con orden estable, `count`), en pantalla «Anterior / Siguiente» y total. La descarga CSV/XLSX se arma en el servidor por bloques (no trae todo al navegador). Los KPI que hoy agregan en memoria pasan a funciones SQL/agregados donde el volumen lo exija.

**Paso 1.3 — Prueba de volumen:** con la base que envíe Sebas, cargada en un Postgres local (no en Supabase todavía): medir tiempos de panorama, kardex, reportes, indicadores, vencimientos y carga inicial. Criterio propuesto: pantalla en < 2 s con el volumen real; descarga completa sin error. Si falta algún índice, se agrega en una migración 0010 (re-ejecutable).

| Quién | Qué |
|---|---|
| Sebas | Enviar la base (qué formato, ver decisión) y confirmar que se puede usar sin datos personales sensibles |
| Claude | Todo el código, el generador de volumen sintético de respaldo y el informe de tiempos |
| Katia | Decir qué reportes usa más (para priorizar) |

Decisiones: formato de la base (dump de Odoo / CSV / Excel); criterio de tiempo aceptable. Riesgos: la base real puede traer lotes/vencimientos sucios (se mide también cuántas filas no pasan validación); sin datos reales usaría volumen sintético, menos fiel.

---

## 2. Integración con Compras (D-36), fases 1 y 2

Documento base: `integracion-wms-compras.md`. Se propone la **opción A**: Compras **lee**, no se le escribe.

**Fase 1 — Solo lectura (no cambia el comportamiento de Compras):**
- Migración del WMS: vista `wms.v_cantidad_fisica_confirmada` (por línea de OC: cantidad confirmada físicamente en almacén), con `grant select` al rol que usa Compras. Se agrega a `public.schemas_compras_y_pagos()` / `aplicar_grants_del_modulo()` solo con ese permiso.
- Compras: una columna informativa «Recibido según almacén» en el detalle de la OC y la recepción. **No reemplaza** `cantidad_recibida`, no entra en conciliación ni obligaciones.
- Si el WMS no está aplicado, la pantalla de Compras muestra «—» (sin error).

**Fase 2 — Diferencias visibles:**
- Alerta en Compras cuando «Recibido según almacén» ≠ `cantidad_recibida`, con la lista de OC afectadas. Sigue siendo informativa; quien decide es Compras.
- La decisión de qué hacer con una diferencia (ajustar recepción, reclamar al proveedor) queda manual.

**Qué cambia en Compras:** `apps/compras/services/recepciones.ts` y `ordenes-compra.ts` (lectura de la vista), `app/ordenes-compra/[id]/page.tsx` y la pantalla de recepción (columna/alerta). **No se tocan** `domain/conciliacion.ts`, `facturas-pendientes`, `obligaciones` ni sus migraciones.

**Cómo se prueba que Compras sigue funcionando:**
1. Antes de tocar: correr los 883 tests de Compras y guardar el resultado.
2. Cambios con pruebas propias (vista presente / ausente / vacía).
3. Después: los mismos 883 + build + E2E de Compras en verde; comparar que los totales de recepciones, facturas pendientes y obligaciones **son idénticos** antes y después sobre la misma base de prueba.
4. En el ensayo real (punto 3): comprobar en el Preview de Compras que OC, recepción y facturas pendientes muestran los mismos importes.
5. Reversa: quitar la vista y la columna no afecta ningún dato de Compras (solo lectura).

| Quién | Qué |
|---|---|
| Claude | Vista, cambios en Compras, pruebas de no regresión |
| Sebas | Decidir A (recomendada), y las preguntas abiertas de D-36 |
| Katia | Quién concilia las diferencias y cuándo |
| Charlie | Si hay recepciones que no pasan por el WMS (compras directas, servicios) |

Decisiones: opción A vs. otras; qué hacer con recepciones fuera del WMS; quién cierra una OC con diferencia. Riesgos: tocar el módulo financiero (mitigado: solo lectura y aislado); la migración 0008 ya toca `catalogo.productos` de Compras (se aplica **al final** y se prueba con Compras); fases 3+ (escribir `cantidad_recibida`) quedan fuera.

---

## 3. Primera prueba contra Supabase real, sin costo adicional

Base: `plan-aplicacion-produccion.md` y `aplicar-migraciones.md`. Proyecto consolidado `erp-cobranzas`, compartido con Cobranzas y Compras.

**Opciones sin costo (decidir):**
- **A (recomendada):** aplicar en el proyecto real, pero primero ensayar completo en un Postgres local con una copia de las tablas de Cobranzas/Compras (ya existe la cadena de tests DB). Lo real solo se toca con el ensayo en verde.
- **B:** usar un branch de Supabase — suele tener costo; solo si Sebas confirma que está incluido en el plan.
- **C:** segundo proyecto gratuito — no replica lo compartido; sirve para adaptadores, no para RLS/Compras.

**Antes de aplicar (todos):**
1. Snapshot de Cobranzas y Compras: los 8 indicadores de Cobranzas (saldo pendiente ref. 646.898,20), `catalogo.productos` = 509 filas, conteos por tabla de Compras, y esquema/funciones/policies exportados.
2. Respaldo: dump lógico del proyecto + (si el plan lo ofrece) copia de seguridad de Supabase; guardar fuera del repo.
3. Ventana acordada (fuera de horario de cobranzas/compras), `lock_timeout 5s` y `statement_timeout 60s`.

**Qué se aplica y en qué orden:**
1. Pasos previos de configuración: exponer el schema `wms` en la Data API; incorporarlo a `public.schemas_compras_y_pagos()` + `aplicar_grants_del_modulo()`.
2. Migraciones **0001 → 0007**, luego **0009**, y la **0008 al final** (la única que toca un objeto de Compras: trigger en `catalogo.productos`). Si el orden numérico real exige 0008 antes de 0009, se respeta el que dicten las dependencias; se verifica en el ensayo local.
3. Seed de catálogos y `wms.usuario_roles` (punto 4).
4. `wms.verificar_saldos()` = 0 filas.

**Qué se prueba primero (en este orden):**
1. **Snapshot idéntico** (nada de Cobranzas/Compras cambió).
2. **Login** con cada rol (usuario real de Supabase Auth, no demo).
3. **RLS**: cada rol ve/edita lo que debe y nada más (pruebas con usuarios reales de cada rol; usuario sin rol → HTTP 403/vacío).
4. **Adaptadores** (primera ejecución real): panorama, kardex, un movimiento, un conteo, un reporte, un indicador. Cualquier error de columna/tipo aparece aquí.
5. **Migraciones 0001–0009**: re-ejecutar una vez para confirmar idempotencia.
6. **Compras y Cobranzas** siguen igual (snapshot + prueba humana).

**Rollback:** `apps/wms/supabase/rollback/wms_0001_a_0009_rollback.sql` (ya probado en `tests/db/rollback.test.ts`); luego comparar contra el snapshot. Se prueba antes en local. Criterio para decidir rollback: cualquier diferencia en el snapshot o fallo de login en Cobranzas/Compras.

| Quién | Qué |
|---|---|
| Sebas | Aprobar la ventana, dar acceso al proyecto, elegir A/B/C, confirmar el plan de Supabase y su respaldo |
| Claude | Ensayo local, scripts de snapshot/verificación, aplicar con la herramienta de historial, informe |
| Katia / Charlie | Probar login y pantallas con su rol y confirmar que Cobranzas/Compras siguen igual (Katia: Cobranzas; Charlie: operación) |

Riesgos: compartir proyecto con Cobranzas/Compras (mitigado: snapshot, ventana, reversa probada); no deploy de producción del WMS hasta que todo esté verde; los adaptadores nunca corrieron → habrá errores de primera vez (esperados, por eso es una "primera prueba").

---

## 4. Usuarios y roles

Roles en `wms.usuario_roles`: `direccion_tecnica`, `asistente_dt`, `jefe_almacen`, `reemplazo_jefe`, `auxiliar`, `auditoria_lectura`, `admin_wms` (con `desde`/`hasta` para reemplazos temporales).

**Lo que Sebas crea o confirma por cada persona:**
- Correo con el que entrará (debe existir en Supabase Auth; si ya está en Cobranzas/Compras se reutiliza el mismo usuario).
- Rol principal y, si aplica, rol de reemplazo con fechas.
- Que está activa (y quién deja de estarlo).

**Tabla a llenar (la completa Sebas; Claude la convierte en el seed):**

| Persona | Correo | Rol WMS | Desde / hasta | Observación |
|---|---|---|---|---|
| Sebas | | admin_wms | | |
| Katia | | (por confirmar: asistente_dt / dirección técnica) | | |
| Charlie | | (por confirmar: jefe_almacen) | | |
| Reemplazo del jefe | | reemplazo_jefe | | |
| Auxiliares | | auxiliar | | |
| Auditoría | | auditoria_lectura | | |

Principio: el mínimo permiso necesario; nadie con `admin_wms` salvo Sebas. Cada rol se prueba con una persona real en el punto 3.

Decisiones: quién es Dirección Técnica vs. asistente; si hay más de un jefe/reemplazo. Riesgos: un usuario existente en Cobranzas con otro correo → duplicados; roles demasiado amplios por comodidad.

---

## 5. Carga inicial desde Odoo

**Archivo exacto** (Excel o CSV; una fila = una combinación única de producto, lote, posición y estado). Separadores `,` `;` o tab; fechas `dd/mm/aaaa` o `aaaa-mm-dd`; encabezados con o sin tilde:

| Columna | Obligatoria | Qué lleva |
|---|---|---|
| `producto` (alias `codigo`) | Sí | Código del producto tal como está en el catálogo |
| `lote` | Sí (si el producto maneja lote) | Lote del fabricante |
| `vence` (alias `vencimiento`) | Sí (si maneja vencimiento) | Fecha de vencimiento |
| `propietario` | Sí | Dueño del stock (empresa/cliente) |
| `posicion` (alias `ubicacion`) | Sí | Posición física del almacén |
| `estado` | Sí | Disponible / cuarentena / bloqueado, etc. |
| `cantidad` | Sí | Unidades, número positivo |

Desde Odoo: exportar el inventario valorizado por lote/ubicación. Si Odoo no separa propietario o estado, se indica una columna por defecto y se corrige en el ensayo.

**Cómo será el ensayo:**
1. Claude valida el archivo (formato, productos no encontrados, lotes duplicados, vencimientos imposibles) y entrega un informe de errores sin cargar nada.
2. Se corrige en Odoo/archivo hasta quedar en 0 errores.
3. Carga en la base local → comparación: total de unidades y valor por propietario = total de Odoo; `wms.verificar_saldos()` = 0.
4. Carga en Supabase real (en la primera prueba), **conteo físico de muestra** (Katia/Charlie: ~30 posiciones) comparado con el sistema.
5. La **carga definitiva** se hace el día del corte, con Odoo congelado (sin movimientos) durante la carga.

| Quién | Qué |
|---|---|
| Sebas | Exportar de Odoo y enviar el archivo; confirmar el corte |
| Claude | Validador, informe, carga y conciliación |
| Katia / Charlie | Conteo físico de la muestra; resolver lotes/vencimientos dudosos |

Decisiones: fecha de corte; qué se hace con stock sin lote/vencimiento; qué estado inicial tiene lo dudoso (propuesta: cuarentena hasta revisar). Riesgos: datos sucios de Odoo; diferencias entre físico y sistema el día del corte; movimientos de Odoo durante la carga.

---

## 6. Checklist de salida

**Capacitación**
- [ ] Guía corta por rol (Katia / Charlie / auxiliares), con capturas del WMS real. *(Claude escribe; Katia y Charlie revisan.)*
- [ ] Sesión práctica en el Preview con datos demo (1 h por rol). *(Charlie y Katia; Claude apoya.)*
- [ ] Cada persona hace un recorrido completo: recibir, mover, contar, revisar vencimientos.
- [ ] Persona responsable de dudas la primera semana (Charlie) y canal para reportar problemas (Sebas define).

**Operación en paralelo con Odoo** (propuesta: 4 semanas, a coordinar con la medición de KPI de D-42)
- [ ] Odoo sigue siendo el sistema oficial; el WMS se alimenta con los mismos movimientos del día.
- [ ] Cada día laborable: revisión diaria (lunes a viernes) en el WMS.
- [ ] Reglas claras: qué se registra en ambos y quién es la fuente en caso de duda (Odoo, hasta la salida).

**Comparación semanal de diferencias** (cada viernes)
1. Claude entrega un reporte «WMS vs. Odoo» por producto/lote/propietario: cantidad en cada sistema y la diferencia.
2. Las diferencias se clasifican: error de captura WMS, error en Odoo, movimiento aún no registrado, pendiente de explicar.
3. Katia y Charlie resuelven y firman cada semana; se anotan causas.
4. Criterio de salida propuesto (a confirmar): 2 semanas seguidas con diferencias explicadas en el 100 % y sin diferencias de cantidad sin explicar mayores al umbral que fijen Katia y Charlie.

**Salida definitiva**
- [ ] Criterio de comparación cumplido. [ ] Corte acordado. [ ] Carga definitiva hecha y conciliada. [ ] Respaldo del día del corte. [ ] Plan de vuelta atrás: seguir con Odoo y descartar el WMS (con la reversa probada). [ ] Deploy de producción del WMS aprobado explícitamente por Sebas. [ ] Metas/semáforos de KPI se definen tras el mes de medición (D-42).

| Quién | Qué |
|---|---|
| Claude | Guías, reporte semanal de comparación, correcciones |
| Sebas | Decidir fecha de salida, criterio y canal de soporte |
| Katia | Validación de indicadores y firma de diferencias |
| Charlie | Operación diaria, conteos, firma de diferencias |

Decisiones: duración del paralelo; umbral de diferencia aceptable; quién responde si el WMS cae. Riesgos: doble digitación → cansancio y datos inconsistentes (mitigado: periodo corto y acotado); el equipo vuelve a Odoo si el WMS es lento (de ahí la prueba de volumen); la fuente de verdad ambigua.

---

## Orden recomendado

1. CI E2E arreglada (1.0) y ajuste 0 de KPI.
2. Paginación en servidor + prueba de volumen (1.1–1.3), con la base que envíe Sebas.
3. Integración con Compras fases 1–2 (en local).
4. Ensayo completo local → primera prueba contra Supabase real (3), con usuarios (4).
5. Carga inicial: ensayo y validación (5).
6. Capacitación y operación en paralelo (6).

Cada paso termina con un informe y espera aprobación antes de pasar al siguiente. Nada de esto toca producción del WMS sin orden explícita.

## Decisiones que necesito de Sebas (resumen)

1. «puntos» vs. «pp» en la UI. 2. Formato de la base para la prueba de volumen y criterio de tiempo. 3. Opción A de D-36 y preguntas abiertas. 4. Opción A/B/C para la prueba en Supabase, y ventana. 5. Tabla de personas y roles. 6. Fecha de corte y manejo del stock sin lote/vencimiento. 7. Duración del paralelo y umbral de diferencias.
