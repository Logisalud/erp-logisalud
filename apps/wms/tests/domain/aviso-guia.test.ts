import { describe, expect, it } from 'vitest'
import { asuntoAvisoGuia, destinatariosDeAviso, htmlAvisoGuia, textoAvisoGuia, type DatosAvisoGuia } from '@/domain/aviso-guia'

const d = (o: Partial<DatosAvisoGuia> = {}): DatosAvisoGuia => ({ guiaNumero: 'TTT1-00000012', pedidoNumero: 'PED-502', ordenNumero: 'OS-2026-00031', cliente: 'Botica <Sol> SAC', ruc: '20512345671', bultos: 3, origen: 'WMS', piloto: false, ...o })

describe('aviso «guía lista, ya puede facturar»', () => {
  it('el asunto dice la guía y el pedido; en el piloto lo marca como prueba', () => {
    expect(asuntoAvisoGuia(d())).toBe('Guía TTT1-00000012 lista · pedido PED-502: ya puede facturar')
    expect(asuntoAvisoGuia(d({ piloto: true }))).toMatch(/^\[PILOTO\] /)
    expect(asuntoAvisoGuia(d({ pedidoNumero: undefined }))).toContain('pedido OS-2026-00031')
  })
  it('el texto y el HTML traen cliente, RUC, guía y bultos; el HTML escapa lo que viene de afuera', () => {
    const t = textoAvisoGuia(d())
    for (const x of ['Pedido: PED-502', 'Cliente: Botica <Sol> SAC · RUC 20512345671', 'Guía de remisión: TTT1-00000012', 'Bultos: 3', 'puedes facturar']) expect(t).toContain(x)
    const h = htmlAvisoGuia(d())
    expect(h).toContain('Botica &lt;Sol&gt; SAC')
    expect(h).not.toContain('<Sol>')
  })
  it('en el piloto el cuerpo dice que no se factura; sin bultos no se escribe la línea', () => {
    expect(textoAvisoGuia(d({ piloto: true }))).toContain('no factures')
    expect(textoAvisoGuia(d({ bultos: undefined }))).not.toContain('Bultos')
  })
  it('los destinatarios: sin vacíos, sin repetidos, en minúsculas y solo correos con forma de correo', () => {
    expect(destinatariosDeAviso(' Arlette@Logisalud.pe, arlette@logisalud.pe; otra@x.com  malo, sin@arroba ')).toEqual(['arlette@logisalud.pe', 'otra@x.com'])
    expect(destinatariosDeAviso(undefined)).toEqual([])
  })
})
