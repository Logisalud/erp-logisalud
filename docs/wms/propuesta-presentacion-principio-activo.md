# Propuesta (D-38): edición de presentación y principio activo — qué cambia en Compras

**Estado: PROPUESTA. No se implementó ni se aplicó nada.** Hace falta tu aprobación del cambio de permisos en Compras.

## Lo que decidiste
Presentación y principio activo viven **solo** en `catalogo.productos`. Compras puede llenarlos **al crear** un producto nuevo. Una vez creado, **solo Katia y Sandra** los editan, desde la ficha del WMS, con el mismo historial que los demás datos regulatorios (campo, antes, después, usuario, fecha, motivo obligatorio).

## Cómo está hoy (leído en el repo; falta releerlo en la base real, solo lectura, antes de aplicar)
- `catalogo.productos` tiene RLS: lectura para cualquier área con `mi_area()`; **escritura** (`productos_escritura`, `for all`) para las áreas `compras`, `direccion_tecnica` y `admin` (migración `0005_catalogo_productos_y_rol.sql` de Compras).
- **El código de la app de Compras no inserta ni actualiza productos**: solo los lee (buscador de producto, órdenes de compra, recepciones, facturas pendientes). El catálogo se carga por migraciones/importaciones (p. ej. `0077_catalogo_jampharma.sql`). Hoy ninguna pantalla de Compras edita presentación ni principio activo.
- Pedidos tiene su proyecto Supabase aparte; no usa este catálogo consolidado. Cobranzas no lo toca.

## Qué cambia (propuesta)
Un solo cambio, aditivo, en una migración nueva del WMS (0007) que **no cambia policies ni grants de Compras**:

1. **Trigger `BEFORE UPDATE OF presentacion, principio_activo` en `catalogo.productos`.** Si el rol de la sesión es `authenticated` y el valor cambia, **rechaza** el cambio con un mensaje claro («Presentación y principio activo los edita Dirección Técnica desde el WMS»), **salvo** cuando el cambio viene de `wms.editar_regulatorio` (que ya exige rol Katia/Sandra, motivo y deja historial; marca la transacción con una bandera local).
2. **`INSERT` no cambia**: Compras (y DT/admin) siguen creando productos con ambos campos, como hoy.
3. **No se tocan**: lectura, el resto de columnas (precio, marca, unidad, estado, lote, vencimiento, etc.), ni las policies de Compras. Las cargas por migración/importación (rol `postgres`/`service_role`) **no** se bloquean: el trigger solo actúa sobre `authenticated`.
4. **WMS:** `editar_regulatorio` acepta `presentacion` y `principio_activo` (con historial como los demás), y la ficha del producto los muestra en el editor.

**Efecto neto para Compras:** pierde la posibilidad (que hoy no usa en pantalla) de **modificar** esos dos campos después de la creación; conserva todo lo demás. Si alguna persona de Compras hoy los corrige por otra vía (SQL manual, importación con rol `authenticated`), esa vía quedaría bloqueada: por eso se lee la base real antes.

**Alternativa descartada:** revocar `UPDATE` a nivel de columna. `aplicar_grants_del_modulo()` vuelve a conceder a nivel de tabla y lo desharía; el trigger no depende de grants.

## Cómo verificaré que Compras sigue funcionando (antes de pedirte aplicar nada)
1. **Lectura de la base real (solo lectura):** policies, grants y triggers vigentes de `catalogo.productos`, y si alguna función/vista de Compras o Pedidos actualiza esas columnas. Los stubs de las pruebas locales se ajustan para reflejar exactamente eso.
2. **Pruebas en Postgres local (con el SQL real de Compras copiado):**
   - Compras **crea** un producto con presentación y principio activo → OK.
   - Compras **actualiza** otras columnas (precio, marca, estado, controla_lote…) → OK.
   - Compras **actualiza** presentación o principio activo → rechazado con el mensaje.
   - Katia y Sandra editan con `editar_regulatorio` → OK y con historial; otros roles → 42501; sin motivo → error.
   - Importaciones con `service_role`/`postgres` → OK.
3. **Regresión:** `npm run test --workspace erp-logisalud-compras` (883) y `build:compras`, `build:cobranzas`, `build:pedidos` sin diferencias; `git diff` sin cambios en `apps/compras`, `apps/cobranzas`, `apps/pedidos`.
4. **Reversa probada:** `drop trigger` + restaurar la función `editar_regulatorio` anterior (script de reversa de 0007, probado en local).
5. **Después de que tú la apliques** (a mano, con historial y `lock_timeout`): snapshot de control antes/después y una prueba manual de Compras (crear un producto y abrir una OC).

## Qué necesito de ti
Aprobar (o ajustar) este cambio de permisos. Si lo apruebas, lo implemento en una rama aparte con las pruebas de arriba y **no lo aplico**: la aplicación la haces tú siguiendo `plan-aplicacion-produccion.md`.
