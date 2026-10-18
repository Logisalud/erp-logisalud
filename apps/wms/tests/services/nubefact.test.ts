// El simulador y el cliente HTTP de Nubefact, la fábrica con su candado de producción y el aviso firmado a Pedidos.
import { afterEach, describe, expect, it } from 'vitest'
import { construirConsulta, construirPayloadNubefact, type DatosGuia } from '@/domain/guia-electronica'
import { clienteNubefact, modoNubefactActual, NubefactNoConfigurado } from '@/services/nubefact/cliente'
import { ClienteNubefactHttp } from '@/services/nubefact/http'
import { SimuladorNubefact, guiaSimulada, rechazarGuiaSimulada, reiniciarSimuladorNubefact, retrasarAceptacionSimulada } from '@/services/nubefact/simulador'
import { NotificadorNoConfigurado, NotificadorPedidosHttp, RUTA_EVENTOS_WMS, cuerpoDelEvento } from '@/services/pedidos/notificar'
import { verificar } from '@/services/pedidos/firma'

const datos: DatosGuia = {
  salidaId: 's1', salidaNumero: 'OS-2026-00001', tipo: 'DISTRIBUCION', conforme: true, pedidoNumero: 'PED-1',
  destinatario: { nombre: 'Botica', ruc: '20512345671', direccion: 'Av. 1', ubigeo: '120101' },
  lineas: [{ productoCodigo: 'P-1', producto: 'Paracetamol', lote: 'L1', vence: '2028-06-30', cantidad: 10 }], bultos: 1,
  ruta: { id: 'r', numero: 'RUT-1', fecha: '2026-10-20', placa: 'BKW-757', conductor: 'Luis Quispe', conductorDni: '40123456', conductorLicencia: 'Q40123456' },
  partida: { ubigeo: '150119', direccion: 'Lurín' }, motivoTraslado: 'VENTA', modalidad: 'TRANSPORTE PRIVADO', serie: 'TTT1',
  reglasBaja: { plazoHoras: 'PENDIENTE', trasInicioTraslado: 'PENDIENTE', soportadaPorApi: 'PENDIENTE' },
}
let correlativo = 0
const payload = (o: Partial<DatosGuia> = {}, numero = ++correlativo) => construirPayloadNubefact({ ...datos, ...o }, { fechaInicio: '2026-10-20', pesoKg: 12 }, '2026-10-19', numero)

afterEach(() => { reiniciarSimuladorNubefact(); delete process.env.NUBEFACT_MODO; delete process.env.NUBEFACT_URL; delete process.env.NUBEFACT_TOKEN; delete process.env.NUBEFACT_PRODUCCION_APROBADA })

describe('simulador de Nubefact', () => {
  it('recibe el número que manda el WMS, no repite uno ya usado y deja ver la guía simulada', async () => {
    const s = new SimuladorNubefact()
    const a = await s.emitirGuia(payload({}, 1))
    expect(a).toMatchObject({ ok: true, numero: 'TTT1-00000001', estadoSunat: 'PENDIENTE', entorno: 'SIMULADOR' })
    expect(await s.emitirGuia(payload({}, 1))).toMatchObject({ ok: false, error: expect.stringContaining('SUNAT ya tiene una guía con ese número') })
    expect(guiaSimulada('ttt1-00000001')?.payload.cliente_denominacion).toBe('Botica')
    expect(guiaSimulada('TTT1-00000001')?.payload).toMatchObject({ peso_bruto_unidad_de_medida: 'KGM', transportista_placa_numero: 'BKW757', conductor_nombre: 'Luis', conductor_apellidos: 'Quispe' })
  })
  it('en dos pasos: generar deja la guía en espera y consultar la acepta con sus enlaces (o la rechaza con el motivo)', async () => {
    const s = new SimuladorNubefact()
    await s.emitirGuia(payload({}, 5))
    retrasarAceptacionSimulada(1)
    expect(await s.consultarGuia(construirConsulta('TTT1', 5))).toMatchObject({ ok: true, estadoSunat: 'PENDIENTE' })
    expect(await s.consultarGuia(construirConsulta('TTT1', 5))).toMatchObject({ ok: true, estadoSunat: 'ACEPTADA', enlace: '/simulador-nubefact/TTT1-00000005' })
    await s.emitirGuia(payload({}, 6))
    rechazarGuiaSimulada('TTT1-00000006', 'Datos del destinatario no coinciden')
    expect(await s.consultarGuia(construirConsulta('TTT1', 6))).toMatchObject({ ok: true, estadoSunat: 'RECHAZADA', error: expect.stringContaining('Datos del destinatario') })
    expect(await s.consultarGuia(construirConsulta('TTT1', 99))).toMatchObject({ ok: false })
  })
  it('rechaza como SUNAT: RUC, placa, ubigeo y licencia, con el error dicho en palabras', async () => {
    const s = new SimuladorNubefact()
    expect(await s.emitirGuia(payload({ destinatario: { ...datos.destinatario, ruc: '123' } }))).toMatchObject({ ok: false, error: expect.stringContaining('RUC del cliente'), reintentable: false })
    expect(await s.emitirGuia(payload({ ruta: { ...datos.ruta!, placa: 'X' } }))).toMatchObject({ ok: false, error: expect.stringContaining('placa') })
    expect(await s.emitirGuia(payload({ destinatario: { ...datos.destinatario, ubigeo: '12' } }))).toMatchObject({ ok: false, error: expect.stringContaining('ubigeo') })
    expect(await s.emitirGuia(payload({ ruta: { ...datos.ruta!, conductorLicencia: 'Q1' } }))).toMatchObject({ ok: false, error: expect.stringContaining('licencia') })
    expect((await s.emitirGuia(payload())).ok).toBe(true)
  })
})

