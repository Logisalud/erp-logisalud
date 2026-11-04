import { describe, expect, it } from 'vitest'
import {
  limpiarBusqueda, nombreDelRecorte, querystringDeFiltro, resolverFiltroCuentasPorPagar,
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

describe('buscador (Sebas, 2026-11-04)', () => {
  it('limpia lo que rompería la consulta y no busca con menos de 2 letras', () => {
    expect(limpiarBusqueda('  DIMEXA   S.A. ')).toBe('DIMEXA S.A.')
    expect(limpiarBusqueda('a,b(c)%')).toBe('a b c')
    expect(limpiarBusqueda('x')).toBeNull()
    expect(limpiarBusqueda(undefined)).toBeNull()
  })

  it('se combina con el chip y viaja al Excel', () => {
    const f = resolverFiltroCuentasPorPagar({ categoria: 'pagada', q: 'dimexa' })
    expect(f.busqueda).toBe('dimexa')
    expect(querystringDeFiltro(f)).toBe('?categoria=pagada&q=dimexa')
    expect(querystringDeFiltro(resolverFiltroCuentasPorPagar({ q: 'River Graf' }))).toBe('?q=River+Graf')
  })
})
