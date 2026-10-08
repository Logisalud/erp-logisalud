// Inventario en operación (Batch 3): Kardex e historia del lote, vencimientos (D-30), movimientos internos (INV-02),
// conteos cíclicos y ajustes (INV-05) y carga inicial. Dominio puro: sin Next ni Supabase.
import type { Estado, Origen, Rol } from './tipos'
import { puedeVerificar } from './verificacion'
import { diasHasta } from './regulatorio'

// ── Libro mayor (lo que el Kardex y la historia leen) ───────────────────────

export type TipoMovimientoLedger = 'INGRESO' | 'MOVIMIENTO' | 'CAMBIO_ESTADO' | 'AJUSTE' | 'CARGA_INICIAL' | 'REVERSA' | 'CAMBIO_PROPIETARIO'

/** Una partida del libro mayor con lo necesario para el Kardex (en el demo se arma en memoria; en la base lo hace SQL). */
export interface PartidaLedger {
  id: number
  ts: string
  movimientoId: string
  tipo: TipoMovimientoLedger
  /** Tipo del movimiento que esta reversa deshace. */
  tipoOriginal?: TipoMovimientoLedger
  motivo?: string
  posicionId: string
  productoId: string
  loteId: string
  propietarioId: string
  estado: Estado
  origen: Origen
  procedenciaId: string
  delta: number
  ejecutorId?: string
  preparadorId?: string
  verificadorId?: string
  referenciaTipo?: string
  referenciaId?: string
  sustentoTipo?: string
  sustentoId?: string
  reversaDe?: string
  /** Datos del documento de ingreso (solo ingresos): proveedor/cliente, guía o factura y acta. */
  doc?: { tipoIngreso: Origen; contraparte?: string; ruc?: string; tipoDoc?: string; numeroDoc?: string; actaNumero?: string; actaFecha?: string }
}

export interface FiltroKardex {
  productoId: string
  loteId?: string
  propietarioId?: string
  /** AAAA-MM-DD, en hora de Lima. */
  desde?: string
  hasta?: string
}

export interface FilaKardex {
  orden: number
  esSaldoInicial: boolean
  partidaId?: number
  fecha?: string
  tipoDocumento: string
  numeroActa?: string
  fechaActa?: string
  lote?: string
  contraparte?: string
  ruc?: string
  tipoDocRef?: string
  numeroDocRef?: string
  posicion?: string
  entrada?: number
  salida?: number
  saldo: number
  tipoIngreso?: string
  propietario?: string
  producto?: string
  movimientoId?: string
  esReversa: boolean
  motivo?: string
}

export interface FilaHistoriaLote {
  partidaId: number
  fecha: string
  tipo: TipoMovimientoLedger
  motivo?: string
  posicion: string
  estado: Estado
  origen: Origen
  delta: number
  ejecutor?: string
  preparador?: string
  verificador?: string
  movimientoId: string
  reversaDe?: string
  referencia?: string
  sustento?: string
  saldoLote: number
}

export const ETIQUETA_TIPO_MOVIMIENTO: Record<TipoMovimientoLedger, string> = {
  INGRESO: 'Ingreso',
  MOVIMIENTO: 'Movimiento interno',
  CAMBIO_ESTADO: 'Cambio de estado sanitario',
  AJUSTE: 'Ajuste autorizado',
  CARGA_INICIAL: 'Carga inicial',
  REVERSA: 'Reversa',
  CAMBIO_PROPIETARIO: 'Cambio de propietario',
}

const TIPOS_KARDEX: readonly TipoMovimientoLedger[] = ['INGRESO', 'CARGA_INICIAL', 'AJUSTE', 'CAMBIO_PROPIETARIO']

const TEXTO_REVERSA: Partial<Record<TipoMovimientoLedger, string>> = {
  INGRESO: 'acta de recepción', AJUSTE: 'ajuste', CARGA_INICIAL: 'carga inicial', CAMBIO_PROPIETARIO: 'cambio de propietario',
}

