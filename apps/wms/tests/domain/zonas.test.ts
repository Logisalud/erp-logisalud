import { describe, expect, it } from 'vitest'
import {
  areaAdmite, asignacionesSolapan, asignacionVigente, posicionAcepta, propietarioVigente,
} from '@/domain/zonas'
import type { Asignacion } from '@/domain/tipos'

describe('matriz de zonas BPA', () => {
  it('Cuarentena solo admite Cuarentena', () => {
    expect(areaAdmite('CUARENTENA', 'CUARENTENA', 'COMPRA_LOCAL')).toBe(true)
    expect(areaAdmite('CUARENTENA', 'APROBADO', 'COMPRA_LOCAL')).toBe(false)
  })
  it('Aprobados solo admite Aprobado: Cuarentena hacia un rack se bloquea', () => {
    expect(areaAdmite('APROBADOS', 'APROBADO', 'COMPRA_LOCAL')).toBe(true)
    expect(areaAdmite('APROBADOS', 'CUARENTENA', 'COMPRA_LOCAL')).toBe(false)
  })
  it('Bajas/Rechazados solo admite Bajas/Rechazados', () => {
    expect(areaAdmite('BAJAS_RECHAZADOS', 'BAJAS_RECHAZADOS', 'AJUSTE')).toBe(true)
    expect(areaAdmite('BAJAS_RECHAZADOS', 'APROBADO', 'AJUSTE')).toBe(false)
  })
  it('Devoluciones admite Cuarentena solo con origen devolución', () => {
    expect(areaAdmite('DEVOLUCIONES', 'CUARENTENA', 'DEVOLUCION')).toBe(true)
    expect(areaAdmite('DEVOLUCIONES', 'CUARENTENA', 'COMPRA_LOCAL')).toBe(false)
  })
  it('Recepción, Contramuestra, Embalaje y Despacho no admiten ningún estado', () => {
    for (const a of ['RECEPCION', 'CONTRAMUESTRA', 'EMBALAJE', 'DESPACHO'] as const) {
      expect(areaAdmite(a, 'CUARENTENA', 'COMPRA_LOCAL')).toBe(false)
      expect(areaAdmite(a, 'APROBADO', 'COMPRA_LOCAL')).toBe(false)
    }
  })
})

const asig = (over: Partial<Asignacion>): Asignacion => ({
  id: 'a1', posicionId: 'p1', propietarioId: 'diphasac', desde: '2026-08-12', ...over,
})

describe('propietario y vigencia', () => {
  const pos = { id: 'p1', tipoArea: 'APROBADOS' as const, activa: true }

  it('una posición exclusiva solo acepta a su propietario vigente', () => {
    expect(posicionAcepta(pos, 'diphasac', [asig({})], '2026-10-07')).toBe(true)
    expect(posicionAcepta(pos, 'logissa', [asig({})], '2026-10-07')).toBe(false)
  })
  it('un área compartida acepta a cualquier propietario', () => {
    expect(posicionAcepta({ id: 'c1', tipoArea: 'CUARENTENA', activa: true }, 'triamed', [], '2026-10-07')).toBe(true)
  })
  it('una asignación vencida deja de aceptar stock nuevo del propietario anterior', () => {
    const vencida = asig({ hasta: '2026-10-01' })
    expect(posicionAcepta(pos, 'diphasac', [vencida], '2026-09-30')).toBe(true)
    expect(posicionAcepta(pos, 'diphasac', [vencida], '2026-10-01')).toBe(false) // `hasta` es exclusivo
    expect(propietarioVigente('p1', [vencida], '2026-10-07')).toBeUndefined()
  })
  it('una asignación futura todavía no acepta', () => {
    expect(asignacionVigente({ desde: '2026-12-01' }, '2026-10-07')).toBe(false)
  })
  it('una posición inactiva no acepta a nadie', () => {
    expect(posicionAcepta({ ...pos, activa: false }, 'diphasac', [asig({})], '2026-10-07')).toBe(false)
  })
  it('detecta asignaciones solapadas', () => {
    expect(asignacionesSolapan({ desde: '2026-01-01', hasta: '2026-06-01' }, { desde: '2026-05-01' })).toBe(true)
    expect(asignacionesSolapan({ desde: '2026-01-01', hasta: '2026-06-01' }, { desde: '2026-06-01' })).toBe(false)
  })
})
