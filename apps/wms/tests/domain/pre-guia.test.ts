import { describe, expect, it } from 'vitest'
import { estadoDePreGuia, faltaParaEnviar, textoAvisoContabilidad } from '@/domain/pre-guia'

describe('estado de la pre-guía', () => {
  it('sin vehículo y conductor es pre-guía; con los dos, lista para enviar; enviada y cancelada mandan', () => {
    expect(estadoDePreGuia({})).toBe('PRE_GUIA')
    expect(estadoDePreGuia({ placa: 'ABC-123' })).toBe('PRE_GUIA')
    expect(estadoDePreGuia({ placa: 'ABC-123', conductor: 'Hans' })).toBe('LISTA_PARA_ENVIAR')
    expect(estadoDePreGuia({ placa: 'ABC-123', conductor: 'Hans', guiaEnviada: true })).toBe('ENVIADA')
    expect(estadoDePreGuia({ cancelada: true })).toBe('CANCELADA')
  })
  it('dice claro qué falta para enviar', () => {
    expect(faltaParaEnviar({ estado: 'PRE_GUIA' })).toMatch(/Todavía no hay ruta/)
    expect(faltaParaEnviar({ estado: 'PRE_GUIA', rutaNumero: 'RUT-1' })).toMatch(/vehículo y conductor/)
    expect(faltaParaEnviar({ estado: 'LISTA_PARA_ENVIAR', rutaNumero: 'RUT-1', placa: 'A', conductor: 'B' })).toBeNull()
  })
  it('el aviso a contabilidad dice «PRUEBA, NO FACTURAR» en el piloto', () => {
    expect(textoAvisoContabilidad('TTT1-00000007', true)).toBe('Pre-guía TTT1-00000007 reservada. PRUEBA, NO FACTURAR.')
    expect(textoAvisoContabilidad('T001-00000007', false)).toBe('Pre-guía T001-00000007 reservada.')
  })
})
