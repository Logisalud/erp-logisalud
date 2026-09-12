import * as XLSX from 'xlsx'
import { ETIQUETA_ESTADO } from '@/domain/obligacion'
import { ETIQUETA_ORIGEN, type OrigenObligacion } from '@/domain/reportes'
import type { ObligacionListada } from '@/services/obligaciones'

/**
 * El Excel de /cuentas-por-pagar: las MISMAS ocho columnas que la pantalla,
 * en el mismo orden.
 *
 * No reusa `generarSabanaExcel` a propósito: la sábana maestra es otro
 * recorte (18 columnas, todos los orígenes, sin filtro de estado) y mezclar
 * las dos daría un archivo que no se parece a lo que la persona estaba
 * mirando cuando apretó el botón. Lo que sí se comparte es la librería y el
 * formato de salida .xlsx.
 */
const ENCABEZADOS = [
  'Código', 'N° factura', 'Proveedor / Beneficiario', 'Origen', 'Estado',
  'Moneda', 'Monto', 'Vencimiento', 'Lote', 'Estado del lote', 'Concepto',
] as const

export function generarExcelCuentasPorPagar(
  filas: readonly ObligacionListada[],
  nombreHoja = 'Cuentas por pagar'
): Buffer {
  const cuerpo = filas.map((o) => [
    o.codigo,
    o.numero_factura ?? '',
    o.proveedor?.razon_social ?? o.beneficiario?.nombre ?? '',
    ETIQUETA_ORIGEN[o.origen as OrigenObligacion] ?? o.origen,
    ETIQUETA_ESTADO[o.estado],
    o.moneda,
    // Número, no texto: el punto del Excel es poder sumar la columna.
    Number(o.neto_a_pagar),
    o.fecha_vencimiento_real ?? '',
    o.propuesta?.codigo ?? '',
    o.propuesta?.estado ?? '',
    o.concepto ?? '',
  ])
  const hoja = XLSX.utils.aoa_to_sheet([[...ENCABEZADOS], ...cuerpo])
  const libro = XLSX.utils.book_new()
  // Excel corta el nombre de la hoja en 31 caracteres y revienta con
  // algunos signos — el recorte va en el nombre del ARCHIVO, no acá.
  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja.slice(0, 31))
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })
}
