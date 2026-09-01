import { describe, expect, it } from 'vitest'
import { calcularFechaVencimientoMultiRecepcion, fechaMasTardia, sumarDias } from '@/domain/vencimiento-obligacion'

describe('fechaMasTardia', () => {
  it('elige la fecha más tardía entre varias recepciones', () => {
    expect(fechaMasTardia(['2026-08-01', '2026-08-15', '2026-08-03'])).toBe('2026-08-15')
  })
  it('funciona con una sola fecha', () => {
    expect(fechaMasTardia(['2026-08-01'])).toBe('2026-08-01')
  })
  it('lanza sin fechas', () => {
    expect(() => fechaMasTardia([])).toThrow()
  })
  it('compara por fecha calendario, sin importar la hora (timestamptz)', () => {
    // Mismo día en ambas: la comparación es solo por fecha, así que se
    // queda con la primera — la hora nunca desempata.
    expect(fechaMasTardia(['2026-08-01T10:00:00Z', '2026-08-01T23:00:00Z'])).toBe('2026-08-01T10:00:00Z')
    expect(fechaMasTardia(['2026-08-01T23:00:00Z', '2026-08-02T00:00:01Z'])).toBe('2026-08-02T00:00:01Z')
  })
})

describe('sumarDias', () => {
  it('suma días de calendario', () => {
    expect(sumarDias('2026-08-29', 30)).toBe('2026-09-28')
  })
})

describe('calcularFechaVencimientoMultiRecepcion', () => {
  it('toma la fecha más tardía entre varias recepciones y suma la condición de pago de la OC', () => {
    const resultado = calcularFechaVencimientoMultiRecepcion(['2026-08-01', '2026-08-20', '2026-08-10'], 30)
    expect(resultado).toBe('2026-09-19')
  })
  it('la condición de pago se aplica tal cual se le pasa, nunca se repregunta', () => {
    expect(calcularFechaVencimientoMultiRecepcion(['2026-01-01'], 0)).toBe('2026-01-01')
  })
})
