import { describe, expect, it } from 'vitest'
import { validarImpuesto } from '@/domain/impuestos'

describe('validarImpuesto', () => {
  const base = { tipoImpuestoId: 'ti-1', periodo: '2026-08', monto: 1500, fechaVencimiento: '2026-09-03', fuente: 'BUK' as const }

  it('sin errores con un borrador completo', () => {
    expect(validarImpuesto(base)).toEqual([])
  })

  it('exige tipo de impuesto', () => {
    const errores = validarImpuesto({ ...base, tipoImpuestoId: '' })
    expect(errores.some((e) => e.campo === 'tipoImpuestoId')).toBe(true)
  })

  it('exige periodo con formato AAAA-MM', () => {
    expect(validarImpuesto({ ...base, periodo: '2026/08' }).some((e) => e.campo === 'periodo')).toBe(true)
    expect(validarImpuesto({ ...base, periodo: '2026-13' }).some((e) => e.campo === 'periodo')).toBe(true)
    expect(validarImpuesto({ ...base, periodo: '26-08' }).some((e) => e.campo === 'periodo')).toBe(true)
  })

  it('exige monto positivo', () => {
    const errores = validarImpuesto({ ...base, monto: 0 })
    expect(errores.some((e) => e.campo === 'monto')).toBe(true)
  })

  it('exige fecha de vencimiento', () => {
    const errores = validarImpuesto({ ...base, fechaVencimiento: '' })
    expect(errores.some((e) => e.campo === 'fechaVencimiento')).toBe(true)
  })
})
