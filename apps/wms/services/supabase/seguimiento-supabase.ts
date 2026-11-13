import 'server-only'

import { OPCIONES_POR_DEFECTO, TEXTO_NO_DISPONIBLE, type ClaveOpcionSeguimiento, type ContactoVendedorVista, type EstadoDePagos, type ErrorFilaContacto, type HitoVista, type OpcionesSeguimiento, type RespuestaCarita, type RespuestaSeguimiento, type ValorCarita } from '@/domain/seguimiento'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioSeguimiento } from '../repositorio-seguimiento'
import { MisRutasSupabase } from './mis-rutas-supabase'
import { mensajeHumano, rpc, s, traerTodo, type Fila } from './util'

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
    case 'OK': return { estado: 'OK', pedido: String(r.pedido), cliente: s(r.cliente), tieneParada: Boolean(r.tiene_parada), ruta: r.ruta ? { atendidas: Number((r.ruta as Fila).atendidas), total: Number((r.ruta as Fila).total) } : null,
      contacto: r.contacto ? { nombre: String((r.contacto as Fila).nombre), telefono: String((r.contacto as Fila).telefono) } : null,
      guia: r.guia ? { enlace: String((r.guia as Fila).enlace) } : null, respuesta: r.respuesta == null ? null : (Number(r.respuesta) as ValorCarita), prueba: Boolean(r.prueba), hitos: ((r.hitos ?? []) as Fila[]).map((h): HitoVista => ({ estado: String(h.estado) as HitoVista['estado'], en: String(h.en) })), deuda: deuda(r.deuda) }
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
  async responderEntrega(pedido: string, ruc: string, valor: ValorCarita, ip: string): Promise<RespuestaCarita> {
    try {
      const { data, error } = await rpc('seguimiento_responder', { p_pedido: pedido, p_ruc: ruc, p_valor: valor, p_ip: ip })
      if (error) return { estado: 'ERROR' }
      const r = (data ?? {}) as Fila
      if (r.estado === 'ESPERA') return { estado: 'ESPERA', esperaSegundos: Number(r.espera_segundos ?? 60) }
      return { estado: (['OK', 'YA_RESPONDIDA', 'AUN_NO', 'NO_ENCONTRADO', 'NO_DISPONIBLE'].includes(String(r.estado)) ? String(r.estado) : 'ERROR') as 'OK' }
    } catch { return { estado: 'ERROR' } }
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

  async listarContactosVendedores(): Promise<ContactoVendedorVista[]> {
    const filas = await traerTodo('contactos_vendedores', 'wms', 'id, nombre, telefono, actualizado_en', ['nombre'])
    return filas.map((f) => ({ id: String(f.id), nombre: String(f.nombre), telefono: String(f.telefono), actualizadoEn: String(f.actualizado_en) })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }
  async guardarContactoVendedor(nombre: string, telefono: string, _a: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const { data, error } = await rpc('guardar_contacto_vendedor', { p_nombre: nombre, p_telefono: telefono })
    return error ? { ok: false, mensaje: mensajeHumano(error) } : { ok: true, id: String(data) }
  }
  async cargarContactosVendedores(filas: { nombre: string; telefono: string }[], _a: Actor): Promise<ResultadoAccion<{ guardados: number; errores: ErrorFilaContacto[] }>> {
    const { data, error } = await rpc('cargar_contactos_vendedores', { p_filas: filas })
    if (error) return { ok: false, mensaje: mensajeHumano(error) }
    const r = (data ?? {}) as Fila
    return { ok: true, guardados: Number(r.guardados ?? 0), errores: ((r.errores ?? []) as Fila[]).map((e): ErrorFilaContacto => ({ fila: Number(e.fila), nombre: String(e.nombre ?? ''), motivo: String(e.motivo) })) }
  }
  async opcionesSeguimiento(): Promise<OpcionesSeguimiento> {
    const filas = await traerTodo('parametros', 'wms')
    const v = (clave: string) => s(filas.find((f) => f.clave === clave)?.valor)
    return {
      rutaVisible: (v('seguimiento_ruta_visible') ?? 'true') === 'true', guiaVisible: (v('seguimiento_guia_visible') ?? 'SIEMPRE').toUpperCase() === 'DESPUES_ENTREGA' ? 'DESPUES_ENTREGA' : 'SIEMPRE',
whatsappPrueba: v('seguimiento_whatsapp_prueba') ?? OPCIONES_POR_DEFECTO.whatsappPrueba, baseUrl: v('seguimiento_base_url') ?? OPCIONES_POR_DEFECTO.baseUrl,
    }
  }
  async guardarOpcionSeguimiento(clave: ClaveOpcionSeguimiento, valor: string, _a: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('guardar_opcion_seguimiento', { p_clave: clave, p_valor: valor })
    return error ? { ok: false, mensaje: mensajeHumano(error) } : { ok: true }
  }
}
void TEXTO_NO_DISPONIBLE
