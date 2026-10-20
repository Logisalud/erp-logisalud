// SA-3 en memoria (modo demostración): la versión nueva del pedido actualiza sola la Orden de Salida, el pedido cancelado la cancela y libera todo, y con el picking ya
// iniciado lo picado se devuelve a su ubicación con un movimiento verificado antes de seguir o cerrar. Mismas reglas que la migración 0029 (`wms._aplicar_cambio_pedido`).
import { repartirLiberacion, textoAlertaCambio, type CambioLinea, type ResumenAplicacion } from '@/domain/cambio-pedido'
import { avisoParaVendedor } from '@/domain/aviso-vendedor'
import { etapaDeSalida, type DevolucionPickingVista, type SalidaResumen, type SalidaVista } from '@/domain/despacho'
import type { FaltanteLineaVista } from '@/domain/faltante'
import { ESTADO_PEDIDO_CANCELADO, type PedidoSnapshot } from '@/domain/pedidos-despacho'
import { puedeEjecutarMovimiento, type LineaOrdenMovimiento, type OrdenMovimiento } from '@/domain/inventario'
import { puedeVerificar } from '@/domain/verificacion'
import type { EstadoDemo } from './estado'
import { registrar } from './estado'
import { alertar, ahora, estadoE, falla, nuevoId } from './entradas-demo'
import {
  asignarLineaDemo, atenderAlertaStock, desp, devolucionesDe, explicarLineaDemo, hayDevolucionPendiente, quiebresDe, registrarQuiebreDemo, reservadoDeLinea,
  type DevolucionDemo, type LineaSalidaDemo, type SalidaDemo,
} from './despacho-demo'
import { numeroDe } from './libro'
import { pk, PickingDemo, type OrdenLineaDemo } from './picking-demo'
import type { CambioSimulado, QuiebreStockVista, RepositorioCambioPedido } from '../repositorio-cambio-pedido'
import { registrarAplicarAlUnir } from './pedidos-demo'
import { FuenteDemo, simularCambio } from '../pedidos/fuente-demo'
import { puedeActualizarBandeja } from '@/domain/pedidos-despacho'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { ResumenImportacion } from '@/domain/pedidos-despacho'

type FilaPedido = NonNullable<EstadoDemo['pedidos']>['filas'][number]

const lote = (e: EstadoDemo, id: string) => e.panorama.lotes.find((l) => l.id === id)
const posicion = (e: EstadoDemo, id: string) => e.panorama.posiciones.find((p) => p.id === id)
const producto = (e: EstadoDemo, id: string) => e.panorama.productos.find((p) => p.id === id)
const salidaDe = (e: EstadoDemo, id: string) => desp(e).salidas.find((s) => s.id === id)

/** ¿La Orden de Salida de este pedido? La que lo tomó (por su id) o, en una orden manual de venta, la que lo referencia (`pedidoId`) o por su número. */
export function salidaDePedido(e: EstadoDemo, pedidoId: string): SalidaDemo | undefined {
  const vivas = desp(e).salidas.filter((s) => s.pedidoId === pedidoId)
  return vivas.find((s) => s.estado !== 'CANCELADA') ?? vivas[vivas.length - 1]
}

/** Una línea de la hoja de picking que ya no cuenta: queda en cero (como la que la conformidad no encontró). */
function anularLineaDePicking(e: EstadoDemo, reservaId: string) {
  for (const o of pk(e).ordenes) for (const l of o.lineas) if (l.reservaId === reservaId && l.cantidad > 0) {
    l.cantidad = 0; l.picking = 'PICKEADA'; l.pickeadaEn ??= ahora(); l.conformidad = 'CONFORME'; l.verificadaEn ??= ahora()
  }
}
const ordenLineaDe = (e: EstadoDemo, reservaId: string): OrdenLineaDemo | undefined => {
  for (const o of pk(e).ordenes) { const l = o.lineas.find((x) => x.reservaId === reservaId && x.cantidad > 0); if (l) return l }
  return undefined
}
const ordenViva = (e: EstadoDemo, salidaId: string) => pk(e).ordenes.find((o) => o.salidaId === salidaId && o.estado !== 'CANCELADA')

/**
 * Suelta `unidades` de una línea (null = todas): lo que nadie picó vuelve al stock libre; lo picado o en Despacho se parte si hace falta y queda «por devolver».
 * Espejo de `wms._soltar_linea` y de `repartirLiberacion`.
 */
