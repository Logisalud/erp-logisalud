import { describe, expect, it } from 'vitest'
import { puedeVerificar } from '@/domain/verificacion'

describe('D-15: quien hace un movimiento no lo verifica', () => {
  const m = { ejecutorId: 'beto' }
  it('el verificador debe ser distinto de quien ejecutó', () => {
    expect(puedeVerificar('carla', m)).toEqual({ puede: true })
    const b = puedeVerificar('beto', m)
    expect(b.puede).toBe(false)
    if (!b.puede) expect(b.mensaje).toMatch(/ejecutó/)
  })
  it('sin verificador no hay verificación', () => {
    expect(puedeVerificar(undefined, m).puede).toBe(false)
  })
  it('quien crea el movimiento es quien lo mueve (el ejecutor): otra persona verifica', () => {
    expect(puedeVerificar('ana', { ejecutorId: 'ana' }).puede).toBe(false)
    expect(puedeVerificar('beto', { ejecutorId: 'ana' }).puede).toBe(true)
  })
})
