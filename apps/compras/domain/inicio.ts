/**
 * A qué vista de entrada llega cada quien al abrir Compras y Pagos. Puro:
 * sin Next, sin Supabase, testeable solo.
 *
 * "No me hagas pensar" (Krug) aplicado a la home: en vez de un menú de 8
 * secciones igual para todos, cada área ve primero su propia cola —
 * Tesorería lo que tiene que pagar hoy, Almacén sus recepciones
 * pendientes, Contabilidad su cola de conformidades, Gerencia sus
 * propuestas por aprobar. El resto de las secciones sigue existiendo,
 * pero deja de ser lo primero que se ve.
 */
export const VISTAS_ENTRADA = ['tesoreria', 'almacen', 'contabilidad', 'gerencia', 'generica'] as const
export type VistaEntrada = (typeof VISTAS_ENTRADA)[number]

const MAPA_AREA_VISTA: Record<string, VistaEntrada> = {
  tesoreria: 'tesoreria',
  almacen: 'almacen',
  contabilidad: 'contabilidad',
  gerencia: 'gerencia',
}

/** admin y cualquier área sin una cola propia (ventas, legal, gestión humana…) caen en la vista genérica. */
export function determinarVistaEntrada(area: string | null | undefined): VistaEntrada {
  if (!area) return 'generica'
  return MAPA_AREA_VISTA[area] ?? 'generica'
}
