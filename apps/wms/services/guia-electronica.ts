import 'server-only'

import { construirPayloadNubefact, faltantesDeGuia, type CasoAnulacion, type TrasladoGuia } from '@/domain/guia-electronica'
import { repositorio } from './repositorio-actual'
import { clienteNubefact, modoNubefactActual, NubefactNoConfigurado } from './nubefact/cliente'
import { notificadorPedidos } from './pedidos/notificar'
import type { Actor, ResultadoAccion } from './repositorio'

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const falla = (mensaje: string): { ok: false; mensaje: string } => ({ ok: false, mensaje })

/**
 * «Emitir guía»: toma todo del WMS, lo envía a Nubefact y, solo si Nubefact/SUNAT la aceptan, guarda el resultado (número, estado de SUNAT, PDF y XML)
 * y deja el aviso para Pedidos. Si SUNAT rechaza, no se guarda nada y se muestra el error en lenguaje humano para corregir y reenviar.
 */
export async function emitirGuiaElectronica(salidaId: string, traslado: TrasladoGuia, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string; entorno: string; estadoSunat: string; pedidos: 'ENVIADO' | 'PENDIENTE' }>> {
  const repo = repositorio()
  const datos = await repo.datosGuia(salidaId)
  if (!datos) return falla('No encontramos esa salida')
  const faltan = faltantesDeGuia(datos, traslado, modoNubefactActual())
  if (faltan.length) return falla(faltan.length === 1 ? faltan[0] : `Falta completar: ${faltan.join('; ')}.`)
  let cliente
  try { cliente = clienteNubefact() } catch (e) { return falla(e instanceof NubefactNoConfigurado ? e.message : 'No se pudo conectar con Nubefact') }
  const payload = construirPayloadNubefact(datos, traslado, hoyLima())
  const r = await cliente.emitirGuia(payload)
  if (!r.ok) return falla(r.error)
  const reg = await repo.registrarGuiaElectronica(salidaId, r, traslado, payload, actor)
  if (!reg.ok) {
    // Nubefact ya la emitió: el número queda en el registro del servidor para conciliarla; la persona ve qué pasó y qué hacer.
    console.error(`[guía electrónica] emitida en ${r.entorno} como ${r.numero} pero no se registró en el WMS: ${reg.mensaje}`)
    return falla(`La guía ${r.numero} se emitió en Nubefact, pero el WMS no pudo registrarla: ${reg.mensaje}. No la vuelvas a emitir: avisa a Sistemas con ese número.`)
  }
  const envio = await enviarEventosPedidos(actor, salidaId)
  return { ok: true, id: reg.id, numero: reg.numero, entorno: r.entorno, estadoSunat: r.estadoSunat, pedidos: envio.pendientes === 0 ? 'ENVIADO' : 'PENDIENTE' }
}

/** Anula con el caso elegido y avisa a Pedidos. La baja ante SUNAT no se hace sola mientras sus reglas estén pendientes de validar (D-90). */
export async function anularGuiaConCaso(guiaId: string, caso: CasoAnulacion, motivo: string, actor: Actor) {
  const r = await repositorio().anularGuia(guiaId, caso, motivo, actor)
  if (!r.ok) return r
  const envio = await enviarEventosPedidos(actor)
  return { ...r, pedidos: envio.pendientes === 0 ? ('ENVIADO' as const) : ('PENDIENTE' as const) }
}

/** Envía a Pedidos los avisos pendientes (los de una salida, o todos). Un fallo deja el aviso en la bandeja con su motivo; nunca pierde nada. */
export async function enviarEventosPedidos(actor: Actor, salidaId?: string): Promise<{ enviados: number; pendientes: number; mensaje?: string }> {
  const repo = repositorio()
  const notificador = notificadorPedidos()
  const lista = await repo.eventosPedidos({ salidaId, soloPendientes: true })
  let enviados = 0
  let mensaje: string | undefined
  for (const ev of [...lista].reverse()) {
    const r = await notificador.enviar(ev)
    await repo.marcarEventoPedidos(ev.id, r.ok, r.ok ? undefined : r.mensaje, actor)
    if (r.ok) enviados += 1
    else mensaje = r.mensaje
  }
  return { enviados, pendientes: lista.length - enviados, mensaje }
}
