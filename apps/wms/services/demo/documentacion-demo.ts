// S6b en memoria (modo demostración): guía de remisión registrada a mano y paquete documental. Mismas reglas que la migración 0019.
import { guardiaDeOrden } from './cambio-pedido-demo'
import {
  faltantesDelPaquete, motivoNoPuedeRegistrarGuia, normalizarNumeroGre, paqueteDeItemsCompleto, validarNumeroGre, puedeRegistrarDocumentacion,
  type GuiaVista, type ItemPaquete, type LineaGuia, type PaqueteSalida,
} from '@/domain/documentacion'
import { etapaDeSalida, type SalidaResumen } from '@/domain/despacho'
import {
  motivoDeTraslado, motivoNoPuedeAnular, puedeEmitirGuia,
  type CasoAnulacion, type DatosGuia, type EstadoSunat, type EventoPedidos, type RespuestaConsulta, type RespuestaEmision, type TipoEventoPedidos, type TrasladoGuia,
} from '@/domain/guia-electronica'
import { registrar, type EstadoDemo } from './estado'
import { alertar, ahora, estadoE, falla, nuevoId } from './entradas-demo'
import { claveDeParada, desp, type RutaDemo, type SalidaDemo } from './despacho-demo'
import type { ExtrasLsFr } from '@/domain/ls-fr-43-03'
import { detalleUsoConductor } from '@/domain/conductor-documentos'
import { pk } from './picking-demo'
import { DocumentosDemo } from './documentos-demo'
import type { RepositorioDocumentacion } from '../repositorio-documentacion'
import type { Actor, ResultadoAccion } from '../repositorio'

const guias = (e: EstadoDemo) => (desp(e).guias ??= [])
const bultosDeSalidaVivos = (e: EstadoDemo, salidaId: string) => (desp(e).bultos ?? []).filter((b) => b.salidaId === salidaId && b.estado === 'EMBALADO')
const bultosDeSalida = (e: EstadoDemo, salidaId: string) => bultosDeSalidaVivos(e, salidaId).length
const bultosCodigos = (e: EstadoDemo, salidaId: string) => bultosDeSalidaVivos(e, salidaId).map((b) => b.codigo)

/** ¿Todas las líneas de la orden vigente están conformes? */
export function salidaConforme(e: EstadoDemo, salidaId: string): boolean {
  const o = pk(e).ordenes.find((x) => x.salidaId === salidaId && x.estado !== 'CANCELADA')
  return !!o && o.lineas.length > 0 && o.lineas.every((l) => l.conformidad === 'CONFORME')
}

export class DocumentacionDemo extends DocumentosDemo implements RepositorioDocumentacion {
  private guiaVigente(e: EstadoDemo, salidaId: string) { return guias(e).find((g) => g.salidaId === salidaId && g.guia.estado === 'VIGENTE')?.guia }

  private rucYEntrega(e: EstadoDemo, s: SalidaDemo) {
    const fila = e.pedidos?.filas.find((f) => f.vigente && f.snapshot.pedidoId === s.pedidoId)
    const ruta = desp(e).rutas.find((r) => r.estado !== 'CANCELADA' && r.paradas.some((p) => p.activa && p.salidaId === s.id))
    // SA-2: en una orden manual el cliente es el que se escribió (venta) o el propietario (por cuenta de un cliente)
    const prop = s.tipo === 'CLIENTE' ? e.panorama.propietarios.find((p) => p.id === s.propietarioId) : undefined
    return {
      ruc: fila?.snapshot.cliente.ruc || s.clienteManual?.ruc || prop?.ruc || undefined, entrega: ruta?.fecha, pedidoNumero: fila?.snapshot.numero ?? s.pedidoNumero,
      cliente: fila?.snapshot.cliente.nombre ?? s.clienteManual?.razonSocial ?? prop?.razonSocial,
    }
  }

  private async itemsDe(e: EstadoDemo, s: SalidaDemo, ruc: string | undefined, entrega: string | undefined): Promise<ItemPaquete[]> {
    const items = new Map<string, ItemPaquete>()
    for (const r of desp(e).reservas) {
      const l = s.lineas.find((x) => x.id === r.lineaId)
      if (!l || r.estado === 'LIBERADA') continue
      const clave = `${l.id}|${r.loteId}`
      const prev = items.get(clave)
      if (prev) { prev.cantidad += r.cantidad; continue }
      const lt = e.panorama.lotes.find((x) => x.id === r.loteId)
      const p = e.panorama.productos.find((x) => x.id === r.productoId)
      items.set(clave, { lineaId: l.id, productoId: r.productoId, productoCodigo: p?.codigo ?? '', producto: p?.descripcion ?? '', loteId: r.loteId, lote: lt?.codigo ?? r.loteId, cantidad: r.cantidad, requisitos: await this.requisitosDocumentales(r.loteId, ruc, entrega) })
    }
    return [...items.values()].sort((a, b) => a.productoCodigo.localeCompare(b.productoCodigo) || a.lote.localeCompare(b.lote))
  }

