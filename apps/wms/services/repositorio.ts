import type { EventoAuditoria, Rol } from '@/domain/tipos'
import type { Panorama } from '@/domain/panorama'
import type { EntradaProducto } from '@/domain/productos'

export interface Actor {
  id: string
  nombre: string
  roles: Rol[]
}

export type ResultadoAccion<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; mensaje: string; errores?: Record<string, string> }

/**
 * Puerto de datos del WMS. Hay dos adaptadores con la MISMA interfaz:
 *  · demo     → datos de prueba en memoria (solo Preview / local con WMS_DEMO_LOCAL=1);
 *  · supabase → el schema `wms` del proyecto consolidado (RLS por persona).
 */
export interface Repositorio {
  panorama(): Promise<Panorama>
  auditoria(limite?: number): Promise<EventoAuditoria[]>
  crearProducto(entrada: EntradaProducto, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  decidirProducto(
    id: string,
    decision: 'VALIDADO' | 'OBSERVADO',
    observacion: string | undefined,
    actor: Actor,
  ): Promise<ResultadoAccion>
}
