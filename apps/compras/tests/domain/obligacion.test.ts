import { describe, expect, it } from 'vitest'
import {
  calcularDetraccionSugerida,
  calcularFechaVencimientoReal,
  conciliarLineas,
  montoAPagarConNotasCredito,
  normalizarNumeroFactura,
  redondear,
  transicionPermitida,
  etiquetaCondicionPago,
  igvDeBase,
  validarObligacion,
  validarObligacionSinFactura,
  validarPagoDirecto,
  type BorradorPagoDirecto,
} from '@/domain/obligacion'

describe('normalizarNumeroFactura', () => {
  it('mayúsculas y sin espacios al borde', () => {
    expect(normalizarNumeroFactura('f001-00000123')).toBe('F001-00000123')
    expect(normalizarNumeroFactura('  F001-123  ')).toBe('F001-123')
  })

  it('F001-123 y F002-123 son comprobantes distintos — la serie es parte de la identidad', () => {
    expect(normalizarNumeroFactura('F001-123')).not.toBe(normalizarNumeroFactura('F002-123'))
  })

  it('mismo comprobante escrito distinto normaliza igual', () => {
    expect(normalizarNumeroFactura('f001-123')).toBe(normalizarNumeroFactura(' F001-123 '))
  })
})

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

describe('igvDeBase', () => {
  it('es el 18% de la base, redondeado a dos decimales', () => {
    expect(igvDeBase(100)).toBe(18)
    expect(igvDeBase(84.75)).toBe(15.26)
  })

  it('una base vacía o no numérica da 0, no NaN — la pantalla lo muestra en vivo mientras se escribe', () => {
    expect(igvDeBase(0)).toBe(0)
    expect(igvDeBase(Number.NaN)).toBe(0)
  })
})

describe('etiquetaCondicionPago', () => {
  it('0 días es "Contado", no "0 días"', () => {
    expect(etiquetaCondicionPago(0)).toBe('Contado')
    expect(etiquetaCondicionPago(30)).toBe('30 días')
  })
})

describe('validarObligacionSinFactura (Pieza E)', () => {
  const base = {
    proveedorId: 'prov-1',
    numeroFactura: '',
    fechaFactura: '',
    moneda: 'PEN',
    baseImponible: 100,
  }

  it('no exige número ni fecha de factura: todavía no existe el comprobante', () => {
    expect(validarObligacionSinFactura(base)).toEqual([])
  })

  it('sigue exigiendo lo que no depende de la factura (proveedor, base)', () => {
    const errores = validarObligacionSinFactura({ ...base, proveedorId: '', baseImponible: 0 })
    expect(errores.some((e) => e.campo === 'proveedorId')).toBe(true)
    expect(errores.some((e) => e.campo === 'baseImponible')).toBe(true)
  })
})

describe('pago directo pendiente de factura (Pieza E)', () => {
  const base: BorradorPagoDirecto = {
    proveedorId: 'prov-1',
    categoriaId: 'cat-1',
    descripcion: 'Servicio de fumigación cotizado',
    numeroFactura: '',
    fechaFactura: '',
    moneda: 'PEN',
    baseImponible: 100,
    pendienteFactura: true,
  }

  it('con la cotización basta: sin número ni fecha no hay errores', () => {
    expect(validarPagoDirecto(base)).toEqual([])
  })

  it('sin marcar pendiente, esos mismos datos vacíos sí son error', () => {
    const errores = validarPagoDirecto({ ...base, pendienteFactura: false })
    expect(errores.some((e) => e.campo === 'numeroFactura')).toBe(true)
  })

  it('la condición de pago tiene que ser una de la lista (Pieza F)', () => {
    expect(validarPagoDirecto({ ...base, condicionPagoDias: 30 })).toEqual([])
    expect(validarPagoDirecto({ ...base, condicionPagoDias: 0 })).toEqual([])
    const errores = validarPagoDirecto({ ...base, condicionPagoDias: 17 })
    expect(errores.some((e) => e.campo === 'condicionPagoDias')).toBe(true)
  })

  it('una obligación pendiente de factura solo puede pasar a registrada', () => {
    expect(transicionPermitida('pendiente_factura', 'registrada')).toBe(true)
    expect(transicionPermitida('pendiente_factura', 'conforme')).toBe(false)
    expect(transicionPermitida('pendiente_factura', 'pagada')).toBe(false)
  })
})
