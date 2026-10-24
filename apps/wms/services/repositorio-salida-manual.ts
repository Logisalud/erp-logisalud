import type { EntradaOrdenManual, LoteParaSalida, ProductoHallado } from '@/domain/salida-manual'
export type { ProductoHallado } from '@/domain/salida-manual'
import type { EntradaEntrega } from '@/domain/entrega-transportista'
import type { MotivoSalida } from '@/domain/salidas'
import type { Actor, ResultadoAccion } from './repositorio'

/** Lo que el WMS responde cuando se pregunta «¿este número de pedido ya tiene orden?» (el aviso inmediato de la pantalla). */
export type OrdenDelPedido =
  | { tipo: 'ORDEN'; id: string; numero: string; estado: 'ABIERTA' | 'CONFIRMADA' }
  | { tipo: 'EN_BANDEJA'; pedidoNumero: string }

export interface OrdenCreada {
  id: string
  numero: string
  motivo?: MotivoSalida
  /** Alguna línea no tiene stock suficiente: decide el vendedor del pedido (A) o se espera el ingreso. */
  faltaStock?: boolean
}

export interface ResumenOrdenesPendientes {
  creadas: number
  /** Pedidos que ya tenían una orden manual y se unieron a ella (sin crear otra). */
  unidas: number
  conFaltaStock: number
  errores: { pedido: string; motivo: string }[]
  ordenes: { pedido: string; orden: string; faltaStock: boolean; unida: boolean }[]
}

/**
 * SA-2: cómo iniciar una Orden de Salida. Tres formas: desde la bandeja de pedidos (un pedido o todos los pendientes), desde la ruta (ya existía) y a mano
 * (venta manual A, por cuenta de un cliente B, sin venta C). Un pedido nunca tiene dos órdenes vivas.
 */
export interface RepositorioSalidaManual {
  /** Busca por nombre, código interno o cualquier otro código del producto; con propietario, también el código propio de ese cliente. */
  buscarProductosParaSalida(consulta: string, propietarioId?: string): Promise<ProductoHallado[]>
  /** Los lotes de un producto de un propietario con lo que tienen para sacar (Aprobado) y lo que ya está en Bajas. Sirve para proponer FEFO y para validar. */
  lotesParaSalida(propietarioId: string, productoId: string): Promise<LoteParaSalida[]>
  /** D-161: desde cuántos días antes del vencimiento una devolución al proveedor NO avisa (parámetro `devolucion_proveedor_aviso_dias`, 90). */
  diasAvisoDevolucion(): Promise<number>
  /** Los lotes que llevan ese código (de cualquier propietario): así se distingue «no existe» de «es de otro propietario». */
  lotesPorCodigo(codigo: string, productoId: string): Promise<LoteParaSalida[]>
  /** ¿Este número de pedido ya tiene una orden (o ya llegó por la bandeja sin orden)? */
  ordenDelPedido(numeroPedido: string): Promise<OrdenDelPedido | null>
  /** Crea la orden manual. Una guía de cliente con motivos mezclados se parte en una orden por motivo (devuelve todas). */
  crearOrdenManual(entrada: EntradaOrdenManual, actor: Actor): Promise<ResultadoAccion<{ ordenes: OrdenCreada[] }>>
  /** El botón «Crear orden de salida» de un pedido de la bandeja (idempotente: si ya tiene orden, devuelve esa). */
  crearOrdenDePedido(pedidoId: string, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string; yaExistia: boolean; faltaStock: boolean }>>
  /** Cancela una orden que todavía no salió del rack (libera lo reservado); nada se borra: queda con su motivo. La usa quien se equivocó de número de pedido o de cliente. */
  cancelarOrden(salidaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  /** «Crear las órdenes de todos los pedidos por planificar». */
  crearOrdenesPendientes(actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenOrdenesPendientes }>>
  /**
   * SA-6, tipo B: registra la entrega al transportista del cliente (nombre o placa y DNI, hora y quién entrega por el almacén; el cargo es opcional) y confirma la salida: el stock baja.
   * La orden pasa a «Entregada al transportista». Repetir el envío devuelve la misma entrega.
   */
  registrarEntregaTransportistaCliente(entrada: EntradaEntrega, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
}
