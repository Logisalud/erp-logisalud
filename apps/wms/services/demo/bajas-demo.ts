// Bajas con sustento por motivo y la Orden de Baja LS-FR.56.01 en memoria (modo demostración). Mismas reglas que la migración 0026.
import {
  ESTADOS_BAJABLES, contenidoDeOrden, puedeAutorizarBaja, puedeEvaluarBaja, puedeSolicitarBaja, puedeTrasladarBaja,
  sustentoFaltante, validarLineaBaja,
  type ContenidoOrdenBaja, type DatosEvaluacionBaja, type EntradaBaja, type EstadoBajable, type EstadoOrdenBaja, type EvaluacionBajaVista, type LineaBajaVista,
  type MotivoBaja, type OrdenBajaResumen, type OrdenBajaVista, type StockEnBajasVista, type StockParaBaja, type SustentoBajaVista, type TipoSustentoBaja,
} from '@/domain/bajas'
import { TIPO_SUSTENTO_DE_MOTIVO } from '@/domain/bajas'
import { posicionAcepta } from '@/domain/zonas'
import { hashDe } from '@/lib/hash'
import { anotar, numeroDe } from './libro'
import { registrar, type EstadoDemo } from './estado'
import { alertar, ahora, estadoE, falla, nuevoId } from './entradas-demo'
import { comprometidoEn } from './despacho-demo'
import { origenDe } from './inventario-demo'
import { CargaDemo_ } from './carga-demo'
import type { RepositorioBajas } from '../repositorio-bajas'
import type { Actor, ResultadoAccion } from '../repositorio'

interface LineaInterna {
  id: string; n: number; productoId: string; loteId: string; posicionId: string; estadoOrigen: EstadoBajable; cantidad: number; motivo: MotivoBaja; detalle?: string
  vencePropuesta?: string; venceConfirmada?: string; venceConfirmadaPor?: string
  sustentos: SustentoBajaVista[]; evaluaciones: EvaluacionBajaVista[]
  reparto?: { procedenciaId: string; cantidad: number; origen: string }[]
}
interface OrdenInterna {
  id: string; numero: string; estado: EstadoOrdenBaja; propietarioId: string; nota?: string; solicitadaPor: string; solicitadaPorId: string; solicitadaEn: string
  cerradaPor?: string; cerradaEn?: string; motivoCierre?: string
  emitidaPor?: string; emitidaEn?: string; fechaDocumento?: string; movimientoId?: string; ordenMovimientoId?: string; destinoId?: string
  contenido?: ContenidoOrdenBaja; hash?: string
  anuladaPor?: string; anuladaEn?: string; motivoAnulacion?: string; reemiteDe?: string
  lineas: LineaInterna[]
}

/** El estado de Bajas vive aparte del resto, atado al estado general (si la demo se reinicia, esto también). */
const memoria = new WeakMap<EstadoDemo, OrdenInterna[]>()
const ordenesDe = (e: EstadoDemo): OrdenInterna[] => { let o = memoria.get(e); if (!o) { o = []; memoria.set(e, o) } return o }

const nombrePropietario = (e: EstadoDemo, id: string) => e.panorama.propietarios.find((p) => p.id === id)
const producto = (e: EstadoDemo, id: string) => e.panorama.productos.find((p) => p.id === id)
const lote = (e: EstadoDemo, id: string) => e.panorama.lotes.find((l) => l.id === id)
const posicion = (e: EstadoDemo, id: string) => e.panorama.posiciones.find((p) => p.id === id)

/** Lo que se puede pedir de baja en una celda: el saldo, menos lo comprometido, menos lo ya pedido en otras solicitudes abiertas (misma regla que wms._baja_disponible). */
function disponible(e: EstadoDemo, posicionId: string, loteId: string, estado: EstadoBajable, excluir?: string): { libre: number; comprometido: number } {
  const celdas = e.panorama.saldos.filter((s) => s.posicionId === posicionId && s.loteId === loteId && s.estado === estado && s.cantidad > 0)
  const comprometido = celdas.reduce((t, s) => t + comprometidoEn(e, s.posicionId, s.loteId, s.procedenciaId), 0)
  const pedido = ordenesDe(e).filter((o) => o.estado === 'SOLICITADA' && o.id !== excluir).flatMap((o) => o.lineas)
    .filter((l) => l.posicionId === posicionId && l.loteId === loteId && l.estadoOrigen === estado).reduce((t, l) => t + l.cantidad, 0)
  const total = celdas.reduce((t, s) => t + s.cantidad, 0)
  return { libre: Math.max(0, total - comprometido - pedido), comprometido }
}

