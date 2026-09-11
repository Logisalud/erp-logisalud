import { describe, expect, it } from 'vitest'
import { igvDeBase, igvSegun, totalSegun, validarPagoDirecto, TOPE_PAGO_DIRECTO_PEN } from '@/domain/obligacion'

describe('igvSegun / totalSegun', () => {
  it('sin el flag calcula el 18% de siempre', () => {
    expect(igvSegun(1000, false)).toBe(180)
    expect(igvSegun(1000, undefined)).toBe(igvDeBase(1000))
    expect(totalSegun(1000, false)).toBe(1180)
  })

  it('con el flag el IGV es 0 y el total es la base sola', () => {
    expect(igvSegun(1000, true)).toBe(0)
    expect(totalSegun(1000, true)).toBe(1000)
  })

  it('redondea a centavo, igual que las columnas generadas', () => {
    expect(igvSegun(33.33, false)).toBe(6)
    expect(totalSegun(33.33, false)).toBe(39.33)
    expect(totalSegun(33.33, true)).toBe(33.33)
  })

  it('una base vacía o basura no explota', () => {
    expect(igvSegun(0, true)).toBe(0)
    expect(totalSegun(Number('x'), false)).toBe(0)
  })
})

const basePagoDirecto = {
  proveedorId: 'p1',
  categoriaId: 'c1',
  descripcion: 'Alquiler de oficina',
  numeroFactura: 'F001-1',
  fechaFactura: '2026-09-10',
  moneda: 'PEN' as const,
  tipoCambio: null,
  montoDetraccion: null,
  tieneDetraccion: false,
  porcentajeDetraccion: null,
}

describe('el tope de Pago Directo se mide contra el total real', () => {
  // Una base que con IGV pasa el tope pero sin IGV no llega.
  const baseLimite = Math.ceil((TOPE_PAGO_DIRECTO_PEN / 1.18) + 1)

  it('gravada: el IGV la empuja por encima del tope y se rechaza', () => {
    const errores = validarPagoDirecto({ ...basePagoDirecto, baseImponible: baseLimite })
    expect(errores.some((e) => e.campo === 'baseImponible')).toBe(true)
  })

  it('sin IGV: el mismo monto entra, porque ese 18% no existe', () => {
    const errores = validarPagoDirecto({ ...basePagoDirecto, baseImponible: baseLimite, sinIgv: true })
    expect(errores.some((e) => e.campo === 'baseImponible')).toBe(false)
  })

  it('sin IGV sigue rechazando si la base sola ya supera el tope', () => {
    const errores = validarPagoDirecto({
      ...basePagoDirecto, baseImponible: TOPE_PAGO_DIRECTO_PEN + 1, sinIgv: true,
    })
    expect(errores.some((e) => e.campo === 'baseImponible')).toBe(true)
  })
})
