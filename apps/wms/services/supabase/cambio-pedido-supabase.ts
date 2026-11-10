import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import type { DevolucionPickingVista, SalidaResumen, SalidaVista } from '@/domain/despacho'
import { avisoParaVendedor } from '@/domain/aviso-vendedor'
import type { ExplicacionFaltante, FaltanteLineaVista } from '@/domain/faltante'
import { ESTADO_PEDIDO_CANCELADO, type PedidoSnapshot, type ResumenImportacion } from '@/domain/pedidos-despacho'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { BandejaPedidos } from '../repositorio-pedidos'
import type { CambioSimulado, QuiebreStockVista, RepositorioCambioPedido } from '../repositorio-cambio-pedido'
import { nombresDe } from './entradas-supabase'
import { PickingSupabase } from './picking-supabase'
import { mensajeHumano, rpc, s, traerTodo, type Fila } from './util'

// SA-3. ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás): está verificado contra las funciones de la migración 0029 (probadas en
// Postgres local) y por tipos. Las reglas (qué falta y por qué, qué se libera, qué se devuelve) las aplica la base de datos.

const sch = () => crearClienteServidor().schema('wms')
const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })

interface DatosExtra {
  salidas: Map<string, Fila>
  /** Lo vigente del pedido de cada orden: por `salida_id` o, en una orden manual de venta, por la referencia (id o número del pedido). */
  pedido: (salida: Fila) => (PedidoSnapshot & { numero: string }) | undefined
  devoluciones: Fila[]
  lineasVivas: Map<string, { n: number; unidades: number }>
}

export class CambioPedidoSupabase extends PickingSupabase implements RepositorioCambioPedido {
  private async extra(): Promise<DatosExtra> {
    const [salidas, pedidos, devoluciones, lineas] = await Promise.all([
      traerTodo('salidas', 'wms', 'id, numero, referencia_tipo, referencia_id, estado, motivo_cancelacion, cancelacion_pendiente', ['numero']),
      traerTodo('pedidos_despacho', 'wms', 'pedido_id, numero, salida_id, snapshot', ['fecha']).then((f) => f),
      traerTodo('devoluciones_picking', 'wms', '*', ['creada_en']),
      traerTodo('salida_lineas', 'wms', 'id, salida_id, cantidad, estado'),
    ])
    const vigentes = (await sch().from('pedidos_despacho').select('pedido_id, numero, salida_id, snapshot').eq('vigente', true)).data as Fila[] | null
    const base = (vigentes?.length ? vigentes : pedidos) ?? []
    const porSalida = new Map<string, Fila>(); const porRef = new Map<string, Fila>()
    for (const p of base) { if (p.salida_id) porSalida.set(String(p.salida_id), p); porRef.set(String(p.pedido_id), p); porRef.set(String(p.numero), p) }
    const pedido: DatosExtra['pedido'] = (sal) => {
      const f = porSalida.get(String(sal.id)) ?? (sal.referencia_tipo === 'pedido' ? porRef.get(String(sal.referencia_id)) : undefined)
      return f ? { ...(f.snapshot as PedidoSnapshot), numero: String(f.numero) } : undefined
    }
    const lineasVivas = new Map<string, { n: number; unidades: number }>()
    for (const l of lineas) if (l.estado !== 'CANCELADA') { const x = lineasVivas.get(String(l.salida_id)) ?? { n: 0, unidades: 0 }; x.n += 1; x.unidades += Number(l.cantidad); lineasVivas.set(String(l.salida_id), x) }
    return { salidas: new Map(salidas.map((x) => [String(x.id), x])), pedido, devoluciones, lineasVivas }
  }

  private fase(d: Fila[], salidaId: string): 'POR_EJECUTAR' | 'POR_VERIFICAR' | undefined {
    const ds = d.filter((x) => String(x.salida_id) === salidaId && x.estado !== 'VERIFICADA')
    if (!ds.length) return undefined
    return ds.some((x) => x.estado === 'POR_DEVOLVER') ? 'POR_EJECUTAR' : 'POR_VERIFICAR'
  }

