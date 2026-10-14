import 'server-only'

import { ENCABEZADO_FIRMA, ENCABEZADO_HORA, firmar } from './firma'

// El puerto con Pedidos (S3). La bandeja no sabe de dónde vienen los pedidos: hoy los trae por HTTP firmado (HMAC) y, cuando Pedidos se
// consolide con este proyecto, un adaptador SQL ocupará su lugar sin tocar el dominio. En Preview y en las pruebas, la fuente demo.

export type CodigoFalla = 'NO_CONFIGURADA' | 'SIN_RESPUESTA' | 'RECHAZADA' | 'RESPUESTA_INVALIDA'

export type ResultadoFuente =
  | { ok: true; /** El JSON crudo de Pedidos: lo valida el dominio, pedido por pedido. */ pedidos: unknown; generadoEn: string }
  | { ok: false; codigo: CodigoFalla; mensaje: string }

export interface FuentePedidos {
  readonly origen: string
  /** Los pedidos READY_FOR_OPERATIONS con su snapshot y versión. */
  listarListos(): Promise<ResultadoFuente>
}

/** Mientras no se configure la conexión (variables del entorno), la bandeja sigue con lo ya importado y lo dice. */
export class FuenteNoConfigurada implements FuentePedidos {
  readonly origen = 'sin configurar'
  async listarListos(): Promise<ResultadoFuente> {
    return { ok: false, codigo: 'NO_CONFIGURADA', mensaje: 'La conexión con Pedidos todavía no está configurada. La bandeja muestra lo ya importado.' }
  }
}

export const RUTA_PEDIDOS_LISTOS = '/integracion/wms/pedidos-listos'

export interface OpcionesHttp {
  baseUrl: string
  secreto: string
  /** Para las pruebas. */
  fetchFn?: typeof fetch
  ahora?: () => Date
  tiempoMaximoMs?: number
}

/** Adaptador HTTP: GET firmado con HMAC. Sin service role del otro proyecto ni tablas expuestas. */
export class FuentePedidosHttp implements FuentePedidos {
  readonly origen: string
  constructor(private readonly o: OpcionesHttp) { this.origen = new URL(o.baseUrl).host }

  async listarListos(): Promise<ResultadoFuente> {
    const ahora = (this.o.ahora ?? (() => new Date()))()
    const url = new URL(this.o.baseUrl.replace(/\/$/, '') + RUTA_PEDIDOS_LISTOS)
    const hora = String(Math.floor(ahora.getTime() / 1000))
    const control = new AbortController()
    const temporizador = setTimeout(() => control.abort(), this.o.tiempoMaximoMs ?? 10_000)
    try {
      const r = await (this.o.fetchFn ?? fetch)(url, {
        method: 'GET', cache: 'no-store', signal: control.signal,
        headers: { accept: 'application/json', [ENCABEZADO_HORA]: hora, [ENCABEZADO_FIRMA]: firmar(this.o.secreto, 'GET', url.pathname + url.search, '', hora) },
      })
      if (r.status === 401 || r.status === 403) return { ok: false, codigo: 'RECHAZADA', mensaje: 'Pedidos rechazó la firma de la solicitud. Revisa el secreto compartido.' }
      if (!r.ok) return { ok: false, codigo: 'SIN_RESPUESTA', mensaje: `Pedidos respondió con un error (${r.status}). Intenta de nuevo en unos minutos.` }
      let cuerpo: unknown
      try { cuerpo = await r.json() } catch { return { ok: false, codigo: 'RESPUESTA_INVALIDA', mensaje: 'La respuesta de Pedidos no es un JSON válido.' } }
      const c = cuerpo as { pedidos?: unknown; generado_en?: unknown; generadoEn?: unknown }
      if (!c || !Array.isArray(c.pedidos)) return { ok: false, codigo: 'RESPUESTA_INVALIDA', mensaje: 'La respuesta de Pedidos no trae la lista de pedidos.' }
      return { ok: true, pedidos: c.pedidos, generadoEn: String(c.generado_en ?? c.generadoEn ?? ahora.toISOString()) }
    } catch {
      return { ok: false, codigo: 'SIN_RESPUESTA', mensaje: 'Pedidos no respondió. La bandeja sigue con lo ya importado.' }
    } finally {
      clearTimeout(temporizador)
    }
  }
}
