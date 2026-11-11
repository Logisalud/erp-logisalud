// El rótulo LS.ET.07 en PDF: dos por hoja A4, lleno lo que sabe el sistema y en blanco la cantidad y la firma (la primera F.CONT. trae la fecha de hoy).
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { renderRotulosSaldo } from '@/services/pdf/rotulos-saldo'
import { textoDePdf } from '@/services/logger/leer-pdf'
import { statusDeRotulo, type DatosRotulo } from '@/domain/rotulos'

const rotulo = (p: Partial<DatosRotulo> = {}): DatosRotulo => ({ usuario: 'DIPHASAC', producto: 'DAPHA 10 10 MG CJA X 30 TAB. REC.', registroSanitario: 'EE-01234', lote: 'L-77', vencimiento: '06/2028', status: statusDeRotulo('APROBADO'), fechaConteo: '11/11/2026', ...p })

describe('PDF de rótulos de caja saldo', () => {
  it('dos rótulos por hoja A4: 3 rótulos son 2 hojas', async () => {
    const pdf = await PDFDocument.load(await renderRotulosSaldo([rotulo(), rotulo({ lote: 'L-78' }), rotulo({ lote: 'L-79' })]))
    expect(pdf.getPageCount()).toBe(2)
    const { width, height } = pdf.getPage(0).getSize(); expect(Math.round(width)).toBe(595); expect(Math.round(height)).toBe(842)
  })
  it('lleva el formato, el usuario, el producto, el R.S., el lote, el vencimiento, el status y la fecha de conteo de hoy', async () => {
    const t = textoDePdf(Buffer.from(await renderRotulosSaldo([rotulo()]))) ?? ''
    for (const x of ['STATUS DEL PRODUCTO', 'Cajas Saldo', 'USUARIO: DIPHASAC', 'DAPHA 10 10 MG CJA X 30 TAB. REC.', 'EE-01234', 'L-77', '06/2028', 'APROBADO', 'LS.ET.07', '11/11/2026', 'CANT.', 'FIRMA', 'no mayor de 30ºC']) expect(t, x).toContain(x)
  })
})
