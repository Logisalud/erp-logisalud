# WMS — Plan del Batch 4: preparación para producción

Estado: **propuesta ajustada con las decisiones de Sebas (2026-10-10). Nada de producción se ejecuta sin su aprobación.**
Personas: **Claude** (código, pruebas, documentos), **Sebas** (decisiones, accesos, datos), **Katia** (Dirección Técnica), **Charlie** (Jefe de Almacén).

## Orden de trabajo

| # | Qué | Entrega |
|---|---|---|
| A | CI del WMS en verde + regla «nunca merge con CI en rojo» + `traerTodo` con orden obligatorio + verificación de deploys | PR propio |
| B | Este plan actualizado | PR de documentación |
| C | Rediseño de KPI (3 en Inicio, color por tendencia, mini gráfico, Tiempo de disponibilidad) | PR propio, con Preview y capturas; espera aprobación |
| D | Volumen y paginación en servidor (punto 1) | Después de C |
| E | Integración con Compras, fase 1 (punto 2) | Después de D |
| F | Roles y cargos (punto 4) y ensayo local → aplicación real (punto 3) | Con aprobación de la ventana |

La carga inicial desde Odoo y la operación en paralelo **se postergan** hasta que existan las salidas en el WMS (ver punto 5).

---

## Previo (hecho en el PR A)

1. **CI del WMS.** El job «apps/wms — dominio, base de datos, build y E2E» estaba rojo en el paso `npm run test:e2e` desde el 8-oct, en todas las corridas, incluidos los merges de #168, #169 y #170. Diagnóstico y arreglo: ver el PR A.
2. **Regla nueva** en `apps/wms/CLAUDE.md`: nunca un merge con la CI en rojo, aunque Vercel esté en verde. Antes de pedir aprobación de un PR se informa el estado del job del WMS.
3. **Deploys posteriores al merge de #170** (`e46a665`), leídos en solo lectura en Vercel: producción de `erp-logisalud` (Cobranzas), `erp-logisalud-compras`, `erp-logisalud-pedidos` y `auth` en **READY**; `erp-logisalud-wms` **sin deploy de producción** (los tres últimos intentos figuran CANCELED, como corresponde).
4. **`traerTodo`**: orden obligatorio por clave única en sus 22 usos, con registro de claves (`services/supabase/claves.ts`), test unitario y test de base de datos que lo compara con las claves primarias reales.

---

## 0. KPI: rediseño (reemplaza el «ajuste chico» anterior)

Detalle completo en el mensaje del pedido; resumen:

- **Inicio muestra 3 indicadores:** Exactitud de inventario, Por vencer y vencidos, y **Tiempo de disponibilidad** (dock-to-stock: horas desde la recepción física confirmada hasta que la mercadería queda Aprobada y verificada en una posición de Aprobados; mediana de los últimos 30 días, con detalle por propietario). «Recepciones con diferencia» y «Ocupación del almacén» salen de Inicio y quedan en Indicadores.
- **Tarjetas:** color **por tendencia**, no por meta (verde si mejoró, ámbar si empeoró), siempre con ícono y palabra («↑ 15,6 puntos · mejoró»); cada indicador declara si «más» es mejor o peor; el color nunca es la única señal. Mini gráfico de tendencia de 30 días en SVG propio, sin librería. Sin frases, celebraciones ni otros elementos. El mismo componente en Inicio e Indicadores.
- **Teléfono:** las 3 tarjetas en una columna, encima de la lista de pendientes.
- **Texto:** «puntos», no «pp».
- `kpis.md` define Tiempo de disponibilidad; tests con datos conocidos; demo con valor y tendencia.
- Sigue vigente D-42: sin metas ni semáforos.

