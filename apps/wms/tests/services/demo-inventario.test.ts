// El motor de inventario del modo demostración aplica las mismas reglas que la migración 0007.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { posicionAcepta } from '@/domain/zonas'
import type { Actor } from '@/services/repositorio'

const actor = (rol: Actor['roles'][number]): Actor => ({ id: `demo:${rol}`, nombre: `${rol} (demo)`, roles: [rol] })
const AUX = actor('auxiliar'); const JEFE = actor('jefe_almacen'); const OTRO_AUX: Actor = { id: 'demo:auxiliar-2', nombre: 'Otro auxiliar (demo)', roles: ['auxiliar'] }
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
    const o = (await repo.listarMovimientos()).find((x) => x.ejecutorId === 'demo:jefe_almacen')!
    expect(orden).toBeTruthy()
    exito(await repo.confirmarMovimiento(o.id, OTRO_AUX))
    const lote = o.lineas[0].loteId
    const p = await repo.panorama()
    const productoId = p.lotes.find((l) => l.id === lote)!.productoId
    const kardex = await repo.kardex({ productoId, loteId: lote })
    expect(kardex.map((f) => f.tipoDocumento)).toEqual(['Carga inicial'])
    const h = await repo.historiaLote(lote)
    expect(h.map((x) => x.tipo)).toEqual(['CARGA_INICIAL', 'MOVIMIENTO', 'MOVIMIENTO'])
    expect(h[1]).toMatchObject({ ejecutor: 'Jefe de Almacén (demo)', verificador: 'auxiliar-2 (demo)', referencia: o.numero })
  })
})

