import 'server-only'
import ExcelJS from 'exceljs'
import { COLUMNAS_INFORME, ETIQUETA_CATEGORIA, filasDeInforme, resumenDeInforme, type InformeCarga } from '@/domain/informe-carga'

const VERDE = 'FFDCFCE7'; const ROJO = 'FFFEE2E2'; const AMBAR = 'FFFEF3C7'

/** El informe de la carga de ensayo en Excel: hoja «Resumen» (veredicto y totales) y hoja «Detalle» (una fila por problema, con color y filtros). */
export async function xlsxInformeCarga(i: InformeCarga): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'WMS LOGISALUD'
  wb.created = new Date()
  const r = wb.addWorksheet('Resumen')
  r.getCell('A1').value = 'Informe de validación de la carga de ensayo'
  r.getCell('A1').font = { bold: true, size: 14 }
  r.addRow([])
  resumenDeInforme(i).forEach(([k, v]) => { const f = r.addRow([k, v]); f.getCell(1).font = { bold: true } })
  r.getCell('B3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i.veredicto === 'LISTA' ? VERDE : ROJO } }
  r.getCell('B3').font = { bold: true }
  r.addRow([])
  const cab = r.addRow(['Problemas por tema', 'Errores', 'Advertencias'])
  cab.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } } })
  for (const c of i.porCategoria) r.addRow([ETIQUETA_CATEGORIA[c.categoria], c.errores, c.advertencias])
  r.columns = [{ width: 28 }, { width: 70 }, { width: 14 }]
  r.getColumn(2).alignment = { wrapText: true, vertical: 'top' }

  const d = wb.addWorksheet('Detalle', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  const h = d.addRow([...COLUMNAS_INFORME])
  h.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; c.border = { bottom: { style: 'thin' } } })
  for (const f of filasDeInforme(i)) {
    const fila = d.addRow(f)
    const color = f[1] === 'Con error' ? ROJO : f[1] === 'Con advertencia' ? AMBAR : VERDE
    fila.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
    fila.getCell(9).numFmt = '#,##0'
    fila.getCell(10).alignment = { wrapText: true, vertical: 'top' }
    fila.getCell(11).alignment = { wrapText: true, vertical: 'top' }
  }
  d.columns = [{ width: 7 }, { width: 17 }, { width: 16 }, { width: 14 }, { width: 12 }, { width: 13 }, { width: 12 }, { width: 18 }, { width: 11 }, { width: 52 }, { width: 52 }]
  d.views = [{ state: 'frozen', ySplit: 1 }]
  d.autoFilter = { from: 'A1', to: 'K1' }
  return Buffer.from(await wb.xlsx.writeBuffer())
}
