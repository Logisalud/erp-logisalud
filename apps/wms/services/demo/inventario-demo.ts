// Motor del inventario en el modo demostración (Batch 3). Aplica las mismas reglas que la migración 0007:
// Kardex, movimientos internos con D-15, conteos ciegos, ajustes autorizados por Dirección Técnica y carga inicial con D-09.
import {
  clasificarReconteo, construirKardex, puedeDecidirAjuste, puedeEjecutarMovimiento, puedeProgramarConteo,
  type AjusteVista, type CargaInicialVista, type ConteoVista, type ErrorFilaCarga, type FilaCargaInicial, type FilaHistoriaLote,
  type FilaKardex, type FiltroKardex, type LineaConteoVista, type LineaEjecutar, type LineaOrdenMovimiento, type OrdenMovimiento, type ReporteVista, type VistaGuardada,
  type ResultadoLinea, type RevisionLinea,
} from '@/domain/inventario'
import { puedeVerificar } from '@/domain/verificacion'
import { areaAdmite } from '@/domain/zonas'
import { posicionAcepta } from '@/domain/zonas'
import { ETIQUETA_ROL } from '@/domain/permisos'
import { ETIQUETA_ESTADO } from '@/domain/estados'
import type { Estado, Origen, Rol, Saldo } from '@/domain/tipos'
import { ESTADOS } from '@/domain/tipos'
import { sumarDias } from './datos'
import { EntradasDemo, alertar, estadoE, falla, ahora, nuevoId } from './entradas-demo'
import { anotar, numeroDe, siguiente, type ConteoDemo, type ConteoLineaDemo } from './libro'
import { registrar, type EstadoDemo } from './estado'
import type { Actor, ResultadoAccion } from '../repositorio'

const anioDe = (e: EstadoDemo) => e.panorama.hoy.slice(0, 4)
const nombrePersona = (id?: string): string | undefined => {
  if (!id) return undefined
  if (id.startsWith('demo:')) return `${ETIQUETA_ROL[id.slice(5) as Rol] ?? id.slice(5)} (demo)`
  return id
}
const esJefe = (r: readonly Rol[]) => r.includes('jefe_almacen') || r.includes('reemplazo_jefe')
const ACTIVA = new Set(['EJECUTADO', 'CON_DIFERENCIA'])
const mismaCelda = (s: Saldo, posicionId: string, loteId: string, estado: Estado, proc: string) =>
  s.posicionId === posicionId && s.loteId === loteId && s.estado === estado && s.procedenciaId === proc

function nombres(e: EstadoDemo) {
  const p = e.panorama
  return {
    posicion: (id: string) => p.posiciones.find((x) => x.id === id)?.codigo ?? id,
    lote: (id: string) => p.lotes.find((x) => x.id === id)?.codigo ?? id,
    loteObj: (id: string) => p.lotes.find((x) => x.id === id),
    propietario: (id: string) => p.propietarios.find((x) => x.id === id)?.codigo ?? id,
    producto: (id: string) => { const x = p.productos.find((q) => q.id === id); return x ? `${x.codigo} · ${x.descripcion}` : id },
  }
}

function ocupadaPorConteo(e: EstadoDemo, posicionIds: string[]): string | null {
  const n = nombres(e)
  for (const c of e.inv.conteos) {
    if (c.estado === 'CERRADO') continue
    const l = c.lineas.find((x) => posicionIds.includes(x.posicionId))
    if (l) return n.posicion(l.posicionId)
  }
  return null
}

function origenDe(e: EstadoDemo, loteId: string, procedenciaId: string): Origen {
  return e.inv.ledger.find((p) => p.loteId === loteId && p.procedenciaId === procedenciaId)?.origen ?? 'CARGA_INICIAL'
}

function moverSaldo(e: EstadoDemo, l: { loteId: string; productoId: string; propietarioId: string; estado: Estado; procedenciaId: string; desdePosicionId: string; haciaPosicionId: string; cantidad: number }) {
  const sal = e.panorama.saldos
  const desde = sal.find((s) => mismaCelda(s, l.desdePosicionId, l.loteId, l.estado, l.procedenciaId))
  if (!desde || desde.cantidad < l.cantidad) return false
  desde.cantidad -= l.cantidad
  if (desde.cantidad === 0) sal.splice(sal.indexOf(desde), 1)
  const destino = sal.find((s) => mismaCelda(s, l.haciaPosicionId, l.loteId, l.estado, l.procedenciaId))
  if (destino) destino.cantidad += l.cantidad
  else sal.push({ posicionId: l.haciaPosicionId, productoId: l.productoId, loteId: l.loteId, propietarioId: l.propietarioId, estado: l.estado, procedenciaId: l.procedenciaId, cantidad: l.cantidad })
  return true
}

