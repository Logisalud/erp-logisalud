import { describe, expect, it } from 'vitest'
import { destinosPosibles, esRetrocesoProhibido, transicionPermitida, validarCambioEstado } from '@/domain/estados'

describe('estados sanitarios', () => {
  it('permite Cuarentena → Aprobado, Cuarentena → Bajas y Aprobado → Bajas', () => {
    expect(transicionPermitida('CUARENTENA', 'APROBADO')).toBe(true)
    expect(transicionPermitida('CUARENTENA', 'BAJAS_RECHAZADOS')).toBe(true)
    expect(transicionPermitida('APROBADO', 'BAJAS_RECHAZADOS')).toBe(true)
  })

  it('prohíbe SIEMPRE Aprobado → Cuarentena, con un mensaje humano', () => {
    expect(transicionPermitida('APROBADO', 'CUARENTENA')).toBe(false)
    expect(esRetrocesoProhibido('APROBADO', 'CUARENTENA')).toBe(true)
    const r = validarCambioEstado('APROBADO', 'CUARENTENA')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.mensaje).toMatch(/no vuelve a Cuarentena/i)
  })

  it('Bajas/Rechazados es terminal', () => {
    expect(destinosPosibles('BAJAS_RECHAZADOS')).toEqual([])
    expect(validarCambioEstado('BAJAS_RECHAZADOS', 'APROBADO').ok).toBe(false)
  })

  it('un estado no transiciona a sí mismo', () => {
    expect(transicionPermitida('APROBADO', 'APROBADO')).toBe(false)
  })
})
