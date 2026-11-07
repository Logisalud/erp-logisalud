# Ventana del piloto en Supabase real (una página)

Proyecto consolidado **`qpkigzniatidsvnxikox`**. **Nada de esto se ejecutó en ninguna base real.** Se aplica a mano, con tu OK, con una herramienta que deje historial. Si una herramienta falla o se cuelga: **detenerse y avisar** (no cambiar de método ni editar el SQL).

## 1. Antes de empezar (prerrequisitos)
1. **Copia de Supabase del mismo día**, verificada en el panel (Database → Backups). Sin ella no se empieza.
2. Bucket **privado** `wms-documentos` creado en Storage **antes de la 0025** (sin acceso público; `authenticated` puede subir y leer).
3. Esquema **`wms`** expuesto en Settings → Data API → Exposed schemas (si falta: error 406 «Invalid schema»).
4. `wms` agregado a `public.schemas_compras_y_pagos()` y luego `select public.aplicar_grants_del_modulo();` (si falta: 403). Las tablas del ledger siguen sin INSERT/UPDATE por RLS (`tests/db/rls.test.ts`).
5. Parámetro `guia_modo = PANEL` (lo siembra la 0036; confirmarlo después) y `modo_piloto = si` (0038).
6. Compras tiene `ordenes_compra.estado` y `ordenes_compra_items.cantidad_recibida` y existe `catalogo.productos` (verificar contra la base real).

## 2. Orden exacto de migraciones (`apps/wms/supabase/migrations/`)
**0001 → 0046, SIN la 0008** (la 0010 no existe; la 0008 va solo en el go-live). Cada archivo se corre una vez, en orden numérico: 0001–0007, 0009, 0011–0046. Después, las semillas `seeds/0001_topologia.sql` y `seeds/0002_transporte_inicial.sql`. Nuevas del piloto: 0042 carga de ensayo, 0043 Mis rutas, 0044 registro de reinicios, 0045 sincronización automática de OC, 0046 ruteo de Pedidos en la copia del pedido.
Ensayo previo (ya hecho en Postgres 17.5): `WMS_OMITIR=0008 WMS_PROBAR_REVERSA=1 apps/wms/scripts/ensayo-migraciones.sh <url-de-un-Postgres-desechable>`.

## 3. Verificación después de cada bloque (0001–0009 · 0011–0024 · 0025–0036 · 0037–0046 y semillas)
```sql
select * from wms.verificar_saldos();                                   -- 0 filas
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'wms' and has_function_privilege('public', p.oid, 'execute');   -- 0 filas
select tablename from pg_tables where schemaname = 'wms' and not rowsecurity;       -- 0 filas
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'wms' and has_function_privilege('authenticated', p.oid, 'execute');  -- = la lista de tests/db/aislamiento.test.ts
select count(*) from wms.v_oc_items;     -- al final: ver la sección 6
```
Esperado al terminar: 106 tablas con RLS, 185 funciones para `authenticated`, ninguna para PUBLIC.

## 4. Variables de entorno en Production del proyecto Vercel `erp-logisalud-wms` (solo NOMBRES; los valores los carga Sebas, nunca se escriben aquí ni en el chat)
`WMS_MODO_PILOTO=1` (valor fijo) · `NUBEFACT_ENTORNO=DEMO` · `NUBEFACT_RUTA` y `NUBEFACT_TOKEN` (credenciales DEMO) · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` (solo servidor) · `NEXT_PUBLIC_BASE_PATH` si corresponde. **Nunca** `WMS_DEMO`, `WMS_DEMO_LOCAL` ni `WMS_GO_LIVE` (con cualquiera la app se niega a arrancar). `WMS_PEDIDOS_URL` y `WMS_PEDIDOS_SECRETO`: **solo cuando se apruebe la ruta de Pedidos**; mientras tanto el WMS no envía nada a Pedidos aunque estén puestas.

## 5. Cambio propuesto en `apps/wms/vercel.json` (NO aplicado; solo texto)
```diff
 {
   "$schema": "https://openapi.vercel.sh/vercel.json",
+  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- apps/wms packages/auth package.json package-lock.json",
   "git": {
     "deploymentEnabled": {
-      "main": false
+      "main": true
     }
   }
 }
```
Hace que `main` despliegue a producción y que solo construya cuando cambian `apps/wms` o `packages/auth`. Antes: reactivar la protección de la Preview (Settings → Deployment Protection) y cargar las variables de la sección 4.

## 6. Prueba mínima de lectura de OC reales (el camino más simple)
Sin Preview con datos reales y sin tocar Compras: aplicar la ventana (secciones 1 a 3), cargar las variables (4), desplegar en modo piloto (5) y entrar como Dirección Técnica, asistente o administrador. Al abrir **Entradas** el WMS sincroniza solo con Compras (P6): copia las OC abiertas y dice «Última sincronización con Compras: hace X min». Solo **lee** Compras (`wms.v_oc_items`); no escribe nada allá.

Lista de verificación (resultado esperado):
1. `select count(distinct oc_id) from wms.v_oc_items;` → **40** (OC abiertas de mercadería: 4 enviadas, 31 confirmadas, 5 parcialmente recibidas).
2. `select count(*) from wms.v_oc_items;` → **291** ítems (185 productos distintos).
3. Pantalla **Entradas** → texto «Última sincronización con Compras: hace un momento» y sin mensaje de error.
4. `select count(*), min(version), max(version) from wms.oc_versiones;` → **40** copias, versión **1**.
5. Pantalla **Órdenes de compra del piloto** → 40 filas, todas «Copia al día».
6. `select ultima_en, ultimo_error from wms.oc_sincronizacion;` → hora reciente, `ultimo_error` vacío.
7. `select count(*) from wms.audit_events where evento = 'oc_version_creada';` → **40**.
8. Volver a abrir Entradas antes de 30 min → no repite (la hora no cambia); «Revisar Compras ahora» la fuerza.
9. Banner «PILOTO, datos de prueba» en cada pantalla y bienvenida «Esto es un PILOTO» en el primer ingreso.
10. `select count(*) from wms.eventos_pedidos where estado <> 'RETENIDO_PILOTO';` → **0** y ningún cambio en tablas de Compras (el WMS no escribe en `compras.*` ni en `catalogo.*`).
Si el 1 o el 2 no dan: revisar que Compras tenga las columnas del prerrequisito 6 y que el rol de la app pueda leer `compras.*` (grants del paso 1.4). Pendiente de Compras/Catálogo (no bloquea esta prueba): banderas «controla lote» y datos regulatorios de los 185 productos.

## 7. Reversa
`apps/wms/supabase/rollback/ventana_piloto_reversa.sql` (re-ejecutable): borra el esquema `wms` completo. Revisado: **ninguna migración de la ventana agrega nada fuera de `wms`** (la 0008 no se aplica). Probada en Postgres 17: cadena → reversa (dos veces) → no queda nada del WMS, lo de fuera de `wms` queda idéntico → cadena de nuevo, sin errores (`WMS_PROBAR_REVERSA=1` y `tests/db/reversa-ventana.test.ts`). A mano, si se hicieron: sacar `wms` de `public.schemas_compras_y_pagos()` y de Data API; vaciar el bucket solo si Sebas lo decide; quitar las variables de Vercel.
