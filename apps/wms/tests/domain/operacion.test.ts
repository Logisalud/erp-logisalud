import { describe, expect, it } from 'vitest'
import {
  conteosPorProgramar, exactitudDeFilas, focosFaltantes, lunesDe, pendientesVivos, puedeCerrarRevision, puedeResolverPendiente, sugerirRotacion, sumarDiasISO, validarMarcaFoco, validarPendiente,
  validarProgramacion, type PendienteVista, type PersonaEquipo,
} from '@/domain/operacion'

const equipo: PersonaEquipo[] = [{ id: 'u1', nombre: 'Ana', rol: 'auxiliar' }, { id: 'u2', nombre: 'Beto', rol: 'jefe_almacen' }]
const pend = (o: Partial<PendienteVista>): PendienteVista => ({ id: 'p', revisionId: 'r', revision: 'RD-1', fecha: '2026-10-08', foco: 'ORDEN', descripcion: 'x', responsableId: 'u1', responsable: 'Ana', critico: false, afectaProducto: false, estado: 'ABIERTO', creadoPor: 'J', ...o })

describe('revisión diaria (INV-04)', () => {
  it('no se cierra hasta revisar los 4 focos', () => {
    const r = { estado: 'ABIERTA' as const, focos: [{ foco: 'ORDEN' as const, resultado: 'SIN_PROBLEMAS' as const, revisadoPor: 'u' }] }
    expect(focosFaltantes(r)).toEqual(['LIMPIEZA', 'UBICACIONES', 'ANORMAL'])
    expect(puedeCerrarRevision(r)).toMatchObject({ puede: false, motivo: expect.stringContaining('limpieza, ubicaciones, situaciones anormales') })
    const completa = { estado: 'ABIERTA' as const, focos: (['ORDEN', 'LIMPIEZA', 'UBICACIONES', 'ANORMAL'] as const).map((foco) => ({ foco, resultado: 'SIN_PROBLEMAS' as const, revisadoPor: 'u' })) }
    expect(puedeCerrarRevision(completa).puede).toBe(true)
    expect(puedeCerrarRevision({ ...completa, estado: 'CERRADA' }).puede).toBe(false)
  })
  it('un foco con pendientes abiertos no queda «sin problemas»', () => {
    expect(validarMarcaFoco([pend({ foco: 'ORDEN' })], 'ORDEN', 'SIN_PROBLEMAS')).toMatch(/pendientes abiertos/)
    expect(validarMarcaFoco([pend({ foco: 'ORDEN', estado: 'RESUELTO' })], 'ORDEN', 'SIN_PROBLEMAS')).toBeNull()
    expect(validarMarcaFoco([pend({ foco: 'LIMPIEZA' })], 'ORDEN', 'SIN_PROBLEMAS')).toBeNull()
  })
  it('todo pendiente tiene responsable y es alguien del equipo', () => {
    expect(validarPendiente({ descripcion: 'Cajas en el pasillo', responsableId: '' }, equipo)).toMatchObject({ responsableId: 'Todo pendiente necesita un responsable.' })
    expect(validarPendiente({ descripcion: '  ', responsableId: 'u1' }, equipo)).toMatchObject({ descripcion: 'Cuenta qué pasó.' })
    expect(validarPendiente({ descripcion: 'x', responsableId: 'otro' }, equipo)).toMatchObject({ responsableId: expect.stringContaining('equipo') })
    expect(validarPendiente({ descripcion: 'x', responsableId: 'u1' }, equipo)).toBeNull()
  })
  it('los pendientes se arrastran hasta verificarse; primero los críticos y los más antiguos', () => {
    const r = pendientesVivos([pend({ id: 'a', fecha: '2026-10-08' }), pend({ id: 'b', fecha: '2026-10-07' }), pend({ id: 'c', critico: true, fecha: '2026-10-09' }), pend({ id: 'd', estado: 'VERIFICADO' })])
    expect(r.map((p) => p.id)).toEqual(['c', 'b', 'a'])
  })
  it('lo resuelve su responsable o el Jefe; nadie más', () => {
    expect(puedeResolverPendiente(['auxiliar'], 'u1', { responsableId: 'u1' })).toBe(true)
    expect(puedeResolverPendiente(['auxiliar'], 'u9', { responsableId: 'u1' })).toBe(false)
    expect(puedeResolverPendiente(['jefe_almacen'], 'u9', { responsableId: 'u1' })).toBe(true)
  })
})

describe('inventarios cíclicos (INV-05)', () => {
  it('lunes de la semana y suma de días', () => {
    expect(lunesDe('2026-10-09')).toBe('2026-10-05') // viernes
    expect(lunesDe('2026-10-05')).toBe('2026-10-05')
    expect(lunesDe('2026-10-11')).toBe('2026-10-05') // domingo
    expect(sumarDiasISO('2026-10-05', 6)).toBe('2026-10-11')
  })
  it('la rotación cuenta primero lo que nunca se contó y lo que hace más tiempo no se cuenta', () => {
    const pos = ['A-1', 'A-2', 'A-3', 'A-10'].map((c) => ({ id: c, codigo: c }))
    const r = sugerirRotacion(pos, [{ posicionId: 'A-1', ultima: '2026-09-01' }, { posicionId: 'A-3', ultima: '2026-10-01' }, { posicionId: 'A-10', ultima: '2026-08-01' }], 3)
    expect(r.map((x) => x.id)).toEqual(['A-2', 'A-10', 'A-1'])
    expect(sugerirRotacion(pos, [], 2, new Set(['A-1'])).map((x) => x.id)).toEqual(['A-2', 'A-3'])
  })
  it('son 3 conteos por semana: faltan los que no están programados', () => {
    expect(conteosPorProgramar([])).toEqual([1, 2, 3])
    expect(conteosPorProgramar([{ tipo: 'ROTATIVO', orden: 2, estado: 'PROGRAMADO' }, { tipo: 'ROTATIVO', orden: 1, estado: 'CANCELADO' }, { tipo: 'EXTRA', orden: undefined, estado: 'PROGRAMADO' }])).toEqual([1, 3])
  })
  it('valida el orden, las ubicaciones y que no se repitan en la semana', () => {
    expect(validarProgramacion({ orden: 4, posiciones: ['a'], yaEnSemana: new Set() })).toMatch(/tres conteos por semana/)
    expect(validarProgramacion({ orden: 1, posiciones: [], yaEnSemana: new Set() })).toMatch(/al menos una ubicación/)
    expect(validarProgramacion({ orden: 1, posiciones: ['a'], yaEnSemana: new Set(), ocupados: [1] })).toMatch(/ya está programado/)
    expect(validarProgramacion({ orden: 1, posiciones: ['a'], yaEnSemana: new Set(['a']) })).toMatch(/otro conteo de esa semana/)
    expect(validarProgramacion({ orden: 2, posiciones: ['a'], yaEnSemana: new Set(['b']) })).toBeNull()
  })
  it('exactitud = líneas sin diferencia ÷ líneas contadas', () => {
    expect(exactitudDeFilas([{ diferencia: 0 }, { diferencia: 0 }, { diferencia: -2 }, { diferencia: 0 }])).toEqual({ lineas: 4, exactas: 3, porcentaje: 75 })
    expect(exactitudDeFilas([]).porcentaje).toBeNull()
  })
})
