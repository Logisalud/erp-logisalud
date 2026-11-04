// D-167: en la Preview de la demostración (WMS_DEMO=1) la demo habla con la cuenta DEMO de Nubefact si existen NUBEFACT_RUTA y NUBEFACT_TOKEN; local, pruebas y producción
// no. Producción sigue rechazando las banderas de demostración (y NUBEFACT_RUTA). Los valores de las variables nunca se imprimen ni se registran.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { construirConsulta } from '@/domain/guia-electronica'
import { esPreviewDeDemostracion, modoDemoActivo, verificarDemoSeguro } from '@/lib/demo'
import { clienteNubefact, credencialesNubefactDemo, modoNubefactActual, nubefactDemoIncompleto } from '@/services/nubefact/cliente'
import { ClienteNubefactHttp } from '@/services/nubefact/http'
import { SimuladorNubefact } from '@/services/nubefact/simulador'

const RUTA = 'https://api.nubefact.test/api/v1/demo-secreta'
const TOKEN = 'TOKEN-SUPER-SECRETO'
const preview = { VERCEL: '1', VERCEL_ENV: 'preview', WMS_DEMO: '1', NUBEFACT_RUTA: RUTA, NUBEFACT_TOKEN: TOKEN }
const poner = (e: Record<string, string>) => { for (const [k, v] of Object.entries(e)) process.env[k] = v }
const LIMPIAR = ['VERCEL', 'VERCEL_ENV', 'WMS_DEMO', 'WMS_DEMO_LOCAL', 'NUBEFACT_RUTA', 'NUBEFACT_TOKEN', 'NUBEFACT_MODO', 'NUBEFACT_URL']
afterEach(() => { for (const k of LIMPIAR) delete process.env[k]; vi.restoreAllMocks() })

describe('qué cliente de Nubefact usa la demostración', () => {
  it('en la Preview con las dos variables: el cliente real contra la cuenta DEMO, en modo pruebas', () => {
    poner(preview)
    expect(modoDemoActivo()).toBe(true)
    expect(credencialesNubefactDemo()).toEqual({ ruta: RUTA, token: TOKEN })
    const c = clienteNubefact()
    expect(c).toBeInstanceOf(ClienteNubefactHttp)
    expect(c.modo).toBe('PRUEBA')
    expect(modoNubefactActual()).toBe('PRUEBA')
  })
  it('en la Preview sin variables, o con solo una, o con una ruta que no es https: el simulador, y se dice por qué sin mostrar valores', () => {
    poner({ VERCEL: '1', VERCEL_ENV: 'preview', WMS_DEMO: '1' })
    expect(clienteNubefact()).toBeInstanceOf(SimuladorNubefact)
    expect(nubefactDemoIncompleto()).toBeNull()
    poner({ NUBEFACT_TOKEN: TOKEN })
    expect(clienteNubefact()).toBeInstanceOf(SimuladorNubefact)
    expect(nubefactDemoIncompleto()).toBe('Falta NUBEFACT_RUTA en la Preview: se usa el simulador.')
    delete process.env.NUBEFACT_TOKEN; poner({ NUBEFACT_RUTA: RUTA })
    expect(nubefactDemoIncompleto()).toBe('Falta NUBEFACT_TOKEN en la Preview: se usa el simulador.')
    poner({ NUBEFACT_TOKEN: TOKEN, NUBEFACT_RUTA: 'http://inseguro.test' })
    expect(clienteNubefact()).toBeInstanceOf(SimuladorNubefact)
    expect(nubefactDemoIncompleto()).toMatch(/https/)
    for (const t of [nubefactDemoIncompleto() ?? '']) { expect(t).not.toContain(TOKEN); expect(t).not.toContain('inseguro') }
  })
  it('local y las pruebas siguen con el simulador aunque las variables existan', () => {
    poner({ WMS_DEMO_LOCAL: '1', NUBEFACT_RUTA: RUTA, NUBEFACT_TOKEN: TOKEN })
    expect(esPreviewDeDemostracion()).toBe(false)
    expect(credencialesNubefactDemo()).toBeNull()
    expect(clienteNubefact()).toBeInstanceOf(SimuladorNubefact)
    expect(modoNubefactActual()).toBe('SIMULADOR')
  })
  it('una Preview sin la demostración (WMS_DEMO) no usa la cuenta DEMO', () => {
    poner({ VERCEL: '1', VERCEL_ENV: 'preview', NUBEFACT_RUTA: RUTA, NUBEFACT_TOKEN: TOKEN })
    expect(credencialesNubefactDemo()).toBeNull()
  })
})

