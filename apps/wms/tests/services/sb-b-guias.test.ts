// SB-B en demostración: la numeración atómica de las guías (reserva, liberación, «ya existe», «salto», resultado incierto, correlativo confirmado) y la guía dada de baja en el panel
// de Nubefact. Usa el servicio real de emisión con el repositorio de la demo y el simulador (que numera y rechaza como Nubefact).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { anularEnPanelSimulado, cortarRedSimulada, emitirDesdePanelSimulado, reiniciarSimuladorNubefact } from '@/services/nubefact/simulador'
import { consultarEstadoGuia, emitirGuiaElectronica } from '@/services/guia-electronica'
import type { Actor } from '@/services/repositorio'
import { MENSAJE_RESULTADO_INCIERTO } from '@/domain/numeracion-guias'
import { imprimirYConformar } from './ayudas-orden'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const JT = actor('jefe_transporte', 'jefe_transporte', 'jefe_almacen'); const AUX = actor('auxiliar', 'auxiliar'); const SANDRA = actor('asistente_dt', 'asistente_dt', 'conformidad_despacho')
const traslado = { fechaInicio: '2026-10-20', pesoKg: 12 }
let repo: RepositorioDemo

async function salidaConforme(indice = 0) {
  const res = await repo.listarSalidas()
  const orden = await imprimirYConformar(repo, res[indice].id, { jt: JT, picker: AUX, conforme: SANDRA, bultos: 2, conformar: true })
  return { id: res[indice].id, ordenId: orden.id }
}

beforeEach(() => {
  process.env.WMS_DEMO_LOCAL = '1'
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  reiniciarSimuladorNubefact()
  repo = new RepositorioDemo()
})
afterEach(() => { delete process.env.WMS_DEMO_LOCAL })

