import { describe, expect, it } from 'vitest'
import { calcularTotales, redondear } from '@/domain/orden-compra'

/**
 * La migración 0051 subió `precio_unitario` a numeric(16,4) porque antes la
 * base redondeaba a 2 en silencio. Estos tests fijan la regla resultante,
 * que NO es "todo a 4 decimales":
 *
 *  - el PRECIO conserva 4 decimales (lo necesita un producto fraccionado),
 *  - el IMPORTE de línea y el total son dinero y van a 2 — no se factura
 *    370.0680 soles.
 */
describe('precio con 4 decimales, importe con 2', () => {
  it('un precio de 4 decimales no se pierde en el cálculo', () => {
    const totales = calcularTotales([{ cantidadPedida: 30, precioUnitario: 1.2345 }])
    // 30 × 1.2345 = 37.035 → 37.04 (dinero, 2 decimales)
    expect(totales.subtotal).toBe(37.04)
  })

  it('dos precios que solo difieren en el 4º decimal dan totales distintos', () => {
    const a = calcularTotales([{ cantidadPedida: 1000, precioUnitario: 1.2345 }])
    const b = calcularTotales([{ cantidadPedida: 1000, precioUnitario: 1.2346 }])
    expect(a.subtotal).not.toBe(b.subtotal)
    expect(b.subtotal - a.subtotal).toBeCloseTo(0.1, 10)
  })

  it('el precio fraccionado de una caja de 30 no se redondea a 0 decimales útiles', () => {
    // Una caja de 37.00 entre 30 tabletas: 1.2333… El precio guarda 1.2333,
    // que con (14,2) se habría guardado como 1.23 y perdido S/0.01 por unidad.
    const conCuatro = calcularTotales([{ cantidadPedida: 30, precioUnitario: 1.2333 }])
    const conDos = calcularTotales([{ cantidadPedida: 30, precioUnitario: 1.23 }])
    expect(conCuatro.subtotal).toBe(37)
    expect(conDos.subtotal).toBe(36.9)
    expect(conCuatro.subtotal).not.toBe(conDos.subtotal)
  })

  it('el IGV y el total siguen siendo dinero a 2 decimales', () => {
    const totales = calcularTotales([{ cantidadPedida: 7, precioUnitario: 3.3333 }])
    expect(totales.subtotal).toBe(23.33)
    expect(totales.igv).toBe(redondear(23.33 * 0.18))
    expect(totales.total).toBe(redondear(23.33 + totales.igv))
  })
})
