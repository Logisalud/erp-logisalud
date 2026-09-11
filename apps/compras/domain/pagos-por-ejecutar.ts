/**
 * "Pagos por ejecutar" (Pieza (a) de la sesión 2026-09-11): la bandeja de
 * Tesorería, la contraparte de "Pendientes de aprobar". Puro.
 *
 * La unidad de trabajo NO es la obligación, es el LOTE. Un pago real no es
 * una fila: es una corrida de transferencias que se hace de una sentada,
 * contra un saldo bancario, en un momento del día — y eso es exactamente lo
 * que una propuesta aprobada representa.
 *
 * Por eso esta pantalla lista propuestas y no obligaciones, y por eso no
 * ejecuta ningún pago: lleva a la propuesta, donde el pago ya vive. Mover
 * la ejecución acá (o al listado de Cuentas por Pagar) saltearía la
 * aprobación del lote, que es la regla de oro del módulo — nadie lleva una
 * obligación de 'registrada' a 'pagada' por su cuenta.
 */

export type LotePorEjecutar = {
  id: string
  codigo: string
  periodo: string | null
  /** Cuántas obligaciones del lote todavía no se pagaron. */
  pendientes: number
  total: number
  /** Cuánto falta desembolsar, por moneda — nunca un único número. */
  pendientePorMoneda: readonly { moneda: string; monto: number }[]
  /**
   * Desde cuándo se cuenta la espera. Sería más exacto medirla desde que se
   * APROBÓ el lote —ahí empieza a esperar a Tesorería—, pero
   * `propuestas_pago` no guarda esa fecha: solo tiene `created_at`. Así que
   * es desde que se armó, y la pantalla lo dice con esas palabras en vez de
   * llamarlo "aprobada hace", que sería falso.
   */
  creadaEn: string
  diasEsperando: number
  href: string
}

/**
 * Un lote entra a la bandeja si está aprobado y le queda algo por pagar.
 * Un lote aprobado y completamente pagado ya no es trabajo pendiente —
 * mostrarlo llenaría la bandeja de cosas hechas y haría que se deje de
 * mirar (misma razón por la que "sin actividad" no entra al reporte de
 * proveedores).
 */
export function esperaEjecucion(estado: string, pendientes: number): boolean {
  return estado === 'aprobada' && pendientes > 0
}

/** Lo más viejo sin pagar, primero. */
export function ordenarPorEspera(lotes: readonly LotePorEjecutar[]): LotePorEjecutar[] {
  return [...lotes].sort((a, b) => a.creadaEn.localeCompare(b.creadaEn))
}