export function soltarLineaDemo(e: EstadoDemo, l: LineaSalidaDemo, unidades: number | null, causa: DevolucionDemo['causa'], version: number | undefined): { liberadas: number; porDevolver: number } {
  const d = desp(e)
  const pendientes = new Set(devolucionesDe(e).filter((x) => x.estado !== 'VERIFICADA').map((x) => x.reservaId))
  const vivas = d.reservas.filter((r) => r.lineaId === l.id && (r.estado === 'ACTIVA' || r.estado === 'EN_TRANSITO' || r.estado === 'EN_STAGING') && !pendientes.has(r.id))
  const partes = repartirLiberacion(vivas.map((r) => ({ id: r.id, vence: lote(e, r.loteId)?.vence ?? null, cantidad: r.cantidad, estado: r.estado as 'ACTIVA' | 'EN_TRANSITO' | 'EN_STAGING' })), unidades ?? Number.POSITIVE_INFINITY)
  let liberadas = 0, porDevolver = 0
  for (const p of partes) {
    const r = d.reservas.find((x) => x.id === p.reservaId)!
    if (r.estado === 'ACTIVA') {
      if (p.completa) { r.estado = 'LIBERADA'; anularLineaDePicking(e, r.id) }
      else { r.cantidad -= p.cantidad; const ol = ordenLineaDe(e, r.id); if (ol) ol.cantidad -= p.cantidad }
      liberadas += p.cantidad
      continue
    }
    let objetivo = r
    if (!p.completa) {
      r.cantidad -= p.cantidad
      objetivo = { ...r, id: nuevoId(), cantidad: p.cantidad }
      d.reservas.push(objetivo)
      const ol = ordenLineaDe(e, r.id)
      if (ol) {
        ol.cantidad -= p.cantidad
        const o = pk(e).ordenes.find((x) => x.lineas.includes(ol))!
        o.lineas.push({ ...ol, id: nuevoId(), reservaId: objetivo.id, cantidad: p.cantidad })
      }
    }
    devolucionesDe(e).push({
      id: nuevoId(), salidaId: r.salidaId, lineaId: l.id, reservaId: objetivo.id, cantidad: p.cantidad, estadoReserva: r.estado as 'EN_TRANSITO' | 'EN_STAGING',
      desdePosicionId: r.posicionId, hastaPosicionId: r.posicionOrigenId, causa, pedidoVersion: version, estado: 'POR_DEVOLVER', creadaEn: ahora(),
    })
    porDevolver += p.cantidad
  }
  return { liberadas, porDevolver }
}

/** La orden se cancela por completo: libera lo que quedaba activo, cierra la hoja y las líneas, y saca la parada de la ruta si todavía se puede editar. */
export function cancelarSalidaPorPedido(e: EstadoDemo, s: SalidaDemo, motivo: string, actor: Actor | null) {
  const d = desp(e)
  for (const r of d.reservas) if (r.salidaId === s.id && r.estado === 'ACTIVA') r.estado = 'LIBERADA'
  for (const o of pk(e).ordenes) if (o.salidaId === s.id && o.estado !== 'CANCELADA') o.estado = 'CANCELADA'
  for (const l of s.lineas) { atenderAlertaStock(e, l, 'La orden se canceló'); l.estado = 'CANCELADA'; l.cantidadNueva = undefined }
  s.estado = 'CANCELADA'; s.motivoCancelacion = motivo; s.canceladaEn = ahora(); s.cancelacionPendiente = false
  for (const r of d.rutas) if (r.estado === 'BORRADOR' || r.estado === 'PLANIFICADA') for (const p of r.paradas) if (p.salidaId === s.id && p.activa) p.activa = false
  if (actor) registrar(e, actor, 'salida_cancelada_por_pedido', 'salidas', s.numero, `Orden ${s.numero} cancelada`, motivo)
}

/** Si la hoja de picking ya existe, las reservas nuevas de la línea entran a ella. */
function engancharAOrden(e: EstadoDemo, s: SalidaDemo, l: LineaSalidaDemo): void {
  const o = ordenViva(e, s.id)
  if (!o) return
  const yaEnHoja = new Set(o.lineas.map((x) => x.reservaId))
  let n = 0
  for (const r of desp(e).reservas.filter((x) => x.lineaId === l.id && x.estado === 'ACTIVA' && !yaEnHoja.has(x.id))) {
    o.lineas.push({ id: nuevoId(), lineaId: l.id, reservaId: r.id, posicionId: r.posicionId, productoId: r.productoId, loteId: r.loteId, cantidad: r.cantidad, picking: 'PENDIENTE', conformidad: 'PENDIENTE' })
    n += 1
  }
  if (l.estado === 'ASIGNADA') l.estado = 'EN_PICKING'
  if (n > 0 && o.estado === 'COMPLETA') o.estado = 'EN_CURSO'
}

export interface ResultadoCambioDemo { aplicado: boolean; texto?: string; liberadas?: number; porDevolver?: number; yaNoFalta?: number; conFalta?: number }

/**
 * Aplica una versión nueva (o la cancelación) del pedido a su Orden de Salida. `anterior` es el snapshot de la versión anterior (null si no la hay).
 * Quitada → se cancela y libera; reducida → libera lo que sobra (primero lo que vence después); agregada o aumentada → se asigna por FEFO; se recalcula la falta de stock.
 * Nunca hay pendientes: lo quitado se cancela.
 */
