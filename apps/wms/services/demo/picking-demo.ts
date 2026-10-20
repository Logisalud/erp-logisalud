// Asignación editable de lotes, picking, discrepancias y conformidad en memoria (modo demostración). Mismas reglas que las migraciones 0012, 0013 y 0018.
import {
  ETIQUETA_ETAPA, avancePicking, etapaDeSalida, puedeCambiarLote, puedeDarConformidad, puedePickear, puedePrepararSalidas, puedeVerCambiosFefo, NO_CONFORMIDADES,
  type AsignacionVista, type CambioFefoPersona, type CambioFefoVista, type EstadoOrdenPicking, type LineaPickingVista, type LineaSalidaVista, type LoteEditable,
  validarConformidadOrden, type AjusteConformidadVista, type OrdenPickingResumen, type OrdenPickingVista, type PersonaPicking, type ReemplazoVista, type ResultadoLineaConformidad, type ResultadoConformidad, type ResultadoPicking, type SalidaResumen, type SalidaVista, type TipoNoConformidad,
} from '@/domain/despacho'
import { loteApto, seApartaDeFefo, validarEdicionAsignacion, type AsignacionLote, type LoteDisponible } from '@/domain/salidas'
import { mensajeLoteEnReserva } from '@/domain/reserva'
import { PERSONAS_DEMO, nombrePersonaDemo } from '@/lib/sesion-demo'
import type { Posicion } from '@/domain/tipos'
import { registrar, type EstadoDemo } from './estado'
import { ahora, estadoE, falla, nuevoId } from './entradas-demo'
import { ReservasDemo } from './reservas-demo'
import { celdasLibres, desp, loteEnReserva, lotesDisponibles, reservarEnLote, type LineaSalidaDemo, type ReservaDemo, type SalidaDemo } from './despacho-demo'
import { moverSaldo, origenDe } from './inventario-demo'
import { anotar, numeroDe } from './libro'
import type { RepositorioPicking } from '../repositorio-picking'
import type { Actor, ResultadoAccion } from '../repositorio'

export interface OrdenLineaDemo {
  id: string; lineaId: string; reservaId: string; posicionId: string; productoId: string; loteId: string; cantidad: number
  picking: ResultadoPicking; pickerId?: string; picker?: string; pickeadaEn?: string; notaPicking?: string
  conformidad: ResultadoConformidad; verificadorId?: string; verificador?: string; verificadaEn?: string; notaConformidad?: string; noConformidad?: TipoNoConformidad
}
export interface OrdenDemo { id: string; numero: string; salidaId: string; estado: EstadoOrdenPicking; generadaPor: string; generadaEn: string; lineas: OrdenLineaDemo[]; pickerId?: string; picker?: string }
export interface CambioFefoDemo { id: string; lineaId: string; en: string; porId: string; por: string; anterior: AsignacionLote[]; nueva: AsignacionLote[]; fefo: AsignacionLote[]; distinto: boolean; motivo?: string }
export interface PickingDemoEstado { ordenes: OrdenDemo[]; cambios: CambioFefoDemo[]; discrepancias: { ordenId: string; lineaId: string; loteId: string; nota: string; resueltaPor: string; en: string }[]; ajustes?: AjusteConformidadVista[]; observaciones: { ordenLineaId: string; tipo?: string; nota: string; por: string; corregidaPor: string; en: string }[] }

export function pk(e: EstadoDemo): PickingDemoEstado {
  const d = desp(e)
  if (!d.picking) d.picking = { ordenes: [], cambios: [], discrepancias: [], observaciones: [] }
  return d.picking
}

const rango = (e: EstadoDemo) => {
  const orden = [...e.panorama.posiciones].sort((a, b) => a.rack.localeCompare(b.rack) || (a.posicion ?? 0) - (b.posicion ?? 0) || (a.nivel ?? 0) - (b.nivel ?? 0) || (a.subnivel ?? 0) - (b.subnivel ?? 0) || a.codigo.localeCompare(b.codigo))
  return new Map(orden.map((p, i) => [p.id, i + 1]))
}
const codigoPos = (e: EstadoDemo, id: string) => e.panorama.posiciones.find((p) => p.id === id)?.codigo ?? id
const lote = (e: EstadoDemo, id: string) => e.panorama.lotes.find((l) => l.id === id)
const prod = (e: EstadoDemo, id: string) => e.panorama.productos.find((p) => p.id === id)
const salidaDe = (e: EstadoDemo, id: string) => desp(e).salidas.find((s) => s.id === id)
const lineaDe = (e: EstadoDemo, lineaId: string): { s: SalidaDemo; l: LineaSalidaDemo } | undefined => {
  for (const s of desp(e).salidas) { const l = s.lineas.find((x) => x.id === lineaId); if (l) return { s, l } }
  return undefined
}
const vigentes = (e: EstadoDemo, lineaId: string, estados: ReservaDemo['estado'][] = ['ACTIVA']) => desp(e).reservas.filter((r) => r.lineaId === lineaId && estados.includes(r.estado))

/** La asignación vigente de una línea (por lote), con sus ubicaciones. */
function asignacionDe(e: EstadoDemo, lineaId: string, estados: ReservaDemo['estado'][] = ['ACTIVA', 'EN_TRANSITO', 'EN_STAGING']): AsignacionVista[] {
  const por = new Map<string, AsignacionVista>()
  for (const r of vigentes(e, lineaId, estados)) {
    const lt = lote(e, r.loteId)
    const a = por.get(r.loteId) ?? { loteId: r.loteId, lote: lt?.codigo ?? r.loteId, vence: lt?.vence ?? null, cantidad: 0, ubicaciones: [] }
    a.cantidad += r.cantidad
    const cod = codigoPos(e, r.posicionOrigenId)
    if (!a.ubicaciones.includes(cod)) a.ubicaciones.push(cod)
    por.set(r.loteId, a)
  }
  return [...por.values()].sort((a, b) => (a.vence ?? '9999').localeCompare(b.vence ?? '9999') || a.lote.localeCompare(b.lote))
}
const aLoteCantidad = (a: readonly AsignacionVista[]): AsignacionLote[] => a.map((x) => ({ loteId: x.loteId, cantidad: x.cantidad }))
const nombreLoteCantidad = (e: EstadoDemo, a: readonly AsignacionLote[]) => a.map((x) => `${lote(e, x.loteId)?.codigo ?? x.loteId} × ${x.cantidad}`).join(' + ')

