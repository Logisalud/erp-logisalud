// «Por qué falta»: cuando una línea de un pedido no tiene todo el stock que pide, el aviso explica POR QUÉ, con cantidades (SA-3, D-123 a D-125).
// Puro y sin formato regional: el espejo en SQL (`wms._explicar_faltante`) arma el MISMO texto, y una prueba de base de datos lo compara.
// Las reglas de vigencia son las de `loteApto` (60 días de vida útil en una venta; lo vencido no sale) y la Reserva de lote; no se inventa ninguna otra.
import { loteApto, VIDA_UTIL_MINIMA_VENTA_DIAS, type MotivoSalida, type TipoSalida } from './salidas'

/** Las cuatro razones por las que lo que existe no está disponible para este pedido. Lo que ni siquiera existe es «sin stock». */
export const CAUSAS_FALTANTE = ['SIN_STOCK', 'CUARENTENA', 'RESERVA', 'VENCIMIENTO_MENOR_60'] as const
export type CausaFaltante = (typeof CAUSAS_FALTANTE)[number]

/** Cómo se dice cada causa en pantalla y en el aviso para el vendedor. */
export const ETIQUETA_CAUSA_FALTANTE: Record<CausaFaltante, string> = {
  SIN_STOCK: 'sin stock',
  CUARENTENA: 'en Cuarentena',
  RESERVA: 'en Reserva',
  VENCIMIENTO_MENOR_60: 'con vencimiento menor a 60 días',
}

/**
 * Las causas en las que Pedidos decide (para el reporte futuro de quiebres de stock, D-129): además de las cuatro de arriba.
 * Se guardan en `wms.quiebres_stock.causa`.
 */
export const DECISIONES_VENDEDOR = ['CANCELADO_POR_VENDEDOR', 'LINEA_QUITADA_POR_VENDEDOR', 'LINEA_REDUCIDA_POR_VENDEDOR'] as const
export type DecisionVendedor = (typeof DECISIONES_VENDEDOR)[number]
export type CausaQuiebre = CausaFaltante | DecisionVendedor
export const CAUSAS_QUIEBRE: readonly CausaQuiebre[] = [...CAUSAS_FALTANTE, ...DECISIONES_VENDEDOR]
export const ETIQUETA_CAUSA_QUIEBRE: Record<CausaQuiebre, string> = {
  SIN_STOCK: 'Sin stock', CUARENTENA: 'En Cuarentena', RESERVA: 'En Reserva', VENCIMIENTO_MENOR_60: 'Vencimiento menor a 60 días',
  CANCELADO_POR_VENDEDOR: 'El vendedor canceló el pedido', LINEA_QUITADA_POR_VENDEDOR: 'El vendedor quitó la línea', LINEA_REDUCIDA_POR_VENDEDOR: 'El vendedor redujo la línea',
}

/** Lo que existe de un lote para este producto y propietario, tal como lo ve la base de datos. */
export interface ExistenciaLote {
  loteId: string
  codigo: string
  /** AAAA-MM-DD; sin fecha, el lote nunca cuenta como vencido. */
  vence: string | null
  /** Solo importan dos: Aprobado (puede salir) y Cuarentena (todavía no). Los demás estados no son stock vendible y no entran en la cuenta. */
  estado: 'APROBADO' | 'CUARENTENA' | 'DEVOLUCIONES' | 'BAJAS_RECHAZADOS'
  /** Aprobado: lo que queda libre (saldo menos lo comprometido por otros pedidos y movimientos). Cuarentena: el saldo. */
  cantidad: number
  /** El lote está en Reserva (estado de lote, OS-1): sigue Aprobado pero no se asigna. */
  reservado?: boolean
  /** Las unidades están en una ubicación en conteo: no se usan hasta cerrarlo. */
  enConteo?: boolean
}

export interface EntradaFaltante {
  /** Lo que pide la línea (o lo que falta asignar de ella). */
  pedido: number
  hoy: string
  existencias: readonly ExistenciaLote[]
  tipo?: TipoSalida
  motivo?: MotivoSalida
  minDias?: number
  /** Si la línea indica su lote (cliente de almacenamiento), solo cuenta ese. */
  loteIndicadoId?: string
}

export interface ExplicacionFaltante {
  pedido: number
  /** Lo que sí se puede usar hoy para este pedido. */
  disponibles: number
  /** `pedido - disponibles` (0 si alcanza). */
  faltan: number
  /** Cuánto de lo que falta corresponde a cada causa. La suma es `faltan`. */
  causas: Record<CausaFaltante, number>
  /** Lo que existe pero no es utilizable, completo (puede ser más que lo que falta): para el detalle. */
  existentes: { cuarentena: number; reserva: number; vencimiento: number; enConteo: number }
  hayFaltante: boolean
  /** El aviso, en una frase: «Stock insuficiente: pide 50 y hay 35 disponibles. Faltan 15: 10 en Cuarentena y 5 sin stock.» */
  texto: string
}

