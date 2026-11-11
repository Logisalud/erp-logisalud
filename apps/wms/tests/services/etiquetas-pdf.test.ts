// La etiqueta de bulto de provincia (hoja LOGISALUD, etiquetera TSC TE200): 104,6 × 75 mm, una por bulto, con origen, destino, destinatario, entrega a domicilio, guía y «bulto k de N».
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { ETIQUETA_ALTO_MM, ETIQUETA_ANCHO_MM, renderEtiquetasBultos } from '@/services/pdf/etiquetas-bultos'
import { textoDePdf } from '@/services/logger/leer-pdf'
import type { BultoVista } from '@/domain/embalaje'

const bulto = (n: number, total: number): BultoVista => ({ id: `b${n}`, salidaId: 's', codigo: `SAL-2026-00001-B${n}`, secuencia: n, total, estado: 'EMBALADO', contenido: [], unidades: 10, embaladoPor: 'Ana', embaladoEn: '2026-11-11T10:00:00Z' } as unknown as BultoVista)
const datos = { salidaNumero: 'OS-2026-00001', pedidoNumero: 'PED-485', cliente: 'Midhco Distribuciones S.A.C.', rutaNumero: 'RUT-2026-00001', guiaNumero: 'TTT1-00003248', direccion: 'Prolongación Cuzco Nro. 200.', ubigeo: '120101', distrito: 'Huancayo', bultos: [bulto(1, 3), bulto(2, 3), bulto(3, 3)] }

describe('etiqueta de bulto de provincia', () => {
  it('una página de 104,6 × 75 mm por bulto', async () => {
    const pdf = await PDFDocument.load(await renderEtiquetasBultos(datos))
    expect(pdf.getPageCount()).toBe(3)
    const { width, height } = pdf.getPage(0).getSize()
    expect(width).toBeCloseTo(ETIQUETA_ANCHO_MM * 2.8346, 0); expect(height).toBeCloseTo(ETIQUETA_ALTO_MM * 2.8346, 0)
    expect(ETIQUETA_ANCHO_MM).toBe(104.6); expect(ETIQUETA_ALTO_MM).toBe(75)
  })
  it('lleva origen, destino (departamento), destinatario, entrega a domicilio, n.º de guía y el número del bulto', async () => {
    const t = textoDePdf(Buffer.from(await renderEtiquetasBultos({ ...datos, bultos: [bulto(2, 3)] }))) ?? ''
    for (const x of ['ORIGEN: LIMA', 'DESTINO: JUNIN', 'MIDHCO DISTRIBUCIONES S.A.C.', 'JUNIN - HUANCAYO - HUANCAYO - PROLONGACIÓN CUZCO NRO. 200.', 'TTT1-00003248', '2 de 3', 'PED-485']) expect(t, x).toContain(x)
  })
  it('sin guía todavía lo dice; sin ubigeo escribe la dirección sola', async () => {
    const t = textoDePdf(Buffer.from(await renderEtiquetasBultos({ ...datos, guiaNumero: undefined, ubigeo: undefined, bultos: [bulto(1, 1)] }))) ?? ''
    expect(t).toContain('SIN GUÍA AÚN'); expect(t).toContain('DESTINO: SIN UBIGEO'); expect(t).toContain('PROLONGACIÓN CUZCO NRO. 200. · HUANCAYO')
  })
})
