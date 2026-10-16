import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import {
  etapaDeSalida, type AsignacionVista, type CambioFefoPersona, type CambioFefoVista, type EstadoLineaSalida, type EstadoOrdenPicking, type LineaPickingVista, type LineaSalidaVista,
  type LoteEditable, type OrdenPickingResumen, type OrdenPickingVista, type ReemplazoVista, type ResultadoConformidad, type ResultadoPicking, type SalidaResumen, type SalidaVista, type TipoNoConformidad,
} from '@/domain/despacho'
import type { PedidoSnapshot } from '@/domain/pedidos-despacho'
import { seApartaDeFefo, type AsignacionLote } from '@/domain/salidas'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioPicking } from '../repositorio-picking'
import { DespachoSupabase } from './despacho-supabase'
import { nombresDe } from './entradas-supabase'
import { mensajeHumano, rpc, s, traerTodo, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás). Está verificado contra el contrato de las funciones SQL de las migraciones
// 0012, 0013 y 0018 (probadas en Postgres local) y por tipos. Las reglas (FEFO, picking, conformidad por otra persona) las aplica la base de datos con la sesión de la persona.

const sch = () => crearClienteServidor().schema('wms')
const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })
const dia = (v: unknown) => String(v).slice(0, 10)

interface Contexto {
  salidas: Fila[]; lineas: Fila[]; reservas: Fila[]; ordenes: Fila[]; ordenLineas: Fila[]; lotes: Map<string, Fila>; posiciones: Map<string, Fila>; productos: Map<string, Fila>
  pedidoPorSalida: Map<string, PedidoSnapshot & { numero: string }>; rutaPorSalida: Map<string, string>
}

export class PickingSupabase extends DespachoSupabase implements RepositorioPicking {
  protected async contexto(): Promise<Contexto> {
    const [salidas, lineas, reservas, ordenes, ordenLineas, lotes, posiciones, productos, pedidos, paradas, rutas] = await Promise.all([
      traerTodo('salidas', 'wms', '*', ['numero']), traerTodo('salida_lineas', 'wms', '*'), traerTodo('reservas', 'wms', '*'), traerTodo('ordenes_picking', 'wms', '*', ['numero']),
      traerTodo('ordenes_picking_lineas', 'wms', '*'), traerTodo('lotes', 'wms', 'id, codigo, vence, producto_id'), traerTodo('posiciones', 'wms', 'id, codigo, orden_recorrido'),
      traerTodo('productos', 'catalogo', 'id, codigo, descripcion'), traerTodo('pedidos_despacho', 'wms', '*', ['fecha']), traerTodo('ruta_paradas', 'wms', '*'), traerTodo('rutas', 'wms', 'id, numero, estado'),
    ])
    const numeroRuta = new Map(rutas.filter((r) => r.estado !== 'CANCELADA').map((r) => [String(r.id), String(r.numero)]))
    const pedidoPorSalida = new Map<string, PedidoSnapshot & { numero: string }>()
    for (const p of pedidos) if (p.salida_id) pedidoPorSalida.set(String(p.salida_id), { ...(p.snapshot as PedidoSnapshot), numero: String(p.numero) })
    const rutaPorSalida = new Map<string, string>()
    for (const pa of paradas) if (pa.activa && pa.salida_id && numeroRuta.has(String(pa.ruta_id))) rutaPorSalida.set(String(pa.salida_id), numeroRuta.get(String(pa.ruta_id))!)
    const mapa = (f: Fila[]) => new Map(f.map((x) => [String(x.id), x]))
    return { salidas, lineas, reservas, ordenes, ordenLineas, lotes: mapa(lotes), posiciones: mapa(posiciones), productos: mapa(productos), pedidoPorSalida, rutaPorSalida }
  }

  private asignacion(c: Contexto, lineaId: string, estados: string[] = ['ACTIVA', 'EN_TRANSITO', 'EN_STAGING']): AsignacionVista[] {
    const por = new Map<string, AsignacionVista>()
    for (const r of c.reservas.filter((x) => String(x.linea_id) === lineaId && estados.includes(String(x.estado)))) {
      const lt = c.lotes.get(String(r.lote_id))
      const a = por.get(String(r.lote_id)) ?? { loteId: String(r.lote_id), lote: String(lt?.codigo ?? '?'), vence: lt?.vence ? dia(lt.vence) : null, cantidad: 0, ubicaciones: [] }
      a.cantidad += Number(r.cantidad)
      const pos = String(c.posiciones.get(String(r.posicion_origen_id))?.codigo ?? '')
      if (pos && !a.ubicaciones.includes(pos)) a.ubicaciones.push(pos)
      por.set(String(r.lote_id), a)
    }
    return [...por.values()].sort((a, b) => (a.vence ?? '9999').localeCompare(b.vence ?? '9999') || a.lote.localeCompare(b.lote))
  }