describe('numeración atómica de las guías (demo + simulador)', () => {
  it('la primera guía lleva el número 1; el número queda USADO y la serie lo muestra', async () => {
    const { id } = await salidaConforme()
    const r = await emitirGuiaElectronica(id, traslado, JT)
    expect(r).toMatchObject({ ok: true, numero: 'TTT1-00000001', saltados: [] })
    expect(await repo.estadoNumeracionGuia('TTT1')).toMatchObject({ ultimo: 1, proximo: 2, confirmado: false, enCurso: undefined })
  })

  it('«ya existe»: alguien emitió desde el panel; el WMS da el número por usado y sigue con el siguiente, sin dejar un hueco', async () => {
    const { id } = await salidaConforme()
    emitirDesdePanelSimulado('TTT1', 1)
    const r = await emitirGuiaElectronica(id, traslado, JT)
    expect(r).toMatchObject({ ok: true, numero: 'TTT1-00000002', saltados: [1] })
  })

  it('«salto»: Nubefact espera otro número; no se emite nada, el número vuelve a estar libre y el mensaje manda a corregir el correlativo', async () => {
    const { id } = await salidaConforme()
    // el WMS cree que va en el 4, pero Nubefact solo llega al 1 (alguien anuló o corrigió desde el panel)
    emitirDesdePanelSimulado('TTT1', 1)
    for (let i = 0; i < 3; i++) { const n = await repo.reservarNumeroGuia('TTT1', 'SIMULADOR', id); if (n.ok) await repo.marcarNumeroGuiaOcupado('TTT1', n.numero) }
    const r = await emitirGuiaElectronica(id, traslado, JT)
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/no sigue al último de la serie TTT1 \(esperaba el 2\).*Numeración de guías/) })
    expect((await repo.paqueteSalida(id))!.guia).toBeUndefined()
    expect(await repo.estadoNumeracionGuia('TTT1')).toMatchObject({ enCurso: undefined, proximo: 4 })      // el 4 quedó libre, no reservado
  })

  it('resultado incierto: si la red se corta sin saber si Nubefact la recibió, la reserva queda y el reintento usa el MISMO número', async () => {
    const { id } = await salidaConforme()
    cortarRedSimulada(1)
    const a = await emitirGuiaElectronica(id, traslado, JT)
    expect(a).toMatchObject({ ok: false, mensaje: expect.stringContaining(MENSAJE_RESULTADO_INCIERTO) })
    expect(await repo.estadoNumeracionGuia('TTT1')).toMatchObject({ enCurso: { numero: 1 } })
    const b = await emitirGuiaElectronica(id, traslado, JT)
    expect(b).toMatchObject({ ok: true, numero: 'TTT1-00000001', adoptada: false })
  })

  it('resultado incierto con la guía ya recibida por Nubefact: el reintento la reconoce y la registra una sola vez', async () => {
    const { id } = await salidaConforme()
    cortarRedSimulada(1, { llegaANubefact: true })
    expect(await emitirGuiaElectronica(id, traslado, JT)).toMatchObject({ ok: false })
    const b = await emitirGuiaElectronica(id, traslado, JT)
    expect(b).toMatchObject({ ok: true, numero: 'TTT1-00000001', adoptada: true })
    expect((await repo.paqueteSalida(id))!.guia).toMatchObject({ numero: 'TTT1-00000001', origen: 'NUBEFACT' })
    expect(await repo.estadoNumeracionGuia('TTT1')).toMatchObject({ ultimo: 1, enCurso: undefined })
  })

  it('una sola guía en curso: otra orden espera mientras la primera no termina', async () => {
    const a = await salidaConforme(0)
    cortarRedSimulada(1)
    await emitirGuiaElectronica(a.id, traslado, JT)
    expect(await repo.reservarNumeroGuia('TTT1', 'SIMULADOR', 'otra-orden')).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Se está emitiendo otra guía de la serie TTT1 .* con el número 1/) })
  })

  it('una guía real no se emite sin el correlativo inicial confirmado; confirmarlo exige permiso y vale una sola vez', async () => {
    const { id } = await salidaConforme()
    expect(await repo.reservarNumeroGuia('TTT1', 'PRODUCCION', id)).toMatchObject({ ok: false, mensaje: expect.stringContaining('falta confirmar con qué número empieza la serie TTT1') })
    expect(await repo.confirmarCorrelativoGuia('TTT1', 2888, undefined, AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Solo el Jefe de Transporte') })
    expect(await repo.confirmarCorrelativoGuia('TTT1', 0, undefined, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('entero de 1 a 99 999 999') })
    expect(await repo.confirmarCorrelativoGuia('TTT1', 2888, 'Lo indicó Sebas', JT)).toMatchObject({ ok: true })
    expect(await repo.reservarNumeroGuia('TTT1', 'PRODUCCION', id)).toMatchObject({ ok: true, numero: 2888 })
    expect(await repo.reservarNumeroGuia('TTT1', 'PRUEBA', id)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya está confirmada para producción') })
  })

  it('corregir el correlativo pide motivo y no baja de un número ya usado', async () => {
    const { id } = await salidaConforme()
    await repo.confirmarCorrelativoGuia('TTT1', 100, undefined, JT)
    expect(await repo.corregirCorrelativoGuia('TTT1', 109, ' ', JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Cuenta por qué') })
    expect(await repo.corregirCorrelativoGuia('TTT1', 109, 'Se emitieron 100 a 109 desde el panel', JT)).toMatchObject({ ok: true })
    expect(await repo.estadoNumeracionGuia('TTT1')).toMatchObject({ ultimo: 109, proximo: 110, confirmado: true })
    void id
  })
})

describe('guía dada de baja en el panel de Nubefact (demo + simulador)', () => {
  it('consultar la guía la encuentra anulada: queda anulada en el WMS con su motivo y Pedidos recibe el aviso', async () => {
    const { id } = await salidaConforme()
    const e = await emitirGuiaElectronica(id, traslado, JT)
    if (!e.ok) throw new Error(e.mensaje)
    const guia = (await repo.paqueteSalida(id))!.guia!
    anularEnPanelSimulado(guia.numero)
    const r = await consultarEstadoGuia(guia.id, guia.numero, id, JT)
    expect(r).toMatchObject({ ok: true, estadoSunat: 'ANULADA' })
    const p = (await repo.paqueteSalida(id))!
    expect(p.guia).toBeUndefined()
    expect(p.guiasAnuladas[0]).toMatchObject({ numero: guia.numero, anuladaMotivo: expect.stringContaining('panel de Nubefact') })
    const ev = await repo.eventosPedidos({ salidaId: id })
    expect(ev.some((x) => x.tipo === 'GUIA_ANULADA')).toBe(true)
  })
})