function vistaLinea(e: EstadoDemo, l: LineaInterna): LineaBajaVista {
  const prod = producto(e, l.productoId); const lt = lote(e, l.loteId)
  const evaluacion = l.evaluaciones.at(-1)
  const base = {
    id: l.id, n: l.n, productoId: l.productoId, productoCodigo: prod?.codigo ?? '', producto: prod?.descripcion ?? '', presentacion: prod?.presentacion, registroSanitario: prod?.reg?.registroSanitario,
    loteId: l.loteId, lote: lt?.codigo ?? '', vence: lt?.vence, posicionId: l.posicionId, posicion: posicion(e, l.posicionId)?.codigo ?? '', estadoOrigen: l.estadoOrigen, cantidad: l.cantidad,
    motivo: l.motivo, detalle: l.detalle, vencePropuesta: l.vencePropuesta, venceConfirmada: l.venceConfirmada, venceConfirmadaPor: l.venceConfirmadaPor,
    sustentos: structuredClone(l.sustentos), evaluacion: evaluacion ? structuredClone(evaluacion) : undefined, evaluaciones: l.evaluaciones.length,
  }
  return { ...base, faltante: sustentoFaltante(base, e.panorama.hoy) }
}

function trasladoDe(e: EstadoDemo, o: OrdenInterna) {
  if (!o.ordenMovimientoId) return undefined
  const m = e.inv.ordenes.find((x) => x.id === o.ordenMovimientoId)
  if (!m) return undefined
  return { ordenMovimientoId: m.id, numero: m.numero, estado: m.estado, destino: o.destinoId ? posicion(e, o.destinoId)?.codigo : undefined }
}

function vistaOrden(e: EstadoDemo, o: OrdenInterna): OrdenBajaVista {
  const prop = nombrePropietario(e, o.propietarioId)
  const lineas = o.lineas.map((l) => vistaLinea(e, l))
  const previa = o.reemiteDe ? ordenesDe(e).find((x) => x.id === o.reemiteDe) : undefined
  const siguiente = ordenesDe(e).find((x) => x.reemiteDe === o.id)
  return {
    id: o.id, numero: o.numero, estado: o.estado, propietarioId: o.propietarioId, propietarioCodigo: prop?.codigo ?? '', propietario: prop?.razonSocial ?? '', nota: o.nota,
    solicitadaPor: o.solicitadaPor, solicitadaPorId: o.solicitadaPorId, solicitadaEn: o.solicitadaEn, cerradaPor: o.cerradaPor, cerradaEn: o.cerradaEn, motivoCierre: o.motivoCierre,
    emitidaPor: o.emitidaPor, emitidaEn: o.emitidaEn, fechaDocumento: o.fechaDocumento, hash: o.hash, anuladaPor: o.anuladaPor, anuladaEn: o.anuladaEn, motivoAnulacion: o.motivoAnulacion,
    reemiteDe: previa ? { id: previa.id, numero: previa.numero } : undefined, reemitidaPor: siguiente ? { id: siguiente.id, numero: siguiente.numero } : undefined,
    traslado: trasladoDe(e, o), lineas, unidades: lineas.reduce((t, l) => t + l.cantidad, 0),
  }
}

function resumen(e: EstadoDemo, o: OrdenInterna): OrdenBajaResumen {
  const v = vistaOrden(e, o)
  return {
    id: v.id, numero: v.numero, estado: v.estado, propietario: v.propietario, propietarioCodigo: v.propietarioCodigo, lineas: v.lineas.length, unidades: v.unidades,
    motivos: [...new Set(v.lineas.map((l) => l.motivo))], productos: [...new Set(v.lineas.map((l) => l.producto))], solicitadaPor: v.solicitadaPor, solicitadaEn: v.solicitadaEn,
    conFaltantes: v.estado === 'SOLICITADA' ? v.lineas.filter((l) => l.faltante).length : 0,
    porTrasladar: v.estado === 'EMITIDA' && !v.traslado,
  }
}

