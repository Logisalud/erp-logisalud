// S6b en memoria (modo demostración): guía de remisión registrada a mano y paquete documental. Mismas reglas que la migración 0019.
import {
  faltantesDelPaquete, motivoNoPuedeRegistrarGuia, normalizarNumeroGre, paqueteDeItemsCompleto, validarNumeroGre, puedeRegistrarDocumentacion,
  type GuiaVista, type ItemPaquete, type LineaGuia, type PaqueteSalida,
} from '@/domain/documentacion'
import { etapaDeSalida, type SalidaResumen } from '@/domain/despacho'
import { registrar, type EstadoDemo } from './estado'
import { alertar, ahora, estadoE, falla, nuevoId } from './entradas-demo'
import { desp, type RutaDemo, type SalidaDemo } from './despacho-demo'
import type { ExtrasLsFr } from '@/domain/ls-fr-43-03'
import { pk } from './picking-demo'
import { DocumentosDemo } from './documentos-demo'
import type { RepositorioDocumentacion } from '../repositorio-documentacion'
import type { Actor, ResultadoAccion } from '../repositorio'

const guias = (e: EstadoDemo) => (desp(e).guias ??= [])

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
    return { ruc: fila?.snapshot.cliente.ruc || undefined, entrega: ruta?.fecha, pedidoNumero: fila?.snapshot.numero, cliente: fila?.snapshot.cliente.nombre }
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

  async registrarGre(salidaId: string, numero: string, nota: string | undefined, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const s = desp(e).salidas.find((x) => x.id === salidaId)
    if (!s) return falla('No encontramos esa salida')
    const bloqueo = motivoNoPuedeRegistrarGuia(actor.roles, { conforme: salidaConforme(e, s.id), guia: this.guiaVigente(e, s.id) })
    if (bloqueo) return falla(bloqueo)
    if (s.estado !== 'ABIERTA') return falla('La salida ya no está abierta')
    const err = validarNumeroGre(numero)
    if (err) return falla(err, { numero: err })
    const n = normalizarNumeroGre(numero)
    if (guias(e).some((g) => g.guia.estado === 'VIGENTE' && g.guia.numero === n)) return falla(`La guía ${n} ya está registrada en otra salida`, { numero: 'Ese número ya está en otra salida.' })
    const ruta = desp(e).rutas.find((r) => r.estado !== 'CANCELADA' && r.paradas.some((p) => p.activa && p.salidaId === s.id))
    const placa = ruta?.vehiculoId ? desp(e).vehiculos.find((v) => v.id === ruta.vehiculoId)?.placa : undefined
    const guia: GuiaVista = { id: nuevoId(), numero: n, estado: 'VIGENTE', lineas: this.lineasDeGuia(e, s.id), placa, fechaTraslado: ruta?.fecha, nota: nota?.trim() || undefined, registradaPor: actor.nombre, registradaEn: ahora() }
    guias(e).push({ id: guia.id, salidaId: s.id, guia })
    registrar(e, actor, 'gre_registrada', 'guias_remision', guia.id, `Guía ${n} · ${s.numero}`)
    return { ok: true, id: guia.id }
  }

  async anularGre(guiaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeRegistrarDocumentacion(actor.roles)) return falla('No tienes permiso para anular la guía de remisión')
    if (!motivo.trim()) return falla('Cuenta por qué se anula la guía', { motivo: 'Cuenta por qué se anula la guía.' })
    const g = guias(e).find((x) => x.id === guiaId)
    if (!g) return falla('No encontramos esa guía')
    if (g.guia.estado === 'ANULADA') return falla('Esa guía ya está anulada')
    const s = desp(e).salidas.find((x) => x.id === g.salidaId)
    if (s && s.estado !== 'ABIERTA') return falla('La salida ya no está abierta')
    g.guia.estado = 'ANULADA'; g.guia.anuladaMotivo = motivo.trim(); g.guia.anuladaEn = ahora()
    registrar(e, actor, 'gre_anulada', 'guias_remision', guiaId, `Guía ${g.guia.numero} anulada`, motivo.trim())
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
    const etapa = etapaDeSalida({ estado: s.estado, lineas: s.lineas, orden: o ? { lineas: o.lineas } : null }, { guia: !!guia, paquete: faltantes === 0, ...this.avanceExtra(e, s) })
    return { ...base, etapa, guia: guia?.numero, documentosFaltantes: faltantes }
  }

  /** El formato LS-FR.43.03 toma el N.° de guía de lo registrado (nada se copia: se lee de la guía vigente de cada pedido). */
  protected override extrasLsFr(e: EstadoDemo, r: RutaDemo): ExtrasLsFr {
    const guiasPorPedido: Record<string, string> = {}
    for (const p of r.paradas) { if (!p.activa || !p.salidaId) continue; const g = this.guiaVigente(e, p.salidaId); if (g) guiasPorPedido[p.pedidoId] = g.numero }
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
    if (!r.ok) return r
    const e = estadoE()
    for (const s of desp(e).salidas) {
      if (s.estado !== 'ABIERTA' || !salidaConforme(e, s.id)) continue
      const ctx = this.rucYEntrega(e, s)
      const items = await this.itemsDe(e, s, ctx.ruc, ctx.entrega)
      const falta = faltantesDelPaquete(items)
      if (falta.length) alertar(e, 'DOCUMENTACION_INCOMPLETA', 'jefe_transporte', `El pedido de la salida ${s.numero} tiene la conformidad completa, pero el paquete documental no: ${falta.join('; ')}.`, `doc-salida:${s.id}`)
    }
    return r
  }
}
