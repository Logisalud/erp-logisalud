// Tamaño de la muestra de la evaluación organoléptica: tabla LS-TB.02.02 «Tamaño de muestra» (Tabla militar estándar), que REEMPLAZA a la regla
// anterior techo(√unidades)+1. DT, 2026-10-17 (docs/wms/respuestas-dt-2026-10.md §6).
//
//  · Lotes de menos de 100 unidades: se evalúa el 100 %.   · Devoluciones: el 100 %.
//  · Evaluación SIMPLIFICADA (la de siempre): 100–1.000 → 20; 1.001–10.000 → 30; 10.001–100.000 → 80; más de 100.000 → 150.
//  · Evaluación NORMAL (automática si es un producto o un proveedor nuevo, o sea, su primera recepción): 50; 150; 300; 500.
//  · Evaluación ESTRICTA (productos con antecedentes de calidad, que marca Dirección Técnica): el 100 %.
//
// La tabla NO está en el código: vive en la base de datos como parámetro con su código y su vigencia (wms.tablas_muestreo). La constante de aquí es el
// mismo contenido para el modo demostración y para las pruebas; la base de datos repite la regla (migración 0025).

export type RegimenMuestreo = 'SIMPLIFICADA' | 'NORMAL' | 'ESTRICTA' | 'DEVOLUCION' | 'LOTE_MENOR'
export const REGIMENES_MUESTREO: readonly RegimenMuestreo[] = ['SIMPLIFICADA', 'NORMAL', 'ESTRICTA', 'DEVOLUCION', 'LOTE_MENOR']

export interface TramoMuestreo { desde: number; hasta: number | null; muestra: number }

export interface TablaMuestreo {
  codigo: string
  vigenteDesde: string
  vigenteHasta?: string
  /** Por debajo de esta cantidad de unidades se evalúa todo el lote. */
  umbralTotal: number
  simplificada: readonly TramoMuestreo[]
  normal: readonly TramoMuestreo[]
}

/** El contenido de LS-TB.02.02 (vigente del 01-09-2026 al 01-09-2028). Es el dato de arranque: la base de datos lo guarda como parámetro. */
export const TABLA_LS_TB_02_02: TablaMuestreo = {
  codigo: 'LS-TB.02.02',
  vigenteDesde: '2026-09-01',
  vigenteHasta: '2028-09-01',
  umbralTotal: 100,
  simplificada: [
    { desde: 100, hasta: 1000, muestra: 20 },
    { desde: 1001, hasta: 10000, muestra: 30 },
    { desde: 10001, hasta: 100000, muestra: 80 },
    { desde: 100001, hasta: null, muestra: 150 },
  ],
  normal: [
    { desde: 100, hasta: 1000, muestra: 50 },
    { desde: 1001, hasta: 10000, muestra: 150 },
    { desde: 10001, hasta: 100000, muestra: 300 },
    { desde: 100001, hasta: null, muestra: 500 },
  ],
}

export const ETIQUETA_REGIMEN: Record<RegimenMuestreo, string> = {
  SIMPLIFICADA: 'Evaluación simplificada',
  NORMAL: 'Evaluación normal',
  ESTRICTA: 'Evaluación estricta',
  DEVOLUCION: 'Devolución',
  LOTE_MENOR: 'Lote pequeño',
}

export interface EntradaMuestreo {
  unidades: number
  /** Una devolución (también la que vuelve de una Orden de Salida) se evalúa al 100 %. */
  esDevolucion: boolean
  /** Dirección Técnica marcó al producto con antecedentes de calidad. */
  antecedentesCalidad: boolean
  /** Primera recepción del producto en el almacén. */
  productoNuevo: boolean
  /** Primera compra a ese proveedor. */
  proveedorNuevo: boolean
}

/** El régimen que corresponde. El orden importa: devolución, estricta, lote pequeño, normal (producto o proveedor nuevo) y, si nada de eso, simplificada. */
export function regimenDeMuestreo(e: EntradaMuestreo, tabla: Pick<TablaMuestreo, 'umbralTotal'> = TABLA_LS_TB_02_02): RegimenMuestreo {
  if (e.esDevolucion) return 'DEVOLUCION'
  if (e.antecedentesCalidad) return 'ESTRICTA'
  if (e.unidades < tabla.umbralTotal) return 'LOTE_MENOR'
  if (e.productoNuevo || e.proveedorNuevo) return 'NORMAL'
  return 'SIMPLIFICADA'
}

/** ¿Este régimen evalúa todas las unidades? */
export const evaluaTodo = (r: RegimenMuestreo) => r === 'DEVOLUCION' || r === 'ESTRICTA' || r === 'LOTE_MENOR'

