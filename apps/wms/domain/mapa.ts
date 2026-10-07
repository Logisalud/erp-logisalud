import type { Posicion, TipoArea } from './tipos'

/**
 * Geometría APROXIMADA del mapa (los planos no tienen escala exacta). Las
 * unidades son "celdas"; cada celda del mapa es una posición de rack
 * (Rack-Posición) que agrupa sus 4 niveles. Disposición tomada de los planos
 * 2026: columnas verticales J | I,H | G,F | E | D | C | B con pasillos entre
 * ellas, rack A en horizontal abajo (A-27 a la izquierda), Cuarentena y
 * Recepción hacia el este, Despacho (K) sobre Recepción.
 */
export interface CeldaMapa {
  clave: string // "J-5", "A-M1", "K-3"
  rack: string
  posicion: number | null
  x: number
  y: number
  ancho: number
  alto: number
  tipoArea: TipoArea | 'MIXTA'
  etiqueta: string
}

const COLUMNA_X: Record<string, number> = { J: 0, I: 2, H: 3, G: 5, F: 6, E: 8, D: 9, C: 11, B: 12 }
const FILAS = 13 // J tiene 13 posiciones: las demás se alinean por abajo

export const MAPA_ANCHO = 28
export const MAPA_ALTO = 16.2

export function claveCelda(p: Pick<Posicion, 'rack' | 'posicion' | 'codigo'>): string {
  if (p.posicion == null) return p.codigo // A-M1, K-M2
  return `${p.rack}-${p.posicion}`
}

export function coordenadasCelda(rack: string, posicion: number | null, codigo: string): { x: number; y: number } {
  if (posicion == null) {
    if (codigo === 'A-M1') return { x: 27, y: 14.4 }
    return { x: 18, y: 11 } // K-M2
  }
  if (rack in COLUMNA_X) return { x: COLUMNA_X[rack], y: FILAS - posicion }
  if (rack === 'A') {
    if (posicion >= 10) return { x: 27 - posicion, y: 14.4 } // A-27 … A-10, de izquierda a derecha
    if (posicion >= 6) return { x: 18 + (9 - posicion), y: 14.4 } // Cuarentena A-9 … A-6
    return { x: 22 + (5 - posicion), y: 14.4 } // Recepción A-5 … A-1
  }
  if (rack === 'K') return { x: 20 + (7 - posicion), y: 11 } // Despacho K-7 … K-1
  return { x: 0, y: 0 }
}

/** Agrupa las posiciones (con niveles y subracks) en celdas de mapa. */
export function celdasDelMapa(posiciones: Posicion[]): CeldaMapa[] {
  const grupos = new Map<string, Posicion[]>()
  for (const p of posiciones) {
    const k = claveCelda(p)
    grupos.set(k, [...(grupos.get(k) ?? []), p])
  }
  return [...grupos.entries()].map(([clave, ps]) => {
    const p0 = ps[0]
    const { x, y } = coordenadasCelda(p0.rack, p0.posicion, p0.codigo)
    const areas = new Set(ps.map((p) => p.tipoArea))
    return {
      clave,
      rack: p0.rack,
      posicion: p0.posicion,
      x, y,
      ancho: 1,
      alto: 1,
      tipoArea: areas.size === 1 ? p0.tipoArea : 'MIXTA',
      etiqueta: clave,
    }
  })
}
