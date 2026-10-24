// Rutas y salidas por pedido en memoria (modo demostración). Aplica las mismas reglas que las migraciones 0012 (asignación FEFO, reservas) y 0017 (rutas).
// Las siguientes etapas (picking, conformidad, documentos, embalaje, carga y salida) se apilan sobre esta clase.
import { asignarLinea, type AsignacionLote, type LoteDisponible, type MotivoSalida, type TipoSalida } from '@/domain/salidas'
import type { ClienteManual, CreadaDesde, OrigenOrden } from '@/domain/salida-manual'
import { normalizarNumeroPedido } from '@/domain/salida-manual'
import { explicarFaltante, type CausaFaltante, type CausaQuiebre, type ExistenciaLote, type ExplicacionFaltante } from '@/domain/faltante'
import {
  RUTA_EDITABLE, claveDeOrden, clavePlanParada, puedePlanificarRutas, validarPlan, totalUnidades,
  type ConductorEnDocumentos, type DocumentoTipo, type OrdenPlanificable, type ParadaVista, type PanoramaRutas, type PedidoPlanificable, type PersonalTransporte, type PlanParada, type PlanRuta, type RutaVista, type VehiculoVista,
} from '@/domain/rutas'
import { AREAS_DE_SALIDA } from '@/domain/zonas'
import { requiereEmbalaje } from '@/domain/pedidos-despacho'
import { PARAMETROS_LS_FR_POR_DEFECTO, PENDIENTES_LS_FR, armarRegistroLsFr, puedeImprimirLsFr, type ExtrasLsFr, type RegistroLsFrVista } from '@/domain/ls-fr-43-03'
import { errorDocumentoPersonal, quienFiguraEnDocumentos, type QuienFigura } from '@/domain/conductor-documentos'
import { modoEjemplos } from '@/lib/demo'
import { registrar, type EstadoDemo } from './estado'
import { alertar, ahora, estadoE, falla, nuevoId } from './entradas-demo'
import { numeroDe } from './libro'
import { PedidosDemo, unirOrdenManual } from './pedidos-demo'
import type { RepositorioRutas } from '../repositorio-rutas'
import type { Actor, ResultadoAccion } from '../repositorio'

export interface ReservaDemo {
  id: string; lineaId: string; salidaId: string; productoId: string; loteId: string; posicionId: string; posicionOrigenId: string; procedenciaId: string; cantidad: number
  estado: 'ACTIVA' | 'EN_TRANSITO' | 'EN_STAGING' | 'CONSUMIDA' | 'LIBERADA'
}
export interface LineaSalidaDemo {
  id: string; productoId: string; cantidad: number
  /** SA-3: de qué línea del pedido viene (para saber cuál quitó, redujo o agregó Pedidos). */
  pedidoLineaId?: string
  /** SA-3: lo picado por devolver; al verificarse la línea queda en esta cantidad (0 = se quitó la línea). */
  cantidadNueva?: number
  estado: 'PENDIENTE' | 'ASIGNADA' | 'SIN_STOCK' | 'EN_PICKING' | 'PICKEADA' | 'CONFORME' | 'OBSERVADA' | 'CONFIRMADA' | 'CANCELADA'
  /** La asignación FEFO original (no cambia nunca) y la vigente. */
  fefo: AsignacionLote[]
  nota?: string
  /** Tipo B y devolución al proveedor: el lote que indica el cliente o la guía. */
  loteIndicadoId?: string
}
/** El estado de una serie de guías en la demostración. */
export interface NumeracionSerieDemo { ultimo: number; confirmado: boolean; numeros: { numero: number; estado: 'RESERVADO' | 'USADO' | 'LIBERADO' | 'OCUPADO'; salidaId?: string; entorno?: string }[] }

export interface SalidaDemo {
  id: string; numero: string; pedidoId: string; propietarioId: string; estado: 'ABIERTA' | 'CONFIRMADA' | 'CANCELADA'
  /** Un pedido a provincia se embala; uno a Lima queda con los bultos de la conformidad. */
  requiereEmbalaje: boolean; bultosConformidad?: number
  lineas: LineaSalidaDemo[]; creadaEn: string; creadaPor: string
  /** SA-2: de dónde nació la orden. Lo anterior (sin estos datos) es una venta de distribución de un pedido. */
  tipo?: TipoSalida; motivo?: MotivoSalida; origen?: OrigenOrden; creadaDesde?: CreadaDesde
  pedidoNumero?: string; porConciliar?: boolean; clienteManual?: ClienteManual
  /** Tipo B: la GRE del cliente (número y PDF) y a nombre de qué propietario se creó. */
  greNumero?: string; greArchivo?: string; enNombreDe?: string
  /** D-161: motivo escrito para continuar una devolución al proveedor con menos de 90 días para vencer. */
  devolucionAvisoMotivo?: string
  /** SA-6, tipo B: la entrega al transportista del cliente (la salida se confirma al registrarla). */
  entrega?: import('@/domain/entrega-transportista').EntregaTransportistaVista
  /** Repetir el mismo envío no crea otra orden. */
  token?: string
  /** SA-1: orden de ejemplo de la demostración (lleva la etiqueta «Ejemplo»). */
  ejemplo?: boolean
  /** SA-3: el pedido se canceló en Pedidos; mientras falte devolver lo picado, la orden sigue abierta con `cancelacionPendiente`. */
  motivoCancelacion?: string; canceladaEn?: string; cancelacionPendiente?: boolean
}

/** SA-3: lo picado (o en Despacho) que un cambio o la cancelación del pedido dejó sin pedido: se devuelve a su ubicación con un movimiento verificado. */
export interface DevolucionDemo {
  id: string; salidaId: string; lineaId: string; reservaId: string; cantidad: number
  estadoReserva: 'EN_TRANSITO' | 'EN_STAGING'
  desdePosicionId: string; hastaPosicionId: string
  causa: 'CAMBIO_PEDIDO' | 'PEDIDO_CANCELADO'; pedidoVersion?: number
  estado: 'POR_DEVOLVER' | 'DEVUELTA' | 'VERIFICADA'
  ordenMovimientoId?: string; ordenMovimientoLineaId?: string
  creadaEn: string; devueltaPorId?: string; devueltaPor?: string; devueltaEn?: string; verificadaPorId?: string; verificadaPor?: string; verificadaEn?: string
}

