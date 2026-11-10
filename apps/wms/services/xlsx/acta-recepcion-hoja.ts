import 'server-only'
import ExcelJS from 'exceljs'
import { MARCA_BORRADOR, actaRecepcionEsBorrador } from '@/domain/borrador-documento'
import { PIE_FORMATO, modeloActaRecepcion, type CeldaFormato, type TablaFormato } from '@/domain/acta-recepcion-formato'
import type { ActaRecepcionVista } from '@/domain/entradas-vistas'
import { formatoFechaHora } from '@/domain/fechas'
import { LOGO_FORMATO } from '../pdf-logo-formato'

// Acta de Recepción de Productos en Excel: el formato oficial LS-FR.03.05 (el mismo modelo que dibuja el PDF). Las cinco tablas tienen cuadrículas de columnas distintas; en la hoja
// se unen en una sola, con celdas combinadas, para que cada celda quede donde está en el formato. Anchos y alturas salen de la rejilla del .docx (twips).

const ANCHO_PT = 766
const SEPARACION_PT = 5
const VERDE = 'FF4BB168'
const borde: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }

/** Ancho de columna de Excel (caracteres) que mide `pt` puntos (Calibri 11: un dígito = 7 px). */
const caracteres = (pt: number) => Math.max(0.5, (pt / 0.75 - 5) / 7)
const clave = (x: number) => Math.round(x * 10000)

export async function hojaActaRecepcion(acta: ActaRecepcionVista): Promise<ExcelJS.Workbook> {
  const m = modeloActaRecepcion(acta)
  const tablas: TablaFormato[] = [m.encabezado, m.datos, ...m.productos, m.verificacion, m.firmas]

  // columnas finas = todas las aristas de todas las tablas, normalizadas al ancho total
  const aristas = new Set<number>([0, 10000])
  const posiciones = (t: TablaFormato) => { const tot = t.cols.reduce((a, b) => a + b, 0); let acc = 0; return [0, ...t.cols.map((w) => { acc += w; return clave(acc / tot) })] }
  for (const t of tablas) for (const p of posiciones(t)) aristas.add(p)
  const orden = [...aristas].sort((a, b) => a - b)
  const indice = new Map(orden.map((p, i) => [p, i]))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'WMS LOGISALUD'
  wb.title = `Acta de Recepción de Productos ${acta.numero}`
  const ws = wb.addWorksheet('LS-FR.03.05', { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.25 } } })
  ws.columns = orden.slice(1).map((p, i) => ({ width: caracteres(((p - orden[i]) / 10000) * ANCHO_PT) }))

  // fila 1: marca de borrador / acta anulada (fuera del formato)
  let fila = 1
  const nota = acta.estado === 'ANULADA' ? `ACTA ANULADA el ${formatoFechaHora(acta.anuladaEn)}. Motivo: ${acta.motivoAnulacion ?? ''}.${acta.reemplazadaPorNumero ? ` Reemplazada por ${acta.reemplazadaPorNumero}.` : ''}` : acta.reemplazaANumero ? `Reemplaza al acta ${acta.reemplazaANumero}.` : ''
  if (actaRecepcionEsBorrador(acta)) {
    ws.getCell('A1').value = MARCA_BORRADOR
    ws.getCell('A1').font = { bold: true, size: 10, color: { argb: 'FF92400E' } }
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
    ws.headerFooter = { oddHeader: `&C&B&K92400E${MARCA_BORRADOR}` }
  } else if (nota) { ws.getCell('A1').value = nota; ws.getCell('A1').font = { bold: true, size: 9, color: { argb: acta.estado === 'ANULADA' ? 'FFB91C1C' : 'FF374151' } } }
  ws.getRow(1).height = 13
  fila = 2

  const logos: { fila: number; col: number; filaFin: number; colFin: number }[] = []
  for (const [n, t] of tablas.entries()) {
    const pos = posiciones(t)
    const filaIni = fila
    t.filas.forEach((tw, r) => { ws.getRow(filaIni + r).height = Math.max(tw / 20, 13, t.altos?.[r] ?? 0) })
    for (const c of t.celdas as CeldaFormato[]) {
      const f1 = filaIni + c.r; const f2 = f1 + (c.rs ?? 1) - 1
      const c1 = (indice.get(pos[c.c]) ?? 0) + 1; const c2 = (indice.get(pos[c.c + (c.cs ?? 1)]) ?? 1)
      if (f2 > f1 || c2 > c1) ws.mergeCells(f1, c1, f2, c2)
      const celda = ws.getCell(f1, c1)
      const texto = typeof c.t === 'string' ? c.t : 'firma' in c.t ? (c.t.firmada ? (c.t.firma === 'TRANSPORTISTA' ? 'Firma registrada' : 'Firma electrónica') : '') : ''
      if ('logo' in (typeof c.t === 'object' ? c.t : {})) logos.push({ fila: f1, col: c1, filaFin: f2, colFin: c2 })
      celda.value = texto || null
      celda.font = { name: 'Calibri', size: c.tam ?? 8, bold: !!c.negrita, ...(typeof c.t === 'object' && 'firma' in c.t ? { size: 7, bold: false } : {}) }
      celda.alignment = { horizontal: c.centro || (typeof c.t === 'object') ? 'center' : 'left', vertical: 'middle', wrapText: true, indent: 0 }
      for (let rr = f1; rr <= f2; rr++) for (let cc = c1; cc <= c2; cc++) {
        const x = ws.getCell(rr, cc)
        x.border = { top: borde, left: borde, bottom: borde, right: borde }
        if (c.verde) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
      }
    }
    fila = filaIni + t.filas.length
    if (n < tablas.length - 1) { ws.getRow(fila).height = SEPARACION_PT; fila += 1 }
  }

  // logo oficial en su celda (el mismo PNG del .docx)
  const imagen = wb.addImage({ buffer: Buffer.from(LOGO_FORMATO.split(',')[1], 'base64') as unknown as ExcelJS.Buffer, extension: 'png' })
  for (const l of logos) ws.addImage(imagen, { tl: { col: l.col - 1 + 0.08, row: l.fila - 1 + 0.08 }, br: { col: l.colFin - 0.08, row: l.filaFin - 0.08 }, editAs: 'oneCell' } as unknown as ExcelJS.ImageRange)

  if (m.observaciones) { ws.getRow(fila).height = 13; ws.getCell(fila, 1).value = `OBSERVACIONES: ${m.observaciones}`; ws.getCell(fila, 1).font = { name: 'Calibri', size: 8, bold: true }; fila += 1 }

  // pie del formato
  fila += 1
  ws.mergeCells(fila, 1, fila, orden.length - 1)
  const pie = ws.getCell(fila, 1)
  pie.value = PIE_FORMATO
  pie.font = { name: 'Arial', size: 9, bold: true, italic: true }
  pie.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.headerFooter = { ...(ws.headerFooter ?? {}), oddFooter: `&L&7Acta ${acta.numero} · ${acta.estado === 'FIRMADA' ? `firmada electrónicamente el ${formatoFechaHora(acta.firmadaEn)}` : acta.estado === 'BORRADOR' ? 'borrador, pendiente de firmas' : acta.estado.toLowerCase()} · huella SHA-256 ${acta.hash}` }
  return wb
}
