# Dashboard Comercial

El tablero que antes vivía en `logisalud-dashboard-comercial.vercel.app`
como un HTML suelto, con su propio login contra el proyecto de pedidos y su
propia lista de correos con acceso. Ahora es una app del monorepo: entra con
el mismo login que el resto del ERP y el permiso lo da el área del perfil,
no una lista aparte.

## Qué muestra, y de dónde sale cada cosa

Son **dos bases distintas**, y conviene no leerlas como si fueran lo mismo:

| Bloque | Fuente | IGV |
|---|---|---|
| Venta, líneas, productos, oro/plata/bronce, reposición | `dashboard_comercial_servidor()` en el proyecto de **pedidos** | **sin** IGV |
| Cartera, morosidad, venta mensual del ERP, vendedor actual | cuatro vistas `v_dash_*` del proyecto **consolidado** (cobranzas + compras) | **con** IGV |

La mitad de venta se alimenta sola: **cada vez que se sube el avance de
ventas, el mes que trae ese archivo se reescribe en `comercial.ventas_detalle`**
(migración `1065` de pedidos). La historia anterior a octubre 2026, que el
avance no cubre, queda intacta.

La excepción es la clasificación **oro / plata / bronce**: `comercial.ranking_clientes`
sigue siendo una foto y no se recalcula sola, porque mezcla el comportamiento
de pago, que vive en la base de cobranzas y la de pedidos no alcanza.

Las dos se leen en vivo en cada visita. Que una falle no deja la pantalla en
blanco: se muestra la otra mitad y un aviso arriba diciendo qué no respondió.

El vendedor que figura en la tabla de clientes es **el de hoy**, cruzando por
RUC con la cartera de cobranzas. La clasificación es una foto de los dos
últimos trimestres cerrados y traía el vendedor de entonces, así que listaba
gente que ya no trabaja acá. Cuando el cliente cambió de manos, el vendedor
de la ventana queda en la columna «Antes»: el puntaje se ganó con ese.

## Cómo está armado

`public/tablero.html` es el mismo archivo del sitio original, con su diseño
intacto. Lo único que cambió es de dónde saca los datos: `/api/datos` en vez
de consultar Supabase desde el navegador. Pasarlo a componentes de React
habría sido reescribir 700 líneas que ya funcionan.

`next.config.mjs` reescribe `/` a ese archivo; el middleware de
`@logisalud/auth` protege todo. `/api/salir` cierra la sesión del lado del
servidor, porque una página HTML suelta no puede usar `BotonCerrarSesion`.

## Dos reglas del negocio que viven en la base

- **`comercial.lineas_canonicas`**: la línea se muestra con el nombre que
  usa la cuota (`DIPHASAC - GX`, `DIPHASAC - RX`, …), no como viene en el
  archivo (`GENERICO`, `OTC`). La equivalencia sale de la hoja «lineas» del
  propio avance. Sin esto la misma línea aparecía dos veces en el ranking.
- **`comercial.clientes_excluidos`**: clientes que la empresa decidió no
  contar. No se borran sus comprobantes —la venta ocurrió y la contabilidad
  la tiene—, solo quedan fuera del análisis comercial. Volver a incluir a
  alguien es borrar una fila.

## Permisos

`/api/datos` exige área `gerencia`, `contabilidad`, `tesoreria` o `ventas`
(más `admin`, que entra siempre). Lee con service role porque ni
`v_saldos`/`documentos` (RLS activado y sin policies) ni el envoltorio de
pedidos tienen permiso para anon o authenticated.

## Variables de entorno

Las cuatro son obligatorias; sin las de pedidos el tablero levanta pero sin
la mitad de venta.

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — proyecto
  consolidado. Son también las del login.
- `SUPABASE_SERVICE_ROLE_KEY` — del consolidado, solo servidor.
- `PEDIDOS_SUPABASE_URL` / `PEDIDOS_SUPABASE_SERVICE_ROLE_KEY` — proyecto de
  pedidos, solo servidor.

Esta app es el único lugar del monorepo que habla con los dos proyectos
Supabase a la vez, y es a propósito: el detalle por producto solo existe en
pedidos y la cartera solo existe en cobranzas. Las variables van con nombres
distintos justamente para que no se confundan ni se reutilicen entre apps.

## Migraciones

- `supabase/migrations/20261125_vistas_dashboard_comercial.sql` — las cuatro
  vistas del proyecto consolidado.
- `apps/pedidos/supabase/migrations/1064_dashboard_comercial_servidor.sql` —
  el envoltorio del lado de pedidos.

Las dos están aplicadas.