  private lineaVista(c: Contexto, l: Fila): LineaSalidaVista {
    const p = c.productos.get(String(l.producto_id))
    const fefoCrudo = (Array.isArray(l.asignacion_fefo) ? l.asignacion_fefo : []) as { lote_id: string; lote?: string; vence?: string; cantidad: number }[]
    const fefo: AsignacionVista[] = fefoCrudo.map((f) => ({ loteId: f.lote_id, lote: f.lote ?? String(c.lotes.get(f.lote_id)?.codigo ?? '?'), vence: f.vence ?? null, cantidad: f.cantidad, ubicaciones: [] }))
    const asignacion = this.asignacion(c, String(l.id))
    const empezo = c.ordenLineas.some((o) => String(o.linea_id) === String(l.id) && o.picking !== 'PENDIENTE')
    const estado = String(l.estado) as EstadoLineaSalida
    return {
      id: String(l.id), productoId: String(l.producto_id), producto: String(p?.descripcion ?? ''), productoCodigo: String(p?.codigo ?? ''), cantidad: Number(l.cantidad), estado, fefo, asignacion,
      apartadaDeFefo: asignacion.length > 0 && fefo.length > 0 && seApartaDeFefo(fefo.map((f) => ({ loteId: f.loteId, cantidad: f.cantidad })), asignacion.map((a) => ({ loteId: a.loteId, cantidad: a.cantidad }))),
      nota: s(l.nota_stock), editable: (estado === 'ASIGNADA' || estado === 'EN_PICKING') && !empezo,
    }
  }

  private resumenOrden(c: Contexto, o: Fila): OrdenPickingResumen {
    const sal = c.salidas.find((x) => String(x.id) === String(o.salida_id))
    const ls = c.ordenLineas.filter((x) => String(x.orden_id) === String(o.id))
    const ped = c.pedidoPorSalida.get(String(o.salida_id))
    return {
      id: String(o.id), numero: String(o.numero), salidaNumero: String(sal?.numero ?? ''), pedidoNumero: ped?.numero, cliente: ped?.cliente?.nombre, rutaNumero: c.rutaPorSalida.get(String(o.salida_id)),
      estado: String(o.estado) as EstadoOrdenPicking, lineas: ls.length, unidades: ls.reduce((t, x) => t + Number(x.cantidad), 0), pickeadas: ls.filter((x) => x.picking === 'PICKEADA').length,
      conformes: ls.filter((x) => x.conformidad === 'CONFORME').length, observadas: ls.filter((x) => x.conformidad === 'OBSERVADA').length, discrepancias: ls.filter((x) => x.picking === 'DISCREPANCIA').length, generadaEn: String(o.generada_en),
    }
  }

  protected resumenSalida(c: Contexto, sal: Fila): SalidaResumen {
    const ls = c.lineas.filter((l) => String(l.salida_id) === String(sal.id))
    const orden = c.ordenes.find((o) => String(o.salida_id) === String(sal.id) && o.estado !== 'CANCELADA')
    const ol = orden ? c.ordenLineas.filter((x) => String(x.orden_id) === String(orden.id)).map((x) => ({ picking: x.picking as ResultadoPicking, conformidad: x.conformidad as ResultadoConformidad })) : null
    const ped = c.pedidoPorSalida.get(String(sal.id))
    return {
      id: String(sal.id), numero: String(sal.numero), pedidoNumero: ped?.numero, cliente: ped?.cliente?.nombre, rutaNumero: c.rutaPorSalida.get(String(sal.id)), fecha: dia(sal.creada_en),
      unidades: ls.reduce((t, l) => t + Number(l.cantidad), 0), lineas: ls.length, ordenNumero: orden ? String(orden.numero) : undefined,
      etapa: etapaDeSalida({ estado: sal.estado as 'ABIERTA', lineas: ls.map((l) => ({ estado: l.estado as EstadoLineaSalida })), orden: ol ? { lineas: ol } : null }),
    }
  }

  async listarSalidas(): Promise<SalidaResumen[]> {
    const c = await this.contexto()
    return c.salidas.map((x) => this.resumenSalida(c, x)).sort((a, b) => b.numero.localeCompare(a.numero))
  }

