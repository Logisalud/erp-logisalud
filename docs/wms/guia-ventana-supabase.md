# Guía de la ventana: primera aplicación del WMS en Supabase real

> **Estado: preparada, sin ejecutar.** Nada de esto se hace hasta que Sebas apruebe la fecha. Reglas del proyecto que mandan sobre esta guía:
> Claude **no escribe** en la base real; si algo falla o se cuelga, **se detiene todo** y solo se hacen lecturas; no se cambia de herramienta ni se parte el SQL sin aprobación.
> Complementa `plan-aplicacion-produccion.md` (el «qué») y `aplicar-migraciones.md` (el detalle de cada migración). Esta guía es el «cómo, paso a paso».

## 0. Datos de la ventana (se completan antes de empezar)

| Dato | Valor |
|---|---|
| Fecha y hora de inicio | **por definir** (noche o fin de semana; Sebas) |
| Duración prevista | 2 horas (sobra: la aplicación en sí son ~40 minutos) |
| Quién ejecuta (pega y corre cada bloque) | **por definir** (Sebas o Andrés) |
| Quién observa y verifica por lectura | Claude, **solo con el OK de Sebas el día de la ventana** (solo lectura) |
| Quién prueba al final | Katia (Dirección Técnica) y Charlie (Jefe de Almacén) |
| Proyecto | `erp-cobranzas` (`qpkigzniatidsvnxikox`), Postgres 17, plan **Pro** |
| Respaldo | El plan Pro incluye copias diarias automáticas. **Confirmar en Database → Backups** la hora del último respaldo y si el proyecto tiene *Point in Time Recovery* (restauración al minuto; es un complemento de pago y Claude no lo puede ver). Anotar aquí: ____________ |

## 1. Las cinco reglas de la ventana
1. **Un bloque a la vez**, en el orden de la guía. No se adelanta nada.
2. **Cada bloque se pega completo y se ejecuta una sola vez.** Ya trae su cabecera de seguridad (`lock_timeout 5 s`, `statement_timeout 60 s`) y su anotación en el historial.
3. **Después de cada bloque**, quien ejecuta avisa «listo» (o pega el error) y se hace la verificación del paso **antes** de seguir.
4. **Si algo falla, tarda o se cuelga: STOP.** No se reintenta, no se parte el SQL, no se prueba otra herramienta. Se hacen solo lecturas, se anota qué pasó y se decide con Sebas (sección 6).
5. **Nadie más toca la base** durante la ventana: se avisa antes a Cobranzas y a Compras que no registren cobros ni recepciones en ese lapso.

## 2. Qué se usa
- **El SQL Editor del panel de Supabase.** No se usa `apply_migration` del MCP (se colgó el 2026-10-08) ni se aplica al hacer merge (la integración de Supabase con GitHub solo vigila `apps/pedidos/supabase`: mergear no aplica nada del WMS).
- **Los bloques** (un archivo por paso) los prepara Claude con el comando de la sección 8, a partir de los mismos archivos del repositorio que ya pasaron las pruebas. El mismo ensayo (bloques en orden, repetición de un bloque, reversa) corre en `tests/db/ventana.test.ts`.
- **Las consultas de control** están en `apps/wms/supabase/ventana/`: sesiones activas, snapshot de estructura y filas, snapshot de cartera y definiciones actuales. Son de solo lectura.

## 3. Antes de la ventana (días antes)

| # | Qué | Quién |
|---|---|---|
| A1 | Elegir fecha y hora; completar la tabla de la sección 0 | Sebas |
| A2 | Avisar a Cobranzas y a Compras de la ventana (sin cobros ni recepciones durante ese lapso) | Sebas |
| A3 | Abrir **Database → Backups**, anotar el último respaldo y si hay PITR | Sebas |
| A4 | Ensayo completo en local con la exportación de Odoo (volumen) en verde y la CI del WMS en verde | Claude |
| A5 | Preparar los 10 bloques con la **fecha de la ventana** (sección 8) y entregarlos en una carpeta | Claude |
| A6 | Tener listos los usuarios y roles de la tabla de personas (correos completos) | Sebas |
| A7 | Confirmar que el WMS **no tiene deploy de producción** y que nadie quiere uno ese día (se decide aparte) | Sebas |

