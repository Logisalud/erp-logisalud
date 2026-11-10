import type { EventoParada, RutaMia } from '@/domain/mis-rutas'
import type { Actor, ResultadoAccion } from './repositorio'
import type { ArchivoGuardado } from './repositorio-cierre-ruta'

export interface DatosEventoParada { motivo?: string; recibioNombre?: string; recibioDocumento?: string; foto?: ArchivoGuardado }

/** «Mis rutas» (Fase 4 · P4): las rutas del día de quien conduce o ayuda, y lo que marca en cada parada. Solo ve lo suyo; no lee el inventario. */
export interface RepositorioMisRutas {
  misRutas(actor: Actor, fecha?: string): Promise<RutaMia[]>
  registrarEventoParada(paradaId: string, evento: EventoParada, datos: DatosEventoParada, actor: Actor): Promise<ResultadoAccion<{ retornoPorOriginar: boolean; rutaPendienteDeCierre: boolean }>>
}
