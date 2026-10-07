import { describe, expect, it } from 'vitest'
import { normalizar, puntaje } from '@/domain/busqueda'

describe('búsqueda', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalizar('Dapagliflozína')).toBe('dapagliflozina')
    expect(puntaje('DAPAGLIFLOZINA', 'Dapagliflozína 10 mg')).toBeGreaterThan(0)
  })
  it('ordena: exacto > prefijo > palabra > contiene', () => {
    expect(puntaje('a-10.2', 'A-10.2')).toBe(100)
    expect(puntaje('a-10', 'A-10.2')).toBe(80)
    expect(puntaje('10', 'A-10.2')).toBe(60)
    expect(puntaje('0.2', 'A-10.2')).toBe(40)
    expect(puntaje('zzz', 'A-10.2')).toBe(0)
  })
  it('varias palabras en cualquier orden', () => {
    expect(puntaje('10 mg dapa', 'Dapagliflozina 10 mg tabletas')).toBeGreaterThan(0)
  })
  it('consulta vacía no coincide', () => {
    expect(puntaje('', 'algo')).toBe(0)
  })
})
