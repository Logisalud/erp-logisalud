import { describe, expect, it } from 'vitest'
import { puedeVerificar } from '@/domain/verificacion'

describe('D-15: quien hace un movimiento no lo valida', () => {
  const m = { preparadorId: 'ana', ejecutorId: 'beto' }
  it('el verificador debe ser distinto de quien preparó y de quien ejecutó', () => {
    expect(puedeVerificar('carla', m)).toEqual({ puede: true })
    const a = puedeVerificar('ana', m)
    expect(a.puede).toBe(false)
    if (!a.puede) expect(a.mensaje).toMatch(/preparó/)
    const b = puedeVerificar('beto', m)
    expect(b.puede).toBe(false)
    if (!b.puede) expect(b.mensaje).toMatch(/ejecutó/)
  })
  it('sin verificador no hay verificación', () => {
    expect(puedeVerificar(undefined, m).puede).toBe(false)
  })
  it('si preparó y ejecutó la misma persona, otra verifica', () => {
    expect(puedeVerificar('ana', { preparadorId: 'ana', ejecutorId: 'ana' }).puede).toBe(false)
    expect(puedeVerificar('beto', { preparadorId: 'ana', ejecutorId: 'ana' }).puede).toBe(true)
  })
})
