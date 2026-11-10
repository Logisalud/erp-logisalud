// Reglas puras de asignación de lotes en una salida (espejo de wms._lote_apto y wms._asignar_linea; D-69, D-70, D-71, D-76).
// La base de datos es la que manda; esto lo usan la demo y las pantallas para explicar y previsualizar.

export type TipoSalida = 'DISTRIBUCION' | 'CLIENTE' | 'MUESTRA' | 'PROVEEDOR'
export type MotivoSalida = 'VENTA' | 'PESQUISA_DIGEMID' | 'DESTRUCCION' | 'DEVOLUCION_PROVEEDOR' | 'MUESTRA'

/** Días mínimos de vida útil de un pedido de venta de Logissa (parámetro `vida_util_minima_venta_dias`). */
export const VIDA_UTIL_MINIMA_VENTA_DIAS = 60

/** El tipo de salida que lleva este motivo cuando la línea trae lote indicado (la devolución al proveedor es del stock de Logissa; el resto, de un cliente). */
export const tipoDeMotivo = (m: MotivoSalida): TipoSalida => (m === 'DEVOLUCION_PROVEEDOR' ? 'PROVEEDOR' : 'CLIENTE')

/** Motivos de cada tipo de salida (DT 2026-10-17 §7; espejo de `wms.crear_salida`). La devolución al proveedor es solo de Logissa. */
export const MOTIVOS_DE_TIPO: Record<TipoSalida, readonly MotivoSalida[]> = {
  DISTRIBUCION: ['VENTA'],
  MUESTRA: ['MUESTRA'],
  PROVEEDOR: ['DEVOLUCION_PROVEEDOR'],
  CLIENTE: ['VENTA', 'PESQUISA_DIGEMID', 'MUESTRA', 'DESTRUCCION'],
}

export const ETIQUETA_MOTIVO_SALIDA: Record<MotivoSalida, string> = {
  VENTA: 'Venta', PESQUISA_DIGEMID: 'Pesquisa DIGEMID', MUESTRA: 'Muestra', DESTRUCCION: 'Destrucción', DEVOLUCION_PROVEEDOR: 'Devolución al proveedor',
}

/** Mismo mensaje que la base: ¿este motivo corresponde a este tipo de salida? Devuelve el error o nulo. */
export function validarMotivoSalida(tipo: TipoSalida, motivo: MotivoSalida): string | null {
  if (tipo === 'CLIENTE' && motivo === 'DEVOLUCION_PROVEEDOR') {
    return 'La devolución al proveedor es del stock de Logissa; un cliente de almacenamiento saca por venta, pesquisa DIGEMID, muestra o destrucción'
  }
  return MOTIVOS_DE_TIPO[tipo].includes(motivo) ? null : 'El motivo no corresponde a este tipo de salida'
}

/**
 * De dónde sale el stock: todo sale de Aprobados, salvo la destrucción, que sale SOLO desde Bajas (lo vencido de un cliente nunca se devuelve ni se vende:
 * va a Bajas con una Orden de Baja y sale a destrucción cuando el cliente lo indica).
 */
export const origenDelStock = (motivo: MotivoSalida): 'APROBADO' | 'BAJAS_RECHAZADOS' => (motivo === 'DESTRUCCION' ? 'BAJAS_RECHAZADOS' : 'APROBADO')

/** La salida tipo B (por cuenta de un cliente) no emite guía del WMS: se despacha con la GRE que sube el cliente. Todo lo demás, sí (OS-3). */
export const emiteGuiaDelWms = (tipo: TipoSalida) => tipo !== 'CLIENTE'

/**
 * Política de canje con el proveedor (DT: PENDIENTE de Katia). Dos parámetros de `wms.parametros`:
 * `canje_dias_minimos_antes_vencimiento` (0 = hasta el día del vencimiento) y `canje_dias_maximos_antes_vencimiento` (sin valor = sin tope).
 */
export interface PoliticaCanje { diasMinimos: number; diasMaximos: number | null }
export const POLITICA_CANJE_INICIAL: PoliticaCanje = { diasMinimos: 0, diasMaximos: null }

/**
 * D-161: el proveedor recibe una devolución con al menos 3 meses antes del vencimiento. Es un AVISO, no un bloqueo: si faltan menos días, quien crea la orden puede
 * continuar escribiendo el motivo. Parámetro `devolucion_proveedor_aviso_dias` (90). Lo que sí bloquea sigue igual: lote vencido y la política de canje de arriba.
 */
export const DIAS_AVISO_DEVOLUCION_DEFECTO = 90

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

/**
 * ¿Puede este lote salir de Aprobados? Lo vencido no sale por ninguna salida (va a Bajas). La venta de Logissa pide 60 días; la devolución al proveedor, solo
 * antes del vencimiento y según la política de canje. `requiereAprobacionDt` quedó en falso siempre (ya no hay aprobación de vencidos).
 */
