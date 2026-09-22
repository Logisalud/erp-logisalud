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
  // `rechazada -> borrador` (reabrir un lote rechazado) estuvo declarado acá
  // desde el principio y NINGUNA función lo usó nunca: era una promesa que
  // nada cumplía. Se quita el 2026-09-19. Un lote rechazado libera sus
  // obligaciones a `conforme`, así que rearmarlo es crear uno nuevo con las
  // que correspondan — que además es más honesto que revivir el anterior con
  // su rechazo colgando. Si alguna vez hace falta de verdad, va con su
  // función y su pantalla, no como una transición suelta.
  rechazada: [],
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

/**
 * De todas las propuestas en las que aparece una obligación, cuál es la que
 * manda hoy.
 *
 * ── Por qué una obligación puede estar en varias ─────────────────────────
 * Rechazar un lote libera sus obligaciones a `conforme` pero NO borra sus
 * filas de `propuesta_detalle`, y eso está bien: el lote rechazado tiene que
 * seguir mostrando qué contenía. Cuando esa obligación entra a un lote nuevo
 * se le agrega una segunda fila, así que "la propuesta de esta obligación"
 * dejó de ser una sola.
 *
 * El código no lo contemplaba y se rompió en producción el 2026-09-22:
 * C-0044 estuvo en PP-2026-0014 (rechazada) y después en PP-2026-0016
 * (aprobada), y Tesorería no podía registrar el voucher — `ejecutarPago`
 * pedía la fila con `.maybeSingle()`, que tolera cero filas pero falla con
 * dos, y el error se traducía a "Esta obligación no tiene una propuesta
 * asociada": exactamente lo contrario de lo que pasaba.
 *
 * La regla: una obligación puede haber pasado por muchos lotes, pero solo
 * uno está vivo — el que no fue rechazado. Si hubiera más de uno vivo (no
 * debería: `crearPropuesta` solo toma obligaciones `conforme`, y una en
 * `en_propuesta` no entra a otro lote), gana el más reciente, que es el que
 * refleja la última decisión.
 */
export function propuestaVigente<T extends { estado: string; createdAt?: string | null }>(
  propuestas: readonly T[]
): T | null {
  const vivas = propuestas.filter((p) => p.estado !== 'rechazada')
  if (vivas.length === 0) return null
  if (vivas.length === 1) return vivas[0]
  return [...vivas].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0]
}

export type ErrorValidacionPropuesta = { campo: string; mensaje: string }

/** Una propuesta vacía no tiene sentido: Gerencia aprobaría un lote sin nada adentro. */
export function validarPropuesta(obligacionIds: readonly string[]): ErrorValidacionPropuesta[] {
  if (obligacionIds.length === 0) {
    return [{ campo: 'obligaciones', mensaje: 'Elige al menos una obligación conforme.' }]
  }
  return []
}
