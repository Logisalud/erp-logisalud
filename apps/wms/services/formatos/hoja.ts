import ExcelJS from 'exceljs'

// Utilidades para trabajar con una plantilla .xlsx OFICIAL: cargarla y leer su rejilla (anchos, alturas, celdas combinadas, bordes, fuentes, logo) para dibujar el PDF
// idéntico al Excel. El Excel y el PDF salen siempre de la misma hoja ya llena.

export async function cargarPlantilla(b64: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(b64, 'base64') as unknown as ArrayBuffer)
  return wb
}

export interface LadoBorde { w: number }
export interface RegionHoja {
  x: number; y: number; w: number; h: number
  /** Texto de la celda, o '' */
  texto: string
  fuente: { tam: number; negrita: boolean; cursiva: boolean; angosta: boolean }
  h_align: 'left' | 'center' | 'right'
  v_align: 'top' | 'middle' | 'bottom'
  ajustar: boolean
  sangria: number
  relleno?: string
  bordes: { l?: LadoBorde; r?: LadoBorde; t?: LadoBorde; b?: LadoBorde }
  /** Ancho (pt) que el texto puede ocupar si se desborda sobre celdas vacías a su derecha (como hace Excel). */
  desborde: number
}
export interface ImagenHoja { x: number; y: number; w: number; h: number; datos: string }
export interface ModeloHoja { ancho: number; alto: number; regiones: RegionHoja[]; imagenes: ImagenHoja[] }

const PX_A_PT = 0.75
/** Ancho de columna de Excel (caracteres) → pt. Con Calibri 11 el dígito mide 7 px. */
const anchoPt = (caracteres: number) => Math.round(caracteres * 7 + 5) * PX_A_PT
const EMU_A_PT = 1 / 12700

function textoDe(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const o = v as unknown as { richText?: { text: string }[]; result?: unknown; text?: string }
  if (o.richText) return o.richText.map((x) => x.text).join('')
  if (o.result !== undefined && o.result !== null) return String(o.result)
  return o.text ?? ''
}
const grosor = (estilo?: string) => (!estilo ? 0 : estilo === 'hair' ? 0.25 : estilo === 'thin' || estilo === 'dotted' || estilo === 'dashed' ? 0.5 : estilo === 'medium' ? 1 : estilo === 'thick' ? 1.5 : 0.75)
const rgb = (argb?: string) => (argb && argb.length === 8 ? `#${argb.slice(2)}` : undefined)

