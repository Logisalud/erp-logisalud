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

const ESTADOS_OS_FACTURABLES = ['aprobada', 'en_ejecucion']

/** Una OS es facturable si está aprobada/en ejecución y todavía no se le subió una factura de proveedor. */
export function osEsFacturable(estadoOS: string, tieneFacturaSubida: boolean): boolean {
  return ESTADOS_OS_FACTURABLES.includes(estadoOS) && !tieneFacturaSubida
}

/** Saldo disponible para facturar de una línea de OC — nunca negativo aunque el dato venga inconsistente. */
export function saldoDisponibleLinea(totalOrden: number, montoFacturado: number): number {
  return Math.max(0, redondear(totalOrden - montoFacturado))
}

function redondear(n: number): number {
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}