export function tipoDocumentoKardex(p: Pick<PartidaLedger, 'tipo' | 'tipoOriginal'>): string {
  if (p.tipo === 'REVERSA') return `Reversa de ${TEXTO_REVERSA[p.tipoOriginal ?? 'INGRESO'] ?? 'movimiento'}`
  if (p.tipo === 'INGRESO') return 'Acta de Recepción'
  if (p.tipo === 'CARGA_INICIAL') return 'Carga inicial'
  if (p.tipo === 'AJUSTE') return 'Ajuste autorizado'
  return 'Cambio de propietario'
}

/** ¿Esta partida cuenta para el Kardex? Solo lo que cambia la cantidad del propietario: no los movimientos internos ni los cambios de estado. */
export function entraEnKardex(p: Pick<PartidaLedger, 'tipo' | 'tipoOriginal'>): boolean {
  const base = p.tipo === 'REVERSA' ? p.tipoOriginal : p.tipo
  return !!base && TIPOS_KARDEX.includes(base)
}

/** Fecha (AAAA-MM-DD) de un instante en la hora de Lima (UTC−5, sin horario de verano). */
export function fechaEnLima(iso: string): string {
  return new Date(Date.parse(iso) - 5 * 3_600_000).toISOString().slice(0, 10)
}

export interface NombresKardex {
  lote: (id: string) => string
  propietario: (id: string) => string
  posicion: (id: string) => string
  producto: string
  propietarioDeLote: (loteId: string) => string
}

/** Kardex por producto o por lote con saldo inicial y saldo corrido (mismo criterio que wms.kardex_filas). */
export function construirKardex(partidas: PartidaLedger[], f: FiltroKardex, n: NombresKardex): FilaKardex[] {
  const base = partidas
    .filter((p) => p.productoId === f.productoId && (!f.loteId || p.loteId === f.loteId)
      && (!f.propietarioId || n.propietarioDeLote(p.loteId) === f.propietarioId) && entraEnKardex(p))
    .sort((a, b) => a.id - b.id)
  const antes = f.desde ? base.filter((p) => fechaEnLima(p.ts) < f.desde!) : []
  const rango = base.filter((p) => (!f.desde || fechaEnLima(p.ts) >= f.desde) && (!f.hasta || fechaEnLima(p.ts) <= f.hasta))
  const inicial = antes.reduce((s, p) => s + p.delta, 0)
  const filas: FilaKardex[] = []
  if (f.desde) filas.push({ orden: 0, esSaldoInicial: true, tipoDocumento: 'Saldo inicial', saldo: inicial, producto: n.producto, esReversa: false })
  let saldo = inicial
  rango.forEach((p, i) => {
    saldo += p.delta
    filas.push({
      orden: i + 1, esSaldoInicial: false, partidaId: p.id, fecha: p.ts, tipoDocumento: tipoDocumentoKardex(p),
      numeroActa: p.doc?.actaNumero, fechaActa: p.doc?.actaFecha, lote: n.lote(p.loteId), contraparte: p.doc?.contraparte, ruc: p.doc?.ruc,
      tipoDocRef: p.doc?.tipoDoc, numeroDocRef: p.doc?.numeroDoc, posicion: n.posicion(p.posicionId),
      entrada: Math.max(p.delta, 0), salida: Math.max(-p.delta, 0), saldo, tipoIngreso: p.doc?.tipoIngreso,
      propietario: n.propietario(p.propietarioId), producto: n.producto, movimientoId: p.movimientoId, esReversa: p.tipo === 'REVERSA', motivo: p.motivo,
    })
  })
  return filas
}

/** Resumen de una vista del Kardex: entradas, salidas y saldo final del rango. */
export function totalesKardex(filas: FilaKardex[]): { entradas: number; salidas: number; saldoInicial: number; saldoFinal: number } {
  const datos = filas.filter((x) => !x.esSaldoInicial)
  const ini = filas.find((x) => x.esSaldoInicial)?.saldo ?? 0
  return {
    entradas: datos.reduce((s, x) => s + (x.entrada ?? 0), 0), salidas: datos.reduce((s, x) => s + (x.salida ?? 0), 0),
    saldoInicial: ini, saldoFinal: datos.length ? datos[datos.length - 1].saldo : ini,
  }
}

// ── Vencimientos (D-30): vencidos y por vencer, con tramos configurables ────

export interface LoteConStock {
  loteId: string
  productoId: string
  producto: string
  lote: string
  vence?: string
  propietario: string
  cantidad: number
  estados: Estado[]
}

