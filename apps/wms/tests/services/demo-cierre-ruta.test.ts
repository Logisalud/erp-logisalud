// Cierre de ruta con el data logger, impresión registrada y escaneo firmado del LS-FR.43.03 en el modo demostración: mismas reglas que la migración 0027.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const JT = actor('jt', 'jefe_transporte', 'jefe_almacen'); const AUX = actor('aux', 'auxiliar'); const SANDRA = actor('sandra', 'asistente_dt', 'conformidad_despacho'); const KATIA = actor('katia', 'direccion_tecnica')
const CHECK = [{ item: 'Vehículo limpio', ok: true, nota: '' }]
const archivo = (n = 'gsp6.csv') => ({ ref: `demo/${n}`, nombre: n, hash: `h-${n}`, bytes: 2048, tipo: 'text/csv' })
const exito = <T extends { ok: boolean }>(r: T) => { expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); return r as Extract<T, { ok: true }> }

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

/** El pedido 101 hasta «Lista para carga» (mismo recorrido que demo-carga.test.ts). */
async function rutaListaParaCarga() {
  const [res] = await repo.listarSalidas()
  const o = exito(await repo.generarOrdenPicking(res.id, JT))
  const orden = (await repo.obtenerOrdenPicking(o.id))!
  for (const l of orden.lineasDetalle) await repo.registrarPicking(l.id, 'PICKEADA', undefined, AUX)
  for (const l of orden.lineasDetalle) await repo.darConformidad(l.id, 'CONFORME', undefined, undefined, SANDRA)
  const pq = (await repo.paqueteSalida(res.id))!
  await repo.cargarCoaEnBloque(pq.items.map((i) => ({ nombre: `COA_${i.lote}.pdf`, hash: `h-${i.lote}`, bytes: 1000, ref: `demo/${i.lote}.pdf` })), SANDRA)
  await repo.registrarGre(res.id, 'T001-00000077', undefined, JT)
  const e = (await repo.embalajeSalida(res.id))!
  const [a, b] = e.porEmbalar
  await repo.embalarSalida(res.id, [{ contenido: [{ lineaId: a.lineaId, loteId: a.loteId, cantidad: a.cantidad - 1 }, { lineaId: b.lineaId, loteId: b.loteId, cantidad: b.cantidad }] }, { contenido: [{ lineaId: a.lineaId, loteId: a.loteId, cantidad: 1 }] }], AUX)
  return (await repo.colaCarga())[0].rutaId
}
async function rutaEnRuta() {
  const rutaId = await rutaListaParaCarga()
  const c = (await repo.cargaRuta(rutaId))!
  await repo.guardarChecklist(rutaId, CHECK, AUX)
  for (const b of c.pedidosDetalle[0].bultos) await repo.cargarBulto(rutaId, b.codigo, AUX)
  exito(await repo.liberarUnidad(rutaId, JT))
  exito(await repo.confirmarSalidaRuta(rutaId, JT))
  return rutaId
}

