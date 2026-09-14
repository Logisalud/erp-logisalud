import * as XLSX from 'xlsx'
import type { AporteListado } from '@/services/aportes-accionista'

/**
 * El .xlsx de aportes de accionista — las mismas columnas que la pantalla,
 * para que el archivo se parezca a lo que la persona estaba mirando cuando
 * apretó el botón (mismo criterio que lib/excel-cuentas-por-pagar.ts).
 */
const ENCABEZADOS = [
  'Código', 'Fecha', 'Categoría', 'Descripción', 'Moneda', 'Monto', 'Registró',
] as const

export function generarExcelAportes(filas: readonly AporteListado[]): Buffer {
  const cuerpo = filas.map((a) => [
    a.codigo,
    a.fecha,
    a.categoria,
    a.descripcion,
    a.moneda,
    // Número, no texto: el punto del Excel es poder sumar la columna.
    Number(a.monto),
    a.registradoPor ?? '',
  ])
  const hoja = XLSX.utils.aoa_to_sheet([[...ENCABEZADOS], ...cuerpo])
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Aportes de accionista')
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })
}
