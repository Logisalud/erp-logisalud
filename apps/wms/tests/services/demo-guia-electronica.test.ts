// OS-3 en demostración: emitir la guía con el simulador de Nubefact, anularla por casos (con reapertura de la conformidad) y la bandeja de avisos a Pedidos.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { SimuladorNubefact, reiniciarSimuladorNubefact } from '@/services/nubefact/simulador'
import { construirConsulta, construirPayloadNubefact, faltantesDeGuia, type TrasladoGuia } from '@/domain/guia-electronica'
import type { Actor } from '@/services/repositorio'
import { imprimirYConformar } from './ayudas-orden'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const JT = actor('jefe_transporte', 'jefe_transporte', 'jefe_almacen'); const AUX = actor('auxiliar', 'auxiliar'); const SANDRA = actor('asistente_dt', 'asistente_dt', 'conformidad_despacho')
const traslado: TrasladoGuia = { fechaInicio: '2026-10-20', pesoKg: 12 }

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  reiniciarSimuladorNubefact()
  repo = new RepositorioDemo()
})

async function salidaConforme(conformar = true) {
  const [res] = await repo.listarSalidas()
  const orden = await imprimirYConformar(repo, res.id, { jt: JT, picker: AUX, conforme: SANDRA, bultos: 2, conformar })
  return { id: res.id, ordenId: orden.id }
}
async function emitir(id: string, actorEmite: Actor = JT) {
  const datos = (await repo.datosGuia(id))!
  expect(faltantesDeGuia(datos, traslado, 'SIMULADOR')).toEqual([])
  const n = await repo.reservarNumeroGuia(datos.serie, 'SIMULADOR', id)
  if (!n.ok) throw new Error(n.mensaje)
  const payload = construirPayloadNubefact(datos, traslado, '2026-10-19', n.numero)
  const sim = new SimuladorNubefact()
  const r = await sim.emitirGuia(payload)
  if (!r.ok) throw new Error(r.error)
  const reg = await repo.registrarGuiaElectronica(id, r, traslado, payload, actorEmite)
  if (reg.ok) {
    const c = await sim.consultarGuia(construirConsulta(datos.serie, n.numero))
    if (c.ok) await repo.actualizarEstadoGuia(reg.id, c, actorEmite)
  }
  return { r, payload, reg }
}
const stockEn = async (zona: 'DESPACHO' | 'rack') => {
  const p = await repo.panorama()
  const despacho = new Set(p.posiciones.filter((x) => x.tipoArea === 'DESPACHO').map((x) => x.id))
  return p.saldos.filter((s) => (zona === 'DESPACHO') === despacho.has(s.posicionId)).reduce((t, s) => t + s.cantidad, 0)
}

describe('datos de la guía (demo)', () => {
  it('toma del WMS el destinatario, las líneas por lote, la ruta con vehículo y conductor, los bultos y el punto de partida', async () => {
    const { id } = await salidaConforme()
    const d = (await repo.datosGuia(id))!
    expect(d).toMatchObject({ tipo: 'DISTRIBUCION', conforme: true, bultos: 2, motivoTraslado: 'VENTA', modalidad: 'TRANSPORTE PRIVADO', serie: 'TTT1', partida: { ubigeo: '150119' } })
    expect(d.destinatario.ruc).toBeTruthy()
    expect(d.lineas.reduce((t, l) => t + l.cantidad, 0)).toBe(26)
    expect(d.reglasBaja).toEqual({ plazoHoras: 'PENDIENTE', trasInicioTraslado: 'PENDIENTE', soportadaPorApi: 'PENDIENTE' })
  })
})