**Estado (2026-10-10):** aprobado por Sebas en el Preview (PR #176).

**Pendiente de Katia (D-45):** confirmar el sentido —«más es mejor» o «más es peor»— de los **18 indicadores** (tabla en `kpis.md`). **Ocupación del almacén queda neutral** (sin palabra ni color, solo flecha y cambio) hasta que decida.

**Más adelante en el Batch 4 (cuando haya tiempo):** un **reporte propio de Tiempo de disponibilidad**, recepción por recepción: **llegada** (recepción física confirmada), **aprobación** (Dirección Técnica), **ubicación final** (la posición de Aprobados donde quedó) y **horas totales**; con **filtro por propietario** y la descarga en CSV y Excel como los demás reportes. La tarjeta de Inicio e Indicadores lo abrirá en lugar del reporte de Recepciones.

| Quién | Qué |
|---|---|
| Claude | Implementar, probar, capturas en 4 viewports, Impeccable (hecho); reporte propio de Tiempo de disponibilidad |
| Katia | Confirmar el sentido (más es mejor/peor) de cada indicador (D-45) |
| Sebas | Aprobar el Preview (hecho) |

---

## 1. Prueba de volumen y paginación en servidor (D-43)

**Base de la prueba:** Sebas enviará una **exportación de Odoo** con productos, lotes, stock por ubicación y **movimientos de los últimos 12 meses**. **Meta: menos de 2 s por pantalla.**

**Pasos**
1. *(hecho en PR A)* Paginación segura de `traerTodo` y CI.
2. **Importador de la exportación** a una base **local** (nunca Supabase) con un validador que informa filas que no pasan validación (lotes o vencimientos faltantes, productos inexistentes).
3. **Paginación, orden y filtros en el servidor** para reportes y modo tabla (página + total + orden estable por clave única); descarga CSV/XLSX armada en el servidor por bloques.
4. Los indicadores y paneles que hoy suman en memoria pasan a agregados SQL donde el volumen lo pida.
5. **Medición:** panorama, Kardex, historia del lote, reportes, Vencimientos, Indicadores, modo tabla y Revisión diaria. Informe con tiempos por pantalla. Si falta un índice, migración 0010 (re-ejecutable).

| Quién | Qué |
|---|---|
| Sebas | Enviar la exportación de Odoo |
| Claude | Importador, paginación, mediciones, informe |
| Katia / Charlie | Decir qué reportes usan más, para priorizar |

Decisiones: ninguna pendiente (meta fijada en 2 s). Riesgos: la exportación puede venir con datos sucios (se mide y se informa); los 12 meses de movimientos son datos históricos de Odoo, no del libro mayor del WMS: se importan solo para la prueba, no como historia real.

---

## 2. Integración con Compras (D-36)

Documento base: `integracion-wms-compras.md`. Compras **no deja de funcionar** en ninguna fase.

### Fase 1 — Solo lectura (se hace como se propuso)
- Vista `wms.v_cantidad_fisica_confirmada` (por línea de OC: cantidad confirmada físicamente en el almacén), con `grant select` solo de lectura.
- Compras: columna informativa **«Recibido según almacén»** en el detalle de la OC y en la recepción. No reemplaza `cantidad_recibida` ni entra en conciliación, facturas u obligaciones. Si el WMS no está aplicado, muestra «—».

### Fase 2 — Propuesta (**no se implementa sin aprobación de Sebas**): eliminar la copia manual

Hoy, en Compras, Almacén teclea la **Cantidad Física** en la recepción de tres columnas (`registrarRecepcionTresColumnas`, `apps/compras/services/recepciones.ts`). Ese número alimenta `recepciones_items.cantidad_fisica`, suma a `ordenes_compra_items.cantidad_recibida`, decide la discrepancia físico vs. factura y de ahí nacen la obligación, la conciliación y las facturas pendientes.

**Cambio mínimo propuesto: cambiar *quién escribe* el número, no *qué* se hace con él.**
1. En el servicio `registrarRecepcionTresColumnas` (y en el formulario), la columna **Cantidad Física** pasa a ser de **solo lectura** y su valor se toma, en el servidor, de `wms.v_cantidad_fisica_confirmada` para esa línea de OC. Lo que venga del formulario para esa columna se **ignora** (nadie la escribe).
2. Si la línea no tiene cantidad confirmada en el WMS, la recepción de Compras de esa línea **no se puede registrar** y la pantalla dice que falta la confirmación en el almacén (alternativa a decidir: permitir la entrada manual con motivo, para recepciones que no pasan por el WMS).
3. **No se toca**: `domain/conciliacion.ts`, `domain/facturas-pendientes.ts`, `obligaciones`, `reportes-ordenes-compra`, sus migraciones ni las columnas. `cantidad_fisica` sigue siendo el mismo dato con el mismo significado; solo cambia su origen.
4. Nada se escribe desde el WMS en tablas de Compras (el WMS sigue sin permisos de escritura sobre ellas).

**Cómo se prueba que conciliación, facturas y obligaciones no cambian**
- **Prueba de equivalencia (dorada):** para un conjunto de casos (físico = factura, físico < factura, físico > factura, parciales, varias guías, línea exonerada), correr el flujo actual y el nuevo con **el mismo número físico** y comparar fila a fila `recepciones`, `recepciones_items`, `ordenes_compra_items.cantidad_recibida`, `obligaciones` (base, IGV, total, `espera_nota_credito`) y la cola de facturas pendientes: deben ser **idénticos**.
- Los **883 tests de Compras** antes y después, sin cambios en los de dominio.
- Build y E2E de Compras en verde; Preview de Compras revisado por Charlie con una OC de prueba.
- Pruebas nuevas: sin dato del WMS (bloquea / «—»), dato presente (se usa), y el formulario no puede forzar otro valor.
- Reversa: volver a habilitar la columna editable (un cambio de un archivo); los datos ya escritos no cambian porque la semántica es la misma.

Decisiones para Sebas: aprobar o ajustar la fase 2; qué pasa con las recepciones que no pasan por el WMS (compras directas, servicios); quién resuelve una diferencia WMS ↔ factura (hoy la regla de Compras es la de las tres columnas). Riesgos: Almacén queda bloqueado en Compras si el WMS no confirmó (mitigado con la alternativa manual con motivo); la fase 2 toca el módulo financiero (mitigada con la prueba de equivalencia).

| Quién | Qué |
|---|---|
| Claude | Fase 1 (tras D); propuesta de fase 2 lista para su revisión |
| Sebas | Aprobar la fase 2 antes de cualquier código |
| Charlie | Revisar el Preview de Compras |
| Katia | Confirmar qué es «físico confirmado» en el WMS |

---

## 3. Primera prueba contra Supabase real (sin branch, sin costo adicional)

Base: `plan-aplicacion-produccion.md` y `aplicar-migraciones.md`. Proyecto consolidado `erp-cobranzas`, compartido con Cobranzas y Compras. **Se espera la aprobación de Sebas antes de tocar la base real**, y se aplica **de noche o fin de semana**.

**Secuencia:** 1) ensayo completo **en local** (Postgres 16 con las tablas de Cobranzas/Compras simuladas, más el volumen del punto 1); 2) con el ensayo en verde y aprobado, aplicación en el proyecto real en la ventana acordada.

