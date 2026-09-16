/**
 * Reglas de "aprobar varios juntos" desde Pendientes de aprobar. Puro.
 *
 * Desde 2026-09-15 un lote PUEDE mezclar tipos (pedido de Mariela: tildar lo
 * que hay y aprobarlo, sin ir tipo por tipo). Antes no podía, y las razones
 * de entonces siguen siendo ciertas — lo que cambió es cómo se las contiene:
 *
 *  - Las cinco funciones de aprobar tienen la misma firma (`id => void`),
 *    pero efectos muy distintos: dos cambian un estado, dos CREAN una
 *    obligación (deuda formal) y la de propuesta habilita el desembolso de
 *    un lote entero. → Se contiene con el ORDEN DE EJECUCIÓN: lo barato y
 *    reversible primero, las propuestas al final (ver ORDEN_DE_EJECUCION).
 *  - El módulo NO usa transacciones (cero `supabase.rpc`, ver CONTEXTO.md),
 *    así que un lote de 7 son 7 operaciones independientes. Si la cuarta
 *    falla, las tres primeras ya se aplicaron y no hay rollback. → Se
 *    contiene con `resumirLote`, que nunca dice "listo" a secas.
 *  - Cada tipo lo decide alguien distinto (Contabilidad, el jefe del área,
 *    o los dos según el estado), así que un lote mixto puede fallar a mitad
 *    por permisos. → Se contiene reusando la función individual de cada
 *    tipo: el que no le toque falla solo, con su motivo, sin arrastrar al
 *    resto.
 *
 * Lo que NO cambió: el tope de 20, y que el número que se lee antes de
 * confirmar sea el total por moneda con las propuestas desglosadas aparte.
 */

import {
  ETIQUETA_TIPO_PENDIENTE, ETIQUETA_TIPO_PENDIENTE_PLURAL, type TipoPendiente,
} from './pendientes-aprobar'

/**
 * Desde 2026-09-14 TODOS los tipos admiten lote, propuestas incluidas
 * (cambio de decisión de Sebas). La restricción de un solo tipo por
 * selección sigue en pie y es la que sostiene el resto.
 *
 * La lista se conserva vacía y no se borra: si mañana un tipo tiene que
 * salir del lote, este es el lugar, y el nombre dice qué significa.
 */
export const TIPOS_SIN_LOTE: readonly TipoPendiente[] = []

export function admiteAprobacionEnLote(tipo: TipoPendiente): boolean {
  return !TIPOS_SIN_LOTE.includes(tipo)
}

export const MOTIVO_SIN_LOTE = 'Este tipo se aprueba de a uno, desde su propia pantalla.'

/**
 * ¿El total va EN GRANDE antes de ejecutar?
 *
 * Sí en cuanto la selección contenga AL MENOS UNA propuesta — no "si el tipo
 * es propuesta", que era el criterio cuando el lote no podía mezclar.
 *
 * Aprobar una propuesta no es una firma más: libera el desembolso de su lote
 * entero, así que una sola puede ser cien obligaciones y un monto muy por
 * encima de lo que la pantalla deja intuir. Y con tipos mezclados el caso
 * peligroso es exactamente ese: UNA propuesta perdida entre seis filas
 * chicas, donde está casi toda la plata y es la más fácil de no mirar.
 */
export function exigeTotalDestacado(
  filas: readonly { tipo: TipoPendiente }[]
): boolean {
  return filas.some((f) => f.tipo === 'propuesta')
}

/**
 * Suma por moneda, sin mezclar nunca dos entre sí.
 *
 * Recibe los totales POR MONEDA de cada fila y no un par monto/moneda: una
 * propuesta puede mezclar PEN y USD adentro, y su columna Monto solo puede
 * mostrar una. Sumar esa columna perdería la otra moneda en silencio —
 * justo en el número que existe para no aprobar a ciegas.
 */
export function totalDeLaSeleccion(
  filas: readonly { totalPorMoneda: readonly { moneda: string; monto: number }[] }[]
): { moneda: string; monto: number }[] {
  const mapa = new Map<string, number>()
  for (const fila of filas) {
    for (const t of fila.totalPorMoneda) {
      mapa.set(t.moneda, (mapa.get(t.moneda) ?? 0) + t.monto)
    }
  }
  return [...mapa.entries()]
    .map(([moneda, monto]) => ({ moneda, monto: Math.round(monto * 100) / 100 }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda))
}

