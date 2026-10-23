// OS-5 en memoria (modo demostración): muestreo LS-TB.02.02 (antecedentes de calidad), liberación LS-POE.04.05 (observación reversible y dictamen del DT del cliente)
// y retornos (recepción tipo devolución). Mismas reglas y mismos mensajes que la migración 0025.
import { esSalidaConfirmada } from '@/domain/despacho'
import { ESTADO_INICIAL } from '@/domain/entradas'
import { MotorEntradas, alertar, ahora, estadoE, falla, nuevoId, vistaOrganoleptica } from './entradas-demo'
import { antecedenteVigente, TABLA_LS_TB_02_02, tablaRige, type AntecedenteCalidadVista, type PanoramaMuestreo } from '@/domain/muestreo'
import {
  TIPOS_DOCUMENTO_DICTAMEN, observacionVigente, puedeMarcarAntecedentes, puedeObservar, puedeRegistrarDictamenCliente, validarDictamenCliente, decisionTrasDictamenes,
  type DictamenClienteVista, type ObservacionVista,
} from '@/domain/liberacion'
import { puedeOriginarRetorno, validarRetorno, type EntradaRetorno, type LineaRetornable, type ResumenSalidaRetorno, type RetornoVista, type SalidaParaRetorno } from '@/domain/retornos'
import type { OrganolepticaVista } from '@/domain/entradas-vistas'
import type { Estado } from '@/domain/tipos'
import { registrar, type EstadoDemo } from './estado'
import { desp, duenoDelAlmacen } from './despacho-demo'
import { CierreRutaDemo } from './cierre-ruta-demo'
import { quitarSaldo, origenDe } from './inventario-demo'
import { anotar, numeroDe } from './libro'
import type { DatosRegistroDictamen, RepositorioLiberacion } from '../repositorio-liberacion'
import type { Actor, ResultadoAccion } from '../repositorio'

const antecedentes = (e: EstadoDemo) => (e.antecedentes ??= [])
const hoyIso = (e: EstadoDemo) => e.panorama.hoy

/** Una Orden de Salida ya despachada (con su stock descontado) para que el retorno tenga de dónde volver. Se crea la primera vez que se la pide. */
function sembrarSalidaDespachada(e: EstadoDemo) {
  if (e.os5Sembrado) return
  e.os5Sembrado = true
  const d = desp(e)
  const dueno = duenoDelAlmacen(e)
  const pos = new Map(e.panorama.posiciones.map((p) => [p.id, p]))
  const celdas = e.panorama.saldos.filter((s) => s.estado === 'APROBADO' && s.propietarioId === dueno && s.cantidad >= 40 && pos.get(s.posicionId)?.tipoArea === 'APROBADOS')
  const elegidas: typeof celdas = []
  for (const c of celdas) if (elegidas.length < 2 && !elegidas.some((x) => x.productoId === c.productoId)) elegidas.push(c)
  if (elegidas.length === 0) return
  const hace = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const salida = { id: nuevoId(), numero: numeroDe(e.inv, 'SAL', e.panorama.hoy.slice(0, 4)), requiereEmbalaje: false, pedidoId: 'ped-historico-1', propietarioId: dueno, estado: 'CONFIRMADA' as const, lineas: [] as typeof d.salidas[number]['lineas'], creadaEn: hace, creadaPor: 'demo:jefe_transporte' }
  for (const c of elegidas) {
    const cantidad = 30
    const linea = { id: nuevoId(), productoId: c.productoId, cantidad, estado: 'CONFIRMADA' as const, fefo: [{ loteId: c.loteId, cantidad }] }
    salida.lineas.push(linea)
    const origen = origenDe(e, c.loteId, c.procedenciaId)
    if (!quitarSaldo(e, { loteId: c.loteId, estado: 'APROBADO', procedenciaId: c.procedenciaId, posicionId: c.posicionId, cantidad })) continue
    anotar(e.inv, `sal-${salida.numero}-${linea.id.slice(-6)}`, 'SALIDA', hace, { motivo: `Salida ${salida.numero}`, ejecutorId: 'demo:jefe_transporte', referenciaTipo: 'salida_linea', referenciaId: linea.id },
      [{ productoId: c.productoId, loteId: c.loteId, propietarioId: c.propietarioId, estado: 'APROBADO', origen, procedenciaId: c.procedenciaId, posicionId: c.posicionId, delta: -cantidad }])
    d.reservas.push({ id: nuevoId(), lineaId: linea.id, salidaId: salida.id, productoId: c.productoId, loteId: c.loteId, posicionId: c.posicionId, posicionOrigenId: c.posicionId, procedenciaId: c.procedenciaId, cantidad, estado: 'CONSUMIDA' })
  }
  d.salidas.push(salida)
}