  async obtenerSalida(id: string): Promise<SalidaVista | null> {
    const c = await this.contexto()
    const sal = c.salidas.find((x) => String(x.id) === id)
    if (!sal) return null
    const ids = c.lineas.filter((l) => String(l.salida_id) === id).map((l) => String(l.id))
    const { data } = await sch().from('cambios_lote_asignado').select('*').in('linea_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).order('en', { ascending: false })
    const filas = (data ?? []) as Fila[]
    const nombres = await nombresDe([...filas.map((f) => String(f.por)), String(sal.creada_por)])
    const texto = (v: unknown) => ((Array.isArray(v) ? v : []) as { lote?: string; cantidad: number }[]).map((x) => `${x.lote ?? '?'} × ${x.cantidad}`).join(' + ')
    const cambios: CambioFefoVista[] = filas.map((f) => ({ lineaId: String(f.linea_id), en: String(f.en), por: nombres.get(String(f.por)) ?? 'Usuario', anterior: texto(f.asignacion_anterior), nueva: texto(f.asignacion_nueva), distintoDeFefo: Boolean(f.distinto_de_fefo), motivo: s(f.motivo) }))
    return {
      ...this.resumenSalida(c, sal), estado: sal.estado as SalidaVista['estado'], creadaPor: nombres.get(String(sal.creada_por)) ?? 'Usuario',
      lineasDetalle: c.lineas.filter((l) => String(l.salida_id) === id).map((l) => this.lineaVista(c, l)),
      ordenPickingId: s(c.ordenes.find((o) => String(o.salida_id) === id && o.estado !== 'CANCELADA')?.id), cambios,
    }
  }

  async lotesParaEditar(lineaId: string): Promise<LoteEditable[]> {
    const { data, error } = await sch().rpc('lotes_para_editar', { p_linea: lineaId })
    if (error) throw new Error(mensajeHumano(error))
    return ((data ?? []) as Fila[]).map((f) => ({
      loteId: String(f.lote_id), lote: String(f.lote), vence: f.vence ? dia(f.vence) : null, diasDeVida: f.dias_de_vida == null ? null : Number(f.dias_de_vida), ubicacion: String(f.ubicacion ?? ''),
      ubicaciones: Number(f.ubicaciones), disponible: Number(f.disponible), asignado: Number(f.asignado), sugerido: Boolean(f.sugerido),
    }))
  }

  async editarAsignacion(lineaId: string, asignaciones: AsignacionLote[], motivo: string | undefined, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('editar_asignacion', { p_linea: lineaId, p_asignaciones: asignaciones.map((a) => ({ lote_id: a.loteId, cantidad: a.cantidad })), p_motivo: motivo?.trim() || null })
    return error ? mal(error) : { ok: true }
  }

  async generarOrdenPicking(salidaId: string, _actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const { data, error } = await rpc('generar_orden_picking', { p_salida: salidaId })
    if (error) return mal(error)
    const { data: o } = await sch().from('ordenes_picking').select('numero').eq('id', String(data)).maybeSingle()
    return { ok: true, id: String(data), numero: String((o as Fila | null)?.numero ?? '') }
  }

  async colaPicking(): Promise<OrdenPickingResumen[]> {
    const c = await this.contexto()
    return c.ordenes.filter((o) => o.estado !== 'CANCELADA' && c.ordenLineas.some((l) => String(l.orden_id) === String(o.id) && (l.picking !== 'PICKEADA' || l.conformidad === 'OBSERVADA'))).map((o) => this.resumenOrden(c, o))
  }

  async colaConformidad(): Promise<OrdenPickingResumen[]> {
    const c = await this.contexto()
    return c.ordenes.filter((o) => o.estado !== 'CANCELADA' && c.ordenLineas.some((l) => String(l.orden_id) === String(o.id) && l.picking === 'PICKEADA' && l.conformidad !== 'CONFORME')).map((o) => this.resumenOrden(c, o))
  }

  async obtenerOrdenPicking(id: string): Promise<OrdenPickingVista | null> {
    const c = await this.contexto()
    const o = c.ordenes.find((x) => String(x.id) === id)
    if (!o) return null
    const ls = c.ordenLineas.filter((x) => String(x.orden_id) === id)
    const nombres = await nombresDe([String(o.generada_por), ...ls.flatMap((l) => [s(l.picker_id), s(l.verificador_id)])])
    const lineasDetalle: LineaPickingVista[] = ls.map((l) => {
      const p = c.productos.get(String(l.producto_id)); const lt = c.lotes.get(String(l.lote_id))
      return {
        id: String(l.id), lineaId: String(l.linea_id), ubicacion: String(c.posiciones.get(String(l.posicion_id))?.codigo ?? ''), ordenRecorrido: Number(l.orden_recorrido ?? 0), productoCodigo: String(p?.codigo ?? ''), producto: String(p?.descripcion ?? ''),
        lote: String(lt?.codigo ?? ''), vence: lt?.vence ? dia(lt.vence) : null, cantidad: Number(l.cantidad), picking: l.picking as ResultadoPicking, picker: l.picker_id ? nombres.get(String(l.picker_id)) : undefined, pickerId: s(l.picker_id),
        pickeadaEn: s(l.pickeada_en), notaPicking: s(l.nota_picking), conformidad: l.conformidad as ResultadoConformidad, verificador: l.verificador_id ? nombres.get(String(l.verificador_id)) : undefined,
        verificadaEn: s(l.verificada_en), notaConformidad: s(l.nota_conformidad), noConformidad: (s(l.no_conformidad) as TipoNoConformidad | undefined),
      }
    }).sort((a, b) => a.ordenRecorrido - b.ordenRecorrido || a.ubicacion.localeCompare(b.ubicacion, 'es', { numeric: true }))
    return { ...this.resumenOrden(c, o), salidaId: String(o.salida_id), generadaPor: nombres.get(String(o.generada_por)) ?? 'Usuario', lineasDetalle }
  }

  async registrarPicking(ordenLineaId: string, resultado: 'PICKEADA' | 'DISCREPANCIA', nota: string | undefined, _actor: Actor): Promise<ResultadoAccion> {
    const cantidad = resultado === 'PICKEADA' ? Number(((await sch().from('ordenes_picking_lineas').select('cantidad').eq('id', ordenLineaId).maybeSingle()).data as Fila | null)?.cantidad) : null
    const { error } = await rpc('registrar_picking', { p_orden_linea: ordenLineaId, p_resultado: resultado, p_cantidad: cantidad, p_nota: nota?.trim() || null })
    return error ? mal(error) : { ok: true }
  }

  async proponerReemplazo(ordenLineaId: string): Promise<ReemplazoVista[]> {
    const { data: ol } = await sch().from('ordenes_picking_lineas').select('linea_id, lote_id').eq('id', ordenLineaId).maybeSingle()
    if (!ol) return []
    const { data, error } = await sch().rpc('proponer_reemplazo', { p_linea: (ol as Fila).linea_id, p_lote: (ol as Fila).lote_id })
    if (error) throw new Error(mensajeHumano(error))
    return ((data ?? []) as Fila[]).map((f) => ({ posicionId: String(f.posicion_id), posicion: String(f.posicion), loteId: String(f.lote_id), lote: String(f.lote), vence: f.vence ? dia(f.vence) : null, disponible: Number(f.disponible), motivo: f.motivo as ReemplazoVista['motivo'] }))
  }

  async resolverDiscrepancia(ordenLineaId: string, loteId: string, posicionId: string | undefined, nota: string | undefined, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('resolver_discrepancia_picking', { p_orden_linea: ordenLineaId, p_lote: loteId, p_posicion: posicionId ?? null, p_nota: nota?.trim() || null })
    return error ? mal(error) : { ok: true }
  }

  async darConformidad(ordenLineaId: string, resultado: 'CONFORME' | 'OBSERVADA', nota: string | undefined, tipo: TipoNoConformidad | undefined, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('dar_conformidad', { p_orden_linea: ordenLineaId, p_resultado: resultado, p_nota: nota?.trim() || null, p_staging: null, p_tipo: tipo ?? null })
    return error ? mal(error) : { ok: true }
  }

  async reabrirObservada(ordenLineaId: string, nota: string | undefined, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('reabrir_observada', { p_orden_linea: ordenLineaId, p_nota: nota?.trim() || null })
    return error ? mal(error) : { ok: true }
  }

  async reporteCambiosFefo(desde: string | undefined, hasta: string | undefined, _actor: Actor): Promise<ResultadoAccion<{ filas: CambioFefoPersona[] }>> {
    const { data, error } = await rpc('reporte_cambios_fefo', { p_desde: desde ?? null, p_hasta: hasta ?? null })
    if (error) return mal(error)
    const filas = (data ?? []) as Fila[]
    const nombres = await nombresDe(filas.map((f) => String(f.persona_id)))
    return { ok: true, filas: filas.map((f) => ({ personaId: String(f.persona_id), persona: nombres.get(String(f.persona_id)) ?? 'Usuario', veces: Number(f.veces), lineas: Number(f.lineas), unidades: Number(f.unidades), primeraEn: String(f.primera_en), ultimaEn: String(f.ultima_en) })) }
  }
}
