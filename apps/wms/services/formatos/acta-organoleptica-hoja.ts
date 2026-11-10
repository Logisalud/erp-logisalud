import 'server-only'
import type ExcelJS from 'exceljs'
import { organolepticaEsBorrador, MARCA_BORRADOR } from '@/domain/borrador-documento'
import { valoresActaOrganoleptica, type ExtraActaOrganoleptica } from '@/domain/acta-organoleptica-formato'
import type { OrganolepticaVista } from '@/domain/entradas-vistas'
import { cargarPlantilla } from './hoja'
import { PLANTILLA_LS_FR_55_02_B64 } from './plantilla-ls-fr-55-02'

/** La plantilla OFICIAL LS-FR.55.02 llena con los datos del acta. De aquí salen el Excel y el PDF, así que son iguales. */
export async function hojaActaOrganoleptica(a: OrganolepticaVista, extra: ExtraActaOrganoleptica = {}): Promise<ExcelJS.Workbook> {
  const wb = await cargarPlantilla(PLANTILLA_LS_FR_55_02_B64)
  const ws = wb.worksheets[0]
  const valores = valoresActaOrganoleptica(a, extra)

  // La observación es larga: se junta en una sola fila de punta a punta, con el texto ajustado, y la fila crece con el texto (como hace Excel al ajustar).
  const obs = valores.C33?.texto ?? 'OBSERVACION: '
  ws.mergeCells('C33:AG33')
  const lineas = Math.max(1, Math.ceil((obs.length * 3.9) / 640))
  ws.getRow(33).height = Math.max(12.8, lineas * 10.5 + 2)

  for (const [dir, { texto, centro }] of Object.entries(valores)) {
    const celda = ws.getCell(dir)
    celda.value = texto
    celda.alignment = { ...(celda.alignment ?? {}), ...(centro ? { horizontal: 'center' } : {}), vertical: dir === 'C33' ? 'top' : (celda.alignment?.vertical ?? 'middle'), ...(dir === 'C33' ? { wrapText: true, horizontal: 'left' } : { shrinkToFit: true }) }
    if (centro) celda.font = { ...(celda.font ?? {}), bold: true }
  }

  // Estados de control que el formato no tiene: la marca de borrador va fuera de la tabla, en la fila 1, y el número y la huella, en el pie de impresión.
  if (organolepticaEsBorrador(a)) {
    ws.getCell('B1').value = MARCA_BORRADOR
    ws.getCell('B1').font = { bold: true, size: 9, color: { argb: 'FF92400E' } }
    ws.getRow(1).height = 12
    ws.headerFooter = { ...(ws.headerFooter ?? {}), oddHeader: `&C&B&K92400E${MARCA_BORRADOR}` }
  }
  ws.headerFooter = { ...(ws.headerFooter ?? {}), oddFooter: `&L&7Acta ${a.numero} · ${a.estado === 'FIRMADA' ? `firmada electrónicamente · huella SHA-256 ${a.hash ?? ''}` : 'borrador, pendiente de firmas'}` }
  wb.creator = 'WMS LOGISALUD'
  wb.title = `Acta de Evaluación Organoléptica ${a.numero}`
  return wb
}
