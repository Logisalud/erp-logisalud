import { describe, expect, it } from 'vitest'
import { tieneMenuRecortado, veItemDeMenu } from '@/domain/menu-principal'

describe('menú recortado de Tesorería (Pieza 3, Mariela 2026-09-12)', () => {
  it('le esconde a Tesorería lo que no usa', () => {
    expect(veItemDeMenu('pendientes_aprobar', 'tesoreria')).toBe(false)
    expect(veItemDeMenu('ordenes', 'tesoreria')).toBe(false)
    expect(veItemDeMenu('registrar_factura', 'tesoreria')).toBe(false)
  })

  it('no recorta a nadie más', () => {
    for (const area of ['contabilidad', 'admin', 'gerencia', 'compras', 'otro', null]) {
      expect(tieneMenuRecortado(area)).toBe(false)
      expect(veItemDeMenu('ordenes', area)).toBe(true)
    }
  })
})
