// Pre-guía en demostración (espejo de tests/db/pre-guia.test.ts): número reservado tras la conformidad, varias a la vez, el envío adopta el número, la cancelada nunca se reutiliza.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { SimuladorNubefact, reiniciarSimuladorNubefact } from '@/services/nubefact/simulador'
import { construirConsulta, construirPayloadNubefact, type TrasladoGuia } from '@/domain/guia-electronica'
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
const conformada = async (indice = 0, conformar = true) => {
  const salidas = await repo.listarSalidas()
  await imprimirYConformar(repo, salidas[indice].id, { jt: JT, picker: AUX, conforme: SANDRA, bultos: 2, conformar })
  return salidas[indice].id
}

describe('pre-guía (demo)', () => {
  it('sin conformidad no se crea', async () => {
    const sin = await conformada(0, false)
    expect(await repo.crearPreGuia(sin, 'TTT1', 'SIMULADOR')).toMatchObject({ ok: false, mensaje: expect.stringMatching(/tiene la conformidad/) })
  })

  it('se crea con la conformidad, reserva un número y es idempotente; sin conformidad no se crea', async () => {
    const id = await conformada(0)
    const r = await repo.crearPreGuia(id, 'TTT1', 'SIMULADOR')
    expect(r).toMatchObject({ ok: true, serie: 'TTT1', nueva: true })
    if (!r.ok) return
    expect(await repo.crearPreGuia(id, 'TTT1', 'SIMULADOR')).toMatchObject({ ok: true, numero: r.numero, nueva: false })
    const pre = (await repo.preGuiaDe(id))!
    expect(pre).toMatchObject({ numero: r.numero, numeroCompleto: `TTT1-${String(r.numero).padStart(8, '0')}`, estado: 'LISTA_PARA_ENVIAR' })   // la demo siembra la ruta con vehículo y conductor
  })

  it('sin ruta no se puede enviar (lo dice claro); la pre-guía aparece en el buscador de guías', async () => {
    const id = await conformada(0)
    await repo.crearPreGuia(id, 'TTT1', 'SIMULADOR')
    const filas = await repo.listarGuias()
    expect(filas.find((f) => f.salidaId === id)).toMatchObject({ preGuia: expect.stringMatching(/PRE_GUIA|LISTA_PARA_ENVIAR/), anulada: false })
  })

  it('el envío adopta el número de su pre-guía y la pre-guía pasa a «enviada»', async () => {
    const id = await conformada(0)
    const pre = await repo.crearPreGuia(id, 'TTT1', 'SIMULADOR'); if (!pre.ok) throw new Error(pre.mensaje)
    const datos = (await repo.datosGuia(id))!
    const n = await repo.reservarNumeroGuia(datos.serie, 'SIMULADOR', id)
    expect(n).toMatchObject({ ok: true, numero: pre.numero, reintento: true })
    if (!n.ok) return
    const payload = construirPayloadNubefact(datos, traslado, '2026-10-19', n.numero)
    const sim = new SimuladorNubefact(); const r = await sim.emitirGuia(payload); if (!r.ok) throw new Error(r.error)
    const reg = await repo.registrarGuiaElectronica(id, r, traslado, payload, JT)
    expect(reg.ok).toBe(true)
    const c = await sim.consultarGuia(construirConsulta(datos.serie, n.numero)); if (c.ok && reg.ok) await repo.actualizarEstadoGuia(reg.id, c, JT)
    expect((await repo.preGuiaDe(id))!.estado).toBe('ENVIADA')
  })

  it('cancelar pasa el número a «sin usar», con motivo, y no se reutiliza', async () => {
    const id = await conformada(0)
    const pre = await repo.crearPreGuia(id, 'TTT1', 'SIMULADOR'); if (!pre.ok) throw new Error(pre.mensaje)
    expect(await repo.cancelarPreGuia(id, '  ')).toMatchObject({ ok: false })
    expect(await repo.cancelarPreGuia(id, 'Se cambió el cliente')).toEqual({ ok: true, cancelada: true })
    expect((await repo.preGuiaDe(id))!).toMatchObject({ estado: 'CANCELADA', motivoCancelacion: 'Se cambió el cliente' })
    expect(await repo.numerosSinUsar('TTT1')).toEqual([expect.objectContaining({ numero: pre.numero, motivo: 'Se cambió el cliente' })])
    const p2 = await repo.crearPreGuia(id, 'TTT1', 'SIMULADOR'); if (!p2.ok) throw new Error(p2.mensaje)     // se vuelve a crear: número NUEVO
    expect(p2.numero).toBeGreaterThan(pre.numero)
    expect((await repo.numerosSinUsar('TTT1')).map((x) => x.numero)).toEqual([pre.numero])
  })
})
