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
   * Desde cuándo se cuenta la espera: desde que Contabilidad APROBÓ el lote
   * (migración 0050), que es cuando empieza a esperar a Tesorería — los días
   * que pasó esperando aprobación no son su demora.
   *
   * Puede venir null en las propuestas aprobadas ANTES de la 0050: esa
   * fecha no se rellenó con `created_at` para no inventarla. Ahí se cae a la
   * fecha de creación y la pantalla cambia la etiqueta, en vez de llamar
   * "aprobada hace" a un dato que no lo es.
   */
  aprobadaEn: string | null
  creadaEn: string
  /** Qué fecha se está mostrando de verdad — decide la etiqueta. */
  esperaDesde: 'aprobacion' | 'creacion'
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
  return [...lotes].sort((a, b) =>
    (a.aprobadaEn ?? a.creadaEn).localeCompare(b.aprobadaEn ?? b.creadaEn)
  )
}