export interface TramoVencimiento {
  clave: string
  etiqueta: string
  lotes: (LoteConStock & { dias?: number })[]
  unidades: number
}

export const TRAMOS_POR_DEFECTO = [30, 60, 90, 180]

/** «30,60,90» → [30, 60, 90] (ordenado, positivo y sin repetidos). Vacío o inválido → los tramos por defecto. */
export function parsearTramos(texto: string | undefined | null): number[] {
  const n = (texto ?? '').split(',').map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0)
  const u = [...new Set(n)].sort((a, b) => a - b)
  return u.length ? u : TRAMOS_POR_DEFECTO
}

/** Lo que sigue en el inventario sin contar Bajas/Rechazados, agrupado por tramo. Vencidos primero; sin fecha al final. */
export function reporteVencimientos(lotes: LoteConStock[], hoy: string, tramos: number[] = TRAMOS_POR_DEFECTO): TramoVencimiento[] {
  const vivos = lotes.filter((l) => l.cantidad > 0 && l.estados.some((e) => e !== 'BAJAS_RECHAZADOS'))
  const salida: TramoVencimiento[] = [{ clave: 'vencido', etiqueta: 'Ya vencidos', lotes: [], unidades: 0 }]
  let previo = -1
  for (const t of tramos) {
    salida.push({ clave: `hasta-${t}`, etiqueta: previo < 0 ? `Vencen en ${t} días o menos` : `Vencen entre ${previo + 1} y ${t} días`, lotes: [], unidades: 0 })
    previo = t
  }
  salida.push({ clave: 'mas', etiqueta: `Vencen en más de ${previo} días`, lotes: [], unidades: 0 })
  salida.push({ clave: 'sin-fecha', etiqueta: 'Sin fecha de vencimiento', lotes: [], unidades: 0 })
  for (const l of vivos) {
    let destino: TramoVencimiento
    let dias: number | undefined
    if (!l.vence) destino = salida[salida.length - 1]
    else {
      dias = diasHasta(l.vence, hoy)
      if (dias < 0) destino = salida[0]
      else {
        const i = tramos.findIndex((t) => dias! <= t)
        destino = i === -1 ? salida[salida.length - 2] : salida[1 + i]
      }
    }
    destino.lotes.push({ ...l, dias })
    destino.unidades += l.cantidad
  }
  for (const t of salida) t.lotes.sort((a, b) => (a.dias ?? 1e9) - (b.dias ?? 1e9))
  return salida
}

// ── Movimientos internos (INV-02) ───────────────────────────────────────────

export type EstadoOrden = 'PREPARADO' | 'AUTORIZADO' | 'EJECUTADO' | 'CONFIRMADO' | 'CON_DIFERENCIA' | 'ANULADO'

export const ETIQUETA_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  PREPARADO: 'Por autorizar', AUTORIZADO: 'Por mover', EJECUTADO: 'Por verificar', CONFIRMADO: 'Confirmado',
  CON_DIFERENCIA: 'Con diferencia', ANULADO: 'Anulado',
}

export interface LineaOrdenMovimiento {
  id: string
  productoId: string
  producto: string
  loteId: string
  lote: string
  vence?: string
  propietario: string
  estado: Estado
  procedenciaId: string
  desdePosicionId: string
  desde: string
  haciaPosicionId: string
  hacia: string
  cantidad: number
}

export interface OrdenMovimiento {
  id: string
  numero: string
  estado: EstadoOrden
  motivo: string
  preparadorId: string
  preparador: string
  preparadoEn: string
  autorizadoPor?: string
  autorizadoEn?: string
  ejecutorId?: string
  ejecutor?: string
  ejecutadoEn?: string
  verificadorId?: string
  verificador?: string
  verificadoEn?: string
  notaDiferencia?: string
  motivoAnulacion?: string
  movimientoId?: string
  lineas: LineaOrdenMovimiento[]
}

/** Lo que se pide al preparar: de dónde a dónde, qué y cuánto. */
export interface LineaPreparar {
  desdePosicionId: string
  haciaPosicionId: string
  loteId: string
  estado: Estado
  procedenciaId: string
  cantidad: number
}

