import { describe, expect, it } from 'vitest'
import { validarNoSobrefacturar, type LineaFacturacion } from '@/domain/obligacion'

function linea(overrides: Partial<LineaFacturacion> = {}): LineaFacturacion {
  return { ocItemId: 'item-1', cantidadPedida: 10, cantidadYaFacturada: 0, cantidadNuevaFactura: 5, ...overrides }
}

describe('validarNoSobrefacturar', () => {
  it('factura dentro de lo pedido: sin error', () => {
    expect(validarNoSobrefacturar([linea({ cantidadPedida: 10, cantidadYaFacturada: 0, cantidadNuevaFactura: 10 })])).toEqual([])
  })

  it('excede lo pedido en la primera factura: error', () => {
    const errores = validarNoSobrefacturar([linea({ cantidadPedida: 10, cantidadYaFacturada: 0, cantidadNuevaFactura: 11 })])
    expect(errores).toHaveLength(1)
    expect(errores[0].ocItemId).toBe('item-1')
  })

  it('acumulado de facturas previas + nueva excede lo pedido: error', () => {
    const errores = validarNoSobrefacturar([linea({ cantidadPedida: 10, cantidadYaFacturada: 7, cantidadNuevaFactura: 5 })])
    expect(errores).toHaveLength(1)
    expect(errores[0].mensaje).toContain('3 unidad')
  })

  it('acumulado exacto (llega justo a lo pedido): sin error', () => {
    expect(validarNoSobrefacturar([linea({ cantidadPedida: 10, cantidadYaFacturada: 7, cantidadNuevaFactura: 3 })])).toEqual([])
  })

  it('ya estaba completamente facturada: cualquier nueva cantidad rechaza', () => {
    const errores = validarNoSobrefacturar([linea({ cantidadPedida: 10, cantidadYaFacturada: 10, cantidadNuevaFactura: 1 })])
    expect(errores).toHaveLength(1)
  })

  it('varias líneas: solo reporta las que exceden, no las que están bien', () => {
    const errores = validarNoSobrefacturar([
      linea({ ocItemId: 'ok', cantidadPedida: 10, cantidadYaFacturada: 0, cantidadNuevaFactura: 10 }),
      linea({ ocItemId: 'excede', cantidadPedida: 10, cantidadYaFacturada: 0, cantidadNuevaFactura: 15 }),
    ])
    expect(errores).toHaveLength(1)
    expect(errores[0].ocItemId).toBe('excede')
  })

  it('evita falsos positivos por drift de punto flotante (0.1 + 0.2)', () => {
    // Si se sumara sin redondear, 0.1 + 0.2 = 0.30000000000000004 > 0.3 marcaría error.
    expect(validarNoSobrefacturar([linea({ cantidadPedida: 0.3, cantidadYaFacturada: 0.1, cantidadNuevaFactura: 0.2 })])).toEqual([])
  })

  it('lista vacía: sin errores', () => {
    expect(validarNoSobrefacturar([])).toEqual([])
  })
})