/** SA-3: un quiebre de stock (append-only): lo que faltó o lo que decidió Pedidos. Alimenta el reporte futuro. */
export interface QuiebreDemo {
  id: string; en: string; origen: 'DETECCION' | 'PEDIDOS'; causa: CausaQuiebre
  salidaId: string; salidaNumero: string; pedidoId?: string; pedidoNumero?: string; lineaId: string; productoId: string
  cantidadPedida: number; cantidadFaltante: number; cantidadCausa: number; vendedor?: string; detalle: Record<string, unknown>; por: string
}
/** Una parada es de un pedido de la bandeja (`pedidoId`) o, en una orden manual sin pedido todavía, solo de la orden (`salidaId`). SA-6. */
export interface ParadaDemo { id: string; secuencia: number; pedidoId?: string; salidaId?: string; excepcionCorte: boolean; motivoExcepcion?: string; activa: boolean }
export interface RutaDemo {
  id: string; numero: string; fecha: string; estado: RutaVista['estado']; version: number
  vehiculoId?: string; conductorId?: string; auxiliarId?: string; paradas: ParadaDemo[]
  versiones: RutaVista['versiones']; registroLsFr?: RutaVista['registroLsFr']; motivoCancelacion?: string
  creadaPor: string; creadaEn: string; confirmadaEn?: string
}
export interface DespachoDemoEstado {
  personal: PersonalTransporte[]; vehiculos: VehiculoVista[]; rutas: RutaDemo[]; salidas: SalidaDemo[]; reservas: ReservaDemo[]
  /** Hora de corte de la planificación (parámetro). */
  corte: string; sembrado: boolean
  /** S5: órdenes de picking, cambios a FEFO y su historia (se crea al primer uso). */
  picking?: import('./picking-demo').PickingDemoEstado
  /** S6b: guías de remisión registradas a mano (nunca se editan: se anulan con motivo). */
  guias?: GuiaDemo[]
  /** Piloto (0036): quién emite la guía. Sin dato = `WMS` (o lo que diga `WMS_DEMO_GUIA_MODO`). */
  guiaModo?: import('@/domain/guia-electronica').GuiaModo
  /** OS-3: avisos hacia Pedidos (guía emitida / anulada). */
  eventosPedidos?: import('@/domain/guia-electronica').EventoPedidos[]
  /** D-162: la numeración de las guías por serie (último número, correlativo confirmado y el estado de cada número), igual que `wms.guia_correlativos` y `wms.guia_numeros`. */
  numeracionGuia?: Record<string, NumeracionSerieDemo>
  /** S7: bultos (los vigentes y los anulados al reabrir el embalaje). */
  bultos?: import('@/domain/embalaje').BultoVista[]
  /** OS-1: Reservas de lote (la historia completa; la vigente es la que no tiene `quitadaEn`). */
  reservasLote?: import('@/domain/reserva').ReservaLoteVista[]
  /** S8: carga por ruta (checklist, bultos cargados, exclusiones, liberación y salida). */
  carga?: Record<string, CargaDemo>
  /** SA-3: devoluciones de lo picado y quiebres de stock. */
  devoluciones?: DevolucionDemo[]
  quiebres?: QuiebreDemo[]
  /** OS-7: impresiones, escaneo firmado y cierre de cada ruta (LS-FR.43.03). */
  lsFr?: Record<string, import('./cierre-ruta-demo').LsFrDemo>
  /** SB-A (D-155, temporal): el interruptor «conductor en documentos». Sin esta propiedad el interruptor ya no existe y los documentos llevan al conductor real. */
  conductorEnDocumentos?: ConductorEnDocumentos
}
export interface CargaDemo {
  checklist?: import('@/domain/carga').ItemChecklist[]; checklistPor?: string
  cargados: { codigo: string; estado: 'CARGADO' | 'RETIRADO'; motivo?: string }[]
  exclusiones: { salidaId: string; motivo: string; por: string; en: string }[]
  liberadaEn?: string; salioEn?: string
}
export interface GuiaDemo { id: string; salidaId: string; guia: import('@/domain/documentacion').GuiaVista }

export function desp(e: EstadoDemo): DespachoDemoEstado {
  if (!e.desp) e.desp = { personal: [], vehiculos: [], rutas: [], salidas: [], reservas: [], corte: '16:00', sembrado: false }
  return e.desp
}

const sumarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
/** Cómo se reconoce una parada en el plan y en las tablas de la ruta: el pedido o `orden:<id>`. */
export const claveDeParada = (p: ParadaDemo) => p.pedidoId ?? claveDeOrden(p.salidaId ?? '')
export const duenoDelAlmacen = (e: EstadoDemo) => e.panorama.propietarios.find((p) => p.esDuenoAlmacen)?.id ?? ''

/** Lo comprometido de una celda: reservas de salidas vivas y movimientos internos todavía sin verificar (una sola fuente, como wms._comprometido). */
export function comprometidoEn(e: EstadoDemo, posicionId: string, loteId: string, procedenciaId: string): number {
  const d = desp(e)
  const reservas = d.reservas.filter((r) => (r.estado === 'ACTIVA' || r.estado === 'EN_TRANSITO' || r.estado === 'EN_STAGING') && r.loteId === loteId && r.posicionId === posicionId && r.procedenciaId === procedenciaId).reduce((t, r) => t + r.cantidad, 0)
  const movimientos = e.inv.ordenes.filter((o) => o.estado === 'EJECUTADO' || o.estado === 'CON_DIFERENCIA').flatMap((o) => o.lineas)
    .filter((l) => (l.verificacion === 'PENDIENTE' || l.verificacion === 'CON_DIFERENCIA') && l.desdePosicionId === posicionId && l.loteId === loteId && l.procedenciaId === procedenciaId).reduce((t, l) => t + l.cantidad, 0)
  return reservas + movimientos
}

// ── Stock disponible por lote y celda (saldo Aprobado − comprometido por reservas vivas) ──────────────────────────────────
interface CeldaLibre { posicionId: string; codigo: string; procedenciaId: string; libre: number }
export function celdasLibres(e: EstadoDemo, productoId: string, propietarioId: string): Map<string, CeldaLibre[]> {
  const d = desp(e)
  const pos = new Map(e.panorama.posiciones.map((p) => [p.id, p]))
  const porLote = new Map<string, CeldaLibre[]>()
  for (const s of e.panorama.saldos) {
    if (s.productoId !== productoId || s.propietarioId !== propietarioId || s.estado !== 'APROBADO' || s.cantidad <= 0) continue
    const p = pos.get(s.posicionId)
    if (!p || AREAS_DE_SALIDA.has(p.tipoArea)) continue
    const comprometido = comprometidoEn(e, s.posicionId, s.loteId, s.procedenciaId)
    const libre = s.cantidad - comprometido
    if (libre > 0) porLote.set(s.loteId, [...(porLote.get(s.loteId) ?? []), { posicionId: s.posicionId, codigo: p.codigo, procedenciaId: s.procedenciaId, libre }])
  }
  for (const celdas of porLote.values()) celdas.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  return porLote
}

/** Las Reservas de lote (se crea al primer uso). */
export const reservasLoteDe = (e: EstadoDemo) => (desp(e).reservasLote ??= [])
export const loteEnReserva = (e: EstadoDemo, loteId: string) => reservasLoteDe(e).some((r) => r.loteId === loteId && !r.quitadaEn)

export function lotesDisponibles(e: EstadoDemo, productoId: string, propietarioId: string): LoteDisponible[] {
  const lotes = new Map(e.panorama.lotes.map((l) => [l.id, l]))
  return [...celdasLibres(e, productoId, propietarioId)].map(([loteId, celdas]) => ({
    loteId, codigo: lotes.get(loteId)?.codigo ?? loteId, vence: lotes.get(loteId)?.vence ?? null, disponible: celdas.reduce((t, c) => t + c.libre, 0), bloqueado: loteEnReserva(e, loteId),
  }))
}

