// Acta de Evaluación Organoléptica: el Excel es la plantilla OFICIAL LS-FR.55.02 llena y el PDF dibuja esa misma hoja.
// Se comprueba que la plantilla no se altera (combinaciones, textos del formato) y que cada respuesta cae en su casilla.
import { inflateSync } from 'node:zlib'
import ExcelJS from 'exceljs'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { renderActaOrganoleptica } from '@/services/pdf/acta-organoleptica'
import { xlsxActaOrganoleptica } from '@/services/xlsx/documentos'
import { valoresActaOrganoleptica } from '@/domain/acta-organoleptica-formato'
import type { OrganolepticaVista } from '@/domain/entradas-vistas'

let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; repo = new RepositorioDemo() })

function textoDelPdf(pdf: Buffer): string {
  const bytes = pdf.toString('latin1'); const partes: string[] = []
  for (const m of bytes.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let contenido: string
    try { contenido = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1') } catch { continue }
    for (const t of contenido.matchAll(/\[((?:<[0-9a-fA-F]*>|\([^)]*\)|-?[\d.]+|\s)*)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj|\(([^)]*)\)\s*Tj/g)) {
      const hex = (h: string) => h.match(/../g)?.map((x) => String.fromCharCode(parseInt(x, 16))).join('') ?? ''
      if (t[1] !== undefined) partes.push([...t[1].matchAll(/<([0-9a-fA-F]*)>|\(([^)]*)\)/g)].map((x) => (x[1] !== undefined ? hex(x[1]) : x[2])).join(''))
      else partes.push(t[2] !== undefined ? hex(t[2]) : t[3])
    }
  }
  return partes.join('\n')
}
async function unaActa(): Promise<OrganolepticaVista> {
  for (const s of await repo.listarSolicitudes()) { const d = await repo.obtenerSolicitud(s.id); const o = d?.organolepticas[0]; if (o) return (await repo.obtenerOrganoleptica(o.id))! }
  throw new Error('la demo no trae un acta organoléptica')
}
const hoja = async (x: Buffer) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(x as unknown as ArrayBuffer); return wb.worksheets[0] }
const base = (): OrganolepticaVista => ({
  id: 'x', numero: 'O-202611-0001', estado: 'FIRMADA', solicitudId: 's', solicitudNumero: 'S-1', ingresoTipo: 'COMPRA_LOCAL', ingresoLoteId: 'l', productoId: 'p', productoCodigo: 'P1', producto: 'PRODUCTO DE PRUEBA',
  lote: 'L-1', vence: '2028-06-30', propietario: 'LOGISSA', cantidadLote: 100, cantidadMuestra: 5, creadaEn: '2026-11-07T15:00:00Z',
  datos: { certAnalisis: true, checklist: {}, destinoSugerido: 'APROBADO', conclusion: 'CONFORME' },
})

describe('valores del formato LS-FR.55.02', () => {
  it('las preguntas positivas (Cerrado, Limpio…) marcan SÍ si es conforme; las negativas (Arrugado, Quebrado…) marcan NO si es conforme, y SÍ si hay problema', () => {
    const a = base()
    a.datos.checklist = { emb_cerrado: 'C', emb_limpio: 'NC', emb_sin_arrugas: 'C', emb_sin_quiebres: 'NC', emb_sin_humedad: 'NA' }
    const v = valoresActaOrganoleptica(a)
    expect(v.D17?.texto).toBe('X')    // Cerrado: conforme → SÍ
    expect(v.E18?.texto).toBe('X')    // Limpio: no conforme → NO
    expect(v.E19?.texto).toBe('X')    // Arrugado: conforme (no está arrugado) → NO
    expect(v.D20?.texto).toBe('X')    // Quebrado: no conforme (está quebrado) → SÍ
    expect(v.D21).toBeUndefined(); expect(v.E21).toBeUndefined()   // Húmedo: no aplica → sin marca
  })
  it('«Deterioro del producto o deformación, Manchas» es una sola fila: un no conforme en cualquiera de los dos ítems la marca', () => {
    const a = base(); a.datos.checklist = { mediato_sin_deterioro: 'C', mediato_sin_manchas: 'NC' }
    expect(valoresActaOrganoleptica(a).M23?.texto).toBe('X')   // SÍ hay deterioro o manchas
  })
  it('motivo, destino, conclusión, certificado y datos del producto van en sus celdas', () => {
    const v = valoresActaOrganoleptica(base(), { contraparte: 'PROVEEDOR SAC', cantidadPedida: 120 })
    expect(v.L7?.texto).toBe('X'); expect(v.H35?.texto).toBe('X'); expect(v.M37?.texto).toBe('X'); expect(v.AE13?.texto).toBe('SI')
    expect(v.F11?.texto).toBe('PRODUCTO DE PRUEBA'); expect(v.F14?.texto).toBe('PROVEEDOR SAC'); expect(v.X12?.texto).toBe('120'); expect(v.Z12?.texto).toBe('100'); expect(v.AF12?.texto).toBe('5')
  })
})

