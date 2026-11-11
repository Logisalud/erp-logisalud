import 'server-only'
import { filasDeStock, type Panorama } from '@/domain/panorama'
import type { CajaSaldo } from '@/domain/rotulos'

/** Las cajas que se pueden rotular: un lote con stock en un estado sanitario (se suman sus posiciones). */
export function cajasSaldoDe(p: Panorama): CajaSaldo[] {
  const m = new Map<string, CajaSaldo>()
  for (const f of filasDeStock(p)) {
    const clave = `${f.lote.id}:${f.saldo.estado}`
    const previa = m.get(clave)
    if (previa) { previa.cantidad += f.saldo.cantidad; continue }
    m.set(clave, {
      clave, loteId: f.lote.id, estado: f.saldo.estado, productoId: f.producto.id, productoCodigo: f.producto.codigo, producto: f.producto.descripcion, presentacion: f.producto.presentacion,
      registroSanitario: f.producto.reg?.registroSanitario, lote: f.lote.codigo, vence: f.lote.vence, venceTexto: f.lote.venceTexto, propietario: f.propietario.razonSocial ?? f.propietario.codigo, cantidad: f.saldo.cantidad,
    })
  }
  return [...m.values()].sort((a, b) => a.producto.localeCompare(b.producto, 'es') || (a.vence ?? '').localeCompare(b.vence ?? '') || a.lote.localeCompare(b.lote))
}
