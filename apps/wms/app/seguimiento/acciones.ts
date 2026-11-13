'use server'

import { headers } from 'next/headers'
import { ipDe, normalizarPedido, normalizarRuc, TEXTO_ERROR, validarConsulta, type RespuestaCarita, type RespuestaSeguimiento, type ValorCarita } from '@/domain/seguimiento'
import { repositorio } from '@/services/repositorio-actual'

export interface EstadoConsulta { respuesta?: RespuestaSeguimiento; errores?: { pedido?: string; ruc?: string }; pedido?: string; ruc?: string }

const ipActual = () => { const h = headers(); return ipDe(h.get('x-forwarded-for'), h.get('x-real-ip')) }

/** La consulta pública: número de pedido y RUC. Sin sesión; el límite de intentos y «no revelar si existe» los aplica la base. */
export async function consultarSeguimientoAccion(_previo: EstadoConsulta, f: FormData): Promise<EstadoConsulta> {
  const pedido = String(f.get('pedido') ?? ''); const ruc = String(f.get('ruc') ?? '')
  const errores = validarConsulta(pedido, ruc)
  if (errores.pedido || errores.ruc) return { errores, pedido, ruc }
  try { return { respuesta: await repositorio().consultarSeguimiento(normalizarPedido(pedido), normalizarRuc(ruc), ipActual()), pedido, ruc } } catch { return { respuesta: { estado: 'ERROR' }, pedido, ruc } }
}

/** La actualización automática de la pantalla (cada pocos segundos mientras está visible). El mismo acceso y el mismo límite que la consulta; los aciertos no cuentan como fallos. */
export async function refrescarSeguimientoAccion(pedido: string, ruc: string): Promise<RespuestaSeguimiento> {
  if (validarConsulta(pedido, ruc).pedido || validarConsulta(pedido, ruc).ruc) return { estado: 'NO_ENCONTRADO' }
  try { return await repositorio().consultarSeguimiento(normalizarPedido(pedido), normalizarRuc(ruc), ipActual()) } catch { return { estado: 'ERROR' } }
}
export async function refrescarPorTokenAccion(token: string): Promise<RespuestaSeguimiento> {
  try { return await repositorio().consultarSeguimientoPorToken(String(token).slice(0, 200), ipActual()) } catch { return { estado: 'ERROR' } }
}

/** «¿Cómo fue tu entrega?»: una respuesta por pedido entregado. Pedido + RUC, como la consulta; la base aplica el límite y no distingue si el pedido existe. */
export async function responderEntregaAccion(pedido: string, ruc: string, valor: number): Promise<RespuestaCarita> {
  if (![1, 2, 3].includes(valor) || validarConsulta(pedido, ruc).pedido || validarConsulta(pedido, ruc).ruc) return { estado: 'ERROR' }
  try { return await repositorio().responderEntrega(normalizarPedido(pedido), normalizarRuc(ruc), valor as ValorCarita, ipActual()) } catch { return { estado: 'ERROR' } }
}
void TEXTO_ERROR
