// Revisión diaria (INV-04), programación de los inventarios cíclicos (INV-05) y exactitud, en memoria (modo demostración).
// Aplica las mismas reglas que la migración 0009.
import {
  FOCOS, lunesDe, puedeCerrarRevision, puedeHacerRevision, puedeResolverPendiente, sumarDiasISO, validarMarcaFoco, validarPendiente, validarProgramacion,
  type Cobertura, type EntradaPendiente, type EstadoPendiente, type FilaExactitud, type FocoRevision, type PendienteVista, type PersonaEquipo, type ProgramacionVista, type ResultadoFoco, type RevisionDiaria,
} from '@/domain/operacion'
import { ETIQUETA_ROL } from '@/domain/permisos'
import type { Rol } from '@/domain/tipos'
import { InventarioDemo } from './inventario-demo'
import { alertar, estadoE, falla, nuevoId } from './entradas-demo'
import { registrar, type EstadoDemo } from './estado'
import type { RepositorioOperacion } from '../repositorio-operacion'
import type { Actor, ResultadoAccion } from '../repositorio'

export interface OpDemo { revisiones: RevisionDiaria[]; pendientes: PendienteVista[]; programaciones: ProgramacionVista[]; sembrado: boolean }

const ROLES_EQUIPO: Rol[] = ['jefe_almacen', 'reemplazo_jefe', 'auxiliar', 'asistente_dt', 'direccion_tecnica']
const nombreDe = (id: string) => (id.startsWith('demo:') ? `${ETIQUETA_ROL[id.slice(5) as Rol] ?? id.slice(5)} (demo)` : id)
const exigirJefe = (a: Actor) => (puedeHacerRevision(a.roles) ? null : 'Solo el Jefe de Almacén (o su reemplazo) hace esto')

function op(e: EstadoDemo): OpDemo {
  if (!e.op) e.op = { revisiones: [], pendientes: [], programaciones: [], sembrado: false }
  if (!e.op.sembrado) {
    e.op.sembrado = true
    const hoy = e.panorama.hoy
    const ayer = sumarDiasISO(hoy, -1)
    const rev: RevisionDiaria = {
      id: 'rd-demo-ayer', numero: `RD-${ayer.replace(/-/g, '')}`, fecha: ayer, responsableId: 'demo:jefe_almacen', responsable: nombreDe('demo:jefe_almacen'), estado: 'CERRADA',
      focos: FOCOS.map((f) => ({ foco: f.foco, resultado: f.foco === 'ORDEN' || f.foco === 'ANORMAL' ? 'CON_PENDIENTES' : 'SIN_PROBLEMAS', revisadoPor: 'demo:jefe_almacen' })), pendientes: [], notaCierre: 'Recorrido sin novedades mayores.',
    }
    const mk = (id: string, foco: FocoRevision, descripcion: string, responsableId: string, estado: EstadoPendiente, extra: Partial<PendienteVista> = {}): PendienteVista => ({
      id, revisionId: rev.id, revision: rev.numero, fecha: ayer, foco, descripcion, responsableId, responsable: nombreDe(responsableId), critico: false, afectaProducto: false, estado, creadoPor: rev.responsable, ...extra,
    })
    const pend = [
      mk('pend-demo-1', 'ORDEN', 'Cajas vacías apiladas frente al rack D-4: retirar para despejar el pasillo.', 'demo:auxiliar', 'ABIERTO', { critico: true, ubicacion: 'D-4' }),
      mk('pend-demo-2', 'ANORMAL', 'Gotera leve cerca del ingreso: avisar a mantenimiento.', 'demo:reemplazo_jefe', 'RESUELTO', { notaResolucion: 'Mantenimiento la selló esta mañana.', resueltoPor: nombreDe('demo:reemplazo_jefe') }),
    ]
    rev.pendientes = pend
    e.op.revisiones.push(rev); e.op.pendientes.push(...pend)
  }
  return e.op
}