  private lineasDeGuia(e: EstadoDemo, salidaId: string): LineaGuia[] {
    const o = pk(e).ordenes.find((x) => x.salidaId === salidaId && x.estado !== 'CANCELADA')
    const por = new Map<string, LineaGuia>()
    for (const l of o?.lineas ?? []) {
      if (l.conformidad !== 'CONFORME' || l.cantidad <= 0) continue
      const lt = e.panorama.lotes.find((x) => x.id === l.loteId); const p = e.panorama.productos.find((x) => x.id === l.productoId)
      const k = `${l.productoId}|${l.loteId}`
      const a = por.get(k) ?? { productoCodigo: p?.codigo ?? '', producto: p?.descripcion ?? '', lote: lt?.codigo ?? '', vence: lt?.vence ?? null, cantidad: 0 }
      a.cantidad += l.cantidad; por.set(k, a)
    }
    return [...por.values()].sort((a, b) => a.productoCodigo.localeCompare(b.productoCodigo) || (a.vence ?? '').localeCompare(b.vence ?? '') || a.lote.localeCompare(b.lote))
  }

  async paqueteSalida(salidaId: string): Promise<PaqueteSalida | null> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const s = desp(e).salidas.find((x) => x.id === salidaId)
    if (!s) return null
    const ctx = this.rucYEntrega(e, s)
    const items = await this.itemsDe(e, s, ctx.ruc, ctx.entrega)
    const perfil = ctx.ruc ? (await this.panoramaDocumentos()).perfiles.find((p) => p.ruc === ctx.ruc) : undefined
    return structuredClone({
      salidaId: s.id, salidaNumero: s.numero, pedidoNumero: ctx.pedidoNumero, cliente: ctx.cliente, ruc: ctx.ruc, conforme: salidaConforme(e, s.id),
      guia: this.guiaVigente(e, s.id), guiasAnuladas: guias(e).filter((g) => g.salidaId === s.id && g.guia.estado === 'ANULADA').map((g) => g.guia),
      items, completo: paqueteDeItemsCompleto(items), faltantes: faltantesDelPaquete(items), copias: perfil?.copias ?? 1,
    })
  }

  async registrarGre(salidaId: string, numero: string, nota: string | undefined, actor: Actor, _archivoRef?: string): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const s = desp(e).salidas.find((x) => x.id === salidaId)
    if (!s) return falla('No encontramos esa salida')
    const bloqueado = guardiaDeOrden(e, s.id); if (bloqueado) return falla(bloqueado)
    const bloqueo = motivoNoPuedeRegistrarGuia(actor.roles, { conforme: salidaConforme(e, s.id), guia: this.guiaVigente(e, s.id) })
    if (bloqueo) return falla(bloqueo)
    if (s.estado !== 'ABIERTA') return falla('La salida ya no está abierta')
    const err = validarNumeroGre(numero)
    if (err) return falla(err, { numero: err })
    const n = normalizarNumeroGre(numero)
    if (guias(e).some((g) => g.guia.estado === 'VIGENTE' && g.guia.numero === n)) return falla(`La guía ${n} ya está registrada en otra salida`, { numero: 'Ese número ya está en otra salida.' })
    const ruta = desp(e).rutas.find((r) => r.estado !== 'CANCELADA' && r.paradas.some((p) => p.activa && p.salidaId === s.id))
    const placa = ruta?.vehiculoId ? desp(e).vehiculos.find((v) => v.id === ruta.vehiculoId)?.placa : undefined
    const guia: GuiaVista = { id: nuevoId(), numero: n, estado: 'VIGENTE', lineas: this.lineasDeGuia(e, s.id), placa, fechaTraslado: ruta?.fecha, nota: nota?.trim() || undefined, registradaPor: actor.nombre, registradaEn: ahora(), origen: s.tipo === 'CLIENTE' ? 'CLIENTE' : 'MANUAL', bultos: s.bultosConformidad }
    guias(e).push({ id: guia.id, salidaId: s.id, guia })
    this.encolarEvento(e, s, guia, 'GUIA_EMITIDA')
    registrar(e, actor, 'gre_registrada', 'guias_remision', guia.id, `Guía ${n} · ${s.numero}`)
    return { ok: true, id: guia.id }
  }

  async anularGre(guiaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const r = await this.anularGuia(guiaId, 1, motivo, actor)
    return r.ok ? { ok: true } : r
  }

  // ── OS-3: guía electrónica, anulación por casos y avisos a Pedidos ─────────────────────────────────────────────────────────

  private encolarEvento(e: EstadoDemo, s: SalidaDemo, guia: GuiaVista, tipo: TipoEventoPedidos) {
    // SA-2: a Pedidos solo se le avisa de una venta (con esa guía factura); una muestra, una devolución al proveedor o la GRE de un cliente no se facturan
    if ((s.tipo ?? 'DISTRIBUCION') !== 'DISTRIBUCION') return
    const ped = e.pedidos?.filas.find((f) => f.vigente && f.snapshot.pedidoId === s.pedidoId)
    const payload: Record<string, unknown> = {
      guia: guia.numero, origen: guia.origen, entorno: guia.entorno, enlace: guia.enlace, enlace_xml: guia.enlaceXml, estado_sunat: guia.estadoSunat, salida: s.numero,
      pedido_id: ped ? s.pedidoId : undefined, pedido_numero: ped?.snapshot.numero ?? s.pedidoNumero, por_conciliar: !!s.porConciliar, fecha_traslado: guia.fechaInicio ?? guia.fechaTraslado, bultos: guia.bultos ?? s.bultosConformidad,
      lineas: guia.lineas.map((l) => ({ producto_codigo: l.productoCodigo, producto: l.producto, lote: l.lote, vence: l.vence, cantidad: l.cantidad })),
    }
    if (tipo === 'GUIA_ANULADA') Object.assign(payload, { caso: guia.casoAnulacion, motivo: guia.anuladaMotivo, baja_sunat: guia.bajaSunat, aviso: 'El WMS no modifica la factura: Contabilidad decide si se anula o si corresponde una nota de crédito' })
    ;(desp(e).eventosPedidos ??= []).push({ id: nuevoId(), tipo, estado: 'PENDIENTE', intentos: 0, creadoEn: ahora(), salidaId: s.id, guiaId: guia.id, payload })
  }

  async datosGuia(salidaId: string): Promise<DatosGuia | null> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const s = desp(e).salidas.find((x) => x.id === salidaId)
    if (!s) return null
    const fila = e.pedidos?.filas.find((f) => f.vigente && f.snapshot.pedidoId === s.pedidoId)
    const cm = s.clienteManual
    const prop = s.tipo === 'CLIENTE' ? e.panorama.propietarios.find((p) => p.id === s.propietarioId) : undefined
    const cliente = fila?.snapshot.cliente ?? (cm ? { nombre: cm.razonSocial, ruc: cm.ruc, direccion: cm.direccion, ubigeo: cm.ubigeo, distrito: undefined } : prop ? { nombre: prop.razonSocial, ruc: prop.ruc, direccion: undefined, ubigeo: undefined, distrito: undefined } : undefined)
    const ruta = desp(e).rutas.find((r) => r.estado !== 'CANCELADA' && r.paradas.some((p) => p.activa && p.salidaId === s.id))
    const veh = ruta?.vehiculoId ? desp(e).vehiculos.find((v) => v.id === ruta.vehiculoId) : undefined
    // D-155: la guía nombra a quien figura en documentos (temporal); el conductor real de la ruta se guarda aparte
    const quien = this.quienFigura(e, ruta?.conductorId)
    const cond = quien.figura
    const aux = ruta?.auxiliarId ? desp(e).personal.find((p) => p.id === ruta.auxiliarId) : undefined
    return structuredClone<DatosGuia>({
      salidaId: s.id, salidaNumero: s.numero, tipo: s.tipo ?? 'DISTRIBUCION', conforme: salidaConforme(e, s.id), pedidoNumero: fila?.snapshot.numero ?? s.pedidoNumero,
      destinatario: { nombre: cliente?.nombre, ruc: cliente?.ruc || undefined, direccion: cliente?.direccion, ubigeo: cliente?.ubigeo, distrito: cliente?.distrito },
      lineas: this.lineasDeGuia(e, s.id), bultos: s.bultosConformidad ?? bultosDeSalida(e, s.id),
      ruta: ruta ? { id: ruta.id, numero: ruta.numero, fecha: ruta.fecha, placa: veh?.placa, conductor: cond?.nombre, conductorDni: cond?.dni, conductorDocumentoTipo: cond?.documentoTipo, conductorLicencia: cond?.licencia, auxiliar: aux?.nombre, conductorReal: quien.real?.nombre } : undefined,
      partida: { ubigeo: '150119', direccion: 'Almacén Logisalud, Lurín (dirección de demostración)' },
      motivoTraslado: motivoDeTraslado(s.tipo ?? 'DISTRIBUCION').texto, modalidad: 'TRANSPORTE PRIVADO', serie: 'TTT1',
      reglasBaja: { plazoHoras: 'PENDIENTE', trasInicioTraslado: 'PENDIENTE', soportadaPorApi: 'PENDIENTE' },
    })
  }

  async registrarGuiaElectronica(salidaId: string, r: Extract<RespuestaEmision, { ok: true }>, t: TrasladoGuia, _payload: unknown, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeEmitirGuia(actor.roles)) return falla('No tienes permiso para emitir la guía de remisión')
    const s = desp(e).salidas.find((x) => x.id === salidaId)
    if (!s) return falla('No encontramos esa salida')
    if (s.estado !== 'ABIERTA') return falla('La salida ya no está abierta')
    const bloqueado = guardiaDeOrden(e, s.id); if (bloqueado) return falla(bloqueado)
    if (!salidaConforme(e, s.id)) return falla('La guía se emite cuando todo el pedido tiene la conformidad: sus lotes salen de lo confirmado')
    if (this.guiaVigente(e, s.id)) return falla('Este pedido ya tiene una guía. Para cambiarla, anúlala con el motivo y emite la nueva')
    if (guias(e).some((g) => g.guia.estado === 'VIGENTE' && g.guia.numero === r.numero)) return falla(`La guía ${r.numero} ya está registrada en otra salida`)
    const ruta = desp(e).rutas.find((x) => x.estado !== 'CANCELADA' && x.paradas.some((p) => p.activa && p.salidaId === s.id))
    if (!ruta) return falla('Asigna primero el pedido a una ruta: la guía toma el vehículo, el conductor y la fecha de la ruta')
    const placa = ruta.vehiculoId ? desp(e).vehiculos.find((v) => v.id === ruta.vehiculoId)?.placa : undefined
    if (!placa || !ruta.conductorId) return falla('La ruta todavía no tiene vehículo y conductor: complétalos antes de emitir la guía')
    if (r.estadoSunat === 'RECHAZADA') return falla('Una guía rechazada por SUNAT no se registra: se corrige y se vuelve a enviar')
    const guia: GuiaVista = {
      id: nuevoId(), numero: r.numero, estado: 'VIGENTE', lineas: this.lineasDeGuia(e, s.id), placa, fechaTraslado: ruta.fecha, registradaPor: actor.nombre, registradaEn: ahora(),
      origen: 'NUBEFACT', entorno: r.entorno, enlace: r.enlace, enlaceXml: r.enlaceXml, estadoSunat: r.estadoSunat, bultos: s.bultosConformidad, pesoKg: t.pesoKg, fechaInicio: t.fechaInicio,
    }
    guias(e).push({ id: guia.id, salidaId: s.id, guia })
    if (r.estadoSunat === 'ACEPTADA') this.encolarEvento(e, s, guia, 'GUIA_EMITIDA')
    registrar(e, actor, 'guia_electronica_emitida', 'guias_remision', guia.id, `Guía ${r.numero} · ${s.numero} (${r.entorno})`)
    // D-156: cada uso del conductor en documentos se audita junto al conductor real
    registrar(e, actor, 'conductor_en_documento', 'guias_remision', guia.id, detalleUsoConductor(`Guía ${r.numero}`, this.quienFigura(e, ruta.conductorId)))
    return { ok: true, id: guia.id, numero: r.numero }
  }

  async siguienteNumeroGuia(serie: string): Promise<ResultadoAccion<{ numero: number }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const c = (desp(e).correlativosGuia ??= {})
    const k = serie.trim().toUpperCase()
    if (!/^T[A-Z0-9]{3}$/.test(k)) return falla(`La serie ${k} de guías no está configurada`)
    c[k] = (c[k] ?? 0) + 1
    return { ok: true, numero: c[k] }
  }

  async actualizarEstadoGuia(guiaId: string, c: Extract<RespuestaConsulta, { ok: true }>, actor: Actor): Promise<ResultadoAccion<{ estadoSunat: EstadoSunat }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeEmitirGuia(actor.roles)) return falla('No tienes permiso para actualizar la guía de remisión')
    const g = guias(e).find((x) => x.id === guiaId)
    if (!g) return falla('No encontramos esa guía')
    if (g.guia.origen !== 'NUBEFACT') return falla('Solo las guías emitidas con Nubefact tienen estado de SUNAT')
    if (g.guia.estado !== 'VIGENTE' || g.guia.estadoSunat !== 'PENDIENTE') return { ok: true, estadoSunat: g.guia.estadoSunat ?? 'PENDIENTE' }
    const s = desp(e).salidas.find((x) => x.id === g.salidaId)!
    if (c.estadoSunat === 'ACEPTADA') {
      if (!c.enlace) return falla('Falta el enlace de la guía que devolvió Nubefact')
      Object.assign(g.guia, { estadoSunat: 'ACEPTADA', enlace: c.enlace, enlaceXml: c.enlaceXml })
      this.encolarEvento(e, s, g.guia, 'GUIA_EMITIDA')
      registrar(e, actor, 'guia_electronica_aceptada', 'guias_remision', guiaId, `Guía ${g.guia.numero} aceptada por SUNAT`)
    } else if (c.estadoSunat === 'RECHAZADA') {
      if (!c.error) return falla('Indica por qué SUNAT rechazó la guía')
      Object.assign(g.guia, { estadoSunat: 'RECHAZADA', estado: 'ANULADA', anuladaMotivo: `SUNAT rechazó la guía: ${c.error}`, anuladaEn: ahora(), bajaSunat: 'NO_APLICA' })
      registrar(e, actor, 'guia_electronica_rechazada', 'guias_remision', guiaId, `Guía ${g.guia.numero} rechazada por SUNAT`, c.error)
    }
    return { ok: true, estadoSunat: g.guia.estadoSunat ?? 'PENDIENTE' }
  }

  async anularGuia(guiaId: string, caso: CasoAnulacion, motivo: string, actor: Actor): Promise<ResultadoAccion<{ caso: CasoAnulacion; conformidadReabierta: boolean; bajaSunat: 'PENDIENTE' | 'NO_APLICA' }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const g = guias(e).find((x) => x.id === guiaId)
    if (!g) return falla('No encontramos esa guía')
    const s = desp(e).salidas.find((x) => x.id === g.salidaId)!
    const bloqueo = motivoNoPuedeAnular(actor.roles, caso, { salidaAbierta: s.estado === 'ABIERTA', guiaVigente: g.guia.estado === 'VIGENTE', motivo })
    if (bloqueo) return falla(bloqueo, bloqueo === 'Cuenta por qué se anula la guía' ? { motivo: 'Cuenta por qué se anula la guía.' } : undefined)
    if (caso === 2) {
      const cargados = desp(e).carga ? Object.values(desp(e).carga!).some((c) => c.cargados.some((x) => x.estado === 'CARGADO' && bultosCodigos(e, s.id).includes(x.codigo))) : false
      if (cargados) return falla('Ya hay bultos de este pedido cargados en el vehículo: retíralos de la carga antes de corregir el contenido')
      const mal = this.reabrirConformidadDe(e, s.id, motivo.trim(), actor)
      if (mal) return falla(mal)
    }
    const baja = g.guia.origen === 'NUBEFACT' ? 'PENDIENTE' : 'NO_APLICA'
    Object.assign(g.guia, { estado: 'ANULADA', anuladaMotivo: motivo.trim(), anuladaEn: ahora(), casoAnulacion: caso, bajaSunat: baja })
    this.encolarEvento(e, s, g.guia, 'GUIA_ANULADA')
    registrar(e, actor, 'gre_anulada', 'guias_remision', guiaId, `Guía ${g.guia.numero} anulada (caso ${caso})`, motivo.trim())
    return { ok: true, caso, conformidadReabierta: caso === 2, bajaSunat: baja }
  }

  async eventosPedidos(filtro?: { salidaId?: string; soloPendientes?: boolean }): Promise<EventoPedidos[]> {
    const e = estadoE()
    return structuredClone((desp(e).eventosPedidos ?? []).filter((x) => (!filtro?.salidaId || x.salidaId === filtro.salidaId) && (!filtro?.soloPendientes || x.estado === 'PENDIENTE')))
  }

  async marcarEventoPedidos(id: string, enviado: boolean, error: string | undefined, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!puedeEmitirGuia(actor.roles)) return falla('No tienes permiso para enviar eventos a Pedidos')
    const ev = (desp(e).eventosPedidos ?? []).find((x) => x.id === id && x.estado === 'PENDIENTE')
    if (!ev) return { ok: true }
    ev.intentos += 1
    if (enviado) { ev.estado = 'ENVIADO'; ev.ultimoError = undefined } else ev.ultimoError = error?.trim() || undefined
    return { ok: true }
  }

  async salidasDeRuta(rutaId: string): Promise<string[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const r = desp(e).rutas.find((x) => x.id === rutaId)
    return (r?.paradas ?? []).filter((p) => p.activa && p.salidaId).sort((a, b) => a.secuencia - b.secuencia).map((p) => p.salidaId!)
  }

  // ── Efectos sobre lo ya existente ───────────────────────────────────────────────────────────────────────────────

  /** Lo que sigue después de la conformidad se suma a la etapa y al resumen (guía y documentos que faltan). */
  protected override resumenSalida(e: EstadoDemo, s: SalidaDemo): SalidaResumen {
    const base = super.resumenSalida(e, s)
    const guia = this.guiaVigente(e, s.id)
    let faltantes: number | undefined
    if (salidaConforme(e, s.id)) {
      const ctx = this.rucYEntrega(e, s)
      faltantes = this.faltantesSync(e, s, ctx.ruc, ctx.entrega)
    }
    const o = this.ordenDe(e, s.id)
    const etapa = etapaDeSalida({ estado: s.estado, lineas: s.lineas, orden: o ? { lineas: o.lineas } : null, devolucionPendiente: base.etapa === 'POR_DEVOLVER_PICKING', entregadaAlTransportista: !!s.entrega }, { guia: !!guia, paquete: faltantes === 0, ...this.avanceExtra(e, s) })
    return { ...base, etapa, guia: guia?.numero, documentosFaltantes: faltantes }
  }

  /** El formato LS-FR.43.03 toma el N.° de guía de lo registrado (nada se copia: se lee de la guía vigente de cada pedido). */
  protected override extrasLsFr(e: EstadoDemo, r: RutaDemo): ExtrasLsFr {
    const guiasPorPedido: Record<string, string> = {}
    for (const p of r.paradas) { if (!p.activa || !p.salidaId) continue; const g = this.guiaVigente(e, p.salidaId); if (g) guiasPorPedido[claveDeParada(p)] = g.numero }
    return { ...super.extrasLsFr(e, r), guias: guiasPorPedido }
  }

  /** Gancho para S7 y S8 (embalaje y carga). */
  protected avanceExtra(_e: EstadoDemo, _s: SalidaDemo): { embalada?: boolean; cargada?: boolean; sinEmbalaje?: boolean } { return {} }

  /** Cuántos documentos exigidos faltan, de forma síncrona (la lista de salidas la necesita sin esperar). */
  private faltantesSync(e: EstadoDemo, s: SalidaDemo, ruc: string | undefined, entrega: string | undefined): number {
    let n = 0
    const lotes = new Set(desp(e).reservas.filter((r) => s.lineas.some((l) => l.id === r.lineaId) && r.estado !== 'LIBERADA').map((r) => r.loteId))
    for (const id of lotes) for (const r of this.requisitosSync(id, ruc, entrega)) if (r.exigido && r.estado !== 'OK') n++
    return n
  }

  override async darConformidad(...a: Parameters<DocumentosDemo['darConformidad']>) {
    const r = await super.darConformidad(...a)
    if (r.ok) await this.alertarPaqueteIncompleto()
    return r
  }

  override async conformarOrden(...a: Parameters<DocumentosDemo['conformarOrden']>) {
    const r = await super.conformarOrden(...a)
    if (r.ok) await this.alertarPaqueteIncompleto()
    return r
  }

  private async alertarPaqueteIncompleto() {
    const e = estadoE()
    for (const s of desp(e).salidas) {
      if (s.estado !== 'ABIERTA' || !salidaConforme(e, s.id)) continue
      const ctx = this.rucYEntrega(e, s)
      const items = await this.itemsDe(e, s, ctx.ruc, ctx.entrega)
      const falta = faltantesDelPaquete(items)
      if (falta.length) alertar(e, 'DOCUMENTACION_INCOMPLETA', 'jefe_transporte', `El pedido de la salida ${s.numero} tiene la conformidad completa, pero el paquete documental no: ${falta.join('; ')}.`, `doc-salida:${s.id}`)
    }
  }
}
