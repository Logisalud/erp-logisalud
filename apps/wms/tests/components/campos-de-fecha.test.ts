// Guarda: todo campo de vencimiento o vigencia del WMS usa CampoVencimiento (botón de calendario + escribir 30/06/2028, 2028-06-30 o 06/2028).
// Si una pantalla nueva agrega un campo de fecha de vencimiento a mano, esta prueba falla y dice dónde.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = resolve(__dirname, '../..')
const archivos = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? archivos(p) : /\.tsx$/.test(n) ? [p] : []
})
const fuentes = ['components', 'app'].flatMap((d) => archivos(join(RAIZ, d))).map((p) => ({ ruta: relative(RAIZ, p), texto: readFileSync(p, 'utf8') }))

describe('campos de fecha del WMS', () => {
  it('un campo cuyo nombre o etiqueta es vencimiento/vigencia usa CampoVencimiento', () => {
    const sospechosos: string[] = []
    for (const { ruta, texto } of fuentes) {
      if (ruta.endsWith('campo-vencimiento.tsx')) continue
      // <input … name/id con vence|vigencia …> escrito a mano, o un <Campo nombre="…Vence"> sin la marca `fecha`
      const manual = /<input[^>]*(?:name|id)=["'{`][^>]*(?:vence|vencimiento|vigencia|vigente)/i.test(texto)
      const campoSinFecha = [...texto.matchAll(/<Campo\b[^>]*\bnombre="[^"]*(?:Vence|vence|vigencia)[^"]*"[^>]*>/g)].some((m) => !/\bfecha\b/.test(m[0]))
      if (manual || campoSinFecha) sospechosos.push(ruta)
    }
    expect(sospechosos, `Usa <CampoVencimiento> (components/campo-vencimiento.tsx) en: ${sospechosos.join(', ')}`).toEqual([])
  })

  it('los formularios conocidos con vencimiento siguen usándolo', () => {
    const usa = (ruta: string) => fuentes.find((f) => f.ruta === ruta)!.texto.includes('CampoVencimiento')
    for (const r of ['components/entradas/form-nueva-solicitud.tsx', 'components/entradas/lineas-solicitud.tsx', 'components/form-producto.tsx', 'components/form-regulatorio.tsx']) {
      expect(usa(r), r).toBe(true)
    }
  })
})
