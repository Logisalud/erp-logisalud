import 'server-only'
import { puedeSubirCargaInicial } from '@/domain/carga-inicial'
import { construirInforme, type InformeCarga } from '@/domain/informe-carga'
import { parsearCargaInicial } from '@/domain/inventario'
import { repositorio } from './repositorio-actual'
import type { Actor } from './repositorio'

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

/**
 * Informe de validación de una carga de ensayo: lee el archivo, pregunta a la validación de siempre (`validar_carga_inicial`, la base manda) y lo ordena en palabras llanas.
 * No guarda nada ni toca la confirmación.
 */
export async function informeDeCarga(texto: string, actor: Actor): Promise<{ ok: true; informe: InformeCarga } | { ok: false; mensaje: string }> {
  if (!puedeSubirCargaInicial(actor.roles)) return { ok: false, mensaje: 'No tienes permiso para revisar la carga inicial' }
  if (!texto.trim()) return { ok: false, mensaje: 'Sube o pega el archivo de la carga para revisarlo' }
  const leido = parsearCargaInicial(texto)
  const erroresBase = leido.filas.length > 0 ? await repositorio().validarCargaInicial(leido.filas, actor) : []
  return { ok: true, informe: construirInforme(leido.filas, erroresBase, { hoy: hoyLima(), erroresLectura: leido.errores }) }
}
