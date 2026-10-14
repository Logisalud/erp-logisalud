import type { ImportacionVista, PedidoBandeja, ResumenImportacion } from '@/domain/pedidos-despacho'
import type { Actor, ResultadoAccion } from './repositorio'

export interface BandejaPedidos {
  pedidos: PedidoBandeja[]
  /** El último intento de actualizar (con éxito o no) y el último que sí funcionó: «última actualización hace X». */
  ultimoIntento: ImportacionVista | null
  ultimaExitosa: ImportacionVista | null
}

/** S3: la bandeja de pedidos que Pedidos deja listos para operaciones. No crea ni cambia pedidos: solo los trae, guarda su snapshot y avisa los cambios. */
export interface RepositorioPedidos {
  bandejaPedidos(): Promise<BandejaPedidos>
  /** Trae los pedidos listos de Pedidos (si no responde, la bandeja sigue con lo importado) y guarda lo nuevo. */
  actualizarBandeja(actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenImportacion }>>
  /** Quien planifica da por revisado el cambio de un pedido. */
  revisarCambioPedido(pedidoId: string, actor: Actor): Promise<ResultadoAccion>
}
