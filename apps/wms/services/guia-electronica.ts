import 'server-only'

import { construirConsulta, construirPayloadNubefact, faltantesDeGuia, partirNumeroGuia, type CasoAnulacion, type EstadoSunat, type TrasladoGuia } from '@/domain/guia-electronica'
import { repositorio } from './repositorio-actual'
import { clienteNubefact, modoNubefactActual, NubefactNoConfigurado } from './nubefact/cliente'
import { notificadorPedidos } from './pedidos/notificar'
import type { Actor, ResultadoAccion } from './repositorio'

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const falla = (mensaje: string): { ok: false; mensaje: string } => ({ ok: false, mensaje })

/** Paso 2: pregunta a Nubefact si SUNAT ya aceptó la guía y anota la respuesta (aceptada → enlaces y aviso a Pedidos; rechazada → la guía se anula con el motivo). */
async function consultarYAnotar(guiaId: string, numero: string, actor: Actor): Promise<{ ok: true; estadoSunat: EstadoSunat; error?: string } | { ok: false; mensaje: string }> {
  let cliente
  try { cliente = clienteNubefact() } catch (e) { return falla(e instanceof NubefactNoConfigurado ? e.message : 'No se pudo conectar con Nubefact') }
  const { serie, numero: n } = partirNumeroGuia(numero)
  const c = await cliente.consultarGuia(construirConsulta(serie, n))
  if (!c.ok) return falla(c.error)
  if (c.estadoSunat === 'PENDIENTE') return { ok: true, estadoSunat: 'PENDIENTE' }
  const r = await repositorio().actualizarEstadoGuia(guiaId, c, actor)
  if (!r.ok) return falla(r.mensaje)
  return { ok: true, estadoSunat: r.estadoSunat, error: c.error }
}

/**
 * «Emitir guía» (dos pasos, como Nubefact): toma todo del WMS, pide el siguiente número de la serie, envía la guía a Nubefact y la registra en espera de SUNAT;
 * enseguida consulta una vez. Si SUNAT ya la aceptó, queda con su PDF y se avisa a Pedidos; si todavía no responde, queda «en espera» y se consulta con un botón;
 * si SUNAT la rechaza, la guía se anula con el motivo en lenguaje humano para corregir y emitir otra.
 */
export async function emitirGuiaElectronica(salidaId: string, traslado: TrasladoGuia, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string; entorno: string; estadoSunat: string; pedidos: 'ENVIADO' | 'PENDIENTE' | 'NO_AUN' }>> {
  const repo = repositorio()
  const datos = await repo.datosGuia(salidaId)
  if (!datos) return falla('No encontramos esa salida')
  const faltan = faltantesDeGuia(datos, traslado, modoNubefactActual())
  if (faltan.length) return falla(faltan.length === 1 ? faltan[0] : `Falta completar: ${faltan.join('; ')}.`)
  let cliente
  try { cliente = clienteNubefact() } catch (e) { return falla(e instanceof NubefactNoConfigurado ? e.message : 'No se pudo conectar con Nubefact') }
  const n = await repo.siguienteNumeroGuia(datos.serie)
  if (!n.ok) return falla(n.mensaje)
  const payload = construirPayloadNubefact(datos, traslado, hoyLima(), n.numero)
  const r = await cliente.emitirGuia(payload)
  if (!r.ok) return falla(r.error)
  const reg = await repo.registrarGuiaElectronica(salidaId, r, traslado, payload, actor)
  if (!reg.ok) {
    // Nubefact ya la recibió: el número queda en el registro del servidor para conciliarla; la persona ve qué pasó y qué hacer.
    console.error(`[guía electrónica] enviada en ${r.entorno} como ${r.numero} pero no se registró en el WMS: ${reg.mensaje}`)
    return falla(`La guía ${r.numero} se envió a Nubefact, pero el WMS no pudo registrarla: ${reg.mensaje}. No la vuelvas a emitir: avisa a Sistemas con ese número.`)
  }
  let estado: EstadoSunat = r.estadoSunat
  if (estado === 'PENDIENTE') {
    const c = await consultarYAnotar(reg.id, reg.numero, actor)
    if (c.ok) {
      estado = c.estadoSunat
      if (estado === 'RECHAZADA') return falla(`SUNAT rechazó la guía ${reg.numero}: ${c.error ?? 'sin detalle'}. La guía quedó anulada: corrige lo indicado y emite otra.`)
    }
  }
  const envio = estado === 'ACEPTADA' ? await enviarEventosPedidos(actor, salidaId) : { pendientes: 0 }
  return { ok: true, id: reg.id, numero: reg.numero, entorno: r.entorno, estadoSunat: estado, pedidos: estado !== 'ACEPTADA' ? 'NO_AUN' : envio.pendientes === 0 ? 'ENVIADO' : 'PENDIENTE' }
}

/** «Consultar estado en SUNAT» para una guía que quedó en espera. */
export async function consultarEstadoGuia(guiaId: string, numero: string, salidaId: string, actor: Actor): Promise<ResultadoAccion<{ estadoSunat: EstadoSunat; pedidos: 'ENVIADO' | 'PENDIENTE' | 'NO_AUN' }>> {
  const c = await consultarYAnotar(guiaId, numero, actor)
  if (!c.ok) return falla(c.mensaje)
  if (c.estadoSunat === 'RECHAZADA') return falla(`SUNAT rechazó la guía ${numero}: ${c.error ?? 'sin detalle'}. La guía quedó anulada: corrige lo indicado y emite otra.`)
  if (c.estadoSunat === 'PENDIENTE') return { ok: true, estadoSunat: 'PENDIENTE', pedidos: 'NO_AUN' }
  const envio = await enviarEventosPedidos(actor, salidaId)
  return { ok: true, estadoSunat: 'ACEPTADA', pedidos: envio.pendientes === 0 ? 'ENVIADO' : 'PENDIENTE' }
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
