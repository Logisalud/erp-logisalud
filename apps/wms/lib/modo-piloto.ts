import 'server-only'

import { resolverModoPiloto } from '@/domain/modo-piloto'
import { repositorio } from '@/services/repositorio-actual'

/**
 * ¿Está encendido el modo piloto ahora? Une el entorno (`WMS_MODO_PILOTO`, `WMS_GO_LIVE`) con el parámetro `modo_piloto` de la base (o de la demo). Falla cerrada: si el
 * parámetro no se puede leer (por ejemplo en el login, sin sesión), es piloto salvo que el entorno diga `WMS_GO_LIVE=1`. Regla en `domain/modo-piloto.ts`.
 */
export async function modoPilotoActivo(): Promise<boolean> {
  let parametro
  try { parametro = await repositorio().modoPiloto() } catch { parametro = undefined }
  return resolverModoPiloto(parametro, { WMS_MODO_PILOTO: process.env.WMS_MODO_PILOTO, WMS_GO_LIVE: process.env.WMS_GO_LIVE })
}
