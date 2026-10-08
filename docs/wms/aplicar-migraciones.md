# Aplicar las migraciones del WMS (a mano, cuando lo decidas)

> **No se aplicó nada en ninguna base.** Este documento es la lista de pasos para cuando exista una base donde probarlas
> y, después, para producción. Las migraciones están en `apps/wms/supabase/migrations/` y son re-ejecutables.

Orden: `0001_wms_base.sql` → `0002_wms_ledger.sql` → `0003_wms_productos.sql` → `0004_wms_entradas.sql` → `0005_wms_flujo_ingreso.sql` → seed `supabase/seeds/0001_topologia.sql`
(generado con `npm run seed:topologia --workspace erp-logisalud-wms`).

**0005 reemplaza el flujo de 0004** (la solicitud pasa a ser primaria; retira `crear_ingreso`, `guardar_lotes`, `editar_solicitud`, la tabla `ingreso_lineas` y
`v_recepciones_compra` queda sin uso). Se aplica **después** de 0004 y es re-ejecutable por sí sola. Agrega el estado sanitario `DEVOLUCIONES`,
`wms.v_oc_items` (solo lectura de Compras; se crea solo si existen `compras.ordenes_compra*`, `compras.proveedores` y `catalogo.productos`) y
`wms.estado_registro_compras()` / `revisar_registro_compras()` (la integración con Compras es manual). Requiere en Compras las columnas
`ordenes_compra.estado` y `ordenes_compra_items.cantidad_recibida`: **verifícalas contra la base real antes de aplicar** (en las pruebas locales son stubs).

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
