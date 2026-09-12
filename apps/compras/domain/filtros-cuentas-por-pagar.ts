/**
 * Cómo se traducen los searchParams de /cuentas-por-pagar a un filtro de
 * estados. Puro: sin Next, sin Supabase.
 *
 * Vive acá y no dentro de la página porque el botón "Exportar a Excel"
 * (Pieza 1, Mariela 2026-09-12) tiene que bajar EXACTAMENTE lo que hay en
 * pantalla. Con la lógica duplicada en la ruta de descarga, cualquier
 * cambio de filtro dejaría el Excel mintiendo en silencio — que es peor que
 * no tener el botón.
 */

import { ESTADOS_OBLIGACION, type EstadoObligacion } from './obligacion'
import {
  CATEGORIAS_ESTADO, estadosDeCategoria, estadosVisiblesPorDefecto,
  type CategoriaEstado,
} from './categorias-estado-obligacion'

export type ParamsCuentasPorPagar = {
  estado?: string
  categoria?: string
  listas?: string
  avanzado?: string
}

export type FiltroCuentasPorPagar = {
  estadoExacto: EstadoObligacion | undefined
  categoria: CategoriaEstado | undefined
  /** "Listas para pagar" no es un estado: es estar en una propuesta YA
   * aprobada y sin pagar, así que se resuelve después de traer las filas. */
  soloListas: boolean
  verAvanzado: boolean
  /** `undefined` = sin filtro de estado en la consulta (el caso de `soloListas`). */
  estados: EstadoObligacion | readonly EstadoObligacion[] | undefined
  sinFiltro: boolean
}

export function resolverFiltroCuentasPorPagar(
  params: ParamsCuentasPorPagar
): FiltroCuentasPorPagar {
  const estadoExacto = ESTADOS_OBLIGACION.includes(params.estado as EstadoObligacion)
    ? (params.estado as EstadoObligacion)
    : undefined
  const categoria = CATEGORIAS_ESTADO.includes(params.categoria as CategoriaEstado)
    ? (params.categoria as CategoriaEstado)
    : undefined
  const soloListas = params.listas === '1'

  return {
    estadoExacto,
    categoria,
    soloListas,
    verAvanzado: params.avanzado === '1' || !!estadoExacto,
    estados: soloListas
      ? undefined
      : estadoExacto
        ? estadoExacto
        : categoria
          ? estadosDeCategoria(categoria)
          : estadosVisiblesPorDefecto(),
    sinFiltro: !soloListas && !estadoExacto && !categoria,
  }
}

/** El querystring con el que la descarga reproduce la vista actual. */
export function querystringDeFiltro(filtro: FiltroCuentasPorPagar): string {
  if (filtro.soloListas) return '?listas=1'
  if (filtro.estadoExacto) return `?estado=${filtro.estadoExacto}`
  if (filtro.categoria) return `?categoria=${filtro.categoria}`
  return ''
}

/** Cómo se llama el recorte en el nombre del archivo y en el título de la hoja. */
export function nombreDelRecorte(filtro: FiltroCuentasPorPagar): string {
  if (filtro.soloListas) return 'listas-para-pagar'
  if (filtro.estadoExacto) return filtro.estadoExacto
  if (filtro.categoria) return filtro.categoria
  return 'todas'
}
