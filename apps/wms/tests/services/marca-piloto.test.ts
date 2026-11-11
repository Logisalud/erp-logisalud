// B.2: marca de agua «PILOTO, SIN VALOR» en TODOS los PDF que genera el WMS, con un único ayudante (`services/pdf/marca-piloto.ts`).
import { inflateSync } from 'node:zlib'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { TEXTO_MARCA_PILOTO } from '@/domain/modo-piloto'
import { sellarPiloto } from '@/services/pdf/marca-piloto'
import { renderKardex } from '@/services/pdf/kardex'

const RAIZ = resolve(__dirname, '../..')

function texto(pdf: Buffer): string {
  const partes: string[] = []
  for (const m of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\nendstream/g)) {
    let c: string
    try { c = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1') } catch { continue }
    for (const t of c.matchAll(/<([0-9a-fA-F]+)>\s*Tj|\(([^)]*)\)\s*Tj/g)) partes.push(t[1] !== undefined ? (t[1].match(/../g) ?? []).map((x) => String.fromCharCode(parseInt(x, 16))).join('') : t[2])
  }
  return partes.join('\n')
}
const archivos = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? archivos(join(dir, d.name)) : [join(dir, d.name)]))

/** Lista CERRADA de los generadores de PDF (lo que exporta services/pdf) y la ruta que los sirve. Un generador nuevo obliga a sumarlo aquí y a pasar por `marcarPiloto`. */
const GENERADORES: Record<string, string> = {
  renderActaOrganoleptica: 'app/(app)/calidad/[id]/pdf/route.ts',
  renderActaRecepcion: 'app/(app)/entradas/[id]/acta/[actaId]/pdf/route.ts',
  renderEtiquetasBultos: 'app/(app)/embalaje/[id]/etiquetas/route.ts',
  renderHojaPicking: 'app/(app)/picking/[id]/hoja/route.ts',
  renderKardex: 'app/(app)/kardex/pdf/route.ts',
  renderLsFr4303: 'app/(app)/rutas/[id]/pdf/route.ts',
  renderOrdenBaja: 'app/(app)/bajas/[id]/pdf/route.ts',
  renderSolicitudIngreso: 'app/(app)/entradas/[id]/pdf/route.ts',
  armarPaquetePdf: 'app/(app)/salidas/[id]/paquete/route.ts',
  renderPreGuia: 'app/(app)/salidas/[id]/pre-guia/route.ts',
  renderRutaDelDia: 'app/(app)/rutas/[id]/ruta-del-dia/route.ts',
  renderRotulosSaldo: 'app/(app)/rotulos/pdf/route.ts',
}
/** Rutas que entregan un archivo SUBIDO por una persona (no lo genera el WMS): no llevan marca. */
const ARCHIVOS_SUBIDOS = [
  'app/(app)/calidad/[id]/dictamen/[dictamenId]/route.ts', 'app/(app)/documentos/archivo/[id]/route.ts', 'app/(app)/rutas/[id]/archivo/[tipo]/route.ts', 'app/(app)/salidas/[id]/gre/route.ts',
]

describe('marca de agua del piloto en todos los PDF', () => {
  it('el ayudante estampa la marca en cada página y el resultado sigue siendo un PDF válido', async () => {
    const original = await renderKardex([], { productoId: 'p' }, 'T-1 · Producto de prueba', 'LS-FR.41')
    expect(texto(original)).not.toContain(TEXTO_MARCA_PILOTO)
    const marcado = await sellarPiloto(original)
    expect(texto(marcado)).toContain(TEXTO_MARCA_PILOTO)
    const doc = await PDFDocument.load(marcado)
    expect(doc.getPageCount()).toBe((await PDFDocument.load(original)).getPageCount())
  })

  it('lista cerrada: todo exportado de services/pdf que arma un PDF está en la lista, y su ruta pasa por marcarPiloto', () => {
    const exportados = new Set<string>()
    for (const f of readdirSync(join(RAIZ, 'services/pdf')).filter((x) => /\.tsx?$/.test(x) && !/^marca-/.test(x))) {
      const t = readFileSync(join(RAIZ, 'services/pdf', f), 'utf8')
      for (const m of t.matchAll(/export (?:async )?(?:function|const) ((?:render|armar)[A-Za-z0-9]*)/g)) exportados.add(m[1])
    }
    expect([...exportados].sort()).toEqual(Object.keys(GENERADORES).sort())
    for (const [gen, ruta] of Object.entries(GENERADORES)) {
      const t = readFileSync(join(RAIZ, ruta), 'utf8')
      expect(t, ruta).toMatch(new RegExp(`marcarPiloto\\(\\s*await ${gen}\\(`))
      expect(t, ruta).toContain("from '@/services/pdf/marca-piloto'")
    }
  })

  it('toda ruta del WMS que responde un PDF es un generador marcado o está en la lista de archivos subidos', () => {
    const rutas = archivos(join(RAIZ, 'app')).filter((f) => /route\.ts$/.test(f) && readFileSync(f, 'utf8').includes('application/pdf')).map((f) => f.slice(RAIZ.length + 1))
    const conocidas = new Set([...Object.values(GENERADORES), ...ARCHIVOS_SUBIDOS])
    // la ruta de rutas/[id]/paquete también arma un paquete
    conocidas.add('app/(app)/rutas/[id]/paquete/route.ts')
    expect(rutas.filter((r) => !conocidas.has(r))).toEqual([])
    expect(readFileSync(join(RAIZ, 'app/(app)/rutas/[id]/paquete/route.ts'), 'utf8')).toMatch(/marcarPiloto\(\s*await armarPaquetePdf\(/)
    for (const r of ARCHIVOS_SUBIDOS) expect(readFileSync(join(RAIZ, r), 'utf8'), r).not.toMatch(/render[A-Z]|armarPaquetePdf/)
  })
})
