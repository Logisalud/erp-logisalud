import { describe, expect, it } from 'vitest'
import {
  puedeAprobarse,
  siguienteCodigoPropuesta,
  transicionPermitida,
  validarPropuesta,
} from '@/domain/propuesta'

describe('transicionPermitida', () => {
  it('borrador solo puede pasar a pendiente_aprobacion', () => {
    expect(transicionPermitida('borrador', 'pendiente_aprobacion')).toBe(true)
    expect(transicionPermitida('borrador', 'aprobada')).toBe(false)
  })

  it('pendiente_aprobacion puede aprobarse o rechazarse', () => {
    expect(transicionPermitida('pendiente_aprobacion', 'aprobada')).toBe(true)
    expect(transicionPermitida('pendiente_aprobacion', 'rechazada')).toBe(true)
  })

  it('una rechazada puede volver a armarse como borrador', () => {
    expect(transicionPermitida('rechazada', 'borrador')).toBe(true)
  })

  it('aprobada es un estado final', () => {
    expect(transicionPermitida('aprobada', 'borrador')).toBe(false)
  })
})

describe('puedeAprobarse', () => {
  it('solo pendiente_aprobacion', () => {
    expect(puedeAprobarse('pendiente_aprobacion')).toBe(true)
    expect(puedeAprobarse('borrador')).toBe(false)
    expect(puedeAprobarse('aprobada')).toBe(false)
  })
})

describe('siguienteCodigoPropuesta', () => {
  it('primera del año', () => {
    expect(siguienteCodigoPropuesta(2026, null)).toBe('PP-2026-0001')
  })

  it('correlativo desde la última', () => {
    expect(siguienteCodigoPropuesta(2026, 'PP-2026-0007')).toBe('PP-2026-0008')
  })
})

describe('validarPropuesta', () => {
  it('exige al menos una obligación', () => {
    expect(validarPropuesta([])).toHaveLength(1)
  })

  it('sin errores con al menos una', () => {
    expect(validarPropuesta(['ob-1'])).toEqual([])
  })
})
