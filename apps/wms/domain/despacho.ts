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
  /** SA-3: llegó un cambio o una cancelación del pedido con el picking ya iniciado: hay que devolver lo picado a su ubicación (movimiento verificado) antes de seguir o cerrar. */
  | 'POR_DEVOLVER_PICKING'
export const ETIQUETA_ETAPA: Record<EtapaSalida, string> = {
  SIN_STOCK: 'Sin stock suficiente', ASIGNADA: 'Stock asignado', EN_PICKING: 'En picking', CON_DISCREPANCIA: 'Picking con discrepancia', PENDIENTE_CONFORMIDAD: 'Pendiente de conformidad',
  OBSERVADA: 'Observada', CONFORME: 'Conforme: falta la documentación', DOCUMENTACION_COMPLETA: 'Documentación completa: falta embalar', EMBALADA: 'Embalada: falta la documentación',
  LISTA_PARA_CARGA: 'Lista para carga', CARGADA: 'Cargada: falta liberar la unidad', CONFIRMADA: 'Salida confirmada', CANCELADA: 'Cancelada', POR_DEVOLVER_PICKING: 'Por devolver lo picado',
}

/** Las etapas en las que todo el pedido ya tiene la conformidad. */
export const ETAPAS_CONFORMES: readonly EtapaSalida[] = ['CONFORME', 'DOCUMENTACION_COMPLETA', 'EMBALADA', 'LISTA_PARA_CARGA', 'CARGADA']

/** Lo que ocurre después de la conformidad. «Listo para carga» exige las tres cosas a la vez: guía registrada, paquete documental completo y embalaje (D-60). */
export interface AvanceSalida { guia?: boolean; paquete?: boolean; embalada?: boolean; cargada?: boolean; /** Un pedido a Lima no se embala: sus bultos ya son los de la conformidad. */ sinEmbalaje?: boolean }

export const NO_CONFORMIDADES = ['CANTIDAD', 'PRODUCTO', 'LOTE', 'VENCIMIENTO', 'DANO', 'DOCUMENTO', 'OTRO'] as const
export type TipoNoConformidad = (typeof NO_CONFORMIDADES)[number]
export const ETIQUETA_NO_CONFORMIDAD: Record<TipoNoConformidad, string> = {
  CANTIDAD: 'Cantidad', PRODUCTO: 'Producto', LOTE: 'Lote', VENCIMIENTO: 'Vencimiento', DANO: 'Daño del producto o la caja', DOCUMENTO: 'Documento o dato', OTRO: 'Otro',
}

export function etapaDeSalida(s: {
  estado: 'ABIERTA' | 'CONFIRMADA' | 'CANCELADA'
  lineas: readonly { estado: EstadoLineaSalida }[]
  orden?: { lineas: readonly { picking: ResultadoPicking; conformidad: ResultadoConformidad }[] } | null
  /** Hay unidades picadas por devolver a su ubicación (por un cambio o una cancelación del pedido) y la devolución todavía no está verificada. */
  devolucionPendiente?: boolean
}, avance: AvanceSalida = {}): EtapaSalida {
  if (s.estado === 'CANCELADA') return 'CANCELADA'
  if (s.estado === 'CONFIRMADA') return 'CONFIRMADA'
  if (s.devolucionPendiente) return 'POR_DEVOLVER_PICKING'
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
  const embalaje = !!avance.embalada || !!avance.sinEmbalaje
  if (avance.cargada) return 'CARGADA'
  if (documentada && embalaje) return 'LISTA_PARA_CARGA'
  if (documentada) return 'DOCUMENTACION_COMPLETA'
  return avance.embalada && !avance.sinEmbalaje ? 'EMBALADA' : 'CONFORME'
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
  /** Un pedido a provincia se embala; uno a Lima queda con los bultos de la conformidad. */
  requiereEmbalaje: boolean
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
  loteId: string
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
  /** Quién hace el picking (se elige al imprimir la orden o al iniciarla). */
  pickerId?: string
  picker?: string
}

