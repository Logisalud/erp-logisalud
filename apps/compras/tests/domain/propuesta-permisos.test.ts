import { describe, expect, it } from 'vitest'
import { puedeAprobarPropuesta, puedeVerPropuestas, sumarPorMoneda, totalesDeLote } from '@/domain/propuesta-permisos'

const mariela = { area: 'contabilidad', rol: 'admin' }
const beatriz = { area: 'contabilidad', rol: 'operativo' }
const milagritos = { area: 'tesoreria', rol: 'operativo' }
const sebas = { area: 'admin', rol: 'admin' }
const juan = { area: 'gerencia', rol: 'operativo' }

describe('quién ve y quién aprueba', () => {
  it('ven Contabilidad, Tesorería y admin', () => {
    expect(puedeVerPropuestas(mariela)).toBe(true)
    expect(puedeVerPropuestas(beatriz)).toBe(true)
    expect(puedeVerPropuestas(milagritos)).toBe(true)
    expect(puedeVerPropuestas(sebas)).toBe(true)
  })

  it('Tesorería VE pero NO aprueba — su momento es ejecutar el pago', () => {
    expect(puedeVerPropuestas(milagritos)).toBe(true)
    expect(puedeAprobarPropuesta(milagritos)).toBe(false)
  })

  it('aprueban Mariela o Sebastián, cualquiera de los dos alcanza', () => {
    expect(puedeAprobarPropuesta(mariela)).toBe(true)
    expect(puedeAprobarPropuesta(sebas)).toBe(true)
  })

  it('Gerencia queda fuera de ESTE circuito (cambio 2026-09-11)', () => {
    expect(puedeVerPropuestas(juan)).toBe(false)
    expect(puedeAprobarPropuesta(juan)).toBe(false)
  })

  it('Beatriz ve el panel pero no aprueba', () => {
    expect(puedeAprobarPropuesta(beatriz)).toBe(false)
  })
})

describe('totales por moneda', () => {
  it('NUNCA suma PEN con USD', () => {
    const r = totalesDeLote([
      { moneda: 'PEN', montoAPagar: 100, yaPagada: false },
      { moneda: 'USD', montoAPagar: 50, yaPagada: false },
      { moneda: 'PEN', montoAPagar: 25.5, yaPagada: false },
    ])
    expect(r.total).toEqual([
      { moneda: 'PEN', monto: 125.5 },
      { moneda: 'USD', monto: 50 },
    ])
  })

  it('el pendiente descuenta lo ya pagado', () => {
    const r = totalesDeLote([
      { moneda: 'PEN', montoAPagar: 100, yaPagada: true },
      { moneda: 'PEN', montoAPagar: 40, yaPagada: false },
    ])
    expect(r.total).toEqual([{ moneda: 'PEN', monto: 140 }])
    expect(r.pendiente).toEqual([{ moneda: 'PEN', monto: 40 }])
  })

  it('un lote enteramente pagado deja el pendiente vacío', () => {
    const r = totalesDeLote([{ moneda: 'PEN', montoAPagar: 10, yaPagada: true }])
    expect(r.pendiente).toEqual([])
  })

  it('redondea a centavo', () => {
    expect(sumarPorMoneda([{ moneda: 'PEN', monto: 0.1 }, { moneda: 'PEN', monto: 0.2 }])).toEqual([
      { moneda: 'PEN', monto: 0.3 },
    ])
  })
})
