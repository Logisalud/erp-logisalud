import type {
  Asignacion, DocumentoSustento, Estado, Lote, Posicion, Producto, Propietario, Regulatorio, Saldo, TipoArea,
} from './tipos'
import { claveCelda } from './mapa'
import { normalizar, puntaje } from './busqueda'
import { asignacionVigente, AREAS_COMPARTIDAS } from './zonas'
import { situacionRS } from './regulatorio'

export interface ProductoConReg extends Producto {
  reg?: Regulatorio
}

/** Todo lo que el mapa, la búsqueda y el inicio necesitan (cientos de filas, no miles). */
export interface Panorama {
  hoy: string
  propietarios: Propietario[]
  posiciones: Posicion[]
  asignaciones: Asignacion[]
  documentos: DocumentoSustento[]
  productos: ProductoConReg[]
  lotes: Lote[]
  saldos: Saldo[]
}

export interface FilaStock {
  saldo: Saldo
  producto: ProductoConReg
  lote: Lote
  propietario: Propietario
  posicion: Posicion
}

export function indices(p: Panorama) {
  return {
    posicion: new Map(p.posiciones.map((x) => [x.id, x])),
    posicionPorCodigo: new Map(p.posiciones.map((x) => [x.codigo, x])),
    propietario: new Map(p.propietarios.map((x) => [x.id, x])),
    producto: new Map(p.productos.map((x) => [x.id, x])),
    lote: new Map(p.lotes.map((x) => [x.id, x])),
  }
}

export function filasDeStock(p: Panorama): FilaStock[] {
  const i = indices(p)
  const out: FilaStock[] = []
  for (const s of p.saldos) {
    if (s.cantidad <= 0) continue
    const posicion = i.posicion.get(s.posicionId)
    const producto = i.producto.get(s.productoId)
    const lote = i.lote.get(s.loteId)
    const propietario = i.propietario.get(s.propietarioId)
    if (posicion && producto && lote && propietario) out.push({ saldo: s, producto, lote, propietario, posicion })
  }
  return out
}

export function stockDePosicion(p: Panorama, posicionId: string): FilaStock[] {
  return filasDeStock(p).filter((f) => f.posicion.id === posicionId)
}

export interface ResumenCelda {
  clave: string
  posiciones: Posicion[]
  tipoArea: TipoArea | 'MIXTA'
  unidades: number
  nivelesConStock: number
  niveles: number
  propietarios: string[] // códigos de propietario vigentes
  estados: Estado[]
  porVerificar: boolean
  libre: boolean
}

/** Resumen por celda del mapa (una celda = una posición de rack con sus niveles). */
export function resumenesDeCeldas(p: Panorama): Map<string, ResumenCelda> {
  const i = indices(p)
  const stock = filasDeStock(p)
  const stockPorPos = new Map<string, FilaStock[]>()
  for (const f of stock) stockPorPos.set(f.posicion.id, [...(stockPorPos.get(f.posicion.id) ?? []), f])
  const asigPorPos = new Map<string, Asignacion[]>()
  for (const a of p.asignaciones) asigPorPos.set(a.posicionId, [...(asigPorPos.get(a.posicionId) ?? []), a])

  const out = new Map<string, ResumenCelda>()
  for (const pos of p.posiciones) {
    const k = claveCelda(pos)
    const r =
      out.get(k) ??
      ({ clave: k, posiciones: [], tipoArea: pos.tipoArea, unidades: 0, nivelesConStock: 0, niveles: 0, propietarios: [], estados: [], porVerificar: false, libre: true } as ResumenCelda)
    r.posiciones.push(pos)
    if (r.tipoArea !== pos.tipoArea) r.tipoArea = 'MIXTA'
    r.niveles += 1
    const filas = stockPorPos.get(pos.id) ?? []
    const u = filas.reduce((n, f) => n + f.saldo.cantidad, 0)
    r.unidades += u
    if (u > 0) r.nivelesConStock += 1
    for (const f of filas) if (!r.estados.includes(f.saldo.estado)) r.estados.push(f.saldo.estado)
    if (pos.porVerificar) r.porVerificar = true
    if (!AREAS_COMPARTIDAS.has(pos.tipoArea)) {
      for (const a of asigPorPos.get(pos.id) ?? []) {
        if (!asignacionVigente(a, p.hoy)) continue
        const cod = i.propietario.get(a.propietarioId)?.codigo
        if (cod && !r.propietarios.includes(cod)) r.propietarios.push(cod)
        r.libre = false
      }
    } else {
      r.libre = false
    }
    out.set(k, r)
  }
  return out
}

export interface OcupacionPropietario {
  propietario: Propietario
  posiciones: number
  conStock: number
  unidades: number
}

/** Posiciones asignadas (vigentes) y cuántas tienen stock, por propietario. */
export function ocupacionPorPropietario(p: Panorama): OcupacionPropietario[] {
  const conStock = new Set(p.saldos.filter((s) => s.cantidad > 0).map((s) => s.posicionId))
  const unidadesPorPos = new Map<string, number>()
  for (const s of p.saldos) unidadesPorPos.set(s.posicionId, (unidadesPorPos.get(s.posicionId) ?? 0) + s.cantidad)
  return p.propietarios.map((o) => {
    const asig = p.asignaciones.filter((a) => a.propietarioId === o.id && asignacionVigente(a, p.hoy))
    const ids = new Set(asig.map((a) => a.posicionId))
    return {
      propietario: o,
      posiciones: ids.size,
      conStock: [...ids].filter((id) => conStock.has(id)).length,
      unidades: [...ids].reduce((n, id) => n + (unidadesPorPos.get(id) ?? 0), 0),
    }
  })
}

