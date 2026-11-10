// Reglas que dependen del MOTIVO de un movimiento interno. Hoy una sola: «Salida de Cuarentena».
//   · El origen es una ubicación de Cuarentena (ahí se queda el stock después de aprobarse, hasta que se acomoda en su rack).
//   · El destino es una ubicación de Aprobados; como Aprobados es exclusiva, el propietario del lote es el dueño de la ubicación.
// La base de datos aplica la misma regla en `wms.ejecutar_movimiento` (migración 0037) y usa estos mismos textos.
import { normalizar } from './busqueda'
import type { TipoArea } from './tipos'

export const MOTIVO_SALIDA_CUARENTENA = 'Salida de Cuarentena'

/** ¿Es ese motivo? No distingue mayúsculas, tildes ni espacios de más. */
export const esSalidaDeCuarentena = (motivo?: string | null): boolean =>
  !!motivo && normalizar(motivo).replace(/\s+/g, ' ') === 'salida de cuarentena'

export const MENSAJE_ORIGEN_SALIDA_CUARENTENA = 'Con el motivo «Salida de Cuarentena» solo se mueve lo que está en una ubicación de Cuarentena'
export const MENSAJE_DESTINO_SALIDA_CUARENTENA = 'Con el motivo «Salida de Cuarentena» el destino es una ubicación de Aprobados'

/** Por qué ese origen no sirve con el motivo (null = sirve o el motivo no pide nada). */
export function razonOrigenPorMotivo(motivo: string | null | undefined, areaOrigen: TipoArea): string | null {
  return esSalidaDeCuarentena(motivo) && areaOrigen !== 'CUARENTENA' ? MENSAJE_ORIGEN_SALIDA_CUARENTENA : null
}

/** Por qué ese destino no sirve con el motivo (null = sirve o el motivo no pide nada). */
export function razonDestinoPorMotivo(motivo: string | null | undefined, areaDestino: TipoArea): string | null {
  return esSalidaDeCuarentena(motivo) && areaDestino !== 'APROBADOS' ? MENSAJE_DESTINO_SALIDA_CUARENTENA : null
}

/** Las celdas de origen que el motivo permite (sin motivo especial, todas). */
export function celdasParaMotivo<T extends { tipoArea?: TipoArea }>(celdas: T[], motivo: string | null | undefined): T[] {
  return esSalidaDeCuarentena(motivo) ? celdas.filter((c) => c.tipoArea === 'CUARENTENA') : celdas
}
