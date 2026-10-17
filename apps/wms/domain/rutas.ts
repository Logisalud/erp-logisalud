// Rutas de distribución (S4): estados, vistas y las reglas puras de planificación (espejo de wms.planificar_ruta; la base de datos manda).
// Lo usan la demo y las pantallas para explicar y previsualizar: vehículo calificado, corte de planificación, un pedido en una sola ruta.
import { normalizar } from './busqueda'
import type { Rol } from './tipos'

export type EstadoRuta = 'BORRADOR' | 'PLANIFICADA' | 'LISTA_PARA_CARGA' | 'LIBERADA' | 'EN_RUTA' | 'PENDIENTE_CIERRE' | 'CERRADA' | 'CANCELADA'
export const ETIQUETA_ESTADO_RUTA: Record<EstadoRuta, string> = {
  BORRADOR: 'Borrador', PLANIFICADA: 'Planificada', LISTA_PARA_CARGA: 'Lista para carga', LIBERADA: 'Liberada', EN_RUTA: 'En ruta',
  PENDIENTE_CIERRE: 'Pendiente de cierre', CERRADA: 'Cerrada', CANCELADA: 'Cancelada',
}
/** Mientras la ruta está así, el plan se puede cambiar. */
export const RUTA_EDITABLE: readonly EstadoRuta[] = ['BORRADOR', 'PLANIFICADA']

export type FuncionTransporte = 'CONDUCTOR' | 'AUXILIAR'
export interface PersonalTransporte { id: string; nombre: string; funcion: FuncionTransporte; activo: boolean; dni?: string }
export interface VehiculoVista {
  id: string; placa: string; descripcion?: string; tipo: 'PROPIO' | 'EXTERNO'
  /** Atiende a los clientes que exigen «vehículo calificado» (D-58 define cuáles). */
  calificado: boolean; aptoCadenaFrio: boolean; capacidadBultos?: number; activo: boolean
}

export type EstadoStockParada = 'ASIGNADA' | 'SIN_STOCK' | 'PENDIENTE'
export const ETIQUETA_STOCK_PARADA: Record<EstadoStockParada, string> = { ASIGNADA: 'Stock asignado', SIN_STOCK: 'Sin stock suficiente', PENDIENTE: 'Por asignar' }

export interface ParadaVista {
  id: string
  secuencia: number
  pedidoId: string
  pedidoNumero: string
  cliente: string
  ruc?: string
  direccion?: string
  distrito?: string
  ventanaCita?: string
  vehiculoCalificado?: string
  lineas: number
  unidades: number
  salidaNumero?: string
  stock: EstadoStockParada
  excepcionCorte: boolean
  motivoExcepcion?: string
}

export interface VersionRuta { version: number; en: string; por: string; motivo: string; paradas: number }

export interface RutaVista {
  id: string
  numero: string
  fecha: string
  estado: EstadoRuta
  version: number
  vehiculo?: VehiculoVista
  conductor?: PersonalTransporte
  auxiliar?: PersonalTransporte
  paradas: ParadaVista[]
  versiones: VersionRuta[]
  /** Estado del registro LS-FR.43.03 (nace al confirmar la ruta). */
  registroLsFr?: 'BASE' | 'ENRIQUECIDO' | 'EN_EJECUCION' | 'COMPLETO' | 'GENERADO' | 'ARCHIVADO'
  motivoCancelacion?: string
  creadaPor: string
  creadaEn: string
  confirmadaEn?: string
  unidades: number
}

/** Un pedido de la bandeja que se puede meter en una ruta. */
export interface PedidoPlanificable {
  pedidoId: string
  numero: string
  cliente: string
  ruc?: string
  direccion?: string
  distrito?: string
  ventanaCita?: string
  vehiculoCalificado?: string
  lineas: number
  unidades: number
  /** Importado en Pedidos después del corte (de la víspera de la fecha elegida): necesita excepción. */
  importadoEn: string
  /** Ya está en una ruta viva. */
  enRuta?: string
  cambioPorRevisar: boolean
  sinCatalogo: string[]
}

export interface PanoramaRutas {
  hoy: string
  corte: string
  rutas: RutaVista[]
  vehiculos: VehiculoVista[]
  personal: PersonalTransporte[]
  pedidos: PedidoPlanificable[]
}

export interface PlanParada { pedidoId: string; excepcionCorte?: boolean; motivoExcepcion?: string }
export interface PlanRuta {
  fecha: string
  vehiculoId?: string
  conductorId?: string
  auxiliarId?: string
  paradas: PlanParada[]
  motivo?: string
}

