/**
 * Fechas de calendario en hora de Lima.
 *
 * El bug que motivó esto: Mariela registró un pago a las 22:50 del 11/09
 * hora de Lima y el sistema lo guardó con fecha 12/09. La causa es una
 * línea que estaba repetida en todo el módulo:
 *
 *     new Date().toISOString().slice(0, 10)
 *
 * `toISOString()` convierte a UTC. Lima es UTC-5, así que entre las 19:00 y
 * la medianoche esa expresión devuelve SIEMPRE el día siguiente. No es un
 * caso raro: es un quinto de cada día, y justo el tramo en que se cargan
 * las cosas que quedaron pendientes.
 *
 * Y el problema no se arregla evitando `toISOString()`, porque falla por
 * los dos lados y por razones distintas:
 *
 * - En un componente cliente, `new Date()` sí da la hora local (Lima), pero
 *   `toISOString()` la corre a UTC igual. Ese era el caso de la fecha de
 *   pago.
 * - En el servidor (services/, Server Components, route handlers) el lambda
 *   de Vercel corre en UTC, así que ahí ni `new Date()` sirve: también
 *   `getFullYear()`/`getMonth()` devuelven el día equivocado esas 5 horas.
 *
 * Por eso las funciones de acá se usan en los dos lados, y nadie tiene que
 * acordarse de en qué lado corre su código.
 *
 * Se usa la base IANA (`America/Lima`) y no una resta fija de 5 horas: Perú
 * hoy no tiene horario de verano, pero lo tuvo en los 90, y si volviera una
 * constante hardcodeada se rompería en silencio.
 *
 * OJO — esto es para FECHAS DE CALENDARIO (el "hoy" del usuario, el mes en
 * curso, el año de un código). NO es para las columnas `timestamptz` de
 * auditoría (`editado_en`, `anulado_en`, `updated_at`, …): ahí
 * `new Date().toISOString()` es lo correcto, porque lo que se guarda es un
 * instante, no un día, y Postgres ya lo almacena con zona.
 */

const ZONA = 'America/Lima'

function partesLima(instante: Date): { anio: string; mes: string; dia: string } {
  // `formatToParts` y no `format` a propósito: el string que arma cada
  // locale es cosa del locale, y acá el formato tiene que ser exacto.
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instante)

  const buscar = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return { anio: buscar('year'), mes: buscar('month'), dia: buscar('day') }
}

/** El día de hoy en Lima, como 'YYYY-MM-DD'. Reemplaza a
 *  `new Date().toISOString().slice(0, 10)` en todo el módulo. */
export function hoyLima(instante: Date = new Date()): string {
  const { anio, mes, dia } = partesLima(instante)
  return `${anio}-${mes}-${dia}`
}

/** El mes en curso en Lima, como 'YYYY-MM'. Para los `<input type="month">`
 *  y para el periodo por defecto de Impuestos y Planilla. */
export function mesActualLima(instante: Date = new Date()): string {
  const { anio, mes } = partesLima(instante)
  return `${anio}-${mes}`
}

/** El año en curso en Lima. Va en los códigos correlativos (PP-2026-0001):
 *  el 31/12 a las 20:00 de Lima, `new Date().getFullYear()` en el servidor
 *  ya devuelve el año siguiente y el correlativo saltaría de año un día
 *  antes de tiempo. */
export function anioActualLima(instante: Date = new Date()): number {
  return Number(partesLima(instante).anio)
}

/** `YYYY/MM` para las rutas de Storage, que la policy `path_legajo_valido`
 *  exige como primeros dos segmentos. En UTC, un archivo subido el 30/09 a
 *  las 21:00 de Lima caía en `2026/10/`: válido para la policy, pero
 *  archivado en el mes equivocado. */
export function anioMesStorageLima(instante: Date = new Date()): string {
  const { anio, mes } = partesLima(instante)
  return `${anio}/${mes}`
}
