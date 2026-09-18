-- ===================================================================
-- 0063 — El módulo de Pedidos apunta a la app externa de Andrés
--
-- Pedidos NO se construyó dentro de este ERP: Andrés lo levantó como una
-- app aparte. Lo único que hace falta de este lado es que la tarjeta del
-- menú de módulos deje de decir "Próximamente" y lleve allá.
--
-- Por eso `ruta` pasa a ser una URL ABSOLUTA, que es lo primero que rompe
-- el supuesto del menú: hasta ahora toda `ruta` era un path interno que
-- `next/link` resolvía dentro del mismo host. El render de
-- apps/cobranzas/app/page.tsx se ajustó en el mismo commit para abrir las
-- rutas absolutas con un `<a target="_blank">` — si esta migración se
-- aplicara sin ese cambio, el link seguiría funcionando pero se abriría en
-- la misma pestaña y sacaría a la persona del ERP sin aviso.
--
-- Re-ejecutable: es un UPDATE sobre una fila que ya existe desde 0007.
-- No agrega áreas permitidas — la tarjeta ya estaba habilitada para
-- admin, almacen, gerencia y ventas (ver 0007), y quién la ve no cambia.
-- ===================================================================

update public.modulos
set
  ruta = 'https://erp-logisalud-pedidos.vercel.app/',
  disponible = true,
  descripcion = 'Toma de pedidos, despacho y facturación. Se abre en otra pestaña.'
where id = 'pedidos';
