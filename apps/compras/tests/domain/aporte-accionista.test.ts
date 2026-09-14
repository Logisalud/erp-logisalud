import { describe, expect, it } from 'vitest'
import {
  etiquetaCategoria, puedeAnularseAporte, puedeEditarseAporte, totalesPorCategoria,
  totalesPorMoneda, totalEnVivo, validarAporte, validarAportes, type BorradorAporte,
} from '@/domain/aporte-accionista'

const base: BorradorAporte = {
  fecha: '2026-09-01',
  categoriaId: 'cat-1',
  categoriaLibre: null,
  descripcion: 'Combustible de la camioneta',
  moneda: 'PEN',
  monto: 120.5,
}

describe('validarAporte', () => {
  it('acepta un aporte bien cargado', () => {
    expect(validarAporte(base)).toEqual([])
  })

  it('acepta categoría libre cuando no hay una del catálogo', () => {
    expect(validarAporte({ ...base, categoriaId: null, categoriaLibre: 'Agasajo a distribuidora' })).toEqual([])
  })

  it('rechaza quedarse sin ninguna de las dos categorías', () => {
    const errores = validarAporte({ ...base, categoriaId: null, categoriaLibre: '   ' })
    expect(errores.map((e) => e.campo)).toContain('categoriaId')
  })

  it('rechaza fecha futura — un aporte es un gasto que ya ocurrió', () => {
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    expect(validarAporte({ ...base, fecha: manana }).map((e) => e.campo)).toContain('fecha')
  })

  it('rechaza monto cero o negativo', () => {
    expect(validarAporte({ ...base, monto: 0 }).map((e) => e.campo)).toContain('monto')
    expect(validarAporte({ ...base, monto: -5 }).map((e) => e.campo)).toContain('monto')
  })

  it('rechaza descripción vacía', () => {
    expect(validarAporte({ ...base, descripcion: '  ' }).map((e) => e.campo)).toContain('descripcion')
  })
})

describe('editar y anular no tienen ventana (a diferencia del resto del módulo)', () => {
  it('se edita mientras no esté anulado, sin importar cuánto tiempo pasó', () => {
    expect(puedeEditarseAporte(null)).toBe(true)
    expect(puedeAnularseAporte(null)).toBe(true)
  })

  it('anulado es el final del camino', () => {
    expect(puedeEditarseAporte('2026-09-10T10:00:00Z')).toBe(false)
    expect(puedeAnularseAporte('2026-09-10T10:00:00Z')).toBe(false)
  })
})

describe('totales', () => {
  it('nunca suma PEN con USD', () => {
    const totales = totalesPorMoneda([
      { moneda: 'PEN', monto: 100 },
      { moneda: 'USD', monto: 50 },
      { moneda: 'PEN', monto: 20.5 },
    ])
    expect(totales).toEqual([
      { moneda: 'PEN', monto: 120.5 },
      { moneda: 'USD', monto: 50 },
    ])
  })

  it('agrupa por categoría con su cantidad', () => {
    const porCategoria = totalesPorCategoria([
      { categoria: 'Combustible', moneda: 'PEN', monto: 100 },
      { categoria: 'Combustible', moneda: 'PEN', monto: 50 },
      { categoria: 'Marketing', moneda: 'PEN', monto: 300 },
    ])
    expect(porCategoria).toEqual([
      { categoria: 'Combustible', totales: [{ moneda: 'PEN', monto: 150 }], cantidad: 2 },
      { categoria: 'Marketing', totales: [{ moneda: 'PEN', monto: 300 }], cantidad: 1 },
    ])
  })

  it('no arrastra basura de flotantes', () => {
    expect(totalesPorMoneda([{ moneda: 'PEN', monto: 0.1 }, { moneda: 'PEN', monto: 0.2 }]))
      .toEqual([{ moneda: 'PEN', monto: 0.3 }])
  })
})

describe('etiquetaCategoria', () => {
  it('prefiere la del catálogo', () => {
    expect(etiquetaCategoria('Combustible', 'lo que sea')).toBe('Combustible')
  })
  it('cae en la libre cuando no hay catálogo', () => {
    expect(etiquetaCategoria(null, ' Agasajo ')).toBe('Agasajo')
  })
})

describe('carga de VARIOS aportes (2026-09-14)', () => {
  const linea = (over: Partial<BorradorAporte> = {}): BorradorAporte => ({
    fecha: '2026-09-01',
    categoriaId: 'cat-1',
    categoriaLibre: null,
    descripcion: 'Taxi al almacén',
    moneda: 'PEN',
    monto: 25,
    ...over,
  })

  it('valida cada fila por separado y marca el índice de la que falla', () => {
    const errores = validarAportes([linea(), linea({ monto: 0 }), linea()])
    expect(errores).toHaveLength(1)
    expect(errores[0].linea).toBe(1)
    expect(errores[0].campo).toBe('monto')
  })

  it('NO valida cruzado: dos aportes idénticos son válidos', () => {
    // A diferencia de Impuestos, acá no hay regla de unicidad entre filas —
    // dos taxis el mismo día por el mismo monto es un caso real.
    expect(validarAportes([linea(), linea()])).toEqual([])
  })

  it('exige al menos una fila', () => {
    expect(validarAportes([]).map((e) => e.campo)).toContain('general')
  })

  it('acumula errores de varias filas a la vez', () => {
    const errores = validarAportes([linea({ monto: 0 }), linea({ descripcion: ' ' })])
    expect(errores.map((e) => e.linea)).toEqual([0, 1])
  })
})

describe('total en vivo del pie', () => {
  it('agrupa por moneda y cuenta solo las filas con monto', () => {
    const r = totalEnVivo([
      { moneda: 'PEN', monto: '100' },
      { moneda: 'USD', monto: '80' },
      { moneda: 'PEN', monto: '40.5' },
      // Una fila recién agregada no debe ensuciar la cuenta.
      { moneda: 'PEN', monto: '' },
    ])
    expect(r.cantidad).toBe(3)
    expect(r.totales).toEqual([
      { moneda: 'PEN', monto: 140.5 },
      { moneda: 'USD', monto: 80 },
    ])
  })

  it('sin montos todavía, no inventa un cero', () => {
    expect(totalEnVivo([{ moneda: 'PEN', monto: '' }])).toEqual({ cantidad: 0, totales: [] })
  })
})