## 4. El día: arranque (Paso 0)

| # | Qué haces tú (ejecutor) | Qué verifica Claude (lectura) | Bien si… |
|---|---|---|---|
| 0.1 | Abrir el SQL Editor del proyecto `erp-cobranzas` | — | Entras al proyecto correcto |
| 0.2 | Correr `00-sesiones-activas.sql` | Mira el resultado | Casi nadie conectado, sin transacciones largas y `bloqueos_esperando = 0`. Si hay actividad: **esperar** |
| 0.3 | Correr `01-snapshot-estructura-y-filas.sql` y guardar el resultado completo como **SNAPSHOT-ANTES** (con la hora) | Lo recibe y lo guarda | Sin errores |
| 0.4 | Correr `02-snapshot-cartera.sql` y guardar como **CARTERA-ANTES** | Compara con la referencia del 2026-10-08 (saldo 646.898,20; `catalogo.productos` 509) | Los números son los esperados, o la diferencia tiene explicación |
| 0.5 | Correr `03-definiciones-actuales.sql` y guardar el resultado como **DEFINICIONES-ANTES** | Prepara el bloque de permisos del Paso 11 | Devuelve 2 filas |
| 0.6 | `select count(*) from information_schema.schemata where schema_name = 'wms';` | — | **0** (el WMS no existe todavía) |

## 5. Las migraciones (Pasos 1 a 9) y el seed (Paso 10)

Cada fila es: pegar el archivo indicado → ejecutar → verificar. **Éxito del bloque**: el editor muestra «Success» sin errores. Después de **cada** bloque, además:
`select version, name from supabase_migrations.schema_migrations where name like 'wms\_%' order by version;` → debe aparecer **una fila más** (la del paso).

| Paso | Bloque | Qué hace (en simple) | Verificación (lectura) |
|---|---|---|---|
| 1 | `01-0001_base.sql` | Crea el schema `wms`, los catálogos y los roles | Existe `wms`; `select count(*) from pg_tables where schemaname = 'wms' and not rowsecurity;` → **0** (todas con RLS) |
| 2 | `02-0002_ledger.sql` | El libro mayor de inventario | `select * from wms.verificar_saldos();` → **0 filas** |
| 3 | `03-0003_productos.sql` | Alta de productos | Existen `wms.crear_producto` y `wms.validar_producto` (las reemplaza la 0006): `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'wms' and p.proname in ('crear_producto', 'validar_producto');` → 2 |
| 4 | `04-0004_entradas.sql` | Solicitudes, ingresos, actas | `select to_regclass('wms.ingresos'), to_regclass('wms.solicitudes_ingreso');` no son nulos |
| 5 | `05-0005_flujo_ingreso.sql` | Solicitud primero y conexión de **solo lectura** con Compras | Existen `wms.v_oc_lineas` y `wms.v_oc_items`; `select count(*) from wms.v_oc_items;` responde (sin error) |
| 6 | `06-0006_regulatorio_y_verificacion.sql` | Datos regulatorios con historial | Existen `wms.editar_regulatorio` y `wms.producto_regulatorio_cambios` |
| 7 | `07-0007_inventario.sql` | Kardex, movimientos, conteos, ajustes | `select to_regclass('wms.ordenes_movimiento'), to_regclass('wms.conteos');` no nulos; `wms.verificar_saldos()` sigue en 0 filas |
| 8 | `08-0009_operacion_diaria_y_reportes.sql` | Revisión diaria, programación de conteos, reportes | `select to_regclass('wms.vistas_guardadas'), to_regprocedure('wms.saldos_al(date)');` no son nulos |
| 9 | `09-0008_presentacion_principio_activo.sql` | **Único paso que toca algo de Compras**: un trigger en `catalogo.productos` | `select tgname from pg_trigger where tgname = 'proteger_presentacion_principio';` → 1 fila. Sin errores en Compras (Katia o Charlie abren una OC) |
| 10 | `10-seed_topologia.sql` | Posiciones, propietarios y zonas del almacén | `select count(*) from wms.posiciones;` → el número esperado del seed (más de 100); no va al historial (son datos) |

