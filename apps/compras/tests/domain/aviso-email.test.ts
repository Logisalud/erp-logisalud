import { describe, expect, it } from 'vitest'
import {
  ETIQUETA_TIPO_AVISO,
  TIPOS_AVISO,
  asuntoAviso,
  formatoMonto,
  renderAvisoHtml,
  renderAvisoTexto,
  type DatosAviso,
} from '@/domain/aviso-email'

const base: DatosAviso = {
  tipo: 'anticipo',
  codigo: 'G-2026-0014',
  monto: 1500,
  moneda: 'PEN',
  referencia: 'Viáticos',
  filas: [
    { etiqueta: 'Solicitado por', valor: 'Sandra Chau' },
    { etiqueta: 'Quién autoriza', valor: 'Roberto Díaz' },
  ],
  url: 'https://erp.logisalud.com/compras/gastos/abc',
}

describe('formatoMonto', () => {
  it('usa S/ para soles y US$ para dólares, siempre con dos decimales', () => {
    expect(formatoMonto(1500, 'PEN')).toBe('S/ 1500.00')
    expect(formatoMonto(1500, 'USD')).toBe('US$ 1500.00')
    expect(formatoMonto(0.5, 'PEN')).toBe('S/ 0.50')
  })
})

describe('asuntoAviso', () => {
  it('lleva tipo, código, monto y referencia — se entiende sin abrir el correo', () => {
    expect(asuntoAviso(base)).toBe('[Anticipo] G-2026-0014 — S/ 1500.00 — Viáticos')
  })

  it('cada tipo tiene su propia etiqueta, ninguna vacía', () => {
    for (const tipo of TIPOS_AVISO) {
      expect(ETIQUETA_TIPO_AVISO[tipo]).toBeTruthy()
    }
  })
})

describe('renderAvisoTexto', () => {
  it('incluye código, cada fila y el link', () => {
    const texto = renderAvisoTexto(base)
    expect(texto).toContain('G-2026-0014')
    expect(texto).toContain('Sandra Chau')
    expect(texto).toContain('Roberto Díaz')
    expect(texto).toContain(base.url)
  })

  it('omite las filas sin valor en vez de mostrarlas vacías', () => {
    const texto = renderAvisoTexto({
      ...base,
      filas: [
        { etiqueta: 'Solicitado por', valor: 'Sandra Chau' },
        { etiqueta: 'Quién autoriza', valor: null },
        { etiqueta: 'N° factura', valor: '   ' },
      ],
    })
    expect(texto).toContain('Solicitado por')
    expect(texto).not.toContain('Quién autoriza')
    expect(texto).not.toContain('N° factura')
  })

  it('el nombre del registro cambia con el tipo', () => {
    expect(renderAvisoTexto({ ...base, tipo: 'os' })).toContain('una nueva orden de servicio')
    expect(renderAvisoTexto({ ...base, tipo: 'pago_directo' })).toContain('un nuevo pago directo')
  })
})

describe('renderAvisoHtml', () => {
  it('arma una fila de tabla por dato visible', () => {
    const html = renderAvisoHtml(base)
    expect(html).toContain('<strong>Código</strong>')
    expect(html).toContain('<strong>Solicitado por</strong>')
    expect(html).toContain(`href="${base.url}"`)
  })

  it('escapa el HTML que venga del texto que escribió el usuario', () => {
    const html = renderAvisoHtml({
      ...base,
      filas: [{ etiqueta: 'Motivo', valor: '<script>alert("x")</script>' }],
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
