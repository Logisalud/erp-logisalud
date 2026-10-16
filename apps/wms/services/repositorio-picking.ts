import type { AsignacionLote } from '@/domain/salidas'
import type { CambioFefoPersona, LoteEditable, OrdenPickingResumen, OrdenPickingVista, ReemplazoVista, SalidaResumen, SalidaVista, TipoNoConformidad } from '@/domain/despacho'
import type { Actor, ResultadoAccion } from './repositorio'

/** S5: salidas por pedido — asignación de lotes (editable), picking, discrepancias y conformidad. */
export interface RepositorioPicking {
  listarSalidas(): Promise<SalidaResumen[]>
  obtenerSalida(id: string): Promise<SalidaVista | null>
  /** Los lotes que se pueden elegir para una línea (vencimiento, ubicación y disponible; el FEFO va marcado «sugerido»). */
  lotesParaEditar(lineaId: string): Promise<LoteEditable[]>
  /** D-79: elegir otros lotes antes del picking. Sin motivo obligatorio; apartarse de FEFO deja el registro automático. */
  editarAsignacion(lineaId: string, asignaciones: AsignacionLote[], motivo: string | undefined, actor: Actor): Promise<ResultadoAccion>
  generarOrdenPicking(salidaId: string, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>>
  colaPicking(): Promise<OrdenPickingResumen[]>
  obtenerOrdenPicking(id: string): Promise<OrdenPickingVista | null>
  registrarPicking(ordenLineaId: string, resultado: 'PICKEADA' | 'DISCREPANCIA', nota: string | undefined, actor: Actor): Promise<ResultadoAccion>
  /** El picker no encuentra el lote: el mismo lote en otra ubicación o el siguiente lote por vencimiento. */
  proponerReemplazo(ordenLineaId: string): Promise<ReemplazoVista[]>
  resolverDiscrepancia(ordenLineaId: string, loteId: string, posicionId: string | undefined, nota: string | undefined, actor: Actor): Promise<ResultadoAccion>
  colaConformidad(): Promise<OrdenPickingResumen[]>
  /** La conformidad la da otra persona. Conforme: las unidades pasan del rack a la zona de conformidad. */
  darConformidad(ordenLineaId: string, resultado: 'CONFORME' | 'OBSERVADA', nota: string | undefined, tipo: TipoNoConformidad | undefined, actor: Actor): Promise<ResultadoAccion>
  /** Una línea observada se corrige: vuelve a picking y a conformidad. */
  reabrirObservada(ordenLineaId: string, nota: string | undefined, actor: Actor): Promise<ResultadoAccion>
  reporteCambiosFefo(desde: string | undefined, hasta: string | undefined, actor: Actor): Promise<ResultadoAccion<{ filas: CambioFefoPersona[] }>>
}
