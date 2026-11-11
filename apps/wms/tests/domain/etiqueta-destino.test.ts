// 1d (reunión del equipo): la etiqueta del bulto lleva la dirección de destino.
import { describe, expect, it } from 'vitest'
import { textoDestinoEtiqueta } from '@/domain/embalaje'

describe('destino en la etiqueta del bulto', () => {
  it('lleva la dirección tal cual, sin espacios de más', () => {
    expect(textoDestinoEtiqueta('  Av. Arequipa 123,   Lince ')).toBe('Av. Arequipa 123, Lince')
  })
  it('agrega el distrito solo si la dirección todavía no lo dice', () => {
    expect(textoDestinoEtiqueta('Av. Arequipa 123', 'Lince')).toBe('Av. Arequipa 123 · Lince')
    expect(textoDestinoEtiqueta('Av. Arequipa 123, Lince', 'lince')).toBe('Av. Arequipa 123, Lince')
  })
  it('sin dirección lo dice claro en vez de dejarlo en blanco', () => {
    expect(textoDestinoEtiqueta('', null)).toBe('SIN DIRECCIÓN DE DESTINO')
    expect(textoDestinoEtiqueta(undefined, 'Ate')).toBe('Distrito: Ate (sin dirección registrada)')
  })
})
