import { describe, expect, it } from 'vitest'
import { discrepanciaAbierta, servicioSinConformidad } from '@/domain/dashboard'

describe('discrepanciaAbierta', () => {
  it('una discrepancia real sin resolución está abierta', () => {
    expect(discrepanciaAbierta('faltante', false)).toBe(true)
  })

  it('ya resuelta: no está abierta', () => {
    expect(discrepanciaAbierta('faltante', true)).toBe(false)
  })

  it('sin discrepancia (null): no está abierta', () => {
    expect(discrepanciaAbierta(null, false)).toBe(false)
  })

  it("tipo 'ninguna': no está abierta aunque no tenga resolución", () => {
    expect(discrepanciaAbierta('ninguna', false)).toBe(false)
  })
})

describe('servicioSinConformidad', () => {
  it('facturada sin conformidad positiva: abierto', () => {
    expect(servicioSinConformidad('facturada', false)).toBe(true)
  })

  it('facturada con conformidad positiva: cerrado', () => {
    expect(servicioSinConformidad('facturada', true)).toBe(false)
  })

  it('todavía no facturada: no aplica aunque no tenga conformidad', () => {
    expect(servicioSinConformidad('en_ejecucion', false)).toBe(false)
  })
})
