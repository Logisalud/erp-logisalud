// Embalaje y bultos (S7): el reparto de lo confirmado en bultos «1 de 3». Espejo de wms.embalar_salida y wms.reabrir_embalaje (la base de datos manda).
import { puede } from './permisos'
import type { Rol } from './tipos'

export const puedeEmbalar = (roles: readonly Rol[]) => puede(roles, 'embalar')
export const MAX_BULTOS = 99

/** Lo confirmado de un lote en una línea: lo que hay que meter en bultos. */
export interface PendienteEmbalar { lineaId: string; productoCodigo: string; producto: string; loteId: string; lote: string; vence: string | null; cantidad: number }
export interface ContenidoBulto { lineaId: string; productoCodigo: string; producto: string; loteId: string; lote: string; vence: string | null; cantidad: number }

export interface BultoVista {
  id: string
  salidaId: string
  /** SAL-2026-00001-B1: es lo que lleva el QR de la etiqueta. */
  codigo: string
  secuencia: number
  total: number
  estado: 'EMBALADO' | 'ANULADO'
  contenido: ContenidoBulto[]
  unidades: number
  embaladoPor: string
  embaladoEn: string
  anuladoMotivo?: string
  anuladoEn?: string
}

export interface EmbalajeResumen {
  salidaId: string
  salidaNumero: string
  pedidoNumero?: string
  cliente?: string
  rutaNumero?: string
  unidades: number
  lineas: number
  /** Bultos vigentes (0 = todavía sin embalar). */
  bultos: number
}
export interface EmbalajeVista extends EmbalajeResumen {
  /** Todo el pedido tiene la conformidad: desde ahí se puede embalar. */
  conforme: boolean
  porEmbalar: PendienteEmbalar[]
  bultosVigentes: BultoVista[]
  bultosAnulados: BultoVista[]
}

/** Lo que se envía al embalar: un arreglo de bultos (el orden es el número del bulto). */
export interface RepartoBulto { contenido: { lineaId: string; loteId: string; cantidad: number }[] }

export const etiquetaBulto = (b: Pick<BultoVista, 'secuencia' | 'total'>) => `${b.secuencia} de ${b.total}`
export const codigoDeBulto = (salidaNumero: string, secuencia: number) => `${salidaNumero}-B${secuencia}`

/** Todo en el bulto 1 (el caso más común); el usuario reparte desde ahí. */
export function repartoInicial(pendientes: readonly PendienteEmbalar[], bultos = 1): number[][] {
  return pendientes.map((p) => Array.from({ length: bultos }, (_, j) => (j === 0 ? p.cantidad : 0)))
}

/** La cantidad que falta (positivo) o sobra (negativo) por colocar de cada pendiente. */
export const faltaPorColocar = (p: Pick<PendienteEmbalar, 'cantidad'>, fila: readonly number[]) => p.cantidad - fila.reduce((t, x) => t + x, 0)

/** De la matriz de la pantalla (filas = pendientes, columnas = bultos) al envío; las celdas en cero no viajan. */
export function repartoDeMatriz(pendientes: readonly PendienteEmbalar[], matriz: readonly (readonly number[])[]): RepartoBulto[] {
  const n = matriz[0]?.length ?? 0
  return Array.from({ length: n }, (_, j) => ({ contenido: pendientes.flatMap((p, i) => ((matriz[i]?.[j] ?? 0) > 0 ? [{ lineaId: p.lineaId, loteId: p.loteId, cantidad: matriz[i][j] }] : [])) }))
}

/** Mismas reglas y mismos textos que la base de datos. null = se puede embalar. */
export function validarReparto(pendientes: readonly PendienteEmbalar[], reparto: readonly RepartoBulto[]): string | null {
  if (reparto.length < 1 || reparto.length > MAX_BULTOS) return `Un pedido se embala en 1 a ${MAX_BULTOS} bultos`
  for (let i = 0; i < reparto.length; i++) {
    const c = reparto[i].contenido
    if (c.length === 0) return `El bulto ${i + 1} está vacío`
    if (c.some((x) => !Number.isInteger(x.cantidad) || x.cantidad <= 0)) return `Cada cantidad del bulto ${i + 1} debe ser mayor que cero`
    if (new Set(c.map((x) => `${x.lineaId}|${x.loteId}`)).size !== c.length) return `El bulto ${i + 1} repite un lote: súmalo en una sola celda`
    if (c.some((x) => !pendientes.some((p) => p.lineaId === x.lineaId && p.loteId === x.loteId))) return `El bulto ${i + 1} tiene un lote que no está en lo confirmado de este pedido`
  }
  for (const p of pendientes) {
    const puesto = reparto.reduce((t, b) => t + b.contenido.filter((x) => x.lineaId === p.lineaId && x.loteId === p.loteId).reduce((a, x) => a + x.cantidad, 0), 0)
    if (puesto < p.cantidad) return `Faltan ${p.cantidad - puesto} unidades del lote ${p.lote} por poner en un bulto`
    if (puesto > p.cantidad) return `Sobran ${puesto - p.cantidad} unidades del lote ${p.lote}: solo se confirmaron ${p.cantidad}`
  }
  return null
}
