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

// ── Edición de la asignación (D-79: libre, con reglas de seguridad; reemplaza D-77 (a) y D-78) ─────────────────────────────────────────
// Quien prepara la salida (Jefe de Almacén, Jefe de Transporte, auxiliares) puede elegir el lote que quiera para una línea de venta antes del
// picking. FEFO es la propuesta por defecto; apartarse de ella NO bloquea: se avisa («Hay un lote que vence antes») y se deja registro.

export interface AsignacionLote { loteId: string; cantidad: number }

export interface EntradaEdicion {
  cantidadLinea: number
  hoy: string
  nueva: readonly AsignacionLote[]
  /** Lotes del producto (del mismo propietario) con lo disponible PARA ESTA LÍNEA (lo que ya tiene reservado la línea cuenta como disponible). */
  lotes: readonly LoteDisponible[]
  minDias?: number
}

/** Espejo de wms.editar_asignacion: devuelve los motivos por los que la edición no vale (vacío = vale). Solo reglas de seguridad. */
export function validarEdicionAsignacion(e: EntradaEdicion): string[] {
  const errores: string[] = []
  if (e.nueva.length === 0) return ['Indica al menos un lote con su cantidad.']
  if (e.nueva.some((n) => !Number.isInteger(n.cantidad) || n.cantidad <= 0)) errores.push('Cada lote lleva su cantidad, mayor que cero.')
  if (new Set(e.nueva.map((n) => n.loteId)).size !== e.nueva.length) errores.push('Un lote aparece una sola vez.')
  const suma = e.nueva.reduce((t, n) => t + n.cantidad, 0)
  if (suma !== e.cantidadLinea) errores.push(`La suma de los lotes (${suma}) debe ser igual a la cantidad de la línea (${e.cantidadLinea}).`)
  for (const n of e.nueva) {
    const lote = e.lotes.find((l) => l.loteId === n.loteId)
    if (!lote) { errores.push('Uno de los lotes no corresponde a este producto.'); continue }
    const apto = loteApto(lote.vence, 'DISTRIBUCION', 'VENTA', e.hoy, e.minDias)
    if (!apto.apto) errores.push(`Lote ${lote.codigo}: ${apto.razon}`)
    if (lote.bloqueado) errores.push(`El lote ${lote.codigo} está bloqueado.`)
    if (lote.disponible < n.cantidad) errores.push(`El lote ${lote.codigo} no tiene suficientes unidades disponibles (hay ${lote.disponible}, se piden ${n.cantidad}).`)
  }
  return errores
}

/** Los lotes que la lista de la celda ofrece: aptos, sin bloqueo y con disponible, por vencimiento (FEFO primero). */
export function lotesEditables(e: Pick<EntradaEdicion, 'hoy' | 'lotes' | 'minDias'>): LoteDisponible[] {
  return e.lotes
    .filter((l) => l.disponible > 0 && !l.bloqueado && loteApto(l.vence, 'DISTRIBUCION', 'VENTA', e.hoy, e.minDias).apto)
    .sort((a, b) => (a.vence ?? '9999-12-31').localeCompare(b.vence ?? '9999-12-31') || a.codigo.localeCompare(b.codigo))
}

export interface AvisoFefo { loteId: string; codigo: string; antesCodigo: string; antesVence: string }

/** «Hay un lote que vence antes (L2501, vence 11/2027)»: por cada lote elegido, el lote válido no elegido que vence antes (el primero). No bloquea. */
export function avisosFefo(e: Pick<EntradaEdicion, 'hoy' | 'lotes' | 'minDias' | 'nueva'>): AvisoFefo[] {
  const validos = lotesEditables(e)
  const elegidos = new Set(e.nueva.map((n) => n.loteId))
  const avisos: AvisoFefo[] = []
  for (const id of elegidos) {
    const lote = validos.find((l) => l.loteId === id)
    if (!lote?.vence) continue
    const antes = validos.find((v) => !elegidos.has(v.loteId) && !!v.vence && v.vence < lote.vence!)
    if (antes?.vence) avisos.push({ loteId: id, codigo: lote.codigo, antesCodigo: antes.codigo, antesVence: antes.vence })
  }
  return avisos
}

/** «11/2027» (mes/año) para el aviso. */
export const mesAnio = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`
export const textoAvisoFefo = (a: AvisoFefo) => `Hay un lote que vence antes (${a.antesCodigo}, vence ${mesAnio(a.antesVence)})`

/** ¿La asignación final se aparta de la propuesta FEFO original? (otro lote u otra distribución) */
export function seApartaDeFefo(fefo: readonly AsignacionLote[], final: readonly AsignacionLote[]): boolean {
  const k = (a: readonly AsignacionLote[]) => [...a].sort((x, y) => x.loteId.localeCompare(y.loteId)).map((x) => `${x.loteId}:${x.cantidad}`).join('|')
  return k(fefo) !== k(final)
}