export function reservarEnLote(e: EstadoDemo, salida: SalidaDemo, linea: LineaSalidaDemo, loteId: string, cantidad: number) {
  const d = desp(e)
  let resto = cantidad
  for (const c of celdasLibres(e, linea.productoId, salida.propietarioId).get(loteId) ?? []) {
    if (resto <= 0) break
    const tomar = Math.min(c.libre, resto)
    d.reservas.push({ id: nuevoId(), lineaId: linea.id, salidaId: salida.id, productoId: linea.productoId, loteId, posicionId: c.posicionId, posicionOrigenId: c.posicionId, procedenciaId: c.procedenciaId, cantidad: tomar, estado: 'ACTIVA' })
    resto -= tomar
  }
}

export const devolucionesDe = (e: EstadoDemo) => (desp(e).devoluciones ??= [])
export const quiebresDe = (e: EstadoDemo) => (desp(e).quiebres ??= [])
/** ¿Hay lo picado por devolver sin verificar? (la etapa de la orden pasa a «Por devolver lo picado»). */
export const hayDevolucionPendiente = (e: EstadoDemo, salidaId: string) => devolucionesDe(e).some((d) => d.salidaId === salidaId && d.estado !== 'VERIFICADA')

/** Lo que existe de un producto del propietario, lote por lote: Aprobado (libre de lo comprometido) y Cuarentena. Lo que alimenta `explicarFaltante`. */
export function existenciasDe(e: EstadoDemo, productoId: string, propietarioId: string): ExistenciaLote[] {
  const out: ExistenciaLote[] = lotesDisponibles(e, productoId, propietarioId).map((l) => ({ loteId: l.loteId, codigo: l.codigo, vence: l.vence, estado: 'APROBADO' as const, cantidad: l.disponible, reservado: !!l.bloqueado }))
  const lotes = new Map(e.panorama.lotes.map((l) => [l.id, l]))
  const cuar = new Map<string, number>()
  for (const s of e.panorama.saldos) if (s.productoId === productoId && s.propietarioId === propietarioId && s.estado === 'CUARENTENA' && s.cantidad > 0) cuar.set(s.loteId, (cuar.get(s.loteId) ?? 0) + s.cantidad)
  for (const [loteId, cantidad] of cuar) out.push({ loteId, codigo: lotes.get(loteId)?.codigo ?? loteId, vence: lotes.get(loteId)?.vence ?? null, estado: 'CUARENTENA', cantidad })
  return out
}

/** Cuántas unidades de la línea ya están cubiertas por una reserva viva (activa, picada o en Despacho). */
export const reservadoDeLinea = (e: EstadoDemo, lineaId: string) => desp(e).reservas.filter((r) => r.lineaId === lineaId && (r.estado === 'ACTIVA' || r.estado === 'EN_TRANSITO' || r.estado === 'EN_STAGING')).reduce((t, r) => t + r.cantidad, 0)

/** Por qué falta, con cantidades (espejo de `wms._explicar_faltante`): sobre lo que todavía falta asignar de la línea. */
export function explicarLineaDemo(e: EstadoDemo, salida: SalidaDemo, linea: LineaSalidaDemo, pendiente?: number): ExplicacionFaltante {
  return explicarFaltante({ pedido: Math.max(1, pendiente ?? (linea.cantidad - reservadoDeLinea(e, linea.id))), hoy: e.panorama.hoy, existencias: existenciasDe(e, linea.productoId, salida.propietarioId) })
}

/** Escribe un quiebre de stock. Los de detección no se repiten si nada cambió desde el último de esa línea y causa (mismo criterio que la base). */
export function registrarQuiebreDemo(e: EstadoDemo, salida: SalidaDemo, linea: LineaSalidaDemo, q: { causa: CausaQuiebre; origen: 'DETECCION' | 'PEDIDOS'; pedido: number; faltante: number; cantidadCausa: number; detalle: Record<string, unknown>; por?: string }) {
  const lista = quiebresDe(e)
  if (q.origen === 'DETECCION') {
    const ultDecision = [...lista].reverse().find((x) => x.lineaId === linea.id && x.origen === 'PEDIDOS')
    if (lista.some((x) => x.lineaId === linea.id && x.causa === q.causa && x.origen === 'DETECCION' && x.cantidadPedida === q.pedido && x.cantidadCausa === q.cantidadCausa && (!ultDecision || x.en > ultDecision.en))) return
  }
  const fila = e.pedidos?.filas.find((f) => f.vigente && f.snapshot.pedidoId === salida.pedidoId)
  lista.push({
    id: nuevoId(), en: ahora(), origen: q.origen, causa: q.causa, salidaId: salida.id, salidaNumero: salida.numero, pedidoId: fila?.snapshot.pedidoId, pedidoNumero: fila?.snapshot.numero, lineaId: linea.id,
    productoId: linea.productoId, cantidadPedida: q.pedido, cantidadFaltante: q.faltante, cantidadCausa: q.cantidadCausa, vendedor: fila?.snapshot.vendedor, detalle: q.detalle, por: q.por ?? 'Sistema',
  })
}

const CAUSAS_ORDEN: CausaFaltante[] = ['CUARENTENA', 'RESERVA', 'VENCIMIENTO_MENOR_60', 'SIN_STOCK']
export function registrarQuiebresDeExplicacion(e: EstadoDemo, salida: SalidaDemo, linea: LineaSalidaDemo, x: ExplicacionFaltante) {
  for (const c of CAUSAS_ORDEN) if (x.causas[c] > 0) registrarQuiebreDemo(e, salida, linea, { causa: c, origen: 'DETECCION', pedido: x.pedido, faltante: x.faltan, cantidadCausa: x.causas[c], detalle: { pedido: x.pedido, disponibles: x.disponibles, faltan: x.faltan, causas: x.causas, existentes: x.existentes, hayFaltante: x.hayFaltante } })
}

/**
 * Asigna una línea por FEFO (distribución): solo lo que falta asignar (con reservas previas por un aumento del pedido; sin ellas, toda la cantidad). Todo o nada.
 * Sin stock: queda SIN_STOCK, se explica POR QUÉ falta (D-125), se registra el quiebre y se avisa al Jefe de Transporte; nunca falla.
 */