export function aplicarCambioPedidoDemo(e: EstadoDemo, s: SalidaDemo, fila: FilaPedido, anterior: PedidoSnapshot | null, actor: Actor): ResultadoCambioDemo {
  const nuevo = fila.snapshot
  const cancel = nuevo.estado === ESTADO_PEDIDO_CANCELADO
  const clave = `pedido-cambiado:${nuevo.pedidoId}:${nuevo.version}`
  if (s.estado !== 'ABIERTA') {
    if (s.estado === 'CONFIRMADA') {
      const texto = cancel
        ? textoAlertaCambio({ numeroPedido: nuevo.numero, cambios: [], liberadas: 0, porDevolver: 0, yaNoFalta: 0, conFalta: 0, cancelado: { motivo: nuevo.motivoCancelacion ?? '' }, yaSalio: true })
        : `El pedido ${nuevo.numero} cambió en Pedidos, pero su orden ${s.numero} ya salió: coordina el cambio con el transportista.`
      alertar(e, cancel ? 'PEDIDO_CANCELADO' : 'PEDIDO_CAMBIADO', 'jefe_transporte', texto, clave)
    }
    return { aplicado: false }
  }
  const tieneLineas = s.lineas.some((l) => l.estado !== 'CANCELADA')
  const hoja = !!ordenViva(e, s.id) && !ordenViva(e, s.id)!.lineas.some((x) => x.cantidad > 0 && x.picking !== 'PENDIENTE')
  const antesSinStock = new Set(s.lineas.filter((l) => l.estado === 'SIN_STOCK').map((l) => l.id))
  let liberadas = 0, porDevolver = 0
  const cambios: CambioLinea[] = []

  if (cancel) {
    const motivo = nuevo.motivoCancelacion?.trim() || 'sin motivo'
    for (const l of s.lineas.filter((x) => x.estado === 'SIN_STOCK')) {
      const x = explicarLineaDemo(e, s, l, undefined)
      registrarQuiebreDemo(e, s, l, { causa: 'CANCELADO_POR_VENDEDOR', origen: 'PEDIDOS', pedido: l.cantidad, faltante: x.faltan || l.cantidad, cantidadCausa: x.faltan || l.cantidad, detalle: { pedido: x.pedido, disponibles: x.disponibles, faltan: x.faltan, causas: x.causas, existentes: x.existentes, hayFaltante: x.hayFaltante, motivo, canceladoPor: nuevo.canceladoPor, version: nuevo.version }, por: actor.nombre })
    }
    for (const l of s.lineas.filter((x) => x.estado !== 'CANCELADA')) { const r = soltarLineaDemo(e, l, null, 'PEDIDO_CANCELADO', nuevo.version); liberadas += r.liberadas; porDevolver += r.porDevolver }
    if (porDevolver === 0) cancelarSalidaPorPedido(e, s, motivo, actor)
    else { s.cancelacionPendiente = true; s.motivoCancelacion = motivo; for (const l of s.lineas) atenderAlertaStock(e, l, 'El pedido se canceló en Pedidos') }
    const resumen: ResumenAplicacion = { numeroPedido: nuevo.numero, cambios: [], liberadas, porDevolver, yaNoFalta: 0, conFalta: 0, cancelado: { motivo, por: nuevo.canceladoPor } }
    const texto = textoAlertaCambio(resumen)
    alertar(e, 'PEDIDO_CANCELADO', 'jefe_transporte', texto, clave)
    return cierre(e, s, fila, nuevo, cambios, liberadas, porDevolver, 0, 0, texto, true, actor)
  }

  // 1) líneas quitadas
  for (const l of s.lineas.filter((x) => x.pedidoLineaId && x.estado !== 'CANCELADA' && x.cantidadNueva === undefined)) {
    if (nuevo.lineas.some((x) => x.lineaId === l.pedidoLineaId)) continue
    const al = anterior?.lineas.find((x) => x.lineaId === l.pedidoLineaId)
    const nombre = al?.descripcion ?? producto(e, l.productoId)?.descripcion ?? ''
    if (l.estado === 'SIN_STOCK') {
      const x = explicarLineaDemo(e, s, l)
      registrarQuiebreDemo(e, s, l, { causa: 'LINEA_QUITADA_POR_VENDEDOR', origen: 'PEDIDOS', pedido: l.cantidad, faltante: x.faltan, cantidadCausa: x.faltan, detalle: { pedido: x.pedido, disponibles: x.disponibles, faltan: x.faltan, causas: x.causas, existentes: x.existentes, hayFaltante: x.hayFaltante, version: nuevo.version }, por: actor.nombre })
    }
    const r = soltarLineaDemo(e, l, null, 'CAMBIO_PEDIDO', nuevo.version)
    liberadas += r.liberadas; porDevolver += r.porDevolver
    if (r.porDevolver > 0) l.cantidadNueva = 0
    else { l.estado = 'CANCELADA'; atenderAlertaStock(e, l, 'La línea se quitó del pedido') }
    cambios.push({ tipo: 'QUITADA', lineaId: l.pedidoLineaId!, productoCodigo: al?.productoCodigo ?? producto(e, l.productoId)?.codigo ?? '', descripcion: nombre, antes: l.cantidad, despues: 0 })
  }
  // 2) líneas reducidas
  for (const nl of nuevo.lineas) {
    const l = s.lineas.find((x) => x.pedidoLineaId === nl.lineaId && x.estado !== 'CANCELADA' && x.cantidadNueva === undefined)
    if (!l || nl.cantidad >= l.cantidad) continue
    const antes = l.cantidad
    if (l.estado === 'SIN_STOCK') {
      const x = explicarLineaDemo(e, s, l)
      registrarQuiebreDemo(e, s, l, { causa: 'LINEA_REDUCIDA_POR_VENDEDOR', origen: 'PEDIDOS', pedido: l.cantidad, faltante: x.faltan, cantidadCausa: x.faltan, detalle: { pedido: x.pedido, disponibles: x.disponibles, faltan: x.faltan, causas: x.causas, existentes: x.existentes, hayFaltante: x.hayFaltante, de: antes, a: nl.cantidad, version: nuevo.version }, por: actor.nombre })
    }
    const vivas = desp(e).reservas.filter((r) => r.lineaId === l.id && ['ACTIVA', 'EN_TRANSITO', 'EN_STAGING'].includes(r.estado) && !devolucionesDe(e).some((d) => d.reservaId === r.id && d.estado !== 'VERIFICADA')).reduce((t, r) => t + r.cantidad, 0)
    const exceso = Math.max(0, vivas - nl.cantidad)
    const estabaSinStock = l.estado === 'SIN_STOCK' || l.estado === 'PENDIENTE'
    l.cantidad = nl.cantidad
    if (exceso > 0) { const r = soltarLineaDemo(e, l, exceso, 'CAMBIO_PEDIDO', nuevo.version); liberadas += r.liberadas; porDevolver += r.porDevolver }
    if (vivas > 0) l.fefo = fefoVigente(e, l)
    if (vivas < nl.cantidad || estabaSinStock) {
      if (l.estado === 'SIN_STOCK') l.estado = 'PENDIENTE'
      if (asignarLineaDemo(e, s, l) === null) engancharAOrden(e, s, l)
    }
    cambios.push({ tipo: 'REDUCIDA', lineaId: nl.lineaId, productoCodigo: nl.productoCodigo, descripcion: nl.descripcion, antes, despues: nl.cantidad })
  }
  // 3) líneas aumentadas
  for (const nl of nuevo.lineas) {
    const l = s.lineas.find((x) => x.pedidoLineaId === nl.lineaId && x.estado !== 'CANCELADA' && x.cantidadNueva === undefined)
    if (!l || nl.cantidad <= l.cantidad) continue
    const antes = l.cantidad
    l.cantidad = nl.cantidad
    if (asignarLineaDemo(e, s, l) === null) { engancharAOrden(e, s, l); l.fefo = fefoVigente(e, l) }
    cambios.push({ tipo: 'AUMENTADA', lineaId: nl.lineaId, productoCodigo: nl.productoCodigo, descripcion: nl.descripcion, antes, despues: nl.cantidad })
  }
  // 4) líneas agregadas
  for (const nl of nuevo.lineas) {
    if (s.lineas.some((x) => x.pedidoLineaId === nl.lineaId)) continue
    const prod = e.panorama.productos.find((p) => p.codigo.toUpperCase() === nl.productoCodigo.toUpperCase())
    if (!prod) {
      alertar(e, 'PEDIDO_CAMBIADO', 'jefe_transporte', `El pedido ${nuevo.numero} agregó un producto que el WMS no conoce (${nl.productoCodigo}): Dirección Técnica debe darlo de alta.`, `pedido-linea-sin-catalogo:${nuevo.pedidoId}:${nl.lineaId}`)
      continue
    }
    const l: LineaSalidaDemo = { id: nuevoId(), productoId: prod.id, cantidad: nl.cantidad, pedidoLineaId: nl.lineaId, estado: 'PENDIENTE', fefo: [] }
    s.lineas.push(l)
    if (asignarLineaDemo(e, s, l) === null) engancharAOrden(e, s, l)
    cambios.push({ tipo: 'AGREGADA', lineaId: nl.lineaId, productoCodigo: nl.productoCodigo, descripcion: nl.descripcion, antes: 0, despues: nl.cantidad })
  }
  // ¿Quedó alguna línea viva? Si no, la orden se cancela (o espera la devolución)
  if (tieneLineas && !s.lineas.some((l) => l.estado !== 'CANCELADA' && l.cantidadNueva !== 0)) {
    if (porDevolver === 0) cancelarSalidaPorPedido(e, s, 'Pedidos quitó todas las líneas del pedido', actor)
    else { s.cancelacionPendiente = true; s.motivoCancelacion = 'Pedidos quitó todas las líneas del pedido' }
  }
  const conFalta = s.lineas.filter((l) => l.estado === 'SIN_STOCK').length
  const yaNoFalta = s.lineas.filter((l) => antesSinStock.has(l.id) && l.estado !== 'SIN_STOCK').length
  if (cambios.length === 0) return { aplicado: true }
  const texto = textoAlertaCambio({ numeroPedido: nuevo.numero, cambios, liberadas, porDevolver, yaNoFalta, conFalta, hojaImpresa: hoja && cambios.length > 0 })
  alertar(e, 'PEDIDO_CAMBIADO', 'jefe_transporte', texto, clave)
  return cierre(e, s, fila, nuevo, cambios, liberadas, porDevolver, yaNoFalta, conFalta, texto, false, actor)
}

