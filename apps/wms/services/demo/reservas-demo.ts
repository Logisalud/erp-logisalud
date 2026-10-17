// Reserva de un lote en memoria (modo demostración). Mismas reglas que la migración 0022: la aplican y la quitan el Jefe de Transporte y Dirección Técnica,
// con motivo; solo un lote Aprobado con stock; un lote, una Reserva viva; la historia no se borra; avisa si ya estaba asignado a pedidos.
import { puedeReservarLote, type ReservaLoteVista } from '@/domain/reserva'
import { registrar } from './estado'
import { alertar, ahora, estadoE, falla, nuevoId } from './entradas-demo'
import { DespachoDemo, desp, loteEnReserva, reservasLoteDe } from './despacho-demo'
import type { RepositorioReservas } from '../repositorio-reservas'
import type { Actor, ResultadoAccion } from '../repositorio'

export class ReservasDemo extends DespachoDemo implements RepositorioReservas {
  async reservasDelLote(loteId: string): Promise<ReservaLoteVista[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    return structuredClone(reservasLoteDe(e).filter((r) => r.loteId === loteId).sort((a, b) => Number(!!a.quitadaEn) - Number(!!b.quitadaEn) || b.aplicadaEn.localeCompare(a.aplicadaEn)))
  }

  async reservasVigentes(): Promise<ReservaLoteVista[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    return structuredClone(reservasLoteDe(e).filter((r) => !r.quitadaEn).sort((a, b) => b.aplicadaEn.localeCompare(a.aplicadaEn)))
  }

  async aplicarReserva(loteId: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeReservarLote(actor.roles)) return falla('No tienes permiso para poner un lote en Reserva')
    if (!motivo.trim()) return falla('Cuéntanos el motivo de la Reserva', { motivo: 'Cuéntanos el motivo de la Reserva.' })
    const lote = e.panorama.lotes.find((l) => l.id === loteId)
    if (!lote) return falla('No encontramos ese lote')
    const aprobadas = e.panorama.saldos.filter((s) => s.loteId === loteId && s.estado === 'APROBADO').reduce((t, s) => t + s.cantidad, 0)
    if (aprobadas <= 0) return falla('Solo un lote Aprobado con stock puede ponerse en Reserva')
    if (loteEnReserva(e, loteId)) return falla('Ese lote ya está en Reserva')
    const prod = e.panorama.productos.find((p) => p.id === lote.productoId)
    const id = nuevoId()
    reservasLoteDe(e).push({ id, loteId, lote: lote.codigo, productoCodigo: prod?.codigo ?? '', producto: prod?.descripcion ?? '', motivo: motivo.trim(), aplicadaPor: actor.nombre, aplicadaEn: ahora() })
    const asignadas = desp(e).reservas.filter((r) => r.loteId === loteId && (r.estado === 'ACTIVA' || r.estado === 'EN_TRANSITO')).reduce((t, r) => t + r.cantidad, 0)
    if (asignadas > 0) {
      alertar(e, 'LOTE_EN_RESERVA', 'jefe_transporte', `El lote ${lote.codigo} quedó en Reserva y tiene ${asignadas} unidades asignadas a pedidos: cambia el lote en esas Órdenes de Salida antes de pickear.`, `reserva-lote:${id}`, undefined, lote.productoId)
    }
    registrar(e, actor, 'lote_en_reserva', 'lotes', loteId, `Lote ${lote.codigo} en Reserva`, motivo.trim())
    return { ok: true }
  }

  async quitarReserva(loteId: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeReservarLote(actor.roles)) return falla('No tienes permiso para quitar la Reserva de un lote')
    if (!motivo.trim()) return falla('Cuéntanos por qué se quita la Reserva', { motivo: 'Cuéntanos por qué se quita la Reserva.' })
    const r = reservasLoteDe(e).find((x) => x.loteId === loteId && !x.quitadaEn)
    if (!r) return falla('Ese lote no está en Reserva')
    r.quitadaPor = actor.nombre; r.quitadaEn = ahora(); r.motivoQuita = motivo.trim()
    for (const a of e.alertas) if ((a as { clave?: string }).clave === `reserva-lote:${r.id}` && a.estado === 'ABIERTA') { a.estado = 'ATENDIDA'; a.atendidaEn = ahora() }
    registrar(e, actor, 'reserva_de_lote_quitada', 'lotes', loteId, `Lote ${r.lote}: se quitó la Reserva`, motivo.trim())
    return { ok: true }
  }
}
