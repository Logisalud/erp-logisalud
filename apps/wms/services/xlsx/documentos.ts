import 'server-only'
import { ETIQUETA_REGIMEN } from '@/domain/muestreo'
import ExcelJS from 'exceljs'
import { CHECKLIST_ORGANOLEPTICO, ETIQUETA_DECISION, ETIQUETA_TIPO_INGRESO } from '@/domain/entradas'
import type { ActaRecepcionVista, OrganolepticaVista, SolicitudDetalle } from '@/domain/entradas-vistas'
import { totalesKardex, type FilaKardex, type FiltroKardex } from '@/domain/inventario'
import { formatoFecha, formatoFechaHora, textoVencimiento } from '@/domain/fechas'
import type { ExtraActaOrganoleptica } from '@/domain/acta-organoleptica-formato'
import { hojaActaOrganoleptica } from '../formatos/acta-organoleptica-hoja'
import { hojaActaRecepcion } from './acta-recepcion-hoja'
import { MARCA_BORRADOR, actaRecepcionEsBorrador, organolepticaEsBorrador } from '@/domain/borrador-documento'

// Versión Excel de los documentos del ingreso (mismos datos que el PDF). El RUC va siempre como texto.

const VERDE = 'FF4BB168'
const GRIS = 'FFF3F4F6'

function libro(titulo: string, hoja: string, subtitulo: string, borrador = false) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'WMS LOGISALUD'
  wb.created = new Date()
  const ws = wb.addWorksheet(hoja, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  ws.getCell('A1').value = titulo
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = subtitulo
  ws.getCell('A2').font = { color: { argb: 'FF6B7280' } }
  ws.addRow([])
  if (borrador) {
    // Fila 3: la marca, bien visible, y también en el encabezado de impresión de cada página.
    ws.getCell('A3').value = MARCA_BORRADOR
    ws.getCell('A3').font = { bold: true, size: 12, color: { argb: 'FF92400E' } }
    ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
    ws.headerFooter.oddHeader = `&C&B&K92400E${MARCA_BORRADOR}`
  }
  return { wb, ws }
}

const pares = (ws: ExcelJS.Worksheet, filas: [string, string | number | undefined | null][]) => {
  for (const [k, v] of filas) {
    const r = ws.addRow([k, v === undefined || v === null || v === '' ? '—' : v])
    r.getCell(1).font = { bold: true }
    r.getCell(2).alignment = { horizontal: 'left', wrapText: true }
  }
}

const encabezado = (ws: ExcelJS.Worksheet, cols: string[]) => {
  const r = ws.addRow(cols)
  r.eachCell((c) => {
    c.font = { bold: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }
    c.border = { bottom: { style: 'thin' } }
  })
}

const titulo = (ws: ExcelJS.Worksheet, t: string) => {
  ws.addRow([])
  const r = ws.addRow([t])
  r.getCell(1).font = { bold: true, color: { argb: VERDE } }
}

const salida = async (wb: ExcelJS.Workbook) => Buffer.from(await wb.xlsx.writeBuffer())

