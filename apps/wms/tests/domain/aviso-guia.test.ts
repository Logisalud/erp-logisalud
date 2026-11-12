import { describe, expect, it } from 'vitest'
import { asuntoAvisoGuia, destinatariosDeAviso, htmlAvisoGuia, textoAvisoGuia, type DatosAvisoGuia } from '@/domain/aviso-guia'

const d = (o: Partial<DatosAvisoGuia> = {}): DatosAvisoGuia => ({
  evento: 'PRE_GUIA', guiaNumero: 'TTT1-00000012', pedidoNumero: 'PED-502', ordenNumero: 'OS-2026-00031', cliente: 'Botica <Sol> SAC', ruc: '20512345671', bultos: 3, piloto: false,
  lineas: [{ producto: 'DAPHA 10 MG', lote: 'L-77', cantidad: 120 }], ...o,
})

describe('aviso a quien factura', () => {
  it('al crearse la pre-guía: el asunto dice la guía y el pedido; en el piloto lo marca como prueba', () => {
    expect(asuntoAvisoGuia(d())).toBe('Guía TTT1-00000012 lista · pedido PED-502: ya puede facturar')
    expect(asuntoAvisoGuia(d({ piloto: true }))).toMatch(/^\[PILOTO\] /)
    expect(asuntoAvisoGuia(d({ pedidoNumero: undefined }))).toContain('pedido OS-2026-00031')
  })
  it('el texto trae cliente, RUC, guía, bultos y los productos con su lote; el HTML escapa lo que viene de afuera', () => {
    const t = textoAvisoGuia(d())
    for (const x of ['Pedido: PED-502', 'Cliente: Botica <Sol> SAC · RUC 20512345671', 'Guía de remisión: TTT1-00000012', 'Bultos: 3', 'puedes facturar', '120 × DAPHA 10 MG (lote L-77)', 'Todavía no se envía a Nubefact']) expect(t).toContain(x)
    const h = htmlAvisoGuia(d())
    expect(h).toContain('Botica &lt;Sol&gt; SAC')
    expect(h).not.toContain('<Sol>')
    expect(h).toContain('lote L-77')
  })
  it('si la pre-guía se cancela: «NO factures», el motivo y sin lista de productos', () => {
    const c = d({ evento: 'CANCELADA', motivo: 'El cliente canceló' })
    expect(asuntoAvisoGuia(c)).toBe('Guía TTT1-00000012 cancelada · pedido PED-502: NO factures')
    const t = textoAvisoGuia(c)
    expect(t).toContain('NO factures'); expect(t).toContain('Motivo: El cliente canceló'); expect(t).not.toContain('Productos y lotes')
  })
  it('guía registrada a mano en el panel: dice que ya está registrada', () => {
    expect(textoAvisoGuia(d({ evento: 'GUIA_REGISTRADA' }))).toContain('ya está registrada')
  })
  it('en el piloto el cuerpo dice que es de prueba; sin bultos no se escribe la línea', () => {
    expect(textoAvisoGuia(d({ piloto: true }))).toContain('no factures')
    expect(textoAvisoGuia(d({ piloto: true, evento: 'CANCELADA' }))).toContain('aviso de prueba')
    expect(textoAvisoGuia(d({ bultos: undefined }))).not.toContain('Bultos')
  })
  it('los destinatarios: sin vacíos, sin repetidos, en minúsculas y solo correos con forma de correo', () => {
    expect(destinatariosDeAviso(' A.Aguilar@Logisalud.com, a.aguilar@logisalud.com; otra@x.com  malo, sin@arroba ')).toEqual(['a.aguilar@logisalud.com', 'otra@x.com'])
    expect(destinatariosDeAviso(undefined)).toEqual([])
  })
})
