import { describe, expect, it } from 'vitest'
import {
  calcularDetraccionSugerida,
  calcularFechaVencimientoReal,
  conciliarLineas,
  montoAPagarConNotasCredito,
  redondear,
  transicionPermitida,
  validarObligacion,
  validarPagoDirecto,
  type BorradorPagoDirecto,
} from '@/domain/obligacion'

describe('calcularFechaVencimientoReal', () => {
  it('cuenta desde la conformidad de la recepción, no desde otra fecha', () => {
    expect(calcularFechaVencimientoReal('2026-08-28', 30)).toBe('2026-09-27')
  })

  it('condición de pago 0 (contado) vence el mismo día de la conformidad', () => {
    expect(calcularFechaVencimientoReal('2026-08-28', 0)).toBe('2026-08-28')
  })

  it('cruza de mes y de año correctamente', () => {
    expect(calcularFechaVencimientoReal('2026-12-20', 45)).toBe('2027-02-03')
  })
})

describe('calcularDetraccionSugerida', () => {
  it('aplica el porcentaje sobre la base + IGV, no solo sobre la base', () => {
    // 100 + 18% IGV = 118; 4% de detracción = 4.72
    expect(calcularDetraccionSugerida(100, 4)).toBe(4.72)
  })
})

describe('montoAPagarConNotasCredito', () => {
  it('resta el total de notas de crédito aplicadas', () => {
    expect(montoAPagarConNotasCredito(118, [18, 10])).toBe(90)
  })

  it('nunca da negativo aunque la NC sea mayor al neto', () => {
    expect(montoAPagarConNotasCredito(50, [80])).toBe(0)
  })

  it('sin notas de crédito, el monto no cambia', () => {
    expect(montoAPagarConNotasCredito(118, [])).toBe(118)
  })
})

describe('redondear', () => {
  it('no se come el medio céntimo por el binario', () => {
    expect(redondear(1.005)).toBe(1.01)
  })
})

describe('transicionPermitida', () => {
  it('registrada puede pasar a observada o directo a conforme', () => {
    expect(transicionPermitida('registrada', 'observada')).toBe(true)
    expect(transicionPermitida('registrada', 'conforme')).toBe(true)
  })

  it('en_propuesta y pagada no se ponen a mano desde ningún estado', () => {
    expect(transicionPermitida('conforme', 'en_propuesta')).toBe(false)
    expect(transicionPermitida('en_propuesta', 'pagada')).toBe(false)
  })

  it('cerrada y canjeada_por_letra son estados finales', () => {
    expect(transicionPermitida('cerrada', 'conforme')).toBe(false)
    expect(transicionPermitida('canjeada_por_letra', 'conforme')).toBe(false)
  })
})

describe('conciliarLineas', () => {
  const lineaOk = { ocItemId: 'i1', cantidadPedida: 10, cantidadRecibida: 10, cantidadFacturada: 10, precioPactado: 10, precioFacturado: 10 }

  it('conforme cuando cantidad y precio coinciden', () => {
    expect(conciliarLineas([lineaOk])).toEqual({ conforme: true, discrepancias: [] })
  })

  it('dentro de la tolerancia de 2% en precio: conforme', () => {
    const r = conciliarLineas([{ ...lineaOk, precioFacturado: 10.19 }]) // 1.9% de desvío
    expect(r.conforme).toBe(true)
  })

  it('fuera de la tolerancia de 2% en precio: observada', () => {
    const r = conciliarLineas([{ ...lineaOk, precioFacturado: 10.21 }]) // 2.1% de desvío
    expect(r.conforme).toBe(false)
    expect(r.discrepancias).toHaveLength(1)
  })

  it('cantidad facturada distinta de la recibida: observada, sin tolerancia', () => {
    const r = conciliarLineas([{ ...lineaOk, cantidadFacturada: 9 }])
    expect(r.conforme).toBe(false)
  })

  it('varias líneas: junta todas las discrepancias, no se detiene en la primera', () => {
    const r = conciliarLineas([
      { ...lineaOk, ocItemId: 'i1', cantidadFacturada: 9 },
      { ...lineaOk, ocItemId: 'i2', precioFacturado: 20 },
    ])
    expect(r.discrepancias).toHaveLength(2)
    expect(r.discrepancias.map((d) => d.ocItemId)).toEqual(['i1', 'i2'])
  })
})

describe('validarObligacion', () => {
  const base = {
    proveedorId: 'prov-1', numeroFactura: 'F001-123', fechaFactura: '2026-08-28',
    moneda: 'PEN', baseImponible: 100,
  }

  it('sin errores con un borrador completo', () => {
    expect(validarObligacion(base)).toEqual([])
  })

  it('exige tipo de cambio en USD', () => {
    const errores = validarObligacion({ ...base, moneda: 'USD' })
    expect(errores.some((e) => e.campo === 'tipoCambio')).toBe(true)
  })

  it('no exige tipo de cambio en PEN', () => {
    const errores = validarObligacion(base)
    expect(errores.some((e) => e.campo === 'tipoCambio')).toBe(false)
  })

  it('exige base imponible positiva', () => {
    const errores = validarObligacion({ ...base, baseImponible: 0 })
    expect(errores.some((e) => e.campo === 'baseImponible')).toBe(true)
  })
})

describe('validarPagoDirecto', () => {
  const base: BorradorPagoDirecto = {
    proveedorId: 'prov-1',
    categoriaId: 'cat-1',
    descripcion: 'Recibo de luz de agosto',
    numeroFactura: 'F001-123',
    fechaFactura: '2026-08-15',
    moneda: 'PEN',
    baseImponible: 100,
  }

  it('sin errores con un borrador completo', () => {
    expect(validarPagoDirecto(base)).toEqual([])
  })

  it('exige categoría', () => {
    const errores = validarPagoDirecto({ ...base, categoriaId: '' })
    expect(errores.some((e) => e.campo === 'categoriaId')).toBe(true)
  })

  it('exige descripción', () => {
    const errores = validarPagoDirecto({ ...base, descripcion: '  ' })
    expect(errores.some((e) => e.campo === 'descripcion')).toBe(true)
  })

  it('también corre las validaciones genéricas de obligación (proveedor, factura, base)', () => {
    const errores = validarPagoDirecto({ ...base, proveedorId: '', baseImponible: 0 })
    expect(errores.some((e) => e.campo === 'proveedorId')).toBe(true)
    expect(errores.some((e) => e.campo === 'baseImponible')).toBe(true)
  })

  it('rechaza un total (base + IGV) de S/5,000 o más en soles', () => {
    // 4237.29 + 18% IGV = 5000.00 exacto — el tope es "menos de", así que rechaza.
    const errores = validarPagoDirecto({ ...base, baseImponible: 4237.29 })
    expect(errores.some((e) => e.campo === 'baseImponible')).toBe(true)
  })

  it('acepta un total apenas debajo del tope', () => {
    const errores = validarPagoDirecto({ ...base, baseImponible: 4000 })
    expect(errores).toEqual([])
  })

  it('no aplica el tope en USD — no hay tipo de cambio de referencia', () => {
    const errores = validarPagoDirecto({ ...base, moneda: 'USD', tipoCambio: 3.8, baseImponible: 10000 })
    expect(errores.some((e) => e.campo === 'baseImponible')).toBe(false)
  })
})
