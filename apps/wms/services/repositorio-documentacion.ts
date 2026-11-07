import type { PaqueteSalida } from '@/domain/documentacion'
import type { CasoAnulacion, DatosGuia, RegistroGuiaPanel, EstadoSunat, EventoPedidos, ModoNubefact, RespuestaConsulta, RespuestaEmision, TrasladoGuia } from '@/domain/guia-electronica'
import type { EstadoCorrelativo } from '@/domain/numeracion-guias'
import type { Actor, ResultadoAccion } from './repositorio'

/** S6b + OS-3: guía de remisión (electrónica con Nubefact, a mano o la GRE del cliente) y paquete documental de una salida. */
export interface RepositorioDocumentacion {
  /** Los lotes que salen, lo que pide el cliente de cada uno, la guía vigente y las anuladas. */
  paqueteSalida(salidaId: string): Promise<PaqueteSalida | null>
  /** Registra el N.° de la guía con las líneas confirmadas. Solo con todo el pedido conforme; una guía viva por salida; un número no se repite.
   *  Es la contingencia a mano o, en una orden de un cliente de almacenamiento (tipo B), la GRE que trae el cliente (con su archivo). */
  registrarGre(salidaId: string, numero: string, nota: string | undefined, actor: Actor, archivoRef?: string): Promise<ResultadoAccion<{ id: string }>>
  /** Piloto (0036, `guia_modo = PANEL`): la guía se emitió en el panel de Nubefact (o en Odoo) y aquí solo se registra: serie-número, fecha, estado y enlace opcional.
   *  Mismas reglas que `registrarGre` y además el número no se repite ni con una guía anulada. Deja el aviso a Pedidos como una guía emitida por el WMS. */
  registrarGuiaPanel(salidaId: string, registro: RegistroGuiaPanel, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>>
  /** Una guía no se edita: se anula con motivo y se registra otra (caso 1: datos del traslado). */
  anularGre(guiaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  /** El paquete de todas las salidas de una ruta, para imprimirlo junto. */
  salidasDeRuta(rutaId: string): Promise<string[]>

  /** Todo lo que la guía electrónica toma del WMS (destinatario, líneas por lote, ruta, vehículo, conductor, bultos, punto de partida). */
  datosGuia(salidaId: string): Promise<DatosGuia | null>
  /**
   * Reserva el número de la próxima guía de la serie, de forma atómica (D-162): una sola guía en curso por serie, y una guía REAL no se reserva hasta que alguien confirme el
   * correlativo inicial. `reintento`: ese número ya estaba reservado para esta misma orden (un envío anterior no terminó): se pregunta a Nubefact antes de volver a enviar.
   */
  reservarNumeroGuia(serie: string, entorno: ModoNubefact, salidaId: string): Promise<ResultadoAccion<{ numero: number; reintento: boolean }>>
  /** Nubefact no recibió la guía: el número queda libre y la siguiente guía lo usa primero (la API no admite saltos). */
  liberarNumeroGuia(serie: string, numero: number, motivo?: string): Promise<ResultadoAccion>
  /** «Ya existe»: alguien emitió ese número desde el panel de Nubefact; se da por usado y se sigue con el siguiente. */
  marcarNumeroGuiaOcupado(serie: string, numero: number, detalle?: string): Promise<ResultadoAccion>
  /** Cómo está la serie: último número, si el correlativo inicial está confirmado y si hay una guía en curso. */
  estadoNumeracionGuia(serie: string): Promise<EstadoCorrelativo | null>
  /** Confirma el PRIMER número que usará el WMS (lo indica Sebas al salir a producción). Solo el Jefe de Transporte o la administración. */
  confirmarCorrelativoGuia(serie: string, inicial: number, nota: string | undefined, actor: Actor): Promise<ResultadoAccion>
  /** Fija el último número que muestra Nubefact (tras un «salto»), con motivo. */
  corregirCorrelativoGuia(serie: string, ultimo: number, motivo: string, actor: Actor): Promise<ResultadoAccion>
  /** Guarda lo que devolvió Nubefact. La ruta va antes que la guía; solo pedidos (el tipo B usa la GRE del cliente). Deja el aviso para Pedidos en la bandeja. */
  registrarGuiaElectronica(salidaId: string, resultado: Extract<RespuestaEmision, { ok: true }>, traslado: TrasladoGuia, payload: unknown, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>>
  /** Paso 2 de Nubefact: anota lo que SUNAT respondió. Aceptada → enlaces y aviso a Pedidos; rechazada → la guía queda anulada con el motivo. */
  actualizarEstadoGuia(guiaId: string, consulta: Extract<RespuestaConsulta, { ok: true }>, actor: Actor): Promise<ResultadoAccion<{ estadoSunat: EstadoSunat | 'ANULADA' }>>
  /** Anula con uno de los tres casos (solo el Jefe de Transporte, con motivo). El caso 2 reabre la conformidad y devuelve el stock de Despacho al rack. */
  anularGuia(guiaId: string, caso: CasoAnulacion, motivo: string, actor: Actor): Promise<ResultadoAccion<{ caso: CasoAnulacion; conformidadReabierta: boolean; bajaSunat: 'PENDIENTE' | 'NO_APLICA' }>>
  /** La bandeja de avisos hacia Pedidos (guía emitida / anulada), con su estado de envío. */
  eventosPedidos(filtro?: { salidaId?: string; soloPendientes?: boolean }): Promise<EventoPedidos[]>
  /** Anota el resultado de un envío a Pedidos. */
  marcarEventoPedidos(id: string, enviado: boolean, error: string | undefined, actor: Actor): Promise<ResultadoAccion>
}