function cierre(e: EstadoDemo, s: SalidaDemo, fila: FilaPedido, nuevo: PedidoSnapshot, cambios: CambioLinea[], liberadas: number, porDevolver: number, yaNoFalta: number, conFalta: number, texto: string, cancelado: boolean, actor: Actor): ResultadoCambioDemo {
  if (porDevolver > 0) {
    alertar(e, 'DEVOLUCION_PICKING', 'jefe_almacen', `La orden ${s.numero} tiene ${porDevolver} unidades ya picadas por devolver a su ubicación (el pedido ${nuevo.numero} ${cancelado ? 'se canceló en Pedidos' : 'cambió en Pedidos'}): el auxiliar las devuelve y otra persona lo verifica.`, `devolucion:${s.id}`)
  }
  fila.cambioPendiente = false
  registrar(e, actor, cancelado ? 'pedido_cancelado_aplicado' : 'pedido_cambio_aplicado', 'salidas', s.numero, texto)
  return { aplicado: true, texto, liberadas, porDevolver, yaNoFalta, conFalta }
}

/** La propuesta FEFO de la cantidad nueva es lo que queda asignado (por lote). */
function fefoVigente(e: EstadoDemo, l: LineaSalidaDemo) {
  const por = new Map<string, number>()
  for (const r of desp(e).reservas) if (r.lineaId === l.id && ['ACTIVA', 'EN_TRANSITO', 'EN_STAGING'].includes(r.estado)) por.set(r.loteId, (por.get(r.loteId) ?? 0) + r.cantidad)
  return [...por].map(([loteId, cantidad]) => ({ loteId, cantidad }))
}

