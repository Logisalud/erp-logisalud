/**
 * Reglas puras de "¿qué orden se puede facturar ahora?" — la lógica vivía
 * enteramente adentro de services/facturas-elegibles.ts (filtros de
 * consulta), sin ningún lugar testeable solo. Estas dos funciones son
 * exactamente los mismos criterios que ya usaban buscarRecepcionesFacturables
 * y buscarOSFacturables — se extraen acá para poder testearlas sin mockear
 * Supabase, y el servicio las reusa en vez de repetir la condición inline.
 */

/** Una recepción de compra es facturable si está conforme y todavía no tiene una obligación registrada. */
export function recepcionEsFacturable(estadoRecepcion: string, tieneObligacion: boolean): boolean {
  return estadoRecepcion === 'conforme' && !tieneObligacion
}

/**
 * Una OS sigue "pendiente" (visible en /facturas/nueva) mientras le falte
 * alguno de los dos pasos reales: subir el documento (aprobada/en_ejecucion)
 * o completar los datos vía "Registrar obligación" (factura_adjunta) — el
 * estado ya distingue cuál de los dos falta, no hace falta mirar aparte si
 * hay un archivo subido (hallazgo de Mariela, Contabilidad, punto 2: antes
 * la OS desaparecía de este listado en cuanto se subía el PDF, aunque los
 * datos reales de la factura todavía no existieran).
 */
const ESTADOS_OS_FACTURABLES = ['aprobada', 'en_ejecucion', 'factura_adjunta']

export function osEsFacturable(estadoOS: string): boolean {
  return ESTADOS_OS_FACTURABLES.includes(estadoOS)
}

/** Saldo disponible para facturar de una línea de OC — nunca negativo aunque el dato venga inconsistente. */
export function saldoDisponibleLinea(totalOrden: number, montoFacturado: number): number {
  return Math.max(0, redondear(totalOrden - montoFacturado))
}

function redondear(n: number): number {
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}
