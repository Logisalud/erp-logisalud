// Guía de remisión y paquete documental del modo demostración: mismas reglas que la migración 0019.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const JT = actor('jt', 'jefe_transporte', 'jefe_almacen'); const AUX = actor('aux', 'auxiliar'); const SANDRA = actor('sandra', 'asistente_dt', 'conformidad_despacho')

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

/** La salida del pedido 101 con picking y conformidad completos. */
async function salidaConforme(conformar = true) {
  const [res] = await repo.listarSalidas()
  const o = await repo.generarOrdenPicking(res.id, JT)
  if (!o.ok) throw new Error(o.mensaje)
  const orden = (await repo.obtenerOrdenPicking(o.id))!
  for (const l of orden.lineasDetalle) await repo.registrarPicking(l.id, 'PICKEADA', undefined, AUX)
  if (conformar) for (const l of orden.lineasDetalle) await repo.darConformidad(l.id, 'CONFORME', undefined, undefined, SANDRA)
  return res.id
}

describe('guía de remisión (demo)', () => {
  it('no se registra hasta que todo el pedido está conforme; luego guarda lo confirmado y no se repite', async () => {
    const id = await salidaConforme(false)
    expect(await repo.registrarGre(id, 'T001-00001234', undefined, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('cuando todo el pedido tiene la conformidad') })
    const orden = (await repo.obtenerOrdenPicking((await repo.obtenerSalida(id))!.ordenPickingId!))!
    for (const l of orden.lineasDetalle) await repo.darConformidad(l.id, 'CONFORME', undefined, undefined, SANDRA)
    for (const mal of ['1234', 'T001', 'T0-1']) expect(await repo.registrarGre(id, mal, undefined, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('serie, guion y número') })
    expect(await repo.registrarGre(id, 'T001-00001234', undefined, AUX)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para registrar la guía de remisión' })
    const r = await repo.registrarGre(id, ' t001-00001234 ', 'Entregada a Charlie', JT)
    expect(r).toMatchObject({ ok: true })
    const p = (await repo.paqueteSalida(id))!
    expect(p.guia).toMatchObject({ numero: 'T001-00001234', nota: 'Entregada a Charlie' })
    expect(p.guia!.lineas.map((l) => l.cantidad).reduce((a, b) => a + b, 0)).toBe(26)
    expect(await repo.registrarGre(id, 'T001-00001235', undefined, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya tiene una guía registrada') })
    expect((await repo.listarSalidas())[0]).toMatchObject({ guia: 'T001-00001234' })
  })

  it('se anula con motivo, la historia queda y se puede registrar la correcta (el número anulado queda libre)', async () => {
    const id = await salidaConforme()
    const r = await repo.registrarGre(id, 'T002-00000010', undefined, JT)
    if (!r.ok) throw new Error(r.mensaje)
    expect(await repo.anularGre(r.id, '  ', JT)).toMatchObject({ ok: false, mensaje: 'Cuenta por qué se anula la guía' })
    expect(await repo.anularGre(r.id, 'Error de digitación', AUX)).toMatchObject({ ok: false })
    expect(await repo.anularGre(r.id, 'Error de digitación', JT)).toMatchObject({ ok: true })
    expect(await repo.anularGre(r.id, 'otra vez', JT)).toMatchObject({ ok: false, mensaje: 'Esa guía ya está anulada' })
    expect(await repo.registrarGre(id, 'T002-00000010', undefined, JT)).toMatchObject({ ok: true })
    const p = (await repo.paqueteSalida(id))!
    expect(p.guiasAnuladas).toEqual([expect.objectContaining({ numero: 'T002-00000010', anuladaMotivo: 'Error de digitación' })])
    expect(p.guia).toBeTruthy()
  })
})

describe('paquete documental (demo)', () => {
  it('lista los lotes que salen con lo que pide el cliente, y la última conformidad avisa UNA vez si falta algo', async () => {
    const id = await salidaConforme()
    const p = (await repo.paqueteSalida(id))!
    expect(p.items.length).toBeGreaterThanOrEqual(2)
    expect(p.items.every((i) => i.requisitos.length === 3)).toBe(true)
    expect(p.copias).toBeGreaterThanOrEqual(1)
    const alertas = (await repo.listarAlertas?.() ?? []) as { tipo: string }[]
    const hay = p.completo ? 0 : 1
    expect(alertas.filter((a) => a.tipo === 'DOCUMENTACION_INCOMPLETA')).toHaveLength(hay)
    expect(p.faltantes.length > 0).toBe(!p.completo)
  })
})