describe('emitir la guía (demo)', () => {
  it('con la conformidad completa se registra con origen Nubefact, entorno, enlace y el aviso para Pedidos', async () => {
    const { id } = await salidaConforme()
    const { r, reg } = await emitir(id)
    expect(reg).toMatchObject({ ok: true, numero: r.ok ? r.numero : '' })
    const paquete = (await repo.paqueteSalida(id))!
    expect(paquete.guia).toMatchObject({ origen: 'NUBEFACT', entorno: 'SIMULADOR', estadoSunat: 'ACEPTADA', bultos: 2, pesoKg: 12, fechaInicio: '2026-10-20' })
    expect(paquete.guia!.enlace).toMatch(/^\/simulador-nubefact\/TTT1-0000000\d$/)
    const ev = await repo.eventosPedidos({ salidaId: id })
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ tipo: 'GUIA_EMITIDA', estado: 'PENDIENTE' })
    expect(ev[0].payload).toMatchObject({ guia: paquete.guia!.numero, bultos: 2 })
    expect((ev[0].payload.lineas as { lote: string; vence: string | null; cantidad: number }[]).reduce((t, l) => t + l.cantidad, 0)).toBe(26)
    expect(await repo.registrarGuiaElectronica(id, r as never, traslado, {}, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya tiene una guía') })
  })

  it('sin conformidad no se emite; sin permiso tampoco', async () => {
    const falsa = { ok: true as const, numero: 'TTT1-00000099', enlace: '/simulador-nubefact/TTT1-00000099', hash: 'h', estadoSunat: 'ACEPTADA' as const, entorno: 'SIMULADOR' as const, cruda: {} }
    const { id } = await salidaConforme(false)
    expect(await repo.registrarGuiaElectronica(id, falsa, traslado, {}, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('cuando todo el pedido tiene la conformidad') })
    ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; repo = new RepositorioDemo()
    const { id: id2 } = await salidaConforme()
    expect(await repo.registrarGuiaElectronica(id2, falsa, traslado, {}, AUX)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para emitir la guía de remisión' })
  })
})

describe('anular la guía (demo)', () => {
  it('caso 1: la Orden no cambia, se avisa a Pedidos y la baja ante SUNAT queda pendiente; se emite otra guía', async () => {
    const { id } = await salidaConforme()
    const { reg } = await emitir(id)
    const guia = reg.ok ? reg.id : ''
    expect(await repo.anularGuia(guia, 1, 'Placa mal digitada', SANDRA)).toMatchObject({ ok: false, mensaje: 'Solo el Jefe de Transporte puede anular una guía' })
    expect(await repo.anularGuia(guia, 1, ' ', JT)).toMatchObject({ ok: false, mensaje: 'Cuenta por qué se anula la guía' })
    expect(await repo.anularGuia(guia, 1, 'Placa mal digitada', JT)).toMatchObject({ ok: true, caso: 1, conformidadReabierta: false, bajaSunat: 'PENDIENTE' })
    const p = (await repo.paqueteSalida(id))!
    expect(p.guia).toBeUndefined()
    expect(p.guiasAnuladas[0]).toMatchObject({ casoAnulacion: 1, bajaSunat: 'PENDIENTE', anuladaMotivo: 'Placa mal digitada' })
    expect(p.conforme).toBe(true)
    expect(await stockEn('DESPACHO')).toBe(26)
    const ev = await repo.eventosPedidos({ salidaId: id })
    expect(ev.map((e) => e.tipo).sort()).toEqual(['GUIA_ANULADA', 'GUIA_EMITIDA'])
    expect(ev.find((e) => e.tipo === 'GUIA_ANULADA')!.payload).toMatchObject({ caso: 1, motivo: 'Placa mal digitada' })
    expect((await emitir(id)).reg).toMatchObject({ ok: true })
  })

  it('caso 2: la conformidad se reabre, el stock regresa de Despacho al rack, otra persona confirma de nuevo y se emite otra guía', async () => {
    const { id, ordenId } = await salidaConforme()
    const rackAntes = await stockEn('rack')
    expect(await stockEn('DESPACHO')).toBe(26)
    const { reg } = await emitir(id)
    expect(await repo.anularGuia(reg.ok ? reg.id : '', 2, 'El lote no era el que se cargó', JT)).toMatchObject({ ok: true, caso: 2, conformidadReabierta: true })
    expect(await stockEn('DESPACHO')).toBe(0)
    expect(await stockEn('rack')).toBe(rackAntes + 26)
    const p = (await repo.paqueteSalida(id))!
    expect(p.conforme).toBe(false)
    expect((await repo.obtenerOrdenPicking(ordenId))!.lineasDetalle.every((l) => l.conformidad === 'PENDIENTE')).toBe(true)
    expect(await repo.registrarGuiaElectronica(id, (reg as never), traslado, {}, JT)).toMatchObject({ ok: false })
    // quien picó no puede confirmar; otra persona sí, con el stock de vuelta en Despacho
    expect(await repo.conformarOrden(ordenId, [], 2, undefined, { ...SANDRA, id: AUX.id })).toMatchObject({ ok: false })
    expect(await repo.conformarOrden(ordenId, [], 2, undefined, SANDRA)).toMatchObject({ ok: true, unidades: 26 })
    expect(await stockEn('DESPACHO')).toBe(26)
    expect((await emitir(id)).reg).toMatchObject({ ok: true })
  })

  it('caso 3 y una salida ya confirmada no se anulan desde el WMS', async () => {
    const { id } = await salidaConforme()
    const { reg } = await emitir(id)
    const guia = reg.ok ? reg.id : ''
    expect(await repo.anularGuia(guia, 3, 'Ya salió', JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('retorno como devolución') })
    expect((await repo.paqueteSalida(id))!.guia).toBeDefined()
  })

  it('la anulación vieja (S6b) sigue siendo el caso 1', async () => {
    const { id } = await salidaConforme()
    const g = await repo.registrarGre(id, 'T001-00001234', undefined, JT)
    expect(await repo.anularGre(g.ok ? g.id : '', 'Número mal digitado', JT)).toEqual({ ok: true })
    expect((await repo.paqueteSalida(id))!.guiasAnuladas[0]).toMatchObject({ casoAnulacion: 1, bajaSunat: 'NO_APLICA', origen: 'MANUAL' })
  })
})

describe('bandeja de avisos a Pedidos (demo)', () => {
  it('se marca enviado o con error, sin perder el aviso', async () => {
    const { id } = await salidaConforme()
    await emitir(id)
    const [ev] = await repo.eventosPedidos({ soloPendientes: true })
    expect(await repo.marcarEventoPedidos(ev.id, false, 'Pedidos no respondió', JT)).toEqual({ ok: true })
    expect((await repo.eventosPedidos({ soloPendientes: true }))[0]).toMatchObject({ intentos: 1, ultimoError: 'Pedidos no respondió' })
    expect(await repo.marcarEventoPedidos(ev.id, true, undefined, AUX)).toMatchObject({ ok: false })
    await repo.marcarEventoPedidos(ev.id, true, undefined, JT)
    expect(await repo.eventosPedidos({ soloPendientes: true })).toHaveLength(0)
    expect((await repo.eventosPedidos({ salidaId: id }))[0]).toMatchObject({ estado: 'ENVIADO', intentos: 2 })
  })
})
