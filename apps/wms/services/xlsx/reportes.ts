import 'server-only'
import ExcelJS from 'exceljs'
import { describirFiltros, resumenDe, type DefinicionReporte, type FilaReporte, type Filtros } from '@/domain/reportes'

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Un reporte en Excel: mismas columnas y filtros que en pantalla; los números y las fechas van como tales (no como texto). */
export async function xlsxReporte(def: DefinicionReporte, filas: FilaReporte[], filtros: Filtros): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'WMS LOGISALUD'
  wb.created = new Date()
  const ws = wb.addWorksheet(def.titulo.slice(0, 31), { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  ws.getCell('A1').value = def.titulo
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = `LOGISALUD · ${describirFiltros(def, filtros)}`
  ws.getCell('A2').font = { color: { argb: 'FF6B7280' } }
  const r = resumenDe(def, filas)
  ws.getCell('A3').value = [`${r.filas} filas`, ...r.sumas.map((s) => `${s.etiqueta}: ${s.total.toLocaleString('es-PE')}`), r.extra].filter(Boolean).join(' · ')
  ws.addRow([])
  const cab = ws.addRow(def.columnas.map((c) => c.etiqueta))
  cab.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; c.border = { bottom: { style: 'thin' } } })
  for (const f of filas) {
    const fila = ws.addRow(def.columnas.map((c) => {
      const v = f[c.clave]
      if (v === null || v === undefined || v === '') return null
      if (c.tipo === 'fecha') { const d = new Date(`${String(v)}T12:00:00Z`); return Number.isNaN(d.getTime()) ? String(v) : d }
      return v
    }))
    def.columnas.forEach((c, i) => {
      const celda = fila.getCell(i + 1)
      if (c.tipo === 'fecha') celda.numFmt = 'dd/mm/yyyy'
      else if (c.tipo === 'numero') celda.numFmt = '#,##0'
      else if (c.tipo === 'porcentaje') celda.numFmt = '0.0"%"'
    })
  }
  ws.columns = def.columnas.map((c) => ({ width: c.tipo === 'numero' || c.tipo === 'fecha' || c.tipo === 'porcentaje' ? 14 : Math.min(Math.max(c.etiqueta.length + 4, 16), 44) }))
  ws.views = [{ state: 'frozen', ySplit: 5 }]
  return Buffer.from(await wb.xlsx.writeBuffer())
}
