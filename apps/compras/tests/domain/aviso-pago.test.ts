import { describe, expect, it } from 'vitest'
import {
  asuntoAvisoPago, destinatariosAvisoPago, renderAvisoPagoHtml, renderAvisoPagoTexto, type DatosAvisoPago,
} from '@/domain/aviso-pago'

/** C-0155, el caso con el que Sebas lo pidió (2026-10-30). */
const base: DatosAvisoPago = {
  codigo: 'C-0155',
  origen: 'gasto_directo',
  montoPagado: 850.5,
  moneda: 'PEN',
  aQuien: 'KAMARY MEDICAL S.A.C.',
  numeroComprobante: 'FFF1-003828',
  fechaPago: '2026-10-19',
  numeroVoucher: '02001834',
  url: 'https://erp.logisalud.com/compras/cuentas-por-pagar/abc',
  voucherAdjunto: true,
}

describe('a quién se avisa', () => {
  it('a quien registró y a quien pidió, sin repetir aunque cambie la mayúscula', () => {
    expect(destinatariosAvisoPago(['Ana@logisalud.com', 'ana@logisalud.com', 'beto@logisalud.com']))
      .toEqual(['Ana@logisalud.com', 'beto@logisalud.com'])
  })

  it('sin correo (una compra, un impuesto) no hay a quién avisar', () => {
    expect(destinatariosAvisoPago([null, undefined, '  '])).toEqual([])
  })
})

it('el asunto dice que se pagó, cuánto y a quién', () => {
  expect(asuntoAvisoPago(base)).toBe('[Pagado] C-0155 — S/ 850.50 — KAMARY MEDICAL S.A.C.')
})

describe('el cuerpo', () => {
  it('trae voucher, comprobante y la fecha como se lee en Perú', () => {
    const texto = renderAvisoPagoTexto(base)
    expect(texto).toContain('02001834')
    expect(texto).toContain('FFF1-003828')
    expect(texto).toContain('19/10/2026')
    expect(texto).toContain('Te adjuntamos el voucher.')
    expect(renderAvisoPagoHtml(base)).toContain('<a href="https://erp.logisalud.com/compras/cuentas-por-pagar/abc">')
  })

  it('si el voucher no se pudo adjuntar, manda a verlo en el ERP', () => {
    expect(renderAvisoPagoTexto({ ...base, voucherAdjunto: false })).toContain('El voucher lo puedes ver en el ERP.')
  })

  it('un anticipo pagado recuerda que falta rendirlo; un pago directo no', () => {
    expect(renderAvisoPagoTexto({ ...base, origen: 'anticipo' })).toContain('rendir el anticipo')
    expect(renderAvisoPagoTexto(base)).not.toContain('rendir')
  })

  it('omite lo que no hay, y escapa el HTML', () => {
    const html = renderAvisoPagoHtml({ ...base, numeroComprobante: null, aQuien: 'A & B <x>' })
    expect(html).not.toContain('Comprobante')
    expect(html).toContain('A &amp; B &lt;x&gt;')
  })
})