export function modeloHoja(wb: ExcelJS.Workbook): ModeloHoja {
  const ws = wb.worksheets[0]
  const dim = ws.dimensions as unknown as { top: number; left: number; bottom: number; right: number }
  const anchoDe = (c: number) => anchoPt(ws.getColumn(c).width ?? ws.properties.defaultColWidth ?? 8.43)
  const altoDe = (r: number) => ws.getRow(r).height ?? ws.properties.defaultRowHeight ?? 15
  const colX: number[] = []; let acc = 0
  for (let c = dim.left; c <= dim.right + 1; c++) { colX[c] = acc; acc += c <= dim.right ? anchoDe(c) : 0 }
  const rowY: number[] = []; acc = 0
  for (let r = dim.top; r <= dim.bottom + 1; r++) { rowY[r] = acc; acc += r <= dim.bottom ? altoDe(r) : 0 }

  // celdas combinadas: la esquina superior izquierda manda
  const combinadas = new Map<string, { top: number; left: number; bottom: number; right: number }>()
  const cubiertas = new Set<string>()
  for (const m of (ws.model as unknown as { merges: string[] }).merges ?? []) {
    const [a, b] = m.split(':')
    const A = ws.getCell(a); const B = ws.getCell(b)
    const rg = { top: Number(A.row), left: Number(A.col), bottom: Number(B.row), right: Number(B.col) }
    combinadas.set(`${rg.top},${rg.left}`, rg)
    for (let r = rg.top; r <= rg.bottom; r++) for (let c = rg.left; c <= rg.right; c++) if (r !== rg.top || c !== rg.left) cubiertas.add(`${r},${c}`)
  }
  const vacia = (r: number, c: number) => !cubiertas.has(`${r},${c}`) && !combinadas.has(`${r},${c}`) && textoDe(ws.getCell(r, c).value) === ''

  const regiones: RegionHoja[] = []
  for (let r = dim.top; r <= dim.bottom; r++) {
    for (let c = dim.left; c <= dim.right; c++) {
      if (cubiertas.has(`${r},${c}`)) continue
      const cel = ws.getCell(r, c)
      const rg = combinadas.get(`${r},${c}`) ?? { top: r, left: c, bottom: r, right: c }
      const b = cel.border ?? {}
      const bordes = { l: grosor(b.left?.style) ? { w: grosor(b.left?.style) } : undefined, r: grosor(b.right?.style) ? { w: grosor(b.right?.style) } : undefined, t: grosor(b.top?.style) ? { w: grosor(b.top?.style) } : undefined, b: grosor(b.bottom?.style) ? { w: grosor(b.bottom?.style) } : undefined }
      const texto = textoDe(cel.value)
      const fill = cel.fill && (cel.fill as ExcelJS.FillPattern).pattern === 'solid' ? rgb((cel.fill as ExcelJS.FillPattern).fgColor?.argb) : undefined
      if (!texto && !fill && !bordes.l && !bordes.r && !bordes.t && !bordes.b) continue
      const w = colX[rg.right + 1] - colX[rg.left]
      let desborde = w
      const al = cel.alignment ?? {}
      if (rg.top === rg.bottom && rg.left === rg.right && texto && !al.wrapText && (al.horizontal === undefined || al.horizontal === 'left')) {
        for (let k = c + 1; k <= dim.right && vacia(r, k); k++) desborde += colX[k + 1] - colX[k]
      }
      const nombre = cel.font?.name ?? 'Calibri'
      regiones.push({
        x: colX[rg.left], y: rowY[rg.top], w, h: rowY[rg.bottom + 1] - rowY[rg.top], texto,
        fuente: { tam: cel.font?.size ?? 11, negrita: !!cel.font?.bold, cursiva: !!cel.font?.italic, angosta: /narrow/i.test(nombre) },
        h_align: al.horizontal === 'center' || al.horizontal === 'centerContinuous' ? 'center' : al.horizontal === 'right' ? 'right' : 'left',
        v_align: al.vertical === 'top' ? 'top' : al.vertical === 'middle' || (al.vertical as string) === 'center' ? 'middle' : 'bottom',
        ajustar: !!al.wrapText, sangria: al.indent ?? 0, relleno: fill, bordes, desborde,
      })
    }
  }

  const imagenes: ImagenHoja[] = []
  const medios = (wb.model as unknown as { media?: { buffer: Buffer; extension: string }[] }).media ?? []
  for (const im of ws.getImages()) {
    const m = medios[Number(im.imageId)]; if (!m) continue
    const R = im.range as unknown as { tl: { nativeCol: number; nativeRow: number; nativeColOff: number; nativeRowOff: number }; br?: { nativeCol: number; nativeRow: number; nativeColOff: number; nativeRowOff: number } }
    const px = (col: number, off: number) => (colX[col + 1] ?? 0) + off * EMU_A_PT
    const py = (row: number, off: number) => (rowY[row + 1] ?? 0) + off * EMU_A_PT
    const x1 = px(R.tl.nativeCol, R.tl.nativeColOff); const y1 = py(R.tl.nativeRow, R.tl.nativeRowOff)
    const x2 = R.br ? px(R.br.nativeCol, R.br.nativeColOff) : x1 + 100; const y2 = R.br ? py(R.br.nativeRow, R.br.nativeRowOff) : y1 + 30
    imagenes.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, datos: `data:image/${m.extension === 'jpg' ? 'jpeg' : m.extension};base64,${Buffer.from(m.buffer).toString('base64')}` })
  }
  return { ancho: colX[dim.right + 1], alto: rowY[dim.bottom + 1], regiones, imagenes }
}
