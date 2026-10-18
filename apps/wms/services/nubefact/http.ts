import 'server-only'

import { mensajeHumanoSunat, type ModoNubefact, type PayloadConsulta, type PayloadNubefact, type RespuestaConsulta, type RespuestaEmision } from '@/domain/guia-electronica'
import type { ClienteNubefact } from './cliente'

export interface OpcionesNubefactHttp {
  url: string
  token: string
  modo: Exclude<ModoNubefact, 'SIMULADOR'>
  /** Para las pruebas. */
  fetchFn?: typeof fetch
  tiempoMaximoMs?: number
}

/**
 * Cliente de la API JSON de Nubefact. El token solo sale del entorno y viaja en el encabezado de autorización; nunca se guarda ni se escribe en los registros.
 * Los nombres de los campos de la respuesta se validan contra el entorno de pruebas de Nubefact antes de producción (pendiente, ver docs/wms/nubefact.md).
 */
export class ClienteNubefactHttp implements ClienteNubefact {
  readonly modo: Exclude<ModoNubefact, 'SIMULADOR'>
  constructor(private readonly o: OpcionesNubefactHttp) { this.modo = o.modo }

  private async post(cuerpo: unknown): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; error: string; reintentable: boolean }> {
    const control = new AbortController()
    const t = setTimeout(() => control.abort(), this.o.tiempoMaximoMs ?? 20_000)
    try {
      const r = await (this.o.fetchFn ?? fetch)(this.o.url, {
        method: 'POST', cache: 'no-store', signal: control.signal,
        headers: { 'content-type': 'application/json', accept: 'application/json', authorization: this.o.token },
        body: JSON.stringify(cuerpo),
      })
      let json: Record<string, unknown> = {}
      try { json = (await r.json()) as Record<string, unknown> } catch { /* sin cuerpo JSON */ }
      if (r.status === 401 || r.status === 403) return { ok: false, error: 'Nubefact rechazó las credenciales. Revisa el token configurado.', reintentable: false }
      if (r.status >= 500) return { ok: false, error: 'Nubefact no está respondiendo bien. Intenta de nuevo en unos minutos.', reintentable: true }
      if (!r.ok || json.errors) return { ok: false, error: mensajeHumanoSunat(json.codigo as string | number | undefined, String(json.errors ?? `error ${r.status}`)), reintentable: false }
      return { ok: true, json }
    } catch {
      return { ok: false, error: 'Nubefact no respondió. No se emitió nada: intenta de nuevo.', reintentable: true }
    } finally {
      clearTimeout(t)
    }
  }

  async emitirGuia(payload: PayloadNubefact): Promise<RespuestaEmision> {
    const r = await this.post(payload)
    if (!r.ok) return r
    const j = r.json
    const rechazo = this.rechazo(j)
    if (rechazo) return { ok: false, error: rechazo, reintentable: false }
    if (!j.numero) return { ok: false, error: 'La respuesta de Nubefact no trae el número de la guía. No se registró nada: revisa en Nubefact si la guía se emitió.', reintentable: false }
    const aceptada = j.aceptada_por_sunat === true
    return {
      ok: true, numero: `${String(j.serie ?? payload.serie)}-${String(j.numero).padStart(8, '0')}`,
      enlace: texto(j.enlace_del_pdf), enlaceXml: texto(j.enlace_del_xml), enlaceCdr: texto(j.enlace_del_cdr), hash: String(j.codigo_hash ?? ''),
      estadoSunat: aceptada && texto(j.enlace_del_pdf) ? 'ACEPTADA' : 'PENDIENTE', entorno: this.modo, cruda: j,
    }
  }

  async consultarGuia(consulta: PayloadConsulta): Promise<RespuestaConsulta> {
    const r = await this.post(consulta)
    if (!r.ok) return r
    const j = r.json
    const rechazo = this.rechazo(j)
    if (rechazo) return { ok: true, estadoSunat: 'RECHAZADA', error: rechazo, cruda: j }
    if (j.aceptada_por_sunat === true && texto(j.enlace_del_pdf)) {
      return { ok: true, estadoSunat: 'ACEPTADA', enlace: texto(j.enlace_del_pdf), enlaceXml: texto(j.enlace_del_xml), enlaceCdr: texto(j.enlace_del_cdr), hash: texto(j.codigo_hash), cruda: j }
    }
    return { ok: true, estadoSunat: 'PENDIENTE', cruda: j }
  }

  /** Un error de SUNAT en la respuesta (no del transporte). */
  private rechazo(j: Record<string, unknown>): string | null {
    const soap = texto(j.sunat_soap_error)
    if (j.aceptada_por_sunat === true || !soap) return null
    return mensajeHumanoSunat(j.sunat_responsecode as string | undefined, texto(j.sunat_description) ?? soap)
  }
}

const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)