describe('el Excel es la plantilla oficial llena', () => {
  it('conserva los textos fijos del formato, sus celdas combinadas y el logo', async () => {
    const ws = await hoja(await xlsxActaOrganoleptica(await unaActa()))
    expect(ws.getCell('J2').value).toBe('ACTA DE EVALUACIÓN ORGANOLÉPTICA')
    expect(String(ws.getCell('AB2').value)).toBe('LS-POE.04.05'); expect(String(ws.getCell('AB3').value)).toBe('LS-FR.55.02')
    expect(String(ws.getCell('J4').value)).toContain('01-09-2026')
    expect(String(ws.getCell('C47').value)).toContain('LOGISSA S.A.C.')
    expect(String(ws.getCell('D35').value)).toBe('APROBADO:'); expect(String(ws.getCell('T37').value)).toBe('NO CONFORME')
    expect(ws.getImages().length).toBe(1)
    expect((ws.model as unknown as { merges: string[] }).merges.length).toBeGreaterThanOrEqual(113)
  })
  it('lleva los datos del acta en las celdas del formato', async () => {
    const a = await unaActa()
    const ws = await hoja(await xlsxActaOrganoleptica(a, { contraparte: 'PROVEEDOR SAC', cantidadPedida: 77 }))
    expect(String(ws.getCell('F11').value)).toBe(a.producto)
    expect(String(ws.getCell('X11').value)).toBe(a.lote)
    expect(String(ws.getCell('F14').value)).toBe('PROVEEDOR SAC')
    expect(String(ws.getCell('X12').value)).toBe('77')
    expect(String(ws.getCell('C33').value)).toMatch(/^OBSERVACION:/)
  })
})

describe('el PDF dibuja esa misma hoja', () => {
  it('trae los textos del formato oficial y los datos del acta', async () => {
    const a = await unaActa()
    const texto = textoDelPdf(await renderActaOrganoleptica(a, { contraparte: 'PROVEEDOR SAC', cantidadPedida: 77 })).replace(/\s+/g, ' ')
    for (const t of ['ACTA DE EVALUACIÓN ORGANOLÉPTICA', 'LS-POE.04.05', 'LS-FR.55.02', 'Fecha de vigencia', 'MOTIVO', 'Nombre del producto:', 'Registro Sanitario:', 'Embalaje:', 'Envase Mediato:', 'Envase Inmediato:', 'Rotulado Mediato:', 'Rotulado Inmediato:', 'OBSERVACION:', 'DESTINO:', 'CONCLUSION:', 'Fecha y hora:', 'Vº Bº DIRECTOR TECNICO', 'LOGISSA S.A.C.', a.producto, 'PROVEEDOR SAC']) {
      expect(texto, `falta «${t}»`).toContain(t)
    }
    expect(texto).not.toContain('REVISADO POR')
    expect(texto).not.toContain('Leyenda:')
  })
})
