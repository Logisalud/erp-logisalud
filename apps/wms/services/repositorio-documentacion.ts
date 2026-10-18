import type { PaqueteSalida } from '@/domain/documentacion'
import type { CasoAnulacion, DatosGuia, EstadoSunat, EventoPedidos, RespuestaConsulta, RespuestaEmision, TrasladoGuia } from '@/domain/guia-electronica'
import type { Actor, ResultadoAccion } from './repositorio'

/** S6b + OS-3: guía de remisión (electrónica con Nubefact, a mano o la GRE del cliente) y paquete documental de una salida. */
export interface RepositorioDocumentacion {
  /** Los lotes que salen, lo que pide el cliente de cada uno, la guía vigente y las anuladas. */
  paqueteSalida(salidaId: string): Promise<PaqueteSalida | null>
  /** Registra el N.° de la guía con las líneas confirmadas. Solo con todo el pedido conforme; una guía viva por salida; un número no se repite.
   *  Es la contingencia a mano o, en una orden de un cliente de almacenamiento (tipo B), la GRE que trae el cliente (con su archivo). */
  registrarGre(salidaId: string, numero: string, nota: string | undefined, actor: Actor, archivoRef?: string): Promise<ResultadoAccion<{ id: string }>>
  /** Una guía no se edita: se anula con motivo y se registra otra (caso 1: datos del traslado). */
  anularGre(guiaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  /** El paquete de todas las salidas de una ruta, para imprimirlo junto. */
  salidasDeRuta(rutaId: string): Promise<string[]>

  /** Todo lo que la guía electrónica toma del WMS (destinatario, líneas por lote, ruta, vehículo, conductor, bultos, punto de partida). */
  datosGuia(salidaId: string): Promise<DatosGuia | null>
  /** El siguiente número de la serie (Nubefact no lo asigna: el WMS lleva el correlativo). Se pide justo antes de enviar. */
  siguienteNumeroGuia(serie: string): Promise<ResultadoAccion<{ numero: number }>>
  /** Guarda lo que devolvió Nubefact. La ruta va antes que la guía; solo pedidos (el tipo B usa la GRE del cliente). Deja el aviso para Pedidos en la bandeja. */
  registrarGuiaElectronica(salidaId: string, resultado: Extract<RespuestaEmision, { ok: true }>, traslado: TrasladoGuia, payload: unknown, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>>
  /** Paso 2 de Nubefact: anota lo que SUNAT respondió. Aceptada → enlaces y aviso a Pedidos; rechazada → la guía queda anulada con el motivo. */
  actualizarEstadoGuia(guiaId: string, consulta: Extract<RespuestaConsulta, { ok: true }>, actor: Actor): Promise<ResultadoAccion<{ estadoSunat: EstadoSunat }>>
  /** Anula con uno de los tres casos (solo el Jefe de Transporte, con motivo). El caso 2 reabre la conformidad y devuelve el stock de Despacho al rack. */
  anularGuia(guiaId: string, caso: CasoAnulacion, motivo: string, actor: Actor): Promise<ResultadoAccion<{ caso: CasoAnulacion; conformidadReabierta: boolean; bajaSunat: 'PENDIENTE' | 'NO_APLICA' }>>
  /** La bandeja de avisos hacia Pedidos (guía emitida / anulada), con su estado de envío. */
  eventosPedidos(filtro?: { salidaId?: string; soloPendientes?: boolean }): Promise<EventoPedidos[]>
  /** Anota el resultado de un envío a Pedidos. */
  marcarEventoPedidos(id: string, enviado: boolean, error: string | undefined, actor: Actor): Promise<ResultadoAccion>
}
