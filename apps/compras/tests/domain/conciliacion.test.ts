import { describe, expect, it } from 'vitest'
import { conciliarFactura } from '@/domain/conciliacion'

describe('conciliarFactura', () => {
  it('concilia sin excepción cuando facturado <= verificado disponible', () => {
    const r = conciliarFactura(
      [{ ocItemId: 'i1', cantidadFacturada: 10, precioFacturado: 5 }],
      [{ ocItemId: 'i1', cantidadVerificadaDisponible: 10, precioUnitarioOC: 5 }]
    )
    expect(r.tieneExcepciones).toBe(false)
    expect(r.lineas[0].tieneExcepcion).toBe(false)
    expect(r.lineas[0].cantidadConciliada).toBe(10)
    expect(r.montoTotalConciliado).toBe(50)
  })

  it('bonificado (precio_facturado <= 0) nunca genera excepción, aunque facture más de lo verificado', () => {
    const r = conciliarFactura(
      [{ ocItemId: 'i1', cantidadFacturada: 100, precioFacturado: 0 }],
      [{ ocItemId: 'i1', cantidadVerificadaDisponible: 5, precioUnitarioOC: 8 }]
    )
    expect(r.tieneExcepciones).toBe(false)
    expect(r.lineas[0].esBonificado).toBe(true)
    expect(r.lineas[0].tieneExcepcion).toBe(false)
    expect(r.lineas[0].montoConciliado).toBe(0)
    expect(r.montoTotalConciliado).toBe(0)
  })

  it('facturado > recibido genera excepción con el monto VERIFICADO, no el facturado', () => {
    const r = conciliarFactura(
      [{ ocItemId: 'i1', cantidadFacturada: 20, precioFacturado: 10 }],
      [{ ocItemId: 'i1', cantidadVerificadaDisponible: 12, precioUnitarioOC: 10 }]
    )
    expect(r.tieneExcepciones).toBe(true)
    expect(r.lineas[0].tieneExcepcion).toBe(true)
    expect(r.lineas[0].cantidadConciliada).toBe(12)
    expect(r.lineas[0].montoConciliado).toBe(120)
    expect(r.montoTotalConciliado).toBe(120)
    expect(r.lineas[0].motivoExcepcion).toMatch(/supera lo verificado/)
  })

  it('el monto conciliado usa el precio de la OC, nunca el precio facturado', () => {
    const r = conciliarFactura(
      [{ ocItemId: 'i1', cantidadFacturada: 5, precioFacturado: 99 }],
      [{ ocItemId: 'i1', cantidadVerificadaDisponible: 5, precioUnitarioOC: 10 }]
    )
    expect(r.lineas[0].montoConciliado).toBe(50)
  })

  it('mezcla líneas normales, bonificadas y con excepción en una sola factura', () => {
    const r = conciliarFactura(
      [
        { ocItemId: 'normal', cantidadFacturada: 3, precioFacturado: 4 },
        { ocItemId: 'bonificado', cantidadFacturada: 2, precioFacturado: 0 },
        { ocItemId: 'excepcion', cantidadFacturada: 8, precioFacturado: 2 },
      ],
      [
        { ocItemId: 'normal', cantidadVerificadaDisponible: 3, precioUnitarioOC: 4 },
        { ocItemId: 'bonificado', cantidadVerificadaDisponible: 2, precioUnitarioOC: 4 },
        { ocItemId: 'excepcion', cantidadVerificadaDisponible: 5, precioUnitarioOC: 2 },
      ]
    )
    expect(r.tieneExcepciones).toBe(true)
    expect(r.lineas.find((l) => l.ocItemId === 'normal')?.tieneExcepcion).toBe(false)
    expect(r.lineas.find((l) => l.ocItemId === 'bonificado')?.tieneExcepcion).toBe(false)
    expect(r.lineas.find((l) => l.ocItemId === 'excepcion')?.tieneExcepcion).toBe(true)
    // 3*4 (normal) + 0 (bonificado) + 5*2 (excepción, capado a lo verificado)
    expect(r.montoTotalConciliado).toBe(22)
  })

  it('lanza si una línea de factura no corresponde a la OC', () => {
    expect(() =>
      conciliarFactura([{ ocItemId: 'no-existe', cantidadFacturada: 1, precioFacturado: 1 }], [])
    ).toThrow()
  })
})