/** Casos de demostración (ids fijos: iguales en todas las instancias). Se crean una sola vez. */
function sembrarInventario(e: EstadoDemo) {
  const inv = e.inv
  if (inv.sembrado) return
  inv.sembrado = true
  const stock = e.panorama.saldos.filter((s) => s.estado === 'APROBADO' && s.cantidad >= 20)
  const posDe = (codigo: string) => e.panorama.posiciones.find((p) => p.codigo === codigo)
  const n = nombres(e)
  const hacia = e.panorama.posiciones.filter((p) => p.tipoArea === 'APROBADOS' && p.activa && !e.panorama.saldos.some((s) => s.posicionId === p.id))
  const linea = (i: number, h: number, cantidad: number): LineaOrdenMovimiento | null => {
    const s = stock[i]; const d = hacia[h]
    if (!s || !d) return null
    const lote = n.loteObj(s.loteId)
    return {
      id: `mi-linea-${i}-${h}`, productoId: s.productoId, producto: n.producto(s.productoId), loteId: s.loteId, lote: lote?.codigo ?? '', vence: lote?.vence,
      propietario: n.propietario(s.propietarioId), estado: s.estado, procedenciaId: s.procedenciaId, desdePosicionId: s.posicionId, desde: n.posicion(s.posicionId),
      haciaPosicionId: d.id, hacia: d.codigo, cantidad, verificacion: 'PENDIENTE',
    }
  }
  // Un movimiento ya ejecutado por el auxiliar que espera su verificación, y otro más antiguo del Jefe (para probar la regla de las dos personas).
  const l1 = linea(0, 0, 6); const l2 = linea(1, 1, 4)
  let k = 0
  if (l1) inv.ordenes.push({ id: 'mi-demo-1', numero: `MI-${anioDe(e)}-${String(++k).padStart(5, '0')}`, estado: 'EJECUTADO', motivo: 'Acomodo de producto de alta rotación', ejecutorId: 'demo:auxiliar', ejecutor: nombrePersona('demo:auxiliar')!, ejecutadoEn: new Date(Date.now() - 3 * 3_600_000).toISOString(), lineas: [l1] })
  if (l2) inv.ordenes.push({ id: 'mi-demo-2', numero: `MI-${anioDe(e)}-${String(++k).padStart(5, '0')}`, estado: 'EJECUTADO', motivo: 'Acercar al despacho', ejecutorId: 'demo:jefe_almacen', ejecutor: nombrePersona('demo:jefe_almacen')!, ejecutadoEn: new Date(Date.now() - 5 * 3_600_000).toISOString(), lineas: [l2] })
  inv.contadores[`MI-${anioDe(e)}`] = k
  void posDe
}

export class InventarioDemo extends EntradasDemo {
  // ── Kardex ──────────────────────────────────────────────────────────────
  async kardex(f: FiltroKardex): Promise<FilaKardex[]> {
    const e = estadoE()
    const n = nombres(e)
    return construirKardex(e.inv.ledger, f, { ...n, producto: n.producto(f.productoId), propietarioDeLote: (id) => n.loteObj(id)?.propietarioId ?? '' })
  }

  async historiaLote(loteId: string): Promise<FilaHistoriaLote[]> {
    const e = estadoE()
    const n = nombres(e)
    let saldo = 0
    return e.inv.ledger.filter((p) => p.loteId === loteId).sort((a, b) => a.id - b.id).map((p) => {
      saldo += p.delta
      return {
        partidaId: p.id, fecha: p.ts, tipo: p.tipo, motivo: p.motivo, posicion: n.posicion(p.posicionId), estado: p.estado, origen: p.origen, delta: p.delta,
        ejecutor: nombrePersona(p.ejecutorId), verificador: nombrePersona(p.verificadorId), movimientoId: p.movimientoId,
        reversaDe: p.reversaDe, referencia: p.referenciaId, sustento: p.sustentoId, saldoLote: saldo,
      }
    })
  }

  async parametrosInventario() {
    return { tramosVencimiento: [30, 60, 90, 180], kardexCodigoFormato: 'LS-FR-KDX (provisional)' }
  }

  // ── Movimientos internos ────────────────────────────────────────────────
  private ordenes(): OrdenMovimiento[] { const e = estadoE(); sembrarInventario(e); return e.inv.ordenes }
  private orden(id: string) { return this.ordenes().find((o) => o.id === id) }

  async listarMovimientos() { return structuredClone([...this.ordenes()].reverse()) }
  async obtenerMovimiento(id: string) { const o = this.orden(id); return o ? structuredClone(o) : null }

  async ejecutarMovimiento(lineas: LineaEjecutar[], motivo: string, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const e = estadoE(); sembrarInventario(e)
    if (!puedeEjecutarMovimiento(actor.roles)) return falla('No tienes permiso para registrar movimientos')
    if (!motivo?.trim()) return falla('Cuéntanos por qué se mueve: el motivo es obligatorio', { motivo: 'Cuéntanos por qué se mueve.' })
    if (!lineas.length) return falla('El movimiento no tiene líneas')
    const n = nombres(e)
    const nuevas: LineaOrdenMovimiento[] = []
    for (const l of lineas) {
      if (l.desdePosicionId === l.haciaPosicionId) return falla('El origen y el destino son el mismo lugar')
      if (!Number.isInteger(l.cantidad) || l.cantidad <= 0) return falla('La cantidad debe ser mayor que cero')
      const lote = n.loteObj(l.loteId)
      if (!lote) return falla('No encontramos ese lote')
      const disp = e.panorama.saldos.filter((s) => mismaCelda(s, l.desdePosicionId, l.loteId, l.estado, l.procedenciaId)).reduce((t, s) => t + s.cantidad, 0)
      const reservado = e.inv.ordenes.filter((o) => ACTIVA.has(o.estado)).flatMap((o) => o.lineas).filter((x) => x.verificacion === 'PENDIENTE' || x.verificacion === 'CON_DIFERENCIA')
        .filter((x) => x.desdePosicionId === l.desdePosicionId && x.loteId === l.loteId && x.estado === l.estado && x.procedenciaId === l.procedenciaId).reduce((t, x) => t + x.cantidad, 0)
      const yaEnEstaOrden = nuevas.filter((x) => x.desdePosicionId === l.desdePosicionId && x.loteId === l.loteId).reduce((t, x) => t + x.cantidad, 0)
      if (l.cantidad > disp - reservado - yaEnEstaOrden) return falla(`No hay suficientes unidades en ese lugar (hay ${disp}, otros movimientos ya reservan ${reservado})`)
      const destino = e.panorama.posiciones.find((p) => p.id === l.haciaPosicionId)
      if (!destino) return falla('No encontramos la ubicación de destino')
      const origen = origenDe(e, l.loteId, l.procedenciaId)
      if (!areaAdmite(destino.tipoArea, l.estado, origen)) return falla(`La zona de destino (${destino.tipoArea}) no admite unidades en estado ${l.estado}`)
      if (!posicionAcepta(destino, lote.propietarioId, e.panorama.asignaciones, e.panorama.hoy)) return falla('La posición de destino no acepta stock de ese propietario (sin asignación vigente)')
      if (ocupadaPorConteo(e, [l.desdePosicionId, l.haciaPosicionId])) return falla('Una de las ubicaciones está en conteo: no se mueve hasta cerrarlo')
      nuevas.push({
        id: nuevoId(), productoId: lote.productoId, producto: n.producto(lote.productoId), loteId: lote.id, lote: lote.codigo, vence: lote.vence,
        propietario: n.propietario(lote.propietarioId), estado: l.estado, procedenciaId: l.procedenciaId, desdePosicionId: l.desdePosicionId,
        desde: n.posicion(l.desdePosicionId), haciaPosicionId: l.haciaPosicionId, hacia: destino.codigo, cantidad: l.cantidad, verificacion: 'PENDIENTE',
      })
    }
    const o: OrdenMovimiento = {
      id: nuevoId(), numero: numeroDe(e.inv, 'MI', anioDe(e)), estado: 'EJECUTADO', motivo: motivo.trim(), ejecutorId: actor.id, ejecutor: actor.nombre,
      ejecutadoEn: ahora(), lineas: nuevas,
    }
    e.inv.ordenes.push(o)
    registrar(e, actor, 'movimiento_ejecutado', 'ordenes_movimiento', o.numero, `Movimiento ejecutado: espera su verificación (${nuevas.length} ${nuevas.length === 1 ? 'línea' : 'líneas'})`, o.motivo)
    return { ok: true, id: o.id, numero: o.numero }
  }

