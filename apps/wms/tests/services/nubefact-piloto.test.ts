// B.3: Nubefact solo DEMO en el piloto; PRODUCCION exigida en el go-live; la pantalla lo dice.
import { afterEach, describe, expect, it } from 'vitest'
import { NOMBRE_MODO } from '@/domain/guia-electronica'
import { bloqueoNubefactReal, bloqueoParaPantalla, MENSAJE_NUBEFACT_GO_LIVE, MENSAJE_NUBEFACT_PILOTO } from '@/services/nubefact/entorno'
import { NubefactNoConfigurado, clienteNubefact } from '@/services/nubefact/cliente'
import { ClienteNubefactHttp } from '@/services/nubefact/http'

const LIMPIAR = ['NUBEFACT_ENTORNO', 'NUBEFACT_MODO', 'NUBEFACT_URL', 'NUBEFACT_RUTA', 'NUBEFACT_TOKEN', 'NUBEFACT_PRODUCCION_APROBADA']
afterEach(() => { for (const k of LIMPIAR) delete process.env[k] })

describe('entorno de Nubefact según el modo piloto', () => {
  it('piloto: solo NUBEFACT_ENTORNO=DEMO; sin eso o con otro valor se niega con un mensaje claro', () => {
    expect(bloqueoNubefactReal(true, {})).toBe(MENSAJE_NUBEFACT_PILOTO)
    expect(bloqueoNubefactReal(true, { NUBEFACT_ENTORNO: 'PRODUCCION' })).toBe(MENSAJE_NUBEFACT_PILOTO)
    expect(bloqueoNubefactReal(true, { NUBEFACT_ENTORNO: 'otra' })).toBe(MENSAJE_NUBEFACT_PILOTO)
    expect(bloqueoNubefactReal(true, { NUBEFACT_ENTORNO: ' demo ' })).toBeNull()
    expect(bloqueoNubefactReal(true, { NUBEFACT_ENTORNO: 'DEMO', NUBEFACT_MODO: 'PRODUCCION' })).toMatch(/producción está bloqueado/)
  })
  it('go-live: se exige NUBEFACT_ENTORNO=PRODUCCION', () => {
    expect(bloqueoNubefactReal(false, {})).toBe(MENSAJE_NUBEFACT_GO_LIVE)
    expect(bloqueoNubefactReal(false, { NUBEFACT_ENTORNO: 'DEMO' })).toBe(MENSAJE_NUBEFACT_GO_LIVE)
    expect(bloqueoNubefactReal(false, { NUBEFACT_ENTORNO: 'PRODUCCION' })).toBeNull()
  })
  it('el cliente real en piloto se niega sin NUBEFACT_ENTORNO=DEMO aunque haya credenciales, y no imprime valores', () => {
    Object.assign(process.env, { NUBEFACT_MODO: 'PRUEBA', NUBEFACT_URL: 'https://api.nubefact.test/secreto', NUBEFACT_TOKEN: 'TOKEN-SECRETO' })
    let mensaje = ''
    try { clienteNubefact(true) } catch (e) { expect(e).toBeInstanceOf(NubefactNoConfigurado); mensaje = (e as Error).message }
    expect(mensaje).toMatch(/solo se conecta con la cuenta DEMO/)
    expect(mensaje).not.toContain('TOKEN-SECRETO'); expect(mensaje).not.toContain('secreto')
    process.env.NUBEFACT_ENTORNO = 'DEMO'
    expect(clienteNubefact(true)).toBeInstanceOf(ClienteNubefactHttp)
    // la ruta de la cuenta DEMO (NUBEFACT_RUTA) también sirve
    delete process.env.NUBEFACT_URL; process.env.NUBEFACT_RUTA = 'https://api.nubefact.test/demo'
    expect(clienteNubefact(true).modo).toBe('PRUEBA')
  })
  it('go-live: el cliente real se niega sin NUBEFACT_ENTORNO=PRODUCCION; el simulador no pasa por el candado', () => {
    Object.assign(process.env, { NUBEFACT_MODO: 'PRODUCCION', NUBEFACT_URL: 'https://api.nubefact.test/x', NUBEFACT_TOKEN: 't', NUBEFACT_PRODUCCION_APROBADA: 'SI', NUBEFACT_ENTORNO: 'DEMO' })
    expect(() => clienteNubefact(false)).toThrow(/NUBEFACT_ENTORNO=PRODUCCION/)
    process.env.NUBEFACT_ENTORNO = 'PRODUCCION'
    expect(clienteNubefact(false).modo).toBe('PRODUCCION')
    delete process.env.NUBEFACT_MODO
    expect(clienteNubefact(true).modo).toBe('SIMULADOR')
  })
  it('la pantalla: dice el bloqueo cuando el cliente real no se puede usar y los tres nombres de modo siguen igual', () => {
    expect(bloqueoParaPantalla(true, 'PRUEBA', {})).toBe(MENSAJE_NUBEFACT_PILOTO)
    expect(bloqueoParaPantalla(true, 'PRUEBA', { NUBEFACT_ENTORNO: 'DEMO' })).toBeUndefined()
    expect(bloqueoParaPantalla(true, 'SIMULADOR', {})).toBeUndefined()
    expect(bloqueoParaPantalla(false, 'PRODUCCION', {})).toBe(MENSAJE_NUBEFACT_GO_LIVE)
    expect(NOMBRE_MODO).toEqual({ SIMULADOR: 'Simulador', PRUEBA: 'Nubefact (modo prueba)', PRODUCCION: 'Nubefact (producción)' })
  })
})
