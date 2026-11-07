// La bandeja de pedidos (S3), en memoria (modo demostración). Aplica las mismas reglas que la migración 0014 (planificarImportacion es el mismo cálculo).
import {
  bandejaDeFila, planificarImportacion, puedeActualizarBandeja, requiereEmbalaje, type ImportacionVista, type PedidoSnapshot, type ResumenImportacion,
} from '@/domain/pedidos-despacho'
import { normalizarNumeroPedido } from '@/domain/salida-manual'
import { traerPedidos } from '../pedidos/importar'
import { FuenteDemo } from '../pedidos/fuente-demo'
import { registrar, type EstadoDemo } from './estado'
import { alertar, ahora, estadoE, falla, nuevoId } from './entradas-demo'
import { OperacionDemo } from './operacion-demo'
import type { BandejaPedidos, RepositorioPedidos } from '../repositorio-pedidos'
import type { Actor, ResultadoAccion } from '../repositorio'

export interface FilaPedidoDemo {
  id: string
  snapshot: PedidoSnapshot
  cambios: string[]
  vigente: boolean
  cambioPendiente: boolean
  salida?: string
  importadoEn: string
}
export interface PedidosDemoEstado {
  filas: FilaPedidoDemo[]; importaciones: ImportacionVista[]; consultas: number; sembrado: boolean
  /** SA-3: los cambios que «Pedidos» hizo en la demostración (reducir, quitar, agregar, cancelar, facturar), por pedido: la versión nueva que la fuente demo entrega. */
  simulados?: Record<string, unknown>
}


function ped(e: EstadoDemo): PedidosDemoEstado {
  if (!e.pedidos) e.pedidos = { filas: [], importaciones: [], consultas: 0, sembrado: false }
  return e.pedidos
}

type SalidaManualDemo = NonNullable<EstadoDemo['desp']>['salidas'][number]
type AplicarAlUnir = (e: EstadoDemo, fila: FilaPedidoDemo, salida: SalidaManualDemo, actor: Actor) => void
let aplicarAlUnir: AplicarAlUnir | undefined
/** SA-3 registra aquí cómo se aplica el pedido a la orden manual al unirse (`wms._aplicar_pedido_a_orden_manual`); vive en otro módulo porque depende de las clases de más abajo. */
export function registrarAplicarAlUnir(f: AplicarAlUnir) { aplicarAlUnir = f }

/**
 * Une la orden manual con el pedido que llegó por la bandeja (espejo de `wms._vincular_orden_manual`): el pedido toma la orden, la referencia pasa al id real, se quita
 * «por conciliar» y queda en auditoría. No crea otra orden; lo ya avanzado (picking, conformidad…) lo respeta el cambio que se aplica al final (SA-3).
 */
export function unirOrdenManual(e: EstadoDemo, fila: FilaPedidoDemo, salida: NonNullable<EstadoDemo['desp']>['salidas'][number]) {
  const p = fila.snapshot
  fila.salida = salida.numero
  salida.pedidoId = p.pedidoId
  salida.porConciliar = false
  // SA-6 (0030): si la orden ya estaba en una ruta (parada por orden), la parada pasa a ser también del pedido: la ruta, la carga y la guía siguen valiendo
  for (const r of e.desp?.rutas ?? []) for (const pa of r.paradas) if (pa.activa && pa.salidaId === salida.id && !pa.pedidoId) pa.pedidoId = p.pedidoId
  if (salida.bultosConformidad === undefined) salida.requiereEmbalaje = requiereEmbalaje(p.cliente.ubigeo)
  let aviso = ''
  if (salida.clienteManual && p.cliente.ruc && salida.clienteManual.ruc !== p.cliente.ruc) aviso += ` OJO: el RUC del cliente no coincide (orden ${salida.clienteManual.ruc}, pedido ${p.cliente.ruc}).`
  if (salida.lineas.filter((l) => l.estado !== 'CANCELADA').length !== p.lineas.length) aviso += ' OJO: la cantidad de líneas del pedido no es la de la orden.'
  registrar(e, { id: 'demo:sistema', nombre: 'WMS (unión automática)', roles: [] }, 'orden_manual_unida_a_pedido', 'salidas', salida.numero, `El pedido ${p.numero} llegó por la bandeja y se unió a la orden manual`, `Pedido ${p.numero} versión ${p.version}`)
  alertar(e, 'ORDEN_MANUAL_UNIDA', 'jefe_transporte', `El pedido ${p.numero} llegó por la bandeja y se unió a la orden manual ${salida.numero}: no se creó otra orden.${aviso}`, `orden-manual-unida:${salida.id}`)
  // SA-3: el pedido se aplica a la orden como una versión nueva (líneas, cantidades, stock y falta de stock quedan como los del pedido)
  aplicarAlUnir?.(e, fila, salida, { id: 'demo:sistema', nombre: 'WMS (unión automática)', roles: [] })
}

