// S7 en memoria (modo demostración): embalaje en bultos. Mismas reglas que la migración 0020.
import { codigoDeBulto, puedeEmbalar, validarReparto, type BultoVista, type EmbalajeResumen, type EmbalajeVista, type PendienteEmbalar, type RepartoBulto } from '@/domain/embalaje'
import type { ExtrasLsFr } from '@/domain/ls-fr-43-03'
import { registrar, type EstadoDemo } from './estado'
import { ahora, estadoE, falla, nuevoId } from './entradas-demo'
import { desp, type RutaDemo, type SalidaDemo } from './despacho-demo'
import { pk } from './picking-demo'
import { DocumentacionDemo, salidaConforme } from './documentacion-demo'
import type { RepositorioEmbalaje } from '../repositorio-embalaje'
import type { Actor, ResultadoAccion } from '../repositorio'

const bultos = (e: EstadoDemo) => (desp(e).bultos ??= [])
export const bultosVigentes = (e: EstadoDemo, salidaId: string) => bultos(e).filter((b) => b.salidaId === salidaId && b.estado === 'EMBALADO').sort((a, b) => a.secuencia - b.secuencia)

export class EmbalajeDemo extends DocumentacionDemo implements RepositorioEmbalaje {
  /** Lo confirmado, lote por lote (lo que hay que embalar). */
  private pendientes(e: EstadoDemo, s: SalidaDemo): PendienteEmbalar[] {
    const o = pk(e).ordenes.find((x) => x.salidaId === s.id && x.estado !== 'CANCELADA')
    const por = new Map<string, PendienteEmbalar>()
    for (const l of o?.lineas ?? []) {
      if (l.conformidad !== 'CONFORME') continue
      const k = `${l.lineaId}|${l.loteId}`
      const lt = e.panorama.lotes.find((x) => x.id === l.loteId); const p = e.panorama.productos.find((x) => x.id === l.productoId)
      const a = por.get(k) ?? { lineaId: l.lineaId, productoCodigo: p?.codigo ?? '', producto: p?.descripcion ?? '', loteId: l.loteId, lote: lt?.codigo ?? '', vence: lt?.vence ?? null, cantidad: 0 }
      a.cantidad += l.cantidad; por.set(k, a)
    }
    return [...por.values()].sort((a, b) => a.productoCodigo.localeCompare(b.productoCodigo) || (a.vence ?? '').localeCompare(b.vence ?? '') || a.lote.localeCompare(b.lote))
  }

  private resumen(e: EstadoDemo, s: SalidaDemo): EmbalajeResumen {
    const r = this.resumenSalida(e, s)
    return { salidaId: s.id, salidaNumero: s.numero, pedidoNumero: r.pedidoNumero, cliente: r.cliente, rutaNumero: r.rutaNumero, unidades: r.unidades, lineas: r.lineas, bultos: bultosVigentes(e, s.id).length }
  }

  async colaEmbalaje(): Promise<EmbalajeResumen[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    return structuredClone(desp(e).salidas.filter((s) => s.estado === 'ABIERTA' && salidaConforme(e, s.id)).map((s) => this.resumen(e, s)).sort((a, b) => a.bultos - b.bultos || a.salidaNumero.localeCompare(b.salidaNumero)))
  }