const esJefe = (roles: readonly Rol[]) => roles.includes('jefe_almacen') || roles.includes('reemplazo_jefe')
const puedeEjecutarAlgo = (roles: readonly Rol[]) => roles.some((r) => ['auxiliar', 'jefe_almacen', 'reemplazo_jefe', 'asistente_dt'].includes(r))
const puedeVerificarAlgo = (roles: readonly Rol[]) => roles.some((r) => ['auxiliar', 'jefe_almacen', 'reemplazo_jefe'].includes(r))

export const puedePrepararMovimiento = puedeEjecutarAlgo
export const puedeAutorizarMovimiento = esJefe
export const puedeProgramarConteo = esJefe

export interface AccionesOrden {
  autorizar: boolean
  ejecutar: boolean
  verificar: boolean
  /** Por qué no puede verificar quien lo intenta (D-15). */
  motivoNoVerifica?: string
  resolver: boolean
  anular: boolean
}

/** Qué puede hacer esta persona con esta orden ahora (la base de datos vuelve a comprobarlo). */
export function accionesDeOrden(o: OrdenMovimiento, actorId: string, roles: readonly Rol[]): AccionesOrden {
  const verif = o.estado === 'EJECUTADO' && puedeVerificarAlgo(roles)
  const r = verif ? puedeVerificar(actorId, { preparadorId: o.preparadorId, ejecutorId: o.ejecutorId }) : { puede: false as const, mensaje: undefined }
  return {
    autorizar: o.estado === 'PREPARADO' && esJefe(roles),
    ejecutar: o.estado === 'AUTORIZADO' && puedeEjecutarAlgo(roles),
    verificar: verif && r.puede,
    motivoNoVerifica: verif && !r.puede ? r.mensaje : undefined,
    resolver: o.estado === 'CON_DIFERENCIA' && esJefe(roles),
    anular: (o.estado === 'PREPARADO' || o.estado === 'AUTORIZADO') && (actorId === o.preparadorId || esJefe(roles)),
  }
}

// ── Conteos cíclicos (INV-05) y ajustes ─────────────────────────────────────

export type EstadoConteo = 'PROGRAMADO' | 'EN_CONTEO' | 'POR_RECONTAR' | 'EN_REVISION' | 'CERRADO'
export type ResultadoLinea = 'COINCIDE' | 'COINCIDE_EN_RECONTEO' | 'DIFERENCIA_CONFIRMADA' | 'NO_CONCLUYENTE' | 'AJUSTADA' | 'ESCALADA'

export const ETIQUETA_ESTADO_CONTEO: Record<EstadoConteo, string> = {
  PROGRAMADO: 'Programado', EN_CONTEO: 'Contando', POR_RECONTAR: 'Por recontar', EN_REVISION: 'En revisión', CERRADO: 'Cerrado',
}
export const ETIQUETA_RESULTADO_LINEA: Record<ResultadoLinea, string> = {
  COINCIDE: 'Coincide', COINCIDE_EN_RECONTEO: 'Coincide en el reconteo', DIFERENCIA_CONFIRMADA: 'Diferencia confirmada',
  NO_CONCLUYENTE: 'Diferencia sin explicar', AJUSTADA: 'Ajustada', ESCALADA: 'Escalada',
}

/** Resultado del segundo conteo (mismo criterio que wms.registrar_conteo). */
export function clasificarReconteo(sistema: number, conteo1: number, conteo2: number): ResultadoLinea {
  if (conteo2 === sistema) return 'COINCIDE_EN_RECONTEO'
  if (conteo2 === conteo1) return 'DIFERENCIA_CONFIRMADA'
  return 'NO_CONCLUYENTE'
}

export interface LineaConteoVista {
  id: string
  posicion: string
  productoId: string
  producto: string
  lote: string
  vence?: string
  propietario: string
  estado: Estado
  /** Lo que contó quien mira. El conteo de otra persona nunca se muestra a un contador. */
  miConteo?: number
  conteo1?: number
  conteo2?: number
  /** Solo para quien gestiona y solo cuando el primer conteo de esa línea terminó. */
  cantidadSistema?: number
  resultado?: ResultadoLinea
  causa?: string
  nota?: string
  puedeContar: boolean
  ajuste?: 'PROPUESTO' | 'AUTORIZADO' | 'RECHAZADO'
}

