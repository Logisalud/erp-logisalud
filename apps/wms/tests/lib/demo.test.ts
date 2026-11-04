import { describe, expect, it } from 'vitest'
import { esProduccion, modoDemoActivo, verificarDemoSeguro } from '@/lib/demo'

describe('candado del modo demostración (D-27)', () => {
  it('NUNCA se activa en producción de Vercel', () => {
    expect(modoDemoActivo({ VERCEL: '1', VERCEL_ENV: 'preview', WMS_DEMO: '1' })).toBe(true)
    expect(() => modoDemoActivo({ VERCEL: '1', VERCEL_ENV: 'production', WMS_DEMO: '1' })).toThrow(/no puede estar activo en producción/i)
  })

  it('falla cerrada: con la bandera puesta en producción la app se niega a arrancar', () => {
    expect(() => verificarDemoSeguro({ VERCEL: '1', VERCEL_ENV: 'production', WMS_DEMO: '1' })).toThrow()
    expect(() => verificarDemoSeguro({ VERCEL: '1', VERCEL_ENV: 'production', WMS_DEMO_LOCAL: '1' })).toThrow()
    expect(() => verificarDemoSeguro({ VERCEL: '1', VERCEL_ENV: 'production', WMS_MODO_PILOTO: '1' })).not.toThrow()
    expect(() => verificarDemoSeguro({ VERCEL: '1', VERCEL_ENV: 'production', WMS_GO_LIVE: '1' })).not.toThrow()
  })

  it('un despliegue de Vercel sin VERCEL_ENV reconocible cuenta como producción', () => {
    expect(esProduccion({ VERCEL: '1' })).toBe(true)
    expect(esProduccion({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(false)
    expect(() => modoDemoActivo({ VERCEL: '1', WMS_DEMO: '1' })).toThrow()
  })

  it('en Preview solo con WMS_DEMO=1; la bandera local no sirve en Vercel', () => {
    expect(modoDemoActivo({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(false)
    expect(modoDemoActivo({ VERCEL: '1', VERCEL_ENV: 'preview', WMS_DEMO_LOCAL: '1' })).toBe(false)
  })

  it('fuera de Vercel solo con WMS_DEMO_LOCAL=1', () => {
    expect(modoDemoActivo({})).toBe(false)
    expect(modoDemoActivo({ WMS_DEMO: '1' })).toBe(false)
    expect(modoDemoActivo({ WMS_DEMO_LOCAL: '1' })).toBe(true)
  })

  it('sin banderas nunca es demo, ni en Preview ni en producción', () => {
    expect(modoDemoActivo({ VERCEL: '1', VERCEL_ENV: 'production', WMS_MODO_PILOTO: '1' })).toBe(false)
    expect(modoDemoActivo({ VERCEL: '1', VERCEL_ENV: 'production', WMS_GO_LIVE: '1' })).toBe(false)
    expect(modoDemoActivo({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(false)
  })

  it('la bandera de demostración sigue rechazada en producción aunque diga que es piloto o go-live', () => {
    for (const m of [{ WMS_MODO_PILOTO: '1' }, { WMS_GO_LIVE: '1' }]) {
      expect(() => verificarDemoSeguro({ VERCEL: '1', VERCEL_ENV: 'production', WMS_DEMO: '1', ...m })).toThrow(/no puede estar activo en producción/)
      expect(() => modoDemoActivo({ VERCEL: '1', VERCEL_ENV: 'production', WMS_DEMO_LOCAL: '1', ...m })).toThrow()
    }
  })
})

describe('guarda de despliegue (A.2): en producción la app se niega a arrancar sin WMS_MODO_PILOTO=1 o WMS_GO_LIVE=1', () => {
  const prod = { VERCEL: '1', VERCEL_ENV: 'production' }
  it('sin ninguna de las dos no arranca, con una sola sí, con las dos no', () => {
    expect(() => verificarDemoSeguro(prod)).toThrow(/WMS_MODO_PILOTO=1.*WMS_GO_LIVE=1/)
    expect(() => modoDemoActivo(prod)).toThrow()
    expect(() => verificarDemoSeguro({ ...prod, WMS_MODO_PILOTO: '0' })).toThrow()
    expect(() => verificarDemoSeguro({ ...prod, WMS_MODO_PILOTO: '1' })).not.toThrow()
    expect(() => verificarDemoSeguro({ ...prod, WMS_GO_LIVE: '1' })).not.toThrow()
    expect(() => verificarDemoSeguro({ ...prod, WMS_MODO_PILOTO: '1', WMS_GO_LIVE: '1' })).toThrow(/a la vez/)
  })
  it('un despliegue de Vercel sin VERCEL_ENV reconocible también cuenta como producción', () => {
    expect(() => verificarDemoSeguro({ VERCEL: '1' })).toThrow()
    expect(() => verificarDemoSeguro({ VERCEL: '1', WMS_MODO_PILOTO: '1' })).not.toThrow()
  })
  it('Preview, desarrollo y local no necesitan nada (la guarda es solo de producción)', () => {
    expect(() => verificarDemoSeguro({ VERCEL: '1', VERCEL_ENV: 'preview' })).not.toThrow()
    expect(() => verificarDemoSeguro({ VERCEL: '1', VERCEL_ENV: 'development' })).not.toThrow()
    expect(() => verificarDemoSeguro({})).not.toThrow()
  })
  it('NUBEFACT_RUTA: en producción solo con WMS_MODO_PILOTO=1; con WMS_GO_LIVE=1 se vuelve a rechazar (sin imprimir el valor)', () => {
    const RUTA = 'https://api.nubefact.test/secreta'
    expect(() => verificarDemoSeguro({ ...prod, WMS_MODO_PILOTO: '1', NUBEFACT_RUTA: RUTA })).not.toThrow()
    let mensaje = ''
    try { verificarDemoSeguro({ ...prod, WMS_GO_LIVE: '1', NUBEFACT_RUTA: RUTA }) } catch (e) { mensaje = (e as Error).message }
    expect(mensaje).toMatch(/NUBEFACT_RUTA/); expect(mensaje).not.toContain(RUTA)
    expect(() => verificarDemoSeguro({ ...prod, NUBEFACT_RUTA: RUTA })).toThrow()
  })
})
