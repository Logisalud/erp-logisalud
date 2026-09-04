import { describe, expect, it } from 'vitest'
import { anticipoSinRendirSuperaUmbral, diasEnEstado, discrepanciaAbierta, ocParcialSuperaUmbral, servicioSinConformidad } from '@/domain/dashboard'

describe('diasEnEstado / ocParcialSuperaUmbral', () => {
  it('cuenta días corridos entre dos fechas', () => {
    expect(diasEnEstado('2026-08-01', '2026-08-31')).toBe(30)
  })
  it('supera el umbral configurado', () => {
    expect(ocParcialSuperaUmbral(31, 30)).toBe(true)
    expect(ocParcialSuperaUmbral(30, 30)).toBe(false)
    expect(ocParcialSuperaUmbral(29, 30)).toBe(false)
  })
})

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

describe('anticipoSinRendirSuperaUmbral (Pieza I)', () => {
  it('alerta recién pasado el umbral, no al llegar', () => {
    expect(anticipoSinRendirSuperaUmbral(16, 15)).toBe(true)
    expect(anticipoSinRendirSuperaUmbral(15, 15)).toBe(false)
    expect(anticipoSinRendirSuperaUmbral(1, 15)).toBe(false)
  })

  it('respeta el umbral configurado, no un 15 fijo', () => {
    expect(anticipoSinRendirSuperaUmbral(16, 30)).toBe(false)
    expect(anticipoSinRendirSuperaUmbral(31, 30)).toBe(true)
  })

  it('sin fecha de pago no se alerta: una alerta sin ancla es inventada', () => {
    expect(anticipoSinRendirSuperaUmbral(null, 15)).toBe(false)
  })
})
