'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import type { PedidoDescartado } from '@/domain/pedidos-despacho'
import type { Actor, ResultadoAccion } from '@/services/repositorio'

async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}

export interface ResumenActualizacion { nuevos: number; nuevasVersiones: number; iguales: number; antiguas: number; descartados: PedidoDescartado[] }

/** Trae los pedidos listos de Pedidos y guarda lo nuevo. Si Pedidos no responde, devuelve el motivo y la bandeja sigue con lo ya importado. */
export async function actualizarBandejaAccion(): Promise<ResultadoAccion<{ resumen: ResumenActualizacion }>> {
  return repositorio().actualizarBandeja(await quien())
}

export async function revisarCambioPedidoAccion(pedidoId: string): Promise<ResultadoAccion> {
  return repositorio().revisarCambioPedido(pedidoId, await quien())
}
