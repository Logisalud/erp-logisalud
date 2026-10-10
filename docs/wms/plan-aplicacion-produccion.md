# Plan de aplicación del WMS a producción — SOLO DOCUMENTO

> **No se ejecuta nada de esto.** Ni migraciones, ni deploy, ni variables. Este plan se aprueba antes y lo ejecuta **Sebas** (o quien él designe),
> **no Claude**. Regla del proyecto: sobre `erp-cobranzas` Claude solo lee, y si una herramienta falla o se cuelga durante una operación sobre una base real,
> **se detiene y se avisa**: no se cambia de método ni se modifica el SQL sin aprobación expresa.

## 0. Contexto
- Proyecto Supabase consolidado `erp-cobranzas` (id `qpkigzniatidsvnxikox`), compartido con Cobranzas y Compras. El WMS vive en un schema propio, `wms`.
- Estado actual: **nada del WMS está aplicado** (el intento parcial de 0001–0003 se revirtió a mano; ver el historial en `progreso.md`).
- La cadena es `0001 … 0008` + seed de topología. Todas son re-ejecutables y aditivas respecto a `public`, `catalogo` y `compras` (solo agregan vistas y grants dentro de `wms`; `crear_producto` inserta filas en `catalogo.productos`; **0008 agrega un trigger a `catalogo.productos`**, ver `propuesta-presentacion-principio-activo.md`).

## 1. Prerrequisitos (antes de la ventana)
1. **Aprobación expresa** de Sebas del PR #168 y de este plan. Sin merge a `main` no hay despliegue; las migraciones **no** se aplican solas.
2. Verificar en solo lectura que `compras.ordenes_compra.estado`, `ordenes_compra_items.cantidad_recibida/cantidad_facturada/producto_id` y `catalogo.productos` existen (ya verificado el 2026-10-08).
3. Verificar que `wms` **no** existe y registrar si `btree_gist` ya existe (y quién depende de ella, vía `pg_depend`).
4. Confirmar que **el mismo SQL ya pasó** la cadena completa en Postgres local con todas las pruebas (`npm run test:db:wms`: 115 pruebas, incluida la de reversa).
5. Definir **quién ejecuta** y **quién observa** (dos personas), y el horario de poco uso (fuera del cierre de cobranzas).
6. Respaldar: confirmar el punto de restauración más reciente del proyecto (backup/PITR) y anotar su hora.

## 2. Snapshot de control (ANTES y DESPUÉS)
Solo lectura. Guardar los resultados con fecha y hora, **antes** de empezar y **después** de terminar (y de nuevo tras una eventual reversa):

- Ocho indicadores de Cobranzas: `SUM(saldo_pendiente)` de documentos pendientes (referencia 2026-10-08: **646.898,20**), conteos de clientes, documentos, pagos, aplicaciones y los demás
  acordados en el reporte de snapshot (los mismos usados el 2026-10-08).
- `select count(*) from catalogo.productos;` (referencia: **509**) y `select count(*) from compras.ordenes_compra;`.
- Lista de objetos fuera de `wms` (`pg_class`, `pg_proc`, `pg_extension`) — misma consulta que la prueba `tests/db/rollback.test.ts`.
- Criterio de éxito: **ningún indicador cambia**.

## 3. Orden de aplicación
Con la herramienta acordada (ver §4), una migración a la vez, verificando entre cada una:

| # | Archivo | Verificación posterior (solo lectura) |
|---|---|---|
| 1 | `0001_wms_base.sql` | Existe `wms`; RLS activo en sus tablas |
| 2 | `0002_wms_ledger.sql` | `select * from wms.verificar_saldos();` → 0 filas |
| 3 | `0003_wms_productos.sql` | Existe `wms.crear_producto` (se reemplaza en 0006) |
| 4 | `0004_wms_entradas.sql` | — |
| 5 | `0005_wms_flujo_ingreso.sql` | Existen `wms.v_oc_lineas` y `wms.v_oc_items` |
| 6 | `0006_wms_regulatorio_y_verificacion.sql` | Existen `wms.editar_regulatorio`, `producto_regulatorio_cambios` y el parámetro `kardex_codigo_formato` |
| 7 | seed `supabase/seeds/0001_topologia.sql` | Conteo de posiciones y propietarios esperados |

