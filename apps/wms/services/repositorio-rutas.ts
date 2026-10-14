import type { RegistroLsFrVista } from '@/domain/ls-fr-43-03'
import type { PanoramaRutas, PlanRuta, PersonalTransporte, RutaVista, VehiculoVista } from '@/domain/rutas'
import type { Actor, ResultadoAccion } from './repositorio'

/** S4: rutas de distribución. Planificar una ruta crea la salida de cada pedido y le asigna el stock (FEFO). */
export interface RepositorioRutas {
  panoramaRutas(): Promise<PanoramaRutas>
  obtenerRuta(id: string): Promise<RutaVista | null>
  crearRuta(datos: { fecha: string; vehiculoId?: string; conductorId?: string; auxiliarId?: string }, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>>
  /** Guarda el plan completo (vehículo, personal, pedidos en orden) como una versión nueva. Con la ruta ya planificada, el motivo es obligatorio. */
  planificarRuta(id: string, plan: PlanRuta, actor: Actor): Promise<ResultadoAccion<{ version: number; bloqueadosPorStock: string[] }>>
  /** El registro LS-FR.43.03 de la ruta (existe desde que se confirma), con lo que registraron las etapas siguientes. */
  registroLsFr(rutaId: string): Promise<RegistroLsFrVista | null>
  confirmarRuta(id: string, actor: Actor): Promise<ResultadoAccion>
  cancelarRuta(id: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  guardarPersonal(p: { id?: string; nombre: string; funcion: PersonalTransporte['funcion']; activo: boolean }, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  guardarVehiculo(v: Pick<VehiculoVista, 'placa' | 'descripcion' | 'tipo' | 'calificado' | 'aptoCadenaFrio' | 'activo'> & { id?: string }, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
}
