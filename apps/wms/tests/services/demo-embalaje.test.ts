// Embalaje en bultos del modo demostración: mismas reglas que la migración 0020.
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

async function salidaConforme(conformar = true) {
  const [res] = await repo.listarSalidas()
  const o = await repo.generarOrdenPicking(res.id, JT)
  if (!o.ok) throw new Error(o.mensaje)
  const orden = (await repo.obtenerOrdenPicking(o.id))!
  for (const l of orden.lineasDetalle) await repo.registrarPicking(l.id, 'PICKEADA', undefined, AUX)
  if (conformar) for (const l of orden.lineasDetalle) await repo.darConformidad(l.id, 'CONFORME', undefined, undefined, SANDRA)
  return res.id
}
const todoEnUno = (e: NonNullable<Awaited<ReturnType<RepositorioDemo['embalajeSalida']>>>) => [{ contenido: e.porEmbalar.map((p) => ({ lineaId: p.lineaId, loteId: p.loteId, cantidad: p.cantidad })) }]

describe('embalaje (demo)', () => {
  it('solo con todo conforme; reparte lo confirmado en bultos «1 de 2» con su código; una sola vez', async () => {
    const id = await salidaConforme(false)
    const antes = (await repo.embalajeSalida(id))!
    expect(antes.conforme).toBe(false)
    expect(await repo.embalarSalida(id, [], AUX)).toMatchObject({ ok: false, mensaje: 'El embalaje empieza cuando todo el pedido tiene la conformidad' })
    const orden = (await repo.obtenerOrdenPicking((await repo.obtenerSalida(id))!.ordenPickingId!))!
    for (const l of orden.lineasDetalle) await repo.darConformidad(l.id, 'CONFORME', undefined, undefined, SANDRA)
    const e = (await repo.embalajeSalida(id))!
    expect(e.conforme).toBe(true)
    expect(e.porEmbalar.map((x) => x.cantidad).reduce((a, b) => a + b, 0)).toBe(26)
    expect(await repo.embalarSalida(id, todoEnUno(e), SANDRA)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para embalar' })
    const [a, b] = e.porEmbalar
    const r = await repo.embalarSalida(id, [
      { contenido: [{ lineaId: a.lineaId, loteId: a.loteId, cantidad: a.cantidad - 2 }, { lineaId: b.lineaId, loteId: b.loteId, cantidad: b.cantidad }] },
      { contenido: [{ lineaId: a.lineaId, loteId: a.loteId, cantidad: 2 }] },
    ], AUX)
    expect(r).toMatchObject({ ok: true, bultos: 2 })
    const hecho = (await repo.embalajeSalida(id))!
    expect(hecho.bultosVigentes.map((x) => `${x.secuencia}/${x.total}:${x.codigo}`)).toEqual([expect.stringMatching(/^1\/2:SAL-\d{4}-00001-B1$/), expect.stringMatching(/^2\/2:SAL-\d{4}-00001-B2$/)])
    expect(await repo.embalarSalida(id, todoEnUno(e), AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya está embalado') })
    expect(await repo.bultoPorCodigo(hecho.bultosVigentes[1].codigo.toLowerCase())).toMatchObject({ unidades: 2 })
    expect((await repo.colaEmbalaje())[0]).toMatchObject({ bultos: 2 })
  })

  it('no sobra ni falta una unidad, ningún bulto va vacío', async () => {
    const id = await salidaConforme()
    const e = (await repo.embalajeSalida(id))!
    const [a] = e.porEmbalar
    expect(await repo.embalarSalida(id, [{ contenido: [{ lineaId: a.lineaId, loteId: a.loteId, cantidad: a.cantidad }] }], AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Faltan') })
    expect(await repo.embalarSalida(id, [...todoEnUno(e), { contenido: [] }], AUX)).toMatchObject({ ok: false, mensaje: 'El bulto 2 está vacío' })
    expect((await repo.embalajeSalida(id))!.bultosVigentes).toHaveLength(0)
  })

  it('reabrir pide motivo, anula los bultos (historia) y deja volver a embalar; la guía y el embalaje solos no bastan para «Lista para carga»', async () => {
    const id = await salidaConforme()
    const e = (await repo.embalajeSalida(id))!
    expect(await repo.reabrirEmbalaje(id, 'x', AUX)).toMatchObject({ ok: false, mensaje: 'Este pedido no está embalado' })
    await repo.embalarSalida(id, todoEnUno(e), AUX)
    expect(await repo.reabrirEmbalaje(id, '  ', AUX)).toMatchObject({ ok: false, mensaje: 'Cuenta por qué se reabre el embalaje' })
    expect(await repo.reabrirEmbalaje(id, 'x', SANDRA)).toMatchObject({ ok: false })
    expect((await repo.obtenerSalida(id))!.etapa).toBe('EMBALADA')           // embalada, falta la documentación
    expect(await repo.registrarGre(id, 'T001-00000009', undefined, JT)).toMatchObject({ ok: true })
    expect((await repo.obtenerSalida(id))!.etapa).toBe('EMBALADA')           // la guía sola no alcanza: faltan los COA
    expect(await repo.reabrirEmbalaje(id, 'Se partió una caja', AUX)).toMatchObject({ ok: true })
    const h = (await repo.embalajeSalida(id))!
    expect(h.bultosVigentes).toHaveLength(0)
    expect(h.bultosAnulados).toEqual([expect.objectContaining({ estado: 'ANULADO', anuladoMotivo: 'Se partió una caja' })])
    expect(await repo.embalarSalida(id, todoEnUno(h), AUX)).toMatchObject({ ok: true })
  })
})
