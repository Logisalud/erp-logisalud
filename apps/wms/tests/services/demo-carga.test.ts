// Carga, conciliación, liberar la unidad y salida confirmada del modo demostración: mismas reglas que la migración 0021.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'
import { aProvincia, imprimirYConformar } from './ayudas-orden'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const JT = actor('jt', 'jefe_transporte', 'jefe_almacen'); const AUX = actor('auxiliar', 'auxiliar'); const SANDRA = actor('sandra', 'asistente_dt', 'conformidad_despacho')
const CHECK = [{ item: 'Vehículo limpio', ok: true, nota: '' }, { item: 'Termómetro', ok: true, nota: '' }]

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})
const stockTotal = async () => (await repo.panorama()).saldos.reduce((t, x) => t + x.cantidad, 0)

/** El pedido 101 listo para carga: picking, conformidad, COA cargados, guía y embalaje en 2 bultos. */
async function pedidoListo() {
  const [res] = await repo.listarSalidas()
  aProvincia(res.id)                                  // el pedido 101 va a Lima: aquí se prueba el camino con embalaje
  await imprimirYConformar(repo, res.id, { jt: JT, picker: AUX, conforme: SANDRA, bultos: 2 })
  const pq = (await repo.paqueteSalida(res.id))!
  const archivos = pq.items.map((i) => ({ nombre: `COA_${i.lote}.pdf`, hash: `h-${i.lote}`, bytes: 1000, ref: `demo/${i.lote}.pdf` }))
  await repo.cargarCoaEnBloque(archivos, SANDRA)
  await repo.registrarGre(res.id, 'T001-00000077', undefined, JT)
  const e = (await repo.embalajeSalida(res.id))!
  const [a, b] = e.porEmbalar
  await repo.embalarSalida(res.id, [
    { contenido: [{ lineaId: a.lineaId, loteId: a.loteId, cantidad: a.cantidad - 1 }, { lineaId: b.lineaId, loteId: b.loteId, cantidad: b.cantidad }] },
    { contenido: [{ lineaId: a.lineaId, loteId: a.loteId, cantidad: 1 }] },
  ], AUX)
  const ruta = (await repo.colaCarga())[0]
  return { salidaId: res.id, rutaId: ruta.rutaId }
}

describe('carga y salida (demo)', () => {
  it('el pedido queda «Lista para carga»; se carga por código, se concilia, se libera la unidad y SOLO al confirmar la salida el stock baja (una vez)', async () => {
    const { salidaId, rutaId } = await pedidoListo()
    expect((await repo.obtenerSalida(salidaId))!.etapa).toBe('LISTA_PARA_CARGA')
    const c0 = (await repo.cargaRuta(rutaId))!
    expect(c0).toMatchObject({ estado: 'EN_CARGA', bultosEsperados: 2, bultosCargados: 0 })
    expect(c0.motivosNoLiberar).toEqual(expect.arrayContaining(['Falta el checklist del vehículo', 'Faltan 2 bultos por cargar: cárgalos o deja ese pedido fuera de la salida']))
    const [b1, b2] = c0.pedidosDetalle[0].bultos.map((b) => b.codigo)
    expect(await repo.cargarBulto(rutaId, b1.toLowerCase(), AUX)).toMatchObject({ ok: true, resultado: 'CARGADO' })
    expect(await repo.cargarBulto(rutaId, b1, AUX)).toMatchObject({ ok: true, resultado: 'YA_CARGADO' })
    expect(await repo.cargarBulto(rutaId, 'SAL-9999-99999-B1', AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('No encontramos el bulto') })
    expect(await repo.liberarUnidad(rutaId, JT)).toMatchObject({ ok: false, mensaje: 'Falta el checklist del vehículo' })
    expect(await repo.guardarChecklist(rutaId, [{ item: 'x', ok: false, nota: '' }], AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('necesita su nota') })
    await repo.guardarChecklist(rutaId, CHECK, AUX)
    expect(await repo.liberarUnidad(rutaId, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Faltan 1 bulto por cargar') })
    await repo.cargarBulto(rutaId, b2, AUX)
    expect((await repo.obtenerSalida(salidaId))!.etapa).toBe('CARGADA')
    expect(await repo.liberarUnidad(rutaId, AUX)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para liberar la unidad' })
    expect(await repo.liberarUnidad(rutaId, JT)).toMatchObject({ ok: true })
    expect((await repo.cargaRuta(rutaId))!.estado).toBe('LIBERADA')
    expect(await repo.cargarBulto(rutaId, b1, AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya no está en carga') })
    const antes = await stockTotal()
    expect(await repo.confirmarSalidaRuta(rutaId, AUX)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para confirmar la salida' })
    expect(await stockTotal()).toBe(antes)                                    // liberar NO descuenta
    const r = await repo.confirmarSalidaRuta(rutaId, JT)
    expect(r).toMatchObject({ ok: true, reservas: 2 })
    expect(await stockTotal()).toBe(antes - 26)                               // ahora sí: salieron las 26 unidades
    expect((await repo.obtenerSalida(salidaId))!.etapa).toBe('CONFIRMADA')
    expect((await repo.cargaRuta(rutaId))!).toMatchObject({ estado: 'EN_RUTA' })
    expect(await repo.confirmarSalidaRuta(rutaId, JT)).toMatchObject({ ok: true, reservas: 0 })   // idempotente
    expect(await stockTotal()).toBe(antes - 26)
    expect((await repo.registroLsFr(rutaId))!.horaSalida).toBeTruthy()
  })

  it('confirmar sin liberar falla; un bulto que falta: no se libera y el pedido se deja fuera de la salida (con motivo) y su stock no sale', async () => {
    const { salidaId, rutaId } = await pedidoListo()
    expect(await repo.confirmarSalidaRuta(rutaId, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('todavía no está liberada') })
    const [b1] = (await repo.cargaRuta(rutaId))!.pedidosDetalle[0].bultos.map((b) => b.codigo)
    await repo.cargarBulto(rutaId, b1, AUX)
    await repo.guardarChecklist(rutaId, CHECK, AUX)
    expect(await repo.excluirPedido(rutaId, salidaId, 'Se extravió', AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('No tienes permiso') })
    expect(await repo.excluirPedido(rutaId, salidaId, '  ', JT)).toMatchObject({ ok: false })
    expect(await repo.excluirPedido(rutaId, salidaId, 'Se extravió el bulto 2', JT)).toMatchObject({ ok: true })
    expect(await repo.cargarBulto(rutaId, b1, AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('se dejó fuera') })
    expect(await repo.liberarUnidad(rutaId, JT)).toMatchObject({ ok: false, mensaje: 'No queda ningún pedido para despachar en esta ruta' })
  })

  it('con carga viva no se reabre el embalaje; retirando el bulto con motivo, sí', async () => {
    const { salidaId, rutaId } = await pedidoListo()
    const [b1] = (await repo.cargaRuta(rutaId))!.pedidosDetalle[0].bultos.map((b) => b.codigo)
    await repo.cargarBulto(rutaId, b1, AUX)
    expect(await repo.reabrirEmbalaje(salidaId, 'Rehacer', AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('cargados en una ruta') })
    expect(await repo.retirarBulto(rutaId, b1, '  ', AUX)).toMatchObject({ ok: false })
    expect(await repo.retirarBulto(rutaId, b1, 'Se cargó por error', AUX)).toMatchObject({ ok: true })
    expect(await repo.reabrirEmbalaje(salidaId, 'Rehacer', AUX)).toMatchObject({ ok: true })
  })
})