Notas:
- Los bloques 4 y 5 pesan ~85–90 KB. Si el editor se pone lento al pegarlos, **espera**; no se parte el texto sin aprobación de Sebas.
- **0009 va antes que 0008** a propósito: así lo único que toca Compras queda al final, y si algo sale mal ahí, todo lo anterior es solo `wms`.

## 6. Configuración después de las migraciones (Pasos 11 y 12)

| Paso | Qué haces tú | Verifica Claude | Bien si… |
|---|---|---|---|
| 11a | **Settings → Data API → Exposed schemas**: agregar `wms` y guardar | — | Aparece `wms` en la lista |
| 11b | Pegar el bloque de permisos que prepara Claude a partir de DEFINICIONES-ANTES: agrega `'wms'` a `public.schemas_compras_y_pagos()` y corre `select public.aplicar_grants_del_modulo();` | Compara que la lista sea la original **más** `wms`, y nada más | «Success»; `select 'wms' = any(public.schemas_compras_y_pagos());` → true |
| 12 | Crear los usuarios y roles de la tabla de personas en `wms.usuario_roles` (bloque que prepara Claude con los correos que Sebas complete) | `select rol, count(*) from wms.usuario_roles group by 1;` | Coincide con la tabla: Katia y Sandra `direccion_tecnica`; Charlie, Roberto y Jasury `jefe_almacen`; auxiliares `auxiliar`; Sebas y Andrés `admin_wms` |

## 7. Snapshot de después y pruebas (Pasos 13 y 14)

| # | Qué | Quién | Bien si… |
|---|---|---|---|
| 13.1 | Correr de nuevo `01-snapshot-estructura-y-filas.sql` y guardar **SNAPSHOT-DESPUÉS** | Ejecutor | Sin errores |
| 13.2 | Correr `02-snapshot-cartera.sql` y guardar **CARTERA-DESPUÉS** | Ejecutor | — |
| 13.3 | Comparar ANTES con DESPUÉS | Claude | **Cartera idéntica, fila por fila.** Conteos de filas idénticos. Las huellas cambian **solo** donde se espera (lista de abajo) |
| 13.4 | `select * from wms.verificar_saldos();` | Claude | 0 filas |
| 14.1 | **Login** de cada rol en el WMS con su usuario real | Katia, Charlie y los demás | Entran |
| 14.2 | **Permisos (RLS):** cada persona ve solo lo que le toca; un usuario sin rol no ve datos | Katia y Charlie | Como en la tabla de personas |
| 14.3 | **Cobranzas y Compras siguen igual:** abrir la cartera y una orden de compra | Katia y Charlie | Sin diferencias ni errores |
| 14.4 | Una consulta real del WMS (panorama, Kardex, un reporte) | Charlie | Responde y se ve bien |

**Diferencias esperadas** (cualquier otra es una alarma y se trata como falla):
- Nuevo schema `wms` (excluido del snapshot a propósito).
- Huella de **`public`** (funciones): cambia `schemas_compras_y_pagos()`.
- Huella de **`catalogo`** (triggers y funciones): aparece el trigger `proteger_presentacion_principio`.
- 9 filas nuevas `wms_…` en `supabase_migrations.schema_migrations` (excluido del snapshot).

## 8. Cuándo y cómo se revierte

**Si un bloque falla o se cuelga (Pasos 1 a 10):**
1. **STOP.** No se pega nada más.
2. Quien ejecuta copia el mensaje de error completo.
3. Claude hace **solo lecturas** para ver el estado: qué filas hay en el historial, si el schema `wms` existe y qué objetos tiene.
4. Se decide con Sebas: **reintentar el mismo bloque** (las migraciones son re-ejecutables y el bloque no duplica el historial) **solo después de entender la causa y con su OK**, o **revertir todo**.

