import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@logisalud/auth/server', () => ({
  crearClienteServidor: vi.fn(),
  exigirUsuario: vi.fn(),
  perfilActual: vi.fn(),
}))

import { puedeRegistrarAporte, puedeVerAportes } from '@/services/aportes-accionista'

describe('quién registra un aporte de accionista', () => {
  it('solo area=admin Y rol=admin (Sebastián, Andrés)', () => {
    expect(puedeRegistrarAporte({ area: 'admin', rol: 'admin' })).toBe(true)
  })

  it('NO es esAutoridadFinal: contabilidad rol admin (Mariela) no registra', () => {
    expect(puedeRegistrarAporte({ area: 'contabilidad', rol: 'admin' })).toBe(false)
  })

  it('un admin de área sin rol admin tampoco', () => {
    expect(puedeRegistrarAporte({ area: 'admin', rol: 'operativo' })).toBe(false)
  })

  it('nadie más', () => {
    for (const area of ['tesoreria', 'compras', 'almacen', 'gerencia', 'otro', null]) {
      expect(puedeRegistrarAporte({ area, rol: 'admin' })).toBe(false)
    }
    expect(puedeRegistrarAporte(null)).toBe(false)
  })
})

describe('quién LEE el reporte', () => {
  it('Contabilidad lee aunque no pueda registrar', () => {
    expect(puedeVerAportes({ area: 'contabilidad', rol: 'admin' })).toBe(true)
    expect(puedeVerAportes({ area: 'contabilidad', rol: 'operativo' })).toBe(true)
  })

  it('quien registra también lee', () => {
    expect(puedeVerAportes({ area: 'admin', rol: 'admin' })).toBe(true)
  })

  it('Tesorería no: no es deuda ni pago, no le toca', () => {
    expect(puedeVerAportes({ area: 'tesoreria', rol: 'operativo' })).toBe(false)
  })
})
