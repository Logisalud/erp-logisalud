// El motor de inventario del modo demostración aplica las mismas reglas que la migración 0007.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

const actor = (rol: Actor['roles'][number]): Actor => ({ id: `demo:${rol}`, nombre: `${rol} (demo)`, roles: [rol] })
const AUX = actor('auxiliar'); const JEFE = actor('jefe_almacen'); const REEMPLAZO = actor('reemplazo_jefe')
const KATIA = actor('direccion_tecnica'); const ADMIN = actor('admin_wms'); const AUDITOR = actor('auditoria_lectura')

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})
/** Saldo Aprobado con stock que no esté en un movimiento ni en un conteo sembrados. */
async function stockLibre(minimo: number) {
  const p = await repo.panorama()
  const usadas = new Set((await repo.listarMovimientos()).flatMap((o) => o.lineas.flatMap((l) => [l.desdePosicionId, l.haciaPosicionId])))
  return { p, s: p.saldos.find((x) => x.estado === 'APROBADO' && x.cantidad >= minimo && !usadas.has(x.posicionId))! }
}
const exito = <T extends { ok: boolean }>(r: T) => { expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); return r as Extract<T, { ok: true }> }

describe('Kardex e historia', () => {
  it('cada saldo del demo arranca con su carga inicial y el saldo final coincide con el stock', async () => {
    const p = await repo.panorama()
    const prod = p.productos[0]
    const k = await repo.kardex({ productoId: prod.id })
    const stock = p.saldos.filter((s) => s.productoId === prod.id).reduce((n, s) => n + s.cantidad, 0)
    expect(k.length).toBeGreaterThan(0)
    expect(k.every((f) => f.tipoDocumento === 'Carga inicial')).toBe(true)
    expect(k[k.length - 1].saldo).toBe(stock)
  })
  it('un movimiento interno no entra al Kardex pero sí a la historia del lote', async () => {
    const [orden] = await repo.listarMovimientos()
    const o = (await repo.listarMovimientos()).find((x) => x.estado === 'AUTORIZADO')!
    expect(orden).toBeTruthy()
    exito(await repo.ejecutarMovimiento(o.id, AUX))
    exito(await repo.confirmarMovimiento(o.id, REEMPLAZO))
    const lote = o.lineas[0].loteId
    const p = await repo.panorama()
    const productoId = p.lotes.find((l) => l.id === lote)!.productoId
    const kardex = await repo.kardex({ productoId, loteId: lote })
    expect(kardex.map((f) => f.tipoDocumento)).toEqual(['Carga inicial'])
    const h = await repo.historiaLote(lote)
    expect(h.map((x) => x.tipo)).toEqual(['CARGA_INICIAL', 'MOVIMIENTO', 'MOVIMIENTO'])
    expect(h[1]).toMatchObject({ preparador: 'Auxiliar de almacén (demo)', verificador: 'Reemplazo del Jefe de Almacén (demo)' })
  })
})

