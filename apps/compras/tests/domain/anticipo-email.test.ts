import { describe, expect, it } from 'vitest'
import { asuntoEmailAnticipo, renderAnticipoEmailHtml, renderAnticipoEmailText } from '@/domain/anticipo-email'

const base = {
  codigo: 'ANT-2026-0001',
  solicitanteNombre: 'Renato Salas',
  monto: 1500,
  moneda: 'PEN',
  descripcion: 'Viáticos congreso Arequipa',
  quienAutoriza: 'Juan Gonzales',
  tieneCotizacion: true,
  urlSolicitud: 'https://erp.logisalud.com/compras/gastos/abc-123',
}

describe('asuntoEmailAnticipo', () => {
  it('incluye el código de la solicitud', () => {
    expect(asuntoEmailAnticipo(base)).toBe('Nuevo anticipo solicitado — ANT-2026-0001')
  })
})

describe('renderAnticipoEmailHtml', () => {
  it('incluye los datos clave y el link a la solicitud', () => {
    const html = renderAnticipoEmailHtml(base)
    expect(html).toContain('Renato Salas')
    expect(html).toContain('PEN 1500.00')
    expect(html).toContain('Viáticos congreso Arequipa')
    expect(html).toContain('Juan Gonzales')
    expect(html).toContain('href="https://erp.logisalud.com/compras/gastos/abc-123"')
  })

  it('escapa HTML en campos de texto libre (motivo, quién autoriza)', () => {
    const html = renderAnticipoEmailHtml({ ...base, descripcion: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('sin quién autoriza, lo declara explícitamente en vez de dejarlo en blanco', () => {
    const html = renderAnticipoEmailHtml({ ...base, quienAutoriza: null })
    expect(html).toContain('No informado')
  })
})

describe('renderAnticipoEmailText', () => {
  it('trae la misma información en texto plano', () => {
    const text = renderAnticipoEmailText(base)
    expect(text).toContain('Código: ANT-2026-0001')
    expect(text).toContain('Solicitado por: Renato Salas')
    expect(text).toContain('Quién autoriza: Juan Gonzales')
    expect(text).toContain('Cotización adjunta: Sí')
    expect(text).toContain('https://erp.logisalud.com/compras/gastos/abc-123')
  })

  it('sin cotización adjunta lo dice explícito', () => {
    const text = renderAnticipoEmailText({ ...base, tieneCotizacion: false })
    expect(text).toContain('Cotización adjunta: No')
  })
})
