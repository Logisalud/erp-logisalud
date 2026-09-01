/**
 * Fecha de vencimiento de una obligación que cubre VARIAS recepciones —
 * puro: sin Next, sin Supabase, testeable solo.
 *
 * Regla de negocio (multi-recepción, no renegociable): cuando una factura
 * cubre más de una recepción/guía física, `fecha_vencimiento_real` se
 * calcula desde la fecha de la recepción MÁS TARDÍA de todas las que cubre,
 * más la condición de pago de la OC — igual criterio de fondo que la regla
 * 3 del documento maestro (nunca desde la fecha de la OC ni de la factura),
 * extendido a "la última en llegar manda", porque hasta esa fecha el
 * proveedor no terminó de entregar lo que esa factura cobra.
 */

/** Suma días de calendario a una fecha ISO (yyyy-mm-dd), en UTC — mismo
 * mecanismo que domain/obligacion.ts::calcularFechaVencimientoReal, para
 * que ambos flujos calculen igual. */
export function sumarDias(fechaISO: string, dias: number): string {
  const fecha = new Date(`${fechaISO.slice(0, 10)}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

/** La más tardía de un array de fechas ISO (yyyy-mm-dd o timestamptz). */
export function fechaMasTardia(fechasISO: readonly string[]): string {
  if (fechasISO.length === 0) {
    throw new Error('Se necesita al menos una fecha de recepción para calcular el vencimiento.')
  }
  return fechasISO.reduce((masTardia, actual) => (actual.slice(0, 10) > masTardia.slice(0, 10) ? actual : masTardia))
}

export function calcularFechaVencimientoMultiRecepcion(
  fechasConformidadISO: readonly string[],
  condicionPagoDias: number
): string {
  return sumarDias(fechaMasTardia(fechasConformidadISO), condicionPagoDias)
}
