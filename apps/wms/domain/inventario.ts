// Inventario en operación (Batch 3): Kardex e historia del lote, vencimientos (D-30), movimientos internos (INV-02),
// conteos cíclicos y ajustes (INV-05) y carga inicial. Dominio puro: sin Next ni Supabase.
import type { Estado, Origen, Rol } from './tipos'
import { puedeVerificar } from './verificacion'
import { diasHasta } from './regulatorio'
import type { Panorama } from './panorama'
import { normalizar, puntaje } from './busqueda'
import { areaAdmite, ETIQUETA_AREA, mensajeZonaNoAdmite, posicionAcepta, propietarioVigente } from './zonas'

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

export type EstadoOrden = 'EJECUTADO' | 'CONFIRMADO' | 'CON_DIFERENCIA' | 'ANULADO'

export const ETIQUETA_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  EJECUTADO: 'Por verificar', CONFIRMADO: 'Confirmado', CON_DIFERENCIA: 'Con diferencia', ANULADO: 'Anulado',
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
  /** Cada línea se verifica por separado: una diferencia deja abierta solo esa línea. */
  verificacion: VerificacionLineaMov
  notaDiferencia?: string
  movimientoId?: string
}

export type VerificacionLineaMov = 'PENDIENTE' | 'CONFIRMADA' | 'CON_DIFERENCIA' | 'ANULADA'
export const ETIQUETA_VERIFICACION_LINEA: Record<VerificacionLineaMov, string> = {
  PENDIENTE: 'Por verificar', CONFIRMADA: 'Confirmada', CON_DIFERENCIA: 'Con diferencia', ANULADA: 'Anulada',
}

/** Lo que decide el verificador por cada línea pendiente. */
export interface RevisionLinea { lineaId: string; resultado: 'COINCIDE' | 'DIFERENCIA'; nota?: string }

export interface OrdenMovimiento {
  id: string
  numero: string
  estado: EstadoOrden
  motivo: string
  /** Quien lo creó en el sistema y movió la mercadería (la misma persona). */
  ejecutorId: string
  ejecutor: string
  ejecutadoEn: string
  /** Llave de idempotencia del borrador con que se creó (no se muestra). */
  token?: string
  verificadorId?: string
  verificador?: string
  verificadoEn?: string
  notaDiferencia?: string
  motivoAnulacion?: string
  movimientoId?: string
  lineas: LineaOrdenMovimiento[]
}

