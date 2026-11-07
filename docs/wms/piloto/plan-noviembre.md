# Plan de noviembre: conexión real a las OC y piloto «como real»

Respuestas de Claude a las preguntas H del mensaje del 3-nov-2026, con las propuestas que piden tu aprobación. **Nada de esto se aplicó en ninguna base real ni se desplegó.** Fecha de lectura de datos: 3-nov-2026 (solo lectura).

> **Actualización 4-nov (Sebas):** la ventana aplica **todo MENOS la 0008**; la 0008 va solo en el go-live, al final (PIL-16). Se suman las migraciones 0039 (firma), 0040 (reglas de vencimiento y formato) y 0041 (PIL-8).

## H(a) ¿La ventana en Supabase real ya se hizo?
**No.** En el proyecto consolidado (`qpkigzniatidsvnxikox`) no existe el esquema `wms`: hay 0 de las 36 migraciones del WMS (0001 a 0036). Lo aplicado hoy es Cobranzas y Compras (la última de Compras es la 0086; la última de Cobranzas, del 3-nov). Existe `almacen`, pero es de Compras.
**Propuesta de fecha: jueves 6-nov**, si antes se mergean #209 (bloque de salidas) y el PR del piloto (guía en panel, informe de carga, hojas por rol; migración 0036). Con: la guía `docs/wms/aplicar-migraciones.md` (ensayada en Postgres 17: 36 migraciones, cada una dos veces, y las 642 pruebas de base de datos en verde), la verificación de una copia de Supabase **del mismo día** en el panel (criterio B12 del Go/No-Go) y la reversa.
**Reversa — lo que falta:** el esquema `wms` es nuevo, así que deshacer = borrarlo entero, más la reversa de la 0008 (la única que toca algo de Compras: un trigger en `catalogo.productos`; ya existe `supabase/rollback/wms_0008_rollback.sql`). Hay que escribir y **ensayar** un script único de reversa antes de la ventana (lo agrego a la guía).

## H(b) Qué existe ya
- **Botón de guías:** existe (`emitir-guia`, cliente Nubefact real y simulador, consulta, anulación, baja tras la salida). En la rama del piloto está además «Registrar guía emitida» (modo panel, migración 0036). **Falta:** probar el botón completo contra la cuenta DEMO de Nubefact (la emisión real nunca se verificó).
- **Seguimiento del cliente:** **no existe**; solo el plan escrito (`docs/wms/salidas/seguimiento-de-pedidos.md`).
- **Sección del transportista («Mis rutas»):** **no existe**. Existen la ruta, el cierre y el LS-FR.43.03 que opera el Jefe de Transporte; el conductor no tiene pantallas.
- **Firma:** el acta guarda quién firma (`acta_firmas`), pero **no hay firma dibujada ni orden de firmas aplicado**; no encontré PIN en el código (la idea del celular compartido está solo en documentos).
- **`modo_piloto`:** no existe.

## H(c) Orden de construcción que propongo
1. Cerrar #209 y el PR del piloto. 2. **Ventana** (migraciones 0001–0036, con tu OK).
3. **A.1 + B** (lectura de OC con versiones, `modo_piloto`, marca de agua, Nubefact DEMO, Pedidos apagado), con tests.
4. **E-P0** (movimientos internos y «salida de cuarentena») — **lo subo antes de C**: son reglas de integridad y con usuarios reales no pueden esperar.
5. **C** (firma). 6. **A.2** (despliegue de producción en modo piloto; empieza el piloto). 7. **D** (script de reinicio; debe estar listo antes de pedir el primer reinicio). 8. E resto, F. 9. G.
Es tu orden, salvo E-P0 adelantado. Dime si prefieres el tuyo exacto.

## H(d) Las OC reales: cuántas se cargan tal cual
- Hay 64 OC: 54 de mercadería y 10 de «bien».
- **40 OC abiertas de mercadería** (4 enviadas, 31 confirmadas, 5 parcialmente recibidas): **las 40 se cargan tal cual** (291 ítems, 185 productos distintos, todos los ítems con producto del catálogo; 26 ítems ya sin pendiente).
- Quedan fuera: 10 recibidas completas, 4 borradores, 4 anuladas, y las 10 de «bien» (no son mercadería; confírmame).
- **Lo que falta de Compras/Catálogo:**
  1. Las banderas del catálogo: **0 de 659 productos marcados «controla lote»** y solo 5 con «controla vencimiento». Hay que corregirlas para los 185 productos en juego.
  2. Los **datos regulatorios** (registro sanitario y su vencimiento, fabricante, forma, concentración, condición de almacenamiento) de esos 185 productos: viven en el WMS (hoy vacío); los carga y valida Dirección Técnica.
  3. **Propietario de la mercadería:** la OC de Compras no lo trae; confirmar cómo se asigna.

