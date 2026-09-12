import { describe, expect, it } from 'vitest'
import {
  nombreDelRecorte, querystringDeFiltro, resolverFiltroCuentasPorPagar,
} from '@/domain/filtros-cuentas-por-pagar'
import { estadosVisiblesPorDefecto } from '@/domain/categorias-estado-obligacion'

describe('resolverFiltroCuentasPorPagar (Pieza 1 — el Excel baja la vista actual)', () => {
  it('sin params esconde rechazadas y anuladas', () => {
    const f = resolverFiltroCuentasPorPagar({})
    expect(f.estados).toEqual(estadosVisiblesPorDefecto())
    expect(f.sinFiltro).toBe(true)
    expect(querystringDeFiltro(f)).toBe('')
    expect(nombreDelRecorte(f)).toBe('todas')
  })

  it('"listas para pagar" no filtra por estado en la consulta', () => {
    const f = resolverFiltroCuentasPorPagar({ listas: '1' })
    expect(f.soloListas).toBe(true)
    expect(f.estados).toBeUndefined()
    expect(querystringDeFiltro(f)).toBe('?listas=1')
  })

  it('el estado exacto gana sobre la categoría y abre el panel avanzado', () => {
    const f = resolverFiltroCuentasPorPagar({ estado: 'conforme', categoria: 'pagada' })
    expect(f.estados).toBe('conforme')
    expect(f.verAvanzado).toBe(true)
    expect(querystringDeFiltro(f)).toBe('?estado=conforme')
  })

  it('ignora valores inventados en vez de devolver una lista vacía', () => {
    const f = resolverFiltroCuentasPorPagar({ estado: 'inventado', categoria: 'tampoco' })
    expect(f.estadoExacto).toBeUndefined()
    expect(f.categoria).toBeUndefined()
    expect(f.estados).toEqual(estadosVisiblesPorDefecto())
  })
})