describe('movimientos internos (D-15)', () => {
  it('quien preparó o movió no verifica; otra persona sí, y el stock se mueve recién al confirmar', async () => {
    const o = (await repo.listarMovimientos()).find((x) => x.estado === 'AUTORIZADO')!
    const antes = (await repo.panorama()).saldos.filter((s) => s.loteId === o.lineas[0].loteId && s.posicionId === o.lineas[0].desdePosicionId).reduce((n, s) => n + s.cantidad, 0)
    exito(await repo.ejecutarMovimiento(o.id, JEFE))
    expect(await repo.confirmarMovimiento(o.id, JEFE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ejecutó/) })
    expect(await repo.confirmarMovimiento(o.id, AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/preparó/) })
    expect((await repo.panorama()).saldos.filter((s) => s.loteId === o.lineas[0].loteId && s.posicionId === o.lineas[0].desdePosicionId).reduce((n, s) => n + s.cantidad, 0)).toBe(antes)
    exito(await repo.confirmarMovimiento(o.id, REEMPLAZO))
    expect((await repo.panorama()).saldos.filter((s) => s.loteId === o.lineas[0].loteId && s.posicionId === o.lineas[0].desdePosicionId).reduce((n, s) => n + s.cantidad, 0)).toBe(antes - o.lineas[0].cantidad)
  })
  it('solo el Jefe autoriza y sin autorizar no se mueve', async () => {
    const o = (await repo.listarMovimientos()).find((x) => x.estado === 'PREPARADO')!
    expect(await repo.autorizarMovimiento(o.id, AUX)).toMatchObject({ ok: false })
    expect(await repo.ejecutarMovimiento(o.id, AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/autorizado/) })
    exito(await repo.autorizarMovimiento(o.id, JEFE))
  })
  it('con diferencia queda abierta SOLO esa línea y avisa al Jefe; no se cuadra', async () => {
    const o = (await repo.listarMovimientos()).find((x) => x.estado === 'AUTORIZADO')!
    exito(await repo.ejecutarMovimiento(o.id, AUX))
    const l = o.lineas[0]
    expect(await repo.revisarMovimiento(o.id, [{ lineaId: l.id, resultado: 'DIFERENCIA', nota: '  ' }], REEMPLAZO)).toMatchObject({ ok: false })
    expect(await repo.revisarMovimiento(o.id, [], REEMPLAZO)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Revisa las 1 líneas/) })
    exito(await repo.revisarMovimiento(o.id, [{ lineaId: l.id, resultado: 'DIFERENCIA', nota: 'Faltan 2 cajas' }], REEMPLAZO))
    expect((await repo.obtenerMovimiento(o.id))!.estado).toBe('CON_DIFERENCIA')
    expect((await repo.listarAlertas()).some((a) => a.tipo === 'MOVIMIENTO_CON_DIFERENCIA' && a.estado === 'ABIERTA')).toBe(true)
    exito(await repo.resolverMovimiento(l.id, 'REINTENTAR', 'Se vuelve a mover', JEFE))
    expect((await repo.obtenerMovimiento(o.id))!.estado).toBe('AUTORIZADO')
  })
  it('un movimiento de varias líneas: una diferencia no frena a las demás', async () => {
    const { p, s } = await stockLibre(1)
    void s
    const destinos = p.posiciones.filter((x) => x.tipoArea === 'APROBADOS' && x.activa && !p.saldos.some((q) => q.posicionId === x.id))
    const usadas = new Set((await repo.listarMovimientos()).flatMap((o) => o.lineas.flatMap((l) => [l.desdePosicionId, l.haciaPosicionId])))
    const origen = p.posiciones.find((x) => x.tipoArea === 'APROBADOS' && !usadas.has(x.id) && p.saldos.filter((q) => q.posicionId === x.id && q.estado === 'APROBADO').length >= 1)!
    const celdas = p.saldos.filter((q) => q.posicionId === origen.id && q.estado === 'APROBADO')
    const destino = destinos.find((d) => p.asignaciones.some((a) => a.posicionId === d.id && a.propietarioId === celdas[0].propietarioId) && !usadas.has(d.id))!
    const lineas = celdas.filter((c) => c.propietarioId === celdas[0].propietarioId).map((c) => ({ desdePosicionId: c.posicionId, haciaPosicionId: destino.id, loteId: c.loteId, estado: c.estado, procedenciaId: c.procedenciaId, cantidad: c.cantidad }))
    const r = exito(await repo.prepararMovimiento(lineas, 'Mover todo', AUX))
    exito(await repo.autorizarMovimiento(r.id, JEFE))
    exito(await repo.ejecutarMovimiento(r.id, AUX))
    const o = (await repo.obtenerMovimiento(r.id))!
    const revision = o.lineas.map((l, i) => i === 0 && o.lineas.length > 1 ? { lineaId: l.id, resultado: 'DIFERENCIA' as const, nota: 'Falta una caja' } : { lineaId: l.id, resultado: 'COINCIDE' as const })
    const res = exito(await repo.revisarMovimiento(r.id, revision, REEMPLAZO))
    expect(res.confirmadas).toBe(o.lineas.length > 1 ? o.lineas.length - 1 : o.lineas.length)
    const despues = await repo.obtenerMovimiento(r.id)
    expect(despues!.estado).toBe(o.lineas.length > 1 ? 'CON_DIFERENCIA' : 'CONFIRMADO')
  })
  it('prepara un movimiento nuevo y rechaza reservar dos veces o ir a una zona que no corresponde', async () => {
    const { p, s } = await stockLibre(30)
    const libre = p.posiciones.find((x) => x.tipoArea === 'APROBADOS' && x.activa && !p.saldos.some((q) => q.posicionId === x.id) && p.asignaciones.some((a) => a.posicionId === x.id && a.propietarioId === s.propietarioId))
    const cuarentena = p.posiciones.find((x) => x.tipoArea === 'CUARENTENA')!
    const linea = (hacia: string, cantidad: number) => ({ desdePosicionId: s.posicionId, haciaPosicionId: hacia, loteId: s.loteId, estado: s.estado, procedenciaId: s.procedenciaId, cantidad })
    if (libre) {
      const r = exito(await repo.prepararMovimiento([linea(libre.id, 5)], 'Acomodo', AUX))
      expect(r.numero).toMatch(/^MI-\d{4}-\d{5}$/)
      expect(await repo.prepararMovimiento([linea(libre.id, s.cantidad)], 'Acomodo', AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/No hay suficientes unidades/) })
    }
    expect(await repo.prepararMovimiento([linea(cuarentena.id, 1)], 'Acomodo', AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/no admite/) })
    expect(await repo.prepararMovimiento([linea(cuarentena.id, 1)], '', AUX)).toMatchObject({ ok: false })
    expect(await repo.prepararMovimiento([linea(cuarentena.id, 1)], 'x', AUDITOR)).toMatchObject({ ok: false })
  })
})