/** Cuántas unidades se toman de muestra. Nunca más que las del lote. */
export function tamanoDeMuestra(unidades: number, regimen: RegimenMuestreo, tabla: TablaMuestreo = TABLA_LS_TB_02_02): number {
  const n = Math.max(0, Math.trunc(unidades))
  if (evaluaTodo(regimen) || n < tabla.umbralTotal) return n
  const tramos = regimen === 'NORMAL' ? tabla.normal : tabla.simplificada
  const t = tramos.find((x) => n >= x.desde && (x.hasta == null || n <= x.hasta))
  if (!t) throw new Error(`La tabla ${tabla.codigo} no tiene un tramo para ${n} unidades`)
  return Math.min(t.muestra, n)
}

export interface PlanMuestreo {
  regimen: RegimenMuestreo
  muestra: number
  /** Se toma todo el lote. */
  todo: boolean
  tablaCodigo: string
  /** Por qué este régimen, en palabras (para el acta y la pantalla). */
  motivo: string
}

export function planDeMuestreo(e: EntradaMuestreo, tabla: TablaMuestreo = TABLA_LS_TB_02_02): PlanMuestreo {
  const regimen = regimenDeMuestreo(e, tabla)
  const muestra = tamanoDeMuestra(e.unidades, regimen, tabla)
  const motivo: Record<RegimenMuestreo, string> = {
    DEVOLUCION: 'Es una devolución: se evalúa el 100 % de las unidades.',
    ESTRICTA: 'Dirección Técnica marcó este producto con antecedentes de calidad: se evalúa el 100 % de las unidades.',
    LOTE_MENOR: `El lote tiene menos de ${tabla.umbralTotal} unidades: se evalúa el 100 %.`,
    NORMAL: e.productoNuevo && e.proveedorNuevo ? 'Producto y proveedor nuevos (primera recepción): evaluación normal.' : e.productoNuevo ? 'Producto nuevo (primera recepción): evaluación normal.' : 'Proveedor nuevo (primera recepción): evaluación normal.',
    SIMPLIFICADA: 'Producto y proveedor conocidos: evaluación simplificada.',
  }
  return { regimen, muestra, todo: muestra >= Math.max(0, Math.trunc(e.unidades)), tablaCodigo: tabla.codigo, motivo: motivo[regimen] }
}

/** El texto del acta y de la pantalla: «Toma 20 unidades de muestra (evaluación simplificada, LS-TB.02.02)». */
export function textoMuestra(muestra: number, regimen: RegimenMuestreo | undefined, tablaCodigo: string | undefined, unidades: number): string {
  if (!regimen) return `Toma ${muestra.toLocaleString('es-PE')} unidades de muestra.`
  const cod = tablaCodigo ? `, ${tablaCodigo}` : ''
  return evaluaTodo(regimen) || muestra >= unidades
    ? `Evalúa las ${unidades.toLocaleString('es-PE')} unidades del lote (el 100 %; ${ETIQUETA_REGIMEN[regimen].toLowerCase()}${cod}).`
    : `Toma ${muestra.toLocaleString('es-PE')} unidades de muestra (${ETIQUETA_REGIMEN[regimen].toLowerCase()}${cod}).`
}

/** Vigencia de la tabla: ¿rige en esa fecha? */
export const tablaRige = (t: Pick<TablaMuestreo, 'vigenteDesde' | 'vigenteHasta'>, fecha: string) =>
  t.vigenteDesde <= fecha && (!t.vigenteHasta || fecha <= t.vigenteHasta)

/** De varias versiones de la tabla, la que rige en la fecha (la de vigencia más reciente). */
export function tablaVigente<T extends Pick<TablaMuestreo, 'vigenteDesde' | 'vigenteHasta'>>(tablas: readonly T[], fecha: string): T | undefined {
  return [...tablas].filter((t) => tablaRige(t, fecha)).sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))[0]
}

/** Una marca de Dirección Técnica: el producto tiene antecedentes de calidad y se evalúa al 100 %. Nada se borra: se quita con motivo. */
export interface AntecedenteCalidadVista {
  id: string
  productoId: string
  productoCodigo: string
  producto: string
  motivo: string
  marcadoPor: string
  marcadoEn: string
  quitadoPor?: string
  quitadoEn?: string
  motivoQuita?: string
}
export const antecedenteVigente = (a: AntecedenteCalidadVista) => !a.quitadoEn

export const AYUDA_ANTECEDENTES = 'Un producto con antecedentes de calidad se evalúa al 100 % en cada recepción (evaluación estricta). Lo marca y lo quita Dirección Técnica, siempre con motivo.'
