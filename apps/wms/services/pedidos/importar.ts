import 'server-only'

import { validarPedidos, type PedidoDescartado, type PedidoSnapshot } from '@/domain/pedidos-despacho'
import type { FuentePedidos } from './fuente-pedidos'

export type PedidosTraidos =
  | { ok: true; pedidos: PedidoSnapshot[]; descartados: PedidoDescartado[]; origen: string; entregados: number; ultimoNumero?: string; totalEnPedidos?: number }
  | { ok: false; mensaje: string; origen: string }

/** Pide los pedidos a la fuente y los valida contra el contrato (un pedido malo se descarta con su motivo, no tumba a los demás). */
export async function traerPedidos(fuente: FuentePedidos): Promise<PedidosTraidos> {
  const r = await fuente.listarListos()
  if (!r.ok) return { ok: false, mensaje: r.mensaje, origen: fuente.origen }
  const v = validarPedidos(r.pedidos)
  const entregados = Array.isArray(r.pedidos) ? r.pedidos.length : 0
  const numeros = v.pedidos.map((p) => Number(p.numero)).filter((n) => Number.isFinite(n))
  return { ok: true, pedidos: v.pedidos, descartados: v.descartados, origen: fuente.origen, entregados, ultimoNumero: numeros.length ? String(Math.max(...numeros)) : undefined, totalEnPedidos: r.totalListos }
}
