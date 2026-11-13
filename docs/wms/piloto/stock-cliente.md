# Stock del cliente de almacenamiento (enlace de solo lectura)

**Estado (2026-11-13):** construido, **apagado de fábrica**. Decisión de Sebas el 13-nov-2026 (ver `docs/wms/decisiones-pendientes.md`).

## Qué ve el cliente
Una página (`/wms/stock/<enlace>`), sin usuario, sin menú ni banners de empleados:
- Quién es y a qué hora se actualizó (en cada visita, con el libro mayor al momento).
- «Tienes N unidades en M productos; pueden salir hoy K», y cuántas siguen en revisión de Calidad.
- **Lo que vence** como filtros del mismo listado: *Ya vencidos* y *Vencen en menos de 3 meses / entre 3 y 6 / entre 6 y 12* (los tramos son los de `vencimiento_tramos_dias`). Cada estado lleva texto e ícono, nunca solo color.
- Sus productos con su código (el nuestro y el suyo, si lo tiene), en almacén y disponible; al abrirlos, cada lote con su vencimiento.
- **Su Kardex en Excel** (el modelo de Logisalud, una hoja por producto, sin la columna de ubicación): un producto o todos, y fechas opcionales.
- **Nunca** ubicaciones, precios, datos del personal ni salidas ajenas. Solo lectura: no crea ni cambia nada.

## Cómo se da el enlace
1. El Administrador entra a **Propietarios**, busca al cliente, escribe para quién es (opcional), elige cuánto vale (30 días, 3 meses, 6 meses o 1 año) y pulsa **Generar enlace**.
2. El enlace se muestra **una sola vez** para copiarlo (en la base solo queda su hash). Si se pierde, se genera otro y se revoca el anterior.
3. La lista muestra cada enlace con su estado (vigente, vencido, revocado) y la última vez que se abrió. **Revocar** lo deja de inmediato sin efecto.

## Seguridad (migración 0067)
- El cliente sin usuario (`anon`) solo puede llamar a `stock_cliente_por_token` y `kardex_cliente_por_token`; ninguna tabla tiene permiso para él.
- Token de 4 UUID (≈488 bits); solo se guarda su SHA-256. Un enlace que no existe, venció o se revocó responde **exactamente lo mismo**; después de 5 fallos de una misma dirección hay una espera de 15 minutos (comparte el límite del seguimiento de pedidos).
- Un enlace solo vale mientras el cliente esté activo y no sea el dueño del almacén (Logissa no tiene enlace).
- La página lleva `noindex` y no manda el `Referer`; el Excel se sirve con `Cache-Control: no-store`.
- Generar y revocar quedan en la auditoría (sin el token). No depende de SEC1 (D-68): no abre ninguna política de lectura a usuarios autenticados.

## Para encenderlo (con aprobación de Sebas)
1. Aplicar a mano la migración `0067_wms_stock_para_el_cliente_de_almacenamiento.sql` (re-ejecutable; requiere 0012, 0028 y 0047).
2. Un administrador de la base: `update wms.parametros set valor = 'true' where clave = 'stock_cliente_habilitado'`. Para apagarlo: `… valor = 'false'`.
3. El Administrador genera los enlaces desde Propietarios y se los manda a cada cliente (el WMS no envía correos ni mensajes).
4. Para que el cliente vea **su código** de cada producto: registrarlo en `wms.producto_codigos` (tipo `CLIENTE`, con su propietario).

## Pruebas
- Base de datos: `tests/db/stock-cliente.test.ts` (apagado, token y hash, aislamiento entre clientes, sin ubicaciones, bajas fuera, comprometido, Kardex, límites, permisos y auditoría) y la lista de lo que puede llamar `anon` en `tests/db/seguimiento.test.ts`.
- Demo (espejo): `tests/services/demo-stock-cliente.test.ts`. Dominio: `tests/domain/stock-cliente.test.ts`. Excel: `tests/services/xlsx-kardex-cliente.test.ts`. Pantallas: `tests/components/stock-cliente.test.tsx`. E2E en 4 viewports: `e2e/stock-cliente.spec.ts`.

## Fuera de alcance (a propósito)
Crear salidas desde la página, indicadores, alertas por correo, usuario y contraseña (B3, después de SEC1).

## El reinicio del 1 de diciembre
La tabla `enlaces_stock_cliente` se **borra** en el reinicio del piloto (igual que los enlaces de seguimiento): el stock se vuelve a cargar y los clientes reciben enlaces nuevos para el go-live (`scripts/reinicio-piloto-lib.mjs`).