/** Una devolución verificada: la reserva se libera, la línea de picking queda en cero y, si no quedan más devoluciones, la orden se cierra o sigue. */
function completarDevolucion(e: EstadoDemo, d: DevolucionDemo, actor: Actor) {
  const r = desp(e).reservas.find((x) => x.id === d.reservaId)
  if (r) r.estado = 'LIBERADA'
  anularLineaDePicking(e, d.reservaId)
  d.estado = 'VERIFICADA'; d.verificadaPorId = actor.id; d.verificadaPor = actor.nombre; d.verificadaEn = ahora()
  registrar(e, actor, 'devolucion_picking_verificada', 'devoluciones_picking', d.id, `${d.cantidad} unidades vuelven a su ubicación`)
  cerrarTrasDevolucion(e, d.salidaId, actor)
}
function cerrarTrasDevolucion(e: EstadoDemo, salidaId: string, actor: Actor) {
  if (hayDevolucionPendiente(e, salidaId)) return
  const s = salidaDe(e, salidaId)
  if (!s) return
  const a = e.alertas.find((y) => y.estado === 'ABIERTA' && (y as { clave?: string }).clave === `devolucion:${s.id}`)
  if (a) { a.estado = 'ATENDIDA'; a.atendidaEn = ahora(); a.nota = 'Lo picado ya volvió a su ubicación y se verificó' }
  if (s.cancelacionPendiente) {
    cancelarSalidaPorPedido(e, s, s.motivoCancelacion ?? 'Pedido cancelado en Pedidos', actor)
    alertar(e, 'PEDIDO_CANCELADO', 'jefe_transporte', `La orden ${s.numero} se canceló: lo picado ya volvió a su ubicación y se verificó.`, `orden-cancelada:${s.id}`)
    return
  }
  for (const l of s.lineas) if (l.cantidadNueva === 0) { l.estado = 'CANCELADA'; l.cantidadNueva = undefined } else l.cantidadNueva = undefined
  if (!s.lineas.some((l) => l.estado !== 'CANCELADA')) cancelarSalidaPorPedido(e, s, 'Pedidos quitó todas las líneas del pedido', actor)
}

/** Mientras haya algo por devolver o una línea sin stock, la orden no avanza (espejo de los disparadores de la 0029). Devuelve el motivo o null. */
export function guardiaDeOrden(e: EstadoDemo, salidaId: string | undefined, opciones: { sinStock?: boolean } = {}): string | null {
  if (!salidaId) return null
  if (hayDevolucionPendiente(e, salidaId)) return 'La orden tiene unidades picadas por devolver a su ubicación (por un cambio o la cancelación del pedido): primero se devuelven y otra persona lo verifica'
  if (opciones.sinStock !== false && salidaDe(e, salidaId)?.lineas.some((l) => l.estado === 'SIN_STOCK')) return 'Hay líneas con falta de stock: el vendedor decide en Pedidos si quita o reduce lo que falta, o cancela el pedido, antes de seguir'
  return null
}

export function vistaDevolucion(e: EstadoDemo, d: DevolucionDemo): DevolucionPickingVista {
  const l = salidaDe(e, d.salidaId)?.lineas.find((x) => x.id === d.lineaId)
  const r = desp(e).reservas.find((x) => x.id === d.reservaId)
  const mi = e.inv.ordenes.find((o) => o.id === d.ordenMovimientoId)
  return {
    id: d.id, producto: producto(e, l?.productoId ?? '')?.descripcion ?? '', productoCodigo: producto(e, l?.productoId ?? '')?.codigo ?? '', lote: lote(e, r?.loteId ?? '')?.codigo ?? '',
    cantidad: d.cantidad, estado: d.estado, estadoReserva: d.estadoReserva, desde: posicion(e, d.desdePosicionId)?.codigo ?? '', hasta: posicion(e, d.hastaPosicionId)?.codigo ?? '',
    causa: d.causa, movimientoId: mi?.id, movimientoNumero: mi?.numero, devueltaPor: d.devueltaPor, verificadaPor: d.verificadaPor,
  }
}

/** Qué falta de una orden con devolución pendiente: el auxiliar todavía no devolvió, o ya devolvió y falta que otra persona lo verifique. */
export function faseDeDevolucion(e: EstadoDemo, salidaId: string): 'POR_EJECUTAR' | 'POR_VERIFICAR' | undefined {
  const ds = devolucionesDe(e).filter((d) => d.salidaId === salidaId && d.estado !== 'VERIFICADA')
  if (!ds.length) return undefined
  return ds.some((d) => d.estado === 'POR_DEVOLVER') ? 'POR_EJECUTAR' : 'POR_VERIFICAR'
}

/**
 * Un pedido de la bandeja se une a una orden manual: se aplica a la orden como una versión nueva (espejo de `wms._aplicar_pedido_a_orden_manual`). Las líneas de la orden se
 * enlazan a las del pedido (mismo producto y, si hay varias, misma cantidad); lo que el pedido no trae se quita; lo que difiere se reduce, aumenta o agrega.
 */
