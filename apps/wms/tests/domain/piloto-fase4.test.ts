// Fase 4 · P1: reglas puras de la bienvenida y de los avisos de prueba.
import { describe, expect, it } from 'vitest'
import { COOKIE_BIENVENIDA_PILOTO, ENCABEZADO_AVISO_PRUEBA, PUNTOS_BIENVENIDA_PILOTO, avisoDePrueba, debeVerBienvenida } from '@/domain/modo-piloto'

describe('bienvenida del piloto', () => {
  it('solo en el piloto y solo hasta que esa persona la acepta en ese navegador', () => {
    expect(debeVerBienvenida(true, undefined, 'u1')).toBe(true)
    expect(debeVerBienvenida(true, 'u1', 'u1')).toBe(false)
    expect(debeVerBienvenida(true, 'otra-persona', 'u1')).toBe(true)
    expect(debeVerBienvenida(false, undefined, 'u1')).toBe(false)
    expect(COOKIE_BIENVENIDA_PILOTO).toMatch(/^wms_/)
    expect(PUNTOS_BIENVENIDA_PILOTO.map((p) => p.clave)).toEqual(['oficial', 'prueba', 'borra', 'nada-sale'])
  })
})
describe('avisoDePrueba', () => {
  it('antepone el encabezado PRUEBA una sola vez y conserva el texto', () => {
    const a = avisoDePrueba('Hola Rosa')
    expect(a).toBe(`${ENCABEZADO_AVISO_PRUEBA}\n\nHola Rosa`)
    expect(avisoDePrueba(a)).toBe(a)
  })
})
