// Cuando llega la versión nueva de un pedido (o su cancelación), la Orden de Salida se actualiza sola (SA-3, D-127 y D-128).
// Puro: calcula QUÉ cambió por línea, DE DÓNDE se libera lo que sobra y cómo se cuenta. La demo y `wms._aplicar_cambio_pedido` (0029) hacen lo mismo.
// Regla de oro: nunca hay pendientes ni backorders. Lo que Pedidos quita o reduce se cancela; el WMS no cambia cantidades de un pedido de Pedidos.
import type { LineaPedido } from './pedidos-despacho'

export type TipoCambioLinea = 'QUITADA' | 'REDUCIDA' | 'AUMENTADA' | 'AGREGADA'

export interface CambioLinea {
  tipo: TipoCambioLinea
  lineaId: string
  productoCodigo: string
  descripcion: string
  /** Cantidad que tenía la línea (0 si es nueva). */
  antes: number
  /** Cantidad que tiene ahora (0 si se quitó). */
  despues: number
}

/** Qué pasó con cada línea entre la versión vigente y la nueva. Las que no cambian no aparecen. Orden: quitadas, reducidas, aumentadas, agregadas. */
export function diferenciasDeLineas(anterior: readonly LineaPedido[], nuevo: readonly LineaPedido[]): CambioLinea[] {
  const antes = new Map(anterior.map((l) => [l.lineaId, l]))
  const despues = new Map(nuevo.map((l) => [l.lineaId, l]))
  const quitadas: CambioLinea[] = [], reducidas: CambioLinea[] = [], aumentadas: CambioLinea[] = [], agregadas: CambioLinea[] = []
  for (const a of anterior) if (!despues.has(a.lineaId)) quitadas.push({ tipo: 'QUITADA', lineaId: a.lineaId, productoCodigo: a.productoCodigo, descripcion: a.descripcion, antes: a.cantidad, despues: 0 })
  for (const n of nuevo) {
    const a = antes.get(n.lineaId)
    if (!a) agregadas.push({ tipo: 'AGREGADA', lineaId: n.lineaId, productoCodigo: n.productoCodigo, descripcion: n.descripcion, antes: 0, despues: n.cantidad })
    else if (n.cantidad < a.cantidad) reducidas.push({ tipo: 'REDUCIDA', lineaId: n.lineaId, productoCodigo: n.productoCodigo, descripcion: n.descripcion, antes: a.cantidad, despues: n.cantidad })
    else if (n.cantidad > a.cantidad) aumentadas.push({ tipo: 'AUMENTADA', lineaId: n.lineaId, productoCodigo: n.productoCodigo, descripcion: n.descripcion, antes: a.cantidad, despues: n.cantidad })
  }
  return [...quitadas, ...reducidas, ...aumentadas, ...agregadas]
}

export const textoCambioLinea = (c: CambioLinea): string => {
  switch (c.tipo) {
    case 'QUITADA': return `se quitó ${c.descripcion} (${c.antes} u.)`
    case 'REDUCIDA': return `se redujo ${c.descripcion} de ${c.antes} a ${c.despues}`
    case 'AUMENTADA': return `se aumentó ${c.descripcion} de ${c.antes} a ${c.despues}`
    case 'AGREGADA': return `se agregó ${c.descripcion} (${c.despues} u.)`
  }
}

/** Una reserva de stock de una línea, tal como la ve la regla (sin saber si viene de la demo o de la base). */
export interface ReservaParaLiberar {
  id: string
  /** Vencimiento del lote (AAAA-MM-DD); sin fecha cuenta como el último en vencer. */
  vence: string | null
  cantidad: number
  /** ACTIVA = todavía en el rack, nadie la picó. EN_TRANSITO = ya picada (sale del rack con la conformidad). EN_STAGING = ya conforme, en Despacho. */
  estado: 'ACTIVA' | 'EN_TRANSITO' | 'EN_STAGING'
}