registrarAplicarAlUnir((e, fila, s, actor) => {
  if (s.estado === 'CANCELADA' || s.cancelacionPendiente) return
  const usadas = new Set(s.lineas.map((l) => l.pedidoLineaId).filter(Boolean))
  for (const l of s.lineas.filter((x) => x.estado !== 'CANCELADA' && !x.pedidoLineaId)) {
    const cod = producto(e, l.productoId)?.codigo.toUpperCase()
    let hallada: { lineaId: string; cantidad: number } | undefined
    for (const pl of fila.snapshot.lineas) {
      if (usadas.has(pl.lineaId) || pl.productoCodigo.toUpperCase() !== cod) continue
      if (pl.cantidad === l.cantidad) { hallada = pl; break }
      hallada ??= pl
    }
    if (hallada) { l.pedidoLineaId = hallada.lineaId; usadas.add(hallada.lineaId) }
  }
  // lo que el pedido no trae se marca para que se quite (se libera su stock; si ya estaba picado, se devuelve)
  for (const l of s.lineas.filter((x) => x.estado !== 'CANCELADA' && !x.pedidoLineaId)) l.pedidoLineaId = `manual:${l.id}`
  aplicarCambioPedidoDemo(e, s, fila, null, actor)
})

export class CambioPedidoDemo extends PickingDemo implements RepositorioCambioPedido {
  /** El pedido tiene una versión nueva (o llegó cancelado): se aplica a su orden, sola. Lo llama `PedidosDemo` al importar. */
  protected override alAplicarNuevaVersion(e: EstadoDemo, previa: FilaPedido | undefined, fila: FilaPedido, actor: Actor): string | undefined {
    const cancel = fila.snapshot.estado === ESTADO_PEDIDO_CANCELADO
    if (!previa && !cancel) return undefined
    const s = salidaDePedido(e, fila.snapshot.pedidoId)
    if (!s) { if (cancel) fila.cambioPendiente = false; return undefined }
    const r = aplicarCambioPedidoDemo(e, s, fila, previa?.snapshot ?? null, actor)
    return r.aplicado && r.texto ? r.texto : undefined
  }

  // ── Lo que muestran la lista y el detalle de la orden ─────────────────────────────────────────────────────────────
  protected override resumenSalida(e: EstadoDemo, s: SalidaDemo): SalidaResumen {
    const base = super.resumenSalida(e, s)
    const fila = e.pedidos?.filas.find((f) => f.vigente && f.snapshot.pedidoId === s.pedidoId)
    const vivas = s.lineas.filter((l) => l.estado !== 'CANCELADA')
    const o = this.ordenDe(e, s.id)
    const fase = faseDeDevolucion(e, s.id)
    const etapa = etapaDeSalida({ estado: s.estado, lineas: s.lineas, orden: o ? { lineas: o.lineas } : null, devolucionPendiente: !!fase || (s.cancelacionPendiente && s.estado === 'ABIERTA') })
    const mi = devolucionesDe(e).find((d) => d.salidaId === s.id && d.estado === 'DEVUELTA' && d.ordenMovimientoId)?.ordenMovimientoId
    return {
      ...base, etapa, lineas: vivas.length, unidades: vivas.reduce((t, l) => t + l.cantidad, 0), vendedor: fila?.snapshot.vendedor, sinPedido: !fila,
      devolucion: fase, devolucionHref: mi ? `/movimientos/${mi}` : undefined,
    }
  }

  override async obtenerSalida(id: string): Promise<SalidaVista | null> {
    const v = await super.obtenerSalida(id)
    if (!v) return v
    const e = estadoE()
    const s = salidaDe(e, id)!
    const fila = e.pedidos?.filas.find((f) => f.vigente && f.snapshot.pedidoId === s.pedidoId)
    const faltantes: FaltanteLineaVista[] = s.lineas.filter((l) => l.estado === 'SIN_STOCK').map((l) => ({
      lineaId: l.id, producto: producto(e, l.productoId)?.descripcion ?? '', productoCodigo: producto(e, l.productoId)?.codigo ?? '', explicacion: explicarLineaDemo(e, s, l, l.cantidad - reservadoDeLinea(e, l.id)),
    }))
    const avisoVendedor = faltantes.length && fila ? avisoParaVendedor({ pedidoNumero: fila.snapshot.numero, cliente: fila.snapshot.cliente.nombre, vendedor: fila.snapshot.vendedor, lineas: faltantes }) : undefined
    const factura = fila?.snapshot.factura
    return structuredClone({
      ...v,
      conPedido: !!fila, vendedor: fila?.snapshot.vendedor, faltantes, avisoVendedor, factura, facturaEstado: factura ? 'FACTURADA' as const : 'PENDIENTE' as const,
      pedidoCancelado: fila?.snapshot.estado === ESTADO_PEDIDO_CANCELADO ? { motivo: fila.snapshot.motivoCancelacion ?? '', por: fila.snapshot.canceladoPor } : undefined,
      motivoCancelacion: s.motivoCancelacion, cancelacionPendiente: !!s.cancelacionPendiente,
      devoluciones: devolucionesDe(e).filter((d) => d.salidaId === s.id).map((d) => vistaDevolucion(e, d)),
      lineasDetalle: v.lineasDetalle.map((l) => ({ ...l, cantidadNueva: s.lineas.find((x) => x.id === l.id)?.cantidadNueva })),
    })
  }

