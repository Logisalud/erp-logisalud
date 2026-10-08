import 'server-only'
import ExcelJS from 'exceljs'
import { CHECKLIST_ORGANOLEPTICO, ETIQUETA_DECISION, ETIQUETA_TIPO_INGRESO } from '@/domain/entradas'
import type { ActaRecepcionVista, OrganolepticaVista, SolicitudDetalle } from '@/domain/entradas-vistas'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'

// Versión Excel de los documentos del ingreso (mismos datos que el PDF). El RUC va siempre como texto.

const VERDE = 'FF4BB168'
const GRIS = 'FFF3F4F6'

function libro(titulo: string, hoja: string, subtitulo: string) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'WMS LOGISALUD'
  wb.created = new Date()
  const ws = wb.addWorksheet(hoja, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  ws.getCell('A1').value = titulo
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = subtitulo
  ws.getCell('A2').font = { color: { argb: 'FF6B7280' } }
  ws.addRow([])
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

export async function xlsxActaRecepcion(acta: ActaRecepcionVista): Promise<Buffer> {
  const c = acta.contenido
  const i = c.ingreso
  const { wb, ws } = libro(`Acta de Recepción de Productos ${acta.numero}`, 'Acta de recepción', `Formato LS-FR.03.05 · ${acta.estado === 'FIRMADA' ? `firmada el ${formatoFechaHora(acta.firmadaEn)}` : acta.estado.toLowerCase()} · huella ${acta.hash}`)
  ws.columns = [{ width: 30 }, { width: 44 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }]
  pares(ws, [
    ['Solicitud', c.solicitud ? `${c.solicitud.numero} (v${c.solicitud.version})` : undefined],
    ['Tipo de ingreso', ETIQUETA_TIPO_INGRESO[i.tipo]],
    ['Propietario del stock', i.propietario],
    [i.tipo === 'COMPRA_LOCAL' ? 'Proveedor' : 'Cliente', i.contraparteNombre],
    ['RUC', i.contraparteRuc ? String(i.contraparteRuc) : undefined],
    ['O.C.', i.ocCodigo], ['Guía de remisión', i.guiaNumero], ['Factura', i.facturaNumero],
    ['Documento original', i.docOriginalNumero ? `${i.docOriginalTipo ?? ''} ${i.docOriginalNumero}`.trim() : undefined],
    ['Temperatura (°C)', i.temperaturaC], ['Bultos', i.bultos], ['Paletas', i.paletas], ['Placa', i.placa], ['Tipo de conteo', i.tipoConteo],
    ['Observaciones', i.observaciones],
  ])
  titulo(ws, 'PRODUCTOS')
  encabezado(ws, ['Código', 'Descripción', 'R.S.', 'Lote', 'F. expira', 'Cant. solicitud', 'Cant. recibida', 'Posición'])
  for (const l of c.lineas) {
    if (l.lotes.length === 0) ws.addRow([l.codigo, l.descripcion, l.registroSanitario ?? '—', '—', '—', l.cantidadEstablecida, l.cantidadRecibida, '—'])
    for (const x of l.lotes) ws.addRow([l.codigo, l.descripcion, l.registroSanitario ?? '—', x.lote, x.venceTexto ?? formatoFecha(x.vence), x.cantidadInicial ?? l.cantidadEstablecida, x.cantidad, x.posicion])
  }
  titulo(ws, 'FIRMAS')
  encabezado(ws, ['Rol', 'Nombre', 'DNI', 'Placa', 'Fecha y hora'])
  for (const f of acta.firmas) ws.addRow([f.rol, f.nombre ?? '—', f.dni ? String(f.dni) : '—', f.placa ?? '—', formatoFechaHora(f.firmadoEn)])
  return salida(wb)
}

export async function xlsxActaOrganoleptica(a: OrganolepticaVista): Promise<Buffer> {
  const { wb, ws } = libro(`Acta de Análisis Organoléptico ${a.numero}`, 'Acta organoléptica', `Formato LS-FR.55.02 · ${a.estado === 'FIRMADA' ? `firmada · huella ${a.hash}` : a.estado === 'PENDIENTE_DT' ? 'pendiente de la decisión de Dirección Técnica' : 'borrador'}`)
  ws.columns = [{ width: 34 }, { width: 50 }, { width: 16 }]
  pares(ws, [
    ['Motivo', a.ingresoTipo === 'COMPRA_LOCAL' ? 'Compra' : a.ingresoTipo === 'DEVOLUCION' ? 'Devolución' : 'Otros (ingreso de cliente)'],
    ['Referencia', a.referencia], ['Solicitud', a.solicitudNumero], ['Producto', a.producto], ['Lote', a.lote],
    ['Nombre genérico', a.principioActivo], ['Vencimiento', a.vence ? formatoFecha(a.vence) : undefined],
    ['Cantidad recibida', a.cantidadLote], ['Cantidad de muestra', a.cantidadMuestra],
    ['Registro sanitario', a.registroSanitario], ['Vencimiento del R.S.', a.rsVence ? formatoFecha(a.rsVence) : undefined],
    ['Fabricante / proveedor', a.fabricante], ['Forma de presentación', a.formaPresentacion], ['Propietario', a.propietario],
    ['Certificado de análisis / protocolo', a.datos.certAnalisis == null ? undefined : a.datos.certAnalisis ? 'SÍ' : 'NO'],
  ])
  const c = a.datos.checklist
  for (const g of CHECKLIST_ORGANOLEPTICO.filter((g) => !g.opcional || g.items.some((i) => c[i.id]))) {
    titulo(ws, g.titulo.toUpperCase())
    for (const i of g.items) {
      const r = ws.addRow([i.texto, c[i.id] ? (c[i.id] === 'C' ? 'SÍ' : c[i.id] === 'NC' ? 'NO' : 'N.A.') : '—'])
      r.getCell(2).font = { bold: true }
    }
  }
  titulo(ws, 'OBSERVACIÓN, DESTINO Y CONCLUSIÓN')
  pares(ws, [
    ['Observación', a.datos.observacion],
    ['Destino sugerido', a.datos.destinoSugerido === 'APROBADO' ? 'APROBADO' : a.datos.destinoSugerido === 'DEVOLUCION' ? 'DEVOLUCIÓN' : a.datos.destinoSugerido === 'BAJA' ? 'BAJA' : undefined],
    ['Conclusión', a.datos.conclusion === 'CONFORME' ? 'CONFORME' : a.datos.conclusion === 'NO_CONFORME' ? 'NO CONFORME' : undefined],
    ['Decisión de Dirección Técnica', a.decision ? ETIQUETA_DECISION[a.decision] : 'pendiente'],
    ['Decidido por', a.decididoPor ? `${a.decididoPor} · ${formatoFechaHora(a.decididoEn)}` : undefined],
    ['Observación de Dirección Técnica', a.observacionDt],
  ])
  return salida(wb)
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
