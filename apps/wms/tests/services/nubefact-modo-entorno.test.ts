// 1a (reunión del equipo): sin NUBEFACT_MODO, la cuenta DEMO completa usa Nubefact en modo prueba; antes caía en el simulador sin avisar.
import { describe, expect, it } from 'vitest'
import { modoNubefactDeEntorno } from '@/services/nubefact/cliente'
import { AVISO_MODO_PRUEBA } from '@/domain/guia-electronica'

const DEMO = { NUBEFACT_ENTORNO: 'DEMO', NUBEFACT_RUTA: 'https://api.nubefact.com/api/v1/x', NUBEFACT_TOKEN: 't' }

describe('modo de Nubefact según el entorno', () => {
  it('sin NUBEFACT_MODO pero con ENTORNO=DEMO, ruta https y token → PRUEBA', () => {
    expect(modoNubefactDeEntorno(DEMO)).toBe('PRUEBA')
    expect(modoNubefactDeEntorno({ ...DEMO, NUBEFACT_ENTORNO: ' demo ' })).toBe('PRUEBA')
  })
  it('si falta algo, sigue siendo el simulador', () => {
    expect(modoNubefactDeEntorno({})).toBe('SIMULADOR')
    expect(modoNubefactDeEntorno({ ...DEMO, NUBEFACT_TOKEN: '' })).toBe('SIMULADOR')
    expect(modoNubefactDeEntorno({ ...DEMO, NUBEFACT_RUTA: 'http://inseguro' })).toBe('SIMULADOR')
    expect(modoNubefactDeEntorno({ ...DEMO, NUBEFACT_ENTORNO: 'PRODUCCION' })).toBe('SIMULADOR')
  })
  it('una NUBEFACT_MODO escrita siempre manda', () => {
    expect(modoNubefactDeEntorno({ ...DEMO, NUBEFACT_MODO: 'SIMULADOR' })).toBe('SIMULADOR')
    expect(modoNubefactDeEntorno({ NUBEFACT_MODO: 'produccion' })).toBe('PRODUCCION')
  })
  it('el aviso de modo prueba explica que SUNAT no responde y que el enlace llega solo si acepta', () => {
    expect(AVISO_MODO_PRUEBA).toMatch(/SUNAT no responde/); expect(AVISO_MODO_PRUEBA).toMatch(/solo llega si SUNAT la acepta/)
  })
})