/** Lo que se registra al ejecutar: de dónde a dónde, qué y cuánto (vencimiento, propietario y estado salen del lote). */
export interface LineaEjecutar {
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

/** Quien mueve mercadería registra el movimiento (y lo ejecuta). No hay autorización previa en el sistema: la indicación es verbal. */
export const puedeEjecutarMovimiento = puedeEjecutarAlgo
export const puedeProgramarConteo = esJefe

export interface AccionesOrden {
  verificar: boolean
  /** Por qué no puede verificar quien lo intenta (D-15). */
  motivoNoVerifica?: string
  resolver: boolean
  anular: boolean
}

/** Qué puede hacer esta persona con esta orden ahora (la base de datos vuelve a comprobarlo). */
export function accionesDeOrden(o: OrdenMovimiento, actorId: string, roles: readonly Rol[]): AccionesOrden {
  const verif = o.estado === 'EJECUTADO' && puedeVerificarAlgo(roles)
  const r = verif ? puedeVerificar(actorId, { ejecutorId: o.ejecutorId }) : { puede: false as const, mensaje: undefined }
  return {
    verificar: verif && r.puede,
    motivoNoVerifica: verif && !r.puede ? r.mensaje : undefined,
    resolver: o.estado === 'CON_DIFERENCIA' && esJefe(roles),
    // Solo mientras nadie verificó ninguna línea: lo anula quien lo ejecutó o el Jefe.
    anular: o.estado === 'EJECUTADO' && o.lineas.every((l) => l.verificacion === 'PENDIENTE') && (actorId === o.ejecutorId || esJefe(roles)),
  }
}

// ── Vistas guardadas (listas y reportes): filtros con nombre, por persona ─────────────────────────

export type ReporteVista = 'INVENTARIO' | 'OCUPACION' | 'RECEPCIONES' | 'CALIDAD' | 'MOVIMIENTOS' | 'EXACTITUD' | 'AUDITORIA'
export interface VistaGuardada { id: string; reporte: ReporteVista; nombre: string; filtros: Record<string, string> }

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

// ── Flujo «Mover»: empezar por el origen, marcar líneas y elegir un solo destino ─────────────────────

export interface ResultadoOrigen {
  posicionId: string
  codigo: string
  area: string
  unidades: number
  lineas: number
  /** Productos o lotes que coinciden con lo escrito (para reconocer la ubicación de un vistazo). */
  coincidencias: string[]
  /** Si no se puede mover desde ahí hoy (en conteo o con un movimiento abierto). */
  bloqueada?: string
}

/** Una línea de lo que hay en una ubicación: producto, lote, estado y cuántas unidades se pueden mover. */
export interface LineaContenido {
  clave: string
  posicionId: string
  /** Código y área de la ubicación donde está (para mostrar «dónde está» sin otra consulta). */
  posicion: string
  area: string
  loteId: string
  productoId: string
  codigoProducto: string
  producto: string
  lote: string
  vence?: string
  propietarioId: string
  propietario: string
  estado: Estado
  procedenciaId: string
  cantidad: number
  /** Lo que queda libre después de lo reservado por otros movimientos abiertos. */
  disponible: number
}

export const claveCelda = (posicionId: string, loteId: string, estado: string, procedenciaId: string) => `${posicionId}|${loteId}|${estado}|${procedenciaId}`

/** Unidades reservadas por movimientos abiertos, por celda (para no ofrecer dos veces lo mismo). */
export function reservadoPorCelda(ordenes: OrdenMovimiento[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const o of ordenes) {
    if (!['EJECUTADO', 'CON_DIFERENCIA'].includes(o.estado)) continue
    for (const l of o.lineas) {
      if (l.verificacion !== 'PENDIENTE' && l.verificacion !== 'CON_DIFERENCIA') continue
      const k = claveCelda(l.desdePosicionId, l.loteId, l.estado, l.procedenciaId)
      m.set(k, (m.get(k) ?? 0) + l.cantidad)
    }
  }
  return m
}

export function contenidoDeUbicacion(p: Panorama, posicionId: string, reservado: Map<string, number> = new Map()): LineaContenido[] {
  const lote = new Map(p.lotes.map((l) => [l.id, l]))
  const prod = new Map(p.productos.map((x) => [x.id, x]))
  const prop = new Map(p.propietarios.map((x) => [x.id, x]))
  const pos = new Map(p.posiciones.map((x) => [x.id, x]))
  return p.saldos.filter((s) => s.posicionId === posicionId && s.cantidad > 0).map((s): LineaContenido => {
    const l = lote.get(s.loteId); const x = prod.get(s.productoId)
    const clave = claveCelda(s.posicionId, s.loteId, s.estado, s.procedenciaId)
    const ub = pos.get(s.posicionId)
    return {
      clave, posicionId: s.posicionId, posicion: ub?.codigo ?? '—', area: ub ? ETIQUETA_AREA[ub.tipoArea] : '—', loteId: s.loteId, productoId: s.productoId, codigoProducto: x?.codigo ?? '', producto: x?.descripcion ?? '—', lote: l?.codigo ?? '—', vence: l?.vence,
      propietarioId: s.propietarioId, propietario: prop.get(s.propietarioId)?.codigo ?? '—', estado: s.estado, procedenciaId: s.procedenciaId, cantidad: s.cantidad,
      disponible: Math.max(0, s.cantidad - (reservado.get(clave) ?? 0)),
    }
  }).sort((a, b) => a.producto.localeCompare(b.producto, 'es') || a.lote.localeCompare(b.lote, 'es', { numeric: true }))
}

/** Busca ubicaciones de ORIGEN por código de ubicación, producto, código, lote o propietario; solo las que tienen unidades. */
export function buscarOrigenes(p: Panorama, consulta: string, bloqueadas: Record<string, string> = {}, limite = 12): ResultadoOrigen[] {
  const q = consulta.trim()
  if (!q) return []
  const lote = new Map(p.lotes.map((l) => [l.id, l]))
  const prod = new Map(p.productos.map((x) => [x.id, x]))
  const porPos = new Map<string, { unidades: number; lineas: number; mejor: number; coincidencias: string[] }>()
  for (const s of p.saldos) {
    if (s.cantidad <= 0) continue
    const x = prod.get(s.productoId); const l = lote.get(s.loteId)
    const sp = Math.max(puntaje(q, x?.descripcion ?? ''), puntaje(q, x?.codigo ?? ''), puntaje(q, l?.codigo ?? ''), puntaje(q, x?.principioActivo ?? ''))
    const e = porPos.get(s.posicionId) ?? { unidades: 0, lineas: 0, mejor: 0, coincidencias: [] }
    e.unidades += s.cantidad; e.lineas += 1
    if (sp > 0) {
      e.mejor = Math.max(e.mejor, sp)
      const etiqueta = puntaje(q, l?.codigo ?? '') >= sp ? `lote ${l?.codigo}` : (x?.descripcion ?? '')
      if (e.coincidencias.length < 2 && !e.coincidencias.includes(etiqueta)) e.coincidencias.push(etiqueta)
    }
    porPos.set(s.posicionId, e)
  }
  const out: (ResultadoOrigen & { score: number })[] = []
  for (const pos of p.posiciones) {
    const e = porPos.get(pos.id)
    if (!e) continue
    const score = Math.max(puntaje(q, pos.codigo) * 1.2, e.mejor)
    if (score <= 0) continue
    out.push({ posicionId: pos.id, codigo: pos.codigo, area: ETIQUETA_AREA[pos.tipoArea], unidades: e.unidades, lineas: e.lineas, coincidencias: e.coincidencias, bloqueada: bloqueadas[pos.id], score })
  }
  return out.sort((a, b) => b.score - a.score || a.codigo.localeCompare(b.codigo, 'es', { numeric: true })).slice(0, limite).map(({ score: _s, ...r }) => { void _s; return r })
}

// ── Agregar líneas por producto: ¿en qué ubicaciones está y cuánto hay disponible? ──────────────────

export interface ResultadoProducto {
  productoId: string
  codigo: string
  descripcion: string
  principioActivo?: string
  presentacion?: string
  /** Unidades disponibles para mover (saldo menos lo reservado por movimientos abiertos). */
  disponibles: number
  ubicaciones: number
  /** Lotes que coinciden con lo escrito, para reconocer el producto de un vistazo. */
  coincidencias: string[]
}

/** Busca PRODUCTOS con stock por nombre, código, principio activo o lote. */
export function buscarProductosConStock(p: Panorama, consulta: string, reservado: Map<string, number> = new Map(), limite = 10, bloqueadas: Record<string, string> = {}): ResultadoProducto[] {
  const q = consulta.trim()
  if (!q) return []
  const lote = new Map(p.lotes.map((l) => [l.id, l]))
  const porProducto = new Map<string, { disponibles: number; posiciones: Set<string>; mejor: number; coincidencias: string[] }>()
  for (const s of p.saldos) {
    if (s.cantidad <= 0 || bloqueadas[s.posicionId]) continue   // una ubicación en conteo no aparece como origen
    const x = p.productos.find((q2) => q2.id === s.productoId)
    if (!x) continue
    const l = lote.get(s.loteId)
    const base = Math.max(puntaje(q, x.descripcion), puntaje(q, x.codigo), puntaje(q, x.principioActivo ?? ''))
    const sLote = puntaje(q, l?.codigo ?? '')
    const e = porProducto.get(x.id) ?? { disponibles: 0, posiciones: new Set<string>(), mejor: 0, coincidencias: [] }
    e.disponibles += Math.max(0, s.cantidad - (reservado.get(claveCelda(s.posicionId, s.loteId, s.estado, s.procedenciaId)) ?? 0))
    e.posiciones.add(s.posicionId)
    e.mejor = Math.max(e.mejor, base, sLote)
    if (sLote > 0 && sLote >= base && l && e.coincidencias.length < 2 && !e.coincidencias.includes(`lote ${l.codigo}`)) e.coincidencias.push(`lote ${l.codigo}`)
    porProducto.set(x.id, e)
  }
  const out: (ResultadoProducto & { score: number })[] = []
  for (const [id, e] of porProducto) {
    if (e.mejor <= 0) continue
    const x = p.productos.find((q2) => q2.id === id)!
    out.push({ productoId: id, codigo: x.codigo, descripcion: x.descripcion, principioActivo: x.principioActivo, presentacion: x.presentacion, disponibles: e.disponibles, ubicaciones: e.posiciones.size, coincidencias: e.coincidencias, score: e.mejor })
  }
  return out.sort((a, b) => b.score - a.score || a.descripcion.localeCompare(b.descripcion, 'es')).slice(0, limite).map(({ score: _s, ...r }) => { void _s; return r })
}

/** Una celda (ubicación + lote + estado) donde está el producto, con lo disponible para mover. */
export interface CeldaDeProducto extends LineaContenido { bloqueada?: string }

/**
 * Todas las ubicaciones donde está un producto: primero lo que vence antes (FEFO), luego por ubicación.
 * Una ubicación en conteo NO aparece (ni como origen ni como destino).
 */
export function ubicacionesDeProducto(p: Panorama, productoId: string, reservado: Map<string, number> = new Map(), bloqueadas: Record<string, string> = {}): CeldaDeProducto[] {
  const posiciones = new Set(p.saldos.filter((s) => s.productoId === productoId && s.cantidad > 0 && !bloqueadas[s.posicionId]).map((s) => s.posicionId))
  const celdas: CeldaDeProducto[] = []
  for (const id of posiciones) {
    for (const c of contenidoDeUbicacion(p, id, reservado)) if (c.productoId === productoId) celdas.push({ ...c })
  }
  return celdas.sort((a, b) => (a.vence ?? '9999').localeCompare(b.vence ?? '9999') || a.posicion.localeCompare(b.posicion, 'es', { numeric: true }) || a.lote.localeCompare(b.lote, 'es', { numeric: true }))
}

/** Una línea de la lista del movimiento, con su destino efectivo (el de la cabecera o uno propio). */
export interface LineaParaChequear extends Pick<LineaContenido, 'clave' | 'posicionId' | 'propietarioId' | 'propietario' | 'estado'> { haciaPosicionId?: string }
export interface ValidacionLineaMov { clave: string; ok: boolean; mensaje?: string; sinDestino?: boolean }

/** Valida cada línea contra SU destino (propietario, área, estado, ubicación en conteo) con mensajes humanos. La base de datos vuelve a validar. */
export function validarLineasMovimiento(p: Panorama, lineas: LineaParaChequear[], bloqueadas: Record<string, string> = {}): ValidacionLineaMov[] {
  const porDestino = new Map<string, LineaParaChequear[]>()
  for (const l of lineas) if (l.haciaPosicionId) porDestino.set(l.haciaPosicionId, [...(porDestino.get(l.haciaPosicionId) ?? []), l])
  const resultado = new Map<string, ValidacionLineaMov>()
  for (const [destino, ls] of porDestino) {
    const v = validarDestino(p, destino, ls, bloqueadas)
    for (const r of v?.porLinea ?? []) resultado.set(r.clave, r)
  }
  const nombre = (id: string) => p.posiciones.find((x) => x.id === id)?.codigo ?? id
  return lineas.map((l): ValidacionLineaMov => {
    if (bloqueadas[l.posicionId]) return { clave: l.clave, ok: false, mensaje: `La ubicación ${nombre(l.posicionId)} ${bloqueadas[l.posicionId]}: no se mueve desde ahí.` }
    if (!l.haciaPosicionId) return { clave: l.clave, ok: false, sinDestino: true, mensaje: 'Falta elegir el destino.' }
    return resultado.get(l.clave) ?? { clave: l.clave, ok: false, mensaje: 'No encontramos ese destino.' }
  })
}

export interface ValidacionLineaDestino { clave: string; ok: boolean; mensaje?: string }
export interface ValidacionDestino {
  posicionId: string
  codigo: string
  area: string
  /** Problema de la ubicación entera (inactiva, en conteo, con un movimiento abierto). */
  general?: string
  porLinea: ValidacionLineaDestino[]
  validas: number
  invalidas: number
  /** Se puede enviar tal cual: ninguna línea tiene problemas. */
  ok: boolean
}

type LineaParaValidar = Pick<LineaContenido, 'clave' | 'posicionId' | 'propietarioId' | 'propietario' | 'estado'>

/** El origen exacto de una unidad no viaja en el saldo: solo importa para Devoluciones, donde el estado ya lo dice. */
const origenAproximado = (estado: Estado): Origen => (estado === 'DEVOLUCIONES' ? 'DEVOLUCION' : 'COMPRA_LOCAL')

/** Validación inmediata del destino: propietario, área y estado, con mensajes humanos. La base de datos vuelve a validar cada línea. */
export function validarDestino(p: Panorama, destinoId: string, lineas: LineaParaValidar[], bloqueadas: Record<string, string> = {}): ValidacionDestino | null {
  const d = p.posiciones.find((x) => x.id === destinoId)
  if (!d) return null
  const general = !d.activa ? `La ubicación ${d.codigo} está inactiva.` : bloqueadas[d.id] ? `La ubicación ${d.codigo} ${bloqueadas[d.id]}.` : undefined
  const duenio = propietarioVigente(d.id, p.asignaciones, p.hoy)
  const nombreDuenio = duenio ? p.propietarios.find((x) => x.id === duenio)?.codigo : undefined
  const porLinea = lineas.map((l): ValidacionLineaDestino => {
    if (general) return { clave: l.clave, ok: false, mensaje: general }
    if (l.posicionId === d.id) return { clave: l.clave, ok: false, mensaje: 'Ya está en esa ubicación.' }
    if (!areaAdmite(d.tipoArea, l.estado, origenAproximado(l.estado))) return { clave: l.clave, ok: false, mensaje: mensajeZonaNoAdmite(d.tipoArea, l.estado) }
    if (!posicionAcepta(d, l.propietarioId, p.asignaciones, p.hoy)) {
      return { clave: l.clave, ok: false, mensaje: nombreDuenio ? `${d.codigo} es de ${nombreDuenio}: no recibe stock de ${l.propietario}.` : `${d.codigo} no tiene una asignación vigente para ${l.propietario}.` }
    }
    return { clave: l.clave, ok: true }
  })
  const validas = porLinea.filter((x) => x.ok).length
  return { posicionId: d.id, codigo: d.codigo, area: ETIQUETA_AREA[d.tipoArea], general, porLinea, validas, invalidas: porLinea.length - validas, ok: porLinea.length > 0 && validas === porLinea.length }
}

export interface ResultadoDestino {
  posicionId: string; codigo: string; area: string; validas: number; invalidas: number; general?: string; ocupadas: number
  /** Con UNA sola línea: por qué esa ubicación no la recibe (mensaje humano). */
  motivo?: string
}

/** Busca ubicaciones de DESTINO por código; primero las que sirven para todas las líneas marcadas. */
export function buscarDestinos(p: Panorama, consulta: string, lineas: LineaParaValidar[], bloqueadas: Record<string, string> = {}, limite = 10): ResultadoDestino[] {
  const q = consulta.trim()
  if (!q) return []
  const unidades = new Map<string, number>()
  for (const s of p.saldos) if (s.cantidad > 0) unidades.set(s.posicionId, (unidades.get(s.posicionId) ?? 0) + s.cantidad)
  const out: (ResultadoDestino & { score: number })[] = []
  for (const pos of p.posiciones) {
    if (bloqueadas[pos.id]) continue   // una ubicación en conteo no aparece como destino
    const score = puntaje(q, pos.codigo)
    if (score === 0 && !normalizar(ETIQUETA_AREA[pos.tipoArea]).includes(normalizar(q))) continue
    const v = validarDestino(p, pos.id, lineas, bloqueadas)!
    out.push({ posicionId: pos.id, codigo: pos.codigo, area: v.area, validas: v.validas, invalidas: v.invalidas, general: v.general, ocupadas: unidades.get(pos.id) ?? 0, motivo: lineas.length === 1 && !v.ok ? (v.general ?? v.porLinea[0]?.mensaje) : undefined, score })
  }
  return out.sort((a, b) => Number(a.invalidas > 0) - Number(b.invalidas > 0) || b.score - a.score || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
    .slice(0, limite).map(({ score: _s, ...r }) => { void _s; return r })
}
