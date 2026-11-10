import type { AsignacionLote } from '@/domain/salidas'
import type { CambioFefoPersona, LoteEditable, OrdenPickingResumen, OrdenPickingVista, PersonaPicking, ReemplazoVista, ResultadoLineaConformidad, SalidaResumen, SalidaVista, TipoNoConformidad } from '@/domain/despacho'
import type { Actor, ResultadoAccion } from './repositorio'

/** S5: salidas por pedido — asignación de lotes (editable), picking, discrepancias y conformidad. */
export interface RepositorioPicking {
  listarSalidas(): Promise<SalidaResumen[]>
  obtenerSalida(id: string): Promise<SalidaVista | null>
  /** Los lotes que se pueden elegir para una línea (vencimiento, ubicación y disponible; el FEFO va marcado «sugerido»). */
  lotesParaEditar(lineaId: string): Promise<LoteEditable[]>
  /** D-79: elegir otros lotes antes del picking. Sin motivo obligatorio; apartarse de FEFO deja el registro automático. */
  editarAsignacion(lineaId: string, asignaciones: AsignacionLote[], motivo: string | undefined, actor: Actor): Promise<ResultadoAccion>
  /** «Imprimir» la Orden de Salida: genera la orden de picking (una línea por reserva, en el orden del recorrido). `pickerId`: quién va a pickear (se puede indicar después). */
  generarOrdenPicking(salidaId: string, actor: Actor, pickerId?: string): Promise<ResultadoAccion<{ id: string; numero: string }>>
  /** Quienes pueden hacer el picking: auxiliares, Jefe de Almacén y Jefe de Transporte. */
  personalDePicking(): Promise<PersonaPicking[]>
  /** Quién pica se elige al imprimir o al iniciar; no cambia una vez que empezó la conformidad. */
  designarPicker(ordenId: string, pickerId: string, actor: Actor): Promise<ResultadoAccion>
  colaPicking(): Promise<OrdenPickingResumen[]>
  obtenerOrdenPicking(id: string): Promise<OrdenPickingVista | null>
  registrarPicking(ordenLineaId: string, resultado: 'PICKEADA' | 'DISCREPANCIA', nota: string | undefined, actor: Actor): Promise<ResultadoAccion>
  /** El picker no encuentra el lote: el mismo lote en otra ubicación o el siguiente lote por vencimiento. */
  proponerReemplazo(ordenLineaId: string): Promise<ReemplazoVista[]>
  resolverDiscrepancia(ordenLineaId: string, loteId: string, posicionId: string | undefined, nota: string | undefined, actor: Actor): Promise<ResultadoAccion>
  colaConformidad(): Promise<OrdenPickingResumen[]>
  /**
   * La conformidad de TODA la orden, de una vez (la da otra persona, no quien picó): «Conforme» con un click o, por línea, otro lote, menos cantidad o no encontrado; registra el N.° de bultos
   * (caja master). Al conformar, el stock pasa a Despacho. Todo o nada.
   */
  conformarOrden(ordenId: string, lineas: ResultadoLineaConformidad[], bultos: number, nota: string | undefined, actor: Actor): Promise<ResultadoAccion<{ unidades: number; bultos: number; ajustes: number; requiereEmbalaje: boolean }>>
  /** (Por línea, desde el celular.) Conforme: las unidades pasan del rack a Despacho. */
  darConformidad(ordenLineaId: string, resultado: 'CONFORME' | 'OBSERVADA', nota: string | undefined, tipo: TipoNoConformidad | undefined, actor: Actor): Promise<ResultadoAccion>
  /** Una línea observada se corrige: vuelve a picking y a conformidad. */
  reabrirObservada(ordenLineaId: string, nota: string | undefined, actor: Actor): Promise<ResultadoAccion>
  reporteCambiosFefo(desde: string | undefined, hasta: string | undefined, actor: Actor): Promise<ResultadoAccion<{ filas: CambioFefoPersona[] }>>
}
