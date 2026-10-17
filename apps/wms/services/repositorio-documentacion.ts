import type { PaqueteSalida } from '@/domain/documentacion'
import type { Actor, ResultadoAccion } from './repositorio'

/** S6b: guía de remisión registrada a mano y paquete documental de una salida. */
export interface RepositorioDocumentacion {
  /** Los lotes que salen, lo que pide el cliente de cada uno, la guía vigente y las anuladas. */
  paqueteSalida(salidaId: string): Promise<PaqueteSalida | null>
  /** Registra el N.° de la guía con las líneas confirmadas. Solo con todo el pedido conforme; una guía viva por salida; un número no se repite. */
  registrarGre(salidaId: string, numero: string, nota: string | undefined, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  /** Una guía no se edita: se anula con motivo y se registra otra. */
  anularGre(guiaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  /** El paquete de todas las salidas de una ruta, para imprimirlo junto. */
  salidasDeRuta(rutaId: string): Promise<string[]>
}
