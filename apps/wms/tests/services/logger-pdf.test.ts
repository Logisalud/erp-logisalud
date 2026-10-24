// Lectura del informe real del data logger Elitech RC-61 (docs/wms/referencias/19-10-2026.pdf, cifrado AES-256 sin contraseña de usuario) con el lector propio de `services/logger/leer-pdf.ts`.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { estadisticas, parsearInformeTexto } from '@/domain/data-logger'
import { textoDePdf } from '@/services/logger/leer-pdf'

const pdf = readFileSync(resolve(__dirname, '../../../../docs/wms/referencias/19-10-2026.pdf'))

describe('el PDF real del RC-61', () => {
  it('se descifra y se lee el texto de las dos páginas', () => {
    const t = textoDePdf(pdf)!
    expect(t).toContain('Informe de datos')
    expect(t).toContain('Modelo: RC-61')
    expect(t).toMatch(/Tiempo\s+°C\s+%RH/)
    expect(t).toContain('2026-10-19 09:24:34 22.3 NC')
  })

  it('da las 104 lecturas, cada 5 minutos, con la mínima, la máxima y el promedio que dice el resumen', () => {
    const r = parsearInformeTexto(textoDePdf(pdf)!)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const i = r.informe
    expect(i).toMatchObject({ formato: 'PDF', modelo: 'RC-61', serie: 'EFG204104487', intervaloMin: 5, umbralAlto: 24.5, umbralBajo: 15.5, avisos: [] })
    expect(i.lecturas).toHaveLength(104)
    expect(i.resumen).toMatchObject({ maxima: 24.1, minima: 22, promedio: 22.6, puntos: 104, primera: '2026-10-19T09:24:34', ultima: '2026-10-19T17:59:34' })
    const e = estadisticas(i.lecturas, 24.9, 5)
    expect(e).toMatchObject({ puntos: 104, min: 22, max: 24.1, promedio: 22.7, primera: '2026-10-19T09:24:34', ultima: '2026-10-19T17:59:34', sobreLimite: 0, excede: false })
    // el equipo redondea su promedio distinto (dice 22.6; la media exacta de las lecturas es 22.697): es informativo y la diferencia está dentro de 0,1 °C
    expect(Math.abs(e.promedio - i.resumen!.promedio!)).toBeLessThanOrEqual(0.1)
    // el equipo avisa desde 24.5 (su umbral), pero el límite del WMS es 24.9: con 24.1 de máxima no pasa ninguno de los dos
    expect(i.lecturas.every((l, k) => k === 0 || l.momento > i.lecturas[k - 1].momento)).toBe(true)
  })

  it('un PDF que no es el informe, o está dañado, no se lee y no lanza', () => {
    expect(textoDePdf(Buffer.from('no soy un pdf'))).toBeNull()
    expect(textoDePdf(pdf.subarray(0, 3000))).toBeNull()
    expect(textoDePdf(Buffer.alloc(0))).toBeNull()
  })

  it('un PDF cifrado con contraseña de usuario no se abre (se pide el CSV o la mínima y la máxima a mano)', () => {
    const roto = Buffer.from(pdf)
    const i = roto.indexOf('/U (')
    roto[i + 6] ^= 0xff // la huella de la contraseña vacía ya no coincide
    expect(textoDePdf(roto)).toBeNull()
  })
})

/** Arma un PDF mínimo sin cifrar (una página, Helvetica) con el texto dado: prueba el camino de los PDF normales. */
function pdfSimple(lineas: string[]): Buffer {
  const cont = lineas.map((l, k) => `BT /F1 10 Tf 1 0 0 1 40 ${800 - k * 14} Tm (${l.replace(/[()\\]/g, '\\$&')}) Tj ET`).join('\n')
  const flate = deflateSync(Buffer.from(cont, 'latin1'))
  const partes: Buffer[] = [Buffer.from('%PDF-1.4\n')]
  const offs: number[] = []
  const obj = (n: number, cuerpo: Buffer | string) => { offs[n] = partes.reduce((a, p) => a + p.length, 0); partes.push(Buffer.from(`${n} 0 obj\n`), Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(cuerpo), Buffer.from('\nendobj\n')) }
  obj(1, '<</Type/Catalog/Pages 2 0 R>>')
  obj(2, '<</Type/Pages/Count 1/Kids[3 0 R]>>')
  obj(3, '<</Type/Page/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R/Parent 2 0 R>>')
  obj(4, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>')
  obj(5, Buffer.concat([Buffer.from(`<</Length ${flate.length}/Filter/FlateDecode>>\nstream\n`), flate, Buffer.from('\nendstream')]))
  partes.push(Buffer.from('trailer\n<</Size 6/Root 1 0 R>>\n%%EOF\n'))
  return Buffer.concat(partes)
}

describe('PDF sin cifrar', () => {
  it('lee el texto de un PDF normal', () => {
    expect(textoDePdf(pdfSimple(['Modelo: RC-61', 'Hola (mundo)']))).toBe('Modelo: RC-61\nHola (mundo)')
  })

  it('el informe del RC-61 con una lectura sobre el límite se lee igual (texto reemplazado en un PDF normal)', () => {
    const base = textoDePdf(pdf)!.split('\n')
    const alto = base.map((l) => l.replace('2026-10-19 12:04:34 22.2 NC', '2026-10-19 12:04:34 25.3 NC'))
    const r = parsearInformeTexto(textoDePdf(pdfSimple(alto))!)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(estadisticas(r.informe.lecturas, 24.9, 5)).toMatchObject({ max: 25.3, excede: true, sobreLimite: 1, minutosSobreLimite: 5, primeraExcedencia: '2026-10-19T12:04:34' })
      expect(r.informe.avisos.join(' ')).toMatch(/máxima de 24.1 °C y las lecturas llegan a 25.3 °C/)
    }
  })
})
