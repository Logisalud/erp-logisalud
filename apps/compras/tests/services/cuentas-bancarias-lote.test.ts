import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { cuentaPreferida, filtroTitular } from '@/services/cuentas-bancarias-lote'

const cuenta = (id: string, es_principal: boolean) => ({
  id, banco: 'BCP', tipo_cuenta: 'corriente', numero_cuenta: `1-${id}`,
  cci: '0'.repeat(20), moneda: 'PEN', es_principal,
})

describe('cuentaPreferida (Pieza 4 — la cuenta que Tesorería usaría)', () => {
  it('elige la principal aunque no sea la primera', () => {
    expect(cuentaPreferida([cuenta('a', false), cuenta('b', true)])?.id).toBe('b')
  })

  it('sin principal, cae en la primera', () => {
    expect(cuentaPreferida([cuenta('a', false), cuenta('b', false)])?.id).toBe('a')
  })

  it('sin cuentas devuelve null — es el caso que dispara el badge', () => {
    expect(cuentaPreferida([])).toBeNull()
  })
})

describe('filtroTitular (0081 — cuentas de personas sin usuario)', () => {
  it('busca los mismos ids como usuario y como persona sin usuario', () => {
    expect(filtroTitular(['a', 'b'])).toBe('usuario_id.in.(a,b),persona_sin_usuario_id.in.(a,b)')
  })
})