  /** El aviso para el vendedor de la orden de un pedido de la bandeja (para el botón de la bandeja). */
  protected avisoDeSalida(e: EstadoDemo, s: SalidaDemo): string | undefined {
    const fila = e.pedidos?.filas.find((f) => f.vigente && f.snapshot.pedidoId === s.pedidoId)
    const lineas: FaltanteLineaVista[] = s.lineas.filter((l) => l.estado === 'SIN_STOCK').map((l) => ({
      lineaId: l.id, producto: producto(e, l.productoId)?.descripcion ?? '', productoCodigo: producto(e, l.productoId)?.codigo ?? '', explicacion: explicarLineaDemo(e, s, l, l.cantidad - reservadoDeLinea(e, l.id)),
    }))
    return lineas.length && fila ? avisoParaVendedor({ pedidoNumero: fila.snapshot.numero, cliente: fila.snapshot.cliente.nombre, vendedor: fila.snapshot.vendedor, lineas }) : undefined
  }

  // ── La conformidad no avanza con algo por devolver o sin stock ─────────────────────────────────────────────────────
  override async conformarOrden(...a: Parameters<PickingDemo['conformarOrden']>) {
    const e = estadoE(); await this.sembrarDespacho(e)
    const o = pk(e).ordenes.find((x) => x.id === a[0])
    const g = guardiaDeOrden(e, o?.salidaId)
    return g ? falla(g) : super.conformarOrden(...a)
  }
  override async darConformidad(...a: Parameters<PickingDemo['darConformidad']>) {
    const e = estadoE(); await this.sembrarDespacho(e)
    const x = pk(e).ordenes.find((o) => o.lineas.some((l) => l.id === a[0]))
    const g = a[1] === 'CONFORME' ? guardiaDeOrden(e, x?.salidaId) : null
    return g ? falla(g) : super.darConformidad(...a)
  }