export function asignarLineaDemo(e: EstadoDemo, salida: SalidaDemo, linea: LineaSalidaDemo): string | null {
  const tipo = salida.tipo ?? 'DISTRIBUCION'
  const falta = linea.cantidad - reservadoDeLinea(e, linea.id)
  if (falta <= 0) {
    if (linea.estado === 'SIN_STOCK' || linea.estado === 'PENDIENTE') { linea.estado = 'ASIGNADA'; linea.nota = undefined }
    atenderAlertaStock(e, linea, 'La línea quedó asignada')
    return null
  }
  const r = asignarLinea({ tipo, motivo: salida.motivo ?? 'VENTA', cantidad: falta, hoy: e.panorama.hoy, lotes: lotesDisponibles(e, linea.productoId, salida.propietarioId), loteIndicadoId: linea.loteIndicadoId })
  if (!r.ok) {
    const x = explicarLineaDemo(e, salida, linea, falta)
    linea.estado = 'SIN_STOCK'; linea.nota = x.texto
    registrarQuiebresDeExplicacion(e, salida, linea, x)
    const prod = e.panorama.productos.find((p) => p.id === linea.productoId)
    // Mismo texto que la base (`wms._asignar_linea`). Una orden por cuenta de un cliente (tipo B) no alerta: quien la crea ya está frente a la pantalla (SA-2).
    const texto = `Salida ${salida.numero}, producto ${prod?.codigo ?? 'un producto'}: ${x.texto} Decide el vendedor del pedido, en Pedidos: quitar o reducir la línea, o cancelar el pedido. Copia el aviso para el vendedor en la orden.`
    if (tipo !== 'CLIENTE') {
      alertar(e, 'STOCK_INSUFICIENTE', 'jefe_transporte', texto, `stock:${linea.id}`, undefined, linea.productoId)
      const a = e.alertas.find((y) => y.estado === 'ABIERTA' && (y as { clave?: string }).clave === `stock:${linea.id}`)
      if (a) a.mensaje = texto
    }
    return x.texto
  }
  for (const a of r.asignaciones) reservarEnLote(e, salida, linea, a.loteId, a.cantidad)
  linea.fefo = r.asignaciones.map((a) => ({ loteId: a.loteId, cantidad: a.cantidad }))
  linea.estado = 'ASIGNADA'; linea.nota = undefined
  atenderAlertaStock(e, linea, 'La línea quedó asignada')
  return null
}

/** Cierra la alerta de falta de stock de una línea (se asignó, se quitó o se canceló la orden). */
export function atenderAlertaStock(e: EstadoDemo, linea: LineaSalidaDemo, nota: string) {
  const a = e.alertas.find((y) => y.estado === 'ABIERTA' && (y as { clave?: string }).clave === `stock:${linea.id}`)
  if (a) { a.estado = 'ATENDIDA'; a.atendidaEn = ahora(); a.nota = nota }
}

/**
 * La orden de un pedido de la bandeja (espejo de `wms._orden_del_pedido`): la que ya tiene; si no, la orden manual con ese número de pedido (se une, sin crear otra);
 * si no, una nueva con el stock asignado por FEFO. `desde` = BANDEJA (el botón) o RUTA (al armar la ruta).
 */
export function ordenDelPedido(e: EstadoDemo, pedidoId: string, actor: Actor, desde: 'BANDEJA' | 'RUTA'): SalidaDemo | string {
  const fila = e.pedidos?.filas.find((f) => f.vigente && f.snapshot.pedidoId === pedidoId)
  if (!fila) return 'No encontramos uno de los pedidos en la bandeja'
  const d = desp(e)
  const viva = fila.salida ? d.salidas.find((s) => s.numero === fila.salida && s.estado !== 'CANCELADA') : undefined
  if (viva) return viva
  const numero = normalizarNumeroPedido(fila.snapshot.numero)
  const manual = d.salidas.find((s) => s.origen === 'MANUAL' && s.estado !== 'CANCELADA' && normalizarNumeroPedido(s.pedidoNumero) === numero)
  if (manual) { unirOrdenManual(e, fila, manual); return manual }
  const otra = d.salidas.find((s) => s.estado !== 'CANCELADA' && normalizarNumeroPedido(s.pedidoNumero) === numero)
  if (otra) return `El pedido ${fila.snapshot.numero} ya tiene una Orden de Salida`
  const lineas: LineaSalidaDemo[] = []
  for (const l of fila.snapshot.lineas) {
    const prod = e.panorama.productos.find((p) => p.codigo.toUpperCase() === l.productoCodigo.toUpperCase())
    if (!prod) return `El pedido ${fila.snapshot.numero} trae un producto que el WMS no conoce (${l.productoCodigo}): Dirección Técnica debe darlo de alta`
    lineas.push({ id: nuevoId(), productoId: prod.id, cantidad: l.cantidad, pedidoLineaId: l.lineaId, estado: 'PENDIENTE', fefo: [] })
  }
  const salida: SalidaDemo = {
    id: nuevoId(), numero: numeroDe(e.inv, 'OS', e.panorama.hoy.slice(0, 4)), pedidoId, requiereEmbalaje: requiereEmbalaje(fila.snapshot.cliente.ubigeo), propietarioId: duenoDelAlmacen(e), estado: 'ABIERTA', lineas,
    creadaEn: ahora(), creadaPor: actor.id, tipo: 'DISTRIBUCION', motivo: 'VENTA', origen: 'PEDIDO', creadaDesde: desde, pedidoNumero: fila.snapshot.numero,
  }
  d.salidas.push(salida)
  for (const l of salida.lineas) asignarLineaDemo(e, salida, l)
  fila.salida = salida.numero
  return salida
}

export function liberarSalida(e: EstadoDemo, salidaId: string, motivo: string): string | null {
  const d = desp(e)
  const s = d.salidas.find((x) => x.id === salidaId)
  if (!s) return null
  if (d.reservas.some((r) => r.salidaId === salidaId && r.estado !== 'ACTIVA' && r.estado !== 'LIBERADA')) return 'Ya hay unidades pickeadas o en staging: se resuelve por conformidad y retorno, no se cancela'
  for (const r of d.reservas) if (r.salidaId === salidaId && r.estado === 'ACTIVA') r.estado = 'LIBERADA'
  for (const l of s.lineas) l.estado = 'CANCELADA'
  s.estado = 'CANCELADA'
  void motivo
  return null
}

export class DespachoDemo extends PedidosDemo implements RepositorioRutas {
  protected despacho(e: EstadoDemo): DespachoDemoEstado { return desp(e) }

