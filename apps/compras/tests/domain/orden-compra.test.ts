import { describe, expect, it } from 'vitest'
import {
  calcularTotales,
  puedeCerrarseParcial,
  puedeEditarse,
  redondear,
  siguienteCodigoOC,
  transicionPermitida,
  validarOC,
} from '@/domain/orden-compra'

describe('puedeCerrarseParcial', () => {
  it('solo una OC parcialmente recibida puede cerrarse con saldo pendiente', () => {
    expect(puedeCerrarseParcial('parcialmente_recibida')).toBe(true)
  })
  it('una OC recibida completa, borrador, o ya cerrada no aplica', () => {
    expect(puedeCerrarseParcial('recibida_completa')).toBe(false)
    expect(puedeCerrarseParcial('borrador')).toBe(false)
    expect(puedeCerrarseParcial('cerrada')).toBe(false)
  })
})

describe('calcularTotales', () => {
  it('suma, aplica IGV y redondea a 2 decimales', () => {
    expect(calcularTotales([{ cantidadPedida: 10, precioUnitario: 2.5 }])).toEqual({
      subtotal: 25, igv: 4.5, total: 29.5,
    })
  })

  it('redondea cada línea antes de sumar, como hace la factura del proveedor', () => {
    // Las listas de precios traen 4 decimales: 3 x 10.7439 = 32.2317.
    // Redondeando por línea da 32.23; acumulando crudo daría 32.2317 y el
    // total no cuadraría al céntimo con el documento que llega.
    const t = calcularTotales([{ cantidadPedida: 3, precioUnitario: 10.7439 }])
    expect(t.subtotal).toBe(32.23)
    expect(t.igv).toBe(5.8)
    expect(t.total).toBe(38.03)
  })

  it('una OC sin líneas da todo en cero', () => {
    expect(calcularTotales([])).toEqual({ subtotal: 0, igv: 0, total: 0 })
  })
})

describe('redondear', () => {
  it('no se come el medio céntimo por el binario', () => {
    // Math.round(1.005 * 100) / 100 da 1 en JS, no 1.01.
    expect(redondear(1.005)).toBe(1.01)
    expect(redondear(2.675)).toBe(2.68)
  })
})

describe('transicionPermitida', () => {
  it('permite el camino normal', () => {
    expect(transicionPermitida('borrador', 'enviada')).toBe(true)
    expect(transicionPermitida('enviada', 'confirmada')).toBe(true)
    expect(transicionPermitida('facturada', 'cerrada')).toBe(true)
  })

  it('deja volver de enviada a borrador para corregir', () => {
    expect(transicionPermitida('enviada', 'borrador')).toBe(true)
  })

  it('no deja saltar pasos', () => {
    expect(transicionPermitida('borrador', 'confirmada')).toBe(false)
    expect(transicionPermitida('borrador', 'facturada')).toBe(false)
  })

  it('no deja marcar la recepción a mano: eso lo calcula Almacén', () => {
    expect(transicionPermitida('confirmada', 'parcialmente_recibida')).toBe(false)
    expect(transicionPermitida('confirmada', 'recibida_completa')).toBe(false)
  })

  it('anulada y cerrada son terminales', () => {
    expect(transicionPermitida('anulada', 'borrador')).toBe(false)
    expect(transicionPermitida('cerrada', 'facturada')).toBe(false)
  })
})

describe('puedeEditarse', () => {
  it('solo antes de que el proveedor confirme', () => {
    expect(puedeEditarse('borrador')).toBe(true)
    expect(puedeEditarse('enviada')).toBe(true)
    // Con la OC confirmada, cambiar las lineas dejaria a Almacen recibiendo
    // contra una cantidad distinta de la que se pidio.
    expect(puedeEditarse('confirmada')).toBe(false)
    expect(puedeEditarse('facturada')).toBe(false)
  })
})

describe('siguienteCodigoOC', () => {
  it('arranca en 0001 cuando el año no tiene ninguna', () => {
    expect(siguienteCodigoOC(2026, null)).toBe('OC-2026-0001')
  })

  it('sigue el correlativo', () => {
    expect(siguienteCodigoOC(2026, 'OC-2026-0007')).toBe('OC-2026-0008')
    expect(siguienteCodigoOC(2026, 'OC-2026-0099')).toBe('OC-2026-0100')
  })

  it('reinicia con el año nuevo', () => {
    expect(siguienteCodigoOC(2027, null)).toBe('OC-2027-0001')
  })
})

