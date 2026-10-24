import 'server-only'

import { construirConsulta, construirPayloadNubefact, faltantesDeGuia, partirNumeroGuia, type CasoAnulacion, type EstadoSunat, type RespuestaEmision, type TrasladoGuia } from '@/domain/guia-electronica'
import { MENSAJE_RESULTADO_INCIERTO, mensajeNumeroOcupado, mensajeSalto, numeroConSerie } from '@/domain/numeracion-guias'
import { repositorio } from './repositorio-actual'
import { clienteNubefact, modoNubefactActual, nubefactDemoIncompleto, NubefactNoConfigurado, type ResultadoPruebaConexion } from './nubefact/cliente'
import { notificadorPedidos } from './pedidos/notificar'
import type { Actor, ResultadoAccion } from './repositorio'

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const falla = (mensaje: string): { ok: false; mensaje: string } => ({ ok: false, mensaje })

/** Cuántos números ocupados por el panel de Nubefact se saltan solos antes de pedir que se corrija el correlativo a mano. */
const MAXIMO_SALTOS = 10

/** Paso 2: pregunta a Nubefact si SUNAT ya aceptó la guía y anota la respuesta (aceptada → enlaces y aviso a Pedidos; rechazada → la guía se anula con el motivo; dada de baja en el panel → anulada). */
async function consultarYAnotar(guiaId: string, numero: string, actor: Actor): Promise<{ ok: true; estadoSunat: EstadoSunat | 'ANULADA'; error?: string } | { ok: false; mensaje: string }> {
  let cliente
  try { cliente = clienteNubefact() } catch (e) { return falla(e instanceof NubefactNoConfigurado ? e.message : 'No se pudo conectar con Nubefact') }
  const { serie, numero: n } = partirNumeroGuia(numero)
  const c = await cliente.consultarGuia(construirConsulta(serie, n))
  if (!c.ok) return falla(c.error)
  if (c.estadoSunat === 'PENDIENTE' && !c.anuladaEnNubefact) return { ok: true, estadoSunat: 'PENDIENTE' }
  const r = await repositorio().actualizarEstadoGuia(guiaId, c, actor)
  if (!r.ok) return falla(r.mensaje)
  return { ok: true, estadoSunat: r.estadoSunat, error: c.error }
}

export interface ResultadoEmision { id: string; numero: string; entorno: string; estadoSunat: string; pedidos: 'ENVIADO' | 'PENDIENTE' | 'NO_AUN'; saltados: number[]; adoptada?: boolean }

/**
 * «Emitir guía» (dos pasos, como Nubefact): toma todo del WMS, RESERVA el número de la serie de forma atómica (una sola guía en curso por serie; una guía real no sale sin el
 * correlativo inicial confirmado), envía la guía a Nubefact y la registra en espera de SUNAT; enseguida consulta una vez.
 * La numeración no se salta (D-162 a D-164): si Nubefact no recibió la guía, el número se libera y lo usa la siguiente; si no se sabe (la red se cortó), la reserva queda y el reintento
 * pregunta primero a Nubefact y reutiliza el mismo número; «ya existe» (alguien emitió desde el panel) da el número por usado y sigue con el siguiente; «salto» no emite nada y pide corregir el correlativo.
 * Si SUNAT ya la aceptó, queda con su PDF y se avisa a Pedidos; si todavía no responde, queda «en espera»; si la rechaza, se anula con el motivo.
 */
