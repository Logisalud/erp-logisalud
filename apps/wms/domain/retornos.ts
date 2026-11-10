// Retornos (OS-5, DT 2026-10-17): todo lo que salió del almacén y vuelve —rechazado por el cliente o no entregado— entra como una RECEPCIÓN TIPO
// DEVOLUCIÓN: estado Devoluciones, acta de recepción y acta organoléptica al 100 %, y Aprobado o Bajas. No hay una zona «Retorno reservado» ni un movimiento
// de retorno propio (se retiraron en OS-1). Un pedido no entregado que se reprograma se prepara DESDE CERO con una nueva Orden de Salida: la anterior no se reabre.
import { puede } from './permisos'
import type { EstadoSolicitud } from './entradas'
import type { Rol } from './tipos'

export type MotivoRetorno = 'RECHAZADO_CLIENTE' | 'NO_ENTREGADO'
export const MOTIVOS_RETORNO: readonly MotivoRetorno[] = ['RECHAZADO_CLIENTE', 'NO_ENTREGADO']
export const ETIQUETA_MOTIVO_RETORNO: Record<MotivoRetorno, string> = { RECHAZADO_CLIENTE: 'Rechazado por el cliente', NO_ENTREGADO: 'No entregado' }
export const AYUDA_MOTIVO_RETORNO: Record<MotivoRetorno, string> = {
  RECHAZADO_CLIENTE: 'El cliente recibió el pedido y no lo aceptó (todo o parte).',
  NO_ENTREGADO: 'El pedido no se pudo entregar (cliente ausente, cita perdida, dirección cerrada…) y vuelve al almacén.',
}

export const AYUDA_RETORNO = 'Lo que vuelve de una Orden de Salida entra como una devolución: se cuenta al 100 %, queda en el Área de Devoluciones y su acta organoléptica decide si va a Aprobado o a Bajas/Rechazados. Nada vuelve directo a su rack.'
export const AYUDA_REPROGRAMAR = 'Si el pedido se va a reprogramar, se prepara desde cero con una nueva Orden de Salida: la anterior no se reabre. Solo el retorno de lo que ya salió se registra aquí.'

export const puedeOriginarRetorno = (roles: readonly Rol[]) => puede(roles, 'originar_retorno')

/** Un lote que salió en la Orden de Salida y cuánto de él puede volver todavía. */
export interface LineaRetornable {
  productoId: string
  productoCodigo: string
  producto: string
  loteId: string
  lote: string
  vence?: string
  /** Lo que salió de este lote en la Orden de Salida. */
  despachado: number
  /** Lo que ya se anunció como retorno en solicitudes anteriores (las anuladas no cuentan). */
  yaRetornado: number
  retornable: number
}

export interface RetornoVista {
  solicitudId: string
  solicitudNumero: string
  motivo: MotivoRetorno
  estado: EstadoSolicitud
  unidades: number
  creadoEn: string
  guiaNumero?: string
}

/** Lo que la pantalla de la Orden de Salida necesita para originar un retorno. */
export interface SalidaParaRetorno {
  salidaId: string
  numero: string
  propietarioId: string
  propietario: string
  /** Guía de remisión vigente de la Orden de Salida (la de Logissa; en una orden de cliente, la que se escriba). */
  guiaNumero?: string
  /** Solo una Orden de Salida CONFIRMADA (ya salió) puede tener retorno. */
  confirmada: boolean
  lineas: LineaRetornable[]
  retornos: RetornoVista[]
}

export interface EntradaRetorno {
  salidaId: string
  motivo: MotivoRetorno | ''
  guiaNumero?: string
  docOriginalTipo?: 'FACTURA' | 'BOLETA'
  docOriginalNumero?: string
  observaciones?: string
  lineas: { loteId: string; cantidad: number | string }[]
}

export type ErroresRetorno = Partial<Record<'motivo' | 'docOriginal' | 'lineas', string>> & Record<string, string | undefined>

export function validarRetorno(
  e: EntradaRetorno, salida: Pick<SalidaParaRetorno, 'confirmada' | 'numero' | 'lineas'>,
): { ok: true; lineas: { loteId: string; cantidad: number }[] } | { ok: false; mensaje: string; errores: ErroresRetorno } {
  const errores: ErroresRetorno = {}
  if (!salida.confirmada) errores.lineas = `La Orden de Salida ${salida.numero} todavía no salió: solo lo que ya salió puede volver. Si todavía no salió, se cancela o se corrige en la propia Orden.`
  if (!e.motivo) errores.motivo = 'Elige por qué vuelve: rechazado por el cliente o no entregado.'
  if (!e.docOriginalTipo || !e.docOriginalNumero?.trim()) errores.docOriginal = 'Escribe la factura o boleta original: sin ella no se puede registrar la devolución.'
  const lineas: { loteId: string; cantidad: number }[] = []
  for (const l of e.lineas) {
    const n = typeof l.cantidad === 'number' ? l.cantidad : Number(String(l.cantidad).replace(/\s/g, ''))
    if (!String(l.cantidad).trim() || n === 0) continue
    const ref = salida.lineas.find((x) => x.loteId === l.loteId)
    if (!ref) { errores.lineas ??= 'Una línea no corresponde a esta Orden de Salida.'; continue }
    if (!Number.isInteger(n) || n < 0) { errores[`cantidad-${l.loteId}`] = 'Escribe un número entero.'; errores.lineas ??= `${ref.producto} (lote ${ref.lote}): escribe un número entero.`; continue }
    if (n > ref.retornable) {
      const m = ref.retornable === 0 ? `De ${ref.producto} (lote ${ref.lote}) ya no queda nada por devolver.` : `De ${ref.producto} (lote ${ref.lote}) solo puede volver ${ref.retornable}: salieron ${ref.despachado}${ref.yaRetornado ? ` y ya se anunció el retorno de ${ref.yaRetornado}` : ''}.`
      errores[`cantidad-${l.loteId}`] = m; errores.lineas ??= m
      continue
    }
    lineas.push({ loteId: l.loteId, cantidad: n })
  }
  if (lineas.length === 0 && !errores.lineas) errores.lineas = 'Indica cuántas unidades vuelven de al menos un lote.'
  const claves = Object.keys(errores).filter((k) => errores[k])
  if (claves.length) return { ok: false, mensaje: errores.lineas ?? errores.motivo ?? errores.docOriginal ?? 'Revisa los campos marcados.', errores }
  return { ok: true, lineas }
}

/** Cuánto puede volver todavía de cada lote: lo despachado menos lo ya anunciado. */
export const retornable = (despachado: number, yaRetornado: number) => Math.max(0, despachado - yaRetornado)

/** Texto de lo que sigue después de registrar el retorno, según quién lo registró. */
export const siguienteTrasRetorno = (autorizada: boolean) =>
  autorizada
    ? 'Siguiente: el almacén lo recibe como devolución cuando llegue (cuenta al 100 % y queda en Devoluciones).'
    : 'Siguiente: Sandra o Katia autorizan la solicitud; después el almacén la recibe como devolución cuando llegue.'

/** Una Orden de Salida que ya salió y, por tanto, puede tener retorno. */
export interface ResumenSalidaRetorno {
  salidaId: string
  numero: string
  pedidoNumero?: string
  cliente?: string
  fecha: string
  unidades: number
  retornos: RetornoVista[]
}
