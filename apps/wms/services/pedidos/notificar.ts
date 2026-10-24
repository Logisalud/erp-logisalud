import 'server-only'

import { modoDemoActivo } from '@/lib/demo'
import type { EventoPedidos } from '@/domain/guia-electronica'
import { ENCABEZADO_FIRMA, ENCABEZADO_HORA, firmar } from './firma'

// El otro sentido del puerto con Pedidos (OS-3): el WMS avisa «guía emitida» (con el número y las líneas conformadas con lote, vencimiento y cantidad,
// que Pedidos necesita para su factura) y «guía anulada» (para que Contabilidad decida anulación o nota de crédito: el WMS no toca la factura).
// Es indispensable antes de producción (D-80); hasta que Sebas lo apruebe los avisos quedan en la bandeja y se reintentan.

export type ResultadoEnvio = { ok: true } | { ok: false; mensaje: string }

export interface NotificadorPedidos {
  readonly origen: string
  enviar(evento: EventoPedidos): Promise<ResultadoEnvio>
}

export const RUTA_EVENTOS_WMS = '/integracion/wms/eventos'

/** Lo que recibe Pedidos: el evento tal como lo guardó el WMS, con su id (Pedidos lo usa para no procesarlo dos veces). */
export const cuerpoDelEvento = (e: EventoPedidos) => JSON.stringify({ evento_id: e.id, tipo: e.tipo, creado_en: e.creadoEn, ...e.payload })

export class NotificadorNoConfigurado implements NotificadorPedidos {
  readonly origen = 'sin configurar'
  async enviar(): Promise<ResultadoEnvio> {
    return { ok: false, mensaje: 'La conexión con Pedidos todavía no está configurada: el aviso queda en la bandeja y se enviará cuando lo esté.' }
  }
}

/** En la demostración Pedidos «recibe» en memoria (para verlo en las pruebas). */
const g = globalThis as { __wmsPedidosRecibidos?: { id: string; tipo: string; cuerpo: Record<string, unknown> }[] }
export const pedidosRecibidos = () => (g.__wmsPedidosRecibidos ??= [])
export const reiniciarPedidosRecibidos = () => { g.__wmsPedidosRecibidos = [] }
export class NotificadorDemo implements NotificadorPedidos {
  readonly origen = 'demostración'
  async enviar(e: EventoPedidos): Promise<ResultadoEnvio> {
    const lista = pedidosRecibidos()
    if (!lista.some((x) => x.id === e.id)) lista.push({ id: e.id, tipo: e.tipo, cuerpo: JSON.parse(cuerpoDelEvento(e)) })
    return { ok: true }
  }
}

export interface OpcionesNotificadorHttp { baseUrl: string; secreto: string; fetchFn?: typeof fetch; ahora?: () => Date; tiempoMaximoMs?: number }

/** POST firmado con HMAC (la misma firma que la lectura de pedidos). */
export class NotificadorPedidosHttp implements NotificadorPedidos {
  readonly origen: string
  constructor(private readonly o: OpcionesNotificadorHttp) { this.origen = new URL(o.baseUrl).host }

  async enviar(e: EventoPedidos): Promise<ResultadoEnvio> {
    const ahora = (this.o.ahora ?? (() => new Date()))()
    const url = new URL(this.o.baseUrl.replace(/\/$/, '') + RUTA_EVENTOS_WMS)
    const hora = String(Math.floor(ahora.getTime() / 1000))
    const cuerpo = cuerpoDelEvento(e)
    const control = new AbortController()
    const t = setTimeout(() => control.abort(), this.o.tiempoMaximoMs ?? 10_000)
    try {
      const r = await (this.o.fetchFn ?? fetch)(url, {
        method: 'POST', cache: 'no-store', signal: control.signal, body: cuerpo,
        headers: { 'content-type': 'application/json', [ENCABEZADO_HORA]: hora, [ENCABEZADO_FIRMA]: firmar(this.o.secreto, 'POST', url.pathname, cuerpo, hora) },
      })
      if (r.status === 401 || r.status === 403) return { ok: false, mensaje: 'Pedidos rechazó la firma del aviso. Revisa el secreto compartido.' }
      if (!r.ok) return { ok: false, mensaje: `Pedidos respondió con un error (${r.status}). El aviso se reintenta.` }
      return { ok: true }
    } catch {
      return { ok: false, mensaje: 'Pedidos no respondió. El aviso queda en la bandeja y se reintenta.' }
    } finally {
      clearTimeout(t)
    }
  }
}

export function notificadorPedidos(): NotificadorPedidos {
  if (modoDemoActivo()) return new NotificadorDemo()
  const baseUrl = process.env.WMS_PEDIDOS_URL
  const secreto = process.env.WMS_PEDIDOS_SECRETO
  if (!baseUrl || !secreto) return new NotificadorNoConfigurado()
  return new NotificadorPedidosHttp({ baseUrl, secreto })
}
