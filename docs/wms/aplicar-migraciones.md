# Aplicar las migraciones del WMS (a mano, cuando lo decidas)

> **No se aplicó nada en ninguna base.** Este documento es la lista de pasos para cuando exista una base donde probarlas
> y, después, para producción. Las migraciones están en `apps/wms/supabase/migrations/` y son re-ejecutables.

Orden: `0001_wms_base.sql` → `0002_wms_ledger.sql` → `0003_wms_productos.sql` → `0004_wms_entradas.sql` → `0005_wms_flujo_ingreso.sql` → `0006_wms_regulatorio_y_verificacion.sql` → `0007_wms_inventario.sql` → seed `supabase/seeds/0001_topologia.sql`
(generado con `npm run seed:topologia --workspace erp-logisalud-wms`).

**0005 reemplaza el flujo de 0004** (la solicitud pasa a ser primaria; retira `crear_ingreso`, `guardar_lotes`, `editar_solicitud`, la tabla `ingreso_lineas` y
`v_recepciones_compra` queda sin uso). Se aplica **después** de 0004 y es re-ejecutable por sí sola. Agrega el estado sanitario `DEVOLUCIONES`,
`wms.v_oc_items` (solo lectura de Compras; se crea solo si existen `compras.ordenes_compra*`, `compras.proveedores` y `catalogo.productos`) y
`wms.estado_registro_compras()` / `revisar_registro_compras()` (la integración con Compras es manual). Requiere en Compras las columnas
`ordenes_compra.estado` y `ordenes_compra_items.cantidad_recibida`: **verifícalas contra la base real antes de aplicar** (en las pruebas locales son stubs).

**0006** (D-37, D-15, D-29, D-31): retira `validar_producto`/`actualizar_regulatorio` y las policies de escritura sobre `producto_regulatorio`; agrega `concentracion` y
`condicion_almacenamiento`, el historial inmutable `producto_regulatorio_cambios`, `editar_regulatorio` y el nuevo `crear_producto` (12 argumentos); `movimientos.preparador_id` con su
restricción; el parámetro `kardex_codigo_formato`; y la vista `v_stock_por_origen`. **No usa `drop … if exists` sobre objetos que pueden no existir** (verifica antes con `pg_policies`/`pg_trigger`/`to_regprocedure`),
porque la herramienta MCP de Supabase se colgó con ese patrón. El plan completo para producción está en `plan-aplicacion-produccion.md`.

**0007** (Batch 3): Kardex (`kardex_filas`) e historia del lote, movimientos internos (`ordenes_movimiento*` + funciones; **redefine `postear_movimiento`** para guardar a preparador y verificador), conteos y ajustes
(`conteos`, `conteo_lineas`, `ajustes_inventario`; el saldo del sistema se lee solo por `conteo_lineas_para`), carga inicial y el trigger `pausa_por_conteo`. Amplía `alertas_tipo_check`. Todo dentro de `wms`.

**0008** (D-38, después de 0007): trigger `proteger_presentacion_principio` en `catalogo.productos` (rechaza que una sesión de aplicación cambie presentación o principio activo; **no** bloquea INSERT, otras columnas, `postgres` ni `service_role`) y `wms.editar_regulatorio` con esos dos campos. **Toca un objeto de Compras (agrega un trigger)**: se aplica solo con la salida a producción, con snapshot de control antes y después. Reversa: `supabase/rollback/wms_0008_rollback.sql`.

Antes de aplicar:
1. Exponer el schema `wms` en Dashboard → Settings → Data API → Exposed schemas (si falta: HTTP 406 `Invalid schema`).
2. Agregar `wms` a `public.schemas_compras_y_pagos()` y ejecutar `select public.aplicar_grants_del_modulo();` (si falta: HTTP 403).
   Ojo: esa función concede lo que concede al resto de los módulos. Aunque llegara a conceder DML sobre `wms.partidas` o
   `wms.saldos`, las policies de esas tablas no tienen INSERT/UPDATE (RLS niega por defecto) y los triggers rechazan
   UPDATE/DELETE: hay un test que lo prueba otorgando todos los permisos (`tests/db/rls.test.ts`).
3. Cargar los roles: insertar en `wms.usuario_roles` a Katia (`direccion_tecnica`), Sandra (`asistente_dt`), Charlie
   (`jefe_almacen`), Roberto y Jasury (`reemplazo_jefe`), auxiliares (`auxiliar`), auditoría y administración.
4. `catalogo.productos` debe existir (la migración agrega FK solo si existe).
5. Verificar con `select * from wms.verificar_saldos();` (debe devolver 0 filas) y con las pruebas de `tests/db`.

No cubierto por las pruebas locales (ver `gate-0.md §G.1`): PostgREST (exposición y grants por HTTP), GoTrue (JWT real),
Storage, RLS real de Compras (`acceso_abierto_temporal`).