/** Despacho: el stock que pasa la conformidad queda en la ubicación por defecto (K-1) o, si no hubiera, en la primera activa. */
function posicionConformidad(e: EstadoDemo): Posicion {
  const despacho = e.panorama.posiciones.filter((x) => x.tipoArea === 'DESPACHO' && x.activa)
  let p = despacho.find((x) => x.codigo === 'K-1') ?? despacho[0]
  if (!p) {
    p = { id: 'pos:despacho', codigo: 'K-1', rack: 'K', posicion: 1, nivel: null, subnivel: null, forma: 'PISO', tipoArea: 'DESPACHO', activa: true, porVerificar: false }
    e.panorama.posiciones.push(p)
  }
  return p
}

function lineasDeOrden(e: EstadoDemo, salida: SalidaDemo, lineas: readonly LineaSalidaDemo[]): OrdenLineaDemo[] {
  const rk = rango(e)
  const out: OrdenLineaDemo[] = []
  for (const l of lineas) for (const r of vigentes(e, l.id)) out.push({ id: nuevoId(), lineaId: l.id, reservaId: r.id, posicionId: r.posicionId, productoId: r.productoId, loteId: r.loteId, cantidad: r.cantidad, picking: 'PENDIENTE', conformidad: 'PENDIENTE' })
  void salida
  return out.sort((a, b) => (rk.get(a.posicionId) ?? 1e9) - (rk.get(b.posicionId) ?? 1e9) || (lote(e, a.loteId)?.vence ?? '9999').localeCompare(lote(e, b.loteId)?.vence ?? '9999'))
}

function recalcularEstadoOrden(o: OrdenDemo) {
  if (o.estado === 'CANCELADA') return
  o.estado = o.lineas.some((l) => l.picking === 'DISCREPANCIA') ? 'CON_DISCREPANCIA' : o.lineas.every((l) => l.picking === 'PICKEADA') ? 'COMPLETA' : 'EN_CURSO'
}

export class PickingDemo extends ReservasDemo implements RepositorioPicking {
  // ── Vistas ─────────────────────────────────────────────────────────────────────────────────────────────────────
  protected ordenDe(e: EstadoDemo, salidaId: string) { return pk(e).ordenes.find((o) => o.salidaId === salidaId && o.estado !== 'CANCELADA') }

  protected contexto(e: EstadoDemo, s: SalidaDemo) {
    const fila = e.pedidos?.filas.find((f) => f.vigente && f.snapshot.pedidoId === s.pedidoId)
    const ruta = desp(e).rutas.find((r) => r.estado !== 'CANCELADA' && r.paradas.some((p) => p.activa && p.salidaId === s.id))
    // Una orden manual muestra lo que se escribió: el cliente de la venta manual o el propietario de la salida por cuenta de un cliente (SA-2)
    const propietario = e.panorama.propietarios.find((p) => p.id === s.propietarioId)?.razonSocial
    const cliente = fila?.snapshot.cliente.nombre ?? s.clienteManual?.razonSocial ?? (s.tipo === 'CLIENTE' ? propietario : undefined)
    return { pedidoNumero: fila?.snapshot.numero ?? s.pedidoNumero, cliente, rutaNumero: ruta?.numero }
  }

  protected resumenSalida(e: EstadoDemo, s: SalidaDemo): SalidaResumen {
    const o = this.ordenDe(e, s.id)
    const etapa = etapaDeSalida({ estado: s.estado, lineas: s.lineas, orden: o ? { lineas: o.lineas } : null })
    return {
      id: s.id, numero: s.numero, ...this.contexto(e, s), fecha: s.creadaEn.slice(0, 10), unidades: s.lineas.reduce((t, l) => t + l.cantidad, 0), lineas: s.lineas.length, etapa, ordenNumero: o?.numero,
      tipo: s.tipo ?? 'DISTRIBUCION', motivo: s.motivo ?? 'VENTA', origen: s.origen ?? 'PEDIDO', creadaDesde: s.creadaDesde, porConciliar: !!s.porConciliar, creadaPor: nombrePersonaDemo(s.creadaPor),
      enNombreDe: s.enNombreDe ? e.panorama.propietarios.find((p) => p.id === s.enNombreDe)?.razonSocial : undefined,
    }
  }

  private vistaLinea(e: EstadoDemo, l: LineaSalidaDemo, s: SalidaDemo): LineaSalidaVista {
    const p = prod(e, l.productoId)
    const o = pk(e).ordenes.find((x) => x.estado !== 'CANCELADA' && x.lineas.some((y) => y.lineaId === l.id))
    const fefo: AsignacionVista[] = l.fefo.map((f) => ({ loteId: f.loteId, lote: lote(e, f.loteId)?.codigo ?? f.loteId, vence: lote(e, f.loteId)?.vence ?? null, cantidad: f.cantidad, ubicaciones: [] }))
    const asignacion = asignacionDe(e, l.id)
    const empezo = !!o?.lineas.some((y) => y.lineaId === l.id && y.picking !== 'PENDIENTE')
    return {
      id: l.id, productoId: l.productoId, producto: p?.descripcion ?? l.productoId, productoCodigo: p?.codigo ?? '', cantidad: l.cantidad, estado: l.estado, fefo, asignacion,
      apartadaDeFefo: asignacion.length > 0 && l.fefo.length > 0 && seApartaDeFefo(l.fefo, aLoteCantidad(asignacion)), nota: l.nota, editable: (l.estado === 'ASIGNADA' || l.estado === 'EN_PICKING') && !empezo && (s.tipo ?? 'DISTRIBUCION') === 'DISTRIBUCION',
    }
  }

  async listarSalidas(): Promise<SalidaResumen[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    return structuredClone(desp(e).salidas.map((s) => this.resumenSalida(e, s)).sort((a, b) => b.numero.localeCompare(a.numero)))
  }

