/**
 * Reglas de "aprobar varios juntos" desde Pendientes de aprobar. Puro.
 *
 * El pedido de Mariela era entrar una por una a seis pagos directos. Lo que
 * NO se puede hacer, y por eso esto existe, es un "aprobar todo lo tildado"
 * que cruce tipos:
 *
 *  - Las cinco funciones de aprobar tienen la misma firma (`id => void`),
 *    pero efectos muy distintos: dos cambian un estado, dos CREAN una
 *    obligación (deuda formal) y la de propuesta habilita el desembolso de
 *    un lote entero.
 *  - El módulo NO usa transacciones (cero `supabase.rpc`, ver CONTEXTO.md),
 *    así que un lote de 7 son 7 operaciones independientes. Si la cuarta
 *    falla, las tres primeras ya se aplicaron y no hay rollback.
 *  - Cada tipo lo decide alguien distinto (Contabilidad, el jefe del área,
 *    o los dos según el estado), así que un lote mixto puede fallar a mitad
 *    por permisos.
 *
 * De ahí las dos reglas de abajo: un solo tipo por selección, y las
 * propuestas de pago afuera.
 */

import {
  ETIQUETA_TIPO_PENDIENTE, ETIQUETA_TIPO_PENDIENTE_PLURAL, type TipoPendiente,
} from './pendientes-aprobar'

/**
 * Aprobar una propuesta libera el desembolso de decenas de obligaciones a
 * la vez. Es la firma más grande del módulo y no puede ser un checkbox más
 * entre siete filas — se sigue aprobando desde su pantalla, donde se ve el
 * detalle línea por línea antes de decidir.
 */
export const TIPOS_SIN_LOTE: readonly TipoPendiente[] = ['propuesta']

export function admiteAprobacionEnLote(tipo: TipoPendiente): boolean {
  return !TIPOS_SIN_LOTE.includes(tipo)
}

export const MOTIVO_SIN_LOTE =
  'Una propuesta libera el pago de todas sus obligaciones — se aprueba desde su propia pantalla, con el detalle a la vista.'

/**
 * Tope por lote. Cada aprobación son 2-4 consultas y no hay transacción: un
 * timeout a mitad de 50 filas es el peor escenario posible — parte aplicado,
 * parte no, y sin saber dónde cortó.
 */
export const MAXIMO_POR_LOTE = 20

export type EstadoSeleccion = {
  /** El tipo que "reservó" la selección. Null = no hay nada tildado. */
  tipoActivo: TipoPendiente | null
  elegidas: ReadonlySet<string>
}

/**
 * ¿Se puede tildar esta fila?
 *
 * Devuelve el MOTIVO cuando no, nunca solo `false`: un checkbox apagado sin
 * explicación es de las cosas que más hacen dudar de un sistema.
 */
export function estadoDelCheckbox(
  fila: { tipo: TipoPendiente; id: string },
  seleccion: EstadoSeleccion
): { habilitado: true } | { habilitado: false; motivo: string } {
  if (!admiteAprobacionEnLote(fila.tipo)) {
    return { habilitado: false, motivo: MOTIVO_SIN_LOTE }
  }
  // Ya tildada: siempre se puede destildar.
  if (seleccion.elegidas.has(fila.id)) return { habilitado: true }

  if (seleccion.tipoActivo && seleccion.tipoActivo !== fila.tipo) {
    return {
      habilitado: false,
      motivo: `Selección limitada a un tipo por vez. Destilda lo de "${ETIQUETA_TIPO_PENDIENTE[seleccion.tipoActivo]}" para elegir de este.`,
    }
  }
  if (seleccion.elegidas.size >= MAXIMO_POR_LOTE) {
    return {
      habilitado: false,
      motivo: `Máximo ${MAXIMO_POR_LOTE} por lote — aprueba estos y sigue con el resto.`,
    }
  }
  return { habilitado: true }
}

/**
 * Qué dice el botón: el tipo y la cantidad, nunca "Aprobar seleccionados",
 * que no dice nada sobre lo que está por pasar.
 *
 * El plural sale del catálogo y no de agregarle una "s": "4 Pago Directos"
 * y "3 Orden de Servicios" están mal en español.
 */
export function etiquetaBotonLote(tipo: TipoPendiente | null, cantidad: number): string {
  if (!tipo || cantidad === 0) return 'Aprobar seleccionados'
  const nombre =
    cantidad === 1 ? ETIQUETA_TIPO_PENDIENTE[tipo] : ETIQUETA_TIPO_PENDIENTE_PLURAL[tipo]
  return `Aprobar ${cantidad} ${nombre}`
}

export type ResultadoFila = { codigo: string; ok: boolean; motivo?: string }

/**
 * El resumen honesto de un lote sin transacción. Nunca dice "listo" a secas:
 * si 4 de 6 entraron, lo dice con esos números y nombra las dos que no.
 */
export function resumirLote(resultados: readonly ResultadoFila[]): string {
  const ok = resultados.filter((r) => r.ok)
  const fallidos = resultados.filter((r) => !r.ok)

  if (fallidos.length === 0) {
    return ok.length === 1 ? 'Se aprobó 1 registro.' : `Se aprobaron los ${ok.length} registros.`
  }
  if (ok.length === 0) {
    return `No se pudo aprobar ninguno. ${detalleFallidos(fallidos)}`
  }
  return `Se aprobaron ${ok.length} de ${resultados.length}. ${detalleFallidos(fallidos)}`
}

function detalleFallidos(fallidos: readonly ResultadoFila[]): string {
  const partes = fallidos.map((f) => `${f.codigo} (${f.motivo ?? 'error desconocido'})`)
  if (partes.length === 1) return `No se pudo con ${partes[0]}.`
  return `No se pudo con ${partes.slice(0, -1).join(', ')} ni con ${partes[partes.length - 1]}.`
}