Después (pasos de configuración de `aplicar-migraciones.md`): exponer `wms` en Data API, agregarlo a `public.schemas_compras_y_pagos()` + `aplicar_grants_del_modulo()`, y cargar `wms.usuario_roles`.
Cada uno es un **cambio aparte** y se anota. Recién ahí puede decidirse el deploy de Preview con datos reales (otra aprobación).

## 4. Herramienta y reglas de ejecución
- **Herramienta que deje historial** (migraciones de Supabase o el panel SQL con registro). Cada migración se registra con su nombre y hora.
- Antes de cada ejecución: `set lock_timeout = '5s'; set statement_timeout = '60s';` (**0001–0007 ya no usan `drop … if exists`**: verifican con `pg_trigger`/`pg_policies`/`pg_constraint`/`to_regprocedure` antes de borrar. Ese patrón sobre objetos inexistentes **colgó** la herramienta MCP el 2026-10-08; hasta el 2026-10-08 (Batch 3) las migraciones 0001, 0002, 0004 y 0005 todavía lo usaban —el plan lo daba por corregido y no lo estaba—, y ahora lo comprueba la prueba `tests/db/migraciones.test.ts`: sin ese patrón y sin avisos «does not exist, skipping» al aplicar la cadena en una base nueva).
- Sin `drop` ni `alter` sobre tablas de otros módulos; si una migración intentara hacerlo, se detiene.
- **Si algo falla o se cuelga: detenerse.** Solo lecturas para reportar el estado. No cambiar de herramienta, no partir el SQL, no reintentar con otro método sin la aprobación de Sebas.

## 5. Reversa (probada en local)
- Script: `apps/wms/supabase/rollback/wms_0001_a_0009_rollback.sql` (`lock_timeout`, `drop schema wms cascade`, y `drop extension btree_gist` **solo** si la creó el WMS y nada depende de ella).
- **Probado** en `tests/db/rollback.test.ts`: aplica stubs → foto → cadena completa + seed → reversa → foto idéntica (objetos, funciones, columnas, extensiones, constraints y filas de `catalogo.productos`), y una segunda reversa sin efecto.
- Pasos manuales previos a la reversa, si ya se hicieron: quitar `wms` de `public.schemas_compras_y_pagos()` y revertir los grants concedidos a mano.
- **No deshace** los productos que `crear_producto` haya insertado en `catalogo.productos` (son datos de Compras): revisarlos a mano.
- Después de revertir: snapshot de nuevo; debe coincidir con el «antes».

## 6. Quién hace qué
| Paso | Quién |
|---|---|
| Aprobar PR y plan | Sebas |
| Snapshot antes / después | Sebas (o quien designe); Claude puede preparar las consultas, **no** correrlas sobre `erp-cobranzas` |
| Aplicar migraciones y seed | Sebas (o quien designe) |
| Verificaciones de solo lectura | Quien ejecuta; Claude solo si Sebas lo pide, y solo lectura |
| Reversa, si hace falta | Sebas, con el script probado |
| Exposición en Data API, grants y roles | Sebas |
| Deploy de Preview/producción | Cambio aparte, con su propia aprobación |

## 7. Criterios de aceptación
- Snapshot idéntico antes/después (excepto el schema `wms`, que ahora existe).
- `wms.verificar_saldos()` devuelve 0 filas; las vistas de Compras responden; el usuario de prueba de cada rol ve solo lo que debe (RLS).
- Registro de la aplicación (qué, cuándo, quién) en `progreso.md`.
