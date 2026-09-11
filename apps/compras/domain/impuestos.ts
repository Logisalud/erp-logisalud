/**
 * Reglas de Impuestos. Puro: sin Next, sin Supabase, testeable solo.
 *
 * Lenguaje Ubicuo: Gestión Humana (Arlette) carga cada Obligación
 * Tributaria (Essalud, ONP, AFP, Renta 4ta/5ta, Seguro Vida Ley) desde BUK
 * con anticipación al vencimiento del día 3 hábil del mes siguiente —
 * regla 11 del documento maestro. Contabilidad confirma, lo que genera la
 * obligación real en `cuentas_x_pagar.obligaciones` (mismo patrón que
 * Contabilidad aprobando una solicitud de gasto).
 */

export type ErrorValidacion = { campo: string; mensaje: string }
export type FuenteImpuesto = 'BUK' | 'SUNAT' | 'manual'

const REGEX_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

export type BorradorImpuesto = {
  tipoImpuestoId: string
  periodo: string
  monto: number
  fechaVencimiento: string
  fuente: FuenteImpuesto
}

export function validarImpuesto(b: BorradorImpuesto): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  if (!b.tipoImpuestoId) errores.push({ campo: 'tipoImpuestoId', mensaje: 'Elige un tipo de impuesto.' })
  if (!REGEX_PERIODO.test(b.periodo)) errores.push({ campo: 'periodo', mensaje: 'El periodo tiene que tener el formato AAAA-MM.' })
  if (!(Number(b.monto) > 0)) errores.push({ campo: 'monto', mensaje: 'El monto tiene que ser mayor a 0.' })
  if (!b.fechaVencimiento) errores.push({ campo: 'fechaVencimiento', mensaje: 'Falta la fecha de vencimiento.' })
  return errores
}

export const ESTADOS_OBLIGACION_TRIBUTARIA = ['pendiente_contabilidad', 'conforme', 'en_propuesta', 'pagado'] as const
export type EstadoObligacionTributaria = (typeof ESTADOS_OBLIGACION_TRIBUTARIA)[number]

export const ETIQUETA_ESTADO_TRIBUTARIA: Record<EstadoObligacionTributaria, string> = {
  pendiente_contabilidad: 'Esperando a Contabilidad',
  conforme: 'Conforme — en camino a pago',
  en_propuesta: 'En una propuesta de pago',
  pagado: 'Pagado',
}


/**
 * ── Carga de VARIAS líneas en un solo envío ──────────────────────────
 *
 * Arlette carga esto desde el reporte PLAME de BUK, que agrupa varios
 * impuestos de un mismo periodo (Essalud, ONP, AFP, Renta 5ta…) en un solo
 * documento. El formulario de una carga a la vez no reflejaba cómo llega la
 * información real.
 *
 * OJO con dos campos que se confunden fácil y NO son lo mismo:
 *  - `fuente` (BUK | SUNAT | manual) es de dónde VINO el dato. Va en el
 *    encabezado, una vez por envío.
 *  - `tipoImpuestoId` es QUÉ tributo es, y sale del catálogo
 *    `impuestos.tipos_impuesto` (Essalud, ONP, AFP…). Va por línea.
 * BUK jamás es un tipo de impuesto: es un valor de `fuente`. Son campos
 * incompatibles incluso a nivel de base — uno es text con CHECK de tres
 * valores, el otro un uuid con FK al catálogo.
 */

export type EncabezadoCarga = {
  periodo: string
  fuente: FuenteImpuesto
  /** Vencimiento por defecto de las líneas que no traigan el suyo. */
  fechaVencimiento: string
}

export type LineaCarga = {
  tipoImpuestoId: string
  monto: number
  /**
   * Pisa el vencimiento del encabezado. Necesario de verdad: AFP vence por
   * AFPnet, en fecha distinta del cronograma SUNAT que rige Essalud, ONP y
   * Renta 5ta, y las tres llegan en el MISMO reporte PLAME.
   */
  fechaVencimiento?: string | null
}

/** El vencimiento que de verdad le toca a una línea. */
export function vencimientoDeLinea(encabezado: EncabezadoCarga, linea: LineaCarga): string {
  return linea.fechaVencimiento?.trim() || encabezado.fechaVencimiento
}

/**
 * Un solo periodo por envío: el formulario no mezcla periodos, porque el
 * PLAME del que se copia es de un periodo. Si hiciera falta cargar dos
 * meses, son dos envíos.
 */
export function validarEncabezadoCarga(h: EncabezadoCarga): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  if (!REGEX_PERIODO.test(h.periodo)) {
    errores.push({ campo: 'periodo', mensaje: 'El periodo tiene que tener el formato AAAA-MM.' })
  }
  if (h.fuente !== 'BUK' && h.fuente !== 'SUNAT' && h.fuente !== 'manual') {
    errores.push({ campo: 'fuente', mensaje: 'La fuente del dato tiene que ser BUK, SUNAT o manual.' })
  }
  if (!h.fechaVencimiento) {
    errores.push({ campo: 'fechaVencimiento', mensaje: 'Falta el vencimiento por defecto de las líneas.' })
  }
  return errores
}