export async function xlsxSolicitudIngreso(sol: SolicitudDetalle): Promise<Buffer> {
  const { wb, ws } = libro(`Solicitud de Ingreso ${sol.numero}`, 'Solicitud', `LOGISALUD · versión ${sol.version} · documento interno`)
  ws.columns = [{ width: 30 }, { width: 44 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 18 }]
  pares(ws, [
    ['Tipo de ingreso', ETIQUETA_TIPO_INGRESO[sol.tipo]],
    ['Propietario del stock', sol.propietario],
    [sol.tipo === 'COMPRA_LOCAL' ? 'Proveedor' : 'Cliente', sol.contraparteNombre],
    ['RUC', sol.contraparteRuc ? String(sol.contraparteRuc) : undefined],
    ['O.C.', sol.ocCodigo],
    ['Guía de remisión', sol.guiaNumero],
    ['Documento original', sol.docOriginalNumero ? `${sol.docOriginalTipo ?? ''} ${sol.docOriginalNumero}`.trim() : undefined],
    ['Motivo', sol.motivo],
    ['Observaciones', sol.observaciones],
    ['Llegada prevista', sol.fechaPrevista ? formatoFecha(sol.fechaPrevista) : undefined],
    ['Nace en', sol.estadoInicial === 'DEVOLUCIONES' ? 'Devoluciones' : 'Cuarentena'],
    ['Preparada', `${sol.creadoPor ?? '—'} · ${formatoFechaHora(sol.creadoEn)}`],
    ['Autorizada', sol.autorizadoPor ? `${sol.autorizadoPor} · ${formatoFechaHora(sol.autorizadoEn)}` : 'pendiente'],
  ])
  ws.getCell('B6').numFmt = '@'
  titulo(ws, 'PRODUCTOS QUE SE ESPERAN')
  encabezado(ws, ['Código', 'Descripción', 'Registro sanitario', 'Lote', 'Vence', 'Inicial', 'Final', 'Estado'])
  for (const l of sol.lineas) {
    ws.addRow([l.codigo, l.descripcion, l.registroSanitario ?? '—', l.lote, l.venceTexto ?? (l.vence ? formatoFecha(l.vence) : '—'), l.inicial ?? l.cantidad, l.cantidad,
      l.cantidad === 0 ? 'Ya no llega' : l.cantidad !== (l.inicial ?? l.cantidad) ? 'Ajustada' : 'Sin cambios'])
  }
  if (sol.cambios.length) {
    titulo(ws, 'CAMBIOS A LA SOLICITUD')
    encabezado(ws, ['Fecha', 'Usuario', 'Campo', 'Antes', 'Después', 'Motivo'])
    for (const c of sol.cambios) ws.addRow([formatoFechaHora(c.ts), c.usuario, c.campo, c.antes ?? '—', c.despues ?? '—', c.motivo ?? '—'])
  }
  return salida(wb)
}

/** Acta de Recepción: el formato oficial LS-FR.03.05 en Excel (el mismo modelo que dibuja el PDF). */
export async function xlsxActaRecepcion(acta: ActaRecepcionVista): Promise<Buffer> {
  return salida(await hojaActaRecepcion(acta))
}

/** Acta de Evaluación Organoléptica: la plantilla OFICIAL LS-FR.55.02 llena (la misma hoja de la que se dibuja el PDF). */
export async function xlsxActaOrganoleptica(a: OrganolepticaVista, extra: ExtraActaOrganoleptica = {}): Promise<Buffer> {
  return salida(await hojaActaOrganoleptica(a, extra))
}

const COLUMNAS_KARDEX = ['Producto', 'Tipo Documento', 'Nro Acta', 'Fecha Acta', 'Lote', 'Proveedor/Cliente', 'Ruc', 'Documento', 'Nro Doc.', 'Ubicación', 'Entrada', 'Salida', 'Saldo', 'Tipo de ingreso', 'Propietario']
const ANCHOS_KARDEX = [38, 22, 14, 14, 16, 34, 14, 22, 14, 14, 10, 10, 10, 18, 18]

