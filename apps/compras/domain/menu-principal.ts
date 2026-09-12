/**
 * Qué ítems del menú principal ve cada área. Puro: sin Next, sin Supabase.
 *
 * Pedido de Mariela tras ver a Milagritos (Tesorería) usando el sistema: el
 * menú le ofrecía tres cosas que no hace nunca — aprobar, crear órdenes y
 * registrar facturas — y eso la obligaba a descartarlas de un vistazo cada
 * vez. Su trabajo son dos ítems: ejecutar los pagos ya aprobados y, si le
 * toca, pedir uno.
 *
 * Es un recorte de VISIBILIDAD, no de permisos: quien tenga la URL y el
 * permiso RLS igual entra. Por eso no reemplaza a ningún gate — convive con
 * `pendientes.califica` y `puedeVerPagosPorEjecutar`, que siguen mandando.
 */

/** Los ítems que el recorte puede esconder. El resto no se toca. */
export const ITEMS_OCULTABLES = [
  'pendientes_aprobar',
  'ordenes',
  'registrar_factura',
] as const
export type ItemOcultable = (typeof ITEMS_OCULTABLES)[number]

/**
 * Áreas con el menú recortado. Hoy solo Tesorería.
 *
 * No se incluye `contabilidad`: Mariela y Beatriz sí registran facturas y sí
 * aprueban. Tampoco `gerencia` ni `admin`, que ven todo por definición.
 */
const AREAS_CON_MENU_RECORTADO: readonly string[] = ['tesoreria']

export function tieneMenuRecortado(area: string | null | undefined): boolean {
  return !!area && AREAS_CON_MENU_RECORTADO.includes(area)
}

export function veItemDeMenu(item: ItemOcultable, area: string | null | undefined): boolean {
  return !tieneMenuRecortado(area)
}