### Mecanismo exacto (propuesta)
- **Herramienta:** SQL Editor del panel de Supabase, ejecutado **por Sebas** (o Andrés), pegando cada migración tal cual está en el repo. **No** se usa `apply_migration` del MCP (se colgó el 2026-10-08) ni se aplica al mergear. Claude **no ejecuta nada** sobre la base real; solo lee el esquema por el MCP (solo lectura) para verificar.
- **Cada paso**, uno a la vez, con la misma cabecera: `set lock_timeout = '5s'; set statement_timeout = '60s';`. Las migraciones no usan `drop … if exists` sobre objetos inexistentes (lo comprueba `tests/db/migraciones.test.ts`).
- **Historial:** después de cada migración exitosa, Sebas ejecuta el `insert` en `supabase_migrations.schema_migrations` (versión y nombre de la migración, que Claude prepara en un bloque listo para pegar), para que la integración de Supabase con GitHub **no la vuelva a aplicar** al mergear y el historial quede completo. Claude verifica por lectura que el historial coincida con los archivos.
- **Si algo falla o se cuelga:** detenerse, solo lecturas para reportar el estado, y no reintentar por otro método sin la aprobación de Sebas.
- **Respaldo previo:** copia de seguridad del proyecto (la que ofrezca el plan de Supabase) y volcado lógico del esquema `public`, `catalogo`, `compras`, `almacen`, guardados fuera del repo. **Snapshot de Cobranzas y Compras** (8 indicadores de Cobranzas; saldo pendiente de referencia 646.898,20; `catalogo.productos` = 509; conteos por tabla de Compras), tomado por lectura antes y después.
- **Rollback:** `apps/wms/supabase/rollback/wms_0001_a_0009_rollback.sql` (probado en `tests/db/rollback.test.ts`), también ejecutado por Sebas. Criterio: cualquier diferencia en el snapshot o fallo de login en Cobranzas/Compras.

### Qué se aplica y en qué orden
1. Pasos previos: exponer el schema `wms` en la Data API; agregarlo a `public.schemas_compras_y_pagos()` y `aplicar_grants_del_modulo()`.
2. Migraciones **0001 → 0007, luego 0009**, y la **0008 al final** (única que toca un objeto de Compras: trigger en `catalogo.productos`). El orden definitivo se confirma en el ensayo local según las dependencias reales.
3. Seed y usuarios/roles (punto 4). 4. `wms.verificar_saldos()` = 0 filas.

### Qué se prueba primero
1. Snapshot idéntico. 2. Login con cada rol real. 3. RLS por rol. 4. Adaptadores (primera ejecución real): panorama, Kardex, un movimiento, un conteo, un reporte, un indicador. 5. Re-ejecución de las migraciones (idempotencia). 6. Compras y Cobranzas intactos.

