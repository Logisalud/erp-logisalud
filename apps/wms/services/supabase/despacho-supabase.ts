import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import {
  claveDeOrden, totalUnidades, type EstadoRuta, type OrdenPlanificable, type ParadaVista, type PanoramaRutas, type PedidoPlanificable, type PersonalTransporte, type PlanRuta, type RutaVista, type VehiculoVista,
} from '@/domain/rutas'
import { armarRegistroLsFr, parametrosDesdeClaves, puedeImprimirLsFr, type ExtrasLsFr, type RegistroLsFrVista } from '@/domain/ls-fr-43-03'
import type { PedidoSnapshot } from '@/domain/pedidos-despacho'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioRutas } from '../repositorio-rutas'
import { nombresDe } from './entradas-supabase'
import { PedidosSupabase } from './pedidos-supabase'
import { mensajeHumano, rpc, s, traerTodo, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás). Está verificado contra el contrato de las funciones SQL de la
// migración 0017 (probada en Postgres local) y por tipos. Las reglas (vehículo calificado, corte, un pedido en una sola ruta) las aplica la base de datos.

const dia = (v: unknown) => String(v).slice(0, 10)
const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })
const sch = () => crearClienteServidor().schema('wms')

const vehiculoDe = (v: Fila): VehiculoVista => ({
  id: String(v.id), placa: String(v.placa), descripcion: s(v.descripcion), tipo: v.tipo === 'EXTERNO' ? 'EXTERNO' : 'PROPIO', calificado: Boolean(v.calificado),
  aptoCadenaFrio: Boolean(v.apto_cadena_frio), capacidadBultos: v.capacidad_bultos == null ? undefined : Number(v.capacidad_bultos), activo: Boolean(v.activo),
})
const personalDe = (p: Fila): PersonalTransporte => ({ id: String(p.id), nombre: String(p.nombre), funcion: p.funcion === 'AUXILIAR' ? 'AUXILIAR' : 'CONDUCTOR', activo: Boolean(p.activo), dni: p.dni ? String(p.dni) : undefined })

