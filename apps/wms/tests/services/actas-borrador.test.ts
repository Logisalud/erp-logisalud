// Piloto · errores de la demo (E-3): las actas se descargan aunque falten firmas, marcadas «BORRADOR, pendiente de firmas» en el PDF y en la hoja de Excel.
// Con las firmas completas, sin marca.
import { inflateSync } from 'node:zlib'
import ExcelJS from 'exceljs'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { FIRMA_PNG_EJEMPLO } from '@/services/firma-imagen'
import { renderActaRecepcion } from '@/services/pdf/acta-recepcion'
import { renderActaOrganoleptica } from '@/services/pdf/acta-organoleptica'
import { xlsxActaOrganoleptica, xlsxActaRecepcion } from '@/services/xlsx/documentos'
import { MARCA_BORRADOR, actaRecepcionEsBorrador, nombreArchivoActa, organolepticaEsBorrador } from '@/domain/borrador-documento'
import type { Actor } from '@/services/repositorio'

const actor = (rol: Actor['roles'][number], nombre: string = rol): Actor => ({ id: `demo:${rol}`, nombre, roles: [rol] })
const CHARLIE = actor('jefe_almacen', 'Charlie'); const SANDRA = actor('asistente_dt', 'Sandra')
let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; repo = new RepositorioDemo() })

