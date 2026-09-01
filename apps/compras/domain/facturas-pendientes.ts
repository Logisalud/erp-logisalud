/**
 * Cuándo una factura recién registrada contra una OC concilia de inmediato
 * vs. cuándo queda en la cola "esperando mercadería" — puro: sin Next, sin
 * Supabase, testeable solo. Ver services/facturas-pendientes.ts.
 */

export type LineaOCParaEncolar = {
  ocItemId: string
  /** cantidad_recibida - cantidad_facturada ya registrada en obligaciones anteriores. */
  cantidadVerificadaDisponible: number
}

/**
 * Solo mira las líneas que la factura realmente factura (no toda la OC):
 * si ninguna de esas líneas tiene saldo recibido y no facturado todavía,
 * no hay nada contra qué conciliar hoy — la factura llegó antes que la
 * mercadería.
 */
export function hayRecepcionConSaldoSinFacturar(lineasFacturadas: readonly LineaOCParaEncolar[]): boolean {
  return lineasFacturadas.some((l) => l.cantidadVerificadaDisponible > 0)
}

export function debeEncolarse(lineasFacturadas: readonly LineaOCParaEncolar[]): boolean {
  return !hayRecepcionConSaldoSinFacturar(lineasFacturadas)
}
