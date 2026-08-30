import { describe, expect, it } from 'vitest'
import { agruparPorMoneda, venceEnProximosDias, estaVencidaObligacion } from '@/domain/dashboard'

describe('agruparPorMoneda', () => {
  it('suma montos de la misma moneda y cuenta filas', () => {
    const r = agruparPorMoneda([
      { moneda: 'PEN', monto: 100 },
      { moneda: 'PEN', monto: 50.5 },
      { moneda: 'USD', monto: 20 },
    ])
    expect(r).toEqual(
      expect.arrayContaining([
        { moneda: 'PEN', monto: 150.5, cantidad: 2 },
        { moneda: 'USD', monto: 20, cantidad: 1 },
      ])
    )
  })

  it('nunca mezcla PEN con USD en un mismo total', () => {
    const r = agruparPorMoneda([
      { moneda: 'PEN', monto: 100 },
      { moneda: 'USD', monto: 100 },
    ])
    expect(r.find((f) => f.moneda === 'PEN')?.monto).toBe(100)
    expect(r.find((f) => f.moneda === 'USD')?.monto).toBe(100)
  })

  it('lista vacía da resultado vacío', () => {
    expect(agruparPorMoneda([])).toEqual([])
  })

  it('redondea a 2 decimales evitando drift de binario', () => {
    const r = agruparPorMoneda([
      { moneda: 'PEN', monto: 0.1 },
      { moneda: 'PEN', monto: 0.2 },
    ])
    expect(r[0].monto).toBe(0.3)
  })
})

describe('venceEnProximosDias', () => {
  it('vence en 3 días, ventana de 7: true', () => {
    expect(venceEnProximosDias(-3, 7)).toBe(true)
  })

  it('vence en 8 días, ventana de 7: false (fuera de ventana)', () => {
    expect(venceEnProximosDias(-8, 7)).toBe(false)
  })

  it('vence hoy (0): no cuenta como "próximo" — ya está vencida/al límite', () => {
    expect(venceEnProximosDias(0, 7)).toBe(false)
  })

  it('ya vencida (positivo): false', () => {
    expect(venceEnProximosDias(5, 7)).toBe(false)
  })

  it('sin fecha de vencimiento (null): false', () => {
    expect(venceEnProximosDias(null, 7)).toBe(false)
  })

  it('borde exacto de la ventana (-7): true', () => {
    expect(venceEnProximosDias(-7, 7)).toBe(true)
  })
})

describe('estaVencidaObligacion', () => {
  it('días positivos: vencida', () => {
    expect(estaVencidaObligacion(1)).toBe(true)
  })

  it('cero: no vencida (vence hoy, no antes)', () => {
    expect(estaVencidaObligacion(0)).toBe(false)
  })

  it('negativo: no vencida', () => {
    expect(estaVencidaObligacion(-1)).toBe(false)
  })

  it('null: no vencida', () => {
    expect(estaVencidaObligacion(null)).toBe(false)
  })
})