describe('producción sigue rechazando lo de demostración', () => {
  it('la bandera de demostración o NUBEFACT_RUTA en producción impiden arrancar, sin imprimir el valor', () => {
    expect(() => verificarDemoSeguro({ VERCEL: '1', VERCEL_ENV: 'production', WMS_DEMO: '1' })).toThrow()
    let mensaje = ''
    try { verificarDemoSeguro({ VERCEL: '1', VERCEL_ENV: 'production', NUBEFACT_RUTA: RUTA }) } catch (e) { mensaje = (e as Error).message }
    expect(mensaje).toMatch(/NUBEFACT_RUTA es solo para Preview/)
    expect(mensaje).not.toContain(RUTA)
    expect(() => verificarDemoSeguro({ VERCEL: '1', VERCEL_ENV: 'preview', NUBEFACT_RUTA: RUTA })).not.toThrow()
    expect(() => verificarDemoSeguro({ VERCEL: '1', VERCEL_ENV: 'production' })).not.toThrow()
  })
})

describe('el cliente HTTP frente a la cuenta DEMO', () => {
  const cliente = (respuesta: () => Response | Promise<Response>) => new ClienteNubefactHttp({ url: RUTA, token: TOKEN, modo: 'PRUEBA', fetchFn: (async () => respuesta()) as never })
  const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })

  it('probar conexión: responde aunque diga «no existe»; falla con credenciales malas o sin red; nunca muestra la ruta ni el token', async () => {
    expect(await cliente(() => json({ errors: 'Este documento no existe en NubeFacT', codigo: 21 }, 400)).probarConexion()).toMatchObject({ ok: true })
    expect(await cliente(() => json({ serie: 'TTT1', numero: 1, aceptada_por_sunat: false })).probarConexion()).toMatchObject({ ok: true })
    const sinPermiso = await cliente(() => json({}, 401)).probarConexion()
    expect(sinPermiso).toMatchObject({ ok: false, error: expect.stringContaining('credenciales') })
    const sinRed = await cliente(() => { throw new Error(`fallo hacia ${RUTA} con ${TOKEN}`) }).probarConexion()
    expect(sinRed).toMatchObject({ ok: false })
    for (const r of [sinPermiso, sinRed]) { const t = JSON.stringify(r); expect(t).not.toContain(TOKEN); expect(t).not.toContain(RUTA) }
  })
  it('consultar una guía dada de baja en el panel (anulado: true) lo dice; una guía que no existe trae su causa', async () => {
    expect(await cliente(() => json({ serie: 'TTT1', numero: 5, anulado: true, aceptada_por_sunat: false })).consultarGuia(construirConsulta('TTT1', 5))).toMatchObject({ ok: true, anuladaEnNubefact: true })
    expect(await cliente(() => json({ errors: 'Este documento no existe en NubeFacT', codigo: 21 }, 400)).consultarGuia(construirConsulta('TTT1', 5))).toMatchObject({ ok: false, causa: 'NO_ENCONTRADA' })
  })
  it('al generar, «ya existe» y «salto» llegan clasificados (con el número esperado si Nubefact lo dice)', async () => {
    const emitir = (cuerpo: unknown) => cliente(() => json(cuerpo, 400)).emitirGuia({ serie: 'TTT1', numero: 9 } as never)
    expect(await emitir({ errors: 'Este documento ya existe en NubeFacT', codigo: 23 })).toMatchObject({ ok: false, causa: 'NUMERO_EXISTE', reintentable: false })
    expect(await emitir({ errors: 'El número no es correlativo: el siguiente debe ser 12', codigo: 24 })).toMatchObject({ ok: false, causa: 'NUMERO_SALTO', numeroEsperado: 12 })
    expect(await emitir({ errors: 'RUC inválido', codigo: 2325 })).toMatchObject({ ok: false })
    expect((await emitir({ errors: 'RUC inválido', codigo: 2325 })) as { causa?: string }).not.toHaveProperty('causa', 'NUMERO_EXISTE')
  })
})