| Quién | Qué |
|---|---|
| Sebas | Aprobar ventana y plan; ejecutar en el panel; respaldos; confirmar plan de Supabase |
| Claude | Ensayo local, scripts de snapshot y verificación, bloques de historial, informe |
| Katia / Charlie | Probar login y pantallas con su rol |

Riesgos: base compartida (mitigado: snapshot, ventana, reversa probada); los adaptadores nunca corrieron (se esperan errores de primera vez); migración manual y orden del historial (mitigado con verificación por lectura).

---

## 4. Usuarios, cargos y permisos

**Cargo** = lo que se muestra en pantalla, actas y auditoría. **Permiso** (rol en `wms.usuario_roles`) = lo que la persona puede hacer. Hoy la tabla solo tiene el permiso: se agrega la columna **`cargo`** (texto, con historial de vigencia como el rol) en la migración 0010.

| Persona | Cargo (se muestra) | Permisos (rol) | Correo |
|---|---|---|---|
| Katia | Dirección Técnica (QF) | `direccion_tecnica` | *(Sebas)* |
| Sandra | Asistente de Dirección Técnica | `direccion_tecnica` | *(Sebas)* |
| Charlie | Jefe de Almacén | `jefe_almacen` | *(Sebas)* |
| Roberto | Jefe de Transporte | `jefe_almacen` | *(Sebas)* |
| Jasury | [Asistente de almacén — confirmar el nombre exacto] | `jefe_almacen` | *(Sebas)* |
| Christians | Auxiliar de almacén | `auxiliar` | *(Sebas)* |
| Jose Carlos | Auxiliar de almacén | `auxiliar` | *(Sebas)* |
| Alberto | Auxiliar de almacén | `auxiliar` | *(Sebas)* |
| Milka | Auxiliar de almacén | `auxiliar` | *(Sebas)* |
| Sebas | Administrador | `admin_wms` | *(Sebas)* |
| Andrés | Administrador | `admin_wms` | *(Andrés)* |

- Solo Sebas y Andrés son `admin_wms`.
- **Jefe de Transporte** queda previsto: hoy usa los permisos de Jefe de Almacén; cuando existan las salidas tendrá permisos propios (rol `jefe_transporte`, que se agrega en el batch de despacho). Como los permisos se leen del rol y el cargo es aparte, ese cambio no obliga a rehacer nada.
- Consecuencias de las decisiones, para que Sebas las confirme: **Sandra con permisos de Dirección Técnica** puede aprobar ajustes de inventario (hoy solo Dirección Técnica), no solo editar datos regulatorios; el rol `asistente_dt` queda sin uso por ahora. **Roberto y Jasury con permisos de Jefe de Almacén** pueden revertir movimientos y gestionar lo que gestiona el Jefe de Almacén.
- Cada persona se prueba con su rol real en el punto 3.

| Quién | Qué |
|---|---|
| Sebas | Completar los correos; confirmar el cargo de Jasury y las consecuencias de arriba |
| Claude | Migración 0010 (columna `cargo`), mostrar el cargo en pantalla/actas/auditoría, seed de usuarios |
| Katia / Charlie | Confirmar que cada persona ve y puede lo que le toca |

Riesgos: un correo distinto al usuario ya existente en Cobranzas/Compras duplica la persona (se usa el mismo usuario de Auth); permisos amplios por comodidad (se revisan al terminar el ensayo).

---

## 5. Carga inicial desde Odoo y operación en paralelo — **POSTERGADOS**

**Motivo (decisión de Sebas):** sin salidas en el WMS, el stock del WMS no puede cuadrar con Odoo. Se hacen cuando existan las salidas. **No se ejecuta nada de esto en el Batch 4.** El formato del archivo y el procedimiento quedan documentados en `carga-inicial-odoo.md`.

Reglas ya decididas para cuando toque:
- **Stock sin lote o vencimiento:** no entra como Aprobado; se completa en el inventario general y lo que no se pueda completar entra en **Cuarentena** para decisión de Katia.
- **Paralelo con Odoo:** **4 semanas**, con la regla de que **toda diferencia esté explicada y firmada por Katia y Charlie**.

---

## Decisiones que quedan para Sebas

1. Aprobar o ajustar la **fase 2 de Compras** (y qué hacer con recepciones fuera del WMS).
2. Aprobar el **mecanismo de aplicación** (SQL Editor por Sebas/Andrés + historial manual + `lock_timeout`) y la **ventana**.
3. Correos de la tabla de personas, cargo exacto de Jasury y las consecuencias de los permisos.
4. Enviar la **exportación de Odoo** para la prueba de volumen.
