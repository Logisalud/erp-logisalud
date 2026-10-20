import type { ResumenImportacion } from '@/domain/pedidos-despacho'
import type { Actor, ResultadoAccion } from './repositorio'

/** Lo que Pedidos puede hacerle a un pedido en la demostración (controles de la fuente demo): el vendedor decide, y la Orden de Salida se actualiza sola. */
export type CambioSimulado = 'REDUCIR' | 'QUITAR' | 'AGREGAR' | 'CANCELAR' | 'FACTURAR'

export interface QuiebreStockVista {
  id: string; en: string; origen: 'DETECCION' | 'PEDIDOS'; causa: string; salidaNumero?: string; pedidoNumero?: string; productoCodigo?: string
  cantidadPedida: number; cantidadFaltante: number; cantidadCausa: number; vendedor?: string; detalle: Record<string, unknown>
}

/** SA-3: devolver lo picado a su ubicación (movimiento verificado), quiebres de stock y los controles de la fuente demo. */
export interface RepositorioCambioPedido {
  /** El auxiliar devuelve lo picado: si estaba en Despacho se crea la orden de Movimientos internos (Despacho → su ubicación). Otra persona lo verifica. */
  ejecutarDevolucionPicking(salidaId: string, actor: Actor): Promise<ResultadoAccion<{ movimientoId?: string; movimientoNumero?: string }>>
  /** Otra persona (no quien devolvió) verifica la devolución. Al verificar la última, la orden sigue o, si el pedido se canceló, se cancela. */
  verificarDevolucionPicking(salidaId: string, actor: Actor): Promise<ResultadoAccion<{ verificadas: number }>>
  /** Quiebres de stock para auditoría (el reporte queda pendiente). */
  listarQuiebresStock(): Promise<QuiebreStockVista[]>
  /** Solo en la demostración: «Pedidos» cambia el pedido (la fuente demo entrega la versión nueva) y la bandeja se actualiza. */
  simularCambioEnPedidos(pedidoId: string, cambio: CambioSimulado, actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenImportacion }>>
}