describe('cliente HTTP de Nubefact', () => {
  const cliente = (respuesta: () => Response | Promise<Response>, capturar?: (url: string, init: RequestInit) => void) =>
    new ClienteNubefactHttp({ url: 'https://api.nubefact.test/x', token: 'SECRETO-TOKEN', modo: 'PRUEBA', fetchFn: (async (u: string, i: RequestInit) => { capturar?.(u, i); return respuesta() }) as never })
  const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })

  it('envía el token tal cual en el encabezado de autorización (nunca en el cuerpo) y la guía generada queda en espera de SUNAT', async () => {
    let visto: { url: string; init: RequestInit } | undefined
    const r = await cliente(() => json({ serie: 'TTT1', numero: 57, enlace: '', aceptada_por_sunat: false, enlace_del_pdf: '' }), (url, init) => { visto = { url, init } }).emitirGuia(payload({}, 57))
    expect(r).toMatchObject({ ok: true, numero: 'TTT1-00000057', estadoSunat: 'PENDIENTE', entorno: 'PRUEBA' })
    expect((visto!.init.headers as Record<string, string>).authorization).toBe('SECRETO-TOKEN')
    expect(String(visto!.init.body)).not.toContain('SECRETO-TOKEN')
    expect(JSON.parse(String(visto!.init.body))).toMatchObject({ operacion: 'generar_guia', tipo_de_comprobante: 7, numero: 57 })
  })
  it('consultar: aceptada trae PDF, XML y CDR; sin respuesta de SUNAT sigue pendiente; un error de SUNAT es rechazo', async () => {
    let cuerpo: unknown
    const ok = await cliente(() => json({ serie: 'TTT1', numero: 57, aceptada_por_sunat: true, enlace_del_pdf: 'https://n/pdf', enlace_del_xml: 'https://n/xml', enlace_del_cdr: 'https://n/cdr' }), (_u, i) => { cuerpo = JSON.parse(String(i.body)) }).consultarGuia(construirConsulta('TTT1', 57))
    expect(ok).toMatchObject({ ok: true, estadoSunat: 'ACEPTADA', enlace: 'https://n/pdf', enlaceXml: 'https://n/xml', enlaceCdr: 'https://n/cdr' })
    expect(cuerpo).toEqual({ operacion: 'consultar_guia', tipo_de_comprobante: 7, serie: 'TTT1', numero: 57 })
    expect(await cliente(() => json({ serie: 'TTT1', numero: 57, aceptada_por_sunat: false })).consultarGuia(construirConsulta('TTT1', 57))).toMatchObject({ ok: true, estadoSunat: 'PENDIENTE' })
    expect(await cliente(() => json({ aceptada_por_sunat: false, sunat_soap_error: 'x', sunat_responsecode: '2325', sunat_description: 'RUC' })).consultarGuia(construirConsulta('TTT1', 57))).toMatchObject({ ok: true, estadoSunat: 'RECHAZADA', error: expect.stringContaining('RUC del cliente') })
  })
  it('un rechazo al generar o un error de Nubefact se dice en palabras y no se registra; la red caída es reintentable', async () => {
    expect(await cliente(() => json({ serie: 'TTT1', numero: 3, aceptada_por_sunat: false, sunat_soap_error: 'x', sunat_responsecode: '2325', sunat_description: 'RUC' })).emitirGuia(payload())).toMatchObject({ ok: false, error: expect.stringContaining('RUC del cliente'), reintentable: false })
    expect(await cliente(() => json({ errors: 'Serie no existe', codigo: 10 }, 400)).emitirGuia(payload())).toMatchObject({ ok: false, error: expect.stringContaining('Serie no existe') })
    expect(await cliente(() => json({}, 401)).emitirGuia(payload())).toMatchObject({ ok: false, error: expect.stringContaining('credenciales') })
    expect(await cliente(() => json({}, 503)).emitirGuia(payload())).toMatchObject({ ok: false, reintentable: true })
    expect(await cliente(() => { throw new Error('red') }).emitirGuia(payload())).toMatchObject({ ok: false, reintentable: true, error: expect.stringContaining('No se emitió nada') })
    expect(await cliente(() => json({ serie: 'TTT1', aceptada_por_sunat: true })).emitirGuia(payload())).toMatchObject({ ok: false, error: expect.stringContaining('revisa en Nubefact') })
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
