import { describe, expect, it } from 'vitest'
import { baseEIgvMovimiento, transicionPermitida, validarMovimiento } from '@/domain/caja-chica'

describe('validarMovimiento', () => {
  const base = {
    fondoId: 'f-1', categoriaId: 'cat-1', fecha: '2026-08-28', monto: 118,
    tipoComprobante: 'boleta' as const, baseImponible: 100, igv: 18, sustentable: true,
  }

  it('sin errores con un borrador completo', () => {
    expect(validarMovimiento(base)).toEqual([])
  })

  it('exige base imponible positiva cuando hay comprobante', () => {
    const errores = validarMovimiento({ ...base, baseImponible: 0 })
    expect(errores.some((e) => e.campo === 'baseImponible')).toBe(true)
  })

  it('exige que el IGV venga informado (aunque sea 0) cuando hay comprobante', () => {
    const errores = validarMovimiento({ ...base, igv: null })
    expect(errores.some((e) => e.campo === 'igv')).toBe(true)
  })

  it('acepta IGV en 0 (RUS)', () => {
    const errores = validarMovimiento({ ...base, igv: 0 })
    expect(errores.some((e) => e.campo === 'igv')).toBe(false)
  })

  it('sin_comprobante no exige base/igv', () => {
    const errores = validarMovimiento({
      fondoId: 'f-1', categoriaId: 'cat-1', fecha: '2026-08-28', monto: 20,
      tipoComprobante: 'sin_comprobante', sustentable: false,
    })
    expect(errores).toEqual([])
  })

  it('exige monto positivo', () => {
    const errores = validarMovimiento({ ...base, monto: 0 })
    expect(errores.some((e) => e.campo === 'monto')).toBe(true)
  })
})

describe('baseEIgvMovimiento', () => {
  it('con comprobante: usa la base/igv transcritos', () => {
    expect(baseEIgvMovimiento({ tipoComprobante: 'boleta', monto: 118, baseImponible: 100, igv: 18 }))
      .toEqual({ baseImponible: 100, igv: 18 })
  })

  it('sin comprobante: todo el monto es base, IGV 0 — no se inventa', () => {
    expect(baseEIgvMovimiento({ tipoComprobante: 'sin_comprobante', monto: 20, baseImponible: null, igv: null }))
      .toEqual({ baseImponible: 20, igv: 0 })
  })
})

describe('transicionPermitida', () => {
  it('pendiente_jefe puede aprobarse o rechazarse', () => {
    expect(transicionPermitida('pendiente_jefe', 'pendiente_contabilidad')).toBe(true)
    expect(transicionPermitida('pendiente_jefe', 'rechazada_jefe')).toBe(true)
  })

  it('rechazada_jefe y cerrada son estados finales', () => {
    expect(transicionPermitida('rechazada_jefe', 'pendiente_contabilidad')).toBe(false)
    expect(transicionPermitida('cerrada', 'pendiente_jefe')).toBe(false)
  })

  it('aprobada no se pone a mano a pagada — lo dispara Tesorería al pagar', () => {
    expect(transicionPermitida('aprobada', 'pagada')).toBe(false)
  })
})