  async embalajeSalida(salidaId: string): Promise<EmbalajeVista | null> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const s = desp(e).salidas.find((x) => x.id === salidaId)
    if (!s) return null
    return structuredClone({
      ...this.resumen(e, s), conforme: salidaConforme(e, s.id), porEmbalar: this.pendientes(e, s),
      bultosVigentes: bultosVigentes(e, s.id), bultosAnulados: bultos(e).filter((b) => b.salidaId === s.id && b.estado === 'ANULADO'),
    })
  }

  async embalarSalida(salidaId: string, reparto: RepartoBulto[], actor: Actor): Promise<ResultadoAccion<{ bultos: number }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeEmbalar(actor.roles)) return falla('No tienes permiso para embalar')
    const s = desp(e).salidas.find((x) => x.id === salidaId)
    if (!s) return falla('No encontramos esa salida')
    if (s.estado !== 'ABIERTA') return falla('La salida ya no está abierta')
    if (!salidaConforme(e, s.id)) return falla('El embalaje empieza cuando todo el pedido tiene la conformidad')
    if (bultosVigentes(e, s.id).length) return falla('Este pedido ya está embalado. Para rehacerlo, reabre el embalaje con el motivo')
    const pend = this.pendientes(e, s)
    const err = validarReparto(pend, reparto)
    if (err) return falla(err)
    const total = reparto.length; const cuando = ahora()
    reparto.forEach((b, i) => {
      const contenido = b.contenido.map((c) => { const p = pend.find((x) => x.lineaId === c.lineaId && x.loteId === c.loteId)!; return { lineaId: c.lineaId, productoCodigo: p.productoCodigo, producto: p.producto, loteId: c.loteId, lote: p.lote, vence: p.vence, cantidad: c.cantidad } })
      bultos(e).push({ id: nuevoId(), salidaId: s.id, codigo: codigoDeBulto(s.numero, i + 1), secuencia: i + 1, total, estado: 'EMBALADO', contenido, unidades: contenido.reduce((t, c) => t + c.cantidad, 0), embaladoPor: actor.nombre, embaladoEn: cuando })
    })
    registrar(e, actor, 'salida_embalada', 'salidas', s.id, `${s.numero}: ${total} ${total === 1 ? 'bulto' : 'bultos'}`)
    return { ok: true, bultos: total }
  }

  async reabrirEmbalaje(salidaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeEmbalar(actor.roles)) return falla('No tienes permiso para reabrir el embalaje')
    if (!motivo.trim()) return falla('Cuenta por qué se reabre el embalaje', { motivo: 'Cuenta por qué se reabre el embalaje.' })
    const s = desp(e).salidas.find((x) => x.id === salidaId)
    if (!s) return falla('No encontramos esa salida')
    if (s.estado !== 'ABIERTA') return falla('La salida ya no está abierta')
    const vigentes = bultosVigentes(e, s.id)
    if (!vigentes.length) return falla('Este pedido no está embalado')
    const bloqueo = this.bloqueoReabrir(e, s)
    if (bloqueo) return falla(bloqueo)
    for (const b of vigentes) { b.estado = 'ANULADO'; b.anuladoMotivo = motivo.trim(); b.anuladoEn = ahora() }
    registrar(e, actor, 'embalaje_reabierto', 'salidas', s.id, s.numero, motivo.trim())
    return { ok: true }
  }

  /** Gancho para S8: con la unidad ya cargada no se reabre el embalaje. */
  protected bloqueoReabrir(_e: EstadoDemo, _s: SalidaDemo): string | null { return null }

  async bultoPorCodigo(codigo: string): Promise<BultoVista | null> {
    const e = estadoE(); await this.sembrarDespacho(e)
    return structuredClone(bultos(e).find((b) => b.estado === 'EMBALADO' && b.codigo === codigo.trim().toUpperCase()) ?? null)
  }

  // ── Efectos sobre lo ya existente ───────────────────────────────────────────────────────────────────────────────
  protected override avanceExtra(e: EstadoDemo, s: SalidaDemo): { embalada?: boolean; cargada?: boolean } {
    return { ...super.avanceExtra(e, s), embalada: bultosVigentes(e, s.id).length > 0 }
  }

  /** La columna «N.° cajas» del LS-FR.43.03 muestra los bultos del pedido (rotulados «bultos» mientras Dirección Técnica define si cajas = bultos). */
  protected override extrasLsFr(e: EstadoDemo, r: RutaDemo): ExtrasLsFr {
    const base = super.extrasLsFr(e, r)
    const cajas: Record<string, number> = {}
    for (const p of r.paradas) { if (!p.activa || !p.salidaId) continue; const n = bultosVigentes(e, p.salidaId).length; if (n) cajas[p.pedidoId] = n }
    return { ...base, cajas }
  }
}