export class OperacionDemo extends InventarioDemo implements RepositorioOperacion {
  // ── Revisión diaria ─────────────────────────────────────────────────────
  async revisionDeHoy(): Promise<RevisionDiaria | null> {
    const e = estadoE(); const o = op(e)
    const r = o.revisiones.find((x) => x.fecha === e.panorama.hoy)
    return r ? structuredClone({ ...r, pendientes: o.pendientes.filter((p) => p.revisionId === r.id) }) : null
  }
  async listarRevisiones(limite = 30): Promise<RevisionDiaria[]> {
    const o = op(estadoE())
    return o.revisiones.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, limite).map((r) => structuredClone({ ...r, pendientes: o.pendientes.filter((p) => p.revisionId === r.id) }))
  }
  async pendientesVivos(): Promise<PendienteVista[]> { return structuredClone(op(estadoE()).pendientes.filter((p) => p.estado !== 'VERIFICADO')) }
  async personasDelEquipo(): Promise<PersonaEquipo[]> { return ROLES_EQUIPO.map((rol) => ({ id: `demo:${rol}`, nombre: nombreDe(`demo:${rol}`), rol })) }

  async iniciarRevision(actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE(); const o = op(e)
    const no = exigirJefe(actor); if (no) return falla(no)
    const ya = o.revisiones.find((r) => r.fecha === e.panorama.hoy)
    if (ya) return { ok: true, id: ya.id }
    const r: RevisionDiaria = { id: nuevoId(), numero: `RD-${e.panorama.hoy.replace(/-/g, '')}`, fecha: e.panorama.hoy, responsableId: actor.id, responsable: actor.nombre, estado: 'ABIERTA', focos: [], pendientes: [] }
    o.revisiones.push(r)
    registrar(e, actor, 'revision_diaria_iniciada', 'revisiones_diarias', r.numero, 'Revisión diaria iniciada')
    return { ok: true, id: r.id }
  }

  private abierta(e: EstadoDemo, id: string): RevisionDiaria | string {
    const r = op(e).revisiones.find((x) => x.id === id)
    if (!r) return 'No encontramos esa revisión'
    if (r.estado === 'CERRADA') return 'La revisión de ese día ya está cerrada'
    return r
  }

  async marcarFoco(revisionId: string, foco: FocoRevision, resultado: ResultadoFoco, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); const o = op(e)
    const no = exigirJefe(actor); if (no) return falla(no)
    const r = this.abierta(e, revisionId); if (typeof r === 'string') return falla(r)
    if (!FOCOS.some((f) => f.foco === foco)) return falla('Ese foco no existe')
    const bloqueo = validarMarcaFoco(o.pendientes.filter((p) => p.revisionId === r.id), foco, resultado)
    if (bloqueo) return falla(bloqueo)
    r.focos = [...r.focos.filter((f) => f.foco !== foco), { foco, resultado, revisadoPor: actor.id }]
    return { ok: true }
  }

  async registrarPendiente(revisionId: string, datos: EntradaPendiente, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE(); const o = op(e)
    const no = exigirJefe(actor); if (no) return falla(no)
    const r = this.abierta(e, revisionId); if (typeof r === 'string') return falla(r)
    const errores = validarPendiente(datos, await this.personasDelEquipo())
    if (errores) return { ok: false, mensaje: Object.values(errores)[0], errores }
    if (!FOCOS.some((f) => f.foco === datos.foco)) return falla('Ese foco no existe')
    const p: PendienteVista = {
      id: nuevoId(), revisionId: r.id, revision: r.numero, fecha: r.fecha, foco: datos.foco, descripcion: datos.descripcion.trim(), responsableId: datos.responsableId, responsable: nombreDe(datos.responsableId),
      critico: datos.critico, afectaProducto: datos.afectaProducto, ubicacion: datos.ubicacion?.trim() || undefined, estado: 'ABIERTO', creadoPor: actor.nombre,
    }
    o.pendientes.push(p)
    r.focos = [...r.focos.filter((f) => f.foco !== datos.foco), { foco: datos.foco, resultado: 'CON_PENDIENTES', revisadoPor: actor.id }]
    if (datos.afectaProducto) alertar(e, 'PENDIENTE_AFECTA_PRODUCTO', 'direccion_tecnica', `Revisión diaria ${r.numero}: ${p.descripcion} (puede afectar producto)`, `rd-pend:${p.id}`)
    registrar(e, actor, 'pendiente_registrado', 'revision_pendientes', p.id, p.descripcion)
    return { ok: true, id: p.id }
  }

  async resolverPendiente(id: string, nota: string | undefined, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); const p = op(e).pendientes.find((x) => x.id === id)
    if (!p) return falla('No encontramos ese pendiente')
    if (!puedeResolverPendiente(actor.roles, actor.id, p)) return falla('Solo su responsable o el Jefe de Almacén resuelven este pendiente')
    if (p.estado !== 'ABIERTO') return falla('Ese pendiente ya no está abierto')
    p.estado = 'RESUELTO'; p.resueltoPor = actor.nombre; p.notaResolucion = nota?.trim() || undefined
    registrar(e, actor, 'pendiente_resuelto', 'revision_pendientes', p.id, p.descripcion, nota)
    return { ok: true }
  }

  async verificarPendiente(id: string, conforme: boolean, nota: string | undefined, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); const p = op(e).pendientes.find((x) => x.id === id)
    const no = exigirJefe(actor); if (no) return falla(no)
    if (!p) return falla('No encontramos ese pendiente')
    if (p.estado !== 'RESUELTO') return falla('Solo se verifica un pendiente que ya está resuelto')
    if (conforme) { p.estado = 'VERIFICADO'; p.verificadoPor = actor.nombre }
    else {
      if (!nota?.trim()) return falla('Cuenta qué falta para reabrirlo')
      p.estado = 'ABIERTO'; p.resueltoPor = undefined; p.notaResolucion = `Reabierto: ${nota.trim()}`
    }
    registrar(e, actor, conforme ? 'pendiente_verificado' : 'pendiente_reabierto', 'revision_pendientes', p.id, p.descripcion, nota)
    return { ok: true }
  }

  async cerrarRevision(id: string, nota: string | undefined, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    const no = exigirJefe(actor); if (no) return falla(no)
    const r = this.abierta(e, id); if (typeof r === 'string') return falla(r)
    const c = puedeCerrarRevision(r); if (!c.puede) return falla(c.motivo!.replace(/\.$/, '').replace('Falta revisar', 'Falta revisar'))
    r.estado = 'CERRADA'; r.notaCierre = nota?.trim() || undefined
    registrar(e, actor, 'revision_diaria_cerrada', 'revisiones_diarias', r.numero, 'Revisión diaria cerrada', nota)
    return { ok: true }
  }

  // ── Programación de los inventarios cíclicos ────────────────────────────
  async programacionDeSemana(lunes: string): Promise<ProgramacionVista[]> {
    return structuredClone(op(estadoE()).programaciones.filter((p) => p.semana === lunesDe(lunes)).sort((a, b) => (a.orden ?? 9) - (b.orden ?? 9)))
  }

  async ultimaCobertura(): Promise<Cobertura[]> {
    const e = estadoE(); const o = op(e)
    const m = new Map<string, string>()
    const marcar = (id: string, f: string) => { if (!m.has(id) || f > m.get(id)!) m.set(id, f) }
    for (const c of e.inv.conteos) for (const l of c.lineas) marcar(l.posicionId, c.programadoEn.slice(0, 10))
    for (const p of o.programaciones) if (p.estado !== 'CANCELADO') for (const x of p.posiciones) marcar(x.id, p.semana)
    return [...m].map(([posicionId, ultima]) => ({ posicionId, ultima }))
  }

  async programarConteoSemanal(lunes: string, orden: number, posicionIds: string[], nota: string | undefined, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE(); const o = op(e)
    const no = exigirJefe(actor); if (no) return falla(no)
    const semana = lunesDe(lunes)
    const de = o.programaciones.filter((p) => p.semana === semana && p.tipo === 'ROTATIVO' && p.estado !== 'CANCELADO')
    const yaEn = new Set(de.flatMap((p) => p.posiciones.map((x) => x.id)))
    const err = validarProgramacion({ orden, posiciones: posicionIds, yaEnSemana: yaEn, ocupados: de.map((p) => p.orden!) })
    if (err) return falla(err)
    const pos = posicionIds.map((id) => e.panorama.posiciones.find((p) => p.id === id && p.activa))
    if (pos.some((p) => !p)) return falla('Una de las ubicaciones no existe o está inactiva')
    const p: ProgramacionVista = { id: nuevoId(), semana, tipo: 'ROTATIVO', orden, posiciones: pos.map((x) => ({ id: x!.id, codigo: x!.codigo })), nota: nota?.trim() || undefined, estado: 'PROGRAMADO' }
    o.programaciones.push(p)
    registrar(e, actor, 'conteo_semanal_programado', 'programacion_conteos', p.id, `Conteo ${orden} de la semana del ${semana}`, nota)
    return { ok: true, id: p.id }
  }

  async programarConteoExtra(posicionIds: string[], incidencia: string, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE(); const o = op(e)
    const no = exigirJefe(actor); if (no) return falla(no)
    if (!incidencia.trim()) return falla('Cuenta cuál fue la incidencia que pide el conteo extra')
    if (posicionIds.length === 0) return falla('Elige al menos una ubicación para contar')
    const pos = posicionIds.map((id) => e.panorama.posiciones.find((p) => p.id === id && p.activa))
    if (pos.some((p) => !p)) return falla('Una de las ubicaciones no existe o está inactiva')
    const p: ProgramacionVista = { id: nuevoId(), semana: lunesDe(e.panorama.hoy), tipo: 'EXTRA', posiciones: pos.map((x) => ({ id: x!.id, codigo: x!.codigo })), nota: incidencia.trim(), estado: 'PROGRAMADO' }
    o.programaciones.push(p)
    registrar(e, actor, 'conteo_extra_programado', 'programacion_conteos', p.id, 'Conteo extra por incidencia', incidencia)
    return { ok: true, id: p.id }
  }

  async cancelarProgramacion(id: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); const p = op(e).programaciones.find((x) => x.id === id)
    const no = exigirJefe(actor); if (no) return falla(no)
    if (!motivo.trim()) return falla('Cuenta por qué se cancela')
    if (!p) return falla('No encontramos esa programación')
    if (p.estado !== 'PROGRAMADO') return falla('Solo se cancela un conteo que todavía no se generó')
    p.estado = 'CANCELADO'; p.motivoCancelacion = motivo.trim()
    registrar(e, actor, 'conteo_programado_cancelado', 'programacion_conteos', p.id, 'Programación cancelada', motivo)
    return { ok: true }
  }

  async generarConteoProgramado(id: string, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const e = estadoE(); const p = op(e).programaciones.find((x) => x.id === id)
    const no = exigirJefe(actor); if (no) return falla(no)
    if (!p) return falla('No encontramos esa programación')
    if (p.estado !== 'PROGRAMADO') return falla('Ese conteo ya se generó o se canceló')
    const r = await this.programarConteo(p.posiciones.map((x) => x.id), p.nota ?? (p.tipo === 'ROTATIVO' ? `Conteo cíclico semanal ${p.orden}` : undefined), actor)
    if (!r.ok) return r
    p.estado = 'GENERADO'; p.conteoId = r.id; p.conteoNumero = r.numero
    return r
  }

  // ── Exactitud ───────────────────────────────────────────────────────────
  async exactitudConteos(desde: string | undefined, hasta: string | undefined, actor: Actor): Promise<FilaExactitud[]> {
    if (!actor.roles.some((r) => ['jefe_almacen', 'reemplazo_jefe', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura'].includes(r))) return []
    const e = estadoE(); const p = e.panorama
    const out: FilaExactitud[] = []
    for (const c of e.inv.conteos) {
      if (c.estado !== 'CERRADO' || !c.cerradoEn) continue
      const dia = c.cerradoEn.slice(0, 10)
      if ((desde && dia < desde) || (hasta && dia > hasta)) continue
      for (const l of c.lineas) {
        const contada = l.conteo2 ?? l.conteo1
        if (contada === undefined) continue
        const prod = p.productos.find((x) => x.id === l.productoId)
        out.push({
          conteo: c.numero, cerradoEn: c.cerradoEn, posicion: p.posiciones.find((x) => x.id === l.posicionId)?.codigo ?? l.posicionId, producto: `${prod?.codigo ?? ''} · ${prod?.descripcion ?? ''}`,
          lote: p.lotes.find((x) => x.id === l.loteId)?.codigo ?? l.loteId, propietario: p.propietarios.find((x) => x.id === l.propietarioId)?.codigo ?? l.propietarioId, estado: l.estado,
          cantidadSistema: l.cantidadSistema, cantidadContada: contada, diferencia: contada - l.cantidadSistema, resultado: l.resultado ?? '', causa: l.causa,
        })
      }
    }
    return out.sort((a, b) => b.cerradoEn.localeCompare(a.cerradoEn) || a.posicion.localeCompare(b.posicion, 'es', { numeric: true }))
  }
}
