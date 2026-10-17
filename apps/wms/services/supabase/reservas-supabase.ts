import 'server-only'

import type { ReservaLoteVista } from '@/domain/reserva'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioReservas } from '../repositorio-reservas'
import { DespachoSupabase } from './despacho-supabase'
import { nombresDe } from './entradas-supabase'
import { mensajeHumano, rpc, s, traerTodo, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás). Está verificado contra el contrato de las funciones SQL de la migración
// 0022 (probada en Postgres local: tests/db/areas-reserva.test.ts) y por tipos.

const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })

export class ReservasSupabase extends DespachoSupabase implements RepositorioReservas {
  private async leer(soloVigentes: boolean, loteId?: string): Promise<ReservaLoteVista[]> {
    const [filas, lotes, prods] = await Promise.all([traerTodo('reservas_lote', 'wms', '*', ['aplicada_en']), traerTodo('lotes', 'wms', 'id, codigo, producto_id'), traerTodo('productos', 'catalogo', 'id, codigo, descripcion')])
    const sel = filas.filter((f: Fila) => (!soloVigentes || !f.quitada_en) && (!loteId || String(f.lote_id) === loteId))
    const nombres = await nombresDe([...new Set(sel.flatMap((f) => [String(f.aplicada_por), f.quitada_por ? String(f.quitada_por) : '']).filter(Boolean))])
    const lote = new Map(lotes.map((l) => [String(l.id), l])); const prod = new Map(prods.map((p) => [String(p.id), p]))
    return sel.map((f) => {
      const lt = lote.get(String(f.lote_id)); const p = prod.get(String(lt?.producto_id))
      return {
        id: String(f.id), loteId: String(f.lote_id), lote: String(lt?.codigo ?? ''), productoCodigo: String(p?.codigo ?? ''), producto: String(p?.descripcion ?? ''), motivo: String(f.motivo),
        aplicadaPor: nombres.get(String(f.aplicada_por)) ?? 'Usuario', aplicadaEn: String(f.aplicada_en),
        quitadaPor: f.quitada_por ? nombres.get(String(f.quitada_por)) ?? 'Usuario' : undefined, quitadaEn: f.quitada_en ? String(f.quitada_en) : undefined, motivoQuita: s(f.motivo_quita),
      }
    }).sort((a, b) => Number(!!a.quitadaEn) - Number(!!b.quitadaEn) || b.aplicadaEn.localeCompare(a.aplicadaEn))
  }

  async reservasDelLote(loteId: string): Promise<ReservaLoteVista[]> { return this.leer(false, loteId) }
  async reservasVigentes(): Promise<ReservaLoteVista[]> { return this.leer(true) }

  async aplicarReserva(loteId: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('aplicar_reserva_lote', { p_lote: loteId, p_motivo: motivo })
    return error ? mal(error) : { ok: true }
  }

  async quitarReserva(loteId: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('quitar_reserva_lote', { p_lote: loteId, p_motivo: motivo })
    return error ? mal(error) : { ok: true }
  }
}
