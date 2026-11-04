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
  /** Lo que se escribió en el buscador (proveedor, RUC, código, factura). */
  q?: string
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
  /** Texto a buscar, ya limpio; null si no se buscó nada. Se combina con el
   * chip elegido: "DIMEXA" dentro de "Pagada" es DIMEXA pagada. */
  busqueda: string | null
}

/**
 * El texto del buscador, listo para un `ilike` de PostgREST: sin los
 * caracteres que esa sintaxis usa para separar o agrupar condiciones (`,`
 * `(` `)`) ni comodines que el usuario no quiso poner. Menos de 2 letras no
 * busca: traería media base.
 */
export function limpiarBusqueda(q: string | undefined | null): string | null {
  const limpio = (q ?? '').replace(/[,()%*\\"']/g, ' ').replace(/\s+/g, ' ').trim()
  return limpio.length >= 2 ? limpio.slice(0, 60) : null
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
    busqueda: limpiarBusqueda(params.q),
  }
}

/** El querystring con el que la descarga reproduce la vista actual. */
export function querystringDeFiltro(filtro: FiltroCuentasPorPagar): string {
  const params = new URLSearchParams()
  if (filtro.soloListas) params.set('listas', '1')
  else if (filtro.estadoExacto) params.set('estado', filtro.estadoExacto)
  else if (filtro.categoria) params.set('categoria', filtro.categoria)
  if (filtro.busqueda) params.set('q', filtro.busqueda)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** Cómo se llama el recorte en el nombre del archivo y en el título de la hoja. */
export function nombreDelRecorte(filtro: FiltroCuentasPorPagar): string {
  if (filtro.soloListas) return 'listas-para-pagar'
  if (filtro.estadoExacto) return filtro.estadoExacto
  if (filtro.categoria) return filtro.categoria
  return 'todas'
}
