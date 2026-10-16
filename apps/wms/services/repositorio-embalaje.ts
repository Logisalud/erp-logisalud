import type { BultoVista, EmbalajeResumen, EmbalajeVista, RepartoBulto } from '@/domain/embalaje'
import type { Actor, ResultadoAccion } from './repositorio'

/** S7: embalaje de los pedidos conformes en bultos con código (QR). */
export interface RepositorioEmbalaje {
  /** Los pedidos conformes (por embalar y ya embalados) con su cantidad de bultos. */
  colaEmbalaje(): Promise<EmbalajeResumen[]>
  embalajeSalida(salidaId: string): Promise<EmbalajeVista | null>
  /** Reparte TODO lo confirmado en bultos; ni más ni menos, ninguno vacío. Una sola vez (para rehacerlo se reabre con motivo). */
  embalarSalida(salidaId: string, reparto: RepartoBulto[], actor: Actor): Promise<ResultadoAccion<{ bultos: number }>>
  reabrirEmbalaje(salidaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  /** Un bulto por su código (el del QR), para la carga (S8). */
  bultoPorCodigo(codigo: string): Promise<BultoVista | null>
}
