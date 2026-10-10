// Creación de un movimiento en MODO TABLA: una línea por producto, cada una con su origen (celda), destino y cantidad.
// Todo lo que decide qué mensaje se ve bajo cada línea, cuánto hay disponible de verdad, si se puede revisar y ejecutar, y cómo se guarda
// el borrador vive aquí (puro, probado). La base de datos vuelve a validar cada línea al ejecutar.
import { normalizar, puntaje } from './busqueda'
import { ETIQUETA_AREA, AREAS_COMPARTIDAS, propietarioVigente } from './zonas'
import { validarDestino, type LineaParaChequear } from './inventario'
import type { Panorama } from './panorama'

// ── Qué dice cada línea ──────────────────────────────────────────────────────

export interface MensajeLinea { tipo: 'falta' | 'error'; texto: string }

export interface DatosEvaluacion {
  tieneProducto: boolean
  /** Código de la ubicación de origen (undefined = todavía no eligió el origen). */
  origen?: string
  /** Lo disponible de verdad en ese origen para ESTA línea (ver `disponibleReal`). */
  disponible: number
  destino?: string
  /** Por qué el destino elegido no sirve para esta línea (undefined/null = sirve). */
  razonDestino?: string | null
  cantidad: string
}

/** El mensaje bajo la línea: neutro si falta algo, rojo si hay un error; null si la línea está lista. */
export function evaluarLinea(d: DatosEvaluacion): MensajeLinea | null {
  if (!d.tieneProducto) return { tipo: 'falta', texto: 'Busca el producto que vas a mover.' }
  if (!d.origen) return { tipo: 'falta', texto: 'Elige de dónde sale.' }
  if (!d.destino) return { tipo: 'falta', texto: 'Elige a dónde va.' }
  if (d.razonDestino) return { tipo: 'error', texto: `Ese destino no sirve: ${d.razonDestino.replace(/\.$/, '')}.` }
  const n = Number(d.cantidad)
  if (d.cantidad.trim() === '' || !Number.isFinite(n) || n <= 0) return { tipo: 'falta', texto: 'Indica cuántas unidades.' }
  if (!Number.isInteger(n)) return { tipo: 'error', texto: 'La cantidad son unidades enteras.' }
  if (n > d.disponible) return { tipo: 'error', texto: `Solo hay ${Math.max(d.disponible, 0)} u disponibles en ${d.origen}. No se puede mover lo que no existe.` }
  return null
}

/**
 * Disponible real de una celda para UNA línea:
 *   saldo − lo reservado por otros movimientos en curso (ya descontado en `disponibleCelda`)
 *         − lo que otras líneas de la MISMA orden sacan de la misma celda (mismo lote y ubicación).
 */
export function disponibleReal(disponibleCelda: number, celdaClave: string, lineas: { id: number; celdaClave?: string; cantidad: string }[], exceptoId: number): number {
  const otras = lineas.filter((l) => l.id !== exceptoId && l.celdaClave === celdaClave).reduce((n, l) => n + (Number.parseInt(l.cantidad, 10) || 0), 0)
  return disponibleCelda - otras
}

// ── Destino por defecto de la cabecera ───────────────────────────────────────

export interface ResultadoDefecto { asignar: number[]; omitidas: number; nota: string }

/**
 * Se aplica solo a las líneas SIN destino que ya tienen origen; las que no pueden ir ahí quedan sin destino y se avisa cuántas.
 * `sirve` dice, por línea, si el destino por defecto es válido para ella.
 */
export function repartirDestinoDefecto(lineas: { id: number; tieneOrigen: boolean; tieneDestino: boolean }[], sirve: (id: number) => boolean, codigo: string): ResultadoDefecto {
  const candidatas = lineas.filter((l) => l.tieneOrigen && !l.tieneDestino)
  const asignar = candidatas.filter((l) => sirve(l.id)).map((l) => l.id)
  const omitidas = candidatas.length - asignar.length
  const nota = `Aplicado a ${asignar.length} ${asignar.length === 1 ? 'línea' : 'líneas'}.`
    + (omitidas ? ` ${omitidas} no ${omitidas === 1 ? 'puede' : 'pueden'} ir a ${codigo}: ${omitidas === 1 ? 'elige su destino' : 'elige sus destinos'}.` : ' Las líneas nuevas lo tomarán al elegir su origen, si es válido.')
  return { asignar, omitidas, nota }
}

// ── Barra inferior y resumen ─────────────────────────────────────────────────

export interface LineaResuelta { id: number; lista: boolean; cantidad: number; destino?: string; producto: string; lote: string; propietario: string; origen: string }

export interface ResumenBarra { listas: number; total: number; unidades: number; destinos: number; puedeRevisar: boolean; pendientes: number }

export function resumenBarra(lineas: LineaResuelta[]): ResumenBarra {
  const listas = lineas.filter((l) => l.lista)
  const destinos = new Set(listas.map((l) => l.destino))
  return {
    listas: listas.length, total: lineas.length, unidades: listas.reduce((n, l) => n + l.cantidad, 0), destinos: destinos.size,
    puedeRevisar: lineas.length > 0 && listas.length === lineas.length, pendientes: lineas.length - listas.length,
  }
}

export const textoBarra = (r: ResumenBarra) =>
  `${r.listas} de ${r.total} ${r.total === 1 ? 'línea lista' : 'líneas listas'} · ${r.unidades.toLocaleString('es-PE')} u · ${r.destinos} ${r.destinos === 1 ? 'destino' : 'destinos'}`