describe('LS-FR.43.03: impresión, escaneo y cierre (demo)', () => {
  it('la impresión queda registrada con quién y cuándo; la usan Transporte, Almacén y DT, no un auxiliar', async () => {
    const rutaId = await rutaListaParaCarga()
    expect((await repo.registroLsFr(rutaId))!.impresiones).toEqual([])
    expect(await repo.registrarImpresionLsFr(rutaId, AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/permiso/) })
    expect(exito(await repo.registrarImpresionLsFr(rutaId, JT)).impresiones).toBe(1)
    expect(exito(await repo.registrarImpresionLsFr(rutaId, KATIA)).impresiones).toBe(2)
    const r = (await repo.registroLsFr(rutaId))!
    expect(r.impresiones).toHaveLength(2)
    expect(r.impresiones[0]).toMatchObject({ por: KATIA.nombre, antesDeSalir: true })
    expect(r.usuario).toBeTruthy()
  })

  it('el escaneo firmado se sube desde que la unidad se libera; cambiarlo pide motivo y deja el anterior; se conserva 5 años', async () => {
    const rutaId = await rutaListaParaCarga()
    expect(await repo.subirEscaneoLsFr(rutaId, archivo('firmado.pdf'), undefined, JT)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/liberada/) })
    const c = (await repo.cargaRuta(rutaId))!
    await repo.guardarChecklist(rutaId, CHECK, AUX)
    for (const b of c.pedidosDetalle[0].bultos) await repo.cargarBulto(rutaId, b.codigo, AUX)
    exito(await repo.liberarUnidad(rutaId, JT))
    expect(await repo.subirEscaneoLsFr(rutaId, archivo('firmado.pdf'), undefined, AUX)).toMatchObject({ ok: false })
    const v1 = exito(await repo.subirEscaneoLsFr(rutaId, archivo('firmado.pdf'), undefined, JT))
    expect(v1.version).toBe(1)
    expect(v1.conservarHasta).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number(v1.conservarHasta.slice(0, 4)) - Number((await repo.registroLsFr(rutaId))!.fecha.slice(0, 4))).toBe(5)
    expect(await repo.subirEscaneoLsFr(rutaId, archivo('firmado-2.pdf'), undefined, JT)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/cuenta por qué/) })
    expect(exito(await repo.subirEscaneoLsFr(rutaId, archivo('firmado-2.pdf'), 'Faltaba la firma del conductor', KATIA)).version).toBe(2)
    const r = (await repo.registroLsFr(rutaId))!
    expect(r.escaneos.map((e) => [e.version, e.vigente])).toEqual([[2, true], [1, false]])
    expect((await repo.archivoLsFr(rutaId, 'ESCANEO'))!.nombre).toBe('firmado-2.pdf')
    expect((await repo.archivoLsFr(rutaId, 'ESCANEO', 1))!.nombre).toBe('firmado.pdf')
  })

  it('cerrar la ruta: solo el Jefe de Transporte, solo desde que salió, con el archivo del data logger y la mínima y la máxima', async () => {
    const rutaId = await rutaListaParaCarga()
    expect(await repo.cerrarRuta(rutaId, { tempMin: 17, tempMax: 22, archivo: archivo() }, JT)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/todavía no salió/) })
    const c = (await repo.cargaRuta(rutaId))!
    await repo.guardarChecklist(rutaId, CHECK, AUX)
    for (const b of c.pedidosDetalle[0].bultos) await repo.cargarBulto(rutaId, b.codigo, AUX)
    exito(await repo.liberarUnidad(rutaId, JT))
    exito(await repo.confirmarSalidaRuta(rutaId, JT))
    expect(await repo.cerrarRuta(rutaId, { tempMin: 17, tempMax: 22, archivo: archivo() }, KATIA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Jefe de Transporte/) })
    expect(await repo.cerrarRuta(rutaId, { tempMin: 25, tempMax: 22, archivo: archivo() }, JT)).toMatchObject({ ok: false })
    expect(exito(await repo.cerrarRuta(rutaId, { tempMin: 17.2, tempMax: 22.8, archivo: archivo() }, JT)).fueraDeRango).toBe(false)
    const r = (await repo.registroLsFr(rutaId))!
    expect(r.cierres).toHaveLength(1)
    expect(r.filas[0].temperatura).toBe('17,2 – 22,8 °C')
    expect(r.estado).toBe('COMPLETO')
    expect(await repo.cerrarRuta(rutaId, { tempMin: 17, tempMax: 22, archivo: archivo() }, JT)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya está cerrada/) })
    // con el escaneo firmado, el registro queda archivado
    exito(await repo.subirEscaneoLsFr(rutaId, archivo('firmado.pdf'), undefined, JT))
    expect((await repo.registroLsFr(rutaId))!.estado).toBe('ARCHIVADO')
  })

  it('una temperatura fuera del rango del formato se marca pero no bloquea; corregir el cierre pide motivo y deja la versión anterior', async () => {
    const rutaId = await rutaEnRuta()
    expect(exito(await repo.cerrarRuta(rutaId, { tempMin: 12, tempMax: 27, archivo: archivo() }, JT)).fueraDeRango).toBe(true)
    expect(await repo.corregirCierreRuta(rutaId, { tempMin: 16, tempMax: 24, archivo: archivo('b.csv') }, ' ', JT)).toMatchObject({ ok: false })
    expect(await repo.corregirCierreRuta(rutaId, { tempMin: 16, tempMax: 24, archivo: archivo('b.csv') }, 'Archivo equivocado', AUX)).toMatchObject({ ok: false })
    const v2 = exito(await repo.corregirCierreRuta(rutaId, { tempMin: 16, tempMax: 24, archivo: archivo('b.csv') }, 'Archivo equivocado', JT))
    expect(v2).toMatchObject({ version: 2, fueraDeRango: false })
    const r = (await repo.registroLsFr(rutaId))!
    expect(r.cierres.map((c) => [c.version, c.vigente, c.fueraDeRango])).toEqual([[2, true, false], [1, false, true]])
    expect((await repo.archivoLsFr(rutaId, 'DATA_LOGGER'))!.nombre).toBe('b.csv')
    expect((await repo.archivoLsFr(rutaId, 'DATA_LOGGER', 1))!.nombre).toBe('gsp6.csv')
  })
})
