import { describe, expect, it } from 'vitest'
import {
  esDevolucionAccionista, saldoDisponible, validarDevolucion,
} from '@/domain/devolucion-accionista'

const aporte = (montoAporte: number, yaDevuelto = 0, moneda = 'PEN') => ({
  aporteId: 'ap-1', montoAporte, yaDevuelto, moneda,
})

describe('cuándo aplica', () => {
  it('reconoce la categoría exacta, tolerando espacios', () => {
    expect(esDevolucionAccionista('Devolución de deuda a accionista')).toBe(true)
    expect(esDevolucionAccionista('  Devolución de deuda a accionista  ')).toBe(true)
  })

  it('no se confunde con otras categorías ni con el aporte', () => {
    expect(esDevolucionAccionista('Abonos a DIPHASAC (empresa relacionada)')).toBe(false)
    expect(esDevolucionAccionista('Aporte de accionista')).toBe(false)
    expect(esDevolucionAccionista(null)).toBe(false)
  })
})

describe('el vínculo con el aporte es obligatorio', () => {
  it('sin aporte elegido, no pasa', () => {
    const errores = validarDevolucion({ aporteId: null, monto: 100, moneda: 'PEN', saldo: null })
    expect(errores.map((e) => e.campo)).toEqual(['aporteAccionistaId'])
    expect(errores[0].mensaje).toContain('Elige qué aporte')
  })

  it('con un aporte que no existe, tampoco', () => {
    const errores = validarDevolucion({ aporteId: 'fantasma', monto: 100, moneda: 'PEN', saldo: null })
    expect(errores[0].mensaje).toContain('No se encontró')
  })
})

describe('la validación de monto (opción 2 del diseño)', () => {
  it('devolver menos de lo aportado está bien', () => {
    expect(validarDevolucion({
      aporteId: 'ap-1', monto: 3000, moneda: 'PEN', saldo: aporte(10000),
    })).toEqual([])
  })

  it('devolver exactamente lo que queda está bien', () => {
    expect(validarDevolucion({
      aporteId: 'ap-1', monto: 10000, moneda: 'PEN', saldo: aporte(10000),
    })).toEqual([])
  })

  it('devolver MÁS de lo aportado se rechaza — el caso incoherente', () => {
    const errores = validarDevolucion({
      aporteId: 'ap-1', monto: 12000, moneda: 'PEN', saldo: aporte(10000),
    })
    expect(errores.map((e) => e.campo)).toEqual(['monto'])
  })

  it('el mensaje dice CUÁNTO queda, no solo que no se puede', () => {
    const errores = validarDevolucion({
      aporteId: 'ap-1', monto: 8000, moneda: 'PEN', saldo: aporte(10000, 4000),
    })
    // 10000 - 4000 = 6000 disponibles
    expect(errores[0].mensaje).toContain('6,000.00')
  })

  it('cuenta las devoluciones previas: dos parciales no pueden exceder el total', () => {
    // Ya se devolvieron 7000 de 10000; pedir 3500 se pasa por 500.
    const errores = validarDevolucion({
      aporteId: 'ap-1', monto: 3500, moneda: 'PEN', saldo: aporte(10000, 7000),
    })
    expect(errores).toHaveLength(1)
    // Pero 3000 justos entran.
    expect(validarDevolucion({
      aporteId: 'ap-1', monto: 3000, moneda: 'PEN', saldo: aporte(10000, 7000),
    })).toEqual([])
  })

  it('un aporte ya devuelto por completo se rechaza con su propio mensaje', () => {
    const errores = validarDevolucion({
      aporteId: 'ap-1', monto: 100, moneda: 'PEN', saldo: aporte(10000, 10000),
    })
    expect(errores[0].mensaje).toContain('ya fue devuelto por completo')
  })

  it('no se puede devolver en otra moneda que la del aporte', () => {
    // Mezclar PEN con USD haría que el saldo neto no signifique nada.
    const errores = validarDevolucion({
      aporteId: 'ap-1', monto: 100, moneda: 'USD', saldo: aporte(10000, 0, 'PEN'),
    })
    expect(errores.map((e) => e.campo)).toEqual(['moneda'])
    expect(errores[0].mensaje).toContain('PEN')
  })
})

describe('saldoDisponible', () => {
  it('resta lo ya devuelto y redondea a centavos', () => {
    expect(saldoDisponible(aporte(10000, 2500.555))).toBe(7499.45)
  })

  it('sin devoluciones previas, el saldo es el aporte entero', () => {
    expect(saldoDisponible(aporte(10000))).toBe(10000)
  })
})
