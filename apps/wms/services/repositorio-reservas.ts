import type { ReservaLoteVista } from '@/domain/reserva'
import type { Actor, ResultadoAccion } from './repositorio'

/** OS-1: Reserva de un lote (estado, no área). */
export interface RepositorioReservas {
  /** La historia de Reservas de un lote (la vigente primero). */
  reservasDelLote(loteId: string): Promise<ReservaLoteVista[]>
  /** Las Reservas vigentes de todo el almacén. */
  reservasVigentes(): Promise<ReservaLoteVista[]>
  aplicarReserva(loteId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  quitarReserva(loteId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
}