// ── Permisos ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const puedePlanificarRutas = (roles: readonly Rol[]) => roles.includes('jefe_transporte')
export const puedeVerRutas = (roles: readonly Rol[]) => roles.some((r) => ['jefe_transporte', 'jefe_almacen', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura'].includes(r))

// ── Corte de planificación ───────────────────────────────────────────────────────────────────────────────────────
const sumarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** Hora de Lima de un instante ISO (UTC-5, sin horario de verano): «AAAA-MM-DD» y «HH:MM». */
export function horaLima(iso: string): { fecha: string; hora: string } {
  const d = new Date(Date.parse(iso) - 5 * 3_600_000).toISOString()
  return { fecha: d.slice(0, 10), hora: d.slice(11, 16) }
}

/** ¿Pasó el corte? Importado después de la hora de corte de la víspera de la fecha de la ruta (hora de Lima). */
export function fueraDeCorte(importadoEn: string, fechaRuta: string, corte = '16:00'): boolean {
  const { fecha, hora } = horaLima(importadoEn)
  const victima = sumarDias(fechaRuta, -1)
  return fecha > victima || (fecha === victima && hora > corte)
}

// ── Validación del plan (espejo de planificar_ruta) ───────────────────────────────────────────────────────────────
export interface EntradaValidacion {
  hoy: string
  corte: string
  plan: PlanRuta
  vehiculo?: VehiculoVista
  pedidos: ReadonlyMap<string, PedidoPlanificable>
  /** Pedidos que ya están en otra ruta viva (pedidoId → número de ruta). */
  enOtraRuta: ReadonlyMap<string, string>
}

/** Motivos por los que el plan no vale (vacío = vale). */
export function validarPlan(e: EntradaValidacion): string[] {
  const errores: string[] = []
  if (!e.plan.fecha || e.plan.fecha < e.hoy) errores.push('La fecha de la ruta no puede ser anterior a hoy.')
  if (e.plan.conductorId && e.plan.conductorId === e.plan.auxiliarId) errores.push('El conductor y el auxiliar deben ser personas distintas.')
  if (e.vehiculo && !e.vehiculo.activo) errores.push(`El vehículo ${e.vehiculo.placa} está inactivo.`)
  const vistos = new Set<string>()
  for (const p of e.plan.paradas) {
    if (vistos.has(p.pedidoId)) { errores.push('Hay un pedido repetido en la ruta.'); continue }
    vistos.add(p.pedidoId)
    const ped = e.pedidos.get(p.pedidoId)
    if (!ped) { errores.push('Uno de los pedidos ya no está en la bandeja.'); continue }
    if (ped.cambioPorRevisar) errores.push(`El pedido ${ped.numero} cambió en Pedidos: revisa el cambio antes de planificarlo.`)
    const otra = e.enOtraRuta.get(p.pedidoId)
    if (otra) errores.push(`El pedido ${ped.numero} ya está en la ruta ${otra}.`)
    if (ped.sinCatalogo.length) errores.push(`El pedido ${ped.numero} trae un producto que el WMS no conoce (${ped.sinCatalogo[0]}): Dirección Técnica debe darlo de alta.`)
    if (ped.vehiculoCalificado && !e.vehiculo?.calificado) errores.push(`El cliente de ${ped.numero} exige un vehículo calificado.`)
    if (fueraDeCorte(ped.importadoEn, e.plan.fecha, e.corte) && !p.excepcionCorte) errores.push(`El pedido ${ped.numero} llegó después del corte de las ${e.corte} de la víspera: marca la excepción y escribe el motivo.`)
    if (p.excepcionCorte && !p.motivoExcepcion?.trim()) errores.push(`La excepción del pedido ${ped.numero} necesita un motivo.`)
  }
  return errores
}

// ── Ayudas de la pantalla ────────────────────────────────────────────────────────────────────────────────────────
/** Sugerencia simple de orden: por distrito y, dentro de cada uno, por cita y cliente. El Jefe de Transporte lo ajusta. */
export function ordenSugerido<T extends { distrito?: string; ventanaCita?: string; cliente: string }>(paradas: readonly T[]): T[] {
  return [...paradas].sort((a, b) => normalizar(a.distrito ?? 'zzz').localeCompare(normalizar(b.distrito ?? 'zzz')) || (a.ventanaCita ?? '').localeCompare(b.ventanaCita ?? '') || a.cliente.localeCompare(b.cliente))
}

export function filtrarPedidosPlanificables(pedidos: readonly PedidoPlanificable[], q: string): PedidoPlanificable[] {
  const t = normalizar(q.trim())
  if (!t) return [...pedidos]
  return pedidos.filter((p) => t.split(/\s+/).every((x) => normalizar(`${p.numero} ${p.cliente} ${p.ruc ?? ''} ${p.distrito ?? ''} ${p.direccion ?? ''}`).includes(x)))
}

/** Lo que cambió entre dos versiones, en palabras (para el historial de la ruta). */
export function resumenVersion(motivo: string, paradas: number): string { return `${motivo} · ${paradas} ${paradas === 1 ? 'parada' : 'paradas'}` }

export const totalUnidades = (paradas: readonly Pick<ParadaVista, 'unidades'>[]) => paradas.reduce((t, p) => t + p.unidades, 0)
