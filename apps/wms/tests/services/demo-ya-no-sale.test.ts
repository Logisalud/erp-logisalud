// «Ya no sale» en la demostración (migración 0064): la misma regla que la base de datos, con las mismas palabras.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { actorDemo as actor, imprimirYConformar } from './ayudas-orden'

const JT = actor('jefe_transporte', 'jefe_transporte', 'jefe_almacen'); const AUX = actor('auxiliar', 'auxiliar'); const SANDRA = actor('asistente_dt', 'asistente_dt', 'conformidad_despacho')
const OTRO = actor('jefe_almacen', 'jefe_almacen', 'auxiliar')

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})
const salida101 = async () => {
  const b = await repo.bandejaPedidos()
  const n = b.pedidos.find((p) => p.numero === 'PED-DEMO-101')!.salida!
  return (await repo.listarSalidas()).find((s) => s.numero === n)!
}

describe('«Ya no sale» (demo)', () => {
  it('con la orden ya pickeada y su pre-guía: cancela la pre-guía, deja lo pickeado por devolver y, verificada la devolución, la orden se cancela sola y el pedido vuelve a la bandeja', async () => {
    const s = await salida101()
    await imprimirYConformar(repo, s.id, { jt: JT, picker: AUX, conforme: SANDRA })
    const pre = await repo.crearPreGuia(s.id, 'TTT1', 'PRUEBA')
    expect(pre.ok).toBe(true)
    const r = await repo.yaNoSale(s.id, 'El vendedor avisó que el cliente canceló', true, JT)
    expect(r).toMatchObject({ ok: true, cancelada: false, preGuia: expect.stringMatching(/^TTT1-\d{8}$/) })
    expect((r as { porDevolver: number }).porDevolver).toBeGreaterThan(0)
    expect((await repo.preGuiaDe(s.id))?.estado).toBe('CANCELADA')
    expect(await repo.obtenerSalida(s.id)).toMatchObject({ etapa: 'POR_DEVOLVER_PICKING', cancelacionPendiente: true })
    expect(await repo.yaNoSale(s.id, 'Otra vez el mismo', true, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya está por cancelarse') })
    expect((await repo.listarAlertas()).some((a) => a.tipo === 'DEVOLUCION_PICKING' && /ya no sale/.test(a.mensaje))).toBe(true)
    await repo.ejecutarDevolucionPicking(s.id, AUX)
    expect(await repo.verificarDevolucionPicking(s.id, OTRO)).toMatchObject({ ok: true })
    expect(await repo.obtenerSalida(s.id)).toMatchObject({ estado: 'CANCELADA' })
    expect((await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-101')?.salida).toBeUndefined()      // vuelve a la bandeja
  })

  it('sin picking la orden se cancela de una vez; sin rehacer se avisa al Jefe de Transporte para que el área comercial cancele el pedido', async () => {
    const s = await salida101()
    const r = await repo.yaNoSale(s.id, 'Se cancela el pedido completo', false, JT)
    expect(r).toMatchObject({ ok: true, cancelada: true, porDevolver: 0 })
    expect((await repo.obtenerSalida(s.id))!.estado).toBe('CANCELADA')
    expect((await repo.listarAlertas()).find((a) => a.tipo === 'PEDIDO_CANCELADO' && /cancele en Pedidos/.test(a.mensaje))).toBeTruthy()
  })

  it('pide motivo y permiso, y una orden abierta; con guía registrada pide anularla primero', async () => {
    const s = await salida101()
    expect(await repo.yaNoSale(s.id, 'no', true, JT)).toMatchObject({ ok: false, mensaje: 'Cuenta por qué ya no sale (al menos 5 letras)' })
    expect(await repo.yaNoSale(s.id, 'Motivo suficiente', true, AUX)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para cancelar una salida' })
    await repo.yaNoSale(s.id, 'Motivo suficiente', true, JT)
    expect(await repo.yaNoSale(s.id, 'Motivo suficiente', true, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya no está abierta') })
  })
})