export class DespachoSupabase extends PedidosSupabase implements RepositorioRutas {
  private async armarRutas(filtroId?: string): Promise<{ rutas: RutaVista[]; vehiculos: VehiculoVista[]; personal: PersonalTransporte[]; planificables: PedidoPlanificable[]; ordenes: OrdenPlanificable[] }> {
    const [rutas, paradas, versiones, vehiculos, personal, pedidos, salidas, lineas, registros, prods] = await Promise.all([
      traerTodo('rutas', 'wms', '*', ['fecha']), traerTodo('ruta_paradas', 'wms', '*'), traerTodo('ruta_versiones', 'wms', '*', ['version']),
      traerTodo('vehiculos', 'wms', '*', ['placa']), traerTodo('personal_transporte', 'wms', '*', ['nombre']),
      traerTodo('pedidos_despacho', 'wms', '*', ['fecha']), traerTodo('salidas', 'wms', 'id, numero, tipo, origen, estado, pedido_numero, cliente_manual, creada_en'), traerTodo('salida_lineas', 'wms', 'id, salida_id, estado, cantidad'),
      traerTodo('registros_ls_fr_43_03', 'wms', 'id, ruta_id, estado'), traerTodo('productos', 'catalogo', 'codigo'),
    ])
    const vig = pedidos.filter((p) => p.vigente)
    const pedidoPorId = new Map(vig.map((p) => [String(p.id), p]))
    const veh = vehiculos.map(vehiculoDe); const per = personal.map(personalDe)
    const numSalida = new Map(salidas.map((x) => [String(x.id), String(x.numero)]))
    const salidaPorId = new Map(salidas.map((x) => [String(x.id), x]))
    const sinStock = new Set(lineas.filter((l) => l.estado === 'SIN_STOCK').map((l) => String(l.salida_id)))
    const nombres = await nombresDe([...rutas.map((r) => s(r.creada_por)), ...versiones.map((v) => s(v.por))])
    const numeroRutaViva = new Map<string, string>()
    for (const r of rutas) if (r.estado !== 'CANCELADA' && r.estado !== 'CERRADA') for (const pa of paradas.filter((x) => x.activa && String(x.ruta_id) === String(r.id))) { if (pa.pedido_id) numeroRutaViva.set(String(pa.pedido_id), String(r.numero)); if (pa.salida_id) numeroRutaViva.set(`orden:${pa.salida_id}`, String(r.numero)) }
    const lineasDe = (salidaId: string) => lineas.filter((l) => String(l.salida_id) === salidaId && l.estado !== 'CANCELADA')
    const vistaParada = (pa: Fila): ParadaVista => {
      const pd = pa.pedido_despacho_id ? (pedidoPorId.get(String(pa.pedido_despacho_id)) ?? pedidos.find((x) => String(x.id) === String(pa.pedido_despacho_id))) : undefined
      const salidaId = s(pa.salida_id)
      const so = salidaId ? salidaPorId.get(salidaId) : undefined
      const stockDe = (): ParadaVista['stock'] => (!salidaId ? 'PENDIENTE' : sinStock.has(salidaId) ? 'SIN_STOCK' : 'ASIGNADA')
      if (!pd && so) {
        // parada por orden (SA-6): el destinatario sale de lo escrito en la orden
        const cm = (so.cliente_manual ?? {}) as { razon_social?: string; ruc?: string; direccion?: string }
        const ls = lineasDe(salidaId!)
        return {
          id: String(pa.id), secuencia: Number(pa.secuencia), clave: claveDeOrden(salidaId!), origen: 'ORDEN', salidaId, tipoOrden: so.tipo as ParadaVista['tipoOrden'], pedidoNumero: s(so.pedido_numero) ?? String(so.numero),
          cliente: cm.razon_social ?? '', ruc: cm.ruc, direccion: cm.direccion, lineas: ls.length, unidades: ls.reduce((t, l) => t + Number(l.cantidad), 0), salidaNumero: String(so.numero), stock: stockDe(),
          excepcionCorte: Boolean(pa.excepcion_corte), motivoExcepcion: s(pa.motivo_excepcion),
        }
      }
      const snap = (pd?.snapshot ?? {}) as PedidoSnapshot
      const c = snap.cliente
      return {
        id: String(pa.id), secuencia: Number(pa.secuencia), clave: String(pa.pedido_id ?? claveDeOrden(salidaId ?? '')), origen: 'PEDIDO', pedidoId: s(pa.pedido_id), salidaId, tipoOrden: so?.tipo as ParadaVista['tipoOrden'], pedidoNumero: String(pd?.numero ?? '?'), cliente: c?.nombre ?? String(pd?.cliente_nombre ?? ''), ruc: c?.ruc,
        direccion: c?.direccion, distrito: c?.distrito, ventanaCita: c?.ventanaCita, vehiculoCalificado: c?.vehiculoCalificado, lineas: snap.lineas?.length ?? 0,
        unidades: (snap.lineas ?? []).reduce((t, l) => t + l.cantidad, 0), salidaNumero: salidaId ? numSalida.get(salidaId) : undefined,
        stock: stockDe(), excepcionCorte: Boolean(pa.excepcion_corte), motivoExcepcion: s(pa.motivo_excepcion),
      }
    }
    const vistas: RutaVista[] = rutas.filter((r) => !filtroId || String(r.id) === filtroId).map((r) => {
      const ps = paradas.filter((x) => String(x.ruta_id) === String(r.id) && x.activa).sort((a, b) => Number(a.secuencia) - Number(b.secuencia)).map(vistaParada)
      return {
        id: String(r.id), numero: String(r.numero), fecha: dia(r.fecha), estado: r.estado as EstadoRuta, version: Number(r.version),
        vehiculo: veh.find((v) => v.id === s(r.vehiculo_id)), conductor: per.find((p) => p.id === s(r.conductor_id)), auxiliar: per.find((p) => p.id === s(r.auxiliar_id)),
        paradas: ps,
        versiones: versiones.filter((v) => String(v.ruta_id) === String(r.id)).sort((a, b) => Number(b.version) - Number(a.version))
          .map((v) => ({ version: Number(v.version), en: String(v.en), por: nombres.get(String(v.por)) ?? 'Usuario', motivo: String(v.motivo ?? ''), paradas: Array.isArray(v.paradas) ? v.paradas.length : 0 })),
        registroLsFr: registros.find((x) => String(x.ruta_id) === String(r.id))?.estado as RutaVista['registroLsFr'], motivoCancelacion: s(r.motivo_cancelacion),
        creadaPor: nombres.get(String(r.creada_por)) ?? 'Usuario', creadaEn: String(r.creada_en), confirmadaEn: s(r.confirmada_en), unidades: totalUnidades(ps),
      }
    })
    const codigos = new Set(prods.map((x) => String(x.codigo).toUpperCase()))
    const planificables: PedidoPlanificable[] = vig.map((p) => {
      const snap = p.snapshot as PedidoSnapshot
      return {
        pedidoId: String(p.pedido_id), numero: String(p.numero), cliente: snap.cliente.nombre, ruc: snap.cliente.ruc, direccion: snap.cliente.direccion, distrito: snap.cliente.distrito,
        ventanaCita: snap.cliente.ventanaCita, vehiculoCalificado: snap.cliente.vehiculoCalificado, lineas: snap.lineas.length, unidades: snap.lineas.reduce((t, l) => t + l.cantidad, 0),
        importadoEn: String(p.importado_en), enRuta: numeroRutaViva.get(String(p.pedido_id)), cambioPorRevisar: Boolean(p.cambio_pendiente),
        sinCatalogo: snap.lineas.filter((l) => !codigos.has(l.productoCodigo.toUpperCase())).map((l) => l.productoCodigo),
      }
    })
    // SA-6: órdenes manuales por despachar (A sin pedido en la bandeja, muestra, devolución al proveedor): abiertas, con destinatario y sin pedido vigente unido
    const conPedido = new Set(vig.map((p) => s(p.salida_id)).filter(Boolean) as string[])
    const ordenes: OrdenPlanificable[] = salidas
      .filter((so) => so.origen === 'MANUAL' && so.estado === 'ABIERTA' && so.tipo !== 'CLIENTE' && so.cliente_manual && !conPedido.has(String(so.id)))
      .map((so) => {
        const cm = so.cliente_manual as { razon_social?: string; ruc?: string; direccion?: string }
        const ls = lineasDe(String(so.id))
        return {
          salidaId: String(so.id), clave: claveDeOrden(String(so.id)), numero: String(so.numero), tipo: so.tipo as OrdenPlanificable['tipo'], pedidoNumero: s(so.pedido_numero), cliente: cm.razon_social ?? '', ruc: cm.ruc, direccion: cm.direccion,
          lineas: ls.length, unidades: ls.reduce((t, l) => t + Number(l.cantidad), 0), creadaEn: String(so.creada_en), enRuta: numeroRutaViva.get(claveDeOrden(String(so.id))), sinStock: ls.some((l) => l.estado === 'SIN_STOCK' || l.estado === 'PENDIENTE'),
        }
      })
    return { rutas: vistas, vehiculos: veh, personal: per, planificables, ordenes }
  }

