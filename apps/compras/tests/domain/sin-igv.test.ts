import { describe, expect, it } from 'vitest'
import { advertenciasPagoDirecto, esCategoriaDeBacklog, igvDeBase, igvSegun, totalSegun, validarPagoDirecto, TOPE_PAGO_DIRECTO_PEN } from '@/domain/obligacion'

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

describe('el tope de S/5,000 AVISA pero ya no bloquea (2026-09-16)', () => {
  // Una base que con IGV pasa el tope pero sin IGV no llega.
  const baseLimite = Math.ceil((TOPE_PAGO_DIRECTO_PEN / 1.18) + 1)

  it('pasar el tope NO impide guardar, en ninguna categoría', () => {
    // Antes esto devolvía un error en `baseImponible`. La realidad lo
    // desbordó (DIPHASAC, devoluciones a accionistas) y el control real
    // quedó donde siempre estuvo: conformidad y propuesta de pago.
    const errores = validarPagoDirecto({
      ...basePagoDirecto, baseImponible: TOPE_PAGO_DIRECTO_PEN * 10, sinIgv: true,
    })
    expect(errores.some((e) => e.campo === 'baseImponible')).toBe(false)
  })

  it('pero sí avisa, y el aviso se mide contra el total REAL', () => {
    // Gravada: el IGV la empuja por encima del tope.
    expect(advertenciasPagoDirecto({
      moneda: 'PEN', baseImponible: baseLimite, sinIgv: false,
    })).toHaveLength(1)
  })

  it('sin IGV el mismo monto no avisa: ese 18% no existe', () => {
    expect(advertenciasPagoDirecto({
      moneda: 'PEN', baseImponible: baseLimite, sinIgv: true,
    })).toEqual([])
  })

  it('sin IGV sí avisa si la base sola ya supera el tope', () => {
    expect(advertenciasPagoDirecto({
      moneda: 'PEN', baseImponible: TOPE_PAGO_DIRECTO_PEN + 1, sinIgv: true,
    })).toHaveLength(1)
  })

  it('el aviso nombra la Orden de Compra y deja claro que se puede continuar', () => {
    const [aviso] = advertenciasPagoDirecto({
      moneda: 'PEN', baseImponible: 20000, sinIgv: true,
    })
    expect(aviso).toContain('Orden de Compra')
    expect(aviso).toContain('continuar')
  })

  it('en dólares no avisa: no hay tipo de cambio de referencia definido', () => {
    expect(advertenciasPagoDirecto({
      moneda: 'USD', baseImponible: 99999, sinIgv: true,
    })).toEqual([])
  })
})

describe('la categoría del backlog, ya sin relación con el tope', () => {
  const grande = {
    ...basePagoDirecto,
    // Muy por encima del tope de S/5,000.
    baseImponible: 18000,
    sinIgv: true,
    moneda: 'PEN' as const,
  }

  it('ninguna categoría bloquea por monto — tampoco las comunes', () => {
    expect(validarPagoDirecto(grande).map((e) => e.campo)).not.toContain('baseImponible')
    expect(validarPagoDirecto({ ...grande, categoriaNombre: 'Combustible' })
      .map((e) => e.campo)).not.toContain('baseImponible')
  })

  it('la lista sobrevivió al renombre porque tiene OTRO consumidor', () => {
    // Se llamaba CATEGORIAS_EXENTAS_DEL_TOPE. Al volverse informativo el
    // tope parecía borrable, pero `puedeRegistrarsePagoHistorico` la usa
    // para saber qué categoría ES el backlog — ver domain/obligacion.ts.
    expect(esCategoriaDeBacklog('Regularización de pagos antiguos (pre-ERP)')).toBe(true)
  })

  it('esCategoriaDeBacklog tolera espacios y no se confunde con nombres parecidos', () => {
    expect(esCategoriaDeBacklog(' Regularización de pagos antiguos (pre-ERP) ')).toBe(true)
    expect(esCategoriaDeBacklog('Regularización de pagos antiguos')).toBe(false)
    expect(esCategoriaDeBacklog(null)).toBe(false)
  })

  it('la exención NO toca la detracción ni el resto de las reglas', () => {
    // Eximir del tope no puede ser una puerta trasera que apague otras
    // validaciones: la declaración de detracción sigue exigiéndose.
    const errores = validarPagoDirecto({
      ...grande,
      categoriaNombre: 'Regularización de pagos antiguos (pre-ERP)',
      tieneDetraccion: null,
    })
    expect(errores.map((e) => e.campo)).toContain('tieneDetraccion')
  })
})
