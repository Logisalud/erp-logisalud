'use server'

import { headers } from 'next/headers'
import { ipDe, normalizarPedido, normalizarRuc, TEXTO_ERROR, validarConsulta, type RespuestaSeguimiento } from '@/domain/seguimiento'
import { repositorio } from '@/services/repositorio-actual'

export interface EstadoConsulta { respuesta?: RespuestaSeguimiento; errores?: { pedido?: string; ruc?: string }; pedido?: string }

const ipActual = () => { const h = headers(); return ipDe(h.get('x-forwarded-for'), h.get('x-real-ip')) }

/** La consulta pública: número de pedido y RUC. Sin sesión; el límite de intentos y «no revelar si existe» los aplica la base. */
export async function consultarSeguimientoAccion(_previo: EstadoConsulta, f: FormData): Promise<EstadoConsulta> {
  const pedido = String(f.get('pedido') ?? ''); const ruc = String(f.get('ruc') ?? '')
  const errores = validarConsulta(pedido, ruc)
  if (errores.pedido || errores.ruc) return { errores, pedido }
  try { return { respuesta: await repositorio().consultarSeguimiento(normalizarPedido(pedido), normalizarRuc(ruc), ipActual()), pedido } } catch { return { respuesta: { estado: 'ERROR' }, pedido } }
}
void TEXTO_ERROR
