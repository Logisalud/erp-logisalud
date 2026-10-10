// La lista de movimientos internos: una fila por movimiento, con filtros, orden por columna y vistas guardadas.
// Todo puro (sin Next ni Supabase) para probarlo y para serializar los filtros en una vista guardada.
import { fechaEnLima, ETIQUETA_ESTADO_ORDEN, type EstadoOrden, type OrdenMovimiento } from './inventario'
import { normalizar } from './busqueda'
import type { ResultadoBusqueda } from './panorama'

export interface FilaMovimiento {
  id: string
  numero: string
  /** Cuándo se ejecutó (ISO) y su día en hora de Lima. */
  fecha: string
  dia: string
  /** El único origen/destino, o «Varios» si hay más de uno. */
  desde: string
  hacia: string
  /** El único propietario, o «Varios». */
  propietario: string
  propietarios: string[]
  lineas: number
  unidades: number
  ejecutor: string
  verificador?: string
  estado: EstadoOrden
  /** Todas las ubicaciones (origen y destino) y los productos, para filtrar y buscar. */
  ubicaciones: string[]
  productos: string[]
  /** Texto normalizado para la búsqueda. */
  texto: string
}

const unico = (valores: string[]) => (new Set(valores).size === 1 ? valores[0] : 'Varios')

export function filaDeOrden(o: OrdenMovimiento): FilaMovimiento {
  const ubicaciones = Array.from(new Set(o.lineas.flatMap((l) => [l.desde, l.hacia])))
  const productos = Array.from(new Set(o.lineas.map((l) => l.producto)))
  const propietarios = Array.from(new Set(o.lineas.map((l) => l.propietario)))
  return {
    id: o.id, numero: o.numero, fecha: o.ejecutadoEn, dia: fechaEnLima(o.ejecutadoEn),
    desde: unico(o.lineas.map((l) => l.desde)), hacia: unico(o.lineas.map((l) => l.hacia)),
    propietario: unico(o.lineas.map((l) => l.propietario)), propietarios,
    lineas: o.lineas.length, unidades: o.lineas.reduce((n, l) => n + l.cantidad, 0),
    ejecutor: o.ejecutor, verificador: o.verificador, estado: o.estado, ubicaciones, productos,
    texto: normalizar([o.numero, o.motivo, ...ubicaciones, ...productos, ...o.lineas.map((l) => l.lote), ...propietarios, o.ejecutor, o.verificador ?? '', ETIQUETA_ESTADO_ORDEN[o.estado]].join(' ')),
  }
}

export interface FiltrosMovimientos {
  q: string
  estado: '' | EstadoOrden
  desde: string
  hasta: string
  propietario: string
  ejecutor: string
  ubicacion: string
  /** Solo los que esperan su acción (verificar o resolver). */
  mios: boolean
}
export const FILTROS_VACIOS: FiltrosMovimientos = { q: '', estado: '', desde: '', hasta: '', propietario: '', ejecutor: '', ubicacion: '', mios: false }

export type ColumnaMovimiento = 'numero' | 'fecha' | 'desde' | 'hacia' | 'propietario' | 'lineas' | 'unidades' | 'ejecutor' | 'verificador' | 'estado'
export interface OrdenColumna { col: ColumnaMovimiento; dir: 'asc' | 'desc' }
export const ORDEN_INICIAL: OrdenColumna = { col: 'fecha', dir: 'desc' }

export function filtrarMovimientos(filas: FilaMovimiento[], f: FiltrosMovimientos, mios: ReadonlySet<string> = new Set()): FilaMovimiento[] {
  const q = normalizar(f.q)
  const ub = normalizar(f.ubicacion)
  return filas.filter((x) =>
    (!q || q.split(/\s+/).every((t) => x.texto.includes(t))) &&
    (!f.estado || x.estado === f.estado) &&
    (!f.desde || x.dia >= f.desde) && (!f.hasta || x.dia <= f.hasta) &&
    (!f.propietario || x.propietarios.includes(f.propietario)) &&
    (!f.ejecutor || x.ejecutor === f.ejecutor) &&
    (!ub || x.ubicaciones.some((u) => normalizar(u).includes(ub))) &&
    (!f.mios || mios.has(x.id)))
}