/** Texto de un PDF generado por react-pdf: se descomprimen sus flujos y se juntan las cadenas de los operadores de texto. */
function textoDelPdf(pdf: Buffer): string {
  const bytes = pdf.toString('latin1'); const partes: string[] = []
  for (const m of bytes.matchAll(/stream\r?\n([\s\S]*?)\nendstream/g)) {
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
const celda = async (xlsx: Buffer, dir: string) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(xlsx as unknown as ArrayBuffer); return String(wb.worksheets[0].getCell(dir).value ?? '') }
/** El acta de recepción es el formato oficial LS-FR.03.05: la marca de borrador va fuera de la tabla, en la fila 1. */
const celdaA3 = (xlsx: Buffer) => celda(xlsx, 'A1')
/** El acta organoléptica es la plantilla oficial LS-FR.55.02: la marca de borrador va fuera de su tabla, en la fila 1. */
const celdaB1 = (xlsx: Buffer) => celda(xlsx, 'B1')

describe('la marca', () => {
  it('solo el borrador la lleva; la firmada y la anulada no; el archivo lo dice en el nombre', () => {
    expect(actaRecepcionEsBorrador({ estado: 'BORRADOR' })).toBe(true)
    expect(actaRecepcionEsBorrador({ estado: 'FIRMADA' })).toBe(false)
    expect(actaRecepcionEsBorrador({ estado: 'ANULADA' })).toBe(false)
    expect(organolepticaEsBorrador({ estado: 'PENDIENTE_DT' })).toBe(true)
    expect(organolepticaEsBorrador({ estado: 'BORRADOR' })).toBe(true)
    expect(organolepticaEsBorrador({ estado: 'FIRMADA' })).toBe(false)
    expect(nombreArchivoActa('Acta I-1', true, 'pdf')).toBe('Acta I-1 (BORRADOR).pdf')
    expect(nombreArchivoActa('Acta I-1', false, 'xlsx')).toBe('Acta I-1.xlsx')
  })
})

describe('Acta de Recepción', () => {
  async function actaSinFirmas() {
    const oc = (await repo.ocsPendientes())[1]
    const propietario = (await repo.panorama()).propietarios.find((p) => p.codigo === 'LOGISSA')!.id
    const r = await repo.crearSolicitud({ tipo: 'COMPRA_LOCAL', propietarioId: propietario, ocId: oc.ocId, guiaNumero: 'T001-9', lineas: [{ ocItemId: oc.items[0].ocItemId, lote: 'BR-1', vence: '30/06/2028', cantidad: 5 }] }, true, SANDRA)
    if (!r.ok) throw new Error(r.mensaje)
    await repo.iniciarRecepcion(r.id, CHARLIE)
    const s = (await repo.obtenerSolicitud(r.id))!
    for (const l of s.lineas) await repo.verificarLinea(r.id, l.id, { coincide: true, posicionId: 'pos:A-6' }, CHARLIE)
    await repo.editarRecepcion(r.id, { temperaturaC: 20, bultos: 3, paletas: 1, placa: 'ABC-123', tipoConteo: 'TOTAL' }, CHARLIE)
    const g = await repo.generarActa(r.id, CHARLIE)
    if (!g.ok) throw new Error(g.mensaje)
    await repo.firmarActa(g.actaId, { rol: 'TRANSPORTISTA', nombre: 'Pedro Quispe', dni: '45678912', placa: 'ABC-123', imagen: FIRMA_PNG_EJEMPLO }, CHARLIE)   // una sola firma: sigue siendo borrador
    return (await repo.obtenerSolicitud(r.id))!.actas.find((a) => a.id === g.actaId)!
  }
  const firmada = async () => {
    for (const x of await repo.listarSolicitudes()) { const a = (await repo.obtenerSolicitud(x.id))!.actas.find((y) => y.estado === 'FIRMADA'); if (a) return a }
    throw new Error('la demo no trae un acta firmada')
  }

  it('sin todas las firmas: el PDF y el Excel se generan y dicen «BORRADOR, pendiente de firmas»', async () => {
    const a = await actaSinFirmas()
    expect(a.estado).toBe('BORRADOR')
    expect(textoDelPdf(await renderActaRecepcion(a))).toContain(MARCA_BORRADOR)
    expect(await celdaA3(await xlsxActaRecepcion(a))).toBe(MARCA_BORRADOR)
  })
  it('con las firmas completas: sin marca ni en el PDF ni en el Excel', async () => {
    const a = await firmada()
    const texto = textoDelPdf(await renderActaRecepcion(a))
    expect(texto.length).toBeGreaterThan(100)   // el extractor sí lee este PDF
    expect(texto).not.toContain('BORRADOR')
    expect(await celdaA3(await xlsxActaRecepcion(a))).toBe('')
  })
})

describe('Acta organoléptica', () => {
  it('sin firmar (borrador o pendiente de Dirección Técnica): marcada; firmada: sin marca', async () => {
    const cola = await repo.colaDireccionTecnica()
    const ids = cola.organolepticas.map((o) => o.id)
    expect(ids.length).toBeGreaterThan(0)
    let vistas = 0
    for (const id of ids) {
      const a = (await repo.obtenerOrganoleptica(id))!
      const borrador = organolepticaEsBorrador(a)
      const pdf = textoDelPdf(await renderActaOrganoleptica(a))
      expect(pdf.includes(MARCA_BORRADOR), `${a.numero} ${a.estado}`).toBe(borrador)
      expect(await celdaB1(await xlsxActaOrganoleptica(a))).toBe(borrador ? MARCA_BORRADOR : '')
      if (borrador) vistas++
    }
    expect(vistas).toBeGreaterThan(0)
  })
})

describe('E-4 · acta de una solicitud sin recepción iniciada', () => {
  it('pedir el acta (o confirmar el ingreso) explica que falta iniciar la recepción, no «Solicitud inexistente»', async () => {
    const x = (await repo.listarSolicitudes()).find((s) => s.paso === 'POR_LLEGAR')!
    const g = await repo.generarActa(x.id, CHARLIE)
    expect(g).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Iniciar recepción/) })
    expect(g).not.toMatchObject({ mensaje: expect.stringMatching(/inexistente/i) })
    expect(await repo.confirmarIngreso(x.id, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Iniciar recepción/) })
    expect(await repo.iniciarRecepcion(x.id, CHARLIE)).toMatchObject({ ok: true })   // el botón hace esto, y después sí hay recepción
  })
})
