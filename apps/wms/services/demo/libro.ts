// Estado en memoria del inventario del modo demostración (Batch 3): libro mayor, movimientos internos, conteos, ajustes y cargas.
import type { Panorama } from '@/domain/panorama'
import type { Estado } from '@/domain/tipos'
import type {
  AjusteVista, FilaCargaInicial, OrdenMovimiento, PartidaLedger, EstadoConteo, ResultadoLinea, VistaGuardada,
} from '@/domain/inventario'
import type { Origen } from '@/domain/tipos'

export interface ConteoLineaDemo {
  id: string
  posicionId: string
  productoId: string
  loteId: string
  propietarioId: string
  estado: Estado
  origen: Origen
  procedenciaId: string
  cantidadSistema: number
  conteo1?: number
  contador1?: string
  conteo2?: number
  contador2?: string
  resultado?: ResultadoLinea
  causa?: string
  nota?: string
}

export interface ConteoDemo {
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
  lineas: ConteoLineaDemo[]
}

export interface AjusteDemo extends AjusteVista { propuestoPorId: string; lineaId: string }

export interface CargaDemo {
  id: string
  numero: string
  estado: 'BORRADOR' | 'CONFIRMADA' | 'ANULADA'
  nota?: string
  creadoPor: string
  creadoEn: string
  confirmadoEn?: string
  filas: FilaCargaInicial[]
}

export interface InvDemo {
  ledger: PartidaLedger[]
  ordenes: OrdenMovimiento[]
  conteos: ConteoDemo[]
  ajustes: AjusteDemo[]
  cargas: CargaDemo[]
  /** D-09: estado del stock inicial decidido por Dirección Técnica ('' = sin decidir). */
  cargaDecision: string
  /** Vistas guardadas de las listas, por persona. */
  vistas: Record<string, VistaGuardada[]>
  contadores: Record<string, number>
  sembrado: boolean
}

/** El libro arranca con una «carga inicial» por cada saldo del demo (hace 45 días), para que el Kardex y la historia tengan base. */
export function iniciarInventario(panorama: Panorama): InvDemo {
  const dia = new Date(Date.parse(`${panorama.hoy}T12:00:00Z`) - 45 * 86_400_000).toISOString()
  const ledger: PartidaLedger[] = panorama.saldos.filter((s) => s.cantidad > 0).map((s, i) => ({
    id: i + 1, ts: dia, movimientoId: `mov-carga-${i + 1}`, tipo: 'CARGA_INICIAL' as const, motivo: 'Carga inicial del inventario general',
    posicionId: s.posicionId, productoId: s.productoId, loteId: s.loteId, propietarioId: s.propietarioId, estado: s.estado,
    origen: 'CARGA_INICIAL' as const, procedenciaId: s.procedenciaId, delta: s.cantidad, ejecutorId: 'demo:admin_wms',
    referenciaTipo: 'carga_inicial', referenciaId: 'CI-DEMO-00001',
  }))
  return { ledger, ordenes: [], conteos: [], ajustes: [], cargas: [], cargaDecision: '', vistas: {}, contadores: {}, sembrado: false }
}

export const siguiente = (inv: InvDemo, clave: string): number => {
  inv.contadores[clave] = (inv.contadores[clave] ?? 0) + 1
  return inv.contadores[clave]
}

export const numeroDe = (inv: InvDemo, prefijo: string, anio: string, ancho = 5) =>
  `${prefijo}-${anio}-${String(siguiente(inv, `${prefijo}-${anio}`)).padStart(ancho, '0')}`

let secuencia = 0
/** Agrega partidas al libro; el id crece siempre (el Kardex ordena por él). */
export function anotar(inv: InvDemo, movimientoId: string, tipo: PartidaLedger['tipo'], ts: string, comunes: Partial<PartidaLedger>, partidas: Omit<PartidaLedger, 'id' | 'ts' | 'movimientoId' | 'tipo'>[]) {
  void secuencia
  for (const p of partidas) {
    const id = (inv.ledger[inv.ledger.length - 1]?.id ?? 0) + 1
    inv.ledger.push({ ...comunes, ...p, id, ts, movimientoId, tipo })
  }
}