  override async listarSalidas(): Promise<SalidaResumen[]> {
    const [base, x] = await Promise.all([super.listarSalidas(), this.extra()])
    return base.map((r) => {
      const sal = x.salidas.get(r.id)
      if (!sal) return r
      const ped = x.pedido(sal)
      const fase = this.fase(x.devoluciones, r.id)
      const viva = x.lineasVivas.get(r.id)
      const mi = x.devoluciones.find((d) => String(d.salida_id) === r.id && d.estado === 'DEVUELTA' && d.orden_movimiento_id)?.orden_movimiento_id
      return {
        ...r, etapa: fase || (sal.cancelacion_pendiente && sal.estado === 'ABIERTA') ? 'POR_DEVOLVER_PICKING' : r.etapa, vendedor: ped?.vendedor, sinPedido: !ped,
        lineas: viva?.n ?? r.lineas, unidades: viva?.unidades ?? r.unidades, devolucion: fase, devolucionHref: mi ? `/movimientos/${String(mi)}` : undefined,
      }
    })
  }

  override async obtenerSalida(id: string): Promise<SalidaVista | null> {
    const v = await super.obtenerSalida(id)
    if (!v) return v
    const x = await this.extra()
    const sal = x.salidas.get(id)
    if (!sal) return v
    const ped = x.pedido(sal)
    const fase = this.fase(x.devoluciones, id)
    const faltantes: FaltanteLineaVista[] = []
    for (const l of v.lineasDetalle.filter((y) => y.estado === 'SIN_STOCK')) {
      const { data } = await rpc('explicar_faltante', { p_linea: l.id })
      if (data) faltantes.push({ lineaId: l.id, producto: l.producto, productoCodigo: l.productoCodigo, explicacion: data as ExplicacionFaltante })
    }
    const ds = x.devoluciones.filter((d) => String(d.salida_id) === id)
    const movs = new Map<string, string>()
    const idsMov = [...new Set(ds.map((d) => s(d.orden_movimiento_id)).filter((m): m is string => !!m))]
    if (idsMov.length) for (const m of ((await sch().from('ordenes_movimiento').select('id, numero').in('id', idsMov)).data ?? []) as Fila[]) movs.set(String(m.id), String(m.numero))
    const nombres = await nombresDe(ds.flatMap((d) => [s(d.devuelta_por), s(d.verificada_por)]).filter((n): n is string => !!n))
    const lotes = new Map(((await sch().from('reservas').select('id, lote_id, linea_id').in('id', ds.length ? ds.map((d) => String(d.reserva_id)) : ['00000000-0000-0000-0000-000000000000'])).data ?? []).map((r: Fila) => [String(r.id), r]))
    const codigos = new Map(((await sch().from('lotes').select('id, codigo').in('id', [...lotes.values()].map((r) => String(r.lote_id)).concat('00000000-0000-0000-0000-000000000000'))).data ?? []).map((r: Fila) => [String(r.id), String(r.codigo)]))
    const posiciones = new Map(((await sch().from('posiciones').select('id, codigo')).data ?? []).map((r: Fila) => [String(r.id), String(r.codigo)]))
    const devoluciones: DevolucionPickingVista[] = ds.map((d) => {
      const l = v.lineasDetalle.find((y) => y.id === String(d.linea_id))
      return {
        id: String(d.id), producto: l?.producto ?? '', productoCodigo: l?.productoCodigo ?? '', lote: codigos.get(String(lotes.get(String(d.reserva_id))?.lote_id)) ?? '', cantidad: Number(d.cantidad),
        estado: d.estado as DevolucionPickingVista['estado'], estadoReserva: d.estado_reserva as DevolucionPickingVista['estadoReserva'], desde: posiciones.get(String(d.desde_posicion_id)) ?? '', hasta: posiciones.get(String(d.hasta_posicion_id)) ?? '',
        causa: d.causa as DevolucionPickingVista['causa'], movimientoId: s(d.orden_movimiento_id), movimientoNumero: movs.get(String(d.orden_movimiento_id)),
        devueltaPor: nombres.get(String(d.devuelta_por)), verificadaPor: nombres.get(String(d.verificada_por)),
      }
    })
    const viva = x.lineasVivas.get(id)
    const factura = ped?.factura
    return {
      ...v, etapa: fase || (sal.cancelacion_pendiente && sal.estado === 'ABIERTA') ? 'POR_DEVOLVER_PICKING' : v.etapa, lineas: viva?.n ?? v.lineas, unidades: viva?.unidades ?? v.unidades,
      vendedor: ped?.vendedor, sinPedido: !ped, conPedido: !!ped, devolucion: fase, faltantes,
      avisoVendedor: faltantes.length && ped ? avisoParaVendedor({ pedidoNumero: ped.numero, cliente: ped.cliente.nombre, vendedor: ped.vendedor, lineas: faltantes }) : undefined,
      factura, facturaEstado: factura ? 'FACTURADA' : 'PENDIENTE',
      pedidoCancelado: ped?.estado === ESTADO_PEDIDO_CANCELADO ? { motivo: ped.motivoCancelacion ?? '', por: ped.canceladoPor } : undefined,
      motivoCancelacion: s(sal.motivo_cancelacion), cancelacionPendiente: !!sal.cancelacion_pendiente, devoluciones,
    }
  }