export function loteApto(vence: string | null, tipo: TipoSalida, motivo: MotivoSalida, hoy: string, minDias = VIDA_UTIL_MINIMA_VENTA_DIAS, canje: PoliticaCanje = POLITICA_CANJE_INICIAL): AptitudLote {
  if (vence && vence < hoy) {
    return {
      apto: false, requiereAprobacionDt: false,
      razon: tipo === 'PROVEEDOR' ? 'El lote está vencido: no se devuelve vencido a nadie. Va a Bajas con una Orden de Baja.'
        : tipo === 'CLIENTE' && motivo === 'PESQUISA_DIGEMID' ? 'El lote está vencido: la pesquisa DIGEMID nunca es de lotes vencidos. Lo vencido va a Bajas y sale a destrucción cuando el cliente lo indica.'
        : tipo === 'CLIENTE' ? 'El lote está vencido: lo vencido solo va a Bajas (Orden de Baja) y sale a destrucción cuando el cliente lo indica.'
        : 'El lote está vencido: el stock de Logissa nunca sale vencido; solo va a Bajas (Orden de Baja).',
    }
  }
  if (tipo === 'DISTRIBUCION' && vence && dias(hoy, vence) < minDias) {
    return { apto: false, requiereAprobacionDt: false, razon: `El lote vence en ${dias(hoy, vence)} días: un pedido de venta pide al menos ${minDias}.` }
  }
  if (tipo === 'PROVEEDOR') {
    if (!vence) return { apto: false, requiereAprobacionDt: false, razon: 'El lote no tiene fecha de vencimiento: no se puede evaluar la política de canje.' }
    const faltan = dias(hoy, vence)
    if (faltan < canje.diasMinimos) return { apto: false, requiereAprobacionDt: false, razon: `Según la política de canje, el proveedor recibe el lote con al menos ${canje.diasMinimos} días antes de vencer; a este le faltan ${faltan}.` }
    if (canje.diasMaximos !== null && faltan > canje.diasMaximos) return { apto: false, requiereAprobacionDt: false, razon: `Según la política de canje, el proveedor recibe el lote cuando faltan ${canje.diasMaximos} días o menos para vencer; a este le faltan ${faltan}.` }
  }
  return { apto: true, requiereAprobacionDt: false }
}

/** El aviso de una devolución al proveedor con poco tiempo por delante (null = sin aviso). Mismo texto que `wms.crear_orden_salida_manual`. */
export function avisoDevolucionCercana(vence: string | null, hoy: string, diasAviso: number = DIAS_AVISO_DEVOLUCION_DEFECTO): string | null {
  if (!vence || vence < hoy) return null
  const faltan = dias(hoy, vence)
  if (faltan >= diasAviso) return null
  return `Al lote le faltan ${faltan} días para vencer y el proveedor pide al menos ${diasAviso} días (${Math.round(diasAviso / 30)} meses). Puedes continuar si escribes el motivo.`
}

export interface Asignacion { loteId: string; codigo: string; vence: string | null; cantidad: number }
export type ResultadoAsignacion =
  | { ok: true; asignaciones: Asignacion[] }
  | { ok: false; motivo: 'STOCK_INSUFICIENTE'; pedido: number; aptoTotal: number; mensaje: string }

export interface EntradaAsignacion { tipo: TipoSalida; motivo: MotivoSalida; cantidad: number; hoy: string; lotes: readonly LoteDisponible[]; loteIndicadoId?: string; minDias?: number; canje?: PoliticaCanje }

/**
 * Tipo A (distribución) y muestras: el pedido no trae lote. Se toma lo que haya del lote FEFO válido y se completa con el siguiente, y así
 * hasta cubrir la cantidad (una asignación por lote). Todo o nada: si ni sumando los lotes alcanza, no se asigna nada.
 * Tipo B (cliente): una línea, un lote, el que indica el cliente, con toda la cantidad.
 * Nunca se toma más de lo disponible de un lote ni se usa un lote vencido. La devolución al proveedor (PROVEEDOR) también indica su lote.
 */
export function asignarLinea(e: EntradaAsignacion): ResultadoAsignacion {
  if (!Number.isInteger(e.cantidad) || e.cantidad <= 0) throw new Error('La cantidad debe ser un entero mayor que cero')
  const aptos = e.lotes
    .filter((l) => l.disponible > 0 && !l.bloqueado && loteApto(l.vence, e.tipo, e.motivo, e.hoy, e.minDias, e.canje).apto)
    .filter((l) => (e.tipo === 'CLIENTE' || e.tipo === 'PROVEEDOR' ? l.loteId === e.loteIndicadoId : true))
    .sort((a, b) => (a.vence ?? '9999-12-31').localeCompare(b.vence ?? '9999-12-31') || a.codigo.localeCompare(b.codigo))
  const aptoTotal = aptos.reduce((t, l) => t + l.disponible, 0)
  const falta = (): ResultadoAsignacion => ({
    ok: false, motivo: 'STOCK_INSUFICIENTE', pedido: e.cantidad, aptoTotal,
    mensaje: e.tipo === 'CLIENTE' || e.tipo === 'PROVEEDOR'
      ? `No hay en el lote indicado ${e.cantidad} unidades disponibles (hay ${aptoTotal}).`
      : `Stock insuficiente: la línea pide ${e.cantidad} y, sumando todos los lotes aptos, hay ${aptoTotal}.`,
  })
  if (e.tipo === 'CLIENTE' || e.tipo === 'PROVEEDOR') {
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