## A.2 Primera publicación conectada a la base real (propuesta, sin ejecutar)
Hoy `apps/wms/vercel.json` tiene `git.deploymentEnabled.main = false` (por eso el WMS nunca tuvo producción). Propongo, en este orden:
1. **Variables de Production** (solo en el proyecto `erp-logisalud-wms`): `WMS_MODO_PILOTO=1`, claves del Supabase consolidado y credenciales **DEMO** de Nubefact. Nunca `WMS_DEMO`.
2. **Guarda en `lib/demo.ts`:** en producción la app **se niega a arrancar** salvo `WMS_MODO_PILOTO=1` (piloto) o `WMS_GO_LIVE=1` (diciembre). `NUBEFACT_RUTA` hoy se rechaza siempre en producción; se permite **solo** con `WMS_MODO_PILOTO=1` y se vuelve a rechazar en go-live. La bandera es una variable de entorno (no un parámetro de base de datos) para que nadie la cambie desde la aplicación.
3. `vercel.json`: `main: true` y `ignoreCommand` para que solo construya cuando cambian `apps/wms` o `packages/auth` (no gasta builds en los demás cambios).
4. **Dirección de uso:** la propia del proyecto (`erp-logisalud-wms.vercel.app/wms`; la ruta `/wms` ya es el `basePath`). **No toco Cobranzas:** hoy no tiene ningún rewrite a `/wms` (solo el de `/compras`) y no lo agrego.
5. **Recordatorio:** antes de conectar nada real, reactivar la **protección de la Preview** (Vercel → Settings → Deployment Protection).

## B.1 Que el WMS solo lea Compras (y qué pedimos a Compras)
- **WMS:** nunca escribe en `compras.*` (test que lo comprueba: ninguna función del esquema `wms` modifica tablas de Compras). Durante el piloto no se muestra «recibido según almacén» dentro de Compras. Hoy el WMS lee las OC en vivo (`wms.v_oc_items`); se agrega una copia **inmutable por versión** (`wms.oc_versiones`): si la OC cambia, versión nueva y alerta; la copia nunca se borra.
- **Hallazgo en Compras (toca Compras: lo apruebas tú):** `authenticated` tiene **DELETE** sobre `ordenes_compra` y `ordenes_compra_items`, con políticas `ALL` y **sin ningún trigger**: hoy cualquier usuario con acceso podría borrar una OC. **Propuesta (migración de Compras, sin aplicar):** trigger `BEFORE DELETE` en ambas tablas que rechace el borrado si la OC tiene copia o recepción en el WMS, y que solo deje borrar borradores sin esa huella; Compras ya tiene «anular» (`anulado_*`) para el resto.

