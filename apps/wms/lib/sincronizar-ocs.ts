import 'server-only'

import { TEXTO_ERROR_SINCRONIZACION, type ResultadoSincronizacionAuto } from '@/domain/oc-versiones'
import { repositorio } from '@/services/repositorio-actual'
import type { Contexto } from './contexto'

/**
 * P6: al abrir «Entradas» y «Órdenes de compra del piloto», sincroniza con Compras si la última sincronización tiene más de 30 minutos (la base pone el candado contra la repetición
 * en paralelo). Nunca lanza ni demora la pantalla con un error: si algo falla, vuelve ERROR con un mensaje en palabras llanas y la pantalla sigue con la última copia.
 */
export async function sincronizarOcsAlAbrir(ctx: Pick<Contexto, 'usuario' | 'roles'>): Promise<ResultadoSincronizacionAuto> {
  try { return await repositorio().sincronizarOcsSiToca({ id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }) }
  catch { return { estado: 'ERROR', actual: {}, mensaje: TEXTO_ERROR_SINCRONIZACION } }
}