  async confirmarMovimiento(id: string, actor: Actor): Promise<ResultadoAccion> {
    const o = this.orden(id)
    if (!o) return falla('No encontramos ese movimiento')
    const r = await this.revisarMovimiento(id, o.lineas.filter((l) => l.verificacion === 'PENDIENTE').map((l) => ({ lineaId: l.id, resultado: 'COINCIDE' as const })), actor)
    return r.ok ? { ok: true } : r
  }

  /** Mismo orden de mensajes que la base: permiso → ejecutó. */
  private puedeVerificarOrden(o: OrdenMovimiento, actor: Actor): string | null {
    if (!actor.roles.some((r) => ['auxiliar', 'jefe_almacen', 'reemplazo_jefe'].includes(r))) return 'Solo el personal de almacén verifica movimientos'
    const r = puedeVerificar(actor.id, { ejecutorId: o.ejecutorId })
    return r.puede ? null : r.mensaje
  }

  async revisarMovimiento(id: string, revision: RevisionLinea[], actor: Actor): Promise<ResultadoAccion<{ confirmadas: number; conDiferencia: number }>> {
    const o = this.orden(id); const e = estadoE()
    if (!o) return falla('No encontramos ese movimiento')
    if (o.estado !== 'EJECUTADO') return falla('El movimiento todavía no se movió o ya no está por verificar')
    const v = this.puedeVerificarOrden(o, actor)
    if (v) return falla(v)
    const pendientes = o.lineas.filter((l) => l.verificacion === 'PENDIENTE')
    if (pendientes.length !== revision.length) return falla(`Revisa las ${pendientes.length} líneas por verificar: cada una necesita decir si coincide o qué no coincide`)
    for (const r of revision) {
      if (!pendientes.some((l) => l.id === r.lineaId)) return falla('Una de las líneas no está por verificar')
      if (r.resultado === 'DIFERENCIA' && !r.nota?.trim()) return falla('Cuéntanos qué no coincide (producto, lote, cantidad o ubicación)', { nota: 'Cuéntanos qué no coincide.' })
      if (r.resultado !== 'COINCIDE' && r.resultado !== 'DIFERENCIA') return falla('Cada línea coincide o tiene una diferencia')
    }
    const ok = pendientes.filter((l) => revision.find((r) => r.lineaId === l.id)!.resultado === 'COINCIDE')
    if (ocupadaPorConteo(e, ok.flatMap((l) => [l.desdePosicionId, l.haciaPosicionId]))) return falla('Una de las ubicaciones está en conteo: no se mueve hasta cerrarlo')
    for (const l of ok) {
      const s = e.panorama.saldos.find((x) => mismaCelda(x, l.desdePosicionId, l.loteId, l.estado, l.procedenciaId))
      if (!s || s.cantidad < l.cantidad) return falla('Saldo insuficiente: alguien más ya movió esas unidades o no hay stock suficiente')
    }
    let movId: string | undefined
    if (ok.length) {
      for (const l of ok) moverSaldo(e, { ...l, propietarioId: nombres(e).loteObj(l.loteId)!.propietarioId })
      movId = `mov-mi-${o.numero}-${siguiente(e.inv, `rev-${o.numero}`)}`
      anotar(e.inv, movId, 'MOVIMIENTO', ahora(), { motivo: o.motivo, ejecutorId: o.ejecutorId, preparadorId: o.ejecutorId, verificadorId: actor.id, referenciaTipo: 'orden_movimiento', referenciaId: o.numero },
        ok.flatMap((l) => {
          const lote = nombres(e).loteObj(l.loteId)!
          const base = { productoId: l.productoId, loteId: l.loteId, propietarioId: lote.propietarioId, estado: l.estado, origen: origenDe(e, l.loteId, l.procedenciaId), procedenciaId: l.procedenciaId }
          return [{ ...base, posicionId: l.desdePosicionId, delta: -l.cantidad }, { ...base, posicionId: l.haciaPosicionId, delta: l.cantidad }]
        }))
      for (const l of ok) { l.verificacion = 'CONFIRMADA'; l.movimientoId = movId }
      o.movimientoId = movId
    }
    const conDif = revision.filter((r) => r.resultado === 'DIFERENCIA')
    for (const r of conDif) {
      const l = pendientes.find((x) => x.id === r.lineaId)!
      l.verificacion = 'CON_DIFERENCIA'; l.notaDiferencia = r.nota!.trim()
      alertar(e, 'MOVIMIENTO_CON_DIFERENCIA', 'jefe_almacen', `En el movimiento ${o.numero} la línea del lote ${l.lote} no coincide con lo que dice el sistema: ${l.notaDiferencia}. Esa línea sigue abierta; las demás ya se confirmaron. No cambies cantidades para que «cuadre».`, `mov-dif:${l.id}`, undefined, l.productoId, l.lote)
    }
    o.verificadorId = actor.id; o.verificador = actor.nombre; o.verificadoEn = ahora()
    o.estado = conDif.length ? 'CON_DIFERENCIA' : 'CONFIRMADO'
    o.notaDiferencia = conDif.length ? `Hay ${conDif.length} línea(s) con diferencia` : undefined
    registrar(e, actor, 'movimiento_revisado', 'ordenes_movimiento', o.numero, `${ok.length} línea(s) confirmadas, ${conDif.length} con diferencia`)
    return { ok: true, confirmadas: ok.length, conDiferencia: conDif.length }
  }

