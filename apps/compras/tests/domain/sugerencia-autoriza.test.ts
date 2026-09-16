import { describe, expect, it } from 'vitest'
import { esSugerenciaDeSiMismo } from '@/domain/gasto'

/**
 * Regla nueva (2026-09-16): si la responsable del área es la persona misma,
 * "Quién autoriza" queda en blanco.
 *
 * Cuatro personas son hoy responsables de su propia área — Mariela
 * (contabilidad), Katia (dirección técnica), Milagritos (tesorería) y Ana
 * Lucía (legal) — y a ellas el campo se autocompletaba con su PROPIO nombre.
 * Se reportó como bug; no lo era, pero tampoco servía.
 */
describe('esSugerenciaDeSiMismo', () => {
  it('el caso que lo motivó: Mariela es la responsable de contabilidad', () => {
    expect(esSugerenciaDeSiMismo('Mariela Casiano', 'Mariela Casiano')).toBe(true)
  })

  it('Beatriz es de contabilidad pero NO es la responsable: sí recibe sugerencia', () => {
    expect(esSugerenciaDeSiMismo('Beatriz Zavala', 'Mariela Casiano')).toBe(false)
  })

  it('ignora mayúsculas y espacios de más', () => {
    expect(esSugerenciaDeSiMismo('  mariela casiano ', 'Mariela Casiano')).toBe(true)
  })

  it('sin nombre propio o sin sugerencia, no hay coincidencia que detectar', () => {
    expect(esSugerenciaDeSiMismo(null, 'Mariela Casiano')).toBe(false)
    expect(esSugerenciaDeSiMismo('Mariela Casiano', null)).toBe(false)
    expect(esSugerenciaDeSiMismo(null, null)).toBe(false)
  })

  it('dos personas distintas con nombre parecido no se confunden', () => {
    expect(esSugerenciaDeSiMismo('Juan Gonzales', 'Sebastian Gonzales')).toBe(false)
  })
})
