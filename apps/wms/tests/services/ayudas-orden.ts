// Ayudas de las pruebas de demostración para el flujo nuevo de la Orden de Salida: se indica quién pica, la conformidad cubre toda la orden y registra los bultos.
import type { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

/** Las personas de prueba que pueden pickear usan el id de sus claves reales (`demo:auxiliar`, …). */
export const actorDemo = (clave: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${clave}`, nombre: `${clave} (demo)`, roles })

/** Marca una Orden de Salida como «a provincia» (se embala): el pedido 101 de la demostración va a Lima y queda con los bultos de la conformidad. */
export function aProvincia(salidaId: string) {
  const e = (globalThis as { __wmsDemo?: { desp?: { salidas: { id: string; requiereEmbalaje: boolean }[] } } }).__wmsDemo
  const s = e?.desp?.salidas.find((x) => x.id === salidaId)
  if (!s) throw new Error('La Orden de Salida no existe todavía')
  s.requiereEmbalaje = true
}

/** Imprime la orden (con quien pica), y otra persona da la conformidad de toda la orden con `bultos` bultos. Devuelve la orden. */
export async function imprimirYConformar(repo: RepositorioDemo, salidaId: string, o: { jt: Actor; picker: Actor; conforme: Actor; bultos?: number; conformar?: boolean }) {
  const g = await repo.generarOrdenPicking(salidaId, o.jt, o.picker.id)
  if (!g.ok) throw new Error(g.mensaje)
  const orden = (await repo.obtenerOrdenPicking(g.id))!
  if (o.conformar !== false) {
    const c = await repo.conformarOrden(orden.id, [], o.bultos ?? 2, undefined, o.conforme)
    if (!c.ok) throw new Error(c.mensaje)
  }
  return orden
}