describe('movimientos internos: ejecutar → verificar, dos personas (D-15)', () => {
  const del = async (rol: string) => (await repo.listarMovimientos()).find((x) => x.ejecutorId === `demo:${rol}` && x.estado === 'EJECUTADO')!
  const enOrigen = async (o: { lineas: { loteId: string; desdePosicionId: string }[] }) =>
    (await repo.panorama()).saldos.filter((s) => s.loteId === o.lineas[0].loteId && s.posicionId === o.lineas[0].desdePosicionId).reduce((n, s) => n + s.cantidad, 0)

  it('el ejecutor no verifica su propio movimiento; otra persona sí, y el stock se mueve recién al verificar', async () => {
    const o = await del('jefe_almacen')
    const antes = await enOrigen(o)
    expect(await repo.confirmarMovimiento(o.id, JEFE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/no puede ser quien ejecutó/) })
    expect(await enOrigen(o)).toBe(antes)                                   // ejecutado, pero el stock no cambia todavía
    exito(await repo.confirmarMovimiento(o.id, AUX))                        // otro auxiliar
    expect(await enOrigen(o)).toBe(antes - o.lineas[0].cantidad)
  })
  it('el Jefe también verifica (si no ejecutó); Dirección Técnica y auditoría no', async () => {
    const o = await del('auxiliar')
    expect(await repo.confirmarMovimiento(o.id, KATIA)).toMatchObject({ ok: false })
    expect(await repo.confirmarMovimiento(o.id, AUDITOR)).toMatchObject({ ok: false })
    exito(await repo.confirmarMovimiento(o.id, JEFE))
  })
  it('no hay autorización: el movimiento nace ejecutado y sus unidades quedan reservadas desde ahí', async () => {
    const { p, s } = await stockLibre(30)
    const libre = p.posiciones.find((x) => x.tipoArea === 'APROBADOS' && x.activa && !p.saldos.some((q) => q.posicionId === x.id) && p.asignaciones.some((a) => a.posicionId === x.id && a.propietarioId === s.propietarioId))!
    const r = exito(await repo.ejecutarMovimiento([{ desdePosicionId: s.posicionId, haciaPosicionId: libre.id, loteId: s.loteId, estado: s.estado, procedenciaId: s.procedenciaId, cantidad: 5 }], 'Acomodo', AUX))
    const o = (await repo.obtenerMovimiento(r.id))!
    expect(o).toMatchObject({ estado: 'EJECUTADO', ejecutorId: 'demo:auxiliar' })
    expect(o.verificadorId).toBeUndefined()
    expect((repo as unknown as Record<string, unknown>).autorizarMovimiento).toBeUndefined()
  })
  it('con diferencia queda abierta SOLO esa línea y avisa al Jefe; no se cuadra', async () => {
    const o = await del('auxiliar')
    const l = o.lineas[0]
    expect(await repo.revisarMovimiento(o.id, [{ lineaId: l.id, resultado: 'DIFERENCIA', nota: '  ' }], OTRO_AUX)).toMatchObject({ ok: false })
    expect(await repo.revisarMovimiento(o.id, [], OTRO_AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Revisa las 1 líneas/) })
    exito(await repo.revisarMovimiento(o.id, [{ lineaId: l.id, resultado: 'DIFERENCIA', nota: 'Faltan 2 cajas' }], OTRO_AUX))
    expect((await repo.obtenerMovimiento(o.id))!.estado).toBe('CON_DIFERENCIA')
    expect((await repo.listarAlertas()).some((a) => a.tipo === 'MOVIMIENTO_CON_DIFERENCIA' && a.estado === 'ABIERTA')).toBe(true)
    exito(await repo.resolverMovimiento(l.id, 'REINTENTAR', 'Se vuelve a mover', JEFE))
    expect((await repo.obtenerMovimiento(o.id))!.estado).toBe('EJECUTADO')
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
    const r = exito(await repo.ejecutarMovimiento(lineas, 'Mover todo', AUX))
    const o = (await repo.obtenerMovimiento(r.id))!
    const revision = o.lineas.map((l, i) => i === 0 && o.lineas.length > 1 ? { lineaId: l.id, resultado: 'DIFERENCIA' as const, nota: 'Falta una caja' } : { lineaId: l.id, resultado: 'COINCIDE' as const })
    const res = exito(await repo.revisarMovimiento(r.id, revision, OTRO_AUX))
    expect(res.confirmadas).toBe(o.lineas.length > 1 ? o.lineas.length - 1 : o.lineas.length)
    const despues = await repo.obtenerMovimiento(r.id)
    expect(despues!.estado).toBe(o.lineas.length > 1 ? 'CON_DIFERENCIA' : 'CONFIRMADO')
  })
  it('registra un movimiento nuevo y rechaza reservar dos veces o ir a una zona que no corresponde', async () => {
    const { p, s } = await stockLibre(30)
    const libre = p.posiciones.find((x) => x.tipoArea === 'APROBADOS' && x.activa && !p.saldos.some((q) => q.posicionId === x.id) && p.asignaciones.some((a) => a.posicionId === x.id && a.propietarioId === s.propietarioId))
    const cuarentena = p.posiciones.find((x) => x.tipoArea === 'CUARENTENA')!
    const linea = (hacia: string, cantidad: number) => ({ desdePosicionId: s.posicionId, haciaPosicionId: hacia, loteId: s.loteId, estado: s.estado, procedenciaId: s.procedenciaId, cantidad })
    if (libre) {
      const r = exito(await repo.ejecutarMovimiento([linea(libre.id, 5)], 'Acomodo', AUX))
      expect(r.numero).toMatch(/^MI-\d{4}-\d{5}$/)
      expect(await repo.ejecutarMovimiento([linea(libre.id, s.cantidad)], 'Acomodo', AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/No hay suficientes unidades/) })
    }
    expect(await repo.ejecutarMovimiento([linea(cuarentena.id, 1)], 'Acomodo', AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/no admite/) })
    expect(await repo.ejecutarMovimiento([linea(cuarentena.id, 1)], '', AUX)).toMatchObject({ ok: false })
    expect(await repo.ejecutarMovimiento([linea(cuarentena.id, 1)], 'x', AUDITOR)).toMatchObject({ ok: false })
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
    expect(exito(await repo.registrarConteo(linea.id, 1, OTRO_AUX)).resultado).toBe('DIFERENCIA_CONFIRMADA')
  })
  it('un ajuste exige causa, lo propone el Jefe y lo autoriza Dirección Técnica; sin eso el saldo no cambia', async () => {
    const { c, s, linea } = await conteo()
    const total = () => repo.panorama().then((p) => p.saldos.filter((x) => x.loteId === s.loteId).reduce((n, x) => n + x.cantidad, 0))
    const antes = await total()
    exito(await repo.registrarConteo(linea.id, 1, AUX))
    exito(await repo.registrarConteo(linea.id, 1, OTRO_AUX))
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
    expect(await repo.ejecutarMovimiento([{ desdePosicionId: s.posicionId, haciaPosicionId: libre.id, loteId: s.loteId, estado: s.estado, procedenciaId: s.procedenciaId, cantidad: 1 }], 'x', AUX))
      .toMatchObject({ ok: false, mensaje: expect.stringMatching(/está en conteo/) })
  })
})

