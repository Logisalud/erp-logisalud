// Rutas y salidas por pedido en memoria (modo demostración). Aplica las mismas reglas que las migraciones 0012 (asignación FEFO, reservas) y 0017 (rutas).
// Las siguientes etapas (picking, conformidad, documentos, embalaje, carga y salida) se apilan sobre esta clase.
import { asignarLinea, type AsignacionLote, type LoteDisponible } from '@/domain/salidas'
import {
  RUTA_EDITABLE, puedePlanificarRutas, validarPlan, totalUnidades,
  type ParadaVista, type PanoramaRutas, type PedidoPlanificable, type PersonalTransporte, type PlanRuta, type RutaVista, type VehiculoVista,
} from '@/domain/rutas'
import { AREAS_DE_SALIDA } from '@/domain/zonas'
import { PENDIENTES_LS_FR, armarRegistroLsFr, puedeImprimirLsFr, type ExtrasLsFr, type RegistroLsFrVista } from '@/domain/ls-fr-43-03'
import { registrar, type EstadoDemo } from './estado'
import { alertar, ahora, estadoE, falla, nuevoId } from './entradas-demo'
import { numeroDe } from './libro'
import { PedidosDemo } from './pedidos-demo'
import type { RepositorioRutas } from '../repositorio-rutas'
import type { Actor, ResultadoAccion } from '../repositorio'

export interface ReservaDemo {
  id: string; lineaId: string; salidaId: string; productoId: string; loteId: string; posicionId: string; posicionOrigenId: string; procedenciaId: string; cantidad: number
  estado: 'ACTIVA' | 'EN_TRANSITO' | 'EN_STAGING' | 'CONSUMIDA' | 'LIBERADA'
}
export interface LineaSalidaDemo {
  id: string; productoId: string; cantidad: number
  estado: 'PENDIENTE' | 'ASIGNADA' | 'SIN_STOCK' | 'EN_PICKING' | 'PICKEADA' | 'CONFORME' | 'OBSERVADA' | 'CONFIRMADA' | 'CANCELADA'
  /** La asignación FEFO original (no cambia nunca) y la vigente. */
  fefo: AsignacionLote[]
  nota?: string
}
export interface SalidaDemo {
  id: string; numero: string; pedidoId: string; propietarioId: string; estado: 'ABIERTA' | 'CONFIRMADA' | 'CANCELADA'
  lineas: LineaSalidaDemo[]; creadaEn: string; creadaPor: string
}
export interface ParadaDemo { id: string; secuencia: number; pedidoId: string; salidaId?: string; excepcionCorte: boolean; motivoExcepcion?: string; activa: boolean }
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
  /** S7: bultos (los vigentes y los anulados al reabrir el embalaje). */
  bultos?: import('@/domain/embalaje').BultoVista[]
}
export interface GuiaDemo { id: string; salidaId: string; guia: import('@/domain/documentacion').GuiaVista }

export function desp(e: EstadoDemo): DespachoDemoEstado {
  if (!e.desp) e.desp = { personal: [], vehiculos: [], rutas: [], salidas: [], reservas: [], corte: '16:00', sembrado: false }
  return e.desp
}

const sumarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
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

