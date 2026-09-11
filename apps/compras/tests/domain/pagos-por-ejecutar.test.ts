import { describe, expect, it } from 'vitest'
import { esperaEjecucion, ordenarPorEspera, type LotePorEjecutar } from '@/domain/pagos-por-ejecutar'

describe('qué lote entra a la bandeja de Tesorería', () => {
  it('un lote aprobado con pagos pendientes, sí', () => {
    expect(esperaEjecucion('aprobada', 3)).toBe(true)
  })

  it('un lote aprobado y completamente pagado, NO — ya no es trabajo', () => {
    expect(esperaEjecucion('aprobada', 0)).toBe(false)
  })

  it('un lote que todavía no se aprobó, NO — no se paga sin aprobación', () => {
    expect(esperaEjecucion('pendiente_aprobacion', 5)).toBe(false)
    expect(esperaEjecucion('borrador', 5)).toBe(false)
    expect(esperaEjecucion('rechazada', 5)).toBe(false)
  })
})

describe('orden', () => {
  it('lo más viejo sin pagar va primero', () => {
    const lote = (codigo: string, creadaEn: string): LotePorEjecutar => ({
      id: codigo, codigo, periodo: null, pendientes: 1, total: 1,
      pendientePorMoneda: [], creadaEn, diasEsperando: 0, href: '/',
    })
    const orden = ordenarPorEspera([
      lote('nueva', '2026-09-10T00:00:00Z'),
      lote('vieja', '2026-08-01T00:00:00Z'),
      lote('media', '2026-09-01T00:00:00Z'),
    ]).map((l) => l.codigo)
    expect(orden).toEqual(['vieja', 'media', 'nueva'])
  })
})
