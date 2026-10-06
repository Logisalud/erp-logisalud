import { describe, expect, it } from 'vitest'
import { calcularTotales, separarPorIgv } from '@/domain/orden-compra'
import { totalizarRecepcion, type LineaTresColumnas } from '@/domain/recepcion-tres-columnas'

/**
 * Productos exonerados de IGV de punta a punta (migración 0078).
 *
 * El caso que lo motivó: EMPALIZ y FLOXIGA de JAM Pharma son antidiabéticos
 * exonerados. Antes el circuito entero le sumaba 18% a todo — la OC al
 * subtotal, y la recepción a la base de la deuda —, así que una OC de 81.12
 * se mostraba a 95.72 y Tesorería habría pagado eso.
 */

describe('separarPorIgv — la regla única', () => {
  it('el IGV corre solo sobre lo gravado', () => {
    expect(separarPorIgv([
      { monto: 100 },
      { monto: 50, exoneradoIgv: true },
    ])).toEqual({ gravado: 100, exonerado: 50, igv: 18, total: 168 })
  })

  it('todo exonerado: IGV cero, total = valor', () => {
    expect(separarPorIgv([{ monto: 81.12, exoneradoIgv: true }]))
      .toEqual({ gravado: 0, exonerado: 81.12, igv: 0, total: 81.12 })
  })

  it('el IGV se redondea una vez sobre el total gravado, no línea por línea', () => {
    // Como en el comprobante: 3 líneas de 0.05 → 0.15 gravado → IGV 0.03.
    // Línea por línea daría 0.01 × 3 = 0.03 acá, pero con otros montos no.
    const r = separarPorIgv([{ monto: 33.33 }, { monto: 33.33 }, { monto: 33.33 }])
    expect(r.gravado).toBe(99.99)
    expect(r.igv).toBe(18) // 99.99 × 0.18 = 17.9982
  })
})

describe('la deuda dice lo mismo que la OC', () => {
  /**
   * Lo más importante de este cambio: la OC y la recepción que crea la
   * obligación calculan con la MISMA función. Si una sumara distinto, Compras
   * aprobaría un total y Tesorería pagaría otro.
   */
  const linea = (over: Partial<LineaTresColumnas>): LineaTresColumnas => ({
    ocItemId: 'i', cantidadPedida: 1, precioUnitario: 0, cantidadFactura: 1,
    cantidadFisica: 1, observaciones: null, ...over,
  })

  // Un pedido real a JAM: 10 ORIFLOW (gravado) + 5 EMPALIZ (exonerado).
  const oriflow = { cantidad: 10, precio: 51.5593, exonerado: false }
  const empaliz = { cantidad: 5, precio: 81.12, exonerado: true }

  it('mismo total en la OC y en la deuda que genera la recepción', () => {
    const oc = calcularTotales([oriflow, empaliz].map((l) => ({
      cantidadPedida: l.cantidad, precioUnitario: l.precio, exoneradoIgv: l.exonerado,
    })))
    const recepcion = totalizarRecepcion([oriflow, empaliz].map((l, i) => linea({
      ocItemId: `i${i}`, cantidadPedida: l.cantidad, cantidadFactura: l.cantidad,
      cantidadFisica: l.cantidad, precioUnitario: l.precio, exoneradoIgv: l.exonerado,
    })))

    expect(recepcion.total).toBe(oc.total)
    expect(recepcion.igv).toBe(oc.igv)
    expect(recepcion.base).toBe(oc.gravado)
    expect(recepcion.exonerado).toBe(oc.exonerado)
  })

  it('y ese total es el de la lista de precios de JAM', () => {
    // 10 × 60.84 (ORIFLOW con IGV) + 5 × 81.12 (EMPALIZ, sin IGV) = 1014.00
    const recepcion = totalizarRecepcion([
      linea({ ocItemId: 'a', cantidadPedida: 10, cantidadFactura: 10, cantidadFisica: 10, precioUnitario: 51.5593 }),
      linea({ ocItemId: 'b', cantidadPedida: 5, cantidadFactura: 5, cantidadFisica: 5, precioUnitario: 81.12, exoneradoIgv: true }),
    ])
    expect(recepcion.base).toBe(515.59)
    expect(recepcion.exonerado).toBe(405.6)
    expect(recepcion.igv).toBe(92.81)
    expect(recepcion.total).toBe(1014)
  })

  it('una recepción sin exonerados se calcula exactamente como antes de la 0078', () => {
    const r = totalizarRecepcion([linea({ cantidadPedida: 100, cantidadFactura: 100, cantidadFisica: 100, precioUnitario: 10 })])
    expect(r).toMatchObject({ base: 1000, exonerado: 0, igv: 180, total: 1180 })
  })

  it('lo que cuenta es lo FACTURADO, también para la parte exonerada', () => {
    // Llegó menos de lo facturado (caso A): la base es igual lo facturado,
    // la diferencia la cubre la nota de crédito.
    const r = totalizarRecepcion([
      linea({ cantidadPedida: 5, cantidadFactura: 5, cantidadFisica: 3, precioUnitario: 81.12, exoneradoIgv: true }),
    ])
    expect(r.exonerado).toBe(405.6)
    expect(r.igv).toBe(0)
    expect(r.esperaNotaCredito).toBe(true)
  })
})