export const textoResumenLargo = (r: ResumenBarra, motivo: string) =>
  `Vas a mover ${r.unidades.toLocaleString('es-PE')} ${r.unidades === 1 ? 'unidad' : 'unidades'} en ${r.listas} ${r.listas === 1 ? 'línea' : 'líneas'}, hacia ${r.destinos} ${r.destinos === 1 ? 'destino' : 'destinos'}. Motivo: ${motivo}.`

// ── Opciones de destino para UNA línea ───────────────────────────────────────

export interface OpcionDestino {
  posicionId: string
  codigo: string
  area: string
  /** «Logissa», «Área compartida»… o, si no sirve, el motivo en palabras. */
  nota: string
  /** Si no sirve: por qué (la opción sale deshabilitada). */
  motivo?: string
}

const natural = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true })

/**
 * Posiciones entre las que elegir el destino de una línea. Sin texto: las que sirven (hasta `limite`) y unos ejemplos de las que no, con su motivo.
 * Con texto: las que coinciden por código o área (tolera tildes y mayúsculas), las que sirven primero. Una ubicación en conteo no aparece.
 */
export function opcionesDestinoLinea(p: Panorama, consulta: string, linea: LineaParaChequear, bloqueadas: Record<string, string> = {}, limite = 12): OpcionDestino[] {
  const q = consulta.trim()
  const nombreDuenio = (id: string) => { const d = propietarioVigente(id, p.asignaciones, p.hoy); return d ? p.propietarios.find((x) => x.id === d)?.codigo : undefined }
  const todas = p.posiciones
    .filter((pos) => pos.activa && !bloqueadas[pos.id])
    .filter((pos) => !q || puntaje(q, pos.codigo) > 0 || normalizar(ETIQUETA_AREA[pos.tipoArea]).includes(normalizar(q)))
    .map((pos): OpcionDestino & { score: number } => {
      const v = validarDestino(p, pos.id, [linea], bloqueadas)!
      const motivo = v.ok ? undefined : (v.general ?? v.porLinea[0]?.mensaje)
      const duenio = AREAS_COMPARTIDAS.has(pos.tipoArea) ? 'Área compartida' : (nombreDuenio(pos.id) ?? 'Sin propietario')
      return { posicionId: pos.id, codigo: pos.codigo, area: ETIQUETA_AREA[pos.tipoArea], nota: motivo ?? duenio, motivo, score: q ? puntaje(q, pos.codigo) : 0 }
    })
  const cmp = (a: OpcionDestino & { score: number }, b: OpcionDestino & { score: number }) => b.score - a.score || natural(a.codigo, b.codigo)
  const sirven = todas.filter((o) => !o.motivo).sort(cmp)
  const noSirven = todas.filter((o) => o.motivo).sort(cmp)
  const ejemplos: typeof noSirven = []
  if (!q) { const vistos = new Set<string>(); for (const o of noSirven) if (!vistos.has(o.motivo!)) { vistos.add(o.motivo!); ejemplos.push(o) } }
  const mostradas = q ? [...sirven, ...noSirven].slice(0, limite) : [...sirven.slice(0, limite), ...ejemplos.slice(0, 4)]
  return mostradas.map(({ score: _s, ...o }) => { void _s; return o })
}

// ── Borrador que no se pierde ────────────────────────────────────────────────

export interface LineaBorrador { id: number; productoId?: string; celdaClave?: string; destinoId?: string; cantidad: string }
export interface BorradorMovimiento {
  version: 1
  /** Llave de idempotencia: un mismo borrador no crea dos movimientos aunque se reintente. */
  token: string
  motivo: string
  destinoDefectoId?: string
  siguienteId: number
  lineas: LineaBorrador[]
  guardadoEn: string
}

export const clavesBorrador = (usuarioId: string) => `wms:borrador-movimiento:${usuarioId}`

export function nuevoBorrador(token: string): BorradorMovimiento {
  return { version: 1, token, motivo: '', siguienteId: 2, lineas: [{ id: 1, cantidad: '' }], guardadoEn: new Date().toISOString() }
}

/** ¿Vale la pena recuperarlo? Solo si la persona alcanzó a elegir algo en las líneas o el destino (el motivo solo no cuenta). */
export const borradorTieneContenido = (b: BorradorMovimiento) => b.lineas.some((l) => l.productoId || l.celdaClave || l.destinoId || l.cantidad) || !!b.destinoDefectoId

/** Lee un borrador guardado; si el texto está dañado o es de otra versión, devuelve null (nunca rompe la pantalla). */
export function leerBorrador(texto: string | null | undefined): BorradorMovimiento | null {
  if (!texto) return null
  try {
    const b = JSON.parse(texto) as Partial<BorradorMovimiento>
    if (b?.version !== 1 || typeof b.token !== 'string' || !Array.isArray(b.lineas) || typeof b.siguienteId !== 'number') return null
    const lineas = b.lineas.filter((l) => l && typeof l.id === 'number').map((l): LineaBorrador => ({
      id: l.id, productoId: typeof l.productoId === 'string' ? l.productoId : undefined, celdaClave: typeof l.celdaClave === 'string' ? l.celdaClave : undefined,
      destinoId: typeof l.destinoId === 'string' ? l.destinoId : undefined, cantidad: typeof l.cantidad === 'string' ? l.cantidad : '',
    }))
    return { version: 1, token: b.token, motivo: typeof b.motivo === 'string' ? b.motivo : '', destinoDefectoId: typeof b.destinoDefectoId === 'string' ? b.destinoDefectoId : undefined, siguienteId: Math.max(b.siguienteId, ...lineas.map((l) => l.id + 1), 2), lineas: lineas.length ? lineas : [{ id: 1, cantidad: '' }], guardadoEn: typeof b.guardadoEn === 'string' ? b.guardadoEn : new Date().toISOString() }
  } catch { return null }
}