**Cuándo se revierte todo (reversa completa):**
- El snapshot de Cobranzas o Compras cambia sin explicación, **o**
- alguien de Cobranzas o Compras no puede entrar o ve errores, **o**
- Sebas lo decide por cualquier otra razón.

**Cómo (ejecuta quien ejecutó, con Claude mirando por lectura):**
1. Si ya se hizo el Paso 11b: pegar la definición original de `public.schemas_compras_y_pagos()` guardada en DEFINICIONES-ANTES y correr `select public.aplicar_grants_del_modulo();`.
2. Si ya se hizo el Paso 11a: quitar `wms` de **Exposed schemas**.
3. Pegar `apps/wms/supabase/rollback/wms_0001_a_0009_rollback.sql` completo. Quita el trigger de `catalogo.productos`, borra el schema `wms` (con todo lo que tiene), quita `btree_gist` solo si la creó el WMS y borra **solo** las filas `wms_…` del historial. Está probado (`tests/db/rollback.test.ts` y `tests/db/ventana.test.ts`) y se puede correr dos veces sin efecto.
4. Correr de nuevo los snapshots (estructura y cartera). Deben ser **idénticos** a SNAPSHOT-ANTES y CARTERA-ANTES.

**Lo que la reversa NO deshace:** los productos que alguien haya dado de alta con `wms.crear_producto` quedan en `catalogo.productos` (son datos de Compras): se revisan a mano.

**Respaldo del proyecto:** es el último recurso, solo si lo anterior no alcanza y con decisión de Sebas. Restaurar un respaldo pierde todo lo registrado después de él en las tres apps, por eso la reversa del WMS existe y está probada.

## 9. Preparar los bloques (Claude, antes del día)

Desde la raíz del repositorio:

```
node apps/wms/scripts/ventana-supabase.mjs <carpeta_de_salida> <AAAAMMDDHHMMSS>
# ejemplo: node apps/wms/scripts/ventana-supabase.mjs /tmp/ventana 20261018210000
```
- La versión base es la fecha y hora de la ventana, con segundos entre 00 y 49 (los pasos usan esa versión y las siguientes). Tiene que ser **mayor que la última del proyecto** (`20261007182945` al 2026-10-10).
- Genera `01-0001_base.sql` … `09-0008_presentacion_principio_activo.sql` y `10-seed_topologia.sql`. Cada uno lleva cabecera, SQL tal cual está en el repo y la anotación en el historial (el seed no va al historial).

## 10. Después de la ventana
- Anotar en `progreso.md` qué se aplicó, cuándo y quién, con los dos snapshots y el resultado de las pruebas.
- Sebas decide aparte si el WMS tendrá deploy (Preview con datos reales o producción). **Esta ventana no lo incluye.**
- La carga inicial de Odoo y el paralelo siguen **postergados** hasta que existan las salidas (`carga-inicial-odoo.md`).

## 11. Riesgos conocidos
| Riesgo | Qué hacemos |
|---|---|
| El proyecto corre Postgres 17 y las pruebas locales y la CI corren Postgres 16 | El SQL es estándar y no usa nada propio de una versión. Si en el ensayo aparece una diferencia, se corrige antes. Pendiente: subir la imagen de la CI a Postgres 17 |
| Un bloque grande tarda o el editor se traba | Esperar; nunca partir el texto sin aprobación |
| Alguien opera Cobranzas o Compras durante la ventana | Se avisa antes (A2); si el snapshot cambia, se mira si la diferencia es operación normal o un efecto de la ventana |
| Las pruebas locales no cubren la API HTTP (PostgREST), el login real (GoTrue) ni Storage (`gate-0.md`) | Por eso existen los Pasos 11a y 14: lo que no se pudo probar antes se prueba con personas reales y el **WMS sin deploy de producción** |
| Los 9 pasos tocan permisos de un módulo compartido | Solo se agrega `wms` a la lista; DEFINICIONES-ANTES permite restaurarla tal cual |