  async obtenerSalida(id: string): Promise<SalidaVista | null> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const s = salidaDe(e, id)
    if (!s) return null
    const cambios: CambioFefoVista[] = pk(e).cambios.filter((c) => s.lineas.some((l) => l.id === c.lineaId)).map((c) => ({
      lineaId: c.lineaId, en: c.en, por: c.por, anterior: nombreLoteCantidad(e, c.anterior), nueva: nombreLoteCantidad(e, c.nueva), distintoDeFefo: c.distinto, motivo: c.motivo,
    })).sort((a, b) => b.en.localeCompare(a.en))
    return structuredClone({ ...this.resumenSalida(e, s), estado: s.estado, requiereEmbalaje: s.requiereEmbalaje, creadaPor: nombrePersonaDemo(s.creadaPor), lineasDetalle: s.lineas.map((l) => this.vistaLinea(e, l, s)), clienteManual: s.clienteManual, greNumero: s.greNumero, greArchivo: s.greArchivo, ordenPickingId: this.ordenDe(e, s.id)?.id, cambios })
  }

  async lotesParaEditar(lineaId: string): Promise<LoteEditable[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const x = lineaDe(e, lineaId)
    if (!x) return []
    const rk = rango(e)
    const propios = new Map(vigentes(e, lineaId).reduce((m, r) => m.set(r.loteId, (m.get(r.loteId) ?? 0) + r.cantidad), new Map<string, number>()))
    const celdas = celdasLibres(e, x.l.productoId, x.s.propietarioId)
    const todos = new Set([...celdas.keys(), ...propios.keys()])
    const out: LoteEditable[] = []
    for (const id of todos) {
      const lt = lote(e, id); if (!lt) continue
      if (loteEnReserva(e, id)) continue   // un lote en Reserva no se ofrece
      if (!loteApto(lt.vence ?? null, 'DISTRIBUCION', 'VENTA', e.panorama.hoy).apto) continue
      const asignado = propios.get(id) ?? 0
      const libres = celdas.get(id) ?? []
      const disponible = libres.reduce((t, c) => t + c.libre, 0) + asignado
      if (disponible <= 0) continue
      const ubicaciones = [...new Set([...libres.map((c) => c.posicionId), ...vigentes(e, lineaId).filter((r) => r.loteId === id).map((r) => r.posicionOrigenId)])].sort((a, b) => (rk.get(a) ?? 1e9) - (rk.get(b) ?? 1e9))
      out.push({
        loteId: id, lote: lt.codigo, vence: lt.vence ?? null, diasDeVida: lt.vence ? Math.round((Date.parse(`${lt.vence}T00:00:00Z`) - Date.parse(`${e.panorama.hoy}T00:00:00Z`)) / 86_400_000) : null,
        ubicacion: codigoPos(e, ubicaciones[0]), ubicaciones: ubicaciones.length, disponible, asignado, sugerido: x.l.fefo.some((f) => f.loteId === id),
      })
    }
    return out.sort((a, b) => (a.vence ?? '9999').localeCompare(b.vence ?? '9999') || a.lote.localeCompare(b.lote))
  }

  async editarAsignacion(lineaId: string, asignaciones: AsignacionLote[], motivo: string | undefined, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeCambiarLote(actor.roles)) return falla('No tienes permiso para cambiar el lote asignado')
    const x = lineaDe(e, lineaId)
    if (!x) return falla('No encontramos esa línea')
    const { s, l } = x
    if ((s.tipo ?? 'DISTRIBUCION') !== 'DISTRIBUCION') return falla('Los lotes solo se editan en un pedido de venta: en una salida de cliente el lote lo indica el cliente')
    if (l.estado !== 'ASIGNADA' && l.estado !== 'EN_PICKING') return falla('La línea no está asignada o ya salió del picking: no se editan los lotes')
    const o = this.ordenDe(e, s.id)
    if (o?.lineas.some((y) => y.lineaId === l.id && y.picking !== 'PENDIENTE')) return falla('Ya empezó el picking de esta línea: no se editan los lotes')
    const lotes: LoteDisponible[] = (await this.lotesParaEditar(lineaId)).map((v) => ({ loteId: v.loteId, codigo: v.lote, vence: v.vence, disponible: v.disponible }))
    const errores = validarEdicionAsignacion({ cantidadLinea: l.cantidad, hoy: e.panorama.hoy, nueva: asignaciones, lotes })
    if (errores.length) return falla(errores[0], { asignacion: errores.join(' ') })
    const antes = aLoteCantidad(asignacionDe(e, l.id, ['ACTIVA']))
    for (const r of vigentes(e, l.id)) r.estado = 'LIBERADA'
    for (const a of asignaciones) reservarEnLote(e, s, l, a.loteId, a.cantidad)
    const despues = aLoteCantidad(asignacionDe(e, l.id, ['ACTIVA']))
    if (JSON.stringify([...antes].sort((a, b) => a.loteId.localeCompare(b.loteId))) === JSON.stringify([...despues].sort((a, b) => a.loteId.localeCompare(b.loteId)))) return falla('La asignación no cambió')
    pk(e).cambios.push({ id: nuevoId(), lineaId: l.id, en: ahora(), porId: actor.id, por: actor.nombre, anterior: antes, nueva: despues, fefo: l.fefo, distinto: seApartaDeFefo(l.fefo, despues), motivo: motivo?.trim() || undefined })
    if (o) {
      o.lineas = [...o.lineas.filter((y) => y.lineaId !== l.id), ...lineasDeOrden(e, s, [l])]
      const rk = rango(e)
      o.lineas.sort((a, b) => (rk.get(a.posicionId) ?? 1e9) - (rk.get(b.posicionId) ?? 1e9))
    }
    registrar(e, actor, 'asignacion_editada', 'salida_lineas', l.id, `Asignación de ${s.numero}: ${nombreLoteCantidad(e, despues)}`, motivo)
    return { ok: true }
  }

  // ── Picking ───────────────────────────────────────────────────────────────────────────────────────────────────
  async generarOrdenPicking(salidaId: string, actor: Actor, pickerId?: string): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedePrepararSalidas(actor.roles)) return falla('No tienes permiso para preparar salidas')
    const s = salidaDe(e, salidaId)
    if (!s) return falla('No encontramos esa salida')
    if (s.estado !== 'ABIERTA') return falla('La salida ya no está abierta')
    const previa = this.ordenDe(e, s.id)
    if (previa) {
      if (pickerId) { const d = await this.designarPicker(previa.id, pickerId, actor); if (!d.ok) return d }
      return { ok: true, id: previa.id, numero: previa.numero }
    }
    if (pickerId && !this.personaPicking(pickerId)) return falla('Quien pica tiene que ser auxiliar, Jefe de Almacén o Jefe de Transporte')
    if (s.lineas.some((l) => l.estado === 'PENDIENTE' || l.estado === 'SIN_STOCK')) return falla('Hay líneas sin stock o sin asignar: resuélvelas antes del picking')
    const lineas = s.lineas.filter((l) => l.estado === 'ASIGNADA')
    if (!lineas.length) return falla('La salida no tiene líneas asignadas')
    for (const l of lineas) for (const r of vigentes(e, l.id)) if (loteEnReserva(e, r.loteId)) return falla(mensajeLoteEnReserva(lote(e, r.loteId)?.codigo ?? r.loteId))
    const o: OrdenDemo = { id: nuevoId(), numero: numeroDe(e.inv, 'OP', e.panorama.hoy.slice(0, 4)), salidaId: s.id, estado: 'GENERADA', generadaPor: actor.nombre, generadaEn: ahora(), lineas: lineasDeOrden(e, s, lineas), pickerId, picker: pickerId ? this.personaPicking(pickerId)?.nombre : undefined }
    pk(e).ordenes.push(o)
    for (const l of lineas) l.estado = 'EN_PICKING'
    registrar(e, actor, 'orden_de_salida_impresa', 'ordenes_picking', o.numero, `Orden de Salida ${s.numero} impresa${o.picker ? `; pica ${o.picker}` : ''}`)
    return { ok: true, id: o.id, numero: o.numero }
  }

  private personaPicking(id: string): PersonaPicking | undefined {
    const p = PERSONAS_DEMO.find((x) => `demo:${x.clave}` === id && x.roles.some((rol) => rol === 'auxiliar' || rol === 'jefe_almacen' || rol === 'jefe_transporte'))
    return p ? { id, nombre: p.nombre } : undefined
  }

  async personalDePicking(): Promise<PersonaPicking[]> {
    return PERSONAS_DEMO.filter((x) => x.roles.some((rol) => rol === 'auxiliar' || rol === 'jefe_almacen' || rol === 'jefe_transporte')).map((x) => ({ id: `demo:${x.clave}`, nombre: x.nombre }))
  }

  async designarPicker(ordenId: string, pickerId: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeCambiarLote(actor.roles)) return falla('No tienes permiso para indicar quién hace el picking')
    const o = pk(e).ordenes.find((x) => x.id === ordenId)
    if (!o) return falla('No encontramos esa Orden de Salida')
    if (o.estado === 'CANCELADA') return falla('Esa orden está cancelada')
    const p = this.personaPicking(pickerId)
    if (!p) return falla('Quien pica tiene que ser auxiliar, Jefe de Almacén o Jefe de Transporte')
    if (o.lineas.some((l) => l.conformidad !== 'PENDIENTE' && l.cantidad > 0)) return falla('La conformidad ya empezó: quien pica no se cambia')
    o.pickerId = pickerId; o.picker = p.nombre
    registrar(e, actor, 'picker_designado', 'ordenes_picking', o.numero, `Pica ${p.nombre}`)
    return { ok: true }
  }

  private resumenOrden(e: EstadoDemo, o: OrdenDemo): OrdenPickingResumen {
    const s = salidaDe(e, o.salidaId)!
    return {
      id: o.id, numero: o.numero, salidaNumero: s.numero, ...this.contexto(e, s), estado: o.estado, lineas: o.lineas.length, unidades: o.lineas.reduce((t, l) => t + l.cantidad, 0),
      pickeadas: o.lineas.filter((l) => l.picking === 'PICKEADA').length, conformes: o.lineas.filter((l) => l.conformidad === 'CONFORME').length,
      observadas: o.lineas.filter((l) => l.conformidad === 'OBSERVADA').length, discrepancias: o.lineas.filter((l) => l.picking === 'DISCREPANCIA').length, generadaEn: o.generadaEn,
      pickerId: o.pickerId, picker: o.picker,
    }
  }

  async colaPicking(): Promise<OrdenPickingResumen[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    return structuredClone(pk(e).ordenes.filter((o) => o.estado !== 'CANCELADA' && o.lineas.some((l) => l.picking !== 'PICKEADA' || l.conformidad === 'OBSERVADA')).map((o) => this.resumenOrden(e, o)))
  }

  async colaConformidad(): Promise<OrdenPickingResumen[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    return structuredClone(pk(e).ordenes.filter((o) => o.estado !== 'CANCELADA' && o.lineas.some((l) => l.conformidad === 'PENDIENTE' && l.picking !== 'DISCREPANCIA')).map((o) => this.resumenOrden(e, o)))
  }

  async obtenerOrdenPicking(id: string): Promise<OrdenPickingVista | null> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const o = pk(e).ordenes.find((x) => x.id === id)
    if (!o) return null
    const rk = rango(e)
    const lineasDetalle: LineaPickingVista[] = o.lineas.map((l) => {
      const p = prod(e, l.productoId); const lt = lote(e, l.loteId)
      return {
        id: l.id, lineaId: l.lineaId, ubicacion: codigoPos(e, l.posicionId), ordenRecorrido: rk.get(l.posicionId) ?? 0, productoCodigo: p?.codigo ?? '', producto: p?.descripcion ?? '', loteId: l.loteId, lote: lt?.codigo ?? '', vence: lt?.vence ?? null,
        cantidad: l.cantidad, picking: l.picking, picker: l.picker, pickerId: l.pickerId, pickeadaEn: l.pickeadaEn, notaPicking: l.notaPicking, conformidad: l.conformidad, verificador: l.verificador, verificadaEn: l.verificadaEn,
        notaConformidad: l.notaConformidad, noConformidad: l.noConformidad,
      }
    })
    const s = salidaDe(e, o.salidaId)!
    const ajustes = (pk(e).ajustes ?? []).filter((a) => o.lineas.some((l) => l.id === a.ordenLineaId))
    return structuredClone({ ...this.resumenOrden(e, o), salidaId: o.salidaId, generadaPor: o.generadaPor, lineasDetalle, requiereEmbalaje: s.requiereEmbalaje, bultosConformidad: s.bultosConformidad, ajustes })
  }

  private lineaOrden(e: EstadoDemo, id: string): { o: OrdenDemo; l: OrdenLineaDemo } | undefined {
    for (const o of pk(e).ordenes) { const l = o.lineas.find((x) => x.id === id); if (l) return { o, l } }
    return undefined
  }

  async registrarPicking(ordenLineaId: string, resultado: 'PICKEADA' | 'DISCREPANCIA', nota: string | undefined, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedePickear(actor.roles)) return falla('No tienes permiso para hacer picking')
    const x = this.lineaOrden(e, ordenLineaId)
    if (!x) return falla('No encontramos esa línea de picking')
    const { o, l } = x
    if (l.picking !== 'PENDIENTE') return falla('Esa línea ya se registró')
    if (o.estado === 'COMPLETA' && o.lineas.every((y) => y.picking === 'PICKEADA')) return falla('La orden de picking ya no está abierta')
    const sl = lineaDe(e, l.lineaId)!
    if (resultado === 'PICKEADA' && loteEnReserva(e, l.loteId)) return falla(mensajeLoteEnReserva(lote(e, l.loteId)?.codigo ?? l.loteId))
    if (resultado === 'PICKEADA') {
      l.picking = 'PICKEADA'; l.pickerId = actor.id; l.picker = actor.nombre; l.pickeadaEn = ahora(); l.notaPicking = nota?.trim() || undefined
      if (!o.pickerId) { o.pickerId = actor.id; o.picker = actor.nombre }
      const r = desp(e).reservas.find((y) => y.id === l.reservaId); if (r?.estado === 'ACTIVA') r.estado = 'EN_TRANSITO'
      if (o.lineas.filter((y) => y.lineaId === l.lineaId).every((y) => y.picking === 'PICKEADA') && sl.l.estado === 'EN_PICKING') sl.l.estado = 'PICKEADA'
    } else if (resultado === 'DISCREPANCIA') {
      if (!nota?.trim()) return falla('Cuéntanos qué pasó (no encontré el lote, faltan unidades, otra ubicación…)', { nota: 'Cuéntanos qué pasó.' })
      l.picking = 'DISCREPANCIA'; l.pickerId = actor.id; l.picker = actor.nombre; l.pickeadaEn = ahora(); l.notaPicking = nota.trim()
    } else return falla('Cada línea se pickea o tiene una discrepancia')
    recalcularEstadoOrden(o)
    registrar(e, actor, 'picking_registrado', 'ordenes_picking_lineas', l.id, `${resultado === 'PICKEADA' ? 'Pickeada' : 'Discrepancia'}: ${codigoPos(e, l.posicionId)} · ${lote(e, l.loteId)?.codigo}`, nota)
    return { ok: true }
  }

  async proponerReemplazo(ordenLineaId: string): Promise<ReemplazoVista[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const x = this.lineaOrden(e, ordenLineaId)
    if (!x) return []
    const { l } = x
    const sl = lineaDe(e, l.lineaId)!
    const rk = rango(e)
    const celdas = celdasLibres(e, sl.l.productoId, sl.s.propietarioId)
    const mismas = (celdas.get(l.loteId) ?? []).filter((c) => c.libre >= l.cantidad && !vigentes(e, l.lineaId, ['ACTIVA', 'EN_TRANSITO']).some((r) => r.loteId === l.loteId && r.posicionId === c.posicionId))
      .sort((a, b) => (rk.get(a.posicionId) ?? 1e9) - (rk.get(b.posicionId) ?? 1e9))
    if (mismas.length) return mismas.map((c) => ({ posicionId: c.posicionId, posicion: c.codigo, loteId: l.loteId, lote: lote(e, l.loteId)?.codigo ?? '', vence: lote(e, l.loteId)?.vence ?? null, disponible: c.libre, motivo: 'MISMO_LOTE_OTRA_UBICACION' as const }))
    const out: ReemplazoVista[] = []
    for (const v of await this.lotesParaEditar(l.lineaId)) {
      if (v.loteId === l.loteId || v.disponible - v.asignado < l.cantidad) continue
      const c = (celdas.get(v.loteId) ?? [])[0]
      if (c) out.push({ posicionId: c.posicionId, posicion: c.codigo, loteId: v.loteId, lote: v.lote, vence: v.vence, disponible: v.disponible - v.asignado, motivo: 'SIGUIENTE_FEFO' })
    }
    return out.slice(0, 5)
  }

  async resolverDiscrepancia(ordenLineaId: string, loteId: string, posicionId: string | undefined, nota: string | undefined, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeCambiarLote(actor.roles)) return falla('No tienes permiso para cambiar el lote asignado')
    const x = this.lineaOrden(e, ordenLineaId)
    if (!x) return falla('No encontramos esa línea de picking')
    const { o, l } = x
    if (l.picking !== 'DISCREPANCIA') return falla('Esa línea no tiene una discrepancia por resolver')
    const sl = lineaDe(e, l.lineaId)!
    const lt = lote(e, loteId)
    if (!lt || lt.productoId !== sl.l.productoId || lt.propietarioId !== sl.s.propietarioId) return falla('Ese lote no corresponde al producto de la línea')
    const apto = loteApto(lt.vence ?? null, 'DISTRIBUCION', 'VENTA', e.panorama.hoy)
    if (!apto.apto) return falla(`Lote ${lt.codigo}: ${apto.razon}`)
    const celdas = celdasLibres(e, sl.l.productoId, sl.s.propietarioId)
    const reservaVieja = desp(e).reservas.find((r) => r.id === l.reservaId)!
    const antes = aLoteCantidad(asignacionDe(e, sl.l.id, ['ACTIVA']))
    // las unidades que el picker no encontró dejan de estar comprometidas (para comprobar disponibilidad sin ellas)
    reservaVieja.estado = 'LIBERADA'
    const deshacer = () => { reservaVieja.estado = 'ACTIVA' }
    const nuevasReservas: ReservaDemo[] = []
    if (loteId === l.loteId) {
      if (!posicionId || posicionId === l.posicionId) { deshacer(); return falla('Elige otra ubicación para el mismo lote') }
      const c = (celdasLibres(e, sl.l.productoId, sl.s.propietarioId).get(loteId) ?? []).find((y) => y.posicionId === posicionId)
      if (!c || c.libre < l.cantidad) { deshacer(); return falla(`Esa ubicación no tiene ${l.cantidad} unidades disponibles de ese lote`) }
      const r: ReservaDemo = { id: nuevoId(), lineaId: sl.l.id, salidaId: sl.s.id, productoId: sl.l.productoId, loteId, posicionId, posicionOrigenId: posicionId, procedenciaId: c.procedenciaId, cantidad: l.cantidad, estado: 'ACTIVA' }
      desp(e).reservas.push(r); nuevasReservas.push(r)
    } else {
      const libre = (celdasLibres(e, sl.l.productoId, sl.s.propietarioId).get(loteId) ?? []).reduce((t, c) => t + c.libre, 0)
      if (libre < l.cantidad) { deshacer(); return falla(`El lote ${lt.codigo} no tiene ${l.cantidad} unidades disponibles`) }
      const previas = new Set(desp(e).reservas.map((r) => r.id))
      reservarEnLote(e, sl.s, sl.l, loteId, l.cantidad)
      nuevasReservas.push(...desp(e).reservas.filter((r) => !previas.has(r.id)))
    }
    void celdas
    pk(e).discrepancias.push({ ordenId: o.id, lineaId: sl.l.id, loteId: l.loteId, nota: l.notaPicking ?? 'Sin nota', resueltaPor: actor.nombre, en: ahora() })
    const rk = rango(e)
    o.lineas = o.lineas.filter((y) => y.id !== l.id)
    o.lineas.push(...nuevasReservas.map((r) => ({ id: nuevoId(), lineaId: r.lineaId, reservaId: r.id, posicionId: r.posicionId, productoId: r.productoId, loteId: r.loteId, cantidad: r.cantidad, picking: 'PENDIENTE' as const, conformidad: 'PENDIENTE' as const })))
    o.lineas.sort((a, b) => (rk.get(a.posicionId) ?? 1e9) - (rk.get(b.posicionId) ?? 1e9))
    const despues = aLoteCantidad(asignacionDe(e, sl.l.id, ['ACTIVA']))
    const distinto = seApartaDeFefo(sl.l.fefo, aLoteCantidad(asignacionDe(e, sl.l.id)))
    if (distinto) pk(e).cambios.push({ id: nuevoId(), lineaId: sl.l.id, en: ahora(), porId: actor.id, por: actor.nombre, anterior: antes, nueva: despues, fefo: sl.l.fefo, distinto: true, motivo: nota?.trim() || undefined })
    recalcularEstadoOrden(o)
    registrar(e, actor, 'discrepancia_picking_resuelta', 'ordenes_picking_lineas', ordenLineaId, `Reemplazo: ${lt.codigo}${posicionId ? ` en ${codigoPos(e, posicionId)}` : ''}`, nota)
    return { ok: true }
  }

  // ── Conformidad ───────────────────────────────────────────────────────────────────────────────────────────────
  async darConformidad(ordenLineaId: string, resultado: 'CONFORME' | 'OBSERVADA', nota: string | undefined, tipo: TipoNoConformidad | undefined, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeDarConformidad(actor.roles)) return falla('No tienes permiso para dar la conformidad')
    const x = this.lineaOrden(e, ordenLineaId)
    if (!x) return falla('No encontramos esa línea de picking')
    const { o, l } = x
    if (l.picking !== 'PICKEADA') return falla('Esa línea todavía no se pickeó')
    if (l.conformidad !== 'PENDIENTE') return falla('Esa línea ya tiene su conformidad')
    if (l.pickerId === actor.id) return falla('La conformidad la da otra persona, no quien hizo el picking')
    const sl = lineaDe(e, l.lineaId)!
    if (resultado === 'OBSERVADA') {
      if (!nota?.trim()) return falla('Cuéntanos qué observas (producto, lote, cantidad, estado del embalaje…)', { nota: 'Cuéntanos qué observas.' })
      if (tipo && !NO_CONFORMIDADES.includes(tipo)) return falla('Ese tipo de no conformidad no existe')
      l.conformidad = 'OBSERVADA'; l.verificadorId = actor.id; l.verificador = actor.nombre; l.verificadaEn = ahora(); l.notaConformidad = nota.trim(); l.noConformidad = tipo
      sl.l.estado = 'OBSERVADA'
      registrar(e, actor, 'conformidad_observada', 'ordenes_picking_lineas', l.id, `Observada: ${tipo ?? 'sin tipo'}`, nota)
      return { ok: true }
    }
    if (resultado !== 'CONFORME') return falla('La conformidad es CONFORME u OBSERVADA')
    const mal = this.pasarADespacho(e, o, l, sl, actor)
    if (mal) return falla(mal)
    l.conformidad = 'CONFORME'; l.verificadorId = actor.id; l.verificador = actor.nombre; l.verificadaEn = ahora(); l.notaConformidad = nota?.trim() || undefined; l.noConformidad = undefined
    if (o.lineas.filter((y) => y.lineaId === l.lineaId).every((y) => y.conformidad === 'CONFORME')) sl.l.estado = 'CONFORME'
    registrar(e, actor, 'conformidad_dada', 'ordenes_picking_lineas', l.id, `Conforme: ${lote(e, l.loteId)?.codigo} pasa a Despacho`, nota)
    return { ok: true }
  }

  /** Las unidades de una línea de la orden pasan del rack a Despacho (movimiento del libro: lo ejecutó quien picó y lo verifica quien da la conformidad). */
  private pasarADespacho(e: EstadoDemo, o: OrdenDemo, l: OrdenLineaDemo, sl: { s: SalidaDemo; l: LineaSalidaDemo }, actor: Actor): string | null {
    const r = desp(e).reservas.find((y) => y.id === l.reservaId)
    if (r?.estado === 'ACTIVA') r.estado = 'EN_TRANSITO'
    if (!r || r.estado !== 'EN_TRANSITO') return 'Esas unidades no están en tránsito a conformidad'
    const stg = posicionConformidad(e)
    const lt = lote(e, r.loteId)!
    const movido = moverSaldo(e, { loteId: r.loteId, productoId: r.productoId, propietarioId: lt.propietarioId, estado: 'APROBADO', procedenciaId: r.procedenciaId, desdePosicionId: r.posicionId, haciaPosicionId: stg.id, cantidad: r.cantidad })
    if (!movido) return 'Saldo insuficiente: alguien más ya movió esas unidades'
    const base = { productoId: r.productoId, loteId: r.loteId, propietarioId: lt.propietarioId, estado: 'APROBADO' as const, origen: origenDe(e, r.loteId, r.procedenciaId), procedenciaId: r.procedenciaId }
    anotar(e.inv, `mov-conf-${o.numero}-${l.id.slice(-6)}`, 'MOVIMIENTO', ahora(), { motivo: `Conformidad de la Orden de Salida ${sl.s.numero}`, ejecutorId: l.pickerId ?? o.pickerId, preparadorId: l.pickerId ?? o.pickerId, verificadorId: actor.id, referenciaTipo: 'salida_linea', referenciaId: sl.l.id },
      [{ ...base, posicionId: r.posicionId, delta: -r.cantidad }, { ...base, posicionId: stg.id, delta: r.cantidad }])
    r.estado = 'EN_STAGING'; r.posicionId = stg.id
    return null
  }

  async conformarOrden(ordenId: string, lineas: ResultadoLineaConformidad[], bultos: number, nota: string | undefined, actor: Actor): Promise<ResultadoAccion<{ unidades: number; bultos: number; ajustes: number; requiereEmbalaje: boolean }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeDarConformidad(actor.roles)) return falla('No tienes permiso para dar la conformidad')
    const o = pk(e).ordenes.find((x) => x.id === ordenId)
    if (!o || o.estado === 'CANCELADA') return falla('No encontramos esa Orden de Salida')
    const s = salidaDe(e, o.salidaId)!
    if (s.estado !== 'ABIERTA') return falla('La Orden de Salida ya no está abierta')
    if (!o.pickerId) return falla('Antes de la conformidad se indica quién hizo el picking (al imprimir la orden o al iniciarla)')
    if (o.pickerId === actor.id || o.lineas.some((l) => l.pickerId === actor.id)) return falla('La conformidad la da otra persona, no quien hizo el picking')
    if (o.lineas.some((l) => l.picking === 'DISCREPANCIA')) return falla('Hay una línea con discrepancia de picking: resuélvela antes de la conformidad')
    if (o.lineas.some((l) => l.conformidad === 'OBSERVADA')) return falla('Hay una línea observada: corrígela antes de la conformidad')
    const pendientes = o.lineas.filter((l) => l.conformidad === 'PENDIENTE')
    if (!pendientes.length) return falla('Esta Orden de Salida ya tiene su conformidad')
    if (lineas.some((r) => !pendientes.some((l) => l.id === r.ordenLineaId))) return falla('Una de las líneas no es de esta Orden de Salida o ya tiene su conformidad')
    const err = validarConformidadOrden(pendientes.map((l) => ({ id: l.id, cantidad: l.cantidad, lote: lote(e, l.loteId)?.codigo ?? '' })), lineas, bultos)
    if (err) return falla(err)
    // Las reglas del otro lote, antes de tocar nada (todo o nada)
    const usado = new Map<string, number>()
    for (const r of lineas.filter((x) => x.resultado === 'OTRO_LOTE')) {
      const l = pendientes.find((y) => y.id === r.ordenLineaId)!
      const lt = lote(e, r.loteId!)
      if (!lt || lt.productoId !== l.productoId || lt.propietarioId !== s.propietarioId) return falla('Ese lote no corresponde al producto de la línea')
      if (lt.id === l.loteId) return falla('Es el mismo lote: usa «Menos cantidad» o «No lo encontré»')
      const apto = loteApto(lt.vence ?? null, 'DISTRIBUCION', 'VENTA', e.panorama.hoy)
      if (!apto.apto) return falla(`Lote ${lt.codigo}: ${apto.razon}`)
      if (loteEnReserva(e, lt.id)) return falla(`El lote ${lt.codigo} está en Reserva: no se puede usar`)
      const c = r.cantidad ?? l.cantidad
      usado.set(lt.id, (usado.get(lt.id) ?? 0) + c)
      const libre = (celdasLibres(e, l.productoId, s.propietarioId).get(lt.id) ?? []).reduce((t, x) => t + x.libre, 0)
      if (libre < usado.get(lt.id)!) return falla(`El lote ${lt.codigo} no tiene ${c} unidades disponibles`)
    }

    const ajustes = (pk(e).ajustes ??= [])
    const picker = o.picker
    let hechos = 0
    const cierre = (l: OrdenLineaDemo, n?: string) => { l.conformidad = 'CONFORME'; l.verificadorId = actor.id; l.verificador = actor.nombre; l.verificadaEn = ahora(); l.notaConformidad = n }
    const picado = (l: OrdenLineaDemo) => { l.picking = 'PICKEADA'; l.pickerId ??= o.pickerId; l.picker ??= picker; l.pickeadaEn ??= ahora() }
    for (const l of pendientes) {
      const sl = lineaDe(e, l.lineaId)!
      const r = lineas.find((x) => x.ordenLineaId === l.id) ?? { ordenLineaId: l.id, resultado: 'CONFORME' as const }
      const n = r.nota?.trim() || undefined
      const reserva = desp(e).reservas.find((y) => y.id === l.reservaId)!
      if (r.resultado === 'NO_ENCONTRADO') {
        ajustes.push({ ordenLineaId: l.id, tipo: 'NO_ENCONTRADO', loteAntes: lote(e, l.loteId)?.codigo, cantidadAntes: l.cantidad, cantidadDespues: 0, nota: n, por: actor.nombre, en: ahora() })
        reserva.estado = 'LIBERADA'; picado(l); l.cantidad = 0; cierre(l, n ?? 'No se encontró'); hechos += 1
      } else if (r.resultado === 'OTRO_LOTE') {
        const c = r.cantidad ?? l.cantidad
        const lt = lote(e, r.loteId!)!
        const antes = aLoteCantidad(asignacionDe(e, sl.l.id))
        ajustes.push({ ordenLineaId: l.id, tipo: 'OTRO_LOTE', loteAntes: lote(e, l.loteId)?.codigo, loteDespues: lt.codigo, cantidadAntes: l.cantidad, cantidadDespues: c, nota: n, por: actor.nombre, en: ahora() })
        reserva.estado = 'LIBERADA'; picado(l); l.cantidad = 0; cierre(l, `Reemplazada por el lote ${lt.codigo}`)
        const previas = new Set(desp(e).reservas.map((y) => y.id))
        reservarEnLote(e, sl.s, sl.l, lt.id, c)
        for (const nr of desp(e).reservas.filter((y) => !previas.has(y.id))) {
          const nl: OrdenLineaDemo = { id: nuevoId(), lineaId: nr.lineaId, reservaId: nr.id, posicionId: nr.posicionId, productoId: nr.productoId, loteId: nr.loteId, cantidad: nr.cantidad, picking: 'PENDIENTE', conformidad: 'PENDIENTE' }
          o.lineas.push(nl); picado(nl)
          const mal = this.pasarADespacho(e, o, nl, sl, actor)
          if (mal) return falla(mal)
          cierre(nl, n)
        }
        const despues = aLoteCantidad(asignacionDe(e, sl.l.id))
        if (seApartaDeFefo(sl.l.fefo, despues)) pk(e).cambios.push({ id: nuevoId(), lineaId: sl.l.id, en: ahora(), porId: actor.id, por: actor.nombre, anterior: antes, nueva: despues, fefo: sl.l.fefo, distinto: true, motivo: n ?? 'Otro lote en la conformidad' })
        hechos += 1
      } else {
        if (r.resultado === 'MENOS') {
          ajustes.push({ ordenLineaId: l.id, tipo: 'MENOS', loteAntes: lote(e, l.loteId)?.codigo, loteDespues: lote(e, l.loteId)?.codigo, cantidadAntes: l.cantidad, cantidadDespues: r.cantidad!, nota: n, por: actor.nombre, en: ahora() })
          reserva.cantidad = r.cantidad!; l.cantidad = r.cantidad!; hechos += 1
        }
        picado(l)
        const mal = this.pasarADespacho(e, o, l, sl, actor)
        if (mal) return falla(mal)
        cierre(l, n)
      }
    }
    for (const sl of s.lineas) if (['EN_PICKING', 'PICKEADA', 'OBSERVADA'].includes(sl.estado) && o.lineas.filter((y) => y.lineaId === sl.id).every((y) => y.conformidad === 'CONFORME')) sl.estado = 'CONFORME'
    o.estado = 'COMPLETA'
    s.bultosConformidad = bultos
    if (!s.requiereEmbalaje) {
      const lista = (desp(e).bultos ??= [])
      for (let i = 1; i <= bultos; i++) lista.push({ id: nuevoId(), salidaId: s.id, codigo: `${s.numero}-B${i}`, secuencia: i, total: bultos, estado: 'EMBALADO', contenido: [], unidades: 0, embaladoPor: actor.nombre, embaladoEn: ahora() })
    }
    const unidades = o.lineas.filter((l) => l.conformidad === 'CONFORME').reduce((t, l) => t + l.cantidad, 0)
    registrar(e, actor, 'orden_de_salida_conformada', 'ordenes_picking', o.numero, `${s.numero}: ${unidades} u conformes en ${bultos} ${bultos === 1 ? 'bulto' : 'bultos'}${hechos ? `, ${hechos} ajuste(s)` : ''}`, nota)
    return { ok: true, unidades, bultos, ajustes: lineas.filter((x) => x.resultado !== 'CONFORME').length, requiereEmbalaje: s.requiereEmbalaje }
  }

  /** Caso 2 de la anulación de una guía: las unidades vuelven de Despacho a su ubicación (movimiento del libro) y las líneas vuelven a conformidad. Devuelve el motivo si no se puede. */
  protected reabrirConformidadDe(e: EstadoDemo, salidaId: string, motivo: string, actor: Actor): string | null {
    const o = pk(e).ordenes.find((x) => x.salidaId === salidaId && x.estado !== 'CANCELADA')
    const s = salidaDe(e, salidaId)
    if (!o || !s) return 'Esa salida no tiene Orden de Salida'
    const lineas = o.lineas.filter((l) => l.conformidad === 'CONFORME' && l.cantidad > 0)
    const reservas = lineas.map((l) => desp(e).reservas.find((y) => y.id === l.reservaId))
    if (reservas.some((r) => !r || r.estado !== 'EN_STAGING')) return 'Esas unidades ya no están en Despacho: no se puede reabrir la conformidad'
    lineas.forEach((l, i) => {
      const r = reservas[i]!
      const lt = lote(e, r.loteId)!
      moverSaldo(e, { loteId: r.loteId, productoId: r.productoId, propietarioId: lt.propietarioId, estado: 'APROBADO', procedenciaId: r.procedenciaId, desdePosicionId: r.posicionId, haciaPosicionId: r.posicionOrigenId, cantidad: r.cantidad })
      const base = { productoId: r.productoId, loteId: r.loteId, propietarioId: lt.propietarioId, estado: 'APROBADO' as const, origen: origenDe(e, r.loteId, r.procedenciaId), procedenciaId: r.procedenciaId }
      anotar(e.inv, `mov-reab-${o.numero}-${l.id.slice(-6)}`, 'MOVIMIENTO', ahora(), { motivo: `Se reabrió la conformidad de ${s.numero}: ${motivo}`, ejecutorId: actor.id, preparadorId: o.pickerId, referenciaTipo: 'salida_linea', referenciaId: l.lineaId },
        [{ ...base, posicionId: r.posicionId, delta: -r.cantidad }, { ...base, posicionId: r.posicionOrigenId, delta: r.cantidad }])
      r.estado = 'ACTIVA'; r.posicionId = r.posicionOrigenId
      l.conformidad = 'PENDIENTE'; l.verificadorId = undefined; l.verificador = undefined; l.verificadaEn = undefined; l.notaConformidad = undefined
    })
    for (const sl of s.lineas) if (sl.estado === 'CONFORME') sl.estado = 'PICKEADA'
    o.estado = 'EN_CURSO'
    s.bultosConformidad = undefined
    const bultos = (desp(e).bultos ??= [])
    for (const b of bultos.filter((x) => x.salidaId === s.id && x.estado === 'EMBALADO')) { b.estado = 'ANULADO'; b.anuladoEn = ahora(); b.anuladoMotivo = `Se reabrió la conformidad: ${motivo}` }
    return null
  }

  async reabrirObservada(ordenLineaId: string, nota: string | undefined, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedePickear(actor.roles)) return falla('No tienes permiso para corregir una línea observada')
    const x = this.lineaOrden(e, ordenLineaId)
    if (!x) return falla('No encontramos esa línea de picking')
    const { o, l } = x
    if (l.conformidad !== 'OBSERVADA') return falla('Esa línea no está observada')
    pk(e).observaciones.push({ ordenLineaId: l.id, tipo: l.noConformidad, nota: l.notaConformidad ?? '', por: l.verificador ?? '', corregidaPor: actor.nombre, en: ahora() })
    Object.assign(l, { picking: 'PENDIENTE', pickerId: undefined, picker: undefined, pickeadaEn: undefined, notaPicking: undefined, conformidad: 'PENDIENTE', verificadorId: undefined, verificador: undefined, verificadaEn: undefined, notaConformidad: undefined, noConformidad: undefined })
    const sl = lineaDe(e, l.lineaId)!
    if (sl.l.estado === 'OBSERVADA') sl.l.estado = 'EN_PICKING'
    if (o.estado === 'COMPLETA') o.estado = 'EN_CURSO'
    registrar(e, actor, 'observacion_corregida', 'ordenes_picking_lineas', l.id, 'La línea observada vuelve a picking', nota)
    return { ok: true }
  }

  async reporteCambiosFefo(desde: string | undefined, hasta: string | undefined, actor: Actor): Promise<ResultadoAccion<{ filas: CambioFefoPersona[] }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeVerCambiosFefo(actor.roles)) return falla('No tienes permiso para ver este reporte')
    const por = new Map<string, CambioFefoPersona & { _l: Set<string> }>()
    for (const c of pk(e).cambios.filter((y) => y.distinto && (!desde || y.en.slice(0, 10) >= desde) && (!hasta || y.en.slice(0, 10) <= hasta))) {
      const sl = lineaDe(e, c.lineaId)
      const f = por.get(c.porId) ?? { personaId: c.porId, persona: c.por, veces: 0, lineas: 0, unidades: 0, primeraEn: c.en, ultimaEn: c.en, _l: new Set<string>() }
      f.veces += 1; f._l.add(c.lineaId); f.unidades = [...f._l].reduce((t, id) => t + (lineaDe(e, id)?.l.cantidad ?? 0), 0); f.lineas = f._l.size
      if (c.en < f.primeraEn) f.primeraEn = c.en
      if (c.en > f.ultimaEn) f.ultimaEn = c.en
      void sl
      por.set(c.porId, f)
    }
    return { ok: true, filas: [...por.values()].map(({ _l, ...f }) => f).sort((a, b) => b.veces - a.veces || b.ultimaEn.localeCompare(a.ultimaEn)) }
  }
}

export { ETIQUETA_ETAPA, avancePicking }