export function lotesDisponibles(e: EstadoDemo, productoId: string, propietarioId: string): LoteDisponible[] {
  const lotes = new Map(e.panorama.lotes.map((l) => [l.id, l]))
  return [...celdasLibres(e, productoId, propietarioId)].map(([loteId, celdas]) => ({
    loteId, codigo: lotes.get(loteId)?.codigo ?? loteId, vence: lotes.get(loteId)?.vence ?? null, disponible: celdas.reduce((t, c) => t + c.libre, 0),
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

/** Asigna una línea por FEFO (distribución). Sin stock: queda SIN_STOCK y se avisa al Jefe de Transporte; nunca falla. */
export function asignarLineaDemo(e: EstadoDemo, salida: SalidaDemo, linea: LineaSalidaDemo): string | null {
  const r = asignarLinea({ tipo: 'DISTRIBUCION', motivo: 'VENTA', cantidad: linea.cantidad, hoy: e.panorama.hoy, lotes: lotesDisponibles(e, linea.productoId, salida.propietarioId) })
  if (!r.ok) {
    linea.estado = 'SIN_STOCK'; linea.nota = r.mensaje
    const prod = e.panorama.productos.find((p) => p.id === linea.productoId)
    alertar(e, 'STOCK_INSUFICIENTE', 'jefe_transporte', `Falta stock para ${prod?.codigo ?? 'un producto'} en la salida ${salida.numero}: ${r.mensaje}`, `stock:${linea.id}`, undefined, linea.productoId)
    return r.mensaje
  }
  for (const a of r.asignaciones) reservarEnLote(e, salida, linea, a.loteId, a.cantidad)
  linea.fefo = r.asignaciones.map((a) => ({ loteId: a.loteId, cantidad: a.cantidad }))
  linea.estado = 'ASIGNADA'; linea.nota = undefined
  return null
}

export function crearSalidaDePedido(e: EstadoDemo, pedidoId: string, actor: Actor): SalidaDemo | string {
  const fila = e.pedidos?.filas.find((f) => f.vigente && f.snapshot.pedidoId === pedidoId)
  if (!fila) return 'No encontramos uno de los pedidos en la bandeja'
  const lineas: LineaSalidaDemo[] = []
  for (const l of fila.snapshot.lineas) {
    const prod = e.panorama.productos.find((p) => p.codigo.toUpperCase() === l.productoCodigo.toUpperCase())
    if (!prod) return `El pedido ${fila.snapshot.numero} trae un producto que el WMS no conoce (${l.productoCodigo}): Dirección Técnica debe darlo de alta`
    lineas.push({ id: nuevoId(), productoId: prod.id, cantidad: l.cantidad, estado: 'PENDIENTE', fefo: [] })
  }
  const salida: SalidaDemo = { id: nuevoId(), numero: numeroDe(e.inv, 'SAL', e.panorama.hoy.slice(0, 4)), pedidoId, propietarioId: duenoDelAlmacen(e), estado: 'ABIERTA', lineas, creadaEn: ahora(), creadaPor: actor.id }
  desp(e).salidas.push(salida)
  for (const l of salida.lineas) asignarLineaDemo(e, salida, l)
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
      { id: 'per-1', nombre: 'Luis Quispe', funcion: 'CONDUCTOR', activo: true }, { id: 'per-2', nombre: 'Marco Huamán', funcion: 'CONDUCTOR', activo: true },
      { id: 'per-3', nombre: 'Ana Ríos', funcion: 'AUXILIAR', activo: true }, { id: 'per-4', nombre: 'Pedro Soto', funcion: 'AUXILIAR', activo: true },
      { id: 'per-5', nombre: 'Raúl Díaz (de vacaciones)', funcion: 'CONDUCTOR', activo: false },
    )
    d.vehiculos.push(
      { id: 'veh-1', placa: 'BKW-757', descripcion: 'Camioneta cerrada', tipo: 'PROPIO', calificado: true, aptoCadenaFrio: false, capacidadBultos: 60, activo: true },
      { id: 'veh-2', placa: 'D4F-318', descripcion: 'Furgón con termo', tipo: 'PROPIO', calificado: true, aptoCadenaFrio: true, capacidadBultos: 90, activo: true },
      { id: 'veh-3', placa: 'AXL-204', descripcion: 'Moto furgón', tipo: 'PROPIO', calificado: false, aptoCadenaFrio: false, capacidadBultos: 20, activo: true },
      { id: 'veh-4', placa: 'T9K-551', descripcion: 'Camión (en taller)', tipo: 'EXTERNO', calificado: false, aptoCadenaFrio: false, activo: false },
    )
    // Una ruta de mañana ya planificada, con el pedido PED-DEMO-101 (así hay una salida y una ruta para ver)
    const sistema: Actor = { id: 'demo:jefe_transporte', nombre: 'Jefe de Transporte (demo)', roles: ['jefe_transporte'] }
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
    const fila = e.pedidos!.filas.find((f) => f.snapshot.pedidoId === p.pedidoId && f.vigente)!
    const s = d.salidas.find((x) => x.id === p.salidaId)
    const stock = !s ? 'PENDIENTE' : s.lineas.some((l) => l.estado === 'SIN_STOCK') ? 'SIN_STOCK' : 'ASIGNADA'
    const c = fila.snapshot.cliente
    return {
      id: p.id, secuencia: p.secuencia, pedidoId: p.pedidoId, pedidoNumero: fila.snapshot.numero, cliente: c.nombre, ruc: c.ruc, direccion: c.direccion, distrito: c.distrito,
      ventanaCita: c.ventanaCita, vehiculoCalificado: c.vehiculoCalificado, lineas: fila.snapshot.lineas.length, unidades: fila.snapshot.lineas.reduce((t, l) => t + l.cantidad, 0),
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
    for (const r of d.rutas.filter((x) => x.estado !== 'CANCELADA' && x.estado !== 'CERRADA')) for (const p of r.paradas.filter((x) => x.activa)) enRuta.set(p.pedidoId, r.numero)
    const codigos = new Set(e.panorama.productos.map((p) => p.codigo.toUpperCase()))
    return e.pedidos!.filas.filter((f) => f.vigente).map((f) => ({
      pedidoId: f.snapshot.pedidoId, numero: f.snapshot.numero, cliente: f.snapshot.cliente.nombre, ruc: f.snapshot.cliente.ruc, direccion: f.snapshot.cliente.direccion,
      distrito: f.snapshot.cliente.distrito, ventanaCita: f.snapshot.cliente.ventanaCita, vehiculoCalificado: f.snapshot.cliente.vehiculoCalificado,
      lineas: f.snapshot.lineas.length, unidades: f.snapshot.lineas.reduce((t, l) => t + l.cantidad, 0), importadoEn: f.importadoEn,
      enRuta: enRuta.get(f.snapshot.pedidoId), cambioPorRevisar: f.cambioPendiente,
      sinCatalogo: f.snapshot.lineas.filter((l) => !codigos.has(l.productoCodigo.toUpperCase())).map((l) => l.productoCodigo),
    }))
  }

  async panoramaRutas(): Promise<PanoramaRutas> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const d = desp(e)
    return structuredClone({
      hoy: e.panorama.hoy, corte: d.corte, rutas: [...d.rutas].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero)).map((r) => this.vistaRuta(e, r)),
      vehiculos: d.vehiculos, personal: d.personal, pedidos: this.pedidosPlanificables(e),
    })
  }

  async obtenerRuta(id: string): Promise<RutaVista | null> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const r = desp(e).rutas.find((x) => x.id === id)
    return r ? structuredClone(this.vistaRuta(e, r)) : null
  }

  /** Lo que las etapas siguientes registran y el formato pide (guías, bultos, horas). Las clases de más abajo lo completan. */
  protected extrasLsFr(_e: EstadoDemo, _r: RutaDemo): ExtrasLsFr { return {} }

  async registroLsFr(rutaId: string): Promise<RegistroLsFrVista | null> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const r = desp(e).rutas.find((x) => x.id === rutaId)
    if (!r) return null
    const vista = this.vistaRuta(e, r)
    if (!puedeImprimirLsFr(vista)) return null
    return structuredClone(armarRegistroLsFr(vista, { codigo: 'LS-FR.43.03', version: '01', vigenteDesde: '2026-09-01', vigenteHasta: '2028-09-01', filasPorPagina: 10, pendientes: Object.keys(PENDIENTES_LS_FR) }, this.extrasLsFr(e, r)))
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

    const planificables = new Map(this.pedidosPlanificables(e).map((p) => [p.pedidoId, p]))
    const enOtraRuta = new Map([...planificables].filter(([, p]) => p.enRuta && !r.paradas.some((x) => x.activa && x.pedidoId === p.pedidoId)).map(([k, p]) => [k, p.enRuta!]))
    const errores = validarPlan({ hoy: e.panorama.hoy, corte: d.corte, plan, vehiculo, pedidos: planificables, enOtraRuta })
    if (errores.length) return falla(errores[0], { plan: errores.join(' ') })

    // Los que salen del plan liberan su salida (si no tienen picking)
    const quedan = new Set(plan.paradas.map((p) => p.pedidoId))
    for (const p of r.paradas.filter((x) => x.activa && !quedan.has(x.pedidoId))) {
      if (p.salidaId) { const m = liberarSalida(e, p.salidaId, motivo ?? 'El pedido salió de la ruta'); if (m) return falla(m) }
      const fila = e.pedidos!.filas.find((f) => f.vigente && f.snapshot.pedidoId === p.pedidoId); if (fila) fila.salida = undefined
      p.activa = false
    }
    const previas = new Map(r.paradas.filter((x) => x.activa).map((x) => [x.pedidoId, x]))
    for (const p of r.paradas) p.activa = false
    const nuevas: ParadaDemo[] = []
    const bloqueados: string[] = []
    for (const [i, pp] of plan.paradas.entries()) {
      const fila = e.pedidos!.filas.find((f) => f.vigente && f.snapshot.pedidoId === pp.pedidoId)!
      let salidaId = previas.get(pp.pedidoId)?.salidaId
      if (!salidaId) {
        const s = crearSalidaDePedido(e, pp.pedidoId, actor)
        if (typeof s === 'string') return falla(s)
        salidaId = s.id; fila.salida = s.numero
      }
      const salida = d.salidas.find((x) => x.id === salidaId)!
      if (salida.lineas.some((l) => l.estado === 'SIN_STOCK')) bloqueados.push(fila.snapshot.numero)
      nuevas.push({ id: nuevoId(), secuencia: i + 1, pedidoId: pp.pedidoId, salidaId, excepcionCorte: !!pp.excepcionCorte, motivoExcepcion: pp.excepcionCorte ? pp.motivoExcepcion?.trim() : undefined, activa: true })
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
    const sin = vivas.filter((p) => d.salidas.find((s) => s.id === p.salidaId)?.lineas.some((l) => l.estado === 'SIN_STOCK')).map((p) => e.pedidos!.filas.find((f) => f.snapshot.pedidoId === p.pedidoId && f.vigente)!.snapshot.numero)
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
      if (p.salidaId) { const m = liberarSalida(e, p.salidaId, motivo); if (m) return falla(m) }
      const fila = e.pedidos!.filas.find((f) => f.vigente && f.snapshot.pedidoId === p.pedidoId); if (fila) fila.salida = undefined
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
