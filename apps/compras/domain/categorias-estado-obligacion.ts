/**
 * Categorías generales de estado para el listado de Cuentas por Pagar.
 * Puro: sin Next, sin Supabase.
 *
 * Los 10 estados técnicos de una obligación son precisos y necesarios en la
 * fila, pero como filtro rápido son demasiados: nadie escanea 10 chips para
 * encontrar "lo que falta pagar". Acá se agrupan en 6 categorías de negocio.
 *
 * La precisión NO se pierde: el filtro agrupa, pero cada fila sigue
 * mostrando su estado exacto vía ETIQUETA_ESTADO, y queda el acceso a los
 * 10 chips originales para quien necesite el detalle técnico.
 *
 * Sobre 'pagada' y 'cerrada' juntas: hoy 'cerrada' es un estado MUERTO en
 * obligaciones — está en el tipo, en el CHECK y en las transiciones
 * (pagada → cerrada), pero ningún código la escribe, y `obligacionPagada()`
 * ya trata a las dos igual. Separarlas en el filtro ofrecería una categoría
 * que nunca tendría filas. Queda anotado en CONTEXTO.md si 'cerrada' se
 * implementa de verdad o se elimina del modelo.
 */

import { ETIQUETA_ESTADO, type EstadoObligacion } from './obligacion'

export const CATEGORIAS_ESTADO = [
  'por_completar',
  'en_revision',
  'en_camino_a_pago',
  'pagada',
  'en_cuotas',
  'no_procede',
] as const
export type CategoriaEstado = (typeof CATEGORIAS_ESTADO)[number]

export const ETIQUETA_CATEGORIA: Record<CategoriaEstado, string> = {
  por_completar: 'Por completar',
  en_revision: 'En revisión',
  en_camino_a_pago: 'Lista para pagar / En proceso',
  pagada: 'Pagada',
  en_cuotas: 'Convertida en cuotas',
  no_procede: 'No procede',
}

const ESTADOS_POR_CATEGORIA: Record<CategoriaEstado, readonly EstadoObligacion[]> = {
  por_completar: ['pendiente_factura'],
  en_revision: ['registrada', 'observada'],
  en_camino_a_pago: ['conforme', 'en_propuesta'],
  pagada: ['pagada', 'cerrada'],
  en_cuotas: ['canjeada_por_letra'],
  no_procede: ['rechazada', 'anulada'],
}

export function estadosDeCategoria(categoria: CategoriaEstado): readonly EstadoObligacion[] {
  return ESTADOS_POR_CATEGORIA[categoria]
}

export function categoriaDeEstado(estado: EstadoObligacion): CategoriaEstado {
  for (const categoria of CATEGORIAS_ESTADO) {
    if (ESTADOS_POR_CATEGORIA[categoria].includes(estado)) return categoria
  }
  // Inalcanzable mientras el Record cubra los 10 estados — que TypeScript
  // exige. Si mañana se agrega un estado al enum, el compilador obliga a
  // ponerlo en una categoría antes de que esto pueda devolver algo raro.
  return 'en_revision'
}

/**
 * Lo rechazado y lo anulado no es trabajo: por defecto no ensucia la sábana.
 * Tiene su propio chip para verlo cuando hace falta — no se esconde, se saca
 * del camino.
 */
export const CATEGORIAS_VISIBLES_POR_DEFECTO: readonly CategoriaEstado[] = CATEGORIAS_ESTADO.filter(
  (c) => c !== 'no_procede'
)

export function estadosVisiblesPorDefecto(): EstadoObligacion[] {
  return CATEGORIAS_VISIBLES_POR_DEFECTO.flatMap((c) => [...estadosDeCategoria(c)])
}

/** El texto exacto de la fila — la categoría es del filtro, no de la fila. */
export function etiquetaExactaDeEstado(estado: EstadoObligacion): string {
  return ETIQUETA_ESTADO[estado]
}

/**
 * ¿Está vencida? Solo cuenta como vencida si todavía hay algo que pagar: una
 * obligación ya pagada con fecha pasada no es una alerta, y pintarla de rojo
 * entrenaría a ignorar el color.
 */
export function estaVencida(
  fechaVencimiento: string | null,
  estado: EstadoObligacion,
  hoyISO: string
): boolean {
  if (!fechaVencimiento) return false
  const categoria = categoriaDeEstado(estado)
  if (categoria === 'pagada' || categoria === 'no_procede' || categoria === 'en_cuotas') return false
  return fechaVencimiento < hoyISO
}
