import * as XLSX from 'xlsx'
import type { FilaReporteCajaChica } from '@/services/caja-chica'

/**
 * El Excel del detalle de gastos de Caja Chica.
 *
 * Mismas columnas estándar que el resto de los exportables del módulo y en el
 * mismo orden, más las dos que solo tienen sentido acá: de qué FONDO salió el
 * gasto y en qué reposición entró.
 *
 * `Monto` va como NÚMERO y no como texto: el punto de bajar esto a Excel es
 * poder sumar la columna. Mismo criterio que el Excel de Cuentas por Pagar.
 */
const ENCABEZADOS = [
  'Fondo', 'Custodio', 'Fecha', 'Categoría', 'Descripción',
  'Comprobante', '¿Tiene archivo?', 'Moneda', 'Monto', 'Reposición',
] as const

export function generarExcelCajaChica(
  filas: readonly FilaReporteCajaChica[],
  nombreHoja = 'Gastos de Caja Chica'
): Buffer {
  const cuerpo = filas.map((f) => [
    f.fondo,
    f.custodio ?? '',
    f.fecha,
    f.categoria,
    f.descripcion,
    f.comprobante,
    f.tieneArchivo ? 'Sí' : 'No',
    f.moneda,
    Number(f.monto),
    f.reposicion ?? '',
  ])
  const hoja = XLSX.utils.aoa_to_sheet([[...ENCABEZADOS], ...cuerpo])
  const libro = XLSX.utils.book_new()
  // Excel corta el nombre de la hoja en 31 caracteres — el recorte va en el
  // nombre del ARCHIVO, no acá.
  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja.slice(0, 31))
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })
}