describe('conteos y ajustes (INV-05)', () => {
  async function conteo() {
    const { p, s } = await stockLibre(10)
    const c = exito(await repo.programarConteo([s.posicionId], 'Semana 41', JEFE))
    const det = (await repo.obtenerConteo(c.id, AUX))!
    return { c, s, linea: det.lineas.find((l) => l.lote === p.lotes.find((q) => q.id === s.loteId)!.codigo)! ?? det.lineas[0] }
  }
  it('el contador no ve el saldo; el Jefe lo ve recién tras el primer conteo; el 2.º conteo es de otra persona', async () => {
    const { c, linea } = await conteo()
    expect(linea.cantidadSistema).toBeUndefined()
    expect((await repo.obtenerConteo(c.id, JEFE))!.lineas[0].cantidadSistema).toBeUndefined()
    expect(exito(await repo.registrarConteo(linea.id, 1, AUX)).resultado).toBe('PENDIENTE_RECONTEO')
    expect((await repo.obtenerConteo(c.id, AUX))!.lineas.find((l) => l.id === linea.id)).toMatchObject({ cantidadSistema: undefined, miConteo: 1, conteo1: undefined })
    expect((await repo.obtenerConteo(c.id, JEFE))!.lineas.find((l) => l.id === linea.id)!.cantidadSistema).toBeGreaterThan(1)
    expect(await repo.registrarConteo(linea.id, 1, AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/otra persona/) })
    expect(exito(await repo.registrarConteo(linea.id, 1, REEMPLAZO)).resultado).toBe('DIFERENCIA_CONFIRMADA')
  })
  it('un ajuste exige causa, lo propone el Jefe y lo autoriza Dirección Técnica; sin eso el saldo no cambia', async () => {
    const { c, s, linea } = await conteo()
    const total = () => repo.panorama().then((p) => p.saldos.filter((x) => x.loteId === s.loteId).reduce((n, x) => n + x.cantidad, 0))
    const antes = await total()
    exito(await repo.registrarConteo(linea.id, 1, AUX))
    exito(await repo.registrarConteo(linea.id, 1, REEMPLAZO))
    expect(await repo.cerrarConteo(c.id, undefined, undefined, JEFE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/sin resolver/) })
    expect(await repo.proponerAjuste(linea.id, 'Ajustar', JEFE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/causa/) })
    exito(await repo.registrarCausaConteo(linea.id, 'Despacho sin registrar', JEFE))
    const aj = exito(await repo.proponerAjuste(linea.id, 'Ajustar con evidencia', JEFE))
    expect(await total()).toBe(antes)
    expect(await repo.decidirAjuste(aj.id, 'AUTORIZAR', undefined, JEFE)).toMatchObject({ ok: false })
    exito(await repo.decidirAjuste(aj.id, 'AUTORIZAR', 'Conforme', KATIA))
    expect(await total()).toBeLessThan(antes)
    const k = await repo.kardex({ productoId: s.productoId, loteId: s.loteId })
    expect(k.map((f) => f.tipoDocumento)).toContain('Ajuste autorizado')
    exito(await repo.cerrarConteo(c.id, 'Despacho sin registrar', 'Ajuste autorizado', JEFE))
    expect((await repo.obtenerConteo(c.id, JEFE))!.conteo.resultado).toBe('CORREGIDO')
  })
  it('una ubicación en conteo no se mueve', async () => {
    const { s } = await conteo()
    const p = await repo.panorama()
    const libre = p.posiciones.find((x) => x.tipoArea === 'APROBADOS' && x.activa && !p.saldos.some((q) => q.posicionId === x.id) && p.asignaciones.some((a) => a.posicionId === x.id && a.propietarioId === s.propietarioId))
    if (!libre) return
    expect(await repo.prepararMovimiento([{ desdePosicionId: s.posicionId, haciaPosicionId: libre.id, loteId: s.loteId, estado: s.estado, procedenciaId: s.procedenciaId, cantidad: 1 }], 'x', AUX))
      .toMatchObject({ ok: false, mensaje: expect.stringMatching(/está en conteo/) })
  })
})

