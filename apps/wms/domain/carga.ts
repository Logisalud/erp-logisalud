// Carga de la unidad (S8): checklist, escaneo de bultos, conciliación, «Liberar unidad» y «Salida confirmada».
// Espejo de las funciones de la migración 0021 (la base de datos manda): cargar_bulto, liberar_unidad, confirmar_salida_ruta.
import { puede } from './permisos'
import type { Rol } from './tipos'

export const puedeCargar = (roles: readonly Rol[]) => puede(roles, 'cargar_ruta')
export const puedeLiberarUnidad = (roles: readonly Rol[]) => puede(roles, 'liberar_unidad')
export const puedeConfirmarSalida = (roles: readonly Rol[]) => puede(roles, 'confirmar_salida')

/** Los puntos del checklist del vehículo. La lista oficial está PENDIENTE de Dirección Técnica (es un parámetro en la base de datos). */
export const ITEMS_CHECKLIST_POR_DEFECTO = [
  'Vehículo limpio y sin olores', 'Equipo de control de temperatura operativo', 'Carrocería cerrada, sin filtraciones', 'Documentos del vehículo y del conductor vigentes',
] as const
export interface ItemChecklist { item: string; ok: boolean; nota: string }

export interface BultoCarga { bultoId: string; codigo: string; secuencia: number; total: number; cargado: boolean }
export interface PedidoCarga {
  salidaId: string
  salidaNumero: string
  pedidoNumero?: string
  cliente?: string
  /** Orden de la parada en la ruta. */
  secuencia: number
  /** Conforme + embalado + guía + paquete completo. */
  listo: boolean
  excluida: boolean
  motivoExclusion?: string
  bultos: BultoCarga[]
}

export type EstadoCarga = 'EN_CARGA' | 'LIBERADA' | 'EN_RUTA'
export interface CargaResumen {
  rutaId: string
  rutaNumero: string
  fecha: string
  estado: EstadoCarga
  placa?: string
  pedidos: number
  bultosEsperados: number
  bultosCargados: number
}
export interface CargaRuta extends CargaResumen {
  conductor?: string
  tieneVehiculoYConductor: boolean
  /** null = todavía sin checklist. */
  checklist: ItemChecklist[] | null
  checklistPor?: string
  itemsChecklist: string[]
  pedidosDetalle: PedidoCarga[]
  liberadaEn?: string
  salioEn?: string
  /** Por qué todavía no se puede liberar la unidad (vacío = se puede). */
  motivosNoLiberar: string[]
}

export const ETIQUETA_ESTADO_CARGA: Record<EstadoCarga, string> = { EN_CARGA: 'En carga', LIBERADA: 'Unidad liberada', EN_RUTA: 'Salida confirmada' }

/** El código tal como lo manda el lector o se escribe a mano: sin espacios y en mayúsculas. */
export const normalizarCodigoBulto = (t: string) => t.trim().toUpperCase()

/** Mismos motivos y textos que `wms.liberar_unidad`. */
export function motivosNoLiberar(c: Pick<CargaRuta, 'tieneVehiculoYConductor' | 'checklist' | 'pedidosDetalle'>): string[] {
  const m: string[] = []
  if (!c.tieneVehiculoYConductor) m.push('La ruta necesita vehículo y conductor para liberar la unidad')
  if (!c.checklist) m.push('Falta el checklist del vehículo')
  else if (c.checklist.some((x) => !x.ok)) m.push('El checklist del vehículo tiene puntos sin cumplir')
  const salen = c.pedidosDetalle.filter((p) => !p.excluida)
  if (salen.length === 0) m.push('No queda ningún pedido para despachar en esta ruta')
  for (const p of salen) if (!p.listo) m.push(`El pedido ${p.pedidoNumero ?? p.salidaNumero} no está listo para carga: faltan la guía, el paquete documental completo o el embalaje`)
  const faltan = salen.reduce((t, p) => t + p.bultos.filter((b) => !b.cargado).length, 0)
  if (faltan > 0) m.push(`Faltan ${faltan} ${faltan === 1 ? 'bulto' : 'bultos'} por cargar: cárgalos o deja ese pedido fuera de la salida`)
  return m
}

export const avanceCarga = (c: Pick<CargaResumen, 'bultosCargados' | 'bultosEsperados'>) => (c.bultosEsperados === 0 ? 0 : Math.round((c.bultosCargados / c.bultosEsperados) * 100))
