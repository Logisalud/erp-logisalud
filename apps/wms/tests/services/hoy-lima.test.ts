import { describe, expect, it } from 'vitest'
import { hoyLima } from '@/lib/hoy-lima'

describe('hoyLima', () => {
  it('a las 19:00 de Lima ya es el día siguiente en UTC, pero «hoy» sigue siendo el de Lima', () => {
    expect(hoyLima(new Date('2026-11-04T00:08:00Z'))).toBe('2026-11-03')
  })
  it('a las 05:00 UTC (medianoche en Lima) empieza el día de Lima', () => {
    expect(hoyLima(new Date('2026-11-04T04:59:59Z'))).toBe('2026-11-03')
    expect(hoyLima(new Date('2026-11-04T05:00:00Z'))).toBe('2026-11-04')
  })
  it('cruza bien el fin de año', () => {
    expect(hoyLima(new Date('2027-01-01T03:00:00Z'))).toBe('2026-12-31')
  })
})