export interface ConteoVista {
  id: string
  numero: string
  estado: EstadoConteo
  nota?: string
  programadoPor: string
  programadoEn: string
  cerradoEn?: string
  resultado?: 'COINCIDE' | 'CORREGIDO' | 'ESCALADO'
  causa?: string
  accion?: string
  lineas: number
  resueltas: number
}

export interface AjusteVista {
  id: string
  numero: string
  conteoLineaId: string
  conteoNumero: string
  producto: string
  lote: string
  posicion: string
  delta: number
  causa: string
  motivo: string
  estado: 'PROPUESTO' | 'AUTORIZADO' | 'RECHAZADO'
  propuestoPor: string
  propuestoEn: string
  decididoPor?: string
  decididoEn?: string
  notaDecision?: string
}

export const puedeDecidirAjuste = (roles: readonly Rol[]) => roles.includes('direccion_tecnica')

// ── Carga inicial (D-09) ────────────────────────────────────────────────────

export interface FilaCargaInicial {
  producto: string
  lote: string
  vence: string
  propietario: string
  posicion: string
  estado: string
  cantidad: string
}

export interface ErrorFilaCarga { fila: number; error: string }

export interface CargaInicialVista {
  id: string
  numero: string
  estado: 'BORRADOR' | 'CONFIRMADA' | 'ANULADA'
  nota?: string
  creadoPor: string
  creadoEn: string
  confirmadoEn?: string
  filas: number
  unidades: number
}

const COLUMNAS_CARGA = ['producto', 'lote', 'vence', 'propietario', 'posicion', 'estado', 'cantidad'] as const

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Lee el texto de una carga inicial (CSV con coma, punto y coma o tabulación, con encabezados):
 * producto, lote, vence, propietario, posicion, estado, cantidad. Admite los nombres con o sin tilde.
 */
export function parsearCargaInicial(texto: string): { filas: FilaCargaInicial[]; errores: ErrorFilaCarga[] } {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lineas.length === 0) return { filas: [], errores: [{ fila: 0, error: 'El archivo está vacío' }] }
  const sep = [';', '\t', ','].reduce((mejor, s) => (lineas[0].split(s).length > lineas[0].split(mejor).length ? s : mejor), ',')
  const celdas = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
  const enc = celdas(lineas[0]).map(sinTildes)
  const alias: Record<string, (typeof COLUMNAS_CARGA)[number]> = {
    producto: 'producto', codigo: 'producto', lote: 'lote', vence: 'vence', vencimiento: 'vence', propietario: 'propietario',
    posicion: 'posicion', ubicacion: 'posicion', estado: 'estado', cantidad: 'cantidad',
  }
  const idx = new Map<(typeof COLUMNAS_CARGA)[number], number>()
  enc.forEach((c, i) => { const k = alias[c]; if (k && !idx.has(k)) idx.set(k, i) })
  const faltan = COLUMNAS_CARGA.filter((c) => !idx.has(c))
  if (faltan.length) return { filas: [], errores: [{ fila: 0, error: `Faltan las columnas: ${faltan.join(', ')}` }] }
  const filas: FilaCargaInicial[] = []
  const errores: ErrorFilaCarga[] = []
  lineas.slice(1).forEach((l, k) => {
    const c = celdas(l)
    const v = (n: (typeof COLUMNAS_CARGA)[number]) => c[idx.get(n)!] ?? ''
    const cantidad = v('cantidad').replace(/[.,\s]/g, '')
    if (!/^\d+$/.test(cantidad) || Number(cantidad) <= 0) errores.push({ fila: k + 1, error: `La cantidad «${v('cantidad')}» no es un entero mayor que cero` })
    let vence = v('vence')
    const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(vence)
    if (dmy) vence = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
    if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(vence)) errores.push({ fila: k + 1, error: `La fecha «${v('vence')}» no se entiende: usa 31/12/2028 o 2028-12-31` })
    filas.push({ producto: v('producto'), lote: v('lote'), vence, propietario: v('propietario').toUpperCase(), posicion: v('posicion').toUpperCase(), estado: v('estado').toUpperCase(), cantidad })
  })
  return { filas, errores }
}