  /** Personal, vehículos y una ruta ya confirmada para que la pantalla no arranque vacía. */
  protected async sembrarDespacho(e: EstadoDemo) {
    await this.asegurarSiembra(e)
    const d = desp(e)
    if (d.sembrado) return
    d.sembrado = true
    d.personal.push(
      { id: 'per-1', nombre: 'Luis Quispe', funcion: 'CONDUCTOR', activo: true, dni: '40123456', licencia: 'Q40123456' }, { id: 'per-2', nombre: 'Marco Huamán', funcion: 'CONDUCTOR', activo: true, dni: '41234567', licencia: 'Q41234567' },
      { id: 'per-3', nombre: 'Ana Ríos', funcion: 'AUXILIAR', activo: true }, { id: 'per-4', nombre: 'Pedro Soto', funcion: 'AUXILIAR', activo: true },
      { id: 'per-5', nombre: 'Raúl Díaz (de vacaciones)', funcion: 'CONDUCTOR', activo: false },
      // SB-A: los dos conductores reales de hoy (D-159). Hans: su documento de identidad está pendiente. Michele: datos de la guía GALAPHARMA TTT1-2887 (carné de extranjería).
      { id: 'per-6', nombre: 'Hans', funcion: 'CONDUCTOR', activo: true, licencia: 'Q75084250' },
      { id: 'per-7', nombre: 'Michele Yermain Mauriello Diaz', funcion: 'CONDUCTOR', activo: true, dni: '004780086', documentoTipo: 'CE', licencia: 'Q004780086' },
    )
    d.vehiculos.push(
      { id: 'veh-1', placa: 'BKW-757', descripcion: 'Camioneta cerrada', tipo: 'PROPIO', calificado: true, aptoCadenaFrio: false, capacidadBultos: 60, activo: true },
      { id: 'veh-2', placa: 'D4F-318', descripcion: 'Furgón con termo', tipo: 'PROPIO', calificado: true, aptoCadenaFrio: true, capacidadBultos: 90, activo: true },
      { id: 'veh-3', placa: 'AXL-204', descripcion: 'Moto furgón', tipo: 'PROPIO', calificado: false, aptoCadenaFrio: false, capacidadBultos: 20, activo: true },
      { id: 'veh-4', placa: 'T9K-551', descripcion: 'Camión (en taller)', tipo: 'EXTERNO', calificado: false, aptoCadenaFrio: false, activo: false },
      { id: 'veh-5', placa: 'BWO-902', descripcion: 'DFSK K05S', tipo: 'PROPIO', calificado: false, aptoCadenaFrio: false, activo: true },
    )
    // D-155: por ahora los documentos llevan a Michele, sea cual sea el conductor real de la ruta
    d.conductorEnDocumentos = { personaId: 'per-7' }
    // Una ruta de mañana ya planificada, con el pedido PED-DEMO-101 (así hay una salida y una ruta para ver)
    const sistema: Actor = { id: 'demo:jefe_transporte', nombre: 'Jefe de Transporte (demo)', roles: ['jefe_transporte'] }
    // SA-1: con WMS_DEMO_EJEMPLOS=vacio no hay ninguna salida (sirve para ver la pantalla vacía real)
    if (modoEjemplos() === 'vacio') return
    const creada = await this.crearRuta({ fecha: sumarDias(e.panorama.hoy, 1), vehiculoId: 'veh-1', conductorId: 'per-1', auxiliarId: 'per-3' }, sistema)
    if (creada.ok) {
      const plan = await this.planificarRuta(creada.id, { fecha: sumarDias(e.panorama.hoy, 1), vehiculoId: 'veh-1', conductorId: 'per-1', auxiliarId: 'per-3', paradas: [{ pedidoId: 'ped-demo-101' }] }, sistema)
      if (plan.ok) await this.confirmarRuta(creada.id, sistema)
    }
  }

  /** La bandeja muestra la salida de los pedidos que ya están en una ruta: se siembra el despacho antes de leerla. */
  async bandejaPedidos() { await this.sembrarDespacho(estadoE()); return super.bandejaPedidos() }

  // ── Vistas ────────────────────────────────────────────────────────────────────────────────────────────────────
  private vistaParada(e: EstadoDemo, p: ParadaDemo): ParadaVista {
    const d = desp(e)
    const s = d.salidas.find((x) => x.id === p.salidaId)
    const stock = !s ? 'PENDIENTE' : s.lineas.some((l) => l.estado === 'SIN_STOCK') ? 'SIN_STOCK' : 'ASIGNADA'
    const fila = p.pedidoId ? e.pedidos!.filas.find((f) => f.snapshot.pedidoId === p.pedidoId && f.vigente) : undefined
    if (!fila && s) {
      // parada por orden (SA-6): el destinatario sale de lo escrito en la orden
      const cm = s.clienteManual
      const lineas = s.lineas.filter((l) => l.estado !== 'CANCELADA')
      return {
        id: p.id, secuencia: p.secuencia, clave: claveDeParada(p), origen: 'ORDEN', salidaId: s.id, tipoOrden: s.tipo, pedidoNumero: s.pedidoNumero ?? s.numero, cliente: cm?.razonSocial ?? '', ruc: cm?.ruc,
        direccion: cm?.direccion, lineas: lineas.length, unidades: lineas.reduce((t, l) => t + l.cantidad, 0), salidaNumero: s.numero, stock, excepcionCorte: p.excepcionCorte, motivoExcepcion: p.motivoExcepcion,
      }
    }
    const f = fila!
    const c = f.snapshot.cliente
    return {
      id: p.id, secuencia: p.secuencia, clave: claveDeParada(p), origen: 'PEDIDO', pedidoId: f.snapshot.pedidoId, salidaId: s?.id, tipoOrden: s?.tipo, pedidoNumero: f.snapshot.numero, cliente: c.nombre, ruc: c.ruc, direccion: c.direccion, distrito: c.distrito,
      ventanaCita: c.ventanaCita, lineas: f.snapshot.lineas.length, unidades: f.snapshot.lineas.reduce((t, l) => t + l.cantidad, 0),
      salidaNumero: s?.numero, stock, excepcionCorte: p.excepcionCorte, motivoExcepcion: p.motivoExcepcion,
    }
  }

  protected vistaRuta(e: EstadoDemo, r: RutaDemo): RutaVista {
    const d = desp(e)
    const paradas = r.paradas.filter((p) => p.activa).sort((a, b) => a.secuencia - b.secuencia).map((p) => this.vistaParada(e, p))
    return {
      id: r.id, numero: r.numero, fecha: r.fecha, estado: r.estado, version: r.version,
      vehiculo: d.vehiculos.find((v) => v.id === r.vehiculoId), conductor: d.personal.find((p) => p.id === r.conductorId), auxiliar: d.personal.find((p) => p.id === r.auxiliarId),
      paradas, versiones: [...r.versiones].sort((a, b) => b.version - a.version), registroLsFr: r.registroLsFr, motivoCancelacion: r.motivoCancelacion,
      creadaPor: r.creadaPor, creadaEn: r.creadaEn, confirmadaEn: r.confirmadaEn, unidades: totalUnidades(paradas),
    }
  }

  private pedidosPlanificables(e: EstadoDemo): PedidoPlanificable[] {
    const d = desp(e)
    const enRuta = new Map<string, string>()
    for (const r of d.rutas.filter((x) => x.estado !== 'CANCELADA' && x.estado !== 'CERRADA')) for (const p of r.paradas.filter((x) => x.activa)) if (p.pedidoId) enRuta.set(p.pedidoId, r.numero)
    const codigos = new Set(e.panorama.productos.map((p) => p.codigo.toUpperCase()))
    return e.pedidos!.filas.filter((f) => f.vigente).map((f) => ({
      pedidoId: f.snapshot.pedidoId, numero: f.snapshot.numero, cliente: f.snapshot.cliente.nombre, ruc: f.snapshot.cliente.ruc, direccion: f.snapshot.cliente.direccion,
      distrito: f.snapshot.cliente.distrito, ventanaCita: f.snapshot.cliente.ventanaCita,
      lineas: f.snapshot.lineas.length, unidades: f.snapshot.lineas.reduce((t, l) => t + l.cantidad, 0), importadoEn: f.importadoEn,
      enRuta: enRuta.get(f.snapshot.pedidoId), cambioPorRevisar: f.cambioPendiente,
      sinCatalogo: f.snapshot.lineas.filter((l) => !codigos.has(l.productoCodigo.toUpperCase())).map((l) => l.productoCodigo),
    }))
  }