const cerrarAlerta = (e: EstadoDemo, clave: string, nota: string) => {
  for (const a of e.alertas) if (a.estado === 'ABIERTA' && (a as { clave?: string }).clave === clave) { a.estado = 'ATENDIDA'; a.atendidaEn = ahora(); a.nota = nota }
}

export class BajasDemo extends CargaDemo_ implements RepositorioBajas {
  async listarBajas(): Promise<OrdenBajaResumen[]> {
    const e = estadoE()
    return ordenesDe(e).map((o) => resumen(e, o)).sort((a, b) => b.solicitadaEn.localeCompare(a.solicitadaEn) || b.numero.localeCompare(a.numero))
  }

  async obtenerBaja(id: string): Promise<OrdenBajaVista | null> {
    const e = estadoE(); const o = ordenesDe(e).find((x) => x.id === id)
    return o ? vistaOrden(e, o) : null
  }

  async contenidoBaja(id: string) {
    const e = estadoE(); const o = ordenesDe(e).find((x) => x.id === id)
    if (!o) return null
    if (o.contenido) return { contenido: structuredClone(o.contenido), borrador: false, estado: o.estado, hash: o.hash }
    return { contenido: contenidoDeOrden(vistaOrden(e, o), e.panorama.hoy), borrador: true, estado: o.estado }
  }

  async stockParaBaja(propietarioId: string, consulta = '', limite = 40): Promise<StockParaBaja[]> {
    const e = estadoE(); const hoy = e.panorama.hoy
    const q = consulta.trim().toLowerCase()
    const celdas = new Map<string, StockParaBaja>()
    for (const s of e.panorama.saldos) {
      if (s.propietarioId !== propietarioId || s.cantidad <= 0 || !(ESTADOS_BAJABLES as readonly string[]).includes(s.estado)) continue
      const pos = posicion(e, s.posicionId)
      if (!pos || pos.tipoArea === 'DESPACHO' || pos.tipoArea === 'BAJAS_RECHAZADOS') continue
      const clave = `${s.posicionId}|${s.loteId}|${s.estado}`
      if (celdas.has(clave)) continue
      const lt = lote(e, s.loteId); const prod = producto(e, s.productoId)
      const fila: StockParaBaja = {
        posicionId: s.posicionId, posicion: pos.codigo, loteId: s.loteId, lote: lt?.codigo ?? '', vence: lt?.vence, vencido: !!lt?.vence && lt.vence < hoy, productoId: s.productoId,
        productoCodigo: prod?.codigo ?? '', producto: prod?.descripcion ?? '', estado: s.estado as EstadoBajable, disponible: disponible(e, s.posicionId, s.loteId, s.estado as EstadoBajable).libre,
      }
      if (fila.disponible <= 0) continue
      if (q && ![fila.producto, fila.productoCodigo, fila.lote, fila.posicion].some((t) => t.toLowerCase().includes(q))) continue
      celdas.set(clave, fila)
    }
    // Lo vencido primero (es lo más común), luego por producto.
    return [...celdas.values()].sort((a, b) => Number(b.vencido) - Number(a.vencido) || a.producto.localeCompare(b.producto, 'es') || a.lote.localeCompare(b.lote, 'es')).slice(0, limite)
  }

