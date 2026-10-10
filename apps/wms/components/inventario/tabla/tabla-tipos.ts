import type { CeldaDeProducto, LineaParaChequear } from '@/domain/inventario'
import type { LineaForm } from './tipos'
import type { LineaCalculada, useMovimientoTabla } from './usar-movimiento-tabla'

export type { LineaCalculada }
/** Lo que el hook `useMovimientoTabla` ofrece a la tabla y a las filas del teléfono. */
export type usarMovimientoTablaTipo = ReturnType<typeof useMovimientoTabla> & {
  /** Lo disponible de verdad en una celda para ESTA línea (descontando lo que otras líneas sacan de la misma celda). */
  libreDe: (lineaId: number, c: CeldaDeProducto) => number
  /** La línea como la valida el servidor al elegir su destino. */
  comoChequeo: (l: LineaForm) => LineaParaChequear
}
