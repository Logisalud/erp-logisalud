import type { CeldaDeProducto } from '@/domain/inventario'

export interface ProductoLinea { id: string; codigo: string; descripcion: string; presentacion?: string }
export interface DestinoLinea { posicionId: string; codigo: string; area: string }

/** Una línea del movimiento en la pantalla: producto → celda de origen → destino → cantidad. */
export interface LineaForm {
  id: number
  producto?: ProductoLinea
  /** Todas las celdas donde está el producto (para elegir el origen), ordenadas por vencimiento. */
  celdas?: CeldaDeProducto[]
  celda?: CeldaDeProducto
  destino?: DestinoLinea
  cantidad: string
  /** Texto del buscador de producto dentro de la celda. */
  consulta: string
  /** Qué lista está desplegada en el PC/tablet. */
  abierto: 'producto' | 'origen' | 'destino' | null
}

export const lineaVacia = (id: number, abierto: LineaForm['abierto'] = 'producto'): LineaForm => ({ id, cantidad: '', consulta: '', abierto })

export const MOTIVOS_RAPIDOS = ['Reorganización', 'Reposición', 'Consolidar lotes', 'Salida de Cuarentena', 'Otro']
