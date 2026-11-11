// 1e: los pedidos del día se traen solos al abrir la bandeja, sin insistir.
import { describe, expect, it } from 'vitest'
import { tocaTraerPedidos } from '@/domain/pedidos-despacho'

const AHORA = Date.parse('2026-11-11T15:00:00Z')

describe('¿toca traer los pedidos solos?', () => {
  it('sí si nunca se intentó', () => { expect(tocaTraerPedidos(undefined, AHORA)).toBe(true); expect(tocaTraerPedidos(null, AHORA)).toBe(true) })
  it('no si el último intento fue hace menos de 15 minutos; sí desde los 15', () => {
    expect(tocaTraerPedidos('2026-11-11T14:50:00Z', AHORA)).toBe(false)
    expect(tocaTraerPedidos('2026-11-11T14:45:00Z', AHORA)).toBe(true)
  })
  it('una fecha ilegible cuenta como «toca» y se puede pedir otro plazo', () => {
    expect(tocaTraerPedidos('no es fecha', AHORA)).toBe(true)
    expect(tocaTraerPedidos('2026-11-11T14:40:00Z', AHORA, 30)).toBe(false)
  })
})
