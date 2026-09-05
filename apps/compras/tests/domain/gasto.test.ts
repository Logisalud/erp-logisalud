import { describe, expect, it } from 'vitest'
import {
  ESTADO_INICIAL_SOLICITUD,
  calcularLiquidacion,
  estadoTrasPago,
  montoTotalSolicitud,
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
    baseImponible: 100, igv: 18, descripcion: 'Útiles de oficina',
    tipoComprobante: 'factura' as const, fechaFactura: '2026-08-15',
  }

  it('sin errores con un borrador completo (gasto_directo con base/igv)', () => {
    expect(validarSolicitud(base)).toEqual([])
  })

  it('exige categoría', () => {
    const errores = validarSolicitud({ ...base, categoriaId: '' })
    expect(errores.some((e) => e.campo === 'categoriaId')).toBe(true)
  })

  it('exige base imponible positiva', () => {
    const errores = validarSolicitud({ ...base, baseImponible: 0 })
    expect(errores.some((e) => e.campo === 'baseImponible')).toBe(true)
  })

  it('acepta IGV en 0 — boleta de un régimen que no lo discrimina (RUS)', () => {
    const errores = validarSolicitud({ ...base, igv: 0 })
    expect(errores.some((e) => e.campo === 'igv')).toBe(false)
  })

  it('exige que el IGV venga informado (aunque sea 0), nunca se inventa solo', () => {
    const errores = validarSolicitud({ ...base, igv: null })
    expect(errores.some((e) => e.campo === 'igv')).toBe(true)
  })

  it('anticipo: exige montoAnticipo en vez de base/igv', () => {
    const errores = validarSolicitud({
      tipo: 'anticipo', categoriaId: 'cat-1', moneda: 'PEN', descripcion: 'Viaje a Lurín', montoAnticipo: 500,
    })
    expect(errores).toEqual([])
  })

  it('anticipo sin monto: error', () => {
    const errores = validarSolicitud({
      tipo: 'anticipo', categoriaId: 'cat-1', moneda: 'PEN', descripcion: 'Viaje a Lurín', montoAnticipo: 0,
    })
    expect(errores.some((e) => e.campo === 'montoAnticipo')).toBe(true)
  })

  it('anticipo: la fecha de fin no puede ser antes que la de inicio', () => {
    const errores = validarSolicitud({
      tipo: 'anticipo', categoriaId: 'cat-1', moneda: 'PEN', descripcion: 'Viaje', montoAnticipo: 500,
      fechaInicio: '2026-09-10', fechaFin: '2026-09-05',
    })
    expect(errores.some((e) => e.campo === 'fechaFin')).toBe(true)
  })
})

describe('montoTotalSolicitud', () => {
  it('anticipo: es el monto pedido directo', () => {
    expect(montoTotalSolicitud({ tipo: 'anticipo', montoAnticipo: 500 })).toBe(500)
  })

  it('gasto_directo/reembolso: suma base + IGV', () => {
    expect(montoTotalSolicitud({ tipo: 'gasto_directo', baseImponible: 100, igv: 18 })).toBe(118)
  })

  it('gasto_directo con IGV en 0 (RUS): el total es solo la base', () => {
    expect(montoTotalSolicitud({ tipo: 'reembolso', baseImponible: 100, igv: 0 })).toBe(100)
  })
})

describe('validarSolicitud: fecha del comprobante (Pieza H)', () => {
  const reembolso = {
    tipo: 'reembolso' as const,
    categoriaId: 'cat-1',
    moneda: 'PEN',
    baseImponible: 100,
    igv: 18,
    descripcion: 'Taxi a la notaría',
  }

  it('con factura o boleta, la fecha del comprobante es obligatoria', () => {
    const errores = validarSolicitud({ ...reembolso, tipoComprobante: 'factura', fechaFactura: null })
    expect(errores.some((e) => e.campo === 'fechaFactura')).toBe(true)
  })

  it('con la fecha puesta no hay error', () => {
    expect(validarSolicitud({ ...reembolso, tipoComprobante: 'factura', fechaFactura: '2026-09-01' })).toEqual([])
  })

  it('sin comprobante no se exige: no hay nada de dónde copiarla', () => {
    expect(validarSolicitud({ ...reembolso, tipoComprobante: 'sin_comprobante', fechaFactura: null })).toEqual([])
  })

  it('un anticipo no lleva fecha de comprobante — se sustenta al rendirlo', () => {
    const errores = validarSolicitud({
      tipo: 'anticipo', categoriaId: 'cat-1', moneda: 'PEN',
      montoAnticipo: 500, descripcion: 'Viaje a Trujillo',
    })
    expect(errores).toEqual([])
  })
})

describe('ESTADO_INICIAL_SOLICITUD (Pieza A)', () => {
  it('una solicitud nace en Contabilidad, no esperando a un jefe', () => {
    expect(ESTADO_INICIAL_SOLICITUD).toBe('pendiente_contabilidad')
  })
})
