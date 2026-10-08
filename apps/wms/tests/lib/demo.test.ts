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
    expect(() => verificarDemoSeguro({ VERCEL: '1', VERCEL_ENV: 'production' })).not.toThrow()
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
    expect(modoDemoActivo({ VERCEL: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(modoDemoActivo({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(false)
  })
})