/** Cómo se atribuye lo que falta: primero lo que existe y se puede recuperar (Cuarentena, Reserva, vencimiento); lo demás es «sin stock». */
const ORDEN_DE_ATRIBUCION: readonly Exclude<CausaFaltante, 'SIN_STOCK'>[] = ['CUARENTENA', 'RESERVA', 'VENCIMIENTO_MENOR_60']

/** Lista de causas en palabras, sin ceros: «10 en Cuarentena, 5 en Reserva y 3 sin stock». */
export function listarCausas(causas: Record<CausaFaltante, number>): string {
  const partes = CAUSAS_FALTANTE.filter((c) => causas[c] > 0).sort((a, b) => ORDEN_TEXTO.indexOf(a) - ORDEN_TEXTO.indexOf(b)).map((c) => `${causas[c]} ${ETIQUETA_CAUSA_FALTANTE[c]}`)
  if (partes.length <= 1) return partes.join('')
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}
const ORDEN_TEXTO: readonly CausaFaltante[] = ['CUARENTENA', 'RESERVA', 'VENCIMIENTO_MENOR_60', 'SIN_STOCK']

/** El texto del aviso. Lo arma también la base de datos (mismo orden y mismas palabras). */
export function textoFaltante(pedido: number, disponibles: number, faltan: number, causas: Record<CausaFaltante, number>): string {
  if (faltan <= 0) return `Hay stock suficiente: pide ${pedido} y hay ${disponibles} disponibles.`
  return `Stock insuficiente: pide ${pedido} y hay ${disponibles} disponibles. Faltan ${faltan}: ${listarCausas(causas)}.`
}

/**
 * Explica una línea que no alcanza. Una unidad existente se clasifica una sola vez, por este orden:
 * Cuarentena → lote en Reserva → no apto por vencimiento (menos de 60 días en una venta, o vencido) → en conteo → disponible.
 * Lo que falta se atribuye a las causas recuperables en este orden: Cuarentena, Reserva, vencimiento; el resto es «sin stock»
 * (incluye lo comprometido en otros pedidos y lo que ni existe).
 */
export function explicarFaltante(e: EntradaFaltante): ExplicacionFaltante {
  if (!Number.isInteger(e.pedido) || e.pedido <= 0) throw new Error('La cantidad pedida debe ser un entero mayor que cero')
  const tipo = e.tipo ?? 'DISTRIBUCION'
  const motivo = e.motivo ?? 'VENTA'
  const minDias = e.minDias ?? (tipo === 'DISTRIBUCION' ? VIDA_UTIL_MINIMA_VENTA_DIAS : 0)
  let disponibles = 0
  const existentes = { cuarentena: 0, reserva: 0, vencimiento: 0, enConteo: 0 }
  for (const x of e.existencias) {
    if (e.loteIndicadoId && x.loteId !== e.loteIndicadoId) continue
    const n = Math.max(0, x.cantidad)
    if (n === 0) continue
    if (x.estado === 'CUARENTENA') { existentes.cuarentena += n; continue }
    if (x.estado !== 'APROBADO') continue
    if (x.reservado) { existentes.reserva += n; continue }
    if (!loteApto(x.vence, tipo, motivo, e.hoy, minDias).apto) { existentes.vencimiento += n; continue }
    if (x.enConteo) { existentes.enConteo += n; continue }
    disponibles += n
  }
  const faltan = Math.max(0, e.pedido - disponibles)
  const causas: Record<CausaFaltante, number> = { SIN_STOCK: 0, CUARENTENA: 0, RESERVA: 0, VENCIMIENTO_MENOR_60: 0 }
  let resto = faltan
  const pool: Record<Exclude<CausaFaltante, 'SIN_STOCK'>, number> = { CUARENTENA: existentes.cuarentena, RESERVA: existentes.reserva, VENCIMIENTO_MENOR_60: existentes.vencimiento }
  for (const c of ORDEN_DE_ATRIBUCION) { const t = Math.min(resto, pool[c]); causas[c] = t; resto -= t }
  causas.SIN_STOCK = resto
  return { pedido: e.pedido, disponibles, faltan, causas, existentes, hayFaltante: faltan > 0, texto: textoFaltante(e.pedido, disponibles, faltan, causas) }
}

/** Una línea con falta, lista para mostrarse en el detalle de la orden y en el aviso al vendedor. */
export interface FaltanteLineaVista {
  lineaId: string
  producto: string
  productoCodigo: string
  explicacion: ExplicacionFaltante
}
