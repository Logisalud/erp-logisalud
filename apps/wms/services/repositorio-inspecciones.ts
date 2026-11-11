import type { InspeccionVista, Items, TipoInspeccion } from '@/domain/inspecciones'
import type { Actor, ResultadoAccion } from './repositorio'

export interface VehiculoInspeccion { id: string; placa: string; descripcion?: string }
export interface DatosInspeccion { tipo: TipoInspeccion; vehiculoId: string; fecha: string; items: Items; observaciones?: string }

/** Inspecciones de la unidad (0058): quien conduce las hace y otro conductor las supervisa. No bloquean la salida de ninguna ruta. */
export interface RepositorioInspecciones {
  vehiculosParaInspeccion(actor: Actor): Promise<VehiculoInspeccion[]>
  /** `mes` = «AAAA-MM». */
  inspeccionesDelMes(tipo: TipoInspeccion, vehiculoId: string, mes: string, actor: Actor): Promise<InspeccionVista[]>
  registrarInspeccion(d: DatosInspeccion, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  supervisarInspeccion(id: string, actor: Actor): Promise<ResultadoAccion>
}
