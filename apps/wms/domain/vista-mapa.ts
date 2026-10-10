// Datos ya aplanados para el mapa (cliente): sin Maps ni clases, serializables.
import type { Estado, TipoArea } from './tipos'
import { claveCelda, coordenadasCelda } from './mapa'
import { filasDeStock, indices, resumenesDeCeldas, type Panorama } from './panorama'
import { asignacionVigente, ETIQUETA_AREA } from './zonas'
import { normalizar } from './busqueda'
import { transitoPorPosicion } from './transito'
import type { OrdenMovimiento } from './inventario'

export interface FilaStockVista {
  producto: string
  presentacion?: string
  productoCodigo: string
  lote: string
  vence?: string
  cantidad: number
  estado: Estado
  propietario: string // código
  procedencia: string
  porTrasladar: boolean
}

export interface PosicionVista {
  codigo: string
  nivel: number | null
  subnivel: number | null
  forma: string
  tipoArea: TipoArea
  areaEtiqueta: string
  porVerificar: boolean
  nota?: string
  asignacion?: { propietario: string; desde: string; hasta?: string; documento?: string; porConfirmar: boolean }
  stock: FilaStockVista[]
  /** Unidades que salen de aquí o llegan aquí en un movimiento aún por verificar. */
  transito?: { salen: number; llegan: number }
}

export interface CeldaVista {
  clave: string
  x: number
  y: number
  tipoArea: TipoArea | 'MIXTA'
  unidades: number
  niveles: number
  nivelesConStock: number
  propietarios: string[]
  estados: Estado[]
  porVerificar: boolean
  /** Unidades de esta celda en tránsito (salen o llegan), por verificar. */
  enTransito: number
  libre: boolean
  /** Texto normalizado para filtrar (códigos, productos, lotes, propietarios). */
  texto: string
  posiciones: PosicionVista[]
}

export interface VistaMapa {
  celdas: CeldaVista[]
  propietarios: { codigo: string; nombre: string }[]
}

export function construirVistaMapa(p: Panorama, ordenes: OrdenMovimiento[] = []): VistaMapa {
  const transito = transitoPorPosicion(ordenes)
  const ind = indices(p)
  const res = resumenesDeCeldas(p)
  const filas = filasDeStock(p)
  const porPos = new Map<string, typeof filas>()
  for (const f of filas) porPos.set(f.posicion.id, [...(porPos.get(f.posicion.id) ?? []), f])
  const asigPorPos = new Map<string, typeof p.asignaciones>()
  for (const a of p.asignaciones) asigPorPos.set(a.posicionId, [...(asigPorPos.get(a.posicionId) ?? []), a])
  const docPorId = new Map(p.documentos.map((d) => [d.id, d]))

  const celdas: CeldaVista[] = []
  for (const r of res.values()) {
    const base = r.posiciones[0]
    const { x, y } = coordenadasCelda(base.rack, base.posicion, base.codigo)
    const posiciones: PosicionVista[] = [...r.posiciones]
      .sort((a, b) => (b.nivel ?? 0) - (a.nivel ?? 0) || (a.subnivel ?? 0) - (b.subnivel ?? 0))
      .map((pos) => {
        const vig = (asigPorPos.get(pos.id) ?? []).find((a) => asignacionVigente(a, p.hoy))
        const doc = vig?.documentoId ? docPorId.get(vig.documentoId) : undefined
        return {
          codigo: pos.codigo, nivel: pos.nivel, subnivel: pos.subnivel, forma: pos.forma, tipoArea: pos.tipoArea,
          areaEtiqueta: ETIQUETA_AREA[pos.tipoArea], porVerificar: pos.porVerificar, nota: pos.notaVerificacion,
          asignacion: vig && ind.propietario.get(vig.propietarioId)
            ? { propietario: ind.propietario.get(vig.propietarioId)!.codigo, desde: vig.desde, hasta: vig.hasta, documento: doc?.titulo, porConfirmar: doc?.estadoConfirmacion === 'POR_CONFIRMAR' }
            : undefined,
          transito: transito.has(pos.id) ? { salen: transito.get(pos.id)!.salen, llegan: transito.get(pos.id)!.llegan } : undefined,
          stock: (porPos.get(pos.id) ?? []).map((f) => ({
            producto: f.producto.descripcion, presentacion: f.producto.presentacion, productoCodigo: f.producto.codigo,
            lote: f.lote.codigo, vence: f.lote.vence, cantidad: f.saldo.cantidad, estado: f.saldo.estado,
            propietario: f.propietario.codigo, procedencia: f.saldo.procedenciaId,
            porTrasladar: f.saldo.estado === 'APROBADO' && (pos.tipoArea === 'CUARENTENA' || pos.tipoArea === 'RECEPCION'),
          })),
        }
      })
    const texto = normalizar(
      [r.clave, ...posiciones.map((x) => x.codigo), ...posiciones.flatMap((x) => x.stock.map((s) => `${s.producto} ${s.productoCodigo} ${s.lote} ${s.propietario}`)),
        ...r.propietarios].join(' '),
    )
    celdas.push({
      clave: r.clave, x, y, tipoArea: r.tipoArea, unidades: r.unidades, niveles: r.niveles, nivelesConStock: r.nivelesConStock,
      propietarios: r.propietarios, estados: r.estados, porVerificar: r.porVerificar, libre: r.libre, texto, posiciones,
      enTransito: posiciones.reduce((n, x) => n + (x.transito ? x.transito.salen + x.transito.llegan : 0), 0),
    })
  }
  return {
    celdas,
    propietarios: p.propietarios.map((o) => ({ codigo: o.codigo, nombre: o.razonSocial })),
  }
}

/** ¿La celda coincide con la consulta? (todas las palabras aparecen en su texto) */
export function celdaCoincide(c: Pick<CeldaVista, 'texto'>, consulta: string): boolean {
  const q = normalizar(consulta)
  if (!q) return true
  return q.split(/\s+/).filter(Boolean).every((w) => c.texto.includes(w))
}

/** Unidades de las filas que coinciden con la consulta (producto, código o lote). */
export function unidadesQueCoinciden(celdas: CeldaVista[], consulta: string): { unidades: number; ubicaciones: number } {
  const q = normalizar(consulta)
  if (!q) return { unidades: 0, ubicaciones: 0 }
  const palabras = q.split(/\s+/).filter(Boolean)
  let unidades = 0
  const ubic = new Set<string>()
  for (const c of celdas) {
    for (const pos of c.posiciones) {
      for (const s of pos.stock) {
        const t = normalizar(`${s.producto} ${s.productoCodigo} ${s.lote} ${pos.codigo} ${s.propietario}`)
        if (palabras.every((w) => t.includes(w))) { unidades += s.cantidad; ubic.add(pos.codigo) }
      }
    }
  }
  return { unidades, ubicaciones: ubic.size }
}

export { claveCelda }
