/**
 * Recibo por Honorarios (RxH) y retención de renta de 4ta categoría. Puro.
 *
 * Modelo validado por Sebas el 2026-10-28 (con Mariela):
 *
 *  - Por regla general se le retiene el 8% al profesional. La excepción es
 *    que tenga Constancia de Suspensión de Retenciones vigente: SUNAT se la
 *    da al profesional según SUS ingresos del año, y Logisalud no tiene cómo
 *    verificarlo — por eso NO es una fórmula del sistema, es un documento
 *    que Contabilidad registra (`constancias_suspension_4ta`, una por año).
 *    Si un profesional prefiere que se le retenga aunque califique, no se
 *    registra su constancia y listo.
 *  - Un recibo de S/ 1,500 o menos no está obligado a retención. Es una
 *    regla de la ley, por recibo — pero Sebas pidió NO aplicarla sola: el
 *    sistema avisa y la persona decide. Por defecto se retiene.
 *  - La retención vive en la propia obligación del profesional, como la
 *    detracción: `neto_a_pagar` ya la descuenta. No hay una deuda aparte por
 *    cada 8% — eso se consolida por mes en Impuestos.
 */

export const TASA_RETENCION_4TA = 0.08

/** Hasta este monto (en soles) el recibo no está obligado a retención. */
export const UMBRAL_RXH_SIN_RETENCION_PEN = 1500

export type TipoComprobante = 'factura' | 'boleta' | 'rxh'

export const ETIQUETA_TIPO_COMPROBANTE: Record<TipoComprobante, string> = {
  factura: 'Factura',
  boleta: 'Boleta',
  rxh: 'Recibo por Honorarios',
}

/** Del formulario: factura por defecto, así uno viejo que no lo manda sigue igual. */
export function leerTipoComprobante(v: unknown): TipoComprobante {
  return v === 'rxh' || v === 'boleta' ? v : 'factura'
}

export type MotivoRetencion4ta = 'retenido' | 'constancia_suspension' | 'no_supera_1500'

export type Constancia4ta = {
  ejercicio: number
  numero: string
  fechaEmision: string
  anulada?: boolean
}

function redondear2(n: number): number {
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}

/** Un RxH lo emite una persona natural con negocio: su RUC empieza con 10. */
export function esRucDePersonaNatural(ruc: string | null | undefined): boolean {
  return /^10\d{9}$/.test((ruc ?? '').trim())
}

/**
 * La constancia que ampara un recibo de `fecha` (YYYY-MM-DD): la del mismo
 * año, ya emitida para esa fecha y no anulada. Vale por ejercicio: el 31 de
 * diciembre vence sola.
 */
export function constanciaVigentePara(
  constancias: readonly Constancia4ta[],
  fecha: string,
): Constancia4ta | null {
  const anio = Number(fecha.slice(0, 4))
  return constancias.find((c) => !c.anulada && c.ejercicio === anio && c.fechaEmision <= fecha) ?? null
}

/** ¿Este recibo está por debajo del umbral? En dólares se compara convertido. */
export function noSuperaUmbral(monto: number, moneda: string, tipoCambio?: number | null): boolean {
  const enSoles = moneda === 'PEN' ? monto : monto * (Number(tipoCambio) || 0)
  return enSoles > 0 && enSoles <= UMBRAL_RXH_SIN_RETENCION_PEN
}

export type CalculoRxh = {
  monto: number
  retencion: number
  neto: number
  motivo: MotivoRetencion4ta
}

/**
 * Cuánto se retiene de un RxH y por qué. `noRetenerPorMonto` es la decisión
 * EXPLÍCITA de quien registra (ver arriba): solo tiene efecto si el recibo
 * de verdad no supera el umbral — si lo supera, se ignora y se retiene.
 */
export function calcularRxh(input: {
  monto: number
  moneda: string
  tipoCambio?: number | null
  constanciaVigente: boolean
  noRetenerPorMonto?: boolean
}): CalculoRxh {
  const monto = redondear2(Number(input.monto) || 0)
  if (input.constanciaVigente) {
    return { monto, retencion: 0, neto: monto, motivo: 'constancia_suspension' }
  }
  if (input.noRetenerPorMonto && noSuperaUmbral(monto, input.moneda, input.tipoCambio)) {
    return { monto, retencion: 0, neto: monto, motivo: 'no_supera_1500' }
  }
  const retencion = redondear2(monto * TASA_RETENCION_4TA)
  return { monto, retencion, neto: redondear2(monto - retencion), motivo: 'retenido' }
}

/** La frase que explica la decisión, para la pantalla y la ficha. */
export function explicarRetencion(motivo: MotivoRetencion4ta, constancia?: Pick<Constancia4ta, 'numero' | 'ejercicio'> | null): string {
  switch (motivo) {
    case 'retenido':
      return 'Se retiene el 8%: no tiene constancia de suspensión vigente.'
    case 'constancia_suspension':
      return constancia
        ? `No se retiene: constancia de suspensión ${constancia.ejercicio} N° ${constancia.numero}.`
        : 'No se retiene: tiene constancia de suspensión vigente.'
    case 'no_supera_1500':
      return 'No se retiene: el recibo no supera S/ 1,500 (decidido al registrarlo).'
  }
}

/**
 * Aviso para Contabilidad (Sebas, 2026-10-28): un recibo que no se retuvo
 * por la constancia de un año y se paga en el año siguiente — esa constancia
 * ya venció al momento del pago. No se recalcula nada: queda para revisión.
 */
export function constanciaVencidaAlPagar(input: {
  motivo: MotivoRetencion4ta | null
  fechaRecibo: string | null
  fechaPago: string | null
}): boolean {
  if (input.motivo !== 'constancia_suspension' || !input.fechaRecibo || !input.fechaPago) return false
  return input.fechaPago.slice(0, 4) > input.fechaRecibo.slice(0, 4)
}