/**
 * Valida el envío completo. Tres cosas distintas, y por eso los errores
 * vienen indexados por línea (`lineas.2.monto`): con un solo `.insert([...])`
 * de N filas, un choque hace fallar el envío entero, así que hay que poder
 * señalar EXACTAMENTE qué línea corregir en vez de rechazar todo en bloque.
 *
 * `tiposYaCargados` son los tipos que ya existen en la base para ese periodo
 * — los pasa el servicio con una consulta previa. La base tiene un unique
 * por (tipo, periodo), pero ese solo avisa DESPUÉS de intentar insertar y se
 * lleva el envío completo; esto lo atrapa antes.
 */
export function validarCargaMultiple(
  encabezado: EncabezadoCarga,
  lineas: readonly LineaCarga[],
  tiposYaCargados: readonly string[] = []
): ErrorValidacion[] {
  const errores = validarEncabezadoCarga(encabezado)

  if (lineas.length === 0) {
    errores.push({ campo: 'lineas', mensaje: 'Agrega al menos una línea de impuesto.' })
    return errores
  }

  const vistos = new Map<string, number>()
  lineas.forEach((linea, i) => {
    if (!linea.tipoImpuestoId) {
      errores.push({ campo: `lineas.${i}.tipoImpuestoId`, mensaje: `Línea ${i + 1}: elige el tipo de impuesto.` })
    }
    if (!(Number(linea.monto) > 0)) {
      errores.push({ campo: `lineas.${i}.monto`, mensaje: `Línea ${i + 1}: el monto tiene que ser mayor a 0.` })
    }

    if (!linea.tipoImpuestoId) return

    // Repetido DENTRO del mismo envío: se marca la SEGUNDA aparición, que es
    // la que hay que sacar — marcar la primera haría borrar la que estaba bien.
    const anterior = vistos.get(linea.tipoImpuestoId)
    if (anterior != null) {
      errores.push({
        campo: `lineas.${i}.tipoImpuestoId`,
        mensaje: `Línea ${i + 1}: este impuesto ya está en la línea ${anterior + 1} de este mismo envío.`,
      })
    } else {
      vistos.set(linea.tipoImpuestoId, i)
    }

    // Ya cargado en la base para ese periodo.
    if (tiposYaCargados.includes(linea.tipoImpuestoId)) {
      errores.push({
        campo: `lineas.${i}.tipoImpuestoId`,
        mensaje: `Línea ${i + 1}: ya hay una carga de este impuesto para ${encabezado.periodo}. Quita esta línea o corrige la existente.`,
      })
    }
  })

  return errores
}

/** Lo que va a la base, una fila por línea, con el vencimiento ya resuelto. */
export function filasDeCarga(
  encabezado: EncabezadoCarga,
  lineas: readonly LineaCarga[]
): { tipoImpuestoId: string; periodo: string; monto: number; fechaVencimiento: string; fuente: FuenteImpuesto }[] {
  return lineas.map((linea) => ({
    tipoImpuestoId: linea.tipoImpuestoId,
    periodo: encabezado.periodo,
    monto: Number(linea.monto),
    fechaVencimiento: vencimientoDeLinea(encabezado, linea),
    fuente: encabezado.fuente,
  }))
}

/** Total del envío — se muestra mientras se carga, para cuadrar contra el PLAME. */
export function totalDeCarga(lineas: readonly LineaCarga[]): number {
  const suma = lineas.reduce((acc, l) => acc + (Number(l.monto) || 0), 0)
  return Number(`${Math.round(Number(`${suma}e2`))}e-2`)
}


/**
 * Agrupa por periodo para el listado. El periodo ES el agrupador natural —
 * un envío de PLAME es de un mes —, así que no hace falta un `lote_id`: una
 * columna más que nadie mira y que habría que mantener sincronizada.
 *
 * Más reciente primero: lo que se acaba de cargar es lo que se está
 * revisando.
 */
export function agruparPorPeriodo<T extends { periodo: string; monto: number }>(
  filas: readonly T[]
): { periodo: string; filas: T[]; total: number }[] {
  const porPeriodo = new Map<string, T[]>()
  for (const fila of filas) {
    const previas = porPeriodo.get(fila.periodo) ?? []
    previas.push(fila)
    porPeriodo.set(fila.periodo, previas)
  }
  return Array.from(porPeriodo, ([periodo, filasDelPeriodo]) => ({
    periodo,
    filas: filasDelPeriodo,
    total: Number(
      `${Math.round(Number(`${filasDelPeriodo.reduce((acc, f) => acc + (Number(f.monto) || 0), 0)}e2`))}e-2`
    ),
  })).sort((a, b) => b.periodo.localeCompare(a.periodo))
}