## D. Reinicio de datos (script manual; lista para aprobar)
Con copia de Supabase del mismo día. Cada reinicio se registra en una tabla nueva **fuera** de las que se borran (`wms.reinicios`, solo se agregan filas).
**Se conservan** (topología, personas, reglas, datos regulatorios): `area_estado_admitido, asignaciones_posicion, cargos_usuario, documentos_regulatorios, documentos_sustento, estados_sanitarios, fabricantes, origenes, parametros, perfil_documental_cliente, permisos_rol, personal_transporte, posicion_geometria, posiciones, producto_codigos, producto_regulatorio, producto_regulatorio_cambios, propietarios, tablas_muestreo, tablas_muestreo_tramos, tipos_area, tipos_movimiento, transiciones_estado, usuario_roles, vehiculos, vistas_guardadas`.
**Se borran** (transaccional): `acta_firmas, actas_organolepticas, actas_recepcion, ajustes_conformidad, ajustes_inventario, alertas, antecedentes_calidad, bulto_contenido, bultos, cambios_lote_asignado, carga_bultos, carga_exclusiones, cargas_coa, cargas_coa_items, cargas_iniciales, cargas_iniciales_lineas, conteo_lineas, conteos, devoluciones_picking, dictamenes_cliente, discrepancias_picking, entregas_transportista_cliente, eventos_pedidos, expediente_documentos, expediente_faltantes, expedientes, guia_numeros, guias_remision, importaciones_pedidos, ingreso_lotes, ingresos, lotes, ls_fr_escaneos, ls_fr_impresiones, movimientos, observaciones_conformidad, observaciones_liberacion, ordenes_baja, ordenes_baja_evaluaciones, ordenes_baja_lineas, ordenes_baja_sustentos, ordenes_movimiento, ordenes_movimiento_lineas, ordenes_picking, ordenes_picking_lineas, partidas, pedidos_despacho, programacion_conteos, quiebres_stock, registros_ls_fr_43_03, reservas, reservas_lote, revision_pendientes, revisiones_diarias, ruta_cierres, ruta_logger_importes, ruta_logger_lecturas, ruta_paradas, ruta_versiones, rutas, saldos, salida_lineas, salida_movimientos, salidas, solicitud_ingreso_cambios, solicitud_ingreso_lineas, solicitud_ingreso_versiones, solicitudes_ingreso`.
**A decidir contigo:**
- `audit_events`: propongo **exportarla al archivo del piloto y luego vaciarla** (refiere filas que ya no existen). Si prefieres conservarla, queda con referencias huérfanas.
- `correlativos` y `guia_correlativos`: **no se reinician** (los números de actas del piloto no se reutilizan); en el go-live, la guía real arranca con el correlativo confirmado por la contadora.
- `revision_focos`: el script lee su contenido antes (si es configuración, se conserva).
- **Archivos (bucket `wms-documentos`):** se borra todo salvo el prefijo de los documentos regulatorios; el script **lista el bucket y te muestra los prefijos** antes de borrar nada.

## E-P0 (para cuando me des el visto bueno)
Antes de corregir, reproduzco cada error en demo y en la base de pruebas y te digo qué lado fallaba (pantalla o base de datos). Con tests en ambos lados.

## Pendientes que necesitan tu decisión
1. Fecha de la ventana (propuesta: jueves 6-nov). 2. Aprobar A.2 (variables, guarda y `vercel.json`). 3. Aprobar la propuesta para Compras (trigger de borrado). 4. Aprobar la lista de reinicio y decidir `audit_events`. 5. Orden de construcción. 6. Mercadería vs «bien» en las OC y cómo se asigna el propietario.

## Avance de B.1 y de la propuesta para Compras (rama `feat/wms-piloto`, migración 0038, sin aplicar)
- Hecho en el WMS: copia inmutable de cada OC (`wms.oc_versiones`, solo se agregan filas), alerta `OC_CAMBIADA`, pantalla «Órdenes de compra del piloto» y un test que garantiza que el WMS no escribe en Compras. **Hallazgo resuelto (PIL-8, decidido 4-nov):** en modo piloto el WMS no escribe en `catalogo.productos`: Compras crea los productos y el WMS los completa («Productos por completar»).
- **Propuesta para Compras, sin aplicar:** `docs/wms/piloto/propuesta-compras-borrado-oc.sql` — trigger BEFORE DELETE en `ordenes_compra` y `ordenes_compra_items` que rechaza borrar si la OC tiene copia o solicitud en el WMS, y que solo deja borrar borradores. Hoy `authenticated` tiene DELETE y no hay triggers.
- Durante el piloto «recibido según almacén» no aparece en Compras (Compras no lee nada del WMS) y el WMS no escribe `cantidad_recibida`: ambos quedan cubiertos por el test.
- Pendiente tuyo: el botón de guías contra la cuenta DEMO real de Nubefact (sin credenciales aquí; listo `apps/wms/e2e-preview/nubefact-preview.spec.ts` y el workflow).

## P6 · Sincronización automática de las OC (aprobada 7-nov, migración 0045)
Al abrir «Entradas» y «Órdenes de compra del piloto», el WMS revisa Compras solo si la última sincronización tiene más de 30 minutos (`wms.sincronizar_ocs_si_toca`), con candado para que dos personas no la corran a la vez. La pantalla dice «Última sincronización con Compras: hace X min» y, si falla, un mensaje en lenguaje llano (el detalle técnico queda en `wms.oc_sincronizacion`). Cada versión nueva de una OC queda en `audit_events` (`oc_version_creada`) y cada sincronización que cambió algo, como `oc_sincronizacion`. No hay cron ni cambios en `vercel.json`: solo corre cuando alguien abre la pantalla; «Revisar Compras ahora» sigue y usa la misma función.