  /** SA-6: órdenes manuales (A sin pedido en la bandeja, muestra y devolución al proveedor) abiertas y que todavía no están en una ruta viva. */
  private ordenesPlanificables(e: EstadoDemo): OrdenPlanificable[] {
    const d = desp(e)
    const enRuta = new Map<string, string>()
    for (const r of d.rutas.filter((x) => x.estado !== 'CANCELADA' && x.estado !== 'CERRADA')) for (const p of r.paradas.filter((x) => x.activa)) if (p.salidaId) enRuta.set(p.salidaId, r.numero)
    return d.salidas
      .filter((s) => s.origen === 'MANUAL' && s.estado === 'ABIERTA' && (s.tipo ?? 'DISTRIBUCION') !== 'CLIENTE' && !!s.clienteManual && !e.pedidos?.filas.some((f) => f.vigente && f.salida === s.numero))
      .map((s): OrdenPlanificable => {
        const lineas = s.lineas.filter((l) => l.estado !== 'CANCELADA')
        const cm = s.clienteManual!
        return {
          salidaId: s.id, clave: claveDeOrden(s.id), numero: s.numero, tipo: s.tipo ?? 'DISTRIBUCION', pedidoNumero: s.pedidoNumero, cliente: cm.razonSocial, ruc: cm.ruc, direccion: cm.direccion,
          lineas: lineas.length, unidades: lineas.reduce((t, l) => t + l.cantidad, 0), creadaEn: s.creadaEn, enRuta: enRuta.get(s.id), sinStock: lineas.some((l) => l.estado === 'SIN_STOCK' || l.estado === 'PENDIENTE'),
        }
      })
  }

