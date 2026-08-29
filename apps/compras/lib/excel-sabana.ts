import * as XLSX from 'xlsx'
import { ETIQUETA_ESTADO_PAGO_SABANA } from '@/domain/reportes'
import type { FilaSabana } from '@/services/reportes-sabana'

const ENCABEZADOS = [
  'Código', 'Proveedor / beneficiario', 'RUC', 'Origen', 'Referencia', 'N° factura/comprobante',
  'Fecha emisión', 'Fecha vencimiento', 'Días vencido', 'Moneda', 'Monto original', 'Monto pagado',
  'Saldo pendiente', 'Estado', 'Área', 'Responsable', 'Fecha de pago', 'Forma de pago',
] as const

/** Genera el .xlsx de la sábana maestra — misma data que pinta la pantalla, un solo lugar que la arma. */
export function generarSabanaExcel(filas: readonly FilaSabana[]): Buffer {
  const encabezado = [...ENCABEZADOS]
  const cuerpo = filas.map((f) => [
    f.codigo,
    f.quien,
    f.ruc ?? '',
    f.origenEtiqueta,
    f.referencia ?? '',
    f.numeroFactura ?? '',
    f.fechaEmision ?? '',
    f.fechaVencimiento ?? '',
    f.diasVencido ?? '',
    f.moneda,
    f.montoOriginal,
    f.montoPagado,
    f.saldoPendiente,
    ETIQUETA_ESTADO_PAGO_SABANA[f.estado],
    f.area ?? '',
    f.responsable ?? '',
    f.fechaPago ?? '',
    f.formaPago ?? '',
  ])
  const hoja = XLSX.utils.aoa_to_sheet([encabezado, ...cuerpo])
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Sábana maestra')
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })
}
