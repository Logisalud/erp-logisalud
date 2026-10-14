// La bandeja de pedidos (S3), en memoria (modo demostración). Aplica las mismas reglas que la migración 0014 (planificarImportacion es el mismo cálculo).
import {
  bandejaDeFila, planificarImportacion, puedeActualizarBandeja, type ImportacionVista, type PedidoSnapshot, type ResumenImportacion,
} from '@/domain/pedidos-despacho'
import { traerPedidos } from '../pedidos/importar'
import { FuenteDemo } from '../pedidos/fuente-demo'
import { registrar, type EstadoDemo } from './estado'
import { alertar, ahora, estadoE, falla, nuevoId } from './entradas-demo'
import { OperacionDemo } from './operacion-demo'
import type { BandejaPedidos, RepositorioPedidos } from '../repositorio-pedidos'
import type { Actor, ResultadoAccion } from '../repositorio'

interface FilaPedidoDemo {
  id: string
  snapshot: PedidoSnapshot
  cambios: string[]
  vigente: boolean
  cambioPendiente: boolean
  salida?: string
  importadoEn: string
}
export interface PedidosDemoEstado { filas: FilaPedidoDemo[]; importaciones: ImportacionVista[]; consultas: number; sembrado: boolean }


function ped(e: EstadoDemo): PedidosDemoEstado {
  if (!e.pedidos) e.pedidos = { filas: [], importaciones: [], consultas: 0, sembrado: false }
  return e.pedidos
}

const productosDemo = (e: EstadoDemo) => e.panorama.productos.filter((p) => p.estado === 'activo').slice(0, 6).map((p) => ({ codigo: p.codigo, descripcion: p.descripcion }))

/** Aplica lo traído a la bandeja en memoria (mismo cálculo que `registrar_importacion_pedidos`). */
function aplicar(e: EstadoDemo, pedidos: PedidoSnapshot[], cuando: string): Omit<ResumenImportacion, 'descartados'> {
  const s = ped(e)
  const vigentes = new Map(s.filas.filter((f) => f.vigente).map((f) => [f.snapshot.pedidoId, f.snapshot]))
  const { insertar, resumen } = planificarImportacion(vigentes, pedidos)
  for (const x of insertar) {
    const previa = s.filas.find((f) => f.vigente && f.snapshot.pedidoId === x.pedido.pedidoId)
    if (previa) previa.vigente = false
    s.filas.push({ id: nuevoId(), snapshot: x.pedido, cambios: x.cambios, vigente: true, cambioPendiente: !!previa, salida: previa?.salida, importadoEn: cuando })
    if (previa) {
      const detalle = x.cambios.length ? `: ${x.cambios.join('; ')}` : ''
      alertar(e, 'PEDIDO_CAMBIADO', 'jefe_transporte', `El pedido ${x.pedido.numero} cambió en Pedidos (versión ${x.pedido.version})${detalle}${previa.salida ? `. Ya tiene la salida ${previa.salida}: revísala antes del picking.` : '.'}`, `pedido-cambiado:${x.pedido.pedidoId}:${x.pedido.version}`)
    }
  }
  return resumen
}

export class PedidosDemo extends OperacionDemo implements RepositorioPedidos {
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
    const pedidos = s.filas.filter((f) => f.vigente).map((f) => bandejaDeFila({ id: f.id, snapshot: f.snapshot, cambios: f.cambios, cambioPendiente: f.cambioPendiente, salida: f.salida, importadoEn: f.importadoEn, codigosEnCatalogo: codigos }))
    return structuredClone({ pedidos, ultimoIntento: s.importaciones[0] ?? null, ultimaExitosa: s.importaciones.find((i) => i.ok) ?? null })
  }

  async actualizarBandeja(actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenImportacion }>> {
    const e = estadoE()
    await this.asegurarSiembra(e)
    if (!puedeActualizarBandeja(actor.roles)) return falla('No tienes permiso para actualizar la bandeja de pedidos')
    const s = ped(e)
    s.consultas += 1
    const r = await traerPedidos(new FuenteDemo(productosDemo(e), s.consultas, e.panorama.hoy))
    if (!r.ok) {
      s.importaciones.unshift({ id: nuevoId(), en: ahora(), por: actor.nombre, origen: r.origen, ok: false, mensaje: r.mensaje })
      return falla(r.mensaje)
    }
    const cuando = ahora()
    const resumen = aplicar(e, r.pedidos, cuando)
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