describe('carga inicial como cambio de sistema (OS-7, D-110)', () => {
  const fila = (extra: object = {}) => ({ producto: 'DEMO-001', lote: 'CI-1', vence: '2029-05-31', propietario: 'LOGISSA', posicion: 'A-6', estado: 'CUARENTENA', cantidad: '10', ...extra })
  const saldoDe = async (codigoLote: string) => {
    const p = await repo.panorama()
    const lote = p.lotes.find((l) => l.codigo === codigoLote)!
    return { p, lote, saldos: p.saldos.filter((s) => s.loteId === lote.id) }
  }
  /** Una ubicación Aprobada de Logissa y una de Bajas libres de movimientos: sirven de destino de la carga. */
  async function ubicaciones() {
    const p = await repo.panorama()
    const dueno = p.propietarios.find((x) => x.codigo === 'LOGISSA')!
    const de = (area: string) => [...p.posiciones].filter((x) => x.tipoArea === area && x.activa && posicionAcepta(x, dueno.id, p.asignaciones, p.hoy)).sort((a, b) => a.codigo.localeCompare(b.codigo))[0]
    return { aprobados: de('APROBADOS'), cuarentena: de('CUARENTENA'), bajas: de('BAJAS_RECHAZADOS') }
  }

  it('Administración sube y revisa; la vista previa explica cada error, incluido el lote y el vencimiento', async () => {
    expect(await repo.validarCargaInicial([fila()], AUX)).toEqual([{ fila: 0, error: expect.stringMatching(/permiso/) }])
    const errores = await repo.validarCargaInicial([fila(), fila({ lote: 'X2', producto: 'NO-EXISTE' }), fila({ lote: 'X3', cantidad: '0' }), fila({ lote: '' }), fila({ lote: 'X5', vence: '' })], ADMIN)
    expect(errores.map((x) => x.fila)).toEqual([2, 3, 4, 5])
    expect(errores.find((x) => x.fila === 4)!.error).toMatch(/código de lote/)
    expect(errores.find((x) => x.fila === 5)!.error).toMatch(/fecha de vencimiento/)
  })

  it('un estado que no viene de Odoo (Retenido, etc.) no se carga', async () => {
    const e = await repo.validarCargaInicial([fila({ estado: 'DEVOLUCIONES' })], ADMIN)
    expect(e[0].error).toMatch(/no se carga/)
  })

  it('solo Dirección Técnica confirma, con una sola confirmación (sin decidir el estado aparte)', async () => {
    const c = exito(await repo.crearCargaInicial([fila()], 'Inventario general', ADMIN))
    expect(await repo.confirmarCargaInicial(c.id, ADMIN)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Solo Dirección Técnica/) })
    exito(await repo.confirmarCargaInicial(c.id, KATIA))
    const { saldos } = await saldoDe('CI-1')
    expect(saldos.reduce((n, s) => n + s.cantidad, 0)).toBe(10)
    expect(await repo.confirmarCargaInicial(c.id, KATIA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya no está en borrador/) })
    const [lista] = await repo.listarCargasIniciales()
    expect(lista).toMatchObject({ estado: 'CONFIRMADA', confirmadoPor: KATIA.nombre, porEstado: { aprobado: 0, cuarentena: 10, bajas: 0 } })
  })

  it('Cuarentena se queda en Cuarentena, en su ubicación: un solo paso en el libro', async () => {
    const c = exito(await repo.crearCargaInicial([fila({ lote: 'CI-Q' })], undefined, ADMIN))
    exito(await repo.confirmarCargaInicial(c.id, KATIA))
    const { lote, saldos } = await saldoDe('CI-Q')
    expect(saldos).toHaveLength(1)
    expect(saldos[0]).toMatchObject({ estado: 'CUARENTENA', cantidad: 10 })
    expect((await repo.historiaLote(lote.id)).map((h) => h.tipo)).toEqual(['CARGA_INICIAL'])
  })

  it('Aprobados y Bajas entran por Cuarentena, se liberan (o se dan de baja) y terminan en su ubicación, sin acta organoléptica', async () => {
    const u = await ubicaciones()
    const filas = [
      fila({ lote: 'CI-A', posicion: u.aprobados!.codigo, estado: 'APROBADO', cantidad: '30' }),
      fila({ lote: 'CI-B', posicion: u.bajas!.codigo, estado: 'BAJAS_RECHAZADOS', cantidad: '4' }),
    ]
    expect(await repo.validarCargaInicial(filas, ADMIN)).toEqual([])
    const c = exito(await repo.crearCargaInicial(filas, undefined, ADMIN))
    exito(await repo.confirmarCargaInicial(c.id, KATIA))

    const a = await saldoDe('CI-A')
    expect(a.saldos).toHaveLength(1)
    expect(a.saldos[0]).toMatchObject({ estado: 'APROBADO', cantidad: 30, posicionId: u.aprobados!.id })
    const hA = await repo.historiaLote(a.lote.id)
    expect(hA.map((h) => `${h.tipo}:${h.estado}:${h.delta}`)).toEqual([
      'CARGA_INICIAL:CUARENTENA:30', 'CAMBIO_ESTADO:CUARENTENA:-30', 'CAMBIO_ESTADO:APROBADO:30', 'MOVIMIENTO:APROBADO:-30', 'MOVIMIENTO:APROBADO:30',
    ])
    expect(hA[0].posicion).toBe(u.cuarentena!.codigo)
    expect(hA.at(-1)!.posicion).toBe(u.aprobados!.codigo)
    expect(hA.map((h) => h.saldoLote).at(-1)).toBe(30)

    const b = await saldoDe('CI-B')
    expect(b.saldos[0]).toMatchObject({ estado: 'BAJAS_RECHAZADOS', cantidad: 4, posicionId: u.bajas!.id })
    expect((await repo.historiaLote(b.lote.id))[1].motivo).toMatch(/Baja por carga inicial/)
    // el Kardex cuenta una sola entrada: el ingreso por carga inicial; el resto del recorrido no cambia la cantidad del propietario
    expect((await repo.kardex({ productoId: a.lote.productoId, loteId: a.lote.id })).map((f) => [f.tipoDocumento, f.entrada, f.saldo])).toEqual([['Carga inicial', 30, 30]])
  })

  it('todo lote lleva su vencimiento y un mismo lote no puede tener dos fechas', async () => {
    const c = exito(await repo.crearCargaInicial([fila({ lote: 'CI-V', vence: '2029-05-31' })], undefined, ADMIN))
    exito(await repo.confirmarCargaInicial(c.id, KATIA))
    const e = await repo.validarCargaInicial([fila({ lote: 'CI-V', vence: '2030-01-31' })], ADMIN)
    expect(e[0].error).toMatch(/ya existe con otro vencimiento/)
    const dentro = await repo.validarCargaInicial([fila({ lote: 'CI-W', vence: '2029-05-31' }), fila({ lote: 'CI-W', vence: '2030-01-01', posicion: 'A-7' })], ADMIN)
    expect(dentro.some((x) => /dos vencimientos distintos/.test(x.error))).toBe(true)
  })
})

