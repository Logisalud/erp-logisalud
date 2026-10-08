import type { FiltroKardex } from '@/domain/inventario'

/** Lee el filtro del Kardex desde la URL (una fecha mal escrita se ignora en vez de romper). */
export function filtroDesdeUrl(p: Record<string, string | undefined>): FiltroKardex | null {
  const productoId = p.producto?.trim()
  if (!productoId) return null
  const fecha = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
  return { productoId, loteId: p.lote?.trim() || undefined, propietarioId: p.propietario?.trim() || undefined, desde: fecha(p.desde), hasta: fecha(p.hasta) }
}

export const consultaDe = (f: FiltroKardex) => {
  const q = new URLSearchParams({ producto: f.productoId })
  if (f.loteId) q.set('lote', f.loteId)
  if (f.propietarioId) q.set('propietario', f.propietarioId)
  if (f.desde) q.set('desde', f.desde)
  if (f.hasta) q.set('hasta', f.hasta)
  return q.toString()
}