/** Unidades ya Aprobadas que siguen en la zona de Cuarentena/Recepción esperando su traslado. */
export function unidadesPorTrasladar(p: Panorama): number {
  return filasDeStock(p)
    .filter((f) => f.saldo.estado === 'APROBADO' && (f.posicion.tipoArea === 'CUARENTENA' || f.posicion.tipoArea === 'RECEPCION'))
    .reduce((n, f) => n + f.saldo.cantidad, 0)
}

export function unidadesEnEstado(p: Panorama, estado: Estado): number {
  return p.saldos.filter((s) => s.estado === estado).reduce((n, s) => n + s.cantidad, 0)
}

export interface AlertasRegulatorias {
  vencidos: ProductoConReg[]
  porVencer: ProductoConReg[]
  pendientesDeValidar: ProductoConReg[]
  observados: ProductoConReg[]
  sinRegistro: ProductoConReg[]
}

export function alertasRegulatorias(p: Panorama): AlertasRegulatorias {
  const out: AlertasRegulatorias = { vencidos: [], porVencer: [], pendientesDeValidar: [], observados: [], sinRegistro: [] }
  for (const prod of p.productos) {
    if (prod.estado !== 'activo' || !prod.reg) continue
    const s = situacionRS(prod.reg.rsVence, p.hoy)
    if (s === 'VENCIDO') out.vencidos.push(prod)
    else if (s === 'POR_VENCER') out.porVencer.push(prod)
    if (prod.reg.estadoValidacion === 'PENDIENTE') out.pendientesDeValidar.push(prod)
    if (prod.reg.estadoValidacion === 'OBSERVADO') out.observados.push(prod)
    if (!prod.reg.registroSanitario) out.sinRegistro.push(prod)
  }
  return out
}

export type TipoResultado = 'producto' | 'lote' | 'posicion'

export interface ResultadoBusqueda {
  tipo: TipoResultado
  id: string
  titulo: string
  detalle: string
  /** Códigos de posición donde está (para resaltar en el mapa). */
  posiciones: string[]
  unidades: number
  puntaje: number
  href: string
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-PE')} ${n === 1 ? uno : varios}`

/** Búsqueda universal: producto, lote y ubicación. (OC y actas llegan con las entradas.) */
export function buscar(p: Panorama, consulta: string, limite = 24): ResultadoBusqueda[] {
  const q = consulta.trim()
  if (q.length < 1) return []
  const stock = filasDeStock(p)
  const out: ResultadoBusqueda[] = []

  for (const prod of p.productos) {
    const sc = Math.max(
      puntaje(q, prod.descripcion), puntaje(q, prod.codigo), puntaje(q, prod.principioActivo ?? ''),
      puntaje(q, prod.marca ?? ''), puntaje(q, `${prod.descripcion} ${prod.presentacion ?? ''}`),
    )
    if (sc === 0) continue
    const filas = stock.filter((f) => f.producto.id === prod.id)
    const posiciones = [...new Set(filas.map((f) => f.posicion.codigo))]
    const unidades = filas.reduce((n, f) => n + f.saldo.cantidad, 0)
    out.push({
      tipo: 'producto', id: prod.id,
      titulo: `${prod.descripcion}${prod.presentacion ? ` · ${prod.presentacion}` : ''}`,
      detalle: unidades > 0 ? `${plural(unidades, 'unidad', 'unidades')} en ${plural(posiciones.length, 'ubicación', 'ubicaciones')}` : 'Sin stock en el almacén',
      posiciones, unidades, puntaje: sc + 5, href: `/productos/${prod.id}`,
    })
  }

  const prodPorId = new Map(p.productos.map((x) => [x.id, x]))
  const lotesVistos = new Set<string>()
  for (const l of p.lotes) {
    const sc = puntaje(q, l.codigo)
    if (sc === 0 || lotesVistos.has(l.id)) continue
    lotesVistos.add(l.id)
    const filas = stock.filter((f) => f.lote.id === l.id)
    const posiciones = [...new Set(filas.map((f) => f.posicion.codigo))]
    const unidades = filas.reduce((n, f) => n + f.saldo.cantidad, 0)
    out.push({
      tipo: 'lote', id: l.id, titulo: `Lote ${l.codigo}`,
      detalle: `${prodPorId.get(l.productoId)?.descripcion ?? 'Producto'} · ${unidades > 0 ? plural(unidades, 'unidad', 'unidades') : 'sin stock'}`,
      posiciones, unidades, puntaje: sc + 2, href: `/almacen?buscar=${encodeURIComponent(l.codigo)}`,
    })
  }

  for (const pos of p.posiciones) {
    const sc = puntaje(q, pos.codigo)
    if (sc === 0) continue
    const filas = stock.filter((f) => f.posicion.id === pos.id)
    const unidades = filas.reduce((n, f) => n + f.saldo.cantidad, 0)
    out.push({
      tipo: 'posicion', id: pos.id, titulo: `Ubicación ${pos.codigo}`,
      detalle: unidades > 0 ? `${plural(unidades, 'unidad', 'unidades')} · ${filas.length} ${filas.length === 1 ? 'lote' : 'lotes'}` : 'Vacía',
      posiciones: [pos.codigo], unidades, puntaje: sc, href: `/almacen?ver=${encodeURIComponent(claveCelda(pos))}`,
    })
  }

  return out.sort((a, b) => b.puntaje - a.puntaje || a.titulo.localeCompare(b.titulo, 'es')).slice(0, limite)
}

export { normalizar }