  async panoramaRutas(): Promise<PanoramaRutas> {
    const [{ rutas, vehiculos, personal, planificables, ordenes }, param] = await Promise.all([this.armarRutas(), sch().from('parametros').select('valor').eq('clave', 'hora_corte_planificacion').maybeSingle()])
    return {
      hoy: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }), corte: String((param.data as Fila | null)?.valor ?? '16:00'),
      rutas: rutas.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero)), vehiculos, personal, pedidos: planificables, ordenes,
    }
  }

  async obtenerRuta(id: string): Promise<RutaVista | null> {
    const { rutas } = await this.armarRutas(id)
    return rutas[0] ?? null
  }

  /** Lo que las etapas siguientes registran y el formato pide (guías, bultos, horas). Las clases de más abajo lo completan. */
  protected async extrasLsFr(_rutaId: string): Promise<ExtrasLsFr> { return {} }

  async registroLsFr(rutaId: string): Promise<RegistroLsFrVista | null> {
    const ruta = await this.obtenerRuta(rutaId)
    if (!ruta || !puedeImprimirLsFr(ruta)) return null
    const { data } = await sch().from('parametros').select('clave, valor').or('clave.like.ls_fr_43_03_%,clave.eq.cajas_equivale_a_bultos')
    const valores = Object.fromEntries(((data ?? []) as Fila[]).map((f) => [String(f.clave), String(f.valor)]))
    return armarRegistroLsFr(ruta, parametrosDesdeClaves(valores), await this.extrasLsFr(rutaId))
  }

  async crearRuta(datos: { fecha: string; vehiculoId?: string; conductorId?: string; auxiliarId?: string }, _actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const { data, error } = await rpc('crear_ruta', { p_fecha: datos.fecha, p_vehiculo: datos.vehiculoId ?? null, p_conductor: datos.conductorId ?? null, p_auxiliar: datos.auxiliarId ?? null })
    if (error) return mal(error)
    const id = String(data)
    const { data: r } = await sch().from('rutas').select('numero').eq('id', id).maybeSingle()
    return { ok: true, id, numero: String((r as Fila | null)?.numero ?? '') }
  }

  async planificarRuta(id: string, plan: PlanRuta, _actor: Actor): Promise<ResultadoAccion<{ version: number; bloqueadosPorStock: string[] }>> {
    const { data, error } = await rpc('planificar_ruta', {
      p_ruta: id, p_fecha: plan.fecha, p_vehiculo: plan.vehiculoId ?? null, p_conductor: plan.conductorId ?? null, p_auxiliar: plan.auxiliarId ?? null,
      p_paradas: plan.paradas.map((p) => ({ pedido_id: p.pedidoId ?? null, salida_id: p.salidaId ?? null, excepcion_corte: !!p.excepcionCorte, motivo_excepcion: p.motivoExcepcion ?? null })), p_motivo: plan.motivo ?? null,
    })
    if (error) return mal(error)
    const d = data as { version: number; bloqueados_por_stock: string[] }
    return { ok: true, version: d.version, bloqueadosPorStock: d.bloqueados_por_stock ?? [] }
  }

  async confirmarRuta(id: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('confirmar_ruta', { p_ruta: id })
    return error ? mal(error) : { ok: true }
  }

  async cancelarRuta(id: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('cancelar_ruta', { p_ruta: id, p_motivo: motivo })
    return error ? mal(error) : { ok: true }
  }

  async guardarPersonal(p: { id?: string; nombre: string; funcion: PersonalTransporte['funcion']; activo: boolean }, _actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const { data, error } = await rpc('guardar_personal_transporte', { p_id: p.id ?? null, p_nombre: p.nombre, p_funcion: p.funcion, p_activo: p.activo })
    return error ? mal(error) : { ok: true, id: String(data) }
  }

  async guardarVehiculo(v: Pick<VehiculoVista, 'placa' | 'descripcion' | 'tipo' | 'calificado' | 'aptoCadenaFrio' | 'activo'> & { id?: string }, _actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    // La política de la tabla ya limita la escritura al Jefe de Transporte y a administración
    const fila = { placa: v.placa.trim().toUpperCase(), descripcion: v.descripcion?.trim() || null, tipo: v.tipo, calificado: v.calificado, apto_cadena_frio: v.aptoCadenaFrio, activo: v.activo }
    const q = v.id ? sch().from('vehiculos').update(fila).eq('id', v.id).select('id').single() : sch().from('vehiculos').insert(fila).select('id').single()
    const { data, error } = await q
    if (error) return mal(error)
    return { ok: true, id: String((data as Fila).id) }
  }
}