  async stockEnBajas(propietarioId?: string): Promise<StockEnBajasVista[]> {
    const e = estadoE(); const hoy = e.panorama.hoy
    const filas = new Map<string, StockEnBajasVista>()
    for (const s of e.panorama.saldos) {
      if (s.estado !== 'BAJAS_RECHAZADOS' || s.cantidad <= 0 || (propietarioId && s.propietarioId !== propietarioId)) continue
      const clave = `${s.posicionId}|${s.loteId}`
      const previa = filas.get(clave)
      if (previa) { previa.cantidad += s.cantidad; continue }
      const lt = lote(e, s.loteId); const prod = producto(e, s.productoId); const pos = posicion(e, s.posicionId); const prop = nombrePropietario(e, s.propietarioId)
      const ordenes = ordenesDe(e).filter((o) => o.estado === 'EMITIDA' && o.lineas.some((l) => l.loteId === s.loteId))
      filas.set(clave, {
        propietarioId: s.propietarioId, propietarioCodigo: prop?.codigo ?? '', propietario: prop?.razonSocial ?? '', productoId: s.productoId, productoCodigo: prod?.codigo ?? '', producto: prod?.descripcion ?? '',
        loteId: s.loteId, lote: lt?.codigo ?? '', vence: lt?.vence, vencido: !!lt?.vence && lt.vence < hoy, posicionId: s.posicionId, posicion: pos?.codigo ?? '', enAreaBajas: pos?.tipoArea === 'BAJAS_RECHAZADOS',
        cantidad: s.cantidad, ordenesBaja: ordenes.map((o) => o.numero).sort(), motivos: [...new Set(ordenes.flatMap((o) => o.lineas.filter((l) => l.loteId === s.loteId).map((l) => l.motivo)))].sort() as MotivoBaja[],
      })
    }
    return [...filas.values()].sort((a, b) => a.propietario.localeCompare(b.propietario, 'es') || a.producto.localeCompare(b.producto, 'es') || a.lote.localeCompare(b.lote, 'es'))
  }

  async ubicacionesDeBajas(propietarioId: string) {
    const e = estadoE()
    return e.panorama.posiciones.filter((p) => p.tipoArea === 'BAJAS_RECHAZADOS' && p.activa && posicionAcepta(p, propietarioId, e.panorama.asignaciones, e.panorama.hoy))
      .map((p) => ({ id: p.id, codigo: p.codigo })).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  }

  async solicitarBaja(entrada: EntradaBaja, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const e = estadoE(); const hoy = e.panorama.hoy
    if (!puedeSolicitarBaja(actor.roles)) return falla('No tienes permiso para solicitar una baja')
    if (!nombrePropietario(e, entrada.propietarioId)) return falla('Elige el propietario del stock')
    if (!entrada.lineas.length) return falla('Agrega al menos una línea a la baja')
    const lineas: LineaInterna[] = []
    let n = 0
    const vistos = new Set<string>()
    for (const x of entrada.lineas) {
      n += 1
      const lt = lote(e, x.loteId)
      if (!lt) return falla(`Línea ${n}: no encontramos ese lote`)
      const pos = posicion(e, x.posicionId)
      if (!pos) return falla(`Línea ${n} (lote ${lt.codigo}): no encontramos esa ubicación`)
      const d = disponible(e, pos.id, lt.id, x.estado, undefined)
      // lo pedido antes en ESTA misma solicitud también cuenta
      const clave = `${pos.id}|${lt.id}|${x.estado}`
      const err = validarLineaBaja(n, x, { lote: lt.codigo, vence: lt.vence, propietarioDelLote: lt.propietarioId, propietarioDeLaBaja: entrada.propietarioId, areaPosicion: pos.tipoArea, disponible: d.libre, comprometido: d.comprometido, posicion: pos.codigo }, hoy)
      if (err) return falla(err)
      if (vistos.has(clave)) return falla(`Línea ${n} (lote ${lt.codigo}): ese lote ya está en otra línea de esta baja; junta las cantidades`)
      vistos.add(clave)
      lineas.push({ id: nuevoId(), n, productoId: lt.productoId, loteId: lt.id, posicionId: pos.id, estadoOrigen: x.estado, cantidad: x.cantidad, motivo: x.motivo, detalle: x.detalle?.trim() || undefined, vencePropuesta: lt.vence, sustentos: [], evaluaciones: [] })
    }
    const anio = hoy.slice(0, 4)
    const numero = numeroDe(e.inv, 'BJ', anio)
    const o: OrdenInterna = { id: nuevoId(), numero, estado: 'SOLICITADA', propietarioId: entrada.propietarioId, nota: entrada.nota?.trim() || undefined, solicitadaPor: actor.nombre, solicitadaPorId: actor.id, solicitadaEn: ahora(), lineas }
    ordenesDe(e).push(o)
    const unidades = lineas.reduce((t, l) => t + l.cantidad, 0)
    alertar(e, 'BAJA_POR_AUTORIZAR', 'direccion_tecnica', `La baja ${numero} espera tu autorización: ${unidades} unidades (${[...new Set(lineas.map((l) => producto(e, l.productoId)?.descripcion ?? ''))].join(', ').slice(0, 120)}).`, `baja:${o.id}`)
    registrar(e, actor, 'baja_solicitada', 'ordenes_baja', numero, `Baja solicitada (${lineas.length} ${lineas.length === 1 ? 'línea' : 'líneas'})`, entrada.nota)
    return { ok: true, id: o.id, numero }
  }

