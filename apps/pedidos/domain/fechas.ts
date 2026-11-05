/**
 * Presentación de fechas que vienen de importaciones de Excel.
 *
 * Excel cuenta los días desde el 30/12/1899, así que una celda vacía leída
 * como fecha llega convertida en ese día. No es una fecha: es un vacío
 * disfrazado. En la base se deja el dato crudo tal como vino —corregirlo
 * sería inventar información— pero en pantalla nunca se muestra como
 * 30/12/1899, porque cualquiera lo lee como una fecha real de vigencia.
 *
 * Se incluye también el 31/12/1899, que es lo que produce el otro sistema de
 * fechas de Excel (el de Mac, base 1904) en el mismo caso.
 */
const CEROS_DE_EXCEL = new Set(['1899-12-30', '1899-12-31'])

/** ¿Este valor es en realidad una celda vacía de Excel? */
export function esFechaCeroDeExcel(valor: string | null | undefined): boolean {
  if (!valor) return false
  return CEROS_DE_EXCEL.has(valor.slice(0, 10))
}

/**
 * Fecha lista para mostrar. Devuelve `vacio` cuando no hay dato y cuando el
 * dato es un cero de Excel: las dos situaciones significan lo mismo para
 * quien lee la pantalla.
 */
export function formatearFechaProveedor(
  valor: string | null | undefined,
  vacio = 'No informado'
): string {
  if (!valor || esFechaCeroDeExcel(valor)) return vacio

  const iso = valor.slice(0, 10)
  const [anio, mes, dia] = iso.split('-')
  // Se formatea con las partes del texto, sin pasar por Date: `new Date` con
  // un ISO de solo fecha lo interpreta en UTC y al mostrarlo en hora de Perú
  // (UTC-5) retrocede un día.
  if (!anio || !mes || !dia) return valor
  return `${dia}/${mes}/${anio}`
}

/**
 * El nombre de un período '2026-11' → 'Noviembre 2026'.
 *
 * El avance de ventas se guarda y se pide por período (`2026-10`,
 * `2026-11`), que es inequívoco para la base e ilegible en una pestaña:
 * nadie piensa "estoy mirando 2026-11", piensa "noviembre".
 *
 * Se arma con las partes del texto, por lo mismo que
 * `formatearFechaProveedor`: `new Date('2026-11')` se interpreta en UTC y
 * en hora de Perú cae en octubre.
 */
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function nombreDeMes(periodo: string): string {
  const mes = Number(periodo.slice(5, 7))
  return MESES[mes - 1] ?? periodo
}

export function anioDePeriodo(periodo: string): string {
  return periodo.slice(0, 4)
}

/** 'Noviembre 2026'. */
export function nombreDePeriodo(periodo: string): string {
  const mes = MESES[Number(periodo.slice(5, 7)) - 1]
  if (!mes) return periodo
  return `${mes} ${anioDePeriodo(periodo)}`
}
