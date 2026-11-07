// OS-3 en demostración: emitir la guía con el simulador de Nubefact, anularla por casos (con reapertura de la conformidad) y la bandeja de avisos a Pedidos.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { SimuladorNubefact, reiniciarSimuladorNubefact } from '@/services/nubefact/simulador'
import { construirConsulta, construirPayloadNubefact, faltantesDeGuia, type TrasladoGuia } from '@/domain/guia-electronica'
import type { Actor } from '@/services/repositorio'
import { imprimirYConformar } from './ayudas-orden'
import { estadoE } from '@/services/demo/entradas-demo'
import { desp } from '@/services/demo/despacho-demo'

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

  it('caso 3 (SB-D): antes de la salida se pide el 1 o el 2; después, la baja no se bloquea, no toca el stock y deja la orden sin guía vigente', async () => {
    const { id } = await salidaConforme()
    const { reg } = await emitir(id)
    const guia = reg.ok ? reg.id : ''
    expect(await repo.anularGuia(guia, 3, 'Ya salió', JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('todavía no salió') })
    // la orden sale (se confirma)
    const e = estadoE(); desp(e).salidas.find((x) => x.id === id)!.estado = 'CONFIRMADA'
    expect(await repo.anularGuia(guia, 1, 'Dato', JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('la guía ya salió') })
    const stock = async () => (await repo.listarSalidas()).length
    const antes = await stock()
    expect(await repo.anularGuia(guia, 3, '', JT)).toMatchObject({ ok: false })
    expect(await repo.anularGuia(guia, 3, 'La contadora pidió otra serie', { ...JT, roles: ['asistente_dt'] })).toMatchObject({ ok: false })
    expect(await repo.anularGuia(guia, 3, 'La contadora pidió otra serie', JT)).toMatchObject({ ok: true, caso: 3, conformidadReabierta: false })
    expect(await stock()).toBe(antes)
    const res = (await repo.listarSalidas()).find((x) => x.id === id)!
    expect(res.faltaGuiaVigente).toBe(true); expect(res.etapa).toBe('CONFIRMADA')
    const ev = (await repo.eventosPedidos({ salidaId: id })).filter((x) => x.tipo === 'GUIA_ANULADA')
    expect(ev).toHaveLength(1)
    expect(ev[0].payload).toMatchObject({ caso: 3, salida_confirmada: true, falta_guia_vigente: true, factura_anulacion_directa_dias: 7, baja_sunat: 'PENDIENTE' })
    // se emite la guía nueva aunque la orden ya salió; con una vigente no se acepta otra
    expect((await emitir(id)).reg).toMatchObject({ ok: true })
    expect((await repo.listarSalidas()).find((x) => x.id === id)!.faltaGuiaVigente).toBeUndefined()
    expect(await repo.registrarGre(id, 'T001-00009999', undefined, JT)).toMatchObject({ ok: false })
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

describe('piloto: guía emitida en el panel (demo, espejo de la 0036)', () => {
  const reg = (numero: string, extra: object = {}) => ({ numero, fechaEmision: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }), estado: 'ACEPTADA' as const, enlace: 'https://panel.nubefact.test/g.pdf', ...extra })

  it('sin el parámetro la demo emite como siempre (WMS) y se niega a registrar una guía del panel', async () => {
    const { id } = await salidaConforme()
    expect((await repo.datosGuia(id))!.guiaModo).toBe('WMS')
    expect(await repo.registrarGuiaPanel(id, reg('TTT1-00000012'), JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('el WMS emite las guías con Nubefact') })
  })

  it('en modo PANEL pide permiso y conformidad, valida, registra con origen PANEL, avisa a Pedidos y audita', async () => {
    ;(repo as unknown as { fijarGuiaModo(m: 'PANEL'): void }).fijarGuiaModo('PANEL')
    const { id: sinId } = await salidaConforme(false)
    expect(await repo.registrarGuiaPanel(sinId, reg('TTT1-00000012'), JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('conformidad') })
    expect(await repo.conformarOrden((await repo.obtenerSalida(sinId))!.ordenPickingId!, [], 2, undefined, SANDRA)).toMatchObject({ ok: true })
    const res = { id: sinId }
    expect((await repo.datosGuia(res.id))!.guiaModo).toBe('PANEL')
    expect(await repo.registrarGuiaPanel(res.id, reg('TTT1-00000012'), AUX)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para registrar la guía de remisión' })
    expect(await repo.registrarGuiaPanel(res.id, reg('1234'), JT)).toMatchObject({ ok: false, errores: { numero: expect.stringContaining('serie, guion y número') } })
    expect(await repo.registrarGuiaPanel(res.id, reg('TTT1-00000012', { fechaEmision: '2999-01-01' }), JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('mañana') })
    const r = await repo.registrarGuiaPanel(res.id, reg(' ttt1-00000012 '), JT)
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true, numero: 'TTT1-00000012' })
    const g = (await repo.paqueteSalida(res.id))!.guia!
    expect(g).toMatchObject({ origen: 'PANEL', estadoSunat: 'ACEPTADA', enlace: 'https://panel.nubefact.test/g.pdf', estado: 'VIGENTE' })
    expect(g.fechaEmision).toBeTruthy()
    const ev = await repo.eventosPedidos({ salidaId: res.id })
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ tipo: 'GUIA_EMITIDA', estado: 'PENDIENTE' })
    expect(ev[0].payload).toMatchObject({ guia: 'TTT1-00000012', origen: 'PANEL' })
    expect(await repo.registrarGuiaPanel(res.id, reg('TTT1-00000013'), JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya tiene una guía registrada') })
  })

  it('un número no se repite ni siquiera anulado', async () => {
    ;(repo as unknown as { fijarGuiaModo(m: 'PANEL'): void }).fijarGuiaModo('PANEL')
    const { id } = await salidaConforme()
    const r = await repo.registrarGuiaPanel(id, reg('TTT1-00000020'), JT)
    if (!r.ok) throw new Error(r.mensaje)
    expect(await repo.anularGuia(r.id, 1, 'Número mal copiado', JT)).toMatchObject({ ok: true })
    expect(await repo.registrarGuiaPanel(id, reg('TTT1-00000020'), JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('vigente o anulada') })
    expect(await repo.registrarGuiaPanel(id, reg('TTT1-00000021'), JT)).toMatchObject({ ok: true })
  })
})