function retornosDe(e: EstadoDemo, salidaId: string): RetornoVista[] {
  return e.solicitudes.filter((s) => s.retorno?.salidaId === salidaId).map((s) => ({
    solicitudId: s.id, solicitudNumero: s.numero, motivo: s.retorno!.motivo, estado: s.estado, unidades: s.lineas.reduce((t, l) => t + l.cantidad, 0), creadoEn: s.creadoEn, guiaNumero: s.guiaNumero,
  })).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
}

function lineasRetornables(e: EstadoDemo, salidaId: string): LineaRetornable[] {
  const d = desp(e)
  const salida = d.salidas.find((s) => s.id === salidaId)
  if (!salida) return []
  const anunciado = e.solicitudes.filter((s) => s.retorno?.salidaId === salidaId && s.estado !== 'ANULADA')
  const porLote = new Map<string, number>()
  for (const r of d.reservas.filter((x) => x.estado === 'CONSUMIDA' && salida.lineas.some((l) => l.id === x.lineaId))) porLote.set(r.loteId, (porLote.get(r.loteId) ?? 0) + r.cantidad)
  const out: LineaRetornable[] = []
  for (const [loteId, despachado] of porLote) {
    const lote = e.panorama.lotes.find((l) => l.id === loteId)
    const prod = e.panorama.productos.find((p) => p.id === lote?.productoId)
    if (!lote || !prod) continue
    const ya = anunciado.flatMap((s) => s.lineas).filter((l) => l.productoId === lote.productoId && l.lote === lote.codigo).reduce((t, l) => t + l.cantidad, 0)
    out.push({ productoId: prod.id, productoCodigo: prod.codigo, producto: prod.descripcion, loteId, lote: lote.codigo, vence: lote.vence, despachado, yaRetornado: ya, retornable: Math.max(0, despachado - ya) })
  }
  return out.sort((a, b) => a.lote.localeCompare(b.lote))
}

/** Cambia el estado de unidades de una celda, sin perder la procedencia (parte la celda si el cambio es parcial). */
function cambiarEstado(e: EstadoDemo, celda: EstadoDemo['panorama']['saldos'][number], nuevo: Estado, cantidad: number) {
  const sal = e.panorama.saldos
  celda.cantidad -= cantidad
  if (celda.cantidad === 0) sal.splice(sal.indexOf(celda), 1)
  const destino = sal.find((s) => s.posicionId === celda.posicionId && s.loteId === celda.loteId && s.estado === nuevo && s.procedenciaId === celda.procedenciaId)
  if (destino) destino.cantidad += cantidad
  else sal.push({ ...celda, estado: nuevo, cantidad })
}

export class LiberacionDemo extends CierreRutaDemo implements RepositorioLiberacion {
  // ── Muestreo ────────────────────────────────────────────────────────────────
  async panoramaMuestreo(): Promise<PanoramaMuestreo> {
    const e = estadoE()
    const hoy = hoyIso(e)
    return structuredClone({
      hoy,
      tablas: [{ ...TABLA_LS_TB_02_02, nota: 'Tamaño de muestra (DT, 17-10-2026): menos de 100 unidades y devoluciones, 100 %; simplificada por defecto; normal para producto o proveedor nuevo; estricta (100 %) para productos con antecedentes de calidad.', vigente: tablaRige(TABLA_LS_TB_02_02, hoy) }],
      antecedentes: [...antecedentes(e)].sort((a, b) => Number(!!a.quitadoEn) - Number(!!b.quitadoEn) || b.marcadoEn.localeCompare(a.marcadoEn)),
      productos: e.panorama.productos.filter((p) => p.estado !== 'inactivo').map((p) => ({ id: p.id, codigo: p.codigo, descripcion: p.descripcion })),
    })
  }