/**
 * Tope por lote. Cada aprobación son 2-4 consultas y no hay transacción: un
 * timeout a mitad de 50 filas es el peor escenario posible — parte aplicado,
 * parte no, y sin saber dónde cortó.
 */
export const MAXIMO_POR_LOTE = 20

/**
 * "Seleccionar todos" ya no depende del filtro.
 *
 * Antes exigía filtrar por un tipo, porque sin eso no se sabía de qué tipo
 * sería el lote. Con la mezcla permitida eso dejó de tener sentido: tildar
 * todo lo que hay es justo el caso que Mariela pidió. Lo único que puede
 * apagarlo es que no haya filas.
 */
export function estadoDelSeleccionarTodos(
  visibles: number
): { habilitado: true } | { habilitado: false; motivo: string } {
  if (visibles === 0) return { habilitado: false, motivo: 'No hay nada esperando tu decisión.' }
  return { habilitado: true }
}

/** Cuántas filas entran de verdad al tildar todo: el tope manda. */
export function cuantasEntranAlLote(visibles: number): number {
  return Math.min(visibles, MAXIMO_POR_LOTE)
}

/**
 * La selección ya no "reserva" un tipo: es un conjunto de ids y nada más.
 * Antes tenía un `tipoActivo` que bloqueaba las filas de otro tipo.
 */
export type EstadoSeleccion = {
  elegidas: ReadonlySet<string>
}

/**
 * ¿Se puede tildar esta fila?
 *
 * Devuelve el MOTIVO cuando no, nunca solo `false`: un checkbox apagado sin
 * explicación es de las cosas que más hacen dudar de un sistema.
 *
 * Lo único que apaga un checkbox hoy es el tope del lote (y TIPOS_SIN_LOTE,
 * que está vacío pero se conserva como punto de salida).
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

  if (seleccion.elegidas.size >= MAXIMO_POR_LOTE) {
    return {
      habilitado: false,
      motivo: `Máximo ${MAXIMO_POR_LOTE} por lote — aprueba estos y sigue con el resto.`,
    }
  }
  return { habilitado: true }
}

/**
 * Qué dice el botón.
 *
 * Con un solo tipo sigue nombrándolo ("Aprobar 4 Pagos Directos"): es la
 * información más útil que cabe ahí. Con tipos mezclados no hay nombre que
 * sirva, así que dice la cantidad ("Aprobar 7 registros") y el desglose por
 * tipo va en el panel de confirmación, que es donde se lee de verdad.
 *
 * El plural sale del catálogo y no de agregarle una "s": "4 Pago Directos"
 * y "3 Orden de Servicios" están mal en español.
 */
export function etiquetaBotonLote(
  filas: readonly { tipo: TipoPendiente }[]
): string {
  if (filas.length === 0) return 'Aprobar seleccionados'
  const tipos = new Set(filas.map((f) => f.tipo))
  if (tipos.size > 1) return `Aprobar ${filas.length} registros`

  const tipo = [...tipos][0]
  const nombre =
    filas.length === 1 ? ETIQUETA_TIPO_PENDIENTE[tipo] : ETIQUETA_TIPO_PENDIENTE_PLURAL[tipo]
  return `Aprobar ${filas.length} ${nombre}`
}

/**
 * El orden en que se ejecuta un lote mezclado. Las propuestas AL FINAL.
 *
 * Dos razones, y la segunda es la que decide:
 *
 * 1. Dirección del embudo. Aprobar un pago directo (`darConformidad`) deja la
 *    obligación `conforme`, que es el estado que la vuelve elegible para una
 *    propuesta. Conformidad → propuesta es el sentido natural del flujo, y
 *    ejecutar en ese orden hace que un lote mezclado componga sus efectos
 *    igual que si se hubieran hecho de a uno en días distintos.
 *
 * 2. Sin transacciones, el orden decide QUÉ QUEDA A MEDIAS. Una propuesta es
 *    la acción de mayor consecuencia de la bandeja: libera el desembolso de
 *    un lote entero. Si el lote se corta a mitad —y puede— conviene que los
 *    fallos ocurran sobre lo barato y reversible primero, y lo irreversible
 *    y caro al final, con la persona todavía mirando la pantalla. Fallar en
 *    el ítem 3 de 7 habiendo YA liberado un desembolso es peor que fallar en
 *    el 3 y que el desembolso todavía no haya salido.
 *
 * El orden lo impone el servidor sobre la bandeja releída, nunca el orden en
 * que el navegador mandó los ids.
 */
