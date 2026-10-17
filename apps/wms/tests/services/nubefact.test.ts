// El simulador y el cliente HTTP de Nubefact, la fábrica con su candado de producción y el aviso firmado a Pedidos.
import { afterEach, describe, expect, it } from 'vitest'
import { construirPayloadNubefact, type DatosGuia } from '@/domain/guia-electronica'
import { clienteNubefact, modoNubefactActual, NubefactNoConfigurado } from '@/services/nubefact/cliente'
import { ClienteNubefactHttp } from '@/services/nubefact/http'
import { SimuladorNubefact, guiaSimulada, reiniciarSimuladorNubefact } from '@/services/nubefact/simulador'
import { NotificadorNoConfigurado, NotificadorPedidosHttp, RUTA_EVENTOS_WMS, cuerpoDelEvento } from '@/services/pedidos/notificar'
import { verificar } from '@/services/pedidos/firma'

const datos: DatosGuia = {
  salidaId: 's1', salidaNumero: 'OS-2026-00001', tipo: 'DISTRIBUCION', conforme: true, pedidoNumero: 'PED-1',
  destinatario: { nombre: 'Botica', ruc: '20512345671', direccion: 'Av. 1', ubigeo: '120101' },
  lineas: [{ productoCodigo: 'P-1', producto: 'Paracetamol', lote: 'L1', vence: '2028-06-30', cantidad: 10 }], bultos: 1,
  ruta: { id: 'r', numero: 'RUT-1', fecha: '2026-10-20', placa: 'BKW-757', conductor: 'Luis', conductorDni: '40123456' },
  partida: { ubigeo: '150119', direccion: 'Lurín' }, motivoTraslado: 'VENTA', modalidad: 'TRANSPORTE PRIVADO', serie: 'T001',
  reglasBaja: { plazoHoras: 'PENDIENTE', trasInicioTraslado: 'PENDIENTE', soportadaPorApi: 'PENDIENTE' },
}
const payload = (o: Partial<DatosGuia> = {}) => construirPayloadNubefact({ ...datos, ...o }, { fechaInicio: '2026-10-20', pesoKg: 12, licenciaConductor: 'Q1' }, '2026-10-19')

afterEach(() => { reiniciarSimuladorNubefact(); delete process.env.NUBEFACT_MODO; delete process.env.NUBEFACT_URL; delete process.env.NUBEFACT_TOKEN; delete process.env.NUBEFACT_PRODUCCION_APROBADA })

describe('simulador de Nubefact', () => {
  it('numera cada serie con su correlativo y deja ver la guía simulada', async () => {
    const s = new SimuladorNubefact()
    const a = await s.emitirGuia(payload()); const b = await s.emitirGuia(payload())
    expect(a).toMatchObject({ ok: true, numero: 'T001-00000001', estadoSunat: 'ACEPTADA', entorno: 'SIMULADOR' })
    expect(b).toMatchObject({ ok: true, numero: 'T001-00000002' })
    expect(guiaSimulada('t001-00000001')?.payload.cliente_denominacion).toBe('Botica')
  })
  it('rechaza como SUNAT: RUC, placa, ubigeo y peso, con el error dicho en palabras y sin gastar correlativo', async () => {
    const s = new SimuladorNubefact()
    expect(await s.emitirGuia(payload({ destinatario: { ...datos.destinatario, ruc: '123' } }))).toMatchObject({ ok: false, error: expect.stringContaining('RUC del cliente'), reintentable: false })
    expect(await s.emitirGuia(payload({ ruta: { ...datos.ruta!, placa: 'X' } }))).toMatchObject({ ok: false, error: expect.stringContaining('placa') })
    expect(await s.emitirGuia(payload({ destinatario: { ...datos.destinatario, ubigeo: '12' } }))).toMatchObject({ ok: false, error: expect.stringContaining('ubigeo') })
    expect((await s.emitirGuia(payload())).ok).toBe(true)
    expect(guiaSimulada('T001-00000001')).toBeDefined()
  })
})