describe('un movimiento con productos de distintos orígenes (el demo aplica lo mismo que la base)', () => {
  /** Tres celdas Aprobadas de ubicaciones distintas y con unidades de sobra, y tres destinos libres. */
  async function armar() {
    const p = await repo.panorama()
    const usadas = new Set((await repo.listarMovimientos()).flatMap((o) => o.lineas.flatMap((l) => [l.desdePosicionId, l.haciaPosicionId])))
    const origenes = p.saldos.filter((x) => x.estado === 'APROBADO' && x.cantidad >= 10 && !usadas.has(x.posicionId))
    const porPos = new Map(origenes.map((s) => [s.posicionId, s]))
    const celdas = [...porPos.values()].slice(0, 3)
    const destinos = p.posiciones.filter((x) => x.tipoArea === 'APROBADOS' && x.activa && !p.saldos.some((s) => s.posicionId === x.id))
    return { p, celdas, destinos }
  }
  const lineaDe = (s: { posicionId: string; loteId: string; estado: never; procedenciaId: string }, hacia: string, cantidad: number) =>
    ({ desdePosicionId: s.posicionId, haciaPosicionId: hacia, loteId: s.loteId, estado: s.estado, procedenciaId: s.procedenciaId, cantidad })

  it('una orden con orígenes distintos y un destino cambiado en una línea; una autorización y una revisión; solo la línea con diferencia queda abierta', async () => {
    const { celdas, destinos } = await armar()
    const [a, b, c] = celdas
    const r = exito(await repo.ejecutarMovimiento([
      lineaDe(a as never, destinos[0].id, 5), lineaDe(b as never, destinos[0].id, 4), lineaDe(c as never, destinos[1].id, 3), // la tercera, a otro destino
    ], 'Reubicar varios productos', AUX))
    const o = (await repo.obtenerMovimiento(r.id))!
    expect(o.lineas.map((l) => l.hacia)).toEqual([destinos[0].codigo, destinos[0].codigo, destinos[1].codigo])
    expect(new Set(o.lineas.map((l) => l.desde)).size).toBe(3)
    exito(await repo.revisarMovimiento(r.id, o.lineas.map((l, i) => (i === 1 ? { lineaId: l.id, resultado: 'DIFERENCIA' as const, nota: 'Faltan 2 en el destino' } : { lineaId: l.id, resultado: 'COINCIDE' as const })), OTRO_AUX))
    const d = (await repo.obtenerMovimiento(r.id))!
    expect(d.estado).toBe('CON_DIFERENCIA')
    expect(d.lineas.map((l) => l.verificacion)).toEqual(['CONFIRMADA', 'CON_DIFERENCIA', 'CONFIRMADA'])
    const p = await repo.panorama()
    const en = (pos: string, lote: string) => p.saldos.filter((s) => s.posicionId === pos && s.loteId === lote).reduce((n, s) => n + s.cantidad, 0)
    expect(en(destinos[0].id, a.loteId)).toBe(5)   // confirmada
    expect(en(destinos[0].id, b.loteId)).toBe(0)   // con diferencia: no se movió
    expect(en(destinos[1].id, c.loteId)).toBe(3)   // confirmada, a su destino propio
    exito(await repo.resolverMovimiento(d.lineas[1].id, 'ANULAR', 'Se encontró el faltante', JEFE))
    expect((await repo.obtenerMovimiento(r.id))!.lineas.map((l) => l.verificacion)).toEqual(['CONFIRMADA', 'ANULADA', 'CONFIRMADA'])
  })

  it('las unidades de una orden preparada quedan reservadas para otra persona; el resto sigue libre; anular las libera', async () => {
    const { celdas, destinos } = await armar()
    const [a] = celdas
    const r = exito(await repo.ejecutarMovimiento([lineaDe(a as never, destinos[0].id, a.cantidad - 2)], 'Reservar', AUX))
    const otra = await repo.ejecutarMovimiento([lineaDe(a as never, destinos[1].id, 3)], 'Mismas unidades', OTRO_AUX)
    expect(otra).toMatchObject({ ok: false, mensaje: expect.stringMatching(/otros movimientos ya reservan/) })
    exito(await repo.ejecutarMovimiento([lineaDe(a as never, destinos[1].id, 2)], 'Lo que quedaba', OTRO_AUX))
    exito(await repo.anularMovimiento(r.id, 'Ya no hace falta', AUX))
    exito(await repo.ejecutarMovimiento([lineaDe(a as never, destinos[2].id, a.cantidad - 2)], 'Ya libre', OTRO_AUX))
  })

  it('dos líneas de la misma celda en una orden no pasan de lo que hay, y un movimiento abierto no bloquea la ubicación', async () => {
    const { celdas, destinos } = await armar()
    const [a] = celdas
    const e = await repo.ejecutarMovimiento([lineaDe(a as never, destinos[0].id, a.cantidad - 1), lineaDe(a as never, destinos[1].id, 2)], 'x', AUX)
    expect(e.ok).toBe(false)
    exito(await repo.ejecutarMovimiento([lineaDe(a as never, destinos[0].id, 1)], 'Una', AUX))
    expect(Object.keys(await repo.posicionesBloqueadas()).includes(a.posicionId)).toBe(false)
  })
})

