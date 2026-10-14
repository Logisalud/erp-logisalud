// El puerto con Pedidos contra un doble: un servidor HTTP que hace lo que haría Pedidos (verificar la firma HMAC y entregar los pedidos listos).
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ENCABEZADO_FIRMA, ENCABEZADO_HORA, firmar, verificar } from '@/services/pedidos/firma'
import { FuenteNoConfigurada, FuentePedidosHttp, RUTA_PEDIDOS_LISTOS } from '@/services/pedidos/fuente-pedidos'
import { validarPedidos } from '@/domain/pedidos-despacho'

const SECRETO = 'secreto-de-prueba'
const PEDIDOS = [{
  pedidoId: 'p-1', numero: 'PED-0001', version: 1, estado: 'READY_FOR_OPERATIONS', fecha: '2026-10-13',
  cliente: { id: 'c-1', nombre: 'Botica Salud SAC' }, lineas: [{ lineaId: 'l-1', productoCodigo: 'LIZI-10', cantidad: 3 }],
}]
let modo: 'ok' | 'error500' | 'json_malo' | 'sin_lista' | 'lento' = 'ok'
let ultimo: { hora?: string; firma?: string } = {}
let servidor: Server
let url = ''

beforeAll(async () => {
  servidor = createServer((req, res) => {
    const hora = req.headers[ENCABEZADO_HORA] as string | undefined
    const firma = req.headers[ENCABEZADO_FIRMA] as string | undefined
    ultimo = { hora, firma }
    const v = verificar(SECRETO, req.method ?? 'GET', req.url ?? '', '', hora, firma)
    if (!v.ok || req.url?.split('?')[0] !== RUTA_PEDIDOS_LISTOS) { res.statusCode = 401; res.end('no'); return }
    if (modo === 'error500') { res.statusCode = 500; res.end('boom'); return }
    if (modo === 'json_malo') { res.setHeader('content-type', 'application/json'); res.end('{no es json'); return }
    if (modo === 'sin_lista') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ otra: 1 })); return }
    if (modo === 'lento') { setTimeout(() => { res.end('{}') }, 300); return }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ pedidos: PEDIDOS, generado_en: '2026-10-14T15:00:00Z' }))
  })
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => servidor.close(() => r())))

describe('firma HMAC', () => {
  const ahora = new Date('2026-10-14T15:00:00Z')
  const hora = String(Math.floor(ahora.getTime() / 1000))
  it('la firma correcta pasa; cualquier cambio de método, ruta, cuerpo o secreto la rompe', () => {
    const f = firmar(SECRETO, 'GET', '/x', '', hora)
    expect(verificar(SECRETO, 'GET', '/x', '', hora, f, ahora)).toEqual({ ok: true })
    expect(verificar(SECRETO, 'POST', '/x', '', hora, f, ahora)).toMatchObject({ ok: false, motivo: 'FIRMA_INCORRECTA' })
    expect(verificar(SECRETO, 'GET', '/y', '', hora, f, ahora)).toMatchObject({ ok: false, motivo: 'FIRMA_INCORRECTA' })
    expect(verificar(SECRETO, 'GET', '/x', 'cuerpo', hora, f, ahora)).toMatchObject({ ok: false, motivo: 'FIRMA_INCORRECTA' })
    expect(verificar('otro', 'GET', '/x', '', hora, f, ahora)).toMatchObject({ ok: false, motivo: 'FIRMA_INCORRECTA' })
  })
  it('una solicitud vieja o sin firma no vale: no se puede repetir una captura', () => {
    const f = firmar(SECRETO, 'GET', '/x', '', hora)
    expect(verificar(SECRETO, 'GET', '/x', '', hora, f, new Date(ahora.getTime() + 301_000))).toMatchObject({ ok: false, motivo: 'FUERA_DE_TIEMPO' })
    expect(verificar(SECRETO, 'GET', '/x', '', undefined, f, ahora)).toMatchObject({ ok: false, motivo: 'FALTA_FIRMA' })
    expect(verificar(SECRETO, 'GET', '/x', '', 'abc', f, ahora)).toMatchObject({ ok: false, motivo: 'HORA_INVALIDA' })
  })
})

describe('adaptador HTTP (contrato contra un doble de Pedidos)', () => {
  const fuente = (extra: Partial<ConstructorParameters<typeof FuentePedidosHttp>[0]> = {}) => new FuentePedidosHttp({ baseUrl: url, secreto: SECRETO, ...extra })

  it('trae los pedidos listos con la firma correcta, y el dominio los valida', async () => {
    modo = 'ok'
    const r = await fuente().listarListos()
    expect(r).toMatchObject({ ok: true, generadoEn: '2026-10-14T15:00:00Z' })
    expect(ultimo.firma).toMatch(/^sha256=[0-9a-f]{64}$/)
    if (r.ok) expect(validarPedidos(r.pedidos).pedidos.map((p) => p.numero)).toEqual(['PED-0001'])
  })

  it('con el secreto equivocado Pedidos lo rechaza y el mensaje lo dice', async () => {
    modo = 'ok'
    expect(await fuente({ secreto: 'otro' }).listarListos()).toMatchObject({ ok: false, codigo: 'RECHAZADA', mensaje: expect.stringMatching(/rechazó la firma/) })
  })

  it('con la hora desfasada Pedidos también lo rechaza', async () => {
    modo = 'ok'
    expect(await fuente({ ahora: () => new Date(Date.now() - 3_600_000) }).listarListos()).toMatchObject({ ok: false, codigo: 'RECHAZADA' })
  })

  it('errores de Pedidos, JSON roto, respuesta sin lista y tiempo agotado: nunca lanzan, devuelven un mensaje', async () => {
    modo = 'error500'
    expect(await fuente().listarListos()).toMatchObject({ ok: false, codigo: 'SIN_RESPUESTA', mensaje: expect.stringMatching(/\(500\)/) })
    modo = 'json_malo'
    expect(await fuente().listarListos()).toMatchObject({ ok: false, codigo: 'RESPUESTA_INVALIDA' })
    modo = 'sin_lista'
    expect(await fuente().listarListos()).toMatchObject({ ok: false, codigo: 'RESPUESTA_INVALIDA', mensaje: expect.stringMatching(/lista de pedidos/) })
    modo = 'lento'
    expect(await fuente({ tiempoMaximoMs: 50 }).listarListos()).toMatchObject({ ok: false, codigo: 'SIN_RESPUESTA' })
    expect(await new FuentePedidosHttp({ baseUrl: 'http://127.0.0.1:1', secreto: SECRETO, tiempoMaximoMs: 500 }).listarListos()).toMatchObject({ ok: false, codigo: 'SIN_RESPUESTA' })
  })

  it('sin configurar, la fuente lo dice y la bandeja sigue con lo ya importado', async () => {
    expect(await new FuenteNoConfigurada().listarListos()).toMatchObject({ ok: false, codigo: 'NO_CONFIGURADA' })
  })
})
