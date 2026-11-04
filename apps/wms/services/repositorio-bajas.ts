import type {
  ContenidoOrdenBaja, DatosEvaluacionBaja, EntradaBaja, OrdenBajaResumen, OrdenBajaVista, StockEnBajasVista, StockParaBaja, TipoSustentoBaja,
} from '@/domain/bajas'
import type { Actor, ResultadoAccion } from './repositorio'

/** OS-6: Bajas con sustento por motivo y la Orden de Baja LS-FR.56.01 (integrada en BJ1). */
export interface RepositorioBajas {
  /** Todas las Órdenes de Baja, de la más reciente a la más antigua. */
  listarBajas(): Promise<OrdenBajaResumen[]>
  obtenerBaja(id: string): Promise<OrdenBajaVista | null>
  /** El contenido del documento: el guardado al emitir (inmutable) o, mientras es solicitud, un borrador con los datos de hoy. */
  contenidoBaja(id: string): Promise<{ contenido: ContenidoOrdenBaja; borrador: boolean; estado: OrdenBajaVista['estado']; hash?: string } | null>
  /** Stock de un propietario que se puede pedir de baja (Aprobado, Cuarentena o Devoluciones), con lo disponible de verdad. */
  stockParaBaja(propietarioId: string, consulta?: string, limite?: number): Promise<StockParaBaja[]>
  /** Stock en estado Bajas/Rechazados por propietario, lote y ubicación (contrato para la salida por destrucción). */
  stockEnBajas(propietarioId?: string): Promise<StockEnBajasVista[]>
  /** Las ubicaciones del área de Bajas donde puede ir el stock de este propietario. */
  ubicacionesDeBajas(propietarioId: string): Promise<{ id: string; codigo: string }[]>

  solicitarBaja(entrada: EntradaBaja, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>>
  confirmarVencimientoBaja(lineaId: string, actor: Actor): Promise<ResultadoAccion>
  registrarEvaluacionBaja(lineaId: string, datos: DatosEvaluacionBaja, actor: Actor): Promise<ResultadoAccion>
  adjuntarSustentoBaja(lineaId: string, archivo: { tipo: TipoSustentoBaja; nombre: string; ref: string; hash?: string; bytes?: number; referencia?: string }, actor: Actor): Promise<ResultadoAccion>
  autorizarBaja(id: string, actor: Actor): Promise<ResultadoAccion>
  cerrarSolicitudBaja(id: string, decision: 'RECHAZADA' | 'CANCELADA', motivo: string, actor: Actor): Promise<ResultadoAccion>
  anularOrdenBaja(id: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  reemitirOrdenBaja(id: string, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>>
  trasladarBaja(id: string, destinoId: string | undefined, actor: Actor): Promise<ResultadoAccion<{ movimiento: string }>>
}