const productosDemo = (e: EstadoDemo) => e.panorama.productos.filter((p) => p.estado === 'activo').slice(0, 6).map((p) => ({ codigo: p.codigo, descripcion: p.descripcion }))

/**
 * Aplica lo traído a la bandeja en memoria (mismo cálculo que `registrar_importacion_pedidos`). Cada versión nueva (o cancelación) se la pasa a `alVersionNueva` (SA-3), que
 * la aplica a la Orden de Salida y devuelve el texto de la alerta; si no la aplica, la alerta es la de siempre.
 */
export function aplicar(
  e: EstadoDemo, pedidos: PedidoSnapshot[], cuando: string,
  alVersionNueva?: (previa: FilaPedidoDemo | undefined, fila: FilaPedidoDemo) => string | undefined,
): Omit<ResumenImportacion, 'descartados'> {
  const s = ped(e)
  const vigentes = new Map(s.filas.filter((f) => f.vigente).map((f) => [f.snapshot.pedidoId, f.snapshot]))
  const { insertar, resumen } = planificarImportacion(vigentes, pedidos)
  for (const x of insertar) {
    const previa = s.filas.find((f) => f.vigente && f.snapshot.pedidoId === x.pedido.pedidoId)
    if (previa) previa.vigente = false
    const fila: FilaPedidoDemo = { id: nuevoId(), snapshot: x.pedido, cambios: x.cambios, vigente: true, cambioPendiente: !!previa, salida: previa?.salida, importadoEn: cuando }
    s.filas.push(fila)
    const aplicado = alVersionNueva?.(previa, fila)
    // SA-2: si ya hay una orden manual abierta con ese número de pedido, el pedido se une a ella (no se crea otra)
    if (!fila.salida) {
      const numero = normalizarNumeroPedido(x.pedido.numero)
      const manual = e.desp?.salidas.find((o) => o.origen === 'MANUAL' && o.porConciliar && o.estado !== 'CANCELADA' && normalizarNumeroPedido(o.pedidoNumero) === numero)
      if (manual) unirOrdenManual(e, fila, manual)
    }
    if (previa && !aplicado) {
      const detalle = x.cambios.length ? `: ${x.cambios.join('; ')}` : ''
      alertar(e, 'PEDIDO_CAMBIADO', 'jefe_transporte', `El pedido ${x.pedido.numero} cambió en Pedidos (versión ${x.pedido.version})${detalle}${previa.salida ? `. Ya tiene la salida ${previa.salida}: revísala antes del picking.` : '.'}`, `pedido-cambiado:${x.pedido.pedidoId}:${x.pedido.version}`)
    }
  }
  return resumen
}

export class PedidosDemo extends OperacionDemo implements RepositorioPedidos {
  /** SA-3: una versión nueva (o la cancelación) de un pedido ya importado. Las clases de más abajo la aplican a su Orden de Salida. Devuelve el texto de la alerta si la aplicó. */
  protected alAplicarNuevaVersion(_e: EstadoDemo, _previa: FilaPedidoDemo | undefined, _fila: FilaPedidoDemo, _actor: Actor): string | undefined { return undefined }