  private lineaAbierta(e: EstadoDemo, lineaId: string): { o: OrdenInterna; l: LineaInterna } | ResultadoAccion<never> {
    for (const o of ordenesDe(e)) {
      const l = o.lineas.find((x) => x.id === lineaId)
      if (!l) continue
      if (o.estado !== 'SOLICITADA') return falla(`La baja ${o.numero} ya no está en solicitud`)
      return { o, l }
    }
    return falla('No encontramos esa línea')
  }

  async confirmarVencimientoBaja(lineaId: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!puedeAutorizarBaja(actor.roles)) return falla('Solo Dirección Técnica confirma el vencimiento de una baja')
    const r = this.lineaAbierta(e, lineaId)
    if ('ok' in r) return r
    const lt = lote(e, r.l.loteId)
    if (r.l.motivo !== 'VENCIDO') return falla('Esta línea no es una baja por vencimiento')
    if (!lt?.vence || lt.vence >= e.panorama.hoy) return falla(`El lote ${lt?.codigo} no está vencido: no se confirma como vencido`)
    r.l.venceConfirmada = lt.vence; r.l.venceConfirmadaPor = actor.nombre
    registrar(e, actor, 'baja_vencimiento_confirmado', 'ordenes_baja', r.o.numero, `Vencimiento del lote ${lt.codigo} confirmado`)
    return { ok: true }
  }

  async registrarEvaluacionBaja(lineaId: string, datos: DatosEvaluacionBaja, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!puedeEvaluarBaja(actor.roles)) return falla('Solo la asistente de Dirección Técnica o Dirección Técnica registran la evaluación')
    const r = this.lineaAbierta(e, lineaId)
    if ('ok' in r) return r
    if (r.l.motivo !== 'DETERIORO_DANO') return falla('Esta línea no es una baja por deterioro o daño')
    if (!datos.conclusion) return falla('Elige la conclusión de la evaluación')
    if (!datos.observacion.trim()) return falla('Describe lo que viste en la observación')
    if (!Object.keys(datos.checklist).length) return falla('Completa el checklist de la evaluación')
    r.l.evaluaciones.push({ id: nuevoId(), version: r.l.evaluaciones.length + 1, checklist: structuredClone(datos.checklist), certAnalisis: datos.certAnalisis, observacion: datos.observacion.trim(), conclusion: datos.conclusion, evaluadaPor: actor.nombre, evaluadaEn: ahora() })
    registrar(e, actor, 'baja_evaluacion_registrada', 'ordenes_baja', r.o.numero, `Evaluación versión ${r.l.evaluaciones.length}: ${datos.conclusion === 'NO_CONFORME' ? 'no conforme' : 'conforme'}`)
    return { ok: true }
  }

  async adjuntarSustentoBaja(lineaId: string, a: { tipo: TipoSustentoBaja; nombre: string; ref: string; hash?: string; bytes?: number; referencia?: string }, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!puedeSolicitarBaja(actor.roles)) return falla('No tienes permiso para adjuntar el sustento de una baja')
    const r = this.lineaAbierta(e, lineaId)
    if ('ok' in r) return r
    if (TIPO_SUSTENTO_DE_MOTIVO[r.l.motivo] !== a.tipo) return falla('Ese archivo no corresponde al motivo de la línea')
    if (!a.nombre.trim() || !a.ref.trim()) return falla('Falta el archivo')
    r.l.sustentos.push({ id: nuevoId(), tipo: a.tipo, nombreArchivo: a.nombre.trim(), archivoRef: a.ref, referencia: a.referencia?.trim() || undefined, bytes: a.bytes, agregadoPor: actor.nombre, agregadoEn: ahora() })
    registrar(e, actor, 'baja_sustento_adjuntado', 'ordenes_baja', r.o.numero, `Sustento adjuntado: ${a.nombre}`)
    return { ok: true }
  }

  async autorizarBaja(id: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); const hoy = e.panorama.hoy
    if (!puedeAutorizarBaja(actor.roles)) return falla('Solo Dirección Técnica autoriza una baja')
    const o = ordenesDe(e).find((x) => x.id === id)
    if (!o) return falla('No encontramos esa baja')
    if (o.estado !== 'SOLICITADA') return falla(`La baja ${o.numero} ya no está en solicitud (${o.estado})`)
    // 1) sin sustento no hay baja (todas las líneas)
    for (const l of o.lineas) { const f = sustentoFaltante(vistaLinea(e, l), hoy); if (f) return falla(`Sin sustento no se da de baja. ${f}`) }
    // 2) que todavía alcance, y el reparto entre las entregas de cada celda
    const partidas: { posicionId: string; productoId: string; loteId: string; propietarioId: string; estado: 'APROBADO' | 'CUARENTENA' | 'DEVOLUCIONES' | 'BAJAS_RECHAZADOS'; origen: ReturnType<typeof origenDe>; procedenciaId: string; delta: number }[] = []
    const repartos = new Map<string, LineaInterna['reparto']>()
    for (const l of o.lineas) {
      const lt = lote(e, l.loteId)
      if (l.cantidad > disponible(e, l.posicionId, l.loteId, l.estadoOrigen, o.id).libre) return falla(`Línea ${l.n} (lote ${lt?.codigo}): ya no hay tantas unidades disponibles en esa ubicación; no se da de baja más de lo que hay`)
      let resta = l.cantidad; const rep: NonNullable<LineaInterna['reparto']> = []
      for (const s of e.panorama.saldos.filter((x) => x.posicionId === l.posicionId && x.loteId === l.loteId && x.estado === l.estadoOrigen && x.cantidad > 0).sort((a, b) => a.procedenciaId.localeCompare(b.procedenciaId))) {
        if (resta <= 0) break
        const tomar = Math.min(resta, s.cantidad - comprometidoEn(e, s.posicionId, s.loteId, s.procedenciaId))
        if (tomar <= 0) continue
        const origen = origenDe(e, s.loteId, s.procedenciaId)
        partidas.push({ posicionId: l.posicionId, productoId: l.productoId, loteId: l.loteId, propietarioId: o.propietarioId, estado: l.estadoOrigen, origen, procedenciaId: s.procedenciaId, delta: -tomar })
        partidas.push({ posicionId: l.posicionId, productoId: l.productoId, loteId: l.loteId, propietarioId: o.propietarioId, estado: 'BAJAS_RECHAZADOS', origen, procedenciaId: s.procedenciaId, delta: tomar })
        rep.push({ procedenciaId: s.procedenciaId, cantidad: tomar, origen }); resta -= tomar
      }
      if (resta > 0) return falla(`Línea ${l.n} (lote ${lt?.codigo}): ya no hay tantas unidades disponibles; no se da de baja más de lo que hay`)
      repartos.set(l.id, rep)
    }
    // 3) el ledger: UN cambio de estado en el mismo lugar, con la Orden como sustento
    const movimientoId = `mov-baja-${o.numero}`
    anotar(e.inv, movimientoId, 'CAMBIO_ESTADO', ahora(), { motivo: `Orden de Baja ${o.numero}`, ejecutorId: actor.id, referenciaTipo: 'orden_baja', referenciaId: o.numero, sustentoTipo: 'ORDEN_BAJA', sustentoId: o.numero }, partidas)
    for (const p of partidas) {
      const celda = e.panorama.saldos.find((s) => s.posicionId === p.posicionId && s.loteId === p.loteId && s.estado === p.estado && s.procedenciaId === p.procedenciaId)
      if (p.delta < 0) { if (celda) { celda.cantidad += p.delta; if (celda.cantidad === 0) e.panorama.saldos.splice(e.panorama.saldos.indexOf(celda), 1) } }
      else if (celda) celda.cantidad += p.delta
      else e.panorama.saldos.push({ posicionId: p.posicionId, productoId: p.productoId, loteId: p.loteId, propietarioId: p.propietarioId, estado: p.estado, procedenciaId: p.procedenciaId, cantidad: p.delta })
    }
    for (const l of o.lineas) l.reparto = repartos.get(l.id)
    o.estado = 'EMITIDA'; o.emitidaPor = actor.nombre; o.emitidaEn = ahora(); o.fechaDocumento = hoy; o.movimientoId = movimientoId
    o.contenido = contenidoDeOrden(vistaOrden(e, o), hoy); o.hash = hashDe(o.contenido)
    cerrarAlerta(e, `baja:${o.id}`, `Se autorizó la baja ${o.numero}`)
    for (const l of o.lineas) {
      const quedan = e.panorama.saldos.some((s) => s.loteId === l.loteId && s.cantidad > 0 && s.estado !== 'BAJAS_RECHAZADOS')
      if (!quedan) cerrarAlerta(e, `lote-vencido:${l.loteId}`, `Se dio de baja con la Orden ${o.numero}`)
    }
    alertar(e, 'BAJA_POR_TRASLADAR', 'jefe_almacen', `La baja ${o.numero} ya está autorizada: lleva las ${o.lineas.reduce((t, l) => t + l.cantidad, 0)} unidades al área de Bajas y regístralo en Movimientos.`, `baja-traslado:${o.id}`)
    registrar(e, actor, 'baja_autorizada', 'ordenes_baja', o.numero, `Orden de Baja emitida; stock a Bajas/Rechazados (hash ${o.hash.slice(0, 12)})`)
    return { ok: true }
  }

  async cerrarSolicitudBaja(id: string, decision: 'RECHAZADA' | 'CANCELADA', motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!motivo.trim()) return falla('Cuéntanos el motivo', { motivo: 'Cuéntanos el motivo.' })
    const o = ordenesDe(e).find((x) => x.id === id)
    if (!o) return falla('No encontramos esa baja')
    if (o.estado !== 'SOLICITADA') return falla(`La baja ${o.numero} ya no está en solicitud (${o.estado})`)
    if (decision === 'RECHAZADA' && !puedeAutorizarBaja(actor.roles)) return falla('Solo Dirección Técnica rechaza una baja')
    if (decision === 'CANCELADA' && !(o.solicitadaPorId === actor.id || actor.roles.includes('direccion_tecnica'))) return falla('Solo quien pidió la baja, o Dirección Técnica, la retira')
    o.estado = decision; o.cerradaPor = actor.nombre; o.cerradaEn = ahora(); o.motivoCierre = motivo.trim()
    cerrarAlerta(e, `baja:${o.id}`, decision === 'RECHAZADA' ? 'Se rechazó la baja' : 'Se retiró la solicitud')
    registrar(e, actor, decision === 'RECHAZADA' ? 'baja_rechazada' : 'baja_retirada', 'ordenes_baja', o.numero, decision === 'RECHAZADA' ? 'Baja rechazada' : 'Solicitud retirada', motivo.trim())
    return { ok: true }
  }

  async anularOrdenBaja(id: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!puedeAutorizarBaja(actor.roles)) return falla('Solo Dirección Técnica anula una Orden de Baja')
    if (!motivo.trim()) return falla('La anulación necesita un motivo', { motivo: 'Cuéntanos por qué se anula.' })
    const o = ordenesDe(e).find((x) => x.id === id)
    if (!o) return falla('No encontramos esa Orden de Baja')
    if (o.estado === 'ANULADA') return falla(`La Orden ${o.numero} ya está anulada`)
    if (o.estado !== 'EMITIDA') return falla('Solo se anula una Orden emitida; una solicitud se rechaza o se retira')
    o.estado = 'ANULADA'; o.anuladaPor = actor.nombre; o.anuladaEn = ahora(); o.motivoAnulacion = motivo.trim()
    registrar(e, actor, 'orden_baja_anulada', 'ordenes_baja', o.numero, 'Orden de Baja anulada (el stock sigue en Bajas)', motivo.trim())
    return { ok: true }
  }

  async reemitirOrdenBaja(id: string, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const e = estadoE(); const hoy = e.panorama.hoy
    if (!puedeAutorizarBaja(actor.roles)) return falla('Solo Dirección Técnica reemite una Orden de Baja')
    const a = ordenesDe(e).find((x) => x.id === id)
    if (!a || a.estado !== 'ANULADA') return falla('Solo se reemite una Orden anulada')
    if (ordenesDe(e).some((x) => x.reemiteDe === id)) return falla('Esa Orden ya fue reemitida')
    const numero = numeroDe(e.inv, 'BJ', hoy.slice(0, 4))
    const nueva: OrdenInterna = {
      ...structuredClone(a), id: nuevoId(), numero, estado: 'EMITIDA', solicitadaPor: actor.nombre, solicitadaPorId: actor.id, solicitadaEn: ahora(), emitidaPor: actor.nombre, emitidaEn: ahora(), fechaDocumento: hoy,
      anuladaPor: undefined, anuladaEn: undefined, motivoAnulacion: undefined, cerradaPor: undefined, cerradaEn: undefined, motivoCierre: undefined, reemiteDe: a.id,
      lineas: a.lineas.map((l) => ({ ...structuredClone(l), id: nuevoId() })),
    }
    ordenesDe(e).push(nueva)
    nueva.contenido = contenidoDeOrden({ ...vistaOrden(e, nueva) }, hoy); nueva.hash = hashDe(nueva.contenido)
    registrar(e, actor, 'orden_baja_reemitida', 'ordenes_baja', numero, `Reemite la Orden ${a.numero}`)
    return { ok: true, id: nueva.id, numero }
  }

  async trasladarBaja(id: string, destinoId: string | undefined, actor: Actor): Promise<ResultadoAccion<{ movimiento: string }>> {
    const e = estadoE()
    if (!puedeTrasladarBaja(actor.roles)) return falla('No tienes permiso para registrar movimientos')
    const o = ordenesDe(e).find((x) => x.id === id)
    if (!o) return falla('No encontramos esa Orden de Baja')
    if (o.estado !== 'EMITIDA') return falla(`La Orden de Baja ${o.numero} no está vigente (${o.estado})`)
    const previo = o.ordenMovimientoId ? e.inv.ordenes.find((m) => m.id === o.ordenMovimientoId) : undefined
    if (previo && previo.estado !== 'ANULADO') return falla(`El traslado de esta baja ya está registrado (${previo.numero})`)
    const opciones = await this.ubicacionesDeBajas(o.propietarioId)
    let destino = destinoId
    if (destino) {
      const pos = posicion(e, destino)
      if (!pos || pos.tipoArea !== 'BAJAS_RECHAZADOS') return falla('Esa ubicación no es del área de Bajas')
      if (!opciones.some((p) => p.id === destino)) return falla('Esa ubicación de Bajas no es de este propietario')
    } else {
      const conStock = opciones.find((p) => e.panorama.saldos.some((s) => s.posicionId === p.id && s.propietarioId === o.propietarioId && s.cantidad > 0))
      destino = (conStock ?? opciones[0])?.id
      if (!destino) return falla('Este propietario todavía no tiene una ubicación en el área de Bajas: Dirección Técnica y el Jefe de Almacén deben definirla')
    }
    const lineas = o.lineas.flatMap((l) => (l.reparto ?? []).map((r) => ({ loteId: l.loteId, estado: 'BAJAS_RECHAZADOS' as const, procedenciaId: r.procedenciaId, desdePosicionId: l.posicionId, haciaPosicionId: destino!, cantidad: r.cantidad })))
    const r = await this.ejecutarMovimiento(lineas, `Traslado a Bajas de la Orden ${o.numero}`, actor, `baja-${o.id}-${Date.now()}`)
    if (!r.ok) return r
    o.ordenMovimientoId = r.id; o.destinoId = destino
    cerrarAlerta(e, `baja-traslado:${o.id}`, 'Se registró el traslado a Bajas')
    registrar(e, actor, 'baja_trasladada', 'ordenes_baja', o.numero, `Traslado a Bajas registrado (${r.numero})`)
    return { ok: true, movimiento: r.numero }
  }
}