const base = {
  proveedorId: 'p1',
  fechaEmision: '2026-08-27',
  moneda: 'PEN',
  condicionesPagoDias: 30,
  lineas: [{ productoId: 'a', cantidadPedida: 1, precioUnitario: 10 }],
}

describe('validarOC', () => {
  it('acepta una OC bien formada', () => {
    expect(validarOC(base)).toEqual([])
  })

  it('devuelve todos los errores juntos, no el primero', () => {
    const errores = validarOC({ ...base, proveedorId: '', fechaEmision: '', moneda: 'EUR', lineas: [] })
    expect(errores.length).toBe(4)
    expect(errores.map((e) => e.campo).sort()).toEqual(
      ['fechaEmision', 'lineas', 'moneda', 'proveedorId']
    )
  })

  it('exige condición de pago — no se puede dejar en blanco', () => {
    const errores = validarOC({ ...base, condicionesPagoDias: null })
    expect(errores).toEqual([
      { campo: 'condicionesPagoDias', mensaje: 'Pon la condición de pago (0 = contado).' },
    ])
  })

  it('acepta 0 días (contado) como condición de pago válida', () => {
    expect(validarOC({ ...base, condicionesPagoDias: 0 })).toEqual([])
  })

  it('rechaza cantidad cero o negativa', () => {
    expect(validarOC({ ...base, lineas: [{ productoId: 'a', cantidadPedida: 0, precioUnitario: 10 }] }))
      .toHaveLength(1)
    expect(validarOC({ ...base, lineas: [{ productoId: 'a', cantidadPedida: -2, precioUnitario: 10 }] }))
      .toHaveLength(1)
  })

  it('acepta precio 0 (una bonificación) pero no negativo', () => {
    expect(validarOC({ ...base, lineas: [{ productoId: 'a', cantidadPedida: 1, precioUnitario: 0 }] }))
      .toEqual([])
    expect(validarOC({ ...base, lineas: [{ productoId: 'a', cantidadPedida: 1, precioUnitario: -1 }] }))
      .toHaveLength(1)
  })

  it('rechaza el mismo producto en dos líneas', () => {
    const errores = validarOC({
      ...base,
      lineas: [
        { productoId: 'a', cantidadPedida: 1, precioUnitario: 10 },
        { productoId: 'a', cantidadPedida: 2, precioUnitario: 10 },
      ],
    })
    expect(errores).toHaveLength(1)
    expect(errores[0].campo).toBe('lineas.1.productoId')
  })

  it('acepta una OC de "bien" con descripción libre en vez de productoId', () => {
    const errores = validarOC({
      ...base,
      tipo: 'bien',
      lineas: [{ descripcionLibre: 'Impresora láser', cantidadPedida: 1, precioUnitario: 1500 }],
    })
    expect(errores).toEqual([])
  })

  it('exige descripción en una línea de "bien" sin producto', () => {
    const errores = validarOC({
      ...base,
      tipo: 'bien',
      lineas: [{ descripcionLibre: '  ', cantidadPedida: 1, precioUnitario: 1500 }],
    })
    expect(errores).toEqual([{ campo: 'lineas.0.descripcionLibre', mensaje: 'Describe el bien.' }])
  })

  it('no aplica la regla de producto repetido a líneas de "bien"', () => {
    const errores = validarOC({
      ...base,
      tipo: 'bien',
      lineas: [
        { descripcionLibre: 'Silla de oficina', cantidadPedida: 2, precioUnitario: 300 },
        { descripcionLibre: 'Silla de oficina', cantidadPedida: 1, precioUnitario: 300 },
      ],
    })
    expect(errores).toEqual([])
  })

  it('rechaza entrega anterior a la emisión', () => {
    const errores = validarOC({ ...base, fechaEntregaEstimada: '2026-08-01' })
    expect(errores).toHaveLength(1)
    expect(errores[0].campo).toBe('fechaEntregaEstimada')
  })

  it('acepta entrega el mismo día', () => {
    expect(validarOC({ ...base, fechaEntregaEstimada: '2026-08-27' })).toEqual([])
  })
})