export interface OrdenPickingVista extends OrdenPickingResumen {
  salidaId: string
  generadaPor: string
  lineasDetalle: LineaPickingVista[]
  /** Un pedido a provincia se embala; uno a Lima queda con los bultos de la conformidad. */
  requiereEmbalaje: boolean
  /** Los bultos que registró la conformidad (cuando ya se dio). */
  bultosConformidad?: number
  ajustes: AjusteConformidadVista[]
}

// ── Conformidad de toda la orden (OS-2) ──────────────────────────────────────────────────────────────
export const RESULTADOS_LINEA = ['CONFORME', 'OTRO_LOTE', 'MENOS', 'NO_ENCONTRADO'] as const
export type ResultadoLineaOrden = (typeof RESULTADOS_LINEA)[number]
export const ETIQUETA_RESULTADO_LINEA: Record<ResultadoLineaOrden, string> = {
  CONFORME: 'Conforme', OTRO_LOTE: 'Otro lote', MENOS: 'Menos cantidad', NO_ENCONTRADO: 'No lo encontré',
}
/** Lo que decide quien da la conformidad por cada línea. Lo que no se menciona es «Conforme». */
export interface ResultadoLineaConformidad { ordenLineaId: string; resultado: ResultadoLineaOrden; loteId?: string; cantidad?: number; nota?: string }
export interface AjusteConformidadVista { ordenLineaId: string; tipo: Exclude<ResultadoLineaOrden, 'CONFORME'>; loteAntes?: string; loteDespues?: string; cantidadAntes: number; cantidadDespues: number; nota?: string; por: string; en: string }
export interface PersonaPicking { id: string; nombre: string }
export const MAX_BULTOS_CONFORMIDAD = 99

/**
 * Lo que la pantalla puede comprobar antes de enviar la conformidad (la base de datos vuelve a comprobarlo todo): una cantidad válida por línea,
 * el lote elegido y los bultos. Devuelve el primer problema, en lenguaje de personas, o null.
 */
export function validarConformidadOrden(
  lineas: readonly { id: string; cantidad: number; lote: string }[],
  resultados: readonly ResultadoLineaConformidad[],
  bultos: number | null | undefined,
): string | null {
  let unidades = 0
  for (const l of lineas) {
    const r = resultados.find((x) => x.ordenLineaId === l.id) ?? { ordenLineaId: l.id, resultado: 'CONFORME' as const }
    if (r.resultado === 'CONFORME') { unidades += l.cantidad; continue }
    if (r.resultado === 'NO_ENCONTRADO') continue
    if (r.resultado === 'MENOS') {
      if (!r.cantidad || r.cantidad < 1 || r.cantidad >= l.cantidad) return `Cuántas unidades encontraste del lote ${l.lote}: tiene que ser más de cero y menos de las ${l.cantidad}. Si no hay ninguna, elige «No lo encontré»`
      unidades += r.cantidad; continue
    }
    if (r.resultado === 'OTRO_LOTE') {
      if (!r.loteId) return `Elige el lote que encontraste en lugar del ${l.lote}`
      const c = r.cantidad ?? l.cantidad
      if (c < 1 || c > l.cantidad) return `La cantidad del otro lote tiene que estar entre 1 y ${l.cantidad}`
      unidades += c; continue
    }
    return 'Cada línea es Conforme, Otro lote, Menos cantidad o No lo encontré'
  }
  if (unidades === 0) return 'Ninguna línea quedó conforme: cancela la Orden de Salida o corrige el picking'
  if (!bultos || !Number.isInteger(bultos) || bultos < 1 || bultos > MAX_BULTOS_CONFORMIDAD) return 'Registra el número de bultos (cajas master): de 1 a 99'
  return null
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

/** ¿Quién puede dar la conformidad de la orden? Otra persona, no quien hizo el picking (espejo de la base). Sin picker indicado todavía no hay conformidad. */
export function motivoNoPuedeConformar(roles: readonly Rol[], personaId: string, pickerId?: string, ordenSinPicker = false): string | null {
  if (!puedeDarConformidad(roles)) return 'No tienes permiso para dar la conformidad'
  if (ordenSinPicker) return 'Antes de la conformidad se indica quién hizo el picking'
  if (pickerId && pickerId === personaId) return 'La conformidad la da otra persona, no quien hizo el picking'
  return null
}
