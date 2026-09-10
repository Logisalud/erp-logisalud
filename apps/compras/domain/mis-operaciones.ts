/**
 * "Mis operaciones": una sola tabla con todo lo que una persona creó, sin
 * importar por qué pantalla entró. Puro: sin Next, sin Supabase.
 *
 * Igual que domain/ordenes-unificadas.ts, esto NO fusiona Bounded Contexts:
 * cada tipo sigue viviendo en su tabla con su máquina de estados. Acá solo
 * se normaliza para poder ponerlos en la misma grilla — y la regla que
 * gobierna todo el archivo es que **nunca se muestra un estado que ese tipo
 * no pueda alcanzar de verdad**:
 *
 *  - OS, Anticipo, Reembolso y Pago Directo tienen los cuatro desenlaces
 *    ("Pendiente de aprobación", "Aprobado", "Rechazado", "Anulado")… salvo
 *    que Anticipo y Reembolso no tienen "Anulado": ahí rechazar ES la forma
 *    de cortarlos (`rechazada_contabilidad`), no hay un estado 'anulada'
 *    aparte en gastos.solicitudes_gasto.
 *  - Una OC NO tiene "Rechazado" en ningún lado de su modelo (ver
 *    ESTADOS_OC): nace sin aprobación previa, así que no hay nada que
 *    rechazar. Para OC se muestran sus estados reales de progreso, y el
 *    único desenlace negativo posible es "Anulada".
 */

import { ETIQUETA_ESTADO as ETIQUETA_ESTADO_OC, type EstadoOC } from './orden-compra'
import { type EstadoOS } from './servicio'
import { siguientePasoOC, siguientePasoOS } from './ordenes-unificadas'
import { obligacionPagada, siguientePasoPagoDirecto, type EstadoObligacion } from './obligacion'
import { siguientePasoSolicitud, type EstadoSolicitud } from './gasto'

export const TIPOS_OPERACION = [
  'oc_mercaderia',
  'oc_bien',
  'os',
  'pago_directo',
  'anticipo',
  'reembolso',
] as const
export type TipoOperacion = (typeof TIPOS_OPERACION)[number]

export const ETIQUETA_TIPO_OPERACION: Record<TipoOperacion, string> = {
  oc_mercaderia: 'OC Mercadería',
  oc_bien: 'OC Bien',
  os: 'Orden de Servicio',
  pago_directo: 'Pago Directo',
  anticipo: 'Anticipo',
  reembolso: 'Reembolso',
}

/** Tono del chip de estado — nunca es la única señal, siempre acompaña al texto. */
export type TonoEstado = 'pendiente' | 'aprobado' | 'rechazado' | 'anulado' | 'neutro'

/** Sí / Parcial / No — "Parcial" solo existe para una OC con varias facturas. */
export type EstadoPago = 'si' | 'parcial' | 'no'

export const ETIQUETA_ESTADO_PAGO: Record<EstadoPago, string> = {
  si: 'Sí',
  parcial: 'Parcial',
  no: 'No',
}

/**
 * Qué mostrar en la columna del voucher. Tres casos reales, no dos: el
 * archivo se sube best-effort al ejecutar el pago (services/pagos.ts), así
 * que una obligación puede estar pagada y no tener voucher adjunto.
 */
export type Voucher =
  | { tipo: 'ninguno' }
  | { tipo: 'archivo'; storagePath: string }
  | { tipo: 'sin_adjunto' }
  | { tipo: 'varios'; href: string }

export type FilaOperacion = {
  id: string
  tipo: TipoOperacion
  codigo: string
  fechaCreacion: string
  /** Proveedor (OC/OS/Pago Directo) o categoría (Anticipo/Reembolso). */
  referencia: string | null
  monto: number
  moneda: string
  estadoTexto: string
  estadoTono: TonoEstado
  /** Motivo del rechazo o de la anulación, si lo hay — se muestra al pasar el mouse. */
  motivoCorte: string | null
  proximoPaso: string
  pagado: EstadoPago
  voucher: Voucher
  href: string
}

/** Un pago ya aplicado a alguna obligación de esta operación. */
export type PagoDeOperacion = { storagePath: string | null }

/**
 * Estado de pago de una operación a partir de las obligaciones que le
 * corresponden. Una OC puede tener varias (una factura parcial por
 * recepción), así que "pagado" no es binario ahí: si algunas se pagaron y
 * otras no, es "Parcial". Sin obligaciones todavía (nadie facturó) es "No",
 * no "Parcial": no hay nada pagado.
 */
