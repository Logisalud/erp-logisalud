import { describe, expect, it } from 'vitest'
import { datosFaltantes, productoCompleto, puedeAprobarse, situacionRS } from '@/domain/regulatorio'
import type { Regulatorio } from '@/domain/tipos'

const reg = (over: Partial<Regulatorio> = {}): Regulatorio => ({
  productoId: 'p', registroSanitario: 'EG-1234', rsVence: '2030-01-01', fabricante: 'Lab', formaPresentacion: 'Tableta', concentracion: '10 mg', condicionAlmacenamiento: 'Menos de 30 C', ...over,
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
  it('sin vencimiento del registro no se aprueba', () => {
    const r = puedeAprobarse(reg({ rsVence: undefined }), '2026-10-07')
    expect(r.puede).toBe(false)
    if (!r.puede) expect(r.motivo).toBe('SIN_REGISTRO')
  })
  it('un producto sin registro cargado no se aprueba', () => {
    expect(puedeAprobarse(reg({ registroSanitario: undefined }), '2026-10-07').puede).toBe(false)
  })
  it('con registro y vencimiento cargados y vigente sí se aprueba, sin segunda validación', () => {
    expect(puedeAprobarse(reg(), '2026-10-07').puede).toBe(true)
  })
  it('PIL-8: un producto con datos incompletos está pendiente de Dirección Técnica y no se aprueba; dice qué falta', () => {
    const r = puedeAprobarse(reg({ fabricante: undefined, concentracion: ' ' }), '2026-10-07')
    expect(r.puede).toBe(false)
    if (!r.puede) { expect(r.motivo).toBe('INCOMPLETO'); expect(r.mensaje).toMatch(/pendiente de Dirección Técnica/) }
    expect(datosFaltantes(reg({ fabricante: undefined, concentracion: ' ' }))).toEqual(['Fabricante', 'Concentración'])
    expect(productoCompleto(reg())).toBe(true)
    expect(productoCompleto(undefined)).toBe(false)
    expect(datosFaltantes(undefined)).toHaveLength(6)
  })
})
