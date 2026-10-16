// Salidas por pedido (S5 en adelante): asignación de lotes, picking, conformidad. Vistas, permisos y reglas puras (la base de datos manda: wms.editar_asignacion,
// wms.registrar_picking, wms.dar_conformidad, wms.resolver_discrepancia_picking). Las etapas siguientes (documentos, embalaje, carga, salida) extienden `EtapaSalida`.
import { normalizar } from './busqueda'
import { puede } from './permisos'
import type { Rol } from './tipos'

// ── Permisos ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const puedePrepararSalidas = (roles: readonly Rol[]) => puede(roles, 'preparar_salidas')
export const puedePickear = (roles: readonly Rol[]) => puede(roles, 'ejecutar')
export const puedeDarConformidad = (roles: readonly Rol[]) => puede(roles, 'dar_conformidad')
export const puedeCambiarLote = (roles: readonly Rol[]) => puede(roles, 'cambiar_lote_asignado')
export const puedeVerSalidas = (roles: readonly Rol[]) => roles.some((r) => ['jefe_transporte', 'jefe_almacen', 'auxiliar', 'asistente_dt', 'conformidad_despacho', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura'].includes(r))
export const puedeVerCambiosFefo = (roles: readonly Rol[]) => roles.some((r) => ['jefe_almacen', 'jefe_transporte', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura'].includes(r))

// ── Estados ───────────────────────────────────────────────────────────────────────────────────────────────────────
export type EstadoLineaSalida = 'PENDIENTE' | 'ASIGNADA' | 'SIN_STOCK' | 'EN_PICKING' | 'PICKEADA' | 'CONFORME' | 'OBSERVADA' | 'CONFIRMADA' | 'CANCELADA'
export type EstadoOrdenPicking = 'GENERADA' | 'EN_CURSO' | 'COMPLETA' | 'CON_DISCREPANCIA' | 'CANCELADA'
export type ResultadoPicking = 'PENDIENTE' | 'PICKEADA' | 'DISCREPANCIA'
export type ResultadoConformidad = 'PENDIENTE' | 'CONFORME' | 'OBSERVADA'

/** Dónde va el pedido en su camino a la salida (una sola columna para mirar y filtrar). */
export type EtapaSalida =
  | 'SIN_STOCK' | 'ASIGNADA' | 'EN_PICKING' | 'CON_DISCREPANCIA' | 'PENDIENTE_CONFORMIDAD' | 'OBSERVADA' | 'CONFORME' | 'DOCUMENTACION_COMPLETA' | 'EMBALADA'
  | 'LISTA_PARA_CARGA' | 'CARGADA' | 'CONFIRMADA' | 'CANCELADA'
export const ETIQUETA_ETAPA: Record<EtapaSalida, string> = {
  SIN_STOCK: 'Sin stock suficiente', ASIGNADA: 'Stock asignado', EN_PICKING: 'En picking', CON_DISCREPANCIA: 'Picking con discrepancia', PENDIENTE_CONFORMIDAD: 'Pendiente de conformidad',
  OBSERVADA: 'Observada', CONFORME: 'Conforme: falta la documentación', DOCUMENTACION_COMPLETA: 'Documentación completa: falta embalar', EMBALADA: 'Embalada: falta la documentación',
  LISTA_PARA_CARGA: 'Lista para carga', CARGADA: 'Cargada: falta liberar la unidad', CONFIRMADA: 'Salida confirmada', CANCELADA: 'Cancelada',
}

/** Las etapas en las que todo el pedido ya tiene la conformidad. */
export const ETAPAS_CONFORMES: readonly EtapaSalida[] = ['CONFORME', 'DOCUMENTACION_COMPLETA', 'EMBALADA', 'LISTA_PARA_CARGA', 'CARGADA']

/** Lo que ocurre después de la conformidad. «Listo para carga» exige las tres cosas a la vez: guía registrada, paquete documental completo y embalaje (D-60). */
export interface AvanceSalida { guia?: boolean; paquete?: boolean; embalada?: boolean; cargada?: boolean }

export const NO_CONFORMIDADES = ['CANTIDAD', 'PRODUCTO', 'LOTE', 'VENCIMIENTO', 'DANO', 'DOCUMENTO', 'OTRO'] as const
export type TipoNoConformidad = (typeof NO_CONFORMIDADES)[number]
export const ETIQUETA_NO_CONFORMIDAD: Record<TipoNoConformidad, string> = {
  CANTIDAD: 'Cantidad', PRODUCTO: 'Producto', LOTE: 'Lote', VENCIMIENTO: 'Vencimiento', DANO: 'Daño del producto o la caja', DOCUMENTO: 'Documento o dato', OTRO: 'Otro',
}

export function etapaDeSalida(s: {
  estado: 'ABIERTA' | 'CONFIRMADA' | 'CANCELADA'
  lineas: readonly { estado: EstadoLineaSalida }[]
  orden?: { lineas: readonly { picking: ResultadoPicking; conformidad: ResultadoConformidad }[] } | null
}, avance: AvanceSalida = {}): EtapaSalida {
  if (s.estado === 'CANCELADA') return 'CANCELADA'
  if (s.estado === 'CONFIRMADA') return 'CONFIRMADA'
  if (s.lineas.some((l) => l.estado === 'SIN_STOCK' || l.estado === 'PENDIENTE')) return 'SIN_STOCK'
  const o = s.orden
  if (!o) return 'ASIGNADA'
  if (o.lineas.some((l) => l.picking === 'DISCREPANCIA')) return 'CON_DISCREPANCIA'
  if (o.lineas.some((l) => l.picking === 'PENDIENTE')) return 'EN_PICKING'
  if (o.lineas.some((l) => l.conformidad === 'OBSERVADA')) return 'OBSERVADA'
  if (o.lineas.some((l) => l.conformidad === 'PENDIENTE')) return 'PENDIENTE_CONFORMIDAD'
  return etapaConAvance('CONFORME', avance)
}

/** Si el pedido ya está conforme, la etapa sigue con la documentación, el embalaje y la carga; antes de eso no cambia. */
export function etapaConAvance(base: EtapaSalida, avance: AvanceSalida): EtapaSalida {
  if (base !== 'CONFORME') return base
  const documentada = !!avance.guia && !!avance.paquete
  if (avance.cargada) return 'CARGADA'
  if (documentada && avance.embalada) return 'LISTA_PARA_CARGA'
  if (documentada) return 'DOCUMENTACION_COMPLETA'
  return avance.embalada ? 'EMBALADA' : 'CONFORME'
}

// ── Asignación de lotes ────────────────────────────────────────────────────────────────────────────────────────────
export interface AsignacionVista { loteId: string; lote: string; vence: string | null; cantidad: number; ubicaciones: string[] }

export interface LineaSalidaVista {
  id: string
  productoId: string
  producto: string
  productoCodigo: string
  cantidad: number
  estado: EstadoLineaSalida
  /** La propuesta FEFO original (no cambia nunca) y la vigente. */
  fefo: AsignacionVista[]
  asignacion: AsignacionVista[]
  apartadaDeFefo: boolean
  nota?: string
  /** Se pueden editar los lotes mientras no haya empezado el picking de la línea. */
  editable: boolean
}

export interface CambioFefoVista { lineaId: string; en: string; por: string; anterior: string; nueva: string; distintoDeFefo: boolean; motivo?: string }

export interface SalidaResumen {
  id: string
  numero: string
  pedidoNumero?: string
  cliente?: string
  rutaNumero?: string
  fecha: string
  unidades: number
  lineas: number
  etapa: EtapaSalida
  ordenNumero?: string
  /** N.° de la guía de remisión vigente y documentos exigidos que faltan o están vencidos (S6b). */
  guia?: string
  documentosFaltantes?: number
}

export interface SalidaVista extends SalidaResumen {
  estado: 'ABIERTA' | 'CONFIRMADA' | 'CANCELADA'
  creadaPor: string
  lineasDetalle: LineaSalidaVista[]
  ordenPickingId?: string
  cambios: CambioFefoVista[]
}

/** Un lote que se puede elegir en la celda: vencimiento, ubicación y disponible a la vista; el FEFO marcado como «sugerido». */
export interface LoteEditable { loteId: string; lote: string; vence: string | null; diasDeVida: number | null; ubicacion: string; ubicaciones: number; disponible: number; asignado: number; sugerido: boolean }

export interface CambioFefoPersona { personaId: string; persona: string; veces: number; lineas: number; unidades: number; primeraEn: string; ultimaEn: string }

// ── Picking y conformidad ─────────────────────────────────────────────────────────────────────────────────────────
export interface LineaPickingVista {
  id: string
  lineaId: string
  ubicacion: string
  ordenRecorrido: number
  productoCodigo: string
  producto: string
  lote: string
  vence: string | null
  cantidad: number
  picking: ResultadoPicking
  picker?: string
  pickerId?: string
  pickeadaEn?: string
  notaPicking?: string
  conformidad: ResultadoConformidad
  verificador?: string
  verificadaEn?: string
  notaConformidad?: string
  noConformidad?: TipoNoConformidad
}

export interface OrdenPickingResumen {
  id: string
  numero: string
  salidaNumero: string
  pedidoNumero?: string
  cliente?: string
  rutaNumero?: string
  estado: EstadoOrdenPicking
  lineas: number
  unidades: number
  pickeadas: number
  conformes: number
  observadas: number
  discrepancias: number
  generadaEn: string
}

export interface OrdenPickingVista extends OrdenPickingResumen {
  salidaId: string
  generadaPor: string
  lineasDetalle: LineaPickingVista[]
}

export interface ReemplazoVista { posicionId: string; posicion: string; loteId: string; lote: string; vence: string | null; disponible: number; motivo: 'MISMO_LOTE_OTRA_UBICACION' | 'SIGUIENTE_FEFO' }
export const ETIQUETA_REEMPLAZO: Record<ReemplazoVista['motivo'], string> = { MISMO_LOTE_OTRA_UBICACION: 'El mismo lote, en otra ubicación', SIGUIENTE_FEFO: 'El siguiente lote por vencimiento' }

// ── Reglas puras de la pantalla ───────────────────────────────────────────────────────────────────────────────────
export const avancePicking = (o: Pick<OrdenPickingResumen, 'pickeadas' | 'lineas'>) => (o.lineas === 0 ? 0 : Math.round((o.pickeadas / o.lineas) * 100))

/** Lo que sigue por hacer en una orden, para la cola de picking. */
export function siguientePaso(l: Pick<LineaPickingVista, 'picking'>[]): 'PICKEAR' | 'RESOLVER' | 'LISTA' {
  if (l.some((x) => x.picking === 'DISCREPANCIA')) return 'RESOLVER'
  return l.some((x) => x.picking === 'PENDIENTE') ? 'PICKEAR' : 'LISTA'
}

export function filtrarSalidas(salidas: readonly SalidaResumen[], f: { q: string; etapa: '' | EtapaSalida }): SalidaResumen[] {
  const q = normalizar(f.q.trim())
  return salidas.filter((s) => (!f.etapa || s.etapa === f.etapa) && (!q || q.split(/\s+/).every((t) => normalizar(`${s.numero} ${s.pedidoNumero ?? ''} ${s.cliente ?? ''} ${s.rutaNumero ?? ''} ${s.ordenNumero ?? ''}`).includes(t))))
}

/** ¿Quién puede dar la conformidad de esta línea? Otra persona, no quien la pickeó (espejo de la base). */
export function motivoNoPuedeConformar(roles: readonly Rol[], personaId: string, pickerId?: string): string | null {
  if (!puedeDarConformidad(roles)) return 'No tienes permiso para dar la conformidad'
  if (pickerId && pickerId === personaId) return 'La conformidad la da otra persona, no quien hizo el picking'
  return null
}