export async function emitirGuiaElectronica(salidaId: string, traslado: TrasladoGuia, actor: Actor): Promise<ResultadoAccion<ResultadoEmision>> {
  const repo = repositorio()
  const datos = await repo.datosGuia(salidaId)
  if (!datos) return falla('No encontramos esa salida')
  const faltan = faltantesDeGuia(datos, traslado, modoNubefactActual())
  if (faltan.length) return falla(faltan.length === 1 ? faltan[0] : `Falta completar: ${faltan.join('; ')}.`)
  let cliente
  try { cliente = clienteNubefact() } catch (e) { return falla(e instanceof NubefactNoConfigurado ? e.message : 'No se pudo conectar con Nubefact') }
  const saltados: number[] = []
  let r: Extract<RespuestaEmision, { ok: true }> | null = null
  let payload: unknown = null
  let adoptada = false
  while (!r) {
    const res = await repo.reservarNumeroGuia(datos.serie, cliente.modo, salidaId)
    if (!res.ok) return falla(res.mensaje)
    const numero = res.numero
    if (res.reintento) {
      // un envío anterior no terminó: ¿Nubefact ya tiene esa guía?
      const previa = await cliente.consultarGuia(construirConsulta(datos.serie, numero))
      if (previa.ok && previa.anuladaEnNubefact) {
        await repo.marcarNumeroGuiaOcupado(datos.serie, numero, 'Existía en Nubefact y está dada de baja')
        saltados.push(numero)
        continue
      }
      if (previa.ok) {
        adoptada = true
        payload = construirPayloadNubefact(datos, traslado, hoyLima(), numero)
        r = { ok: true, numero: numeroConSerie(datos.serie, numero), enlace: previa.enlace, enlaceXml: previa.enlaceXml, enlaceCdr: previa.enlaceCdr, hash: previa.hash ?? '', estadoSunat: previa.estadoSunat, entorno: cliente.modo, cruda: previa.cruda }
        break
      }
      if (previa.causa !== 'NO_ENCONTRADA') return falla(`${previa.error} La guía ${numeroConSerie(datos.serie, numero)} sigue reservada: vuelve a intentar.`)
    }
    payload = construirPayloadNubefact(datos, traslado, hoyLima(), numero)
    const e = await cliente.emitirGuia(payload as ReturnType<typeof construirPayloadNubefact>)
    if (e.ok) { r = e; break }
    if (e.causa === 'NUMERO_EXISTE') {
      await repo.marcarNumeroGuiaOcupado(datos.serie, numero, 'Ya existía en Nubefact')
      saltados.push(numero)
      if (saltados.length >= MAXIMO_SALTOS) return falla(`${mensajeNumeroOcupado(datos.serie, numero, numero + 1)} Ya van ${saltados.length} números ocupados seguidos: revisa en Nubefact el último número de la serie y corrígelo en «Numeración de guías».`)
      continue
    }
    if (e.causa === 'NUMERO_SALTO') {
      await repo.liberarNumeroGuia(datos.serie, numero, 'Nubefact esperaba otro número')
      return falla(mensajeSalto(datos.serie, e.numeroEsperado))
    }
    if (e.reintentable) return falla(`${e.error} ${MENSAJE_RESULTADO_INCIERTO}`)
    await repo.liberarNumeroGuia(datos.serie, numero, e.error)    // Nubefact no la recibió: el número vuelve a estar libre (sin huecos)
    return falla(e.error)
  }
  const reg = await repo.registrarGuiaElectronica(salidaId, r, traslado, payload, actor)
  if (!reg.ok) {
    // Nubefact ya la recibió: el número queda reservado para esta orden y el registro del servidor lo deja anotado; un reintento la adopta sin duplicarla.
    console.error(`[guía electrónica] enviada en ${r.entorno} como ${r.numero} pero no se registró en el WMS: ${reg.mensaje}`)
    return falla(`La guía ${r.numero} se envió a Nubefact, pero el WMS no pudo registrarla: ${reg.mensaje}. Vuelve a emitir: el WMS reconoce la guía en Nubefact y la registra sin duplicarla; si sigue fallando, avisa a Sistemas con ese número.`)
  }
  let estado: EstadoSunat = r.estadoSunat
  if (estado === 'PENDIENTE') {
    const c = await consultarYAnotar(reg.id, reg.numero, actor)
    if (c.ok && c.estadoSunat !== 'ANULADA') {
      estado = c.estadoSunat
      if (estado === 'RECHAZADA') return falla(`SUNAT rechazó la guía ${reg.numero}: ${c.error ?? 'sin detalle'}. La guía quedó anulada: corrige lo indicado y emite otra.`)
    }
  }
  const envio = estado === 'ACEPTADA' ? await enviarEventosPedidos(actor, salidaId) : { pendientes: 0 }
  return { ok: true, id: reg.id, numero: reg.numero, entorno: r.entorno, estadoSunat: estado, saltados, adoptada, pedidos: estado !== 'ACEPTADA' ? 'NO_AUN' : envio.pendientes === 0 ? 'ENVIADO' : 'PENDIENTE' }
}

/** «Consultar estado en SUNAT» para una guía que quedó en espera. */
export async function consultarEstadoGuia(guiaId: string, numero: string, salidaId: string, actor: Actor): Promise<ResultadoAccion<{ estadoSunat: EstadoSunat | 'ANULADA'; pedidos: 'ENVIADO' | 'PENDIENTE' | 'NO_AUN' }>> {
  const c = await consultarYAnotar(guiaId, numero, actor)
  if (!c.ok) return falla(c.mensaje)
  if (c.estadoSunat === 'ANULADA') {
    const envio = await enviarEventosPedidos(actor, salidaId)
    return { ok: true, estadoSunat: 'ANULADA', pedidos: envio.pendientes === 0 ? 'ENVIADO' : 'PENDIENTE' }
  }
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

/** «Probar conexión» con Nubefact (D-167): dice si responde y acepta el token. Nunca devuelve ni escribe la ruta ni el token. */
export async function probarConexionNubefact(): Promise<{ ok: boolean; modo: string; mensaje: string }> {
  const incompleto = nubefactDemoIncompleto()
  let cliente
  try { cliente = clienteNubefact() } catch (e) { return { ok: false, modo: modoNubefactActual(), mensaje: e instanceof NubefactNoConfigurado ? e.message : 'No se pudo conectar con Nubefact' } }
  const r: ResultadoPruebaConexion = await cliente.probarConexion()
  const base = r.ok ? r.detalle : r.error
  return { ok: r.ok, modo: cliente.modo, mensaje: incompleto ? `${incompleto} ${base}` : base }
}
