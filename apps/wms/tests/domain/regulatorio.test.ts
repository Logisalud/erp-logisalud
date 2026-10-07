import { describe, expect, it } from 'vitest'
import { puedeAprobarse, situacionRS } from '@/domain/regulatorio'
import type { Regulatorio } from '@/domain/tipos'

const reg = (over: Partial<Regulatorio> = {}): Regulatorio => ({
  productoId: 'p', registroSanitario: 'EG-1234', rsVence: '2030-01-01', estadoValidacion: 'VALIDADO', ...over,
})

describe('registro sanitario', () => {
  it('clasifica vigente, por vencer, vencido y sin dato', () => {
    expect(situacionRS('2027-06-01', '2026-10-07')).toBe('VIGENTE')
    expect(situacionRS('2026-12-01', '2026-10-07')).toBe('POR_VENCER')
    expect(situacionRS('2026-10-06', '2026-10-07')).toBe('VENCIDO')
    expect(situacionRS('2026-10-07', '2026-10-07')).toBe('POR_VENCER') // vence hoy: todavía vale
    expect(situacionRS(undefined, '2026-10-07')).toBe('SIN_DATO')
  })
  it('un RS vencido bloquea la aprobación', () => {
    const r = puedeAprobarse(reg({ rsVence: '2026-01-01' }), '2026-10-07')
    expect(r.puede).toBe(false)
    if (!r.puede) expect(r.motivo).toBe('RS_VENCIDO')
  })
  it('un producto sin validar no se aprueba', () => {
    const r = puedeAprobarse(reg({ estadoValidacion: 'PENDIENTE' }), '2026-10-07')
    expect(r.puede).toBe(false)
  })
  it('un producto sin registro cargado no se aprueba', () => {
    expect(puedeAprobarse(reg({ registroSanitario: undefined }), '2026-10-07').puede).toBe(false)
  })
  it('validado y vigente sí se aprueba', () => {
    expect(puedeAprobarse(reg(), '2026-10-07').puede).toBe(true)
  })
})
