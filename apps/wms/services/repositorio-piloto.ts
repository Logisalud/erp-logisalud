import type { ModoPiloto } from '@/domain/modo-piloto'
import type { OcPilotoVista, ResumenSincronizacion } from '@/domain/oc-versiones'
import type { Actor, ResultadoAccion } from './repositorio'

/** Piloto (0038): el parámetro `modo_piloto` y la copia inmutable de las órdenes de compra. El WMS solo LEE Compras: nada de esto escribe en `compras.*`. */
export interface RepositorioPiloto {
  /** El parámetro `modo_piloto` (`si` | `no`); `undefined` si no se pudo leer (quien lo usa decide con `resolverModoPiloto`, que falla cerrado). */
  modoPiloto(): Promise<ModoPiloto | undefined>
  /** Las órdenes de compra abiertas en Compras y las que ya tienen copia, con su versión vigente y si cambiaron. */
  ocsDelPiloto(): Promise<OcPilotoVista[]>
  /** «Revisar Compras ahora»: copia las OC nuevas y agrega una versión (con alerta) a las que cambiaron. */
  sincronizarOcs(actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenSincronizacion }>>
}