export const ORDEN_DE_EJECUCION: readonly TipoPendiente[] = [
  'pago_directo',
  'anticipo',
  'reembolso',
  'os',
  'caja_chica',
  'propuesta',
]

/** Ordena las filas de un lote según ORDEN_DE_EJECUCION, estable dentro de
 *  cada tipo (conserva el orden de la bandeja). */
export function ordenarParaEjecutar<T extends { tipo: TipoPendiente }>(
  filas: readonly T[]
): T[] {
  const peso = (t: TipoPendiente) => {
    const i = ORDEN_DE_EJECUCION.indexOf(t)
    return i === -1 ? ORDEN_DE_EJECUCION.length : i
  }
  return [...filas]
    .map((fila, i) => ({ fila, i }))
    .sort((a, b) => peso(a.fila.tipo) - peso(b.fila.tipo) || a.i - b.i)
    .map((x) => x.fila)
}

export type FilaDeLote = {
  tipo: TipoPendiente
  totalPorMoneda: readonly { moneda: string; monto: number }[]
}

export type ResumenSeleccion = {
  cantidad: number
  /** Una línea por tipo presente, en el orden de ejecución. */
  porTipo: { tipo: TipoPendiente; cantidad: number; totalPorMoneda: { moneda: string; monto: number }[] }[]
  total: { moneda: string; monto: number }[]
  /** Desglose destacado: cuánto del total sale de Propuestas de pago. Null si
   *  no hay ninguna en la selección. */
  dePropuestas: { cantidad: number; totalPorMoneda: { moneda: string; monto: number }[] } | null
  /** El resto, para que la resta quede a la vista y no haya que hacerla. */
  delResto: { cantidad: number; totalPorMoneda: { moneda: string; monto: number }[] } | null
  mezclaTipos: boolean
}

/**
 * Lo que se lee ANTES de confirmar un lote.
 *
 * Con tipos mezclados un total solo ya no alcanza: "S/ 51,500" no deja ver
 * que S/ 41,900 de eso son dos propuestas que liberan desembolsos enteros y
 * el resto son seis firmas chicas. De ahí el desglose por tipo MÁS el corte
 * específico de Propuestas de pago, que es el que pidió Mariela.
 */
export function resumenDeLaSeleccion(filas: readonly FilaDeLote[]): ResumenSeleccion {
  const ordenadas = ordenarParaEjecutar(filas)

  const porTipo: ResumenSeleccion['porTipo'] = []
  for (const tipo of ORDEN_DE_EJECUCION) {
    const delTipo = ordenadas.filter((f) => f.tipo === tipo)
    if (delTipo.length === 0) continue
    porTipo.push({ tipo, cantidad: delTipo.length, totalPorMoneda: totalDeLaSeleccion(delTipo) })
  }

  const propuestas = filas.filter((f) => f.tipo === 'propuesta')
  const resto = filas.filter((f) => f.tipo !== 'propuesta')

  return {
    cantidad: filas.length,
    porTipo,
    total: totalDeLaSeleccion(filas),
    dePropuestas: propuestas.length > 0
      ? { cantidad: propuestas.length, totalPorMoneda: totalDeLaSeleccion(propuestas) }
      : null,
    // El resto solo se muestra si hay las dos cosas: sin propuestas el
    // "resto" ES el total y repetirlo sería ruido.
    delResto: propuestas.length > 0 && resto.length > 0
      ? { cantidad: resto.length, totalPorMoneda: totalDeLaSeleccion(resto) }
      : null,
    mezclaTipos: new Set(filas.map((f) => f.tipo)).size > 1,
  }
}

export type ResultadoFila = {
  codigo: string
  ok: boolean
  motivo?: string
  /** El tipo de la fila. Con lotes mezclados, "No se pudo con PP-2026-0004"
   *  no alcanza para entender qué quedó sin hacer. */
  tipo?: TipoPendiente
}

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
  const partes = fallidos.map((f) => {
    // El tipo adelante del código: en un lote mezclado es lo que ubica la
    // fila sin tener que ir a buscarla.
    const nombre = f.tipo ? `${ETIQUETA_TIPO_PENDIENTE[f.tipo]} ` : ''
    return `${nombre}${f.codigo} (${f.motivo ?? 'error desconocido'})`
  })
  if (partes.length === 1) return `No se pudo con ${partes[0]}.`
  return `No se pudo con ${partes.slice(0, -1).join(', ')} ni con ${partes[partes.length - 1]}.`
}
