// Sin embalaje y carga por conteo (decisión de Sebas, 11-nov-2026; migración 0061): la demo con WMS_DEMO_EMBALAJE=NO y WMS_DEMO_CARGA_QR=NO sigue las mismas reglas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'
import { imprimirYConformar } from './ayudas-orden'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const JT = actor('jt', 'jefe_transporte', 'jefe_almacen'); const AUX = actor('auxiliar', 'auxiliar'); const SANDRA = actor('sandra', 'asistente_dt', 'conformidad_despacho')
const CHECK = [{ item: 'Vehículo limpio', ok: true, nota: '' }, { item: 'Termómetro', ok: true, nota: '' }]

let repo: RepositorioDemo
beforeEach(() => {
  vi.stubEnv('WMS_DEMO_EMBALAJE', 'NO'); vi.stubEnv('WMS_DEMO_CARGA_QR', 'NO')
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})
afterEach(() => { vi.unstubAllEnvs() })

/** El pedido 101 listo para carga SIN embalar: la conformidad deja sus 3 bultos. */
async function pedidoListo() {
  const [res] = await repo.listarSalidas()
  await imprimirYConformar(repo, res.id, { jt: JT, picker: AUX, conforme: SANDRA, bultos: 3 })
  const pq = (await repo.paqueteSalida(res.id))!
  await repo.cargarCoaEnBloque(pq.items.map((i) => ({ nombre: `COA_${i.lote}.pdf`, hash: `h-${i.lote}`, bytes: 1000, ref: `demo/${i.lote}.pdf` })), SANDRA)
  await repo.registrarGre(res.id, 'T001-00000078', undefined, JT)
  return { salidaId: res.id, rutaId: (await repo.colaCarga())[0].rutaId }
}

describe('sin embalaje y carga por conteo (demo)', () => {
  it('la conformidad deja los bultos, el pedido queda listo para carga sin pasar por «Embalar»', async () => {
    const { salidaId } = await pedidoListo()
    expect((await repo.obtenerSalida(salidaId))!.requiereEmbalaje).toBe(false)
    expect((await repo.embalajeSalida(salidaId))!.bultosVigentes.map((b) => b.secuencia)).toEqual([1, 2, 3])
    expect((await repo.obtenerSalida(salidaId))!.etapa).toBe('LISTA_PARA_CARGA')
    expect(await repo.colaEmbalaje()).toEqual([])
  })

  it('la carga muestra el escaneo apagado; el conteo carga los primeros N, se corrige y la unidad se libera solo con todo contado', async () => {
    const { salidaId, rutaId } = await pedidoListo()
    expect((await repo.cargaRuta(rutaId))!.escaneoQr).toBe(false)
    await repo.guardarChecklist(rutaId, CHECK, AUX)
    expect((await repo.contarBultosCargados(rutaId, salidaId, 2, AUX)).ok).toBe(true)
    let c = (await repo.cargaRuta(rutaId))!
    expect(c.pedidosDetalle[0].bultos.map((b) => b.cargado)).toEqual([true, true, false])
    expect(c.motivosNoLiberar.join(' ')).toMatch(/Faltan 1 bulto por cargar/)
    expect((await repo.liberarUnidad(rutaId, JT)).ok).toBe(false)
    await repo.contarBultosCargados(rutaId, salidaId, 1, AUX)                           // se corrige: eran 1
    c = (await repo.cargaRuta(rutaId))!
    expect(c.pedidosDetalle[0].bultos.map((b) => b.cargado)).toEqual([true, false, false])
    expect(await repo.contarBultosCargados(rutaId, salidaId, 4, AUX)).toMatchObject({ ok: false, mensaje: 'Este pedido tiene 3 bultos: cuenta de 0 a 3' })
    expect(await repo.contarBultosCargados(rutaId, salidaId, 3, actor('nadie'))).toMatchObject({ ok: false, mensaje: 'No tienes permiso para cargar la unidad' })
    await repo.contarBultosCargados(rutaId, salidaId, 3, AUX)
    expect((await repo.liberarUnidad(rutaId, JT)).ok).toBe(true)
    expect((await repo.contarBultosCargados(rutaId, salidaId, 1, AUX)).ok).toBe(false)  // ya no está en carga
  })

  it('el escaneo del QR sigue funcionando en el código (apagado en la pantalla)', async () => {
    const { salidaId, rutaId } = await pedidoListo()
    const [b1] = (await repo.embalajeSalida(salidaId))!.bultosVigentes
    expect(await repo.cargarBulto(rutaId, b1.codigo, AUX)).toMatchObject({ ok: true, resultado: 'CARGADO' })
    expect((await repo.contarBultosCargados(rutaId, salidaId, 3, AUX)).ok).toBe(true)
    expect((await repo.cargaRuta(rutaId))!.pedidosDetalle[0].bultos.every((b) => b.cargado)).toBe(true)
  })
})