export interface PorcionALiberar {
  reservaId: string
  /** Cuántas unidades de esa reserva se sueltan. Si es menos que la reserva, la reserva se parte en dos. */
  cantidad: number
  /** LIBERAR: nadie la había picado, vuelve al stock libre. DEVOLVER: ya estaba picada o en Despacho: hay que devolverla a su ubicación con un movimiento verificado. */
  accion: 'LIBERAR' | 'DEVOLVER'
  /** ¿Se suelta toda la reserva (true) o solo una parte (false: se parte)? */
  completa: boolean
}

const finDeFila = '9999-12-31'

/**
 * De dónde sale lo que sobra cuando una línea baja de cantidad (o se quita). Se suelta primero lo que nadie picó y, dentro de cada grupo, lo que vence DESPUÉS:
 * así lo que queda sigue siendo la asignación FEFO de la cantidad nueva. Lo ya picado se suelta solo si hace falta, y exige devolución verificada.
 */
export function repartirLiberacion(reservas: readonly ReservaParaLiberar[], aLiberar: number): PorcionALiberar[] {
  if (aLiberar <= 0) return []
  const rango = (r: ReservaParaLiberar) => (r.estado === 'ACTIVA' ? 0 : r.estado === 'EN_TRANSITO' ? 1 : 2)
  const orden = [...reservas].sort((a, b) => rango(a) - rango(b) || (b.vence ?? finDeFila).localeCompare(a.vence ?? finDeFila) || a.id.localeCompare(b.id))
  const out: PorcionALiberar[] = []
  let resto = aLiberar
  for (const r of orden) {
    if (resto <= 0) break
    const t = Math.min(r.cantidad, resto)
    out.push({ reservaId: r.id, cantidad: t, accion: r.estado === 'ACTIVA' ? 'LIBERAR' : 'DEVOLVER', completa: t === r.cantidad })
    resto -= t
  }
  return out
}

export interface ResumenAplicacion {
  numeroPedido: string
  cambios: readonly CambioLinea[]
  /** Unidades que dejaron de estar reservadas (stock libre otra vez). */
  liberadas: number
  /** Unidades ya picadas o en Despacho que hay que devolver a su ubicación. */
  porDevolver: number
  /** Líneas que antes faltaban y ahora alcanzan. */
  yaNoFalta: number
  /** Líneas que siguen (o quedaron) sin stock suficiente. */
  conFalta: number
  /** El pedido pasó a «Cancelado en Pedidos». */
  cancelado?: { motivo: string; por?: string }
  /** Ya salió o está cargada: no se toca, se avisa. */
  yaSalio?: boolean
  /** La hoja de picking ya estaba impresa: cambió y hay que volver a imprimirla. */
  hojaImpresa?: boolean
}

/** La alerta para el Jefe de Transporte: «El pedido PED-… cambió: se quitó X; se liberaron N unidades.» */
export function textoAlertaCambio(r: ResumenAplicacion): string {
  if (r.cancelado) {
    return `El pedido ${r.numeroPedido} se canceló en Pedidos${r.cancelado.motivo ? `: ${r.cancelado.motivo}` : ''}.`
      + (r.yaSalio ? ' La orden ya salió: coordina el retorno con el transportista.'
        : r.porDevolver > 0 ? ` La orden se cancela cuando se devuelvan y verifiquen las ${r.porDevolver} unidades ya picadas${r.liberadas ? `; se liberaron ${r.liberadas} unidades` : ''}.`
        : ` Se canceló la orden y se liberaron ${r.liberadas} unidades.`)
  }
  const partes = r.cambios.map(textoCambioLinea)
  let t = `El pedido ${r.numeroPedido} cambió`
  if (partes.length) t += `: ${partes.join('; ')}`
  if (r.liberadas > 0) t += `; se liberaron ${r.liberadas} unidades`
  t += '.'
  if (r.porDevolver > 0) t += ` Hay ${r.porDevolver} unidades ya picadas que se devuelven a su ubicación: otra persona lo verifica antes de seguir.`
  if (r.yaNoFalta > 0 && r.conFalta === 0) t += ' Ya no falta stock: la orden sigue su flujo.'
  else if (r.conFalta > 0) t += ' Todavía falta stock en alguna línea: el vendedor decide en Pedidos.'
  if (r.hojaImpresa) t += ' Vuelve a imprimir la hoja de picking.'
  return t
}
