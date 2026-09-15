import { describe, it, expect } from 'vitest'
import { hoyLima, mesActualLima, anioActualLima, anioMesStorageLima } from '@/domain/fecha'

/**
 * El caso que da nombre a todo esto es el primero: es el pago real que
 * Mariela registró el 11/09 a las 22:50 de Lima y que quedó guardado como
 * 12/09. 22:50 en Lima (UTC-5) son las 03:50 UTC del día siguiente.
 */
describe('hoyLima', () => {
  it('el pago de las 22:50 del 11/09 en Lima es 11/09, no 12/09', () => {
    const instante = new Date('2026-09-12T03:50:00Z')
    expect(hoyLima(instante)).toBe('2026-09-11')
    // Lo que hacía el código viejo, para que quede a la vista por qué:
    expect(instante.toISOString().slice(0, 10)).toBe('2026-09-12')
  })

  it('a las 18:59 de Lima todavía es el mismo día en UTC (el bug no aparece)', () => {
    expect(hoyLima(new Date('2026-09-11T23:59:00Z'))).toBe('2026-09-11')
  })

  it('a las 19:00 de Lima arranca la ventana rota: UTC ya pasó de día', () => {
    const instante = new Date('2026-09-12T00:00:00Z')
    expect(hoyLima(instante)).toBe('2026-09-11')
    expect(instante.toISOString().slice(0, 10)).toBe('2026-09-12')
  })

  it('justo después de medianoche en Lima ya es el día nuevo', () => {
    expect(hoyLima(new Date('2026-09-12T05:00:00Z'))).toBe('2026-09-12')
  })

  it('cruce de año: el 31/12 a las 20:00 de Lima sigue siendo 2026', () => {
    expect(hoyLima(new Date('2027-01-01T01:00:00Z'))).toBe('2026-12-31')
  })

  it('devuelve siempre YYYY-MM-DD con ceros a la izquierda', () => {
    expect(hoyLima(new Date('2026-01-05T15:00:00Z'))).toBe('2026-01-05')
  })
})

describe('mesActualLima', () => {
  it('el 01/10 a las 00:30 de Lima es octubre', () => {
    expect(mesActualLima(new Date('2026-10-01T05:30:00Z'))).toBe('2026-10')
  })

  it('el 30/09 a las 21:00 de Lima sigue siendo septiembre', () => {
    const instante = new Date('2026-10-01T02:00:00Z')
    expect(mesActualLima(instante)).toBe('2026-09')
    expect(instante.toISOString().slice(0, 7)).toBe('2026-10')
  })
})

describe('anioActualLima', () => {
  it('el 31/12 a las 20:00 de Lima el correlativo sigue en el año viejo', () => {
    const instante = new Date('2027-01-01T01:00:00Z')
    expect(anioActualLima(instante)).toBe(2026)
    expect(instante.getUTCFullYear()).toBe(2027)
  })
})

describe('anioMesStorageLima', () => {
  it('arma YYYY/MM en hora de Lima', () => {
    expect(anioMesStorageLima(new Date('2026-10-01T02:00:00Z'))).toBe('2026/09')
  })

  it('el resultado satisface los dos primeros segmentos de path_legajo_valido', () => {
    // Réplica de la policy de Storage: ^[0-9]{4}/(0[1-9]|1[0-2])/[^/]+/.+$
    const policy = /^[0-9]{4}\/(0[1-9]|1[0-2])\/[^/]+\/.+$/
    const path = `${anioMesStorageLima(new Date('2026-10-01T02:00:00Z'))}/C-0045/voucher.jpg`
    expect(policy.test(path)).toBe(true)
  })
})