  async marcarAntecedentes(productoId: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!puedeMarcarAntecedentes(actor.roles)) return falla('Solo Dirección Técnica marca un producto con antecedentes de calidad')
    if (!motivo.trim()) return falla('Cuéntanos qué antecedentes de calidad tiene el producto', { motivo: 'Cuéntanos qué antecedentes de calidad tiene el producto.' })
    const p = e.panorama.productos.find((x) => x.id === productoId)
    if (!p) return falla('No encontramos ese producto')
    if (antecedentes(e).some((a) => a.productoId === productoId && antecedenteVigente(a))) return falla('Ese producto ya está marcado con antecedentes de calidad')
    antecedentes(e).push({ id: nuevoId(), productoId, productoCodigo: p.codigo, producto: p.descripcion, motivo: motivo.trim(), marcadoPor: actor.nombre, marcadoEn: ahora() })
    registrar(e, actor, 'antecedentes_de_calidad_marcados', 'productos', p.codigo, 'Se evalúa al 100 %', motivo.trim())
    return { ok: true }
  }

  async quitarAntecedentes(productoId: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!puedeMarcarAntecedentes(actor.roles)) return falla('Solo Dirección Técnica quita la marca de antecedentes de calidad')
    if (!motivo.trim()) return falla('Cuéntanos por qué se quita la marca de antecedentes de calidad', { motivo: 'Cuéntanos por qué se quita la marca.' })
    const a = antecedentes(e).find((x) => x.productoId === productoId && antecedenteVigente(x))
    if (!a) return falla('Ese producto no tiene la marca de antecedentes de calidad')
    a.quitadoPor = actor.nombre; a.quitadoEn = ahora(); a.motivoQuita = motivo.trim()
    registrar(e, actor, 'antecedentes_de_calidad_quitados', 'productos', a.productoCodigo, 'Vuelve a la evaluación por la tabla', motivo.trim())
    return { ok: true }
  }

  // ── Liberación ─────────────────────────────────────────────────────────────
  private acta(e: EstadoDemo, id: string): OrganolepticaVista | undefined { return e.organolepticas.find((x) => x.id === id) }

  async observarActa(actaId: string, texto: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    const o = this.acta(e, actaId)
    if (!o) return falla('Acta inexistente')
    const v = vistaOrganoleptica(e, o)
    if (!puedeObservar(actor.roles, !!v.esDeCliente)) return falla(v.esDeCliente ? 'Solo Sandra o Dirección Técnica registran la observación del DT de un cliente' : 'Solo Dirección Técnica deja un producto Observado')
    if (o.estado === 'FIRMADA') return falla('El acta ya está firmada: no se puede observar')
    if (o.estado !== 'PENDIENTE_DT') return falla('El acta todavía no está completa: falta que la envíen a Dirección Técnica')
    if (!texto.trim()) return falla('Cuéntanos qué se observa y qué hay que corregir', { texto: 'Cuéntanos qué se observa y qué hay que corregir.' })
    if ((o.observaciones ?? []).some(observacionVigente)) return falla('Esa acta ya está Observada')
    const ob: ObservacionVista = { id: nuevoId(), actaId, texto: texto.trim(), registradaPor: actor.nombre, registradaEn: ahora() }
    ;(o.observaciones ??= []).unshift(ob)
    registrar(e, actor, 'acta_organoleptica_observada', 'actas_organolepticas', o.numero, 'Observada: el producto sigue en Cuarentena hasta la disposición final', texto.trim())
    return { ok: true }
  }

  async levantarObservacion(actaId: string, nota: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    const o = this.acta(e, actaId)
    if (!o) return falla('Acta inexistente')
    const v = vistaOrganoleptica(e, o)
    if (!puedeObservar(actor.roles, !!v.esDeCliente)) return falla(v.esDeCliente ? 'Solo Sandra o Dirección Técnica levantan la observación del DT de un cliente' : 'Solo Dirección Técnica levanta una observación')
    if (!nota.trim()) return falla('Cuéntanos cómo se resolvió la observación', { nota: 'Cuéntanos cómo se resolvió la observación.' })
    const ob = (o.observaciones ?? []).find(observacionVigente)
    if (!ob) return falla('Esa acta no está Observada')
    ob.cerradaEn = ahora(); ob.cerradaPor = actor.nombre; ob.nota = `Observación levantada: ${nota.trim()}`
    registrar(e, actor, 'observacion_levantada', 'actas_organolepticas', o.numero, 'Observación levantada', nota.trim())
    return { ok: true }
  }

  private validarDictamen(e: EstadoDemo, o: OrganolepticaVista, liberada: number, rechazada: number): string | null {
    const v = vistaOrganoleptica(e, o)
    if (!v.esDeCliente) return 'Este producto es de Logissa: lo libera Dirección Técnica de Logissa con su acta, no un dictamen de cliente'
    if (o.estado === 'FIRMADA') return 'El acta ya está firmada: ese lote ya tiene su decisión'
    if (o.estado !== 'PENDIENTE_DT') return 'La evaluación organoléptica todavía no está completa: Sandra la termina y la envía antes de registrar el dictamen del DT del cliente'
    if (liberada + rechazada <= 0) return 'El dictamen tiene que liberar o rechazar al menos una unidad'
    if (liberada + rechazada > (v.pendienteDecision ?? 0)) return `Liberadas y rechazadas suman ${liberada + rechazada}, pero solo hay ${v.pendienteDecision ?? 0} unidades esperando decisión`
    return null
  }

  async registrarDictamen(actaId: string, datos: DatosRegistroDictamen, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE()
    if (!puedeRegistrarDictamenCliente(actor.roles)) return falla('Solo Sandra o Dirección Técnica registran el dictamen del DT de un cliente')
    const o = this.acta(e, actaId)
    if (!o) return falla('Acta inexistente')
    const m = this.validarDictamen(e, o, datos.liberada, datos.rechazada)
    if (m) return falla(m)
    if (!datos.fechaDictamen) return falla('Escribe la fecha del dictamen (la del documento que recibiste)')
    if (datos.fechaDictamen > hoyIso(e)) return falla('La fecha del dictamen no puede ser futura')
    if (!datos.documento.ref || !datos.documento.hash) return falla('Adjunta el documento del dictamen que llegó por correo (PDF o imagen)')
    if (!(TIPOS_DOCUMENTO_DICTAMEN as readonly string[]).includes(datos.documento.tipo)) return falla('El documento tiene que ser un PDF o una imagen (PNG o JPG)')
    if ((o.dictamenes ?? []).some((d) => d.estado === 'REGISTRADO')) return falla('Ya hay un dictamen registrado para este lote esperando confirmación: confírmalo o anúlalo con motivo')
    const d: DictamenClienteVista = {
      id: nuevoId(), actaId, estado: 'REGISTRADO', via: 'PERSONAL', liberada: datos.liberada, rechazada: datos.rechazada, fechaDictamen: datos.fechaDictamen,
      observacion: datos.observacion?.trim() || undefined, documentoNombre: datos.documento.nombre, documentoRef: datos.documento.ref, documentoHash: datos.documento.hash,
      registradoPor: actor.nombre, registradoEn: ahora(),
    }
    ;(o.dictamenes ??= []).unshift(d)
    // El otro de los dos confirma: si lo registró Katia, avisa a Sandra; si lo registró Sandra, a Katia.
    alertar(e, 'DICTAMEN_POR_CONFIRMAR', actor.roles.includes('direccion_tecnica') ? 'asistente_dt' : 'direccion_tecnica',
      `Se registró el dictamen del DT del cliente para ${o.producto} (lote ${o.lote}): ${datos.liberada} liberadas y ${datos.rechazada} rechazadas. Falta confirmar el cambio de estado.`, `dictamen:${d.id}`, o.solicitudId, o.productoId, o.lote)
    registrar(e, actor, 'dictamen_cliente_registrado', 'actas_organolepticas', o.numero, `${datos.liberada} liberadas y ${datos.rechazada} rechazadas · ${datos.documento.nombre}`, datos.observacion)
    return { ok: true, id: d.id }
  }

  private encontrarDictamen(e: EstadoDemo, id: string) {
    for (const o of e.organolepticas) { const d = (o.dictamenes ?? []).find((x) => x.id === id); if (d) return { o, d } }
    return null
  }

  async confirmarDictamen(dictamenId: string, actor: Actor): Promise<ResultadoAccion<{ firmada: boolean }>> {
    const e = estadoE()
    if (!puedeRegistrarDictamenCliente(actor.roles)) return falla('Solo Sandra o Dirección Técnica confirman el cambio de estado por el dictamen del DT de un cliente')
    const f = this.encontrarDictamen(e, dictamenId)
    if (!f) return falla('No encontramos ese dictamen')
    const { o, d } = f
    if (d.estado !== 'REGISTRADO') return falla(`Ese dictamen ya está ${d.estado === 'CONFIRMADO' ? 'confirmado' : 'anulado'}`)
    const m = this.validarDictamen(e, o, d.liberada, d.rechazada)
    if (m) return falla(m)
    const desde = ESTADO_INICIAL[o.ingresoTipo]
    let porLiberar = d.liberada; let porRechazar = d.rechazada
    const partidas: Parameters<typeof anotar>[5] = []
    for (const c of e.panorama.saldos.filter((s) => s.procedenciaId === o.ingresoLoteId && s.estado === desde && s.cantidad > 0)) {
      const base = { posicionId: c.posicionId, productoId: c.productoId, loteId: c.loteId, propietarioId: c.propietarioId, origen: origenDe(e, c.loteId, c.procedenciaId), procedenciaId: c.procedenciaId }
      let disponible = c.cantidad
      for (const [nuevo, restante] of [['APROBADO', () => porLiberar], ['BAJAS_RECHAZADOS', () => porRechazar]] as const) {
        const tomar = Math.min(disponible, restante())
        if (tomar <= 0) continue
        partidas.push({ ...base, estado: desde, delta: -tomar }, { ...base, estado: nuevo, delta: tomar })
        cambiarEstado(e, c, nuevo, tomar)
        disponible -= tomar
        if (nuevo === 'APROBADO') porLiberar -= tomar; else porRechazar -= tomar
      }
      if (porLiberar + porRechazar <= 0) break
    }
    anotar(e.inv, `mov-dictamen-${d.id.slice(-8)}`, 'CAMBIO_ESTADO', ahora(), { motivo: `Dictamen del DT del cliente · acta organoléptica ${o.numero}`, ejecutorId: actor.id, referenciaTipo: 'dictamen_cliente', referenciaId: d.id, sustentoTipo: 'DICTAMEN_CLIENTE', sustentoId: d.id }, partidas)
    d.estado = 'CONFIRMADO'; d.confirmadoPor = actor.nombre; d.confirmadoEn = ahora()
    const pendiente = vistaOrganoleptica(e, o).pendienteDecision ?? 0
    let firmada = false
    if (pendiente === 0) {
      const confirmados = (o.dictamenes ?? []).filter((x) => x.estado === 'CONFIRMADO')
      const lib = confirmados.reduce((t, x) => t + x.liberada, 0)
      const rec = confirmados.reduce((t, x) => t + x.rechazada, 0)
      const decision = decisionTrasDictamenes(lib)
      for (const ob of o.observaciones ?? []) if (observacionVigente(ob)) { ob.cerradaEn = ahora(); ob.cerradaPor = actor.nombre; ob.nota = `Disposición final: ${decision === 'APROBADO' ? 'Aprobado' : 'Bajas/Rechazados'}` }
      o.estado = 'FIRMADA'; o.decision = decision; o.decididoPor = 'DT del cliente (dictamen registrado en el WMS)'; o.decididoEn = ahora()
      o.observacionDt = `Dictamen del DT del cliente: ${lib} unidades liberadas y ${rec} rechazadas.`
      o.hash = (await import('@/lib/hash')).hashDe({ ...o, hash: undefined })
      if (decision === 'APROBADO') e.aprobadoEn[o.ingresoLoteId] = ahora()
      const s = e.solicitudes.find((x) => x.id === o.solicitudId)
      const exp = e.expedientes.find((x) => x.id === s?.expedienteId)
      if (exp) {
        exp.documentos.push({ id: nuevoId(), tipo: 'ACTA_ORGANOLEPTICA', descripcion: `Acta organoléptica ${o.numero}`, agregadoEn: ahora(), referenciaTipo: 'acta_organoleptica', referenciaId: o.id })
        for (const x of exp.faltantes) if (x.estado === 'ABIERTO' && x.tipo === 'ACTA_ORGANOLEPTICA' && x.documento.startsWith(`Acta organoléptica ${o.numero}`)) { x.estado = 'RESUELTO'; x.resueltoEn = ahora(); x.nota = 'Acta firmada con el dictamen del DT del cliente' }
      }
      firmada = true
    }
    for (const a of e.alertas) if ((a as { clave?: string }).clave === `dictamen:${d.id}` && a.estado === 'ABIERTA') { a.estado = 'ATENDIDA'; a.atendidaEn = ahora(); a.atendidaPor = actor.nombre; a.nota = 'Se confirmó el cambio de estado' }
    registrar(e, actor, 'dictamen_cliente_confirmado', 'actas_organolepticas', o.numero, `${d.liberada} a Aprobado y ${d.rechazada} a Bajas/Rechazados`)
    return { ok: true, firmada }
  }

  async anularDictamen(dictamenId: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!puedeRegistrarDictamenCliente(actor.roles)) return falla('Solo Sandra o Dirección Técnica anulan un dictamen registrado')
    if (!motivo.trim()) return falla('Cuéntanos por qué se anula el dictamen', { motivo: 'Cuéntanos por qué se anula el dictamen.' })
    const f = this.encontrarDictamen(e, dictamenId)
    if (!f) return falla('No encontramos ese dictamen')
    if (f.d.estado !== 'REGISTRADO') return falla(`Ese dictamen ya está ${f.d.estado === 'CONFIRMADO' ? 'confirmado: un dictamen confirmado ya cambió el estado y no se anula' : 'anulado'}`)
    f.d.estado = 'ANULADO'; f.d.anuladoPor = actor.nombre; f.d.anuladoEn = ahora(); f.d.motivoAnulacion = motivo.trim()
    for (const a of e.alertas) if ((a as { clave?: string }).clave === `dictamen:${f.d.id}` && a.estado === 'ABIERTA') { a.estado = 'ATENDIDA'; a.atendidaEn = ahora(); a.nota = 'Se anuló el dictamen' }
    registrar(e, actor, 'dictamen_cliente_anulado', 'actas_organolepticas', f.o.numero, 'Dictamen anulado', motivo.trim())
    return { ok: true }
  }

  // ── Retornos ───────────────────────────────────────────────────────────────
  async salidasConRetorno(): Promise<ResumenSalidaRetorno[]> {
    const e = estadoE(); await this.sembrarDespacho(e); sembrarSalidaDespachada(e)
    const salidas = await this.listarSalidas()
    return structuredClone(salidas.filter((s) => esSalidaConfirmada(s.etapa)).map((s): ResumenSalidaRetorno => ({
      salidaId: s.id, numero: s.numero, pedidoNumero: s.pedidoNumero, cliente: s.cliente, fecha: s.fecha, unidades: s.unidades, retornos: retornosDe(e, s.id),
    })))
  }

  async salidaParaRetorno(salidaId: string): Promise<SalidaParaRetorno | null> {
    const e = estadoE(); await this.sembrarDespacho(e); sembrarSalidaDespachada(e)
    const s = desp(e).salidas.find((x) => x.id === salidaId)
    if (!s) return null
    const prop = e.panorama.propietarios.find((p) => p.id === s.propietarioId)
    const guia = (desp(e).guias ?? []).find((g) => g.salidaId === s.id && g.guia.estado === 'VIGENTE')
    return structuredClone({
      salidaId: s.id, numero: s.numero, propietarioId: s.propietarioId, propietario: prop?.razonSocial ?? '—', guiaNumero: guia?.guia.numero, confirmada: s.estado === 'CONFIRMADA',
      lineas: lineasRetornables(e, s.id), retornos: retornosDe(e, s.id),
    })
  }

  async crearRetorno(entrada: EntradaRetorno, autorizar: boolean, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string; autorizada: boolean }>> {
    const e = estadoE(); await this.sembrarDespacho(e); sembrarSalidaDespachada(e)
    if (!puedeOriginarRetorno(actor.roles)) return falla('No tienes permiso para registrar el retorno de una Orden de Salida')
    const s = desp(e).salidas.find((x) => x.id === entrada.salidaId)
    if (!s) return falla('No encontramos esa Orden de Salida')
    const info = await this.salidaParaRetorno(s.id)
    const v = validarRetorno(entrada, info!)
    if (!v.ok) return falla(v.mensaje, v.errores as Record<string, string>)
    const guia = entrada.guiaNumero?.trim() || info!.guiaNumero
    const motor = new MotorEntradas()
    // Quien origina no siempre puede autorizar (D-32): la solicitud la crea el flujo con los permisos de la asistente y se registra a nombre de quien la originó.
    const sistema: Actor = { id: actor.id, nombre: actor.nombre, roles: ['asistente_dt'] }
    const r = motor.crearSolicitud({
      tipo: 'DEVOLUCION', propietarioId: s.propietarioId, guiaNumero: guia, docOriginalTipo: entrada.docOriginalTipo, docOriginalNumero: entrada.docOriginalNumero?.trim(),
      motivo: `Retorno de ${s.numero}: ${entrada.motivo === 'RECHAZADO_CLIENTE' ? 'rechazado por el cliente' : 'no entregado'}`, observaciones: entrada.observaciones?.trim() || undefined,
      lineas: v.lineas.map((l) => { const lote = e.panorama.lotes.find((x) => x.id === l.loteId)!; return { productoId: lote.productoId, lote: lote.codigo, vence: lote.vence ?? '', cantidad: l.cantidad } }),
    }, false, sistema)
    if (!r.ok) return r
    const sol = e.solicitudes.find((x) => x.id === r.id)!
    sol.creadoPor = actor.nombre
    sol.retorno = { salidaId: s.id, salidaNumero: s.numero, motivo: entrada.motivo as 'RECHAZADO_CLIENTE' | 'NO_ENTREGADO', guiaNumero: guia }
    const puedeAutorizar = actor.roles.includes('asistente_dt') || actor.roles.includes('direccion_tecnica')
    const autorizada = autorizar && puedeAutorizar
    if (autorizada) motor.autorizarSolicitud(r.id, actor)
    else { sol.estado = 'ENVIADA'; alertar(e, 'RETORNO_POR_AUTORIZAR', 'asistente_dt', `La Orden de Salida ${s.numero} tiene un retorno por autorizar (${r.numero}): ${entrada.motivo === 'RECHAZADO_CLIENTE' ? 'rechazado por el cliente' : 'no entregado'}. Autoriza la solicitud para que el almacén la reciba como devolución.`, `retorno:${r.id}`, r.id) }
    registrar(e, actor, 'retorno_registrado', 'solicitudes_ingreso', r.numero, `Retorno de ${s.numero}`, entrada.motivo || undefined)
    return { ok: true, id: r.id, numero: r.numero, autorizada }
  }
}