  override async bandejaPedidos(): Promise<BandejaPedidos> {
    const [b, x, vistas] = await Promise.all([super.bandejaPedidos(), this.extra(), super.listarSalidas()])
    void vistas
    for (const p of b.pedidos) {
      const sal = [...x.salidas.values()].find((y) => x.pedido(y)?.pedidoId === p.pedidoId && y.estado === 'ABIERTA')
      if (!sal) continue
      const l = (await sch().from('salida_lineas').select('id, producto_id, estado').eq('salida_id', String(sal.id)).eq('estado', 'SIN_STOCK')).data as Fila[] | null
      if (!l?.length) continue
      const prod = new Map(((await crearClienteServidor().schema('catalogo').from('productos').select('id, codigo, descripcion').in('id', l.map((r) => String(r.producto_id)))).data ?? []).map((r: Fila) => [String(r.id), r]))
      const lineas: FaltanteLineaVista[] = []
      for (const r of l) {
        const { data } = await rpc('explicar_faltante', { p_linea: String(r.id) })
        const pr = prod.get(String(r.producto_id))
        if (data) lineas.push({ lineaId: String(r.id), producto: String(pr?.descripcion ?? ''), productoCodigo: String(pr?.codigo ?? ''), explicacion: data as ExplicacionFaltante })
      }
      p.avisoVendedor = avisoParaVendedor({ pedidoNumero: p.numero, cliente: p.cliente, vendedor: p.vendedor, lineas })
    }
    return b
  }

  async ejecutarDevolucionPicking(salidaId: string, _actor: Actor): Promise<ResultadoAccion<{ movimientoId?: string; movimientoNumero?: string }>> {
    const { data, error } = await rpc('ejecutar_devolucion_picking', { p_salida: salidaId })
    if (error) return mal(error)
    if (!data) return { ok: true }
    const { data: o } = await sch().from('ordenes_movimiento').select('numero').eq('id', String(data)).maybeSingle()
    return { ok: true, movimientoId: String(data), movimientoNumero: s((o as Fila | null)?.numero) }
  }

  async verificarDevolucionPicking(salidaId: string, _actor: Actor): Promise<ResultadoAccion<{ verificadas: number }>> {
    const { data, error } = await rpc('verificar_devolucion_picking', { p_salida: salidaId })
    return error ? mal(error) : { ok: true, verificadas: Number(data ?? 0) }
  }

  async listarQuiebresStock(): Promise<QuiebreStockVista[]> {
    const filas = await traerTodo('v_quiebres_stock', 'wms', '*', ['creado_en'])
    return filas.map((q) => ({
      id: String(q.id), en: String(q.creado_en), origen: q.origen as 'DETECCION' | 'PEDIDOS', causa: String(q.causa), salidaNumero: s(q.salida_numero), pedidoNumero: s(q.pedido_numero), productoCodigo: s(q.producto_codigo),
      cantidadPedida: Number(q.cantidad_pedida), cantidadFaltante: Number(q.cantidad_faltante), cantidadCausa: Number(q.cantidad_causa), vendedor: s(q.vendedor), detalle: (q.detalle ?? {}) as Record<string, unknown>,
    }))
  }

  async simularCambioEnPedidos(_pedidoId: string, _cambio: CambioSimulado, _actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenImportacion }>> {
    return { ok: false, mensaje: 'Los controles de simulación solo existen en la demostración: en producción los cambios llegan de Pedidos.' }
  }
}
