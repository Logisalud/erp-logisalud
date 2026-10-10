// Unidades «en tránsito, por verificar»: ya salieron de su origen (están reservadas) y todavía no las verificó otra persona en el destino.
// El stock no cambia hasta la verificación; esto solo lo hace visible donde la gente mira (mapa, buscador, ubicación y lote).
import type { OrdenMovimiento } from './inventario'

export interface LineaTransito { orden: string; ordenId: string; loteId: string; desdePosicionId: string; desde: string; haciaPosicionId: string; hacia: string; cantidad: number }
export interface TransitoPosicion { salen: number; llegan: number; lineas: LineaTransito[] }

const abierta = (o: OrdenMovimiento) => o.estado === 'EJECUTADO' || o.estado === 'CON_DIFERENCIA'

/** Las líneas de movimientos abiertos que aún no están verificadas como confirmadas. */
export function lineasEnTransito(ordenes: OrdenMovimiento[]): LineaTransito[] {
  const out: LineaTransito[] = []
  for (const o of ordenes) {
    if (!abierta(o)) continue
    for (const l of o.lineas) {
      if (l.verificacion !== 'PENDIENTE' && l.verificacion !== 'CON_DIFERENCIA') continue
      out.push({ orden: o.numero, ordenId: o.id, loteId: l.loteId, desdePosicionId: l.desdePosicionId, desde: l.desde, haciaPosicionId: l.haciaPosicionId, hacia: l.hacia, cantidad: l.cantidad })
    }
  }
  return out
}

/** Por posición: cuántas unidades salen de ella y cuántas llegan a ella, todavía por verificar. */
export function transitoPorPosicion(ordenes: OrdenMovimiento[]): Map<string, TransitoPosicion> {
  const m = new Map<string, TransitoPosicion>()
  const de = (id: string) => m.get(id) ?? (m.set(id, { salen: 0, llegan: 0, lineas: [] }), m.get(id)!)
  for (const l of lineasEnTransito(ordenes)) {
    const o = de(l.desdePosicionId); o.salen += l.cantidad; o.lineas.push(l)
    const d = de(l.haciaPosicionId); d.llegan += l.cantidad; d.lineas.push(l)
  }
  return m
}

/** Por lote: unidades en tránsito y los movimientos que las llevan. */
export function transitoPorLote(ordenes: OrdenMovimiento[]): Map<string, { unidades: number; lineas: LineaTransito[] }> {
  const m = new Map<string, { unidades: number; lineas: LineaTransito[] }>()
  for (const l of lineasEnTransito(ordenes)) {
    const x = m.get(l.loteId) ?? { unidades: 0, lineas: [] }
    x.unidades += l.cantidad; x.lineas.push(l); m.set(l.loteId, x)
  }
  return m
}

export const textoTransito = (unidades: number) => `${unidades.toLocaleString('es-PE')} u en tránsito, por verificar`

/** Lo que se dice de una posición: «60 u en tránsito, por verificar · salen hacia B-2 / llegan de A-1». */
export function descripcionTransitoPosicion(t: Pick<TransitoPosicion, 'salen' | 'llegan'>): string {
  const partes: string[] = []
  if (t.salen > 0) partes.push(`${textoTransito(t.salen)} (salen)`)
  if (t.llegan > 0) partes.push(`${textoTransito(t.llegan)} (llegan)`)
  return partes.join(' · ')
}
