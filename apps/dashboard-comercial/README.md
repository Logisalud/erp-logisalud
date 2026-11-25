# Dashboard Comercial

El tablero que antes vivía en `logisalud-dashboard-comercial.vercel.app` como
un HTML suelto y público. Ahora es una app del monorepo: pide login, y la
mitad de los números se lee de la base en cada visita en vez de venir
congelada en el archivo.

## Qué muestra, y de dónde sale cada cosa

Son dos fuentes, y conviene no mezclarlas al leer la pantalla:

| Bloque | Fuente | IGV |
|---|---|---|
| Venta 12m, líneas, productos, clasificación oro/plata/bronce | `datos/*.json`, derivados del Excel de ventas (hoja BDNubefact) | **sin** IGV |
| Cartera, morosidad, venta mensual del ERP, vendedor actual | base de cobranzas, en vivo | **con** IGV |

El detalle por producto solo existe en el Excel: `documentos` guarda el total
del comprobante, no sus ítems. Por eso esa mitad es una foto y se actualiza
regenerando los JSON, no sola.

## Cómo está armado

`public/tablero.html` es **el mismo archivo que corre en el artifact de
Claude**, con su CSS y sus gráficos de d3 intactos. Lo único agregado es un
shim que reimplementa el contrato del runtime de Claude (`dash.data`,
`dash.draw`, `dash.calc`, `dash.loader`, `dash.colors`) leyendo de
`/api/datos` en vez de un conector. Pasarlo a componentes de React habría
sido reescribir 700 líneas que ya funcionan y mantener dos versiones del
mismo tablero.

`next.config.mjs` reescribe `/` a ese archivo; el middleware de
`@logisalud/auth` protege todo.

## Permisos

`/api/datos` exige área `gerencia`, `contabilidad`, `tesoreria` o `ventas`
(más `admin`, que entra siempre). Lee con la service role key porque
`v_saldos` y `documentos` tienen RLS activado y sin policies.

## Variables de entorno

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` — proyecto
  consolidado de cobranzas/compras, los mismos que usa `apps/cobranzas`.
- `SUPABASE_SERVICE_ROLE_KEY` — solo servidor.

## Migración

`supabase/migrations/20261125_vistas_dashboard_comercial.sql` crea las cuatro
vistas que lee la ruta. Ya está aplicada en el proyecto consolidado.
