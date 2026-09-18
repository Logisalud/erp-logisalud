/**
 * La nota de crédito que desbloquea una obligación del Caso A. Puro.
 *
 * El Caso A de la recepción de tres columnas: llegó MENOS de lo que el
 * proveedor facturó. La obligación existe por el monto facturado —es lo que
 * legalmente se debe hasta que haya NC— pero queda con
 * `espera_nota_credito = true`, fuera de propuesta de pago. Esta es la única
 * salida de ese estado.
 *
 * Quién la sube: Contabilidad. La NC es un documento tributario del
 * proveedor, y quien la registra es quien va a declararla.
 */

import { hoyLima } from './fecha'

export type ErrorValidacion = { campo: string; mensaje: string }

/**
 * Cómo se llama este freno en las pantallas. Corto porque vive en una celda
 * de tabla al lado del estado, y "NC" es como se le dice acá adentro; la
 * frase completa va en el `title` y en la ficha, donde hay lugar.
 */
export const ETIQUETA_ESPERA_NOTA_CREDITO = 'Esperando NC'
export const EXPLICACION_ESPERA_NOTA_CREDITO =
  'Llegó menos mercadería de la que dice la factura: no entra a propuesta de pago hasta que Contabilidad registre la nota de crédito del proveedor.'

export function puedeRegistrarNotaCreditoDeRecepcion(
  perfil: { area: string | null; rol: string | null } | null
): boolean {
  return (
    perfil?.area === 'admin' ||
    (perfil?.area === 'contabilidad' && perfil?.rol === 'admin')
  )
}

export function validarNotaCreditoDeRecepcion(input: {
  monto: number
  /** El total de la obligación. La NC no puede superarlo: una NC más grande
   *  que la deuda no es una corrección, es otro problema. */
  totalObligacion: number
  moneda: string
  monedaObligacion: string
  motivo: string
  numeroNc: string
  fechaEmision: string
  storagePath: string | null
  hoy?: string
}): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  const hoy = input.hoy ?? hoyLima()

  if (!(input.monto > 0)) {
    errores.push({ campo: 'monto', mensaje: 'El monto de la nota de crédito tiene que ser mayor que cero.' })
  } else if (input.monto > input.totalObligacion) {
    // Redondeo a centavos antes de comparar: un 0.001 de diferencia por
    // punto flotante no es un error del usuario.
    const total = Math.round(input.totalObligacion * 100) / 100
    if (Math.round(input.monto * 100) / 100 > total) {
      errores.push({
        campo: 'monto',
        mensaje: `La nota de crédito (${input.monto.toFixed(2)}) no puede superar el total de la obligación (${total.toFixed(2)}).`,
      })
    }
  }

  if (input.moneda !== input.monedaObligacion) {
    errores.push({
      campo: 'moneda',
      mensaje: `La obligación está en ${input.monedaObligacion}. La nota de crédito tiene que ser en la misma moneda.`,
    })
  }

  if (!input.numeroNc.trim()) {
    errores.push({ campo: 'numeroNc', mensaje: 'Pon el número de la nota de crédito.' })
  }

  if (!input.motivo.trim()) {
    errores.push({ campo: 'motivo', mensaje: 'Cuenta por qué el proveedor emitió esta nota de crédito.' })
  }

  if (!input.fechaEmision) {
    errores.push({ campo: 'fechaEmision', mensaje: 'Pon la fecha de emisión de la nota de crédito.' })
  } else if (input.fechaEmision > hoy) {
    // Se compara contra el día de LIMA, no el del servidor: en UTC una NC
    // emitida hoy después de las 19:00 se rechazaría por "futura".
    errores.push({ campo: 'fechaEmision', mensaje: 'La fecha no puede ser futura.' })
  }

  if (!input.storagePath) {
    errores.push({ campo: 'archivo', mensaje: 'Sube la foto o el PDF de la nota de crédito.' })
  }

  return errores
}

/** Lo que la obligación va a pagar una vez aplicada la NC. */
export function netoTrasNotaCredito(totalObligacion: number, montoNc: number): number {
  return Math.max(0, Math.round((totalObligacion - montoNc) * 100) / 100)
}
