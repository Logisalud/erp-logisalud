import 'server-only'

import { TEXTO_NO_DISPONIBLE, type EstadoDePagos, type HitoVista, type RespuestaSeguimiento } from '@/domain/seguimiento'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioSeguimiento } from '../repositorio-seguimiento'
import { MisRutasSupabase } from './mis-rutas-supabase'
import { mensajeHumano, rpc, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL. Verificado contra el contrato de las funciones de la migración 0047 (probadas en Postgres local, tests/db/seguimiento.test.ts) y por tipos.
// La consulta pública corre SIN sesión (rol `anon`): solo puede llamar a las dos funciones de consulta; no hay service role.

function deuda(d: unknown): EstadoDePagos | null {
  if (!d || typeof d !== 'object') return null
  const r = d as Fila
  if (r.estado === 'AL_DIA') return { estado: 'AL_DIA', al: String(r.al) }
  if (r.estado === 'MOROSO') return { estado: 'MOROSO', al: String(r.al), total: Number(r.total), maxDias: Number(r.max_dias), cantidad: Number(r.cantidad), documentos: ((r.documentos ?? []) as Fila[]).map((x) => ({ documento: String(x.documento), vence: String(x.vence), dias: Number(x.dias), saldo: Number(x.saldo) })) }
  return null
}

function respuesta(data: unknown): RespuestaSeguimiento {
  const r = (data ?? {}) as Fila
  switch (String(r.estado)) {
    case 'OK': return { estado: 'OK', pedido: String(r.pedido), hitos: ((r.hitos ?? []) as Fila[]).map((h): HitoVista => ({ estado: String(h.estado) as HitoVista['estado'], en: String(h.en) })), deuda: deuda(r.deuda) }
    case 'ESPERA': return { estado: 'ESPERA', esperaSegundos: Number(r.espera_segundos ?? 60) }
    case 'NO_ENCONTRADO': return { estado: 'NO_ENCONTRADO' }
    case 'NO_DISPONIBLE': return { estado: 'NO_DISPONIBLE' }
    case 'LISTO': return { estado: 'LISTO' }
    default: return { estado: 'ERROR' }
  }
}

export class SeguimientoSupabase extends MisRutasSupabase implements RepositorioSeguimiento {
  async consultarSeguimiento(pedido: string, ruc: string, ip: string): Promise<RespuestaSeguimiento> {
    try { const { data, error } = await rpc('seguimiento_consultar', { p_pedido: pedido, p_ruc: ruc, p_ip: ip }); return error ? { estado: 'ERROR' } : respuesta(data) } catch { return { estado: 'ERROR' } }
  }
  async consultarSeguimientoPorToken(token: string, ip: string): Promise<RespuestaSeguimiento> {
    try { const { data, error } = await rpc('seguimiento_por_token', { p_token: token, p_ip: ip }); return error ? { estado: 'ERROR' } : respuesta(data) } catch { return { estado: 'ERROR' } }
  }
  async crearEnlaceSeguimiento(pedidoNumero: string, dias: number, _a: Actor): Promise<ResultadoAccion<{ token: string; venceEn: string }>> {
    const { data, error } = await rpc('crear_enlace_seguimiento', { p_pedido_numero: pedidoNumero, p_dias: dias })
    if (error) return { ok: false, mensaje: mensajeHumano(error) }
    const r = (data ?? {}) as Fila
    return { ok: true, token: String(r.token), venceEn: String(r.vence_en) }
  }
  async revocarEnlacesSeguimiento(pedidoNumero: string, _a: Actor): Promise<ResultadoAccion<{ revocados: number }>> {
    const { data, error } = await rpc('revocar_enlaces_seguimiento', { p_pedido_numero: pedidoNumero })
    return error ? { ok: false, mensaje: mensajeHumano(error) } : { ok: true, revocados: Number(data ?? 0) }
  }
}
void TEXTO_NO_DISPONIBLE