export function estadoPagoDeObligaciones(estados: readonly EstadoObligacion[]): EstadoPago {
  if (estados.length === 0) return 'no'
  const pagadas = estados.filter(obligacionPagada).length
  if (pagadas === 0) return 'no'
  return pagadas === estados.length ? 'si' : 'parcial'
}

/**
 * Qué ofrecer en la columna "Voucher". Con un solo pago se enlaza el archivo
 * real (URL firmada, ver services/pagos.ts::obtenerUrlLegajoPago); con
 * varios no se elige un voucher "principal" — se manda al detalle, que ya
 * los lista todos. Si se pagó pero el archivo no llegó a subirse, se dice
 * explícitamente en vez de mostrar un link muerto.
 */
export function voucherDeOperacion(pagos: readonly PagoDeOperacion[], hrefDetalle: string): Voucher {
  if (pagos.length === 0) return { tipo: 'ninguno' }
  if (pagos.length > 1) return { tipo: 'varios', href: hrefDetalle }
  const [unico] = pagos
  return unico.storagePath ? { tipo: 'archivo', storagePath: unico.storagePath } : { tipo: 'sin_adjunto' }
}

/**
 * Estado de una OC: sus etiquetas reales, sin traducirlas al vocabulario de
 * aprobación — una OC nunca estuvo "pendiente de aprobación" (nace y se
 * envía sin que nadie la apruebe) ni puede estar "rechazada".
 */
export function estadoDeOC(estado: EstadoOC): { texto: string; tono: TonoEstado } {
  if (estado === 'anulada') return { texto: 'Anulada', tono: 'anulado' }
  if (estado === 'cerrada') return { texto: ETIQUETA_ESTADO_OC[estado], tono: 'aprobado' }
  return { texto: ETIQUETA_ESTADO_OC[estado], tono: 'neutro' }
}

export function estadoDeOS(estado: EstadoOS): { texto: string; tono: TonoEstado } {
  if (estado === 'anulada') return { texto: 'Anulada', tono: 'anulado' }
  if (estado === 'rechazada_jefe') return { texto: 'Rechazada', tono: 'rechazado' }
  if (estado === 'pendiente_jefe') return { texto: 'Pendiente de aprobación', tono: 'pendiente' }
  return { texto: 'Aprobada', tono: 'aprobado' }
}

export function estadoDePagoDirecto(estado: EstadoObligacion): { texto: string; tono: TonoEstado } {
  if (estado === 'anulada') return { texto: 'Anulado', tono: 'anulado' }
  if (estado === 'rechazada') return { texto: 'Rechazado', tono: 'rechazado' }
  if (estado === 'pendiente_factura' || estado === 'registrada' || estado === 'observada') {
    return { texto: 'Pendiente de aprobación', tono: 'pendiente' }
  }
  return { texto: 'Aprobado', tono: 'aprobado' }
}

/**
 * Anticipo y Reembolso no tienen un estado 'anulada': cortarlos ES
 * rechazarlos (rechazada_contabilidad / rechazada_jefe), así que este tipo
 * nunca devuelve el tono 'anulado' — mostrarlo sería inventar un desenlace
 * que la tabla no puede alcanzar.
 */
export function estadoDeSolicitud(estado: EstadoSolicitud): { texto: string; tono: TonoEstado } {
  if (estado === 'rechazada_contabilidad' || estado === 'rechazada_jefe') {
    return { texto: 'Rechazada', tono: 'rechazado' }
  }
  if (estado === 'pendiente_contabilidad' || estado === 'pendiente_jefe') {
    return { texto: 'Pendiente de aprobación', tono: 'pendiente' }
  }
  return { texto: 'Aprobada', tono: 'aprobado' }
}

export function proximoPasoDeOC(estado: EstadoOC): string {
  return siguientePasoOC(estado)
}
export function proximoPasoDeOS(estado: EstadoOS): string {
  return siguientePasoOS(estado)
}
export function proximoPasoDePagoDirecto(estado: EstadoObligacion): string {
  return siguientePasoPagoDirecto(estado)
}
export function proximoPasoDeSolicitud(estado: EstadoSolicitud): string {
  return siguientePasoSolicitud(estado)
}

/** Más recientes primero — el orden con el que se leen las cuatro fuentes juntas. */
export function ordenarPorFechaDesc(filas: readonly FilaOperacion[]): FilaOperacion[] {
  return [...filas].sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion))
}
