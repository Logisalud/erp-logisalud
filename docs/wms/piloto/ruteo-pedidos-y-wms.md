# Ruteo: qué hace Pedidos y qué hace el WMS

**Pedidos decide qué zona toca qué día; el WMS arma el despacho físico.** El WMS no recalcula nada de lo que Andrés ya hizo en Pedidos.

| | Pedidos (`apps/pedidos`, lo de Andrés) | WMS (S4, esta rama) |
|---|---|---|
| Zonas | 5 zonas de reparto (`zonas_reparto`, con `orden_ruta`) | Solo las lee: guarda `zona_reparto {codigo, nombre, orden_ruta}` en la copia del pedido |
| Distritos | Cruce por ubigeo con `orden_distrito` (orden dentro de la zona) | Guarda `orden_distrito` |
| Días | Plan semanal: qué zonas tocan cada día (`dia_planificado` 1..7 ISO, `fecha_planificada`) | Guarda ambos; los muestra y filtra |
| Hoja de ruta | `apps/pedidos/app/operaciones/ruta` | No la reemplaza |
| Ruta del despacho físico | — | **Sí:** vehículo, conductor, auxiliar, paradas, carga, LS-FR.43.03, «Mis rutas» |

## Cómo se une (migración 0046)
1. La ruta de solo lectura de Pedidos entrega por pedido `zona_reparto`, `orden_distrito`, `dia_planificado` y `fecha_planificada` (todos `null` si no hay zona). El WMS los guarda en el snapshot de `pedidos_despacho` (no se edita) y en columnas para filtrar. Si una versión nueva cambia la zona o el día, queda versionada y la bandeja avisa «Cambió la zona de reparto» / «Cambió el día planificado de reparto» (aviso de cambio de siempre). Lo que venga mal se ignora: nunca se descarta un pedido por esto.
2. **Bandeja de pedidos:** el filtro es por **zona de reparto** y **día planificado** (lunes a domingo), con «Sin zona» y «Sin día». Todos los pedidos entran; la orden de salida solo se crea para los que alguien pide («importado, sin procesar»).
3. **Armar una ruta del WMS:** el Jefe de Transporte puede «Cargar pedidos de una zona»: las paradas se precargan ordenadas por `orden_ruta` y luego `orden_distrito`; «Ordenar por zona» usa el mismo orden. Después las edita (mover, quitar, agregar). El plan guardado es el que manda para la salida física.
4. Sin zona (pedido manual o aún sin ruteo de Pedidos): la ruta del WMS funciona como siempre.

## Pendiente
La ruta de Pedidos con estos campos la amplía otro agente; hasta que esté desplegada, la demo usa zonas sintéticas (Lima Centro, Lima Norte, Lima Sur) con la misma forma.