describe('carga inicial (D-09)', () => {
  const fila = (extra: object = {}) => ({ producto: 'DEMO-001', lote: 'CI-1', vence: '2029-05-31', propietario: 'LOGISSA', posicion: 'A-6', estado: 'CUARENTENA', cantidad: '10', ...extra })
  it('solo administración carga; la vista previa explica cada error', async () => {
    expect(await repo.validarCargaInicial([fila()], AUX)).toEqual([{ fila: 0, error: expect.stringMatching(/permiso/) }])
    const errores = await repo.validarCargaInicial([fila(), fila({ producto: 'NO-EXISTE' }), fila({ cantidad: '0' })], ADMIN)
    expect(errores.map((x) => x.fila)).toEqual([2, 3])
  })
  it('no se confirma sin la decisión de Dirección Técnica; con ella suma al stock y al Kardex', async () => {
    const c = exito(await repo.crearCargaInicial([fila()], 'Inventario general', ADMIN))
    expect(await repo.confirmarCargaInicial(c.id, ADMIN)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Falta la decisión de Dirección Técnica/) })
    expect(await repo.decidirEstadoCargaInicial('CUARENTENA', ADMIN)).toMatchObject({ ok: false })
    exito(await repo.decidirEstadoCargaInicial('CUARENTENA', KATIA))
    exito(await repo.confirmarCargaInicial(c.id, ADMIN))
    const p = await repo.panorama()
    const lote = p.lotes.find((l) => l.codigo === 'CI-1')!
    expect(p.saldos.filter((s) => s.loteId === lote.id).reduce((n, s) => n + s.cantidad, 0)).toBe(10)
    expect((await repo.kardex({ productoId: lote.productoId, loteId: lote.id })).map((f) => f.saldo)).toEqual([10])
    expect(await repo.confirmarCargaInicial(c.id, ADMIN)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya no está en borrador/) })
  })
  it('una fila en otro estado que el decidido se rechaza', async () => {
    const c = exito(await repo.crearCargaInicial([fila({ posicion: 'A-6', estado: 'CUARENTENA' })], undefined, ADMIN))
    exito(await repo.decidirEstadoCargaInicial('APROBADO', KATIA))
    expect(await repo.confirmarCargaInicial(c.id, ADMIN)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/decidió APROBADO/) })
  })
})