/** Llena la hoja de un producto con el modelo de Kardex de Logisalud. `sinUbicacion` quita la columna «Ubicación» (el cliente no ve dónde está su mercadería). El RUC va como texto. */
function llenarHojaKardex(ws: ExcelJS.Worksheet, filas: FilaKardex[], filtro: { desde?: string; hasta?: string }, producto: string, sinUbicacion: boolean) {
  const t = totalesKardex(filas)
  const quitar = (v: unknown[]) => (sinUbicacion ? v.filter((_, i) => i !== 9) : v)
  ws.getCell('A3').value = `Rango: ${filtro.desde ? formatoFecha(filtro.desde) : 'desde el inicio'} — ${filtro.hasta ? formatoFecha(filtro.hasta) : 'hoy'} · Saldo inicial ${t.saldoInicial} · Entradas ${t.entradas} · Salidas ${t.salidas} · Saldo final ${t.saldoFinal}`
  ws.columns = quitar(ANCHOS_KARDEX).map((width) => ({ width: width as number }))
  encabezado(ws, quitar(COLUMNAS_KARDEX) as string[])
  ws.views = [{ state: 'frozen', ySplit: ws.rowCount }]
  const colRuc = 7
  for (const f of filas) {
    const r = ws.addRow(quitar([f.producto ?? producto, f.tipoDocumento, f.numeroActa ?? '', f.fechaActa ? formatoFecha(f.fechaActa.slice(0, 10)) : '', f.lote ?? '', f.contraparte ?? '',
      f.ruc ? String(f.ruc) : '', f.tipoDocRef ?? '', f.numeroDocRef ?? '', f.posicion ?? '', f.entrada ?? 0, f.salida ?? 0, f.saldo, f.tipoIngreso ?? '', f.propietario ?? '']))
    r.getCell(colRuc).numFmt = '@'
    if (f.esReversa) r.font = { color: { argb: 'FFB91C1C' } }
  }
}

const textoFormato = (formato: string) => `Cód. Formato: ${formato}${formato.includes('provisional') ? ' (provisional, pendiente de código controlado)' : ''}`

/** Kardex en Excel: las mismas columnas del formato de ejemplo. El RUC siempre va como texto de 11 dígitos. */
export async function xlsxKardex(filas: FilaKardex[], filtro: FiltroKardex, producto: string, formato: string): Promise<Buffer> {
  const { wb, ws } = libro('Tarjeta de Control de Existencias (Kardex)', 'Kardex', `${producto} · ${textoFormato(formato)}`)
  llenarHojaKardex(ws, filas, filtro, producto, false)
  return salida(wb)
}

const nombreHoja = (codigo: string, usados: Set<string>) => {
  const base = codigo.replace(/[\\/?*[\]:]/g, '-').slice(0, 28) || 'Producto'
  let n = base; let i = 2
  while (usados.has(n.toLowerCase())) n = `${base.slice(0, 26)}-${i++}`
  usados.add(n.toLowerCase())
  return n
}

/** El Kardex que descarga el cliente: el mismo modelo, una hoja por producto y SIN la ubicación. Sin movimientos, una hoja que lo dice. */
export async function xlsxKardexCliente(cliente: string, productos: { codigo: string; descripcion: string; filas: FilaKardex[] }[], filtro: { desde?: string; hasta?: string }, formato: string): Promise<Buffer> {
  const usados = new Set<string>()
  let wb: ExcelJS.Workbook | undefined
  const subtitulo = (p: { codigo: string; descripcion: string }) => `${cliente} · ${p.codigo} · ${p.descripcion} · ${textoFormato(formato)}`
  if (productos.length === 0) {
    const l = libro('Tarjeta de Control de Existencias (Kardex)', 'Kardex', `${cliente} · ${textoFormato(formato)}`)
    l.ws.getCell('A3').value = 'No hay movimientos para este rango.'
    return salida(l.wb)
  }
  for (const p of productos) {
    const nombre = nombreHoja(p.codigo, usados)
    let ws: ExcelJS.Worksheet
    if (!wb) { const l = libro('Tarjeta de Control de Existencias (Kardex)', nombre, subtitulo(p)); wb = l.wb; ws = l.ws }
    else {
      ws = wb.addWorksheet(nombre, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
      ws.getCell('A1').value = 'Tarjeta de Control de Existencias (Kardex)'; ws.getCell('A1').font = { bold: true, size: 14 }
      ws.getCell('A2').value = subtitulo(p); ws.getCell('A2').font = { color: { argb: 'FF6B7280' } }
      ws.addRow([])
    }
    llenarHojaKardex(ws, p.filas, filtro, `${p.codigo} · ${p.descripcion}`, true)
  }
  return salida(wb!)
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
