// Asignación editable, picking, discrepancia y conformidad del modo demostración: las mismas reglas que las migraciones 0012, 0013 y 0018.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const JT = actor('jt', 'jefe_transporte', 'jefe_almacen'); const AUX = actor('aux', 'auxiliar'); const AUX2 = actor('aux2', 'auxiliar'); const SANDRA = actor('sandra', 'asistente_dt', 'conformidad_despacho')
const JEFE = actor('jefe', 'jefe_almacen')

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

const primeraSalida = async () => { const [s] = await repo.listarSalidas(); return (await repo.obtenerSalida(s.id))! }

describe('salida de un pedido (demo)', () => {
  it('la salida del pedido 101 nace asignada por FEFO, con su propuesta original, y queda «Stock asignado»', async () => {
    const [res] = await repo.listarSalidas()
    expect(res).toMatchObject({ etapa: 'ASIGNADA', pedidoNumero: 'PED-DEMO-101', cliente: 'Botica Salud Total SAC', unidades: 26 })
    const s = (await repo.obtenerSalida(res.id))!
    expect(s.lineasDetalle).toHaveLength(2)
    for (const l of s.lineasDetalle) {
      expect(l.estado).toBe('ASIGNADA'); expect(l.apartadaDeFefo).toBe(false); expect(l.editable).toBe(true)
      expect(l.asignacion.reduce((t, a) => t + a.cantidad, 0)).toBe(l.cantidad)
      expect(l.fefo).toHaveLength(l.asignacion.length)
    }
  })

  it('editar lotes (D-79): lista de lotes con el FEFO «sugerido», aviso no bloquea, queda el registro «Cambios a FEFO» y el reporte lo cuenta', async () => {
    const s = await primeraSalida()
    const l = s.lineasDetalle[0]
    const lotes = await repo.lotesParaEditar(l.id)
    expect(lotes.length).toBeGreaterThan(1)
    expect(lotes.find((x) => x.sugerido)).toBeTruthy()
    expect([...lotes].sort((a, b) => (a.vence ?? '9999').localeCompare(b.vence ?? '9999')).map((x) => x.loteId)).toEqual(lotes.map((x) => x.loteId))
    const otro = lotes.find((x) => !x.sugerido && x.disponible >= l.cantidad)!
    expect(await repo.editarAsignacion(l.id, [{ loteId: otro.loteId, cantidad: l.cantidad }], undefined, AUX)).toMatchObject({ ok: true })
    const despues = (await repo.obtenerSalida(s.id))!
    expect(despues.lineasDetalle[0].asignacion).toEqual([expect.objectContaining({ loteId: otro.loteId, cantidad: l.cantidad })])
    expect(despues.lineasDetalle[0].apartadaDeFefo).toBe(true)
    expect(despues.cambios[0]).toMatchObject({ por: 'aux (demo)', distintoDeFefo: true })
    // sin cambios no se registra
    expect(await repo.editarAsignacion(l.id, [{ loteId: otro.loteId, cantidad: l.cantidad }], undefined, AUX)).toMatchObject({ ok: false, mensaje: 'La asignación no cambió' })
    const rep = await repo.reporteCambiosFefo(undefined, undefined, JEFE)
    expect(rep).toMatchObject({ ok: true, filas: [expect.objectContaining({ persona: 'aux (demo)', veces: 1, lineas: 1, unidades: l.cantidad })] })
    expect(await repo.reporteCambiosFefo(undefined, undefined, AUX)).toMatchObject({ ok: false })
    // volver a FEFO deja otro registro (el de vuelta no se aparta)
    expect(await repo.editarAsignacion(l.id, l.fefo.map((f) => ({ loteId: f.loteId, cantidad: f.cantidad })), undefined, AUX)).toMatchObject({ ok: true })
    expect((await repo.obtenerSalida(s.id))!.lineasDetalle[0].apartadaDeFefo).toBe(false)
  })

  it('reglas de seguridad al editar: la suma, el lote del producto y quién puede', async () => {
    const s = await primeraSalida(); const l = s.lineasDetalle[0]
    const lotes = await repo.lotesParaEditar(l.id)
    expect(await repo.editarAsignacion(l.id, [{ loteId: lotes[0].loteId, cantidad: l.cantidad + 1 }], undefined, AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('debe ser igual a la cantidad de la línea') })
    expect(await repo.editarAsignacion(l.id, [{ loteId: 'lote:inexistente', cantidad: l.cantidad }], undefined, AUX)).toMatchObject({ ok: false })
    expect(await repo.editarAsignacion(l.id, [{ loteId: lotes[lotes.length - 1].loteId, cantidad: l.cantidad }], undefined, SANDRA)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para cambiar el lote asignado' })
  })
})

describe('picking y conformidad (demo)', () => {
  const generar = async () => {
    const s = await primeraSalida()
    const r = await repo.generarOrdenPicking(s.id, JT)
    if (!r.ok) throw new Error(r.mensaje)
    return { s, orden: (await repo.obtenerOrdenPicking(r.id))! }
  }

  it('generar la orden: una línea por reserva en el orden del recorrido; es idempotente; solo quien prepara salidas', async () => {
    const s = await primeraSalida()
    expect(await repo.generarOrdenPicking(s.id, AUX)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para preparar salidas' })
    const r = await repo.generarOrdenPicking(s.id, JT)
    expect(r).toMatchObject({ ok: true, numero: expect.stringMatching(/^OP-\d{4}-00001$/) })
    const otra = await repo.generarOrdenPicking(s.id, JT)
    expect(otra).toMatchObject({ ok: true, numero: r.ok ? r.numero : '' })
    const o = (await repo.obtenerOrdenPicking(r.ok ? r.id : ''))!
    const rec = o.lineasDetalle.map((x) => x.ordenRecorrido)
    expect([...rec].sort((a, b) => a - b)).toEqual(rec)
    expect(o.lineasDetalle.every((x) => x.picking === 'PENDIENTE' && x.conformidad === 'PENDIENTE')).toBe(true)
    expect((await repo.obtenerSalida(s.id))!.etapa).toBe('EN_PICKING')
    expect((await repo.colaPicking()).map((x) => x.id)).toContain(o.id)
    // ya con orden, los lotes se pueden seguir editando hasta que empiece el picking de la línea
    expect((await repo.obtenerSalida(s.id))!.lineasDetalle.every((l) => l.editable)).toBe(true)
  })

  it('pickear todo, dar la conformidad otra persona y ver el stock pasar del rack a la zona de conformidad; quien pickeó no la da', async () => {
    const { s, orden } = await generar()
    const antes = (await repo.panorama()).saldos.reduce((t, x) => t + x.cantidad, 0)
    for (const l of orden.lineasDetalle) {
      expect(await repo.registrarPicking(l.id, 'PICKEADA', undefined, AUX)).toMatchObject({ ok: true })
      expect(await repo.registrarPicking(l.id, 'PICKEADA', undefined, AUX)).toMatchObject({ ok: false, mensaje: 'Esa línea ya se registró' })
    }
    expect((await repo.obtenerSalida(s.id))!.etapa).toBe('PENDIENTE_CONFORMIDAD')
    expect((await repo.colaConformidad()).map((x) => x.id)).toContain(orden.id)
    const primera = orden.lineasDetalle[0]
    expect(await repo.darConformidad(primera.id, 'CONFORME', undefined, undefined, AUX)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para dar la conformidad' })
    expect(await repo.darConformidad(primera.id, 'CONFORME', undefined, undefined, { ...SANDRA, id: AUX.id })).toMatchObject({ ok: false, mensaje: 'La conformidad la da otra persona, no quien hizo el picking' })
    for (const l of orden.lineasDetalle) expect(await repo.darConformidad(l.id, 'CONFORME', undefined, undefined, SANDRA)).toMatchObject({ ok: true })
    expect((await repo.obtenerSalida(s.id))!.etapa).toBe('CONFORME')
    const p = await repo.panorama()
    expect(p.saldos.reduce((t, x) => t + x.cantidad, 0)).toBe(antes) // el stock no sale: solo cambia de lugar
    const stg = p.posiciones.find((x) => x.codigo === 'K-1')!
    expect(p.saldos.filter((x) => x.posicionId === stg.id).reduce((t, x) => t + x.cantidad, 0)).toBe(26)
    expect((await repo.colaConformidad())).toEqual([])
  })

  it('el picker no encuentra el lote: discrepancia con nota, propuesta de reemplazo y, al aplicarla, la línea se rehace y el cambio a FEFO queda registrado', async () => {
    const { s, orden } = await generar()
    const l = orden.lineasDetalle[0]
    expect(await repo.registrarPicking(l.id, 'DISCREPANCIA', ' ', AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Cuéntanos qué pasó') })
    expect(await repo.registrarPicking(l.id, 'DISCREPANCIA', 'No está en la ubicación', AUX)).toMatchObject({ ok: true })
    expect((await repo.obtenerSalida(s.id))!.etapa).toBe('CON_DISCREPANCIA')
    const prop = await repo.proponerReemplazo(l.id)
    expect(prop.length).toBeGreaterThan(0)
    expect(await repo.resolverDiscrepancia(l.id, prop[0].loteId, prop[0].posicionId, 'Estaba en otro lado', SANDRA)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para cambiar el lote asignado' })
    expect(await repo.resolverDiscrepancia(l.id, prop[0].loteId, prop[0].posicionId, 'Estaba en otro lado', AUX)).toMatchObject({ ok: true })
    const o2 = (await repo.obtenerOrdenPicking(orden.id))!
    expect(o2.lineasDetalle.some((x) => x.id === l.id)).toBe(false)
    expect(o2.lineasDetalle.reduce((t, x) => t + x.cantidad, 0)).toBe(26)
    expect(o2.estado).toBe('EN_CURSO')
    if (prop[0].motivo === 'SIGUIENTE_FEFO') expect((await repo.obtenerSalida(s.id))!.cambios[0]).toMatchObject({ distintoDeFefo: true })
    expect(await repo.resolverDiscrepancia(o2.lineasDetalle[0].id, prop[0].loteId, undefined, undefined, AUX)).toMatchObject({ ok: false, mensaje: 'Esa línea no tiene una discrepancia por resolver' })
  })

  it('observar con un tipo, corregir (vuelve a picking) y volver a verificar; la observación pide nota y tipo válido', async () => {
    const { s, orden } = await generar()
    const l = orden.lineasDetalle[0]
    for (const x of orden.lineasDetalle) await repo.registrarPicking(x.id, 'PICKEADA', undefined, AUX)
    expect(await repo.darConformidad(l.id, 'OBSERVADA', ' ', 'DANO', SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Cuéntanos qué observas') })
    expect(await repo.darConformidad(l.id, 'OBSERVADA', 'Caja rota', 'INVENTADO' as never, SANDRA)).toMatchObject({ ok: false, mensaje: 'Ese tipo de no conformidad no existe' })
    expect(await repo.darConformidad(l.id, 'OBSERVADA', 'Caja rota', 'DANO', SANDRA)).toMatchObject({ ok: true })
    expect((await repo.obtenerSalida(s.id))!.etapa).toBe('OBSERVADA')
    expect((await repo.obtenerOrdenPicking(orden.id))!.lineasDetalle.find((x) => x.id === l.id)).toMatchObject({ conformidad: 'OBSERVADA', noConformidad: 'DANO', verificador: 'sandra (demo)' })
    expect(await repo.reabrirObservada(l.id, 'Cambié la caja', JEFE.roles.includes('auxiliar') ? JEFE : AUX2)).toMatchObject({ ok: true })
    expect((await repo.obtenerOrdenPicking(orden.id))!.lineasDetalle.find((x) => x.id === l.id)).toMatchObject({ picking: 'PENDIENTE', conformidad: 'PENDIENTE' })
    expect(await repo.reabrirObservada(l.id, undefined, AUX2)).toMatchObject({ ok: false, mensaje: 'Esa línea no está observada' })
    await repo.registrarPicking(l.id, 'PICKEADA', undefined, AUX2)
    for (const x of orden.lineasDetalle) expect(await repo.darConformidad(x.id, 'CONFORME', undefined, undefined, SANDRA)).toMatchObject({ ok: true })
    expect((await repo.obtenerSalida(s.id))!.etapa).toBe('CONFORME')
  })
})
