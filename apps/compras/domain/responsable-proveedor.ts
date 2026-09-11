/**
 * "Proveedores sin responsable" (Pieza E). Puro: sin Next, sin Supabase.
 *
 * El responsable es UNA PERSONA, no un área: un mismo proveedor lo usan
 * varias áreas distintas, así que "este proveedor es de Compras" no dice
 * nada útil. Lo que sirve es a quién preguntarle por él.
 */

export type DesenlaceResponsable = 'sin_responsable' | 'responsable_desactualizado' | 'sin_actividad' | 'ok'

export const ETIQUETA_DESENLACE: Record<DesenlaceResponsable, string> = {
  sin_responsable: 'Sin responsable',
  responsable_desactualizado: 'La última actividad la hizo otra persona',
  sin_actividad: 'Sin movimientos todavía',
  ok: 'Al día',
}

export type FilaProveedorResponsable = {
  id: string
  fuente: 'compra' | 'servicio'
  razonSocial: string
  ruc: string | null
  /** Nombre de quien tiene asignado el proveedor, o null. */
  responsable: string | null
  responsableId: string | null
  /** Quién generó la OC/OS más reciente, y cuándo. */
  ultimaActividadPor: string | null
  ultimaActividadPorId: string | null
  ultimaActividadFecha: string | null
  ultimaActividadCodigo: string | null
  desenlace: DesenlaceResponsable
  href: string
}

/**
 * Los tres desenlaces que importan, más `ok`.
 *
 * `sin_actividad` NO es un hallazgo: un proveedor recién dado de alta con
 * responsable asignado está perfecto. Se calcula igual para poder mostrarlo
 * aparte, pero nunca mezclado con los otros dos — mezclarlo ensucia la
 * lista y hace que se deje de mirar.
 */
export function desenlaceDe(
  responsableId: string | null,
  ultimaActividadPorId: string | null
): DesenlaceResponsable {
  if (!responsableId) return 'sin_responsable'
  if (!ultimaActividadPorId) return 'sin_actividad'
  return responsableId === ultimaActividadPorId ? 'ok' : 'responsable_desactualizado'
}

/** Lo que va en el reporte principal: solo lo accionable. */
export function esHallazgo(desenlace: DesenlaceResponsable): boolean {
  return desenlace === 'sin_responsable' || desenlace === 'responsable_desactualizado'
}

/** Sin responsable primero, y dentro de cada grupo por razón social. */
export function ordenarHallazgos(filas: readonly FilaProveedorResponsable[]): FilaProveedorResponsable[] {
  const peso: Record<DesenlaceResponsable, number> = {
    sin_responsable: 0,
    responsable_desactualizado: 1,
    sin_actividad: 2,
    ok: 3,
  }
  return [...filas].sort(
    (a, b) => peso[a.desenlace] - peso[b.desenlace] || a.razonSocial.localeCompare(b.razonSocial)
  )
}
