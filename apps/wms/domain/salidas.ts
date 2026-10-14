// Reglas puras de asignación de lotes en una salida (espejo de wms._lote_apto y wms._asignar_linea; D-69, D-70, D-71, D-76).
// La base de datos es la que manda; esto lo usan la demo y las pantallas para explicar y previsualizar.

export type TipoSalida = 'DISTRIBUCION' | 'CLIENTE' | 'MUESTRA'
export type MotivoSalida = 'VENTA' | 'PESQUISA_DIGEMID' | 'DESTRUCCION' | 'DEVOLUCION_PROVEEDOR' | 'MUESTRA'

/** Días mínimos de vida útil de un pedido de venta de Logissa (parámetro `vida_util_minima_venta_dias`). */
export const VIDA_UTIL_MINIMA_VENTA_DIAS = 60

export interface LoteDisponible {
  loteId: string
  codigo: string
  /** AAAA-MM-DD; sin fecha, el lote nunca cuenta como vencido. */
  vence: string | null
  /** Saldo − comprometido, solo de celdas fuera de conteo y sin bloqueo (lo que el lote puede dar hoy). */
  disponible: number
  bloqueado?: boolean
}

export interface AptitudLote { apto: boolean; requiereAprobacionDt: boolean; razon?: string }

const dias = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)

export function loteApto(vence: string | null, tipo: TipoSalida, motivo: MotivoSalida, hoy: string, minDias = VIDA_UTIL_MINIMA_VENTA_DIAS): AptitudLote {
  if (vence && vence < hoy) {
    if (tipo === 'CLIENTE' && (motivo === 'PESQUISA_DIGEMID' || motivo === 'DESTRUCCION' || motivo === 'DEVOLUCION_PROVEEDOR')) {
      return { apto: true, requiereAprobacionDt: true }
    }
    return {
      apto: false, requiereAprobacionDt: false,
      razon: tipo === 'CLIENTE'
        ? 'El lote está vencido: solo puede salir por pesquisa DIGEMID, destrucción o devolución al proveedor.'
        : 'El lote está vencido: el stock de Logissa nunca sale vencido.',
    }
  }
  if (tipo === 'DISTRIBUCION' && vence && dias(hoy, vence) < minDias) {
    return { apto: false, requiereAprobacionDt: false, razon: `El lote vence en ${dias(hoy, vence)} días: un pedido de venta pide al menos ${minDias}.` }
  }
  return { apto: true, requiereAprobacionDt: false }
}

export interface Asignacion { loteId: string; codigo: string; vence: string | null; cantidad: number }
export type ResultadoAsignacion =
  | { ok: true; asignaciones: Asignacion[] }
  | { ok: false; motivo: 'STOCK_INSUFICIENTE'; pedido: number; aptoTotal: number; mensaje: string }

export interface EntradaAsignacion { tipo: TipoSalida; motivo: MotivoSalida; cantidad: number; hoy: string; lotes: readonly LoteDisponible[]; loteIndicadoId?: string; minDias?: number }

/**
 * Tipo A (distribución) y muestras: el pedido no trae lote. Se toma lo que haya del lote FEFO válido y se completa con el siguiente, y así
 * hasta cubrir la cantidad (una asignación por lote). Todo o nada: si ni sumando los lotes alcanza, no se asigna nada.
 * Tipo B (cliente): una línea, un lote, el que indica el cliente, con toda la cantidad.
 * Nunca se toma más de lo disponible de un lote ni se usa un lote vencido (salvo la excepción del cliente, que aprueba Dirección Técnica).
 */
export function asignarLinea(e: EntradaAsignacion): ResultadoAsignacion {
  if (!Number.isInteger(e.cantidad) || e.cantidad <= 0) throw new Error('La cantidad debe ser un entero mayor que cero')
  const aptos = e.lotes
    .filter((l) => l.disponible > 0 && !l.bloqueado && loteApto(l.vence, e.tipo, e.motivo, e.hoy, e.minDias).apto)
    .filter((l) => (e.tipo === 'CLIENTE' ? l.loteId === e.loteIndicadoId : true))
    .sort((a, b) => (a.vence ?? '9999-12-31').localeCompare(b.vence ?? '9999-12-31') || a.codigo.localeCompare(b.codigo))
  const aptoTotal = aptos.reduce((t, l) => t + l.disponible, 0)
  const falta = (): ResultadoAsignacion => ({
    ok: false, motivo: 'STOCK_INSUFICIENTE', pedido: e.cantidad, aptoTotal,
    mensaje: e.tipo === 'CLIENTE'
      ? `No hay en el lote indicado ${e.cantidad} unidades disponibles (hay ${aptoTotal}).`
      : `Stock insuficiente: la línea pide ${e.cantidad} y, sumando todos los lotes aptos, hay ${aptoTotal}.`,
  })
  if (e.tipo === 'CLIENTE') {
    const l = aptos[0]
    return l && l.disponible >= e.cantidad ? { ok: true, asignaciones: [{ loteId: l.loteId, codigo: l.codigo, vence: l.vence, cantidad: e.cantidad }] } : falta()
  }
  if (aptoTotal < e.cantidad) return falta()
  const asignaciones: Asignacion[] = []
  let restante = e.cantidad
  for (const l of aptos) {
    if (restante <= 0) break
    const tomar = Math.min(l.disponible, restante)
    asignaciones.push({ loteId: l.loteId, codigo: l.codigo, vence: l.vence, cantidad: tomar })
    restante -= tomar
  }
  return { ok: true, asignaciones }
}
