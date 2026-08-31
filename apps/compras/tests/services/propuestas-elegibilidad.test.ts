import { describe, expect, it, vi, beforeEach } from 'vitest'
import { crearSupabaseMock } from './supabase-mock'

const usuario = { id: 'tesoreria-1' }

vi.mock('@logisalud/auth/server', () => ({
  exigirUsuario: vi.fn(async () => usuario),
  crearClienteServidor: vi.fn(),
}))

import { crearClienteServidor } from '@logisalud/auth/server'
import { crearPropuesta } from '@/services/propuestas'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('crearPropuesta — solo obligaciones conformes entran a una propuesta', () => {
  it('rechaza si alguna de las obligaciones elegidas no está conforme (ej. sigue registrada u observada)', async () => {
    const { cliente, llamadas } = crearSupabaseMock([
      {
        data: [
          { id: 'ob-1', estado: 'conforme', neto_a_pagar: 100 },
          { id: 'ob-2', estado: 'registrada', neto_a_pagar: 50 },
        ],
        error: null,
      },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(crearPropuesta(['ob-1', 'ob-2'])).rejects.toThrow(/ya no está conforme/i)
    // No se llegó a crear la propuesta ni a mover ninguna obligación.
    expect(llamadas.map((l) => l.from)).toEqual(['obligaciones'])
  })

  it('rechaza si una obligación ya se la llevó otra propuesta (en_propuesta) — evita que dos propuestas incluyan la misma obligación', async () => {
    const { cliente } = crearSupabaseMock([
      { data: [{ id: 'ob-1', estado: 'en_propuesta', neto_a_pagar: 100 }], error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(crearPropuesta(['ob-1'])).rejects.toThrow(/ya no está conforme/i)
  })

  it('arma la propuesta cuando todas las obligaciones elegidas están conformes', async () => {
    const { cliente } = crearSupabaseMock([
      { data: [{ id: 'ob-1', estado: 'conforme', neto_a_pagar: 100 }], error: null }, // select obligaciones
      { data: [], error: null }, // notas_credito aplicadas
      { data: null, error: null }, // última propuesta (maybeSingle -> null)
      { data: { id: 'pp-1' }, error: null }, // insert propuestas_pago
      { data: null, error: null }, // insert propuesta_detalle
      { data: null, error: null }, // update obligaciones -> en_propuesta
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    const resultado = await crearPropuesta(['ob-1'])
    expect(resultado).toEqual({ id: 'pp-1' })
  })

  it('no permite armar una propuesta vacía', async () => {
    await expect(crearPropuesta([])).rejects.toThrow(/elige al menos una obligación conforme/i)
  })
})