  async resolverMovimiento(lineaId: string, accion: 'REINTENTAR' | 'ANULAR', nota: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); sembrarInventario(e)
    if (!esJefe(actor.roles)) return falla('Solo el Jefe de Almacén (o su reemplazo) hace esto')
    const o = e.inv.ordenes.find((x) => x.lineas.some((l) => l.id === lineaId))
    const l = o?.lineas.find((x) => x.id === lineaId)
    if (!o || !l) return falla('No encontramos esa línea')
    if (l.verificacion !== 'CON_DIFERENCIA') return falla('Esta línea no tiene una diferencia abierta')
    if (!nota?.trim()) return falla('Cuéntanos qué se encontró y qué se decidió', { nota: 'Cuéntanos qué se decidió.' })
    if (accion === 'REINTENTAR') { l.verificacion = 'PENDIENTE'; l.notaDiferencia = undefined } else { l.verificacion = 'ANULADA'; l.notaDiferencia = nota.trim() }
    const al = e.alertas.find((a) => (a as { clave?: string }).clave === `mov-dif:${l.id}` && a.estado === 'ABIERTA')
    if (al) { al.estado = 'ATENDIDA'; al.atendidaPor = actor.nombre; al.atendidaEn = ahora(); al.nota = nota.trim() }
    if (o.lineas.some((x) => x.verificacion === 'CON_DIFERENCIA')) { /* quedan diferencias por resolver */ }
    else if (o.lineas.some((x) => x.verificacion === 'PENDIENTE')) { o.estado = 'EJECUTADO'; o.verificadorId = undefined; o.verificador = undefined; o.verificadoEn = undefined; o.notaDiferencia = undefined }
    else if (o.lineas.some((x) => x.verificacion === 'CONFIRMADA')) { o.estado = 'CONFIRMADO'; o.notaDiferencia = undefined }
    else { o.estado = 'ANULADO'; o.motivoAnulacion = nota.trim() }
    registrar(e, actor, 'movimiento_diferencia_resuelta', 'ordenes_movimiento', o.numero, accion === 'REINTENTAR' ? 'La línea se vuelve a mover' : 'La línea se anula', nota.trim())
    return { ok: true }
  }

  async posicionesBloqueadas(): Promise<Record<string, string>> {
    const e = estadoE(); sembrarInventario(e)
    const n = nombres(e)
    const out: Record<string, string> = {}
    for (const c of e.inv.conteos) if (c.estado !== 'CERRADO') for (const l of c.lineas) out[l.posicionId] = `está en conteo ${c.numero}`
    void n
    return out
  }

  async anularMovimiento(id: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const o = this.orden(id); const e = estadoE()
    if (!o) return falla('No encontramos ese movimiento')
    if (o.estado !== 'EJECUTADO' || o.lineas.some((l) => l.verificacion !== 'PENDIENTE')) return falla('Solo se anula un movimiento que todavía no se verificó')
    if (actor.id !== o.ejecutorId && !esJefe(actor.roles)) return falla('Solo quien lo ejecutó o el Jefe de Almacén lo anula')
    if (!motivo?.trim()) return falla('Cuéntanos por qué se anula', { motivo: 'Cuéntanos por qué se anula.' })
    o.estado = 'ANULADO'; o.motivoAnulacion = motivo.trim()
    registrar(e, actor, 'movimiento_anulado', 'ordenes_movimiento', o.numero, 'Movimiento anulado', motivo.trim())
    return { ok: true }
  }

  // ── Vistas guardadas (por persona) ──────────────────────────────────────
  async listarVistas(reporte: ReporteVista, actor: Actor): Promise<VistaGuardada[]> {
    return structuredClone((estadoE().inv.vistas[actor.id] ?? []).filter((v) => v.reporte === reporte).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
  }
  async guardarVista(reporte: ReporteVista, nombre: string, filtros: Record<string, string>, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE()
    if (!nombre.trim()) return falla('Ponle un nombre a la vista.')
    const mias = (e.inv.vistas[actor.id] ??= [])
    if (mias.some((v) => v.reporte === reporte && v.nombre.toLowerCase() === nombre.trim().toLowerCase())) return falla('Ya tienes una vista con ese nombre.')
    const v: VistaGuardada = { id: nuevoId(), reporte, nombre: nombre.trim(), filtros }
    mias.push(v)
    return { ok: true, id: v.id }
  }
  async borrarVista(id: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    const mias = e.inv.vistas[actor.id] ?? []
    e.inv.vistas[actor.id] = mias.filter((v) => v.id !== id)
    return { ok: true }
  }

  // ── Conteos cíclicos y ajustes ──────────────────────────────────────────
  private conteos(): ConteoDemo[] { return estadoE().inv.conteos }
  private lineaConteo(lineaId: string): { c: ConteoDemo; l: ConteoLineaDemo } | null {
    for (const c of this.conteos()) { const l = c.lineas.find((x) => x.id === lineaId); if (l) return { c, l } }
    return null
  }
  private avanzar(c: ConteoDemo) {
    if (c.estado === 'CERRADO') return
    const sin1 = c.lineas.filter((l) => l.conteo1 === undefined).length
    const sin2 = c.lineas.filter((l) => l.conteo1 !== undefined && l.conteo1 !== l.cantidadSistema && l.conteo2 === undefined).length
    c.estado = sin1 > 0 ? 'EN_CONTEO' : sin2 > 0 ? 'POR_RECONTAR' : 'EN_REVISION'
  }
  private vistaConteo(c: ConteoDemo): ConteoVista {
    return {
      id: c.id, numero: c.numero, estado: c.estado, nota: c.nota, programadoPor: c.programadoPor, programadoEn: c.programadoEn, cerradoEn: c.cerradoEn, resultado: c.resultado,
      causa: c.causa, accion: c.accion, lineas: c.lineas.length, resueltas: c.lineas.filter((l) => l.resultado && !['DIFERENCIA_CONFIRMADA', 'NO_CONCLUYENTE'].includes(l.resultado)).length,
    }
  }

  async listarConteos() { return [...this.conteos()].reverse().map((c) => this.vistaConteo(c)) }

  async obtenerConteo(id: string, actor: Actor) {
    const e = estadoE()
    const c = this.conteos().find((x) => x.id === id)
    if (!c) return null
    const n = nombres(e)
    const gestiona = actor.roles.some((r) => ['jefe_almacen', 'reemplazo_jefe', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura'].includes(r))
    const puedeEjecutar = actor.roles.some((r) => ['auxiliar', 'jefe_almacen', 'reemplazo_jefe', 'asistente_dt'].includes(r))
    const lineas: LineaConteoVista[] = c.lineas.map((l) => {
      const lote = n.loteObj(l.loteId)
      const aj = e.inv.ajustes.filter((a) => a.lineaId === l.id).slice(-1)[0]
      return {
        id: l.id, posicion: n.posicion(l.posicionId), productoId: l.productoId, producto: n.producto(l.productoId), lote: lote?.codigo ?? '', vence: lote?.vence,
        propietario: n.propietario(l.propietarioId), estado: l.estado,
        miConteo: l.contador1 === actor.id ? l.conteo1 : l.contador2 === actor.id ? l.conteo2 : undefined,
        conteo1: gestiona ? l.conteo1 : undefined, conteo2: gestiona ? l.conteo2 : undefined,
        cantidadSistema: gestiona && l.conteo1 !== undefined ? l.cantidadSistema : undefined,
        resultado: l.resultado, causa: gestiona ? l.causa : undefined, nota: gestiona ? l.nota : undefined,
        puedeContar: c.estado !== 'CERRADO' && puedeEjecutar && (l.conteo1 === undefined || (l.conteo2 === undefined && l.conteo1 !== l.cantidadSistema && l.contador1 !== actor.id)),
        ajuste: aj?.estado,
      }
    })
    const ajustes = e.inv.ajustes.filter((a) => c.lineas.some((l) => l.id === a.lineaId)).map(({ propuestoPorId: _p, lineaId: _l, ...a }) => { void _p; void _l; return a as AjusteVista })
    return structuredClone({ conteo: this.vistaConteo(c), lineas, ajustes })
  }

  async programarConteo(posicionIds: string[], nota: string | undefined, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const e = estadoE(); sembrarInventario(e)
    if (!puedeProgramarConteo(actor.roles)) return falla('Solo el Jefe de Almacén (o su reemplazo) hace esto')
    if (!posicionIds.length) return falla('Elige al menos una ubicación para contar')
    const n = nombres(e)
    const ocupada = ocupadaPorConteo(e, posicionIds)
    if (ocupada) return falla(`La ubicación ${ocupada} ya está en otro conteo abierto`)
    if (e.inv.ordenes.some((o) => ACTIVA.has(o.estado) && o.lineas.some((l) => (l.verificacion === 'PENDIENTE' || l.verificacion === 'CON_DIFERENCIA') && (posicionIds.includes(l.desdePosicionId) || posicionIds.includes(l.haciaPosicionId))))) return falla('Hay movimientos abiertos en esas ubicaciones: ciérralos antes de contar')
    const celdas = e.panorama.saldos.filter((s) => posicionIds.includes(s.posicionId) && s.cantidad > 0)
    if (!celdas.length) return falla('Esas ubicaciones no tienen unidades para contar')
    const c: ConteoDemo = {
      id: nuevoId(), numero: numeroDe(e.inv, 'CT', anioDe(e)), estado: 'PROGRAMADO', nota: nota?.trim() || undefined, programadoPor: actor.nombre, programadoEn: ahora(),
      lineas: celdas.map((s) => ({ id: nuevoId(), posicionId: s.posicionId, productoId: s.productoId, loteId: s.loteId, propietarioId: s.propietarioId, estado: s.estado, origen: origenDe(e, s.loteId, s.procedenciaId), procedenciaId: s.procedenciaId, cantidadSistema: s.cantidad })),
    }
    void n
    e.inv.conteos.push(c)
    registrar(e, actor, 'conteo_programado', 'conteos', c.numero, `Conteo programado (${c.lineas.length} líneas)`, nota)
    return { ok: true, id: c.id, numero: c.numero }
  }

  async registrarConteo(lineaId: string, cantidad: number, actor: Actor): Promise<ResultadoAccion<{ resultado: string }>> {
    const e = estadoE()
    if (!actor.roles.some((r) => ['auxiliar', 'jefe_almacen', 'reemplazo_jefe', 'asistente_dt'].includes(r))) return falla('No tienes permiso para contar')
    if (!Number.isInteger(cantidad) || cantidad < 0) return falla('Cuenta las unidades reales (0 o más)')
    const f = this.lineaConteo(lineaId)
    if (!f) return falla('No encontramos esa línea del conteo')
    const { c, l } = f
    if (c.estado === 'CERRADO') return falla('Este conteo ya está cerrado')
    let res: string
    if (l.conteo1 === undefined) {
      l.conteo1 = cantidad; l.contador1 = actor.id
      if (cantidad === l.cantidadSistema) l.resultado = 'COINCIDE'
      res = cantidad === l.cantidadSistema ? 'COINCIDE' : 'PENDIENTE_RECONTEO'
    } else if (l.conteo2 === undefined && l.conteo1 !== l.cantidadSistema) {
      if (l.contador1 === actor.id) return falla('El segundo conteo lo hace otra persona')
      l.conteo2 = cantidad; l.contador2 = actor.id
      l.resultado = clasificarReconteo(l.cantidadSistema, l.conteo1, cantidad)
      res = l.resultado
      if (l.resultado === 'DIFERENCIA_CONFIRMADA' || l.resultado === 'NO_CONCLUYENTE') {
        const n = nombres(e)
        alertar(e, 'CONTEO_CON_DIFERENCIA', 'jefe_almacen', `El conteo ${c.numero} tiene una diferencia en ${n.producto(l.productoId).split(' · ')[0]} lote ${n.lote(l.loteId)}. Busca la causa antes de corregir; no cambies una cantidad solo para que coincida.`, `ct-dif:${l.id}`, undefined, l.productoId, n.lote(l.loteId))
      }
    } else return falla('Esta línea ya no necesita más conteos')
    this.avanzar(c)
    return { ok: true, resultado: res }
  }

  async registrarCausaConteo(lineaId: string, causa: string, actor: Actor): Promise<ResultadoAccion> {
    if (!esJefe(actor.roles)) return falla('Solo el Jefe de Almacén (o su reemplazo) hace esto')
    const f = this.lineaConteo(lineaId)
    if (!f) return falla('No encontramos esa línea del conteo')
    if (f.l.resultado !== 'DIFERENCIA_CONFIRMADA' && f.l.resultado !== 'NO_CONCLUYENTE') return falla('Esa línea no tiene una diferencia por explicar')
    if (!causa?.trim()) return falla('Escribe la causa encontrada')
    f.l.causa = causa.trim()
    return { ok: true }
  }

  async proponerAjuste(lineaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE()
    if (!esJefe(actor.roles)) return falla('Solo el Jefe de Almacén (o su reemplazo) hace esto')
    const f = this.lineaConteo(lineaId)
    if (!f) return falla('No encontramos esa línea del conteo')
    const { c, l } = f
    if (l.resultado !== 'DIFERENCIA_CONFIRMADA') return falla('Solo se propone un ajuste cuando dos personas confirman la misma diferencia')
    if (!l.causa?.trim()) return falla('Registra primero la causa de la diferencia')
    if (!motivo?.trim()) return falla('Cuéntanos qué acción se toma')
    const n = nombres(e)
    const delta = l.conteo2! - l.cantidadSistema
    const a = {
      id: nuevoId(), numero: numeroDe(e.inv, 'AJ', anioDe(e)), conteoLineaId: l.id, conteoNumero: c.numero, producto: n.producto(l.productoId), lote: n.lote(l.loteId),
      posicion: n.posicion(l.posicionId), delta, causa: l.causa, motivo: motivo.trim(), estado: 'PROPUESTO' as const, propuestoPor: actor.nombre, propuestoEn: ahora(),
      propuestoPorId: actor.id, lineaId: l.id,
    }
    e.inv.ajustes.push(a)
    alertar(e, 'AJUSTE_POR_AUTORIZAR', 'direccion_tecnica', `El conteo ${c.numero} propone un ajuste de ${delta} unidades. Causa: ${l.causa}. Necesita tu autorización.`, `aj:${a.id}`, undefined, l.productoId)
    registrar(e, actor, 'ajuste_propuesto', 'ajustes_inventario', a.numero, `Ajuste propuesto (${delta})`, motivo.trim())
    return { ok: true, id: a.id }
  }

  async decidirAjuste(ajusteId: string, decision: 'AUTORIZAR' | 'RECHAZAR', nota: string | undefined, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!puedeDecidirAjuste(actor.roles)) return falla('Solo Dirección Técnica autoriza ajustes')
    const a = e.inv.ajustes.find((x) => x.id === ajusteId)
    if (!a) return falla('No encontramos ese ajuste')
    if (a.estado !== 'PROPUESTO') return falla('Este ajuste ya fue decidido')
    if (a.propuestoPorId === actor.id) return falla('Quien propone un ajuste no lo autoriza')
    const f = this.lineaConteo(a.lineaId)!
    if (decision === 'AUTORIZAR') {
      const celda = e.panorama.saldos.find((s) => mismaCelda(s, f.l.posicionId, f.l.loteId, f.l.estado, f.l.procedenciaId))
      if (!celda || celda.cantidad + a.delta < 0) return falla('Saldo insuficiente: alguien más ya movió esas unidades o no hay stock suficiente')
      celda.cantidad += a.delta
      if (celda.cantidad === 0) e.panorama.saldos.splice(e.panorama.saldos.indexOf(celda), 1)
      anotar(e.inv, `mov-aj-${a.numero}`, 'AJUSTE', ahora(), { motivo: `Ajuste ${a.numero} — ${a.causa}`, ejecutorId: actor.id, referenciaTipo: 'conteo', referenciaId: f.c.numero, sustentoTipo: 'ajuste', sustentoId: a.numero },
        [{ posicionId: f.l.posicionId, productoId: f.l.productoId, loteId: f.l.loteId, propietarioId: f.l.propietarioId, estado: f.l.estado, origen: f.l.origen, procedenciaId: f.l.procedenciaId, delta: a.delta }])
      a.estado = 'AUTORIZADO'; f.l.resultado = 'AJUSTADA'
    } else {
      if (!nota?.trim()) return falla('Cuéntanos por qué no se autoriza')
      a.estado = 'RECHAZADO'; f.l.resultado = 'ESCALADA'; f.l.nota = nota.trim()
    }
    a.decididoPor = actor.nombre; a.decididoEn = ahora(); a.notaDecision = nota?.trim() || undefined
    const al = e.alertas.find((x) => (x as { clave?: string }).clave === `aj:${a.id}` && x.estado === 'ABIERTA')
    if (al) { al.estado = 'ATENDIDA'; al.atendidaPor = actor.nombre; al.atendidaEn = ahora() }
    registrar(e, actor, `ajuste_${decision === 'AUTORIZAR' ? 'autorizar' : 'rechazar'}`, 'ajustes_inventario', a.numero, decision === 'AUTORIZAR' ? 'Ajuste autorizado' : 'Ajuste rechazado', nota)
    return { ok: true }
  }

  async escalarLineaConteo(lineaId: string, nota: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!esJefe(actor.roles)) return falla('Solo el Jefe de Almacén (o su reemplazo) hace esto')
    const f = this.lineaConteo(lineaId)
    if (!f) return falla('No encontramos esa línea del conteo')
    if (f.l.resultado !== 'DIFERENCIA_CONFIRMADA' && f.l.resultado !== 'NO_CONCLUYENTE') return falla('Esa línea no tiene una diferencia sin explicar')
    if (e.inv.ajustes.some((a) => a.lineaId === lineaId && a.estado === 'PROPUESTO')) return falla('Esa línea tiene un ajuste esperando la decisión de Dirección Técnica')
    if (!nota?.trim()) return falla('Adjunta lo que revisaste: qué se descartó y qué evidencia hay')
    f.l.resultado = 'ESCALADA'; f.l.nota = nota.trim()
    registrar(e, actor, 'conteo_linea_escalada', 'conteo_lineas', f.c.numero, 'Línea escalada', nota.trim())
    return { ok: true }
  }

  async cerrarConteo(id: string, causa: string | undefined, accion: string | undefined, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!esJefe(actor.roles)) return falla('Solo el Jefe de Almacén (o su reemplazo) hace esto')
    const c = this.conteos().find((x) => x.id === id)
    if (!c) return falla('No encontramos ese conteo')
    if (c.estado === 'CERRADO') return falla('Este conteo ya está cerrado')
    const pend = c.lineas.filter((l) => !l.resultado || l.resultado === 'DIFERENCIA_CONFIRMADA' || l.resultado === 'NO_CONCLUYENTE').length
    if (pend > 0) return falla(`Quedan ${pend} líneas sin resolver: cuéntalas, explica la causa y corrige, ajusta con autorización o escálalas`)
    const resultado = c.lineas.some((l) => l.resultado === 'ESCALADA') ? 'ESCALADO' : c.lineas.some((l) => l.resultado === 'AJUSTADA') ? 'CORREGIDO' : 'COINCIDE'
    if (resultado !== 'COINCIDE' && (!causa?.trim() || !accion?.trim())) return falla('Registra la causa y la acción para cerrar un conteo con diferencias')
    c.estado = 'CERRADO'; c.cerradoEn = ahora(); c.resultado = resultado; c.causa = causa?.trim() || undefined; c.accion = accion?.trim() || undefined
    registrar(e, actor, 'conteo_cerrado', 'conteos', c.numero, `Conteo cerrado: ${resultado}`, accion)
    return { ok: true }
  }

  async listarAjustes(): Promise<AjusteVista[]> {
    return [...estadoE().inv.ajustes].reverse().map(({ propuestoPorId: _p, lineaId: _l, ...a }) => { void _p; void _l; return structuredClone(a) as AjusteVista })
  }

  // ── Carga inicial ───────────────────────────────────────────────────────
  async estadoCargaInicial() { return estadoE().inv.cargaDecision }

  private erroresCarga(e: EstadoDemo, filas: FilaCargaInicial[]): ErrorFilaCarga[] {
    const out: ErrorFilaCarga[] = []
    filas.forEach((f, i) => {
      const fila = i + 1
      const prod = e.panorama.productos.find((p) => p.codigo === f.producto.trim())
      const prop = e.panorama.propietarios.find((p) => p.codigo === f.propietario.trim())
      const pos = e.panorama.posiciones.find((p) => p.codigo === f.posicion.trim())
      const cant = Number(f.cantidad)
      if (f.vence && Number.isNaN(Date.parse(f.vence))) out.push({ fila, error: 'La fecha de vencimiento no es válida' })
      if (!prod) out.push({ fila, error: `El producto «${f.producto}» no existe en el catálogo` })
      if (!prop) out.push({ fila, error: `El propietario «${f.propietario}» no existe` })
      if (!pos) out.push({ fila, error: `La ubicación «${f.posicion}» no existe` })
      if (!f.lote.trim()) out.push({ fila, error: 'Falta el lote' })
      if (!Number.isInteger(cant) || cant <= 0) out.push({ fila, error: 'La cantidad debe ser un entero mayor que cero' })
      const est = f.estado.trim().toUpperCase() as Estado
      if (!ESTADOS.includes(est)) out.push({ fila, error: `El estado «${f.estado}» no existe` })
      else if (pos && !areaAdmite(pos.tipoArea, est, 'CARGA_INICIAL')) out.push({ fila, error: `La zona ${pos.tipoArea} no admite unidades en estado ${est}` })
      if (pos && prop && !posicionAcepta(pos, prop.id, e.panorama.asignaciones, e.panorama.hoy)) out.push({ fila, error: `La ubicación ${f.posicion} no acepta stock de ese propietario` })
    })
    return out
  }

  async validarCargaInicial(filas: FilaCargaInicial[], actor: Actor): Promise<ErrorFilaCarga[]> {
    if (!actor.roles.includes('admin_wms')) return [{ fila: 0, error: 'No tienes permiso para la carga inicial' }]
    return this.erroresCarga(estadoE(), filas)
  }

  async crearCargaInicial(filas: FilaCargaInicial[], nota: string | undefined, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const e = estadoE()
    if (!actor.roles.includes('admin_wms')) return falla('No tienes permiso para la carga inicial')
    if (!filas.length) return falla('El archivo no tiene filas')
    const errores = this.erroresCarga(e, filas)
    if (errores.length) return falla(`La carga tiene ${new Set(errores.map((x) => x.fila)).size} filas con errores: corrígelas y vuelve a cargar`)
    const c = { id: nuevoId(), numero: numeroDe(e.inv, 'CI', anioDe(e)), estado: 'BORRADOR' as const, nota: nota?.trim() || undefined, creadoPor: actor.nombre, creadoEn: ahora(), filas: structuredClone(filas) }
    e.inv.cargas.push(c)
    registrar(e, actor, 'carga_inicial_creada', 'cargas_iniciales', c.numero, `Carga inicial creada (${filas.length} filas)`, nota)
    return { ok: true, id: c.id, numero: c.numero }
  }

  async decidirEstadoCargaInicial(estado: 'APROBADO' | 'CUARENTENA', actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!actor.roles.includes('direccion_tecnica')) return falla('Solo Dirección Técnica decide el estado del stock inicial')
    if (estado !== 'APROBADO' && estado !== 'CUARENTENA') return falla('El stock inicial se carga como Aprobado o como Cuarentena (lo rechazado se carga aparte, línea por línea)')
    e.inv.cargaDecision = estado
    registrar(e, actor, 'carga_inicial_estado_decidido', 'parametros', 'carga_inicial_estado', `Stock inicial: ${ETIQUETA_ESTADO[estado]}`, 'D-09')
    return { ok: true }
  }

  async confirmarCargaInicial(id: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!actor.roles.includes('admin_wms')) return falla('No tienes permiso para la carga inicial')
    const c = e.inv.cargas.find((x) => x.id === id)
    if (!c) return falla('No encontramos esa carga')
    if (c.estado !== 'BORRADOR') return falla('Esta carga ya no está en borrador')
    if (!e.inv.cargaDecision) return falla('Falta la decisión de Dirección Técnica sobre el estado del stock inicial (D-09): la carga no se confirma sin ella')
    for (const [i, f] of c.filas.entries()) {
      const est = f.estado.trim().toUpperCase()
      if (est !== e.inv.cargaDecision && est !== 'BAJAS_RECHAZADOS') return falla(`La fila ${i + 1} está en estado ${est}, pero Dirección Técnica decidió ${e.inv.cargaDecision} para el stock inicial`)
    }
    const nuevos: { posicionId: string; productoId: string; loteId: string; propietarioId: string; estado: Estado; procedenciaId: string; delta: number }[] = []
    for (const f of c.filas) {
      const prod = e.panorama.productos.find((p) => p.codigo === f.producto.trim())!
      const prop = e.panorama.propietarios.find((p) => p.codigo === f.propietario.trim())!
      const pos = e.panorama.posiciones.find((p) => p.codigo === f.posicion.trim())!
      let lote = e.panorama.lotes.find((l) => l.productoId === prod.id && l.codigo === f.lote.trim() && l.propietarioId === prop.id)
      if (lote && f.vence && lote.vence !== f.vence) return falla(`El lote ${f.lote} ya existe con otro vencimiento (${lote.vence ?? 'sin fecha'}). Un mismo lote no puede tener dos fechas.`)
      if (!lote) { lote = { id: nuevoId(), productoId: prod.id, codigo: f.lote.trim(), vence: f.vence || undefined, propietarioId: prop.id }; e.panorama.lotes.push(lote) }
      nuevos.push({ posicionId: pos.id, productoId: prod.id, loteId: lote.id, propietarioId: prop.id, estado: f.estado.trim().toUpperCase() as Estado, procedenciaId: nuevoId(), delta: Number(f.cantidad) })
    }
    for (const x of nuevos) e.panorama.saldos.push({ posicionId: x.posicionId, productoId: x.productoId, loteId: x.loteId, propietarioId: x.propietarioId, estado: x.estado, procedenciaId: x.procedenciaId, cantidad: x.delta })
    anotar(e.inv, `mov-ci-${c.numero}`, 'CARGA_INICIAL', ahora(), { motivo: `Carga inicial ${c.numero}`, ejecutorId: actor.id, referenciaTipo: 'carga_inicial', referenciaId: c.numero }, nuevos.map((x) => ({ ...x, origen: 'CARGA_INICIAL' as const })))
    c.estado = 'CONFIRMADA'; c.confirmadoEn = ahora()
    registrar(e, actor, 'carga_inicial_confirmada', 'cargas_iniciales', c.numero, `Carga inicial confirmada (${c.filas.length} filas)`)
    return { ok: true }
  }

  async listarCargasIniciales(): Promise<CargaInicialVista[]> {
    return [...estadoE().inv.cargas].reverse().map((c) => ({
      id: c.id, numero: c.numero, estado: c.estado, nota: c.nota, creadoPor: c.creadoPor, creadoEn: c.creadoEn, confirmadoEn: c.confirmadoEn,
      filas: c.filas.length, unidades: c.filas.reduce((n, f) => n + Number(f.cantidad), 0),
    }))
  }
}
void sumarDias
