/**
 * Reglas de Impuestos. Puro: sin Next, sin Supabase, testeable solo.
 *
 * Lenguaje Ubicuo: Gestión Humana (Arlette) carga cada Obligación
 * Tributaria (Essalud, ONP, AFP, Renta 4ta/5ta, Seguro Vida Ley) desde BUK
 * con anticipación al vencimiento del día 3 hábil del mes siguiente —
 * regla 11 del documento maestro. Contabilidad confirma, lo que genera la
 * obligación real en `cuentas_x_pagar.obligaciones` (mismo patrón que
 * Contabilidad aprobando una solicitud de gasto).
 */

export type ErrorValidacion = { campo: string; mensaje: string }
export type FuenteImpuesto = 'BUK' | 'SUNAT' | 'manual'

const REGEX_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

export type BorradorImpuesto = {
  tipoImpuestoId: string
  periodo: string
  monto: number
  fechaVencimiento: string
  fuente: FuenteImpuesto
}

export function validarImpuesto(b: BorradorImpuesto): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  if (!b.tipoImpuestoId) errores.push({ campo: 'tipoImpuestoId', mensaje: 'Elige un tipo de impuesto.' })
  if (!REGEX_PERIODO.test(b.periodo)) errores.push({ campo: 'periodo', mensaje: 'El periodo tiene que tener el formato AAAA-MM.' })
  if (!(Number(b.monto) > 0)) errores.push({ campo: 'monto', mensaje: 'El monto tiene que ser mayor a 0.' })
  if (!b.fechaVencimiento) errores.push({ campo: 'fechaVencimiento', mensaje: 'Falta la fecha de vencimiento.' })
  return errores
}

export const ESTADOS_OBLIGACION_TRIBUTARIA = ['pendiente_contabilidad', 'conforme', 'en_propuesta', 'pagado'] as const
export type EstadoObligacionTributaria = (typeof ESTADOS_OBLIGACION_TRIBUTARIA)[number]

export const ETIQUETA_ESTADO_TRIBUTARIA: Record<EstadoObligacionTributaria, string> = {
  pendiente_contabilidad: 'Esperando a Contabilidad',
  conforme: 'Conforme — en camino a pago',
  en_propuesta: 'En una propuesta de pago',
  pagado: 'Pagado',
}
