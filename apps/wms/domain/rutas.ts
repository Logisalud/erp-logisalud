// Rutas de distribución (S4): estados, vistas y las reglas puras de planificación (espejo de wms.planificar_ruta; la base de datos manda).
// Lo usan la demo y las pantallas para explicar y previsualizar: corte de planificación y un pedido en una sola ruta (el vehículo calificado ya no se valida: D-153).
import { normalizar } from './busqueda'
import type { TipoSalida } from './salidas'
import type { Rol } from './tipos'

export type EstadoRuta = 'BORRADOR' | 'PLANIFICADA' | 'LISTA_PARA_CARGA' | 'LIBERADA' | 'EN_RUTA' | 'PENDIENTE_CIERRE' | 'CERRADA' | 'CANCELADA'
export const ETIQUETA_ESTADO_RUTA: Record<EstadoRuta, string> = {
  BORRADOR: 'Borrador', PLANIFICADA: 'Planificada', LISTA_PARA_CARGA: 'Lista para carga', LIBERADA: 'Liberada', EN_RUTA: 'En ruta',
  PENDIENTE_CIERRE: 'Pendiente de cierre', CERRADA: 'Cerrada', CANCELADA: 'Cancelada',
}
/** Mientras la ruta está así, el plan se puede cambiar. */
export const RUTA_EDITABLE: readonly EstadoRuta[] = ['BORRADOR', 'PLANIFICADA']

export type FuncionTransporte = 'CONDUCTOR' | 'AUXILIAR'
/** Documento de identidad de quien conduce: así lo pide la guía de SUNAT (D-158). Sin dato = DNI. */
export type DocumentoTipo = 'DNI' | 'CE' | 'PASAPORTE'
export const ETIQUETA_DOCUMENTO: Record<DocumentoTipo, string> = { DNI: 'DNI', CE: 'Carné de extranjería', PASAPORTE: 'Pasaporte' }
export interface PersonalTransporte {
  id: string; nombre: string; funcion: FuncionTransporte; activo: boolean
  /** Número del documento de identidad (el campo se llama `dni` por historia; con `documentoTipo` puede ser un carné de extranjería o un pasaporte). */
  dni?: string; documentoTipo?: DocumentoTipo; licencia?: string
}
export interface VehiculoVista {
  id: string; placa: string; descripcion?: string; tipo: 'PROPIO' | 'EXTERNO'
  /** Solo informativo (D-153): el WMS ya no valida ni exige «vehículo calificado»; lo decide el Jefe de Transporte por experiencia. */
  calificado: boolean; aptoCadenaFrio: boolean; capacidadBultos?: number; activo: boolean
}

export type EstadoStockParada = 'ASIGNADA' | 'SIN_STOCK' | 'PENDIENTE'
export const ETIQUETA_STOCK_PARADA: Record<EstadoStockParada, string> = { ASIGNADA: 'Stock asignado', SIN_STOCK: 'Sin stock suficiente', PENDIENTE: 'Por asignar' }

export interface ParadaVista {
  id: string
  secuencia: number
  /** Cómo se reconoce la parada en el plan: el id del pedido o, en una parada por orden, `orden:<id de la orden>` (SA-6). */
  clave: string
  /** Vacío en una parada por orden cuyo pedido todavía no llegó por la bandeja (venta manual, muestra, devolución al proveedor). */
  pedidoId?: string
  /** La orden de la parada (siempre existe una vez planificada). */
  salidaId?: string
  /** PEDIDO = parada de un pedido de la bandeja; ORDEN = parada por orden manual (SA-6). */
  origen: 'PEDIDO' | 'ORDEN'
  tipoOrden?: TipoSalida
  pedidoNumero: string
  cliente: string
  ruc?: string
  direccion?: string
  distrito?: string
  ventanaCita?: string
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
  lineas: number
  unidades: number
  /** Importado en Pedidos después del corte (de la víspera de la fecha elegida): necesita excepción. */
  importadoEn: string
  /** Ya está en una ruta viva. */
  enRuta?: string
  cambioPorRevisar: boolean
  sinCatalogo: string[]
}

/** SA-6: una orden manual (venta A sin pedido en la bandeja, muestra o devolución al proveedor C) que se puede meter en una ruta. */
export interface OrdenPlanificable {
  salidaId: string
  /** `orden:<salidaId>` (la misma clave que usa la parada). */
  clave: string
  numero: string
  tipo: TipoSalida
  /** Número de pedido de la venta manual (A); vacío en C. */
  pedidoNumero?: string
  cliente: string
  ruc?: string
  direccion?: string
  distrito?: string
  lineas: number
  unidades: number
  /** Creada después del corte (de la víspera de la fecha elegida): necesita excepción. */
  creadaEn: string
  enRuta?: string
  /** Alguna línea no tiene stock: no se puede confirmar la ruta con ella. */
  sinStock: boolean
}

export const claveDeOrden = (salidaId: string) => `orden:${salidaId}`

export interface PanoramaRutas {
  hoy: string
  corte: string
  rutas: RutaVista[]
  vehiculos: VehiculoVista[]
  personal: PersonalTransporte[]
  pedidos: PedidoPlanificable[]
  /** SA-6: órdenes manuales por despachar (A y C sin ruta, ya con su orden y su stock). */
  ordenes: OrdenPlanificable[]
  /** D-155: el interruptor temporal «conductor en documentos». Ausente = el interruptor ya no existe y los documentos llevan al conductor real. */
  conductorEnDocumentos?: ConductorEnDocumentos
}