describe('modo tabla en el demo: verificación vencida, tránsito y ejecutor', () => {
  it('un movimiento que pasa de 24 h sin verificar avisa al Jefe, una sola vez; verificado, deja de contar', async () => {
    const alertas = await repo.listarAlertas()
    const sin = alertas.filter((a) => a.tipo === 'MOVIMIENTO_SIN_VERIFICAR')
    expect(sin.length).toBeGreaterThanOrEqual(1)
    expect(sin[0]).toMatchObject({ destinatario: 'jefe_almacen' })
    expect(sin[0].mensaje).toMatch(/más de 24 horas sin verificar/)
    expect((await repo.listarAlertas()).filter((a) => a.tipo === 'MOVIMIENTO_SIN_VERIFICAR')).toHaveLength(sin.length) // no se repite
  })

  it('el mismo borrador reintentado (mismo token) no crea dos movimientos', async () => {
    const { s } = await stockLibre(10)
    const p = await repo.panorama()
    const destino = p.posiciones.find((x) => x.id !== s.posicionId && x.activa)!
    const linea = { desdePosicionId: s.posicionId, haciaPosicionId: destino.id, loteId: s.loteId, estado: s.estado, procedenciaId: s.procedenciaId, cantidad: 1 }
    const a = await repo.ejecutarMovimiento([linea], 'Reposición', AUX, 'token-1')
    const b = await repo.ejecutarMovimiento([linea], 'Reposición', AUX, 'token-1')
    if (a.ok) expect(b).toMatchObject({ ok: true, numero: a.numero })
  })

  it('las unidades en tránsito siguen en el origen hasta que otra persona verifica', async () => {
    const ordenes = await repo.listarMovimientos()
    const abierta = ordenes.find((o) => o.estado === 'EJECUTADO')!
    const { transitoPorPosicion } = await import('@/domain/transito')
    const t = transitoPorPosicion(ordenes)
    for (const l of abierta.lineas.filter((x) => x.verificacion === 'PENDIENTE')) {
      expect(t.get(l.desdePosicionId)!.salen).toBeGreaterThanOrEqual(l.cantidad)
      expect(t.get(l.haciaPosicionId)!.llegan).toBeGreaterThanOrEqual(l.cantidad)
    }
    const quien = actor(abierta.ejecutorId.replace('demo:', '') as Actor['roles'][number])
    expect(await repo.revisarMovimiento(abierta.id, abierta.lineas.map((l) => ({ lineaId: l.id, resultado: 'COINCIDE' as const })), quien)).toMatchObject({ ok: false })
  })
})
