/**
 * Reglas de presentación del reporte de Proyección de pagos. Puro.
 *
 * El reporte pasó de tarjetas por periodo a UNA tabla única (pedido de
 * Mariela, 2026-09-18) con las mismas columnas que el resto del módulo. El
 * periodo no se perdió: es una columna más, y se puede ordenar y filtrar por
 * ella.
 *
 * Todo lo que decide qué se ve —la etiqueta de días, el orden, los totales—
 * vive acá y no en la página, porque es lo que hay que poder probar sin
 * levantar Next ni la base.
 */

export const VENTANAS_PROYECCION = ['esta_semana', 'este_mes', 'proximo_mes', 'despues'] as const
export type VentanaProyeccion = (typeof VENTANAS_PROYECCION)[number]

export const ETIQUETA_VENTANA: Record<VentanaProyeccion, string> = {
  esta_semana: 'Esta semana',
  este_mes: 'Este mes',
  proximo_mes: 'Próximo mes',
  despues: 'Más adelante',
}

/**
 * "Días para vencer", o "Vencido hace X días" si ya pasó.
 *
 * Recibe `diasVencido` tal como lo calcula domain/reportes.ts: hoy menos el
 * vencimiento, así que POSITIVO es vencido y negativo es por vencer. El signo
 * invertido es justamente lo que nadie quiere leer en una tabla, y es la razón
 * de que esta función exista.
 */
export function etiquetaDiasParaVencer(diasVencido: number | null): string {
  if (diasVencido === null) return 'sin fecha'
  if (diasVencido > 0) return `Vencido hace ${diasVencido} ${diasVencido === 1 ? 'día' : 'días'}`
  if (diasVencido === 0) return 'Vence hoy'
  const faltan = -diasVencido
  return `En ${faltan} ${faltan === 1 ? 'día' : 'días'}`
}

/** Vencido o vence hoy: lo que ya es urgencia, no proyección. */
export function esUrgente(diasVencido: number | null): boolean {
  return diasVencido !== null && diasVencido >= 0
}

export const COLUMNAS_ORDENABLES = ['vencimiento', 'periodo', 'monto', 'codigo', 'quien', 'origen'] as const
export type ColumnaOrden = (typeof COLUMNAS_ORDENABLES)[number]
export type DireccionOrden = 'asc' | 'desc'

/** El orden natural de este reporte: lo que vence primero, primero. */
export const ORDEN_POR_DEFECTO: { columna: ColumnaOrden; direccion: DireccionOrden } = {
  columna: 'vencimiento',
  direccion: 'asc',
}

export function esColumnaOrdenable(v: string | undefined): v is ColumnaOrden {
  return !!v && (COLUMNAS_ORDENABLES as readonly string[]).includes(v)
}

export function resolverOrden(
  columna: string | undefined,
  direccion: string | undefined
): { columna: ColumnaOrden; direccion: DireccionOrden } {
  if (!esColumnaOrdenable(columna)) return ORDEN_POR_DEFECTO
  return { columna, direccion: direccion === 'desc' ? 'desc' : 'asc' }
}

export type FilaProyeccion = {
  id: string
  codigo: string
  origen: string
  quien: string
  numeroFactura: string | null
  fechaVencimiento: string | null
  diasVencido: number | null
  moneda: string
  netoAPagar: number
  ventana: VentanaProyeccion
  /**
   * A dónde lleva la fila. Una obligación va a su ficha; una cuota que
   * todavía no es obligación va a la bandeja donde se genera — llevarla a
   * una ficha que no existe sería una promesa falsa.
   */
  href: string
  /**
   * Cuota o letra pendiente que TODAVÍA no es obligación. Se muestra igual
   * —la plata se debe— pero no se puede poner en una propuesta de pago hasta
   * generarla, y la fila tiene que decirlo.
   */
  sinObligacion?: boolean
}

/**
 * Ordena por la columna elegida.
 *
 * Dos decisiones que no son obvias:
 *
 * - Las filas SIN fecha de vencimiento van siempre al final, en las dos
 *   direcciones. Ascendente las pondría arriba (null antes que cualquier
 *   fecha) y taparían justo lo que el reporte existe para mostrar: lo que
 *   vence pronto.
 * - Ordenar por monto agrupa primero por MONEDA. Comparar 1.000 soles contra
 *   900 dólares como si fueran el mismo número daría un orden que miente; el
 *   reporte nunca suma monedas distintas y ordenarlas juntas sería la misma
 *   mezcla por la puerta de atrás.
 */
export function ordenarProyeccion<T extends FilaProyeccion>(
  filas: readonly T[],
  columna: ColumnaOrden,
  direccion: DireccionOrden
): T[] {
  const signo = direccion === 'desc' ? -1 : 1
  const posicionVentana = (v: VentanaProyeccion) => VENTANAS_PROYECCION.indexOf(v)

  return [...filas].sort((a, b) => {
    switch (columna) {
      case 'vencimiento': {
        if (!a.fechaVencimiento && !b.fechaVencimiento) return a.codigo.localeCompare(b.codigo)
        if (!a.fechaVencimiento) return 1
        if (!b.fechaVencimiento) return -1
        return signo * a.fechaVencimiento.localeCompare(b.fechaVencimiento) || a.codigo.localeCompare(b.codigo)
      }
      case 'periodo':
        return signo * (posicionVentana(a.ventana) - posicionVentana(b.ventana)) || a.codigo.localeCompare(b.codigo)
      case 'monto':
        return a.moneda.localeCompare(b.moneda) || signo * (a.netoAPagar - b.netoAPagar)
      case 'quien':
        return signo * a.quien.localeCompare(b.quien) || a.codigo.localeCompare(b.codigo)
      case 'origen':
        return signo * a.origen.localeCompare(b.origen) || a.codigo.localeCompare(b.codigo)
      case 'codigo':
      default:
        return signo * a.codigo.localeCompare(b.codigo)
    }
  })
}

export type TotalMoneda = { moneda: string; total: number }

/**
 * Total por moneda, SIN mezclar PEN con USD — mismo criterio que el resto de
 * los reportes del módulo. Devuelve una entrada por moneda presente, ordenada
 * para que la salida sea estable.
 */
export function totalesPorMoneda(filas: readonly FilaProyeccion[]): TotalMoneda[] {
  const porMoneda = new Map<string, number>()
  for (const f of filas) {
    porMoneda.set(f.moneda, (porMoneda.get(f.moneda) ?? 0) + f.netoAPagar)
  }
  return [...porMoneda.entries()]
    .map(([moneda, total]) => ({ moneda, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda))
}

/**
 * El resumen de arriba: cuánto cae en cada periodo, por moneda.
 *
 * Se calcula SIEMPRE sobre todas las filas, no sobre las filtradas: es a la
 * vez el total por periodo y la forma de entrar a cada periodo, así que tiene
 * que seguir mostrando los cuatro números aunque estés mirando uno solo. El
 * total del pie, en cambio, es el de lo que estás viendo.
 */
export function resumenPorVentana(
  filas: readonly FilaProyeccion[]
): { ventana: VentanaProyeccion; cantidad: number; totales: TotalMoneda[] }[] {
  return VENTANAS_PROYECCION.map((ventana) => {
    const suyas = filas.filter((f) => f.ventana === ventana)
    return { ventana, cantidad: suyas.length, totales: totalesPorMoneda(suyas) }
  })
}