describe('cliente HTTP de Nubefact', () => {
  const cliente = (respuesta: () => Response | Promise<Response>, capturar?: (url: string, init: RequestInit) => void) =>
    new ClienteNubefactHttp({ url: 'https://api.nubefact.test/x', token: 'SECRETO-TOKEN', modo: 'PRUEBA', fetchFn: (async (u: string, i: RequestInit) => { capturar?.(u, i); return respuesta() }) as never })
  const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })

  it('envía el token en el encabezado (nunca en el cuerpo) y normaliza una guía aceptada', async () => {
    let visto: { url: string; init: RequestInit } | undefined
    const r = await cliente(() => json({ serie: 'T001', numero: 57, enlace_del_pdf: 'https://n/pdf', enlace_del_xml: 'https://n/xml', codigo_hash: 'abc=', aceptada_por_sunat: true }), (url, init) => { visto = { url, init } }).emitirGuia(payload())
    expect(r).toMatchObject({ ok: true, numero: 'T001-00000057', enlace: 'https://n/pdf', enlaceXml: 'https://n/xml', hash: 'abc=', estadoSunat: 'ACEPTADA', entorno: 'PRUEBA' })
    expect((visto!.init.headers as Record<string, string>).authorization).toBe('Token token="SECRETO-TOKEN"')
    expect(String(visto!.init.body)).not.toContain('SECRETO-TOKEN')
    expect(JSON.parse(String(visto!.init.body))).toMatchObject({ operacion: 'generar_guia', tipo_de_comprobante: 7 })
  })
  it('si SUNAT todavía no responde, la guía queda pendiente (no rechazada)', async () => {
    expect(await cliente(() => json({ serie: 'T001', numero: 2, enlace_del_pdf: 'https://n/pdf', aceptada_por_sunat: false })).emitirGuia(payload())).toMatchObject({ ok: true, estadoSunat: 'PENDIENTE' })
  })
  it('un rechazo de SUNAT o un error de Nubefact se dice en palabras y no se registra; la red caída es reintentable', async () => {
    expect(await cliente(() => json({ serie: 'T001', numero: 3, aceptada_por_sunat: false, sunat_soap_error: 'x', sunat_responsecode: '2325', sunat_description: 'RUC' })).emitirGuia(payload())).toMatchObject({ ok: false, error: expect.stringContaining('RUC del cliente'), reintentable: false })
    expect(await cliente(() => json({ errors: 'Serie no existe', codigo: 10 }, 400)).emitirGuia(payload())).toMatchObject({ ok: false, error: expect.stringContaining('Serie no existe') })
    expect(await cliente(() => json({}, 401)).emitirGuia(payload())).toMatchObject({ ok: false, error: expect.stringContaining('credenciales') })
    expect(await cliente(() => json({}, 503)).emitirGuia(payload())).toMatchObject({ ok: false, reintentable: true })
    expect(await cliente(() => { throw new Error('red') }).emitirGuia(payload())).toMatchObject({ ok: false, reintentable: true, error: expect.stringContaining('No se emitió nada') })
    expect(await cliente(() => json({ serie: 'T001', aceptada_por_sunat: true })).emitirGuia(payload())).toMatchObject({ ok: false, error: expect.stringContaining('revisa en Nubefact') })
  })
})

describe('qué cliente se usa (el candado de producción)', () => {
  it('por defecto es el simulador; prueba pide credenciales; producción además pide la aprobación explícita', () => {
    expect(modoNubefactActual()).toBe('SIMULADOR')
    expect(clienteNubefact().modo).toBe('SIMULADOR')
    process.env.NUBEFACT_MODO = 'PRUEBA'
    expect(() => clienteNubefact()).toThrow(NubefactNoConfigurado)
    process.env.NUBEFACT_URL = 'https://api.nubefact.test/x'; process.env.NUBEFACT_TOKEN = 't'
    expect(clienteNubefact().modo).toBe('PRUEBA')
    process.env.NUBEFACT_MODO = 'PRODUCCION'
    expect(() => clienteNubefact()).toThrow(/todavía no está aprobada/)
    process.env.NUBEFACT_PRODUCCION_APROBADA = 'SI'
    expect(clienteNubefact().modo).toBe('PRODUCCION')
    process.env.NUBEFACT_MODO = 'OTRO'
    expect(() => clienteNubefact()).toThrow(/no es válido/)
  })
})

describe('aviso firmado a Pedidos', () => {
  const evento = { id: 'ev-1', tipo: 'GUIA_EMITIDA' as const, estado: 'PENDIENTE' as const, intentos: 0, creadoEn: '2026-10-19T10:00:00Z', salidaId: 's', guiaId: 'g', payload: { guia: 'T001-00000001', lineas: [{ lote: 'L1', cantidad: 10 }] } }
  it('POST con firma HMAC que Pedidos puede verificar, con el id del evento para no procesarlo dos veces', async () => {
    let visto: { url: string; init: RequestInit } | undefined
    const n = new NotificadorPedidosHttp({ baseUrl: 'https://pedidos.test/api', secreto: 'compartido', ahora: () => new Date('2026-10-19T10:00:30Z'),
      fetchFn: (async (u: URL, init: RequestInit) => { visto = { url: String(u), init }; return new Response('{}', { status: 200 }) }) as never })
    expect(await n.enviar(evento)).toEqual({ ok: true })
    const h = visto!.init.headers as Record<string, string>
    expect(new URL(visto!.url).pathname).toBe('/api' + RUTA_EVENTOS_WMS)
    expect(verificar('compartido', 'POST', '/api' + RUTA_EVENTOS_WMS, String(visto!.init.body), h['x-wms-timestamp'], h['x-wms-firma'], new Date('2026-10-19T10:00:31Z'))).toEqual({ ok: true })
    expect(JSON.parse(String(visto!.init.body))).toMatchObject({ evento_id: 'ev-1', tipo: 'GUIA_EMITIDA', guia: 'T001-00000001' })
    expect(cuerpoDelEvento(evento)).toContain('"lineas"')
  })
  it('un fallo no pierde el aviso: devuelve el motivo en palabras', async () => {
    const f = (status: number) => new NotificadorPedidosHttp({ baseUrl: 'https://pedidos.test', secreto: 's', fetchFn: (async () => new Response('{}', { status })) as never })
    expect(await f(403).enviar(evento)).toMatchObject({ ok: false, mensaje: expect.stringContaining('firma') })
    expect(await f(500).enviar(evento)).toMatchObject({ ok: false, mensaje: expect.stringContaining('se reintenta') })
    expect(await new NotificadorPedidosHttp({ baseUrl: 'https://pedidos.test', secreto: 's', fetchFn: (async () => { throw new Error('x') }) as never }).enviar(evento)).toMatchObject({ ok: false })
    expect(await new NotificadorNoConfigurado().enviar()).toMatchObject({ ok: false, mensaje: expect.stringContaining('todavía no está configurada') })
  })
})
