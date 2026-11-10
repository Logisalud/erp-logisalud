// Código de bonificación (BO…): el mismo producto con otro código. Compras guarda el vínculo en el producto NORMAL (`codigo_bonificacion` = el código BO).
// Una sola ficha regulatoria: el BO hereda la del producto normal (D-213). Funciones puras: las usan la lista, el contador, la ficha y los dos repositorios.
import type { Regulatorio } from './tipos'

export interface ProductoBonificable { id: string; codigo: string; codigoBonificacion?: string }

export interface VinculosBonificacion<T extends ProductoBonificable> {
  /** BO → su producto normal */
  baseDe: ReadonlyMap<string, T>
  /** producto normal → su BO */
  bonificacionDe: ReadonlyMap<string, T>
}

/** Pares producto normal ↔ BO, leídos del vínculo de Compras. Un vínculo roto (el BO no existe), o un BO que se ligue a sí mismo, no forma par. */
export function vinculosBonificacion<T extends ProductoBonificable>(productos: readonly T[]): VinculosBonificacion<T> {
  const porCodigo = new Map(productos.map((p) => [p.codigo, p]))
  const baseDe = new Map<string, T>()
  const bonificacionDe = new Map<string, T>()
  for (const base of productos) {
    const codigo = base.codigoBonificacion?.trim()
    if (!codigo || codigo === base.codigo) continue
    const bo = porCodigo.get(codigo)
    if (!bo || bo.id === base.id || baseDe.has(bo.id)) continue
    baseDe.set(bo.id, base)
    bonificacionDe.set(base.id, bo)
  }
  return { baseDe, bonificacionDe }
}

/** El BO toma los datos regulatorios de su producto normal (con su propio `productoId`). Un producto sin par queda igual. */
export function heredarBonificacion<T extends ProductoBonificable & { reg?: Regulatorio }>(productos: readonly T[]): T[] {
  const { baseDe } = vinculosBonificacion(productos)
  return productos.map((p) => {
    const base = baseDe.get(p.id)
    if (!base) return p
    return { ...p, reg: base.reg ? { ...base.reg, productoId: p.id } : undefined }
  })
}

/** Productos que se muestran como pendientes: sin los BO que tienen producto normal (se completan una sola vez, en el normal). */
export function sinGemelosBonificacion<T extends ProductoBonificable>(productos: readonly T[]): T[] {
  const { baseDe } = vinculosBonificacion(productos)
  return productos.filter((p) => !baseDe.has(p.id))
}
