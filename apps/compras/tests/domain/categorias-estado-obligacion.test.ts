import { describe, expect, it } from 'vitest'
import { ESTADOS_OBLIGACION } from '@/domain/obligacion'
import {
  CATEGORIAS_ESTADO, categoriaDeEstado, estaVencida,
  estadosDeCategoria, estadosVisiblesPorDefecto,
} from '@/domain/categorias-estado-obligacion'

describe('cobertura de los 10 estados', () => {
  it('cada estado cae en exactamente una categoría', () => {
    for (const estado of ESTADOS_OBLIGACION) {
      const categorias = CATEGORIAS_ESTADO.filter((c) => estadosDeCategoria(c).includes(estado))
      expect(categorias, `estado ${estado}`).toHaveLength(1)
    }
  })

  it('las categorías no dejan ningún estado afuera', () => {
    const cubiertos = CATEGORIAS_ESTADO.flatMap((c) => [...estadosDeCategoria(c)])
    expect([...cubiertos].sort()).toEqual([...ESTADOS_OBLIGACION].sort())
  })
})

describe('agrupación', () => {
  it('Pagada agrupa pagada y cerrada — cerrada es un estado muerto hoy', () => {
    expect(estadosDeCategoria('pagada')).toEqual(['pagada', 'cerrada'])
    expect(categoriaDeEstado('cerrada')).toBe('pagada')
    expect(categoriaDeEstado('pagada')).toBe('pagada')
  })

  it('En revisión agrupa registrada y observada', () => {
    expect(estadosDeCategoria('en_revision')).toEqual(['registrada', 'observada'])
  })

  it('Lista para pagar / En proceso agrupa conforme y en_propuesta', () => {
    expect(estadosDeCategoria('en_camino_a_pago')).toEqual(['conforme', 'en_propuesta'])
  })

  it('No procede agrupa rechazada y anulada', () => {
    expect(estadosDeCategoria('no_procede')).toEqual(['rechazada', 'anulada'])
  })
})

describe('vista por defecto', () => {
  it('excluye rechazada y anulada, y nada más', () => {
    const porDefecto = estadosVisiblesPorDefecto()
    expect(porDefecto).not.toContain('rechazada')
    expect(porDefecto).not.toContain('anulada')
    expect(porDefecto).toHaveLength(ESTADOS_OBLIGACION.length - 2)
  })

  it('sí incluye lo que todavía es trabajo', () => {
    const porDefecto = estadosVisiblesPorDefecto()
    for (const e of ['pendiente_factura', 'registrada', 'observada', 'conforme', 'en_propuesta'] as const) {
      expect(porDefecto).toContain(e)
    }
  })
})

describe('vencida', () => {
  const hoy = '2026-09-11'

  it('una fecha pasada con algo por pagar está vencida', () => {
    expect(estaVencida('2026-09-01', 'registrada', hoy)).toBe(true)
    expect(estaVencida('2026-09-01', 'conforme', hoy)).toBe(true)
  })

  it('una fecha futura no lo está', () => {
    expect(estaVencida('2026-12-01', 'registrada', hoy)).toBe(false)
  })

  it('hoy mismo no está vencida todavía', () => {
    expect(estaVencida(hoy, 'registrada', hoy)).toBe(false)
  })

  it('ya pagada NO se pinta de rojo aunque la fecha pasó', () => {
    expect(estaVencida('2026-01-01', 'pagada', hoy)).toBe(false)
    expect(estaVencida('2026-01-01', 'cerrada', hoy)).toBe(false)
  })

  it('rechazada, anulada y canjeada tampoco — ya no son deuda viva', () => {
    expect(estaVencida('2026-01-01', 'rechazada', hoy)).toBe(false)
    expect(estaVencida('2026-01-01', 'anulada', hoy)).toBe(false)
    expect(estaVencida('2026-01-01', 'canjeada_por_letra', hoy)).toBe(false)
  })

  it('sin fecha de vencimiento no hay nada que marcar', () => {
    expect(estaVencida(null, 'registrada', hoy)).toBe(false)
  })
})
