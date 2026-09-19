import { describe, expect, it } from 'vitest'
import { tieneMenuRecortado, veItemDeMenu } from '@/domain/menu-principal'

describe('menú recortado de Tesorería (Pieza 3, Mariela 2026-09-12)', () => {
  it('le esconde a Tesorería lo que no usa', () => {
    expect(veItemDeMenu('pendientes_aprobar', 'tesoreria')).toBe(false)
    expect(veItemDeMenu('registrar_factura', 'tesoreria')).toBe(false)
  })

  it('pero Órdenes SÍ, que Milagritos las crea y las edita (Sebas, 2026-09-19)', () => {
    // El recorte original la escondía porque se asumió que Tesorería no
    // tocaba órdenes. Resultó falso, así que es una excepción explícita y no
    // un "Tesorería ya no está recortada": los otros dos ítems siguen fuera.
    expect(tieneMenuRecortado('tesoreria')).toBe(true)
    expect(veItemDeMenu('ordenes', 'tesoreria')).toBe(true)
  })

  it('no recorta a nadie más', () => {
    for (const area of ['contabilidad', 'admin', 'gerencia', 'compras', 'otro', null]) {
      expect(tieneMenuRecortado(area)).toBe(false)
      expect(veItemDeMenu('ordenes', area)).toBe(true)
    }
  })
})