  async panoramaRutas(): Promise<PanoramaRutas> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const d = desp(e)
    return structuredClone({
      hoy: e.panorama.hoy, corte: d.corte, rutas: [...d.rutas].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero)).map((r) => this.vistaRuta(e, r)),
      vehiculos: d.vehiculos, personal: d.personal, pedidos: this.pedidosPlanificables(e), ordenes: this.ordenesPlanificables(e),
      conductorEnDocumentos: this.vistaConductorEnDocumentos(e),
    })
  }

  async obtenerRuta(id: string): Promise<RutaVista | null> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const r = desp(e).rutas.find((x) => x.id === id)
    return r ? structuredClone(this.vistaRuta(e, r)) : null
  }

  /** Lo que las etapas siguientes registran y el formato pide (guías, bultos, horas). Las clases de más abajo lo completan. */
  protected extrasLsFr(e: EstadoDemo, r: RutaDemo): ExtrasLsFr {
    // D-155: con el interruptor activo, el formato nombra a quien figura en documentos (el conductor real se guarda aparte)
    return desp(e).conductorEnDocumentos ? { conductorEnDocumentos: this.quienFigura(e, r.conductorId).figura?.nombre } : {}
  }

  /** D-155: a quién nombran los documentos de una ruta y quién es el conductor real. */
  protected quienFigura(e: EstadoDemo, conductorRealId: string | undefined): QuienFigura {
    const d = desp(e)
    return quienFiguraEnDocumentos(d.personal.find((p) => p.id === conductorRealId), d.conductorEnDocumentos, d.personal)
  }

  private vistaConductorEnDocumentos(e: EstadoDemo): ConductorEnDocumentos | undefined {
    const d = desp(e)
    const c = d.conductorEnDocumentos
    if (!c) return undefined
    return { personaId: c.personaId, nombre: d.personal.find((p) => p.id === c.personaId)?.nombre, cambio: c.cambio }
  }

  async registroLsFr(rutaId: string): Promise<RegistroLsFrVista | null> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const r = desp(e).rutas.find((x) => x.id === rutaId)
    if (!r) return null
    const vista = this.vistaRuta(e, r)
    if (!puedeImprimirLsFr(vista)) return null
    return structuredClone(armarRegistroLsFr(vista, { ...PARAMETROS_LS_FR_POR_DEFECTO, pendientes: Object.keys(PENDIENTES_LS_FR) }, this.extrasLsFr(e, r)))
  }

  // ── Acciones ──────────────────────────────────────────────────────────────────────────────────────────────────
  private sinPermiso(actor: Actor) { return puedePlanificarRutas(actor.roles) ? null : 'No tienes permiso para planificar rutas' }

  async crearRuta(datos: { fecha: string; vehiculoId?: string; conductorId?: string; auxiliarId?: string }, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const no = this.sinPermiso(actor); if (no) return falla(no)
    if (!datos.fecha) return falla('Indica la fecha de la ruta', { fecha: 'Indica la fecha.' })
    if (datos.fecha < e.panorama.hoy) return falla('La fecha de la ruta no puede ser anterior a hoy', { fecha: 'No puede ser anterior a hoy.' })
    const d = desp(e)
    const r: RutaDemo = {
      id: nuevoId(), numero: numeroDe(e.inv, 'RUT', datos.fecha.slice(0, 4)), fecha: datos.fecha, estado: 'BORRADOR', version: 1, vehiculoId: datos.vehiculoId, conductorId: datos.conductorId,
      auxiliarId: datos.auxiliarId, paradas: [], versiones: [{ version: 1, en: ahora(), por: actor.nombre, motivo: 'Ruta creada', paradas: 0 }], creadaPor: actor.nombre, creadaEn: ahora(),
    }
    d.rutas.push(r)
    registrar(e, actor, 'ruta_creada', 'rutas', r.numero, `Ruta creada para el ${r.fecha}`)
    return { ok: true, id: r.id, numero: r.numero }
  }


  async planificarRuta(id: string, plan: PlanRuta, actor: Actor): Promise<ResultadoAccion<{ version: number; bloqueadosPorStock: string[] }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const no = this.sinPermiso(actor); if (no) return falla(no)
    const d = desp(e)
    const r = d.rutas.find((x) => x.id === id)
    if (!r) return falla('No encontramos esa ruta')
    if (!RUTA_EDITABLE.includes(r.estado)) return falla(`La ruta ya no se puede cambiar (está ${r.estado.toLowerCase().replace(/_/g, ' ')})`)
    const motivo = plan.motivo?.trim()
    if (r.estado === 'PLANIFICADA' && !motivo) return falla('La ruta ya estaba planificada: indica por qué cambia', { motivo: 'Indica por qué cambia.' })
    const vehiculo = plan.vehiculoId ? d.vehiculos.find((v) => v.id === plan.vehiculoId) : undefined
    if (plan.vehiculoId && !vehiculo) return falla('No encontramos ese vehículo')
    const conductor = plan.conductorId ? d.personal.find((p) => p.id === plan.conductorId && p.funcion === 'CONDUCTOR' && p.activo) : undefined
    if (plan.conductorId && !conductor) return falla('El conductor elegido no está disponible')
    const auxiliar = plan.auxiliarId ? d.personal.find((p) => p.id === plan.auxiliarId && p.funcion === 'AUXILIAR' && p.activo) : undefined
    if (plan.auxiliarId && !auxiliar) return falla('El auxiliar elegido no está disponible')
    const otra = d.rutas.filter((x) => x.id !== id && x.fecha === plan.fecha && x.estado !== 'CERRADA' && x.estado !== 'CANCELADA')
    if (plan.vehiculoId && otra.some((x) => x.vehiculoId === plan.vehiculoId)) return falla('El vehículo ya está en otra ruta de ese día')
    if (plan.conductorId && otra.some((x) => x.conductorId === plan.conductorId || x.auxiliarId === plan.conductorId)) return falla('El conductor ya está en otra ruta de ese día')
    if (plan.auxiliarId && otra.some((x) => x.conductorId === plan.auxiliarId || x.auxiliarId === plan.auxiliarId)) return falla('El auxiliar ya está en otra ruta de ese día')

    // Una orden manual que ya tiene su pedido en la bandeja se planifica como pedido (la parada usa los datos del pedido ya conciliado)
    const paradasPlan: PlanParada[] = plan.paradas.map((pp) => {
      if (pp.pedidoId || !pp.salidaId) return pp
      const s = d.salidas.find((x) => x.id === pp.salidaId)
      const fila = s ? e.pedidos!.filas.find((f) => f.vigente && f.salida === s.numero) : undefined
      return fila ? { ...pp, pedidoId: fila.snapshot.pedidoId } : pp
    })
    const planNormal: PlanRuta = { ...plan, paradas: paradasPlan }
    const planificables = new Map(this.pedidosPlanificables(e).map((p) => [p.pedidoId, p]))
    const ordenes = new Map(this.ordenesPlanificables(e).map((o) => [o.clave, o]))
    const esDeEstaRuta = (x: ParadaDemo) => r.paradas.some((y) => y.activa && claveDeParada(y) === claveDeParada(x))
    const enOtraRuta = new Map([...planificables].filter(([, p]) => p.enRuta && !r.paradas.some((x) => x.activa && x.pedidoId === p.pedidoId)).map(([k, p]) => [k, p.enRuta!]))
    void esDeEstaRuta
    const ordenesEnOtraRuta = new Map([...ordenes].filter(([, o]) => o.enRuta && !r.paradas.some((x) => x.activa && x.salidaId === o.salidaId)).map(([k, o]) => [k, o.enRuta!]))
    // una orden que no es manual (nace de un pedido de la bandeja) o que ya no está abierta no se planifica por orden
    for (const pp of paradasPlan) {
      if (pp.pedidoId || !pp.salidaId) continue
      const s = d.salidas.find((x) => x.id === pp.salidaId)
      if (!s) return falla('No encontramos una de las órdenes')
      if (s.estado !== 'ABIERTA') return falla(`La orden ${s.numero} ya no está abierta (está ${s.estado.toLowerCase()})`)
      if (s.tipo === 'CLIENTE') return falla(`La orden ${s.numero} es por cuenta de un cliente de almacenamiento: no va en una ruta de Logisalud, se entrega al transportista del cliente`)
      if (s.origen !== 'MANUAL') return falla(`La orden ${s.numero} nace de un pedido de la bandeja: agrégala a la ruta desde «Pedidos por despachar»`)
    }
    const errores = validarPlan({ hoy: e.panorama.hoy, corte: d.corte, plan: planNormal, vehiculo, pedidos: planificables, enOtraRuta, ordenes, ordenesEnOtraRuta })
    if (errores.length) return falla(errores[0], { plan: errores.join(' ') })

    // Las paradas que salen del plan: la orden se libera solo si nació en esta ruta (y tiene pedido); una orden manual o de la bandeja sigue viva, solo se libera la parada
    const quedan = new Set(paradasPlan.map((p) => clavePlanParada(p)))
    const salidasQuedan = new Set(paradasPlan.map((p) => p.salidaId).filter(Boolean))
    for (const p of r.paradas.filter((x) => x.activa && !quedan.has(claveDeParada(x)) && !(x.salidaId && salidasQuedan.has(x.salidaId)))) {
      const nacioAqui = (d.salidas.find((x) => x.id === p.salidaId)?.creadaDesde ?? 'RUTA') === 'RUTA'
      if (p.salidaId && p.pedidoId && nacioAqui) {
        const m = liberarSalida(e, p.salidaId, motivo ?? 'El pedido salió de la ruta'); if (m) return falla(m)
        const fila = e.pedidos!.filas.find((f) => f.vigente && f.snapshot.pedidoId === p.pedidoId); if (fila) fila.salida = undefined
      }
      p.activa = false
    }
    const previas = new Map(r.paradas.filter((x) => x.activa).flatMap((x) => [[claveDeParada(x), x] as const, ...(x.salidaId ? [[claveDeOrden(x.salidaId), x] as const] : [])]))
    for (const p of r.paradas) p.activa = false
    const nuevas: ParadaDemo[] = []
    const bloqueados: string[] = []
    for (const [i, pp] of paradasPlan.entries()) {
      if (pp.pedidoId) {
        const fila = e.pedidos!.filas.find((f) => f.vigente && f.snapshot.pedidoId === pp.pedidoId)!
        let salidaId = previas.get(pp.pedidoId)?.salidaId ?? (pp.salidaId)
        if (!salidaId) {
          const s = ordenDelPedido(e, pp.pedidoId, actor, 'RUTA')
          if (typeof s === 'string') return falla(s)
          salidaId = s.id; fila.salida = s.numero
        }
        const salida = d.salidas.find((x) => x.id === salidaId)!
        if (salida.lineas.some((l) => l.estado === 'SIN_STOCK')) bloqueados.push(fila.snapshot.numero)
        nuevas.push({ id: nuevoId(), secuencia: i + 1, pedidoId: pp.pedidoId, salidaId, excepcionCorte: !!pp.excepcionCorte, motivoExcepcion: pp.excepcionCorte ? pp.motivoExcepcion?.trim() : undefined, activa: true })
      } else {
        const salida = d.salidas.find((x) => x.id === pp.salidaId)!
        if (salida.lineas.some((l) => l.estado === 'SIN_STOCK' || l.estado === 'PENDIENTE')) bloqueados.push(salida.pedidoNumero ?? salida.numero)
        nuevas.push({ id: nuevoId(), secuencia: i + 1, salidaId: salida.id, excepcionCorte: !!pp.excepcionCorte, motivoExcepcion: pp.excepcionCorte ? pp.motivoExcepcion?.trim() : undefined, activa: true })
      }
    }
    r.paradas.push(...nuevas)
    r.fecha = plan.fecha; r.vehiculoId = plan.vehiculoId; r.conductorId = plan.conductorId; r.auxiliarId = plan.auxiliarId; r.version += 1
    r.versiones.push({ version: r.version, en: ahora(), por: actor.nombre, motivo: motivo || 'Plan guardado', paradas: nuevas.length })
    registrar(e, actor, 'ruta_planificada', 'rutas', r.numero, `Plan guardado (versión ${r.version}, ${nuevas.length} paradas)`, motivo)
    return { ok: true, version: r.version, bloqueadosPorStock: bloqueados }
  }

  async confirmarRuta(id: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const no = this.sinPermiso(actor); if (no) return falla(no)
    const d = desp(e)
    const r = d.rutas.find((x) => x.id === id)
    if (!r) return falla('No encontramos esa ruta')
    if (r.estado !== 'BORRADOR') return falla('La ruta ya está confirmada o cerrada')
    if (!r.vehiculoId) return falla('Elige el vehículo')
    if (!r.conductorId) return falla('Elige el conductor')
    const vivas = r.paradas.filter((p) => p.activa)
    if (!vivas.length) return falla('La ruta no tiene pedidos')
    const sin = vivas.filter((p) => d.salidas.find((s) => s.id === p.salidaId)?.lineas.some((l) => l.estado === 'SIN_STOCK')).map((p) => (p.pedidoId ? e.pedidos!.filas.find((f) => f.snapshot.pedidoId === p.pedidoId && f.vigente)?.snapshot.numero : undefined) ?? d.salidas.find((s) => s.id === p.salidaId)?.pedidoNumero ?? d.salidas.find((s) => s.id === p.salidaId)!.numero)
    if (sin.length) return falla(`Estos pedidos no tienen stock suficiente: ${sin.join(', ')}. Quítalos de la ruta o espera el ingreso de stock`)
    r.estado = 'PLANIFICADA'; r.confirmadaEn = ahora(); r.registroLsFr = 'BASE'
    registrar(e, actor, 'ruta_confirmada', 'rutas', r.numero, 'Ruta confirmada: nace el registro LS-FR.43.03')
    return { ok: true }
  }

  async cancelarRuta(id: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const no = this.sinPermiso(actor); if (no) return falla(no)
    if (!motivo?.trim()) return falla('La cancelación necesita un motivo', { motivo: 'Escribe el motivo.' })
    const d = desp(e)
    const r = d.rutas.find((x) => x.id === id)
    if (!r) return falla('No encontramos esa ruta')
    if (!RUTA_EDITABLE.includes(r.estado)) return falla('La ruta ya está en ejecución: no se cancela desde aquí')
    for (const p of r.paradas.filter((x) => x.activa)) {
      if (p.salidaId && (d.salidas.find((x) => x.id === p.salidaId)?.creadaDesde ?? 'RUTA') === 'RUTA') {
        const m = liberarSalida(e, p.salidaId, motivo); if (m) return falla(m)
        const fila = e.pedidos!.filas.find((f) => f.vigente && f.snapshot.pedidoId === p.pedidoId); if (fila) fila.salida = undefined
      }
      p.activa = false
    }
    r.estado = 'CANCELADA'; r.motivoCancelacion = motivo.trim(); r.version += 1
    r.versiones.push({ version: r.version, en: ahora(), por: actor.nombre, motivo: `Ruta cancelada: ${motivo.trim()}`, paradas: 0 })
    registrar(e, actor, 'ruta_cancelada', 'rutas', r.numero, 'Ruta cancelada', motivo)
    return { ok: true }
  }

  async guardarPersonal(p: { id?: string; nombre: string; funcion: PersonalTransporte['funcion']; activo: boolean }, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedePlanificarRutas(actor.roles)) return falla('No tienes permiso para administrar el personal de transporte')
    const nombre = p.nombre.trim()
    if (!nombre) return falla('Escribe el nombre', { nombre: 'Escribe el nombre.' })
    const d = desp(e)
    if (d.personal.some((x) => x.id !== p.id && x.funcion === p.funcion && x.nombre.toLowerCase() === nombre.toLowerCase())) return falla(`Ya existe ${nombre}`, { nombre: 'Ya existe.' })
    const previo = p.id ? d.personal.find((x) => x.id === p.id) : undefined
    if (p.id && !previo) return falla('No encontramos a esa persona')
    const id = previo?.id ?? nuevoId()
    if (previo) Object.assign(previo, { nombre, funcion: p.funcion, activo: p.activo }); else d.personal.push({ id, nombre, funcion: p.funcion, activo: p.activo })
    registrar(e, actor, 'personal_transporte_guardado', 'personal_transporte', id, nombre)
    return { ok: true, id }
  }

  async cambiarConductorEnDocumentos(personaId: string | null, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedePlanificarRutas(actor.roles)) return falla('No tienes permiso para cambiar el conductor que figura en los documentos')
    const d = desp(e)
    if (!d.conductorEnDocumentos) return falla('Esta opción ya no existe: los documentos llevan al conductor real de la ruta')
    const m = motivo.trim()
    if (!m) return falla('Cuenta por qué cambia el conductor que figura en los documentos', { motivo: 'Escribe el motivo.' })
    const persona = personaId ? d.personal.find((p) => p.id === personaId) : undefined
    if (personaId && (!persona || persona.funcion !== 'CONDUCTOR' || !persona.activo)) return falla('Elige un conductor disponible')
    const antes = d.personal.find((p) => p.id === d.conductorEnDocumentos!.personaId)?.nombre
    d.conductorEnDocumentos = { personaId: persona?.id, cambio: `Lo cambió ${actor.nombre} el ${ahora().slice(0, 10).split('-').reverse().join('/')}: ${m}` }
    registrar(e, actor, 'conductor_en_documentos_cambiado', 'parametros', 'conductor_en_documentos', `De ${antes ?? 'el conductor real'} a ${persona?.nombre ?? 'el conductor real de cada ruta'}`, m)
    return { ok: true }
  }

  async guardarDocumentosPersonal(p: { id: string; documentoTipo: DocumentoTipo; dni: string; licencia?: string }, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedePlanificarRutas(actor.roles)) return falla('No tienes permiso para administrar el personal de transporte')
    const previo = desp(e).personal.find((x) => x.id === p.id)
    if (!previo) return falla('No encontramos a esa persona')
    const dni = p.dni.trim().toUpperCase(); const lic = (p.licencia ?? '').trim().toUpperCase()
    const malo = errorDocumentoPersonal(p.documentoTipo, dni, lic)
    if (malo) return falla(malo.mensaje, malo.errores)
    Object.assign(previo, { documentoTipo: p.documentoTipo, dni: dni || undefined, licencia: lic || undefined })
    registrar(e, actor, 'personal_documentos_guardados', 'personal_transporte', previo.id, previo.nombre)
    return { ok: true }
  }

  async guardarVehiculo(v: Pick<VehiculoVista, 'placa' | 'descripcion' | 'tipo' | 'calificado' | 'aptoCadenaFrio' | 'activo'> & { id?: string }, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedePlanificarRutas(actor.roles)) return falla('No tienes permiso para administrar los vehículos')
    const placa = v.placa.trim().toUpperCase()
    if (!/^[A-Z0-9]{3}-?[A-Z0-9]{3}$/.test(placa)) return falla('La placa no parece válida (por ejemplo ABC-123)', { placa: 'Escribe la placa, por ejemplo ABC-123.' })
    const d = desp(e)
    if (d.vehiculos.some((x) => x.id !== v.id && x.placa.toUpperCase() === placa)) return falla(`Ya existe un vehículo con la placa ${placa}`, { placa: 'Ya existe.' })
    const previo = v.id ? d.vehiculos.find((x) => x.id === v.id) : undefined
    if (v.id && !previo) return falla('No encontramos ese vehículo')
    const id = previo?.id ?? nuevoId()
    const datos = { placa, descripcion: v.descripcion?.trim() || undefined, tipo: v.tipo, calificado: v.calificado, aptoCadenaFrio: v.aptoCadenaFrio, activo: v.activo }
    if (previo) Object.assign(previo, datos); else d.vehiculos.push({ id, ...datos })
    registrar(e, actor, 'vehiculo_guardado', 'vehiculos', id, placa)
    return { ok: true, id }
  }
}