  // ── Devolver lo picado ────────────────────────────────────────────────────────────────────────────────────────────
  async ejecutarDevolucionPicking(salidaId: string, actor: Actor): Promise<ResultadoAccion<{ movimientoId?: string; movimientoNumero?: string }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeEjecutarMovimiento(actor.roles)) return falla('No tienes permiso para registrar movimientos')
    const s = salidaDe(e, salidaId)
    if (!s) return falla('No encontramos esa Orden de Salida')
    this.sincronizarDevoluciones(e, actor)
    const por = devolucionesDe(e).filter((d) => d.salidaId === salidaId && d.estado === 'POR_DEVOLVER')
    if (!por.length) return falla('No hay nada por devolver en esta Orden de Salida')
    const fila = e.pedidos?.filas.find((f) => f.vigente && f.snapshot.pedidoId === s.pedidoId)
    const enDespacho = por.filter((d) => d.estadoReserva === 'EN_STAGING')
    let mi: OrdenMovimiento | undefined
    if (enDespacho.length) {
      mi = {
        id: nuevoId(), numero: numeroDe(e.inv, 'MI', e.panorama.hoy.slice(0, 4)), estado: 'EJECUTADO',
        motivo: `Devolución de lo picado de ${s.numero}: el pedido${fila ? ` ${fila.snapshot.numero} ` : ' '}cambió o se canceló en Pedidos`,
        ejecutorId: actor.id, ejecutor: actor.nombre, ejecutadoEn: ahora(), lineas: [],
      }
      for (const d of enDespacho) {
        const r = desp(e).reservas.find((x) => x.id === d.reservaId)!
        const lt = lote(e, r.loteId)!
        const linea: LineaOrdenMovimiento = {
          id: nuevoId(), productoId: r.productoId, producto: `${producto(e, r.productoId)?.codigo} · ${producto(e, r.productoId)?.descripcion}`, loteId: r.loteId, lote: lt.codigo, vence: lt.vence,
          propietario: e.panorama.propietarios.find((p) => p.id === lt.propietarioId)?.codigo ?? '', estado: 'APROBADO', procedenciaId: r.procedenciaId,
          desdePosicionId: d.desdePosicionId, desde: posicion(e, d.desdePosicionId)?.codigo ?? '', haciaPosicionId: d.hastaPosicionId, hacia: posicion(e, d.hastaPosicionId)?.codigo ?? '', cantidad: d.cantidad, verificacion: 'PENDIENTE',
        }
        mi.lineas.push(linea)
        d.ordenMovimientoId = mi.id; d.ordenMovimientoLineaId = linea.id
      }
      e.inv.ordenes.push(mi)
    }
    for (const d of por) { d.estado = 'DEVUELTA'; d.devueltaPorId = actor.id; d.devueltaPor = actor.nombre; d.devueltaEn = ahora() }
    registrar(e, actor, 'devolucion_picking_ejecutada', 'salidas', s.numero, mi ? `Movimiento ${mi.numero}: espera su verificación` : 'Lo picado vuelve a su ubicación: espera su verificación')
    return { ok: true, movimientoId: mi?.id, movimientoNumero: mi?.numero }
  }

  async verificarDevolucionPicking(salidaId: string, actor: Actor): Promise<ResultadoAccion<{ verificadas: number }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!actor.roles.some((r) => r === 'auxiliar' || r === 'jefe_almacen')) return falla('Solo el personal de almacén verifica movimientos')
    const s = salidaDe(e, salidaId)
    if (!s) return falla('No encontramos esa Orden de Salida')
    const devueltas = devolucionesDe(e).filter((d) => d.salidaId === salidaId && d.estado === 'DEVUELTA')
    if (!devueltas.length) return falla('Todavía no se devolvió nada: primero el auxiliar devuelve lo picado a su ubicación')
    if (devueltas.some((d) => d.devueltaPorId === actor.id) || !puedeVerificar(actor.id, { ejecutorId: devueltas[0].devueltaPorId ?? '' }).puede) return falla('El verificador no puede ser quien devolvió lo picado')
    // lo que tiene movimiento del libro se confirma por la verificación normal; lo demás se da por verificado aquí
    for (const id of new Set(devueltas.map((d) => d.ordenMovimientoId).filter((x): x is string => !!x))) {
      const r = await this.confirmarMovimiento(id, actor)
      if (!r.ok) return r
    }
    for (const d of devolucionesDe(e).filter((x) => x.salidaId === salidaId && x.estado === 'DEVUELTA' && !x.ordenMovimientoId)) completarDevolucion(e, d, actor)
    return { ok: true, verificadas: devolucionesDe(e).filter((d) => d.salidaId === salidaId && d.estado === 'VERIFICADA').length }
  }

  /** Lo que el libro verificó (o anuló) por la pantalla de Movimientos internos se refleja en la devolución. */
  protected sincronizarDevoluciones(e: EstadoDemo, actor: Actor) {
    for (const d of devolucionesDe(e)) {
      if (d.estado !== 'DEVUELTA' || !d.ordenMovimientoId) continue
      const o = e.inv.ordenes.find((x) => x.id === d.ordenMovimientoId)
      const l = o?.lineas.find((x) => x.id === d.ordenMovimientoLineaId)
      if (l?.verificacion === 'CONFIRMADA') completarDevolucion(e, d, { ...actor, id: o?.verificadorId ?? actor.id, nombre: o?.verificador ?? actor.nombre })
      else if (!o || o.estado === 'ANULADO' || l?.verificacion === 'ANULADA') { d.estado = 'POR_DEVOLVER'; d.ordenMovimientoId = undefined; d.ordenMovimientoLineaId = undefined; d.devueltaPorId = undefined; d.devueltaPor = undefined; d.devueltaEn = undefined }
    }
  }
  override async revisarMovimiento(...a: Parameters<PickingDemo['revisarMovimiento']>) { const r = await super.revisarMovimiento(...a); this.sincronizarDevoluciones(estadoE(), a[2]); return r }
  override async resolverMovimiento(...a: Parameters<PickingDemo['resolverMovimiento']>) { const r = await super.resolverMovimiento(...a); this.sincronizarDevoluciones(estadoE(), a[3]); return r }
  override async anularMovimiento(...a: Parameters<PickingDemo['anularMovimiento']>) { const r = await super.anularMovimiento(...a); this.sincronizarDevoluciones(estadoE(), a[2]); return r }

  async listarQuiebresStock(): Promise<QuiebreStockVista[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    return structuredClone(quiebresDe(e).map((q) => ({ id: q.id, en: q.en, origen: q.origen, causa: q.causa, salidaNumero: q.salidaNumero, pedidoNumero: q.pedidoNumero, productoCodigo: producto(e, q.productoId)?.codigo,
      cantidadPedida: q.cantidadPedida, cantidadFaltante: q.cantidadFaltante, cantidadCausa: q.cantidadCausa, vendedor: q.vendedor, detalle: q.detalle })))
  }

  /** El aviso para el vendedor de cada pedido de la bandeja cuya orden tiene falta de stock. */
  override async bandejaPedidos() {
    const b = await super.bandejaPedidos()
    const e = estadoE()
    for (const p of b.pedidos) {
      const s = salidaDePedido(e, p.pedidoId)
      if (s && s.estado === 'ABIERTA') p.avisoVendedor = this.avisoDeSalida(e, s)
    }
    return b
  }

  /** Control de la fuente demo: «Pedidos» cambia el pedido y la bandeja lo importa (sin tocar el contador de consultas). */
  async simularCambioEnPedidos(pedidoId: string, cambio: CambioSimulado, actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenImportacion }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeActualizarBandeja(actor.roles)) return falla('No tienes permiso para actualizar la bandeja de pedidos')
    const fila = e.pedidos!.filas.find((f) => f.vigente && f.snapshot.pedidoId === pedidoId)
    if (!fila) return falla('No encontramos ese pedido en la bandeja')
    if (fila.snapshot.estado === ESTADO_PEDIDO_CANCELADO) return falla('Pedidos ya canceló ese pedido')
    const s = salidaDePedido(e, pedidoId)
    const sinStock = s?.lineas.find((l) => l.estado === 'SIN_STOCK')
    const enPedido = new Set(fila.snapshot.lineas.map((l) => l.productoCodigo))
    const nuevoProducto = e.panorama.productos.filter((p) => p.estado === 'activo').find((p) => !enPedido.has(p.codigo))
    const r = simularCambio(JSON.parse(JSON.stringify(fila.snapshot)), cambio, {
      preferida: sinStock?.pedidoLineaId, disponible: sinStock && s ? explicarLineaDemo(e, s, sinStock).disponibles : undefined, nuevoProducto: nuevoProducto ? { codigo: nuevoProducto.codigo, descripcion: nuevoProducto.descripcion } : undefined,
    })
    if (!r.ok) return falla(r.mensaje)
    const pedidos = e.pedidos!
    ;(pedidos.simulados ??= {})[pedidoId] = r.pedido
    return this.traerYAplicar(e, actor, new FuenteDemo([], pedidos.consultas, e.panorama.hoy, pedidos.simulados, true))
  }
}