  protected async asegurarSiembra(e: EstadoDemo) {
    const s = ped(e)
    if (s.sembrado) return
    s.sembrado = true
    const r = await traerPedidos(new FuenteDemo(productosDemo(e), 0, e.panorama.hoy))
    if (!r.ok) return
    // Importados ayer a las 10:00 (hora de Lima): dentro del corte de planificación a cualquier hora en que se pruebe
    const cuando = `${new Date(Date.parse(`${e.panorama.hoy}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)}T15:00:00Z`
    const resumen = aplicar(e, r.pedidos, cuando)
    s.importaciones.unshift({ id: nuevoId(), en: cuando, por: 'Jefe de Transporte (demo)', origen: 'demostración', ok: true, resumen: { ...resumen, descartados: r.descartados.length } })
  }

  async bandejaPedidos(): Promise<BandejaPedidos> {
    const e = estadoE()
    await this.asegurarSiembra(e)
    const s = ped(e)
    const codigos = new Set(e.panorama.productos.map((p) => p.codigo))
    const idDe = new Map((e.desp?.salidas ?? []).map((x) => [x.numero, x.id]))
    const pedidos = s.filas.filter((f) => f.vigente).map((f) => bandejaDeFila({ id: f.id, snapshot: f.snapshot, cambios: f.cambios, cambioPendiente: f.cambioPendiente, salida: f.salida, salidaId: f.salida ? idDe.get(f.salida) : undefined, importadoEn: f.importadoEn, codigosEnCatalogo: codigos }))
    return structuredClone({ pedidos, ultimoIntento: s.importaciones[0] ?? null, ultimaExitosa: s.importaciones.find((i) => i.ok) ?? null })
  }

  async actualizarBandeja(actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenImportacion }>> {
    const e = estadoE()
    await this.asegurarSiembra(e)
    if (!puedeActualizarBandeja(actor.roles)) return falla('No tienes permiso para actualizar la bandeja de pedidos')
    const s = ped(e)
    s.consultas += 1
    return this.traerYAplicar(e, actor, new FuenteDemo(productosDemo(e), s.consultas, e.panorama.hoy, s.simulados))
  }

  /** Trae de la fuente, valida y aplica a la bandeja (y, con SA-3, a las órdenes de salida de los pedidos que cambiaron). */
  protected async traerYAplicar(e: EstadoDemo, actor: Actor, fuente: FuenteDemo): Promise<ResultadoAccion<{ resumen: ResumenImportacion }>> {
    const s = ped(e)
    const r = await traerPedidos(fuente)
    if (!r.ok) {
      s.importaciones.unshift({ id: nuevoId(), en: ahora(), por: actor.nombre, origen: r.origen, ok: false, mensaje: r.mensaje })
      return falla(r.mensaje)
    }
    const cuando = ahora()
    const resumen = aplicar(e, r.pedidos, cuando, (previa, fila) => this.alAplicarNuevaVersion(e, previa, fila, actor))
    s.importaciones.unshift({ id: nuevoId(), en: cuando, por: actor.nombre, origen: r.origen, ok: true, resumen: { ...resumen, descartados: r.descartados.length } })
    registrar(e, actor, 'pedidos_importados', 'importaciones_pedidos', r.origen, `Bandeja actualizada: ${resumen.nuevos} nuevos, ${resumen.nuevasVersiones} con versión nueva`)
    return { ok: true, resumen: { ...resumen, descartados: r.descartados } }
  }

  async revisarCambioPedido(pedidoId: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    await this.asegurarSiembra(e)
    if (!puedeActualizarBandeja(actor.roles)) return falla('No tienes permiso para revisar cambios de pedidos')
    const f = ped(e).filas.find((x) => x.vigente && x.snapshot.pedidoId === pedidoId)
    if (!f) return falla('No encontramos ese pedido en la bandeja')
    if (!f.cambioPendiente) return falla('Ese pedido no tiene cambios por revisar')
    f.cambioPendiente = false
    registrar(e, actor, 'cambio_pedido_revisado', 'pedidos_despacho', f.id, f.snapshot.numero)
    return { ok: true }
  }
}

