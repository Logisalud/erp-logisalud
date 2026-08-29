/**
 * Reglas puras de los reportes de Compras y Pagos. Sin Next, sin Supabase,
 * testeable solo.
 */

import type { EstadoObligacion } from './obligacion'
import type { EstadoOC } from './orden-compra'

export const ORIGENES_OBLIGACION = [
  'compra',
  'servicio',
  'gasto_directo',
  'reembolso',
  'anticipo',
  'reposicion_caja_chica',
  'prestamo',
  'fraccionamiento_sunat',
  'letra_por_pagar',
  'impuesto',
] as const
export type OrigenObligacion = (typeof ORIGENES_OBLIGACION)[number]

/** Lenguaje Ubicuo — mismo término que usa cada pantalla del origen, nunca el valor técnico del enum. */
export const ETIQUETA_ORIGEN: Record<OrigenObligacion, string> = {
  compra: 'Compra',
  servicio: 'Servicio',
  gasto_directo: 'Pago directo',
  reembolso: 'Reembolso',
  anticipo: 'Anticipo',
  reposicion_caja_chica: 'Reposición de caja chica',
  prestamo: 'Préstamo',
  fraccionamiento_sunat: 'Fraccionamiento SUNAT',
  letra_por_pagar: 'Letra por pagar',
  impuesto: 'Impuesto',
}

/**
 * Días vencido desde `fechaVencimiento` hasta `hoy` (ambas 'YYYY-MM-DD').
 * Negativo = todavía no vence. `null` si no hay fecha de vencimiento (algunas
 * obligaciones, como impuestos recién cargados, pueden no tenerla todavía).
 */
export function diasVencido(fechaVencimiento: string | null, hoy: string): number | null {
  if (!fechaVencimiento) return null
  const msPorDia = 24 * 60 * 60 * 1000
  const v = new Date(`${fechaVencimiento}T00:00:00Z`).getTime()
  const h = new Date(`${hoy}T00:00:00Z`).getTime()
  return Math.round((h - v) / msPorDia)
}

export const BUCKETS_ANTIGUEDAD = ['por_vencer', 'dias_1_30', 'dias_31_60', 'dias_61_90', 'mas_90'] as const
export type BucketAntiguedad = (typeof BUCKETS_ANTIGUEDAD)[number]

export const ETIQUETA_BUCKET: Record<BucketAntiguedad, string> = {
  por_vencer: 'Por vencer',
  dias_1_30: '1-30 días',
  dias_31_60: '31-60 días',
  dias_61_90: '61-90 días',
  mas_90: '+90 días',
}

/** Clasifica una obligación en el balde de antigüedad de saldos (AP Aging) según sus días vencido. */
export function bucketAntiguedad(dias: number | null): BucketAntiguedad {
  if (dias == null || dias <= 0) return 'por_vencer'
  if (dias <= 30) return 'dias_1_30'
  if (dias <= 60) return 'dias_31_60'
  if (dias <= 90) return 'dias_61_90'
  return 'mas_90'
}

export const ESTADOS_OBLIGACION_ABIERTA: readonly EstadoObligacion[] = [
  'registrada',
  'observada',
  'conforme',
  'en_propuesta',
]

/** Una obligación está "abierta" (pendiente de pago) mientras no llegó a pagada/cerrada/canjeada. */
export function esObligacionAbierta(estado: EstadoObligacion): boolean {
  return (ESTADOS_OBLIGACION_ABIERTA as readonly string[]).includes(estado)
}

export const ESTADOS_PAGO_SABANA = ['pendiente', 'parcial', 'pagado'] as const
export type EstadoPagoSabana = (typeof ESTADOS_PAGO_SABANA)[number]

export const ETIQUETA_ESTADO_PAGO_SABANA: Record<EstadoPagoSabana, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  pagado: 'Pagado',
}

/**
 * Estado de pago para la sábana maestra — una etiqueta de REPORTE, calculada
 * a partir de lo efectivamente aplicado en `cuentas_x_pagar.pago_aplicacion`,
 * separada a propósito de `obligaciones.estado` (que no distingue "parcial":
 * ver conversación con Sebas — la máquina de estados real no cambia por
 * esto, el reporte solo describe lo que ve).
 */
export function estadoPagoSabana(netoAPagar: number, montoPagado: number): EstadoPagoSabana {
  if (montoPagado <= 0) return 'pendiente'
  if (montoPagado >= netoAPagar) return 'pagado'
  return 'parcial'
}

export function saldoPendiente(netoAPagar: number, montoPagado: number): number {
  return Math.max(0, redondear2(netoAPagar - montoPagado))
}

function redondear2(n: number): number {
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}

/** % recibido de una OC — suma de cantidad_recibida sobre cantidad_pedida de todas sus líneas. */
export function porcentajeRecibidoOC(items: readonly { cantidadPedida: number; cantidadRecibida: number }[]): number {
  const pedido = items.reduce((acc, i) => acc + i.cantidadPedida, 0)
  if (pedido <= 0) return 0
  const recibido = items.reduce((acc, i) => acc + Math.min(i.cantidadRecibida, i.cantidadPedida), 0)
  return Math.round((recibido / pedido) * 100)
}

export const ESTADOS_OC_CON_DISCREPANCIAS_POSIBLES: readonly EstadoOC[] = [
  'parcialmente_recibida',
  'recibida_completa',
  'facturada',
]