/** D-155 (temporal): quién figura como conductor en la guía electrónica y en el LS-FR.43.03, sea cual sea el conductor real de la ruta. */
export interface ConductorEnDocumentos {
  /** La persona que figura en los documentos; vacío = los documentos llevan al conductor real de cada ruta. */
  personaId?: string
  nombre?: string
  /** Última vez que se cambió, en palabras (quién, cuándo y por qué; queda también en la auditoría). */
  cambio?: string
}

/** Una parada del plan: un pedido de la bandeja (`pedidoId`) o una orden manual (`salidaId`). */
export interface PlanParada { pedidoId?: string; salidaId?: string; excepcionCorte?: boolean; motivoExcepcion?: string }
export const clavePlanParada = (p: PlanParada) => p.pedidoId ?? (p.salidaId ? claveDeOrden(p.salidaId) : '')
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
  /** SA-6: órdenes manuales (clave `orden:<id>`). */
  ordenes?: ReadonlyMap<string, OrdenPlanificable>
  /** SA-6: órdenes que ya están en otra ruta viva (clave → número de ruta). */
  ordenesEnOtraRuta?: ReadonlyMap<string, string>
}

/** Motivos por los que el plan no vale (vacío = vale). */
export function validarPlan(e: EntradaValidacion): string[] {
  const errores: string[] = []
  if (!e.plan.fecha || e.plan.fecha < e.hoy) errores.push('La fecha de la ruta no puede ser anterior a hoy.')
  if (e.plan.conductorId && e.plan.conductorId === e.plan.auxiliarId) errores.push('El conductor y el auxiliar deben ser personas distintas.')
  if (e.vehiculo && !e.vehiculo.activo) errores.push(`El vehículo ${e.vehiculo.placa} está inactivo.`)
  const vistos = new Set<string>()
  for (const p of e.plan.paradas) {
    const clave = clavePlanParada(p)
    if (!clave || vistos.has(clave)) { errores.push('Hay un pedido o una orden repetida en la ruta.'); continue }
    vistos.add(clave)
    if (!p.pedidoId) {
      const ord = e.ordenes?.get(clave)
      if (!ord) { errores.push('Una de las órdenes ya no se puede planificar.'); continue }
      if (ord.tipo === 'CLIENTE') { errores.push(`La orden ${ord.numero} es por cuenta de un cliente de almacenamiento: no va en una ruta de Logisalud, se entrega al transportista del cliente.`); continue }
      const otraO = e.ordenesEnOtraRuta?.get(clave)
      if (otraO) errores.push(`La orden ${ord.numero} ya está en la ruta ${otraO}.`)
      if (fueraDeCorte(ord.creadaEn, e.plan.fecha, e.corte) && !p.excepcionCorte) errores.push(`La orden ${ord.numero} se creó después del corte de las ${e.corte} de la víspera: marca la excepción y escribe el motivo.`)
      if (p.excepcionCorte && !p.motivoExcepcion?.trim()) errores.push(`La excepción de la orden ${ord.numero} necesita un motivo.`)
      continue
    }
    const ped = e.pedidos.get(p.pedidoId)
    if (!ped) { errores.push('Uno de los pedidos ya no está en la bandeja.'); continue }
    if (ped.cambioPorRevisar) errores.push(`El pedido ${ped.numero} cambió en Pedidos: revisa el cambio antes de planificarlo.`)
    const otra = e.enOtraRuta.get(p.pedidoId)
    if (otra) errores.push(`El pedido ${ped.numero} ya está en la ruta ${otra}.`)
    if (ped.sinCatalogo.length) errores.push(`El pedido ${ped.numero} trae un producto que el WMS no conoce (${ped.sinCatalogo[0]}): Dirección Técnica debe darlo de alta.`)
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

export function filtrarOrdenesPlanificables(ordenes: readonly OrdenPlanificable[], q: string): OrdenPlanificable[] {
  const t = normalizar(q.trim())
  if (!t) return [...ordenes]
  return ordenes.filter((o) => t.split(/\s+/).every((x) => normalizar(`${o.numero} ${o.pedidoNumero ?? ''} ${o.cliente} ${o.ruc ?? ''} ${o.distrito ?? ''} ${o.direccion ?? ''}`).includes(x)))
}

export function filtrarPedidosPlanificables(pedidos: readonly PedidoPlanificable[], q: string): PedidoPlanificable[] {
  const t = normalizar(q.trim())
  if (!t) return [...pedidos]
  return pedidos.filter((p) => t.split(/\s+/).every((x) => normalizar(`${p.numero} ${p.cliente} ${p.ruc ?? ''} ${p.distrito ?? ''} ${p.direccion ?? ''}`).includes(x)))
}

/** Lo que cambió entre dos versiones, en palabras (para el historial de la ruta). */
export function resumenVersion(motivo: string, paradas: number): string { return `${motivo} · ${paradas} ${paradas === 1 ? 'parada' : 'paradas'}` }

export const totalUnidades = (paradas: readonly Pick<ParadaVista, 'unidades'>[]) => paradas.reduce((t, p) => t + p.unidades, 0)