const clave = (x: FilaMovimiento, col: ColumnaMovimiento): string | number =>
  col === 'fecha' ? x.fecha : col === 'lineas' ? x.lineas : col === 'unidades' ? x.unidades : col === 'estado' ? ETIQUETA_ESTADO_ORDEN[x.estado] : (x[col] ?? '')

/** Orden por columna; los números se comparan como números y los códigos como «natural» (A-2 antes que A-10). */
export function ordenarMovimientos(filas: FilaMovimiento[], o: OrdenColumna): FilaMovimiento[] {
  const m = o.dir === 'asc' ? 1 : -1
  return [...filas].sort((a, b) => {
    const x = clave(a, o.col); const y = clave(b, o.col)
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true })
    return c * m || b.fecha.localeCompare(a.fecha) || a.numero.localeCompare(b.numero)
  })
}

/** Los filtros y el orden como texto, para guardarlos en una vista. */
export function serializarVista(f: FiltrosMovimientos, o: OrdenColumna): Record<string, string> {
  const out: Record<string, string> = { orden: `${o.col}:${o.dir}` }
  for (const [k, v] of Object.entries(f)) if (v) out[k] = v === true ? '1' : String(v)
  return out
}

const COLUMNAS: ColumnaMovimiento[] = ['numero', 'fecha', 'desde', 'hacia', 'propietario', 'lineas', 'unidades', 'ejecutor', 'verificador', 'estado']
export function leerVista(v: Record<string, string>): { filtros: FiltrosMovimientos; orden: OrdenColumna } {
  const [col, dir] = (v.orden ?? '').split(':')
  const estados: string[] = ['EJECUTADO', 'CONFIRMADO', 'CON_DIFERENCIA', 'ANULADO']
  return {
    filtros: {
      q: v.q ?? '', estado: (estados.includes(v.estado ?? '') ? v.estado : '') as FiltrosMovimientos['estado'], desde: v.desde ?? '', hasta: v.hasta ?? '',
      propietario: v.propietario ?? '', ejecutor: v.ejecutor ?? '', ubicacion: v.ubicacion ?? '', mios: v.mios === '1',
    },
    orden: COLUMNAS.includes(col as ColumnaMovimiento) && (dir === 'asc' || dir === 'desc') ? { col: col as ColumnaMovimiento, dir } : ORDEN_INICIAL,
  }
}

export const hayFiltros = (f: FiltrosMovimientos) => Object.entries(f).some(([, v]) => !!v)

/** Búsqueda universal: un movimiento se encuentra por su referencia (MI-AAAA-NNNNN), un producto, un lote, una ubicación o una persona. */
export function buscarMovimientos(ordenes: OrdenMovimiento[], consulta: string, limite = 6): ResultadoBusqueda[] {
  const q = normalizar(consulta)
  if (!q) return []
  const esRef = /^mi-?\d/.test(q) || q.startsWith('mi-')
  return ordenes.map(filaDeOrden)
    .filter((f) => q.split(/\s+/).every((t) => f.texto.includes(t)))
    .sort((a, b) => Number(normalizar(b.numero).startsWith(q)) - Number(normalizar(a.numero).startsWith(q)) || b.fecha.localeCompare(a.fecha))
    .slice(0, limite)
    .map((f): ResultadoBusqueda => ({
      tipo: 'movimiento', id: f.id, titulo: `${f.numero} · ${f.desde} → ${f.hacia}`,
      detalle: `${f.lineas} ${f.lineas === 1 ? 'línea' : 'líneas'} · ${f.unidades.toLocaleString('es-PE')} u · ${ETIQUETA_ESTADO_ORDEN[f.estado]} · ejecutó ${f.ejecutor}`,
      posiciones: f.ubicaciones, unidades: f.unidades, puntaje: esRef && normalizar(f.numero).startsWith(q) ? 100 : 50, href: `/movimientos/${f.id}`,
    }))
}
