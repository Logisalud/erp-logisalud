/**
 * Reglas de la Propuesta de Pago. Puro: sin Next, sin Supabase, testeable solo.
 *
 * Lenguaje Ubicuo: una Propuesta de Pago es el lote semanal de obligaciones
 * agrupadas para una sola aprobación de Gerencia — Gerencia nunca aprueba
 * obligación por obligación (sección 5 del documento maestro, "Mapa de
 * flujo").
 */

export const ESTADOS_PROPUESTA = ['borrador', 'pendiente_aprobacion', 'aprobada', 'rechazada'] as const
export type EstadoPropuesta = (typeof ESTADOS_PROPUESTA)[number]

export const ETIQUETA_ESTADO_PROPUESTA: Record<EstadoPropuesta, string> = {
  borrador: 'Borrador',
  pendiente_aprobacion: 'Pendiente de aprobación',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
}

const TRANSICIONES: Record<EstadoPropuesta, readonly EstadoPropuesta[]> = {
  borrador: ['pendiente_aprobacion'],
  pendiente_aprobacion: ['aprobada', 'rechazada'],
  aprobada: [],
  rechazada: ['borrador'],
}

export function transicionPermitida(desde: EstadoPropuesta, hacia: EstadoPropuesta): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

/** Solo Gerencia decide sobre una propuesta pendiente; el resto del ciclo es de Tesorería. */
export function puedeAprobarse(estado: EstadoPropuesta): boolean {
  return estado === 'pendiente_aprobacion'
}

/**
 * Siguiente código de propuesta. Formato PP-AAAA-NNNN, correlativo por año —
 * mismo criterio que siguienteCodigoOC en domain/orden-compra.ts (recibe el
 * último código del año en vez de contar filas, por la misma razón: contar
 * daría el mismo número dos veces si una propuesta se borrara).
 */
export function siguienteCodigoPropuesta(anio: number, ultimoCodigoDelAnio: string | null): string {
  const correlativo = ultimoCodigoDelAnio ? Number(ultimoCodigoDelAnio.slice(-4)) + 1 : 1
  return `PP-${anio}-${String(correlativo).padStart(4, '0')}`
}

export type ErrorValidacionPropuesta = { campo: string; mensaje: string }

/** Una propuesta vacía no tiene sentido: Gerencia aprobaría un lote sin nada adentro. */
export function validarPropuesta(obligacionIds: readonly string[]): ErrorValidacionPropuesta[] {
  if (obligacionIds.length === 0) {
    return [{ campo: 'obligaciones', mensaje: 'Elegí al menos una obligación conforme.' }]
  }
  return []
}
