import { describe, expect, it } from 'vitest'
import {
  calcularLiquidacion,
  estadoTrasPago,
  transicionPermitida,
  validarSolicitud,
} from '@/domain/gasto'

describe('transicionPermitida', () => {
  it('pendiente_jefe puede aprobarse o rechazarse', () => {
    expect(transicionPermitida('pendiente_jefe', 'pendiente_contabilidad')).toBe(true)
    expect(transicionPermitida('pendiente_jefe', 'rechazada_jefe')).toBe(true)
  })

  it('pagada no se pone a mano desde ningún estado', () => {
    expect(transicionPermitida('aprobada', 'pagada')).toBe(false)
  })

  it('rechazada_jefe y cerrada son estados finales', () => {
    expect(transicionPermitida('rechazada_jefe', 'pendiente_contabilidad')).toBe(false)
    expect(transicionPermitida('cerrada', 'pendiente_jefe')).toBe(false)
  })

  it('pendiente_rendicion solo puede pasar a rendida', () => {
    expect(transicionPermitida('pendiente_rendicion', 'rendida')).toBe(true)
    expect(transicionPermitida('pendiente_rendicion', 'cerrada')).toBe(false)
  })
})

describe('estadoTrasPago', () => {
  it('un anticipo queda pendiente de rendir', () => {
    expect(estadoTrasPago('anticipo')).toBe('pendiente_rendicion')
  })

  it('gasto_directo y reembolso se cierran solos', () => {
    expect(estadoTrasPago('gasto_directo')).toBe('cerrada')
    expect(estadoTrasPago('reembolso')).toBe('cerrada')
  })
})

describe('calcularLiquidacion', () => {
  it('gastó menos de lo que le dieron: devuelve la diferencia', () => {
    const l = calcularLiquidacion(500, [{ monto: 300, sustentable: true }])
    expect(l).toEqual({ montoSustentado: 300, diferencia: 200, resultado: 'devolucion_empleado' })
  })

  it('gastó más: se le debe un reembolso adicional', () => {
    const l = calcularLiquidacion(500, [{ monto: 300, sustentable: true }, { monto: 250, sustentable: true }])
    expect(l).toEqual({ montoSustentado: 550, diferencia: -50, resultado: 'reembolso_adicional' })
  })

  it('gastó exactamente lo mismo: sin diferencia', () => {
    const l = calcularLiquidacion(500, [{ monto: 500, sustentable: true }])
    expect(l.resultado).toBe('sin_diferencia')
  })

  it('un comprobante no sustentable igual suma al monto sustentado (regla 12 es alerta, no bloqueo)', () => {
    const l = calcularLiquidacion(500, [{ monto: 300, sustentable: false }])
    expect(l.montoSustentado).toBe(300)
  })

  it('sin comprobantes: se debe devolver todo el anticipo', () => {
    const l = calcularLiquidacion(500, [])
    expect(l).toEqual({ montoSustentado: 0, diferencia: 500, resultado: 'devolucion_empleado' })
  })
})

describe('validarSolicitud', () => {
  const base = {
    tipo: 'gasto_directo' as const, categoriaId: 'cat-1', moneda: 'PEN',
    montoSolicitado: 100, descripcion: 'Útiles de oficina',
  }

  it('sin errores con un borrador completo', () => {
    expect(validarSolicitud(base)).toEqual([])
  })

  it('exige categoría', () => {
    const errores = validarSolicitud({ ...base, categoriaId: '' })
    expect(errores.some((e) => e.campo === 'categoriaId')).toBe(true)
  })

  it('exige monto positivo', () => {
    const errores = validarSolicitud({ ...base, montoSolicitado: 0 })
    expect(errores.some((e) => e.campo === 'montoSolicitado')).toBe(true)
  })

  it('anticipo: la fecha de fin no puede ser antes que la de inicio', () => {
    const errores = validarSolicitud({
      ...base, tipo: 'anticipo', fechaInicio: '2026-09-10', fechaFin: '2026-09-05',
    })
    expect(errores.some((e) => e.campo === 'fechaFin')).toBe(true)
  })
})
