// Orden de Salida en el modo demostración: quién pica, conformidad de toda la orden (con ajustes por línea) y bultos. Mismas reglas que la migración 0023.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { actorDemo as actor, aProvincia } from './ayudas-orden'

const JT = actor('jefe_transporte', 'jefe_transporte', 'jefe_almacen'); const AUX = actor('auxiliar', 'auxiliar'); const SANDRA = actor('asistente_dt', 'asistente_dt', 'conformidad_despacho')
const JA = actor('reemplazante_jefe', 'jefe_almacen')

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

async function orden(picker?: string) {
  const [res] = await repo.listarSalidas()
  const g = await repo.generarOrdenPicking(res.id, JT, picker)
  if (!g.ok) throw new Error(g.mensaje)
  return { salidaId: res.id, orden: (await repo.obtenerOrdenPicking(g.id))! }
}

describe('Orden de Salida (demo)', () => {
  it('el correlativo es OS-AAAA-NNNNN y la orden de picking nace sin picker', async () => {
    const { orden: o, salidaId } = await orden()
    expect((await repo.obtenerSalida(salidaId))!.numero).toMatch(/^OS-\d{4}-\d{5}$/)
    expect(o.pickerId).toBeUndefined()
  })

  it('se elige quién pica (auxiliar o jefes), al imprimir o después, hasta que empieza la conformidad', async () => {
    const { orden: o } = await orden()
    expect((await repo.personalDePicking()).map((p) => p.id)).toEqual(expect.arrayContaining(['demo:auxiliar', 'demo:jefe_almacen', 'demo:jefe_transporte']))
    expect((await repo.personalDePicking()).some((p) => p.id === 'demo:asistente_dt')).toBe(false)
    expect(await repo.designarPicker(o.id, 'demo:auxiliar', SANDRA)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para indicar quién hace el picking' })
    expect(await repo.designarPicker(o.id, 'demo:asistente_dt', JT)).toMatchObject({ ok: false, mensaje: 'Quien pica tiene que ser auxiliar, Jefe de Almacén o Jefe de Transporte' })
    expect(await repo.designarPicker(o.id, 'demo:auxiliar', JT)).toMatchObject({ ok: true })
    expect((await repo.obtenerOrdenPicking(o.id))!).toMatchObject({ pickerId: 'demo:auxiliar' })
  })

  it('la conformidad pide quién picó, la da otra persona y registra los bultos; el stock pasa a Despacho', async () => {
    const { orden: o, salidaId } = await orden()
    expect(await repo.conformarOrden(o.id, [], 2, undefined, SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringContaining('se indica quién hizo el picking') })
    await repo.designarPicker(o.id, 'demo:asistente_dt', JT)
    await repo.designarPicker(o.id, 'demo:auxiliar', JT)
    expect(await repo.conformarOrden(o.id, [], 2, undefined, AUX)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para dar la conformidad' })
    expect(await repo.conformarOrden(o.id, [], 0, undefined, SANDRA)).toMatchObject({ ok: false, mensaje: 'Registra el número de bultos (cajas master): de 1 a 99' })
    const antes = (await repo.panorama()).saldos.reduce((t, x) => t + x.cantidad, 0)
    expect(await repo.conformarOrden(o.id, [], 2, 'Todo coincide', SANDRA)).toMatchObject({ ok: true, unidades: 26, bultos: 2, ajustes: 0, requiereEmbalaje: false })
    const p = await repo.panorama()
    expect(p.saldos.reduce((t, x) => t + x.cantidad, 0)).toBe(antes)       // el stock no sale: solo cambia de lugar
    const k1 = p.posiciones.find((x) => x.codigo === 'K-1')!
    expect(p.saldos.filter((x) => x.posicionId === k1.id).reduce((t, x) => t + x.cantidad, 0)).toBe(26)
    expect((await repo.obtenerSalida(salidaId))!.etapa).toBe('CONFORME')
    expect(await repo.conformarOrden(o.id, [], 2, undefined, SANDRA)).toMatchObject({ ok: false, mensaje: 'Esta Orden de Salida ya tiene su conformidad' })
  })

  it('quien pickeó con el celular tampoco da la conformidad', async () => {
    const { orden: o } = await orden()
    const doble = actor('doble', 'auxiliar', 'conformidad_despacho')
    await repo.registrarPicking(o.lineasDetalle[0].id, 'PICKEADA', undefined, doble)
    expect((await repo.obtenerOrdenPicking(o.id))!.pickerId).toBe('demo:doble')
    expect(await repo.conformarOrden(o.id, [], 2, undefined, doble)).toMatchObject({ ok: false, mensaje: 'La conformidad la da otra persona, no quien hizo el picking' })
  })

  it('un pedido a Lima queda con sus bultos (sin contenido) y no se embala; uno a provincia sí se embala', async () => {
    const { orden: o, salidaId } = await orden('demo:auxiliar')
    expect((await repo.obtenerSalida(salidaId))!.requiereEmbalaje).toBe(false)
    await repo.conformarOrden(o.id, [], 3, undefined, SANDRA)
    expect((await repo.embalajeSalida(salidaId))!.bultosVigentes.map((b) => b.codigo)).toEqual([1, 2, 3].map((i) => expect.stringMatching(new RegExp(`^OS-\\d{4}-\\d{5}-B${i}$`))))
    expect(await repo.embalarSalida(salidaId, [], AUX)).toMatchObject({ ok: false })
    expect((await repo.colaEmbalaje()).map((x) => x.salidaId)).not.toContain(salidaId)
    // provincia
    ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
    repo = new RepositorioDemo()
    const b = await orden('demo:auxiliar')
    aProvincia(b.salidaId)
    await repo.conformarOrden(b.orden.id, [], 2, undefined, SANDRA)
    expect((await repo.embalajeSalida(b.salidaId))!.bultosVigentes).toHaveLength(0)
    expect((await repo.colaEmbalaje()).map((x) => x.salidaId)).toContain(b.salidaId)
  })

  it('menos cantidad y no lo encontré: se registran los ajustes y solo pasa a Despacho lo encontrado; si no queda nada, nada se registra', async () => {
    const { orden: o } = await orden('demo:auxiliar')
    const [primera, segunda] = o.lineasDetalle
    const e = async (r: unknown[]) => (await repo.conformarOrden(o.id, r as never, 2, undefined, SANDRA)) as { ok: boolean; mensaje?: string }
    expect((await e([{ ordenLineaId: primera.id, resultado: 'MENOS', cantidad: primera.cantidad }])).mensaje).toMatch(/más de cero y menos de las/)
    expect((await e(o.lineasDetalle.map((l) => ({ ordenLineaId: l.id, resultado: 'NO_ENCONTRADO' })))).mensaje).toMatch(/Ninguna línea quedó conforme/)
    expect((await repo.obtenerOrdenPicking(o.id))!.lineasDetalle.every((l) => l.conformidad === 'PENDIENTE')).toBe(true)     // todo o nada
    const r = await repo.conformarOrden(o.id, [
      { ordenLineaId: primera.id, resultado: 'MENOS', cantidad: primera.cantidad - 1, nota: 'Faltaba una' },
      { ordenLineaId: segunda.id, resultado: 'NO_ENCONTRADO', nota: 'No estaba' },
    ], 1, undefined, SANDRA)
    expect(r).toMatchObject({ ok: true, ajustes: 2, unidades: primera.cantidad - 1 })
    const v = (await repo.obtenerOrdenPicking(o.id))!
    expect(v.ajustes.map((a) => a.tipo).sort()).toEqual(['MENOS', 'NO_ENCONTRADO'])
    expect(v.lineasDetalle.find((l) => l.id === segunda.id)).toMatchObject({ cantidad: 0, conformidad: 'CONFORME' })
  })

  it('otro lote: el vencimiento sale del lote nuevo, queda el cambio a FEFO y las reglas se respetan', async () => {
    const { orden: o, salidaId } = await orden('demo:auxiliar')
    const linea = (await repo.obtenerSalida(salidaId))!.lineasDetalle[0]
    const ol = o.lineasDetalle.find((l) => l.lineaId === linea.id)!
    const opciones = (await repo.lotesParaEditar(linea.id)).filter((l) => l.loteId !== ol.loteId)
    const e = async (r: unknown[]) => (await repo.conformarOrden(o.id, r as never, 1, undefined, SANDRA)) as { ok: boolean; mensaje?: string }
    expect((await e([{ ordenLineaId: ol.id, resultado: 'OTRO_LOTE' }])).mensaje).toMatch(/Elige el lote que encontraste/)
    expect((await e([{ ordenLineaId: ol.id, resultado: 'OTRO_LOTE', loteId: ol.loteId }])).mensaje).toMatch(/Es el mismo lote/)
    if (!opciones.length) return        // los datos de prueba no ofrecen otro lote para esta línea
    const otro = opciones[0]
    await repo.aplicarReserva(otro.loteId, 'calidad', actor('direccion_tecnica', 'direccion_tecnica'))
    expect((await e([{ ordenLineaId: ol.id, resultado: 'OTRO_LOTE', loteId: otro.loteId }])).mensaje).toMatch(/está en Reserva/)
    await repo.quitarReserva(otro.loteId, 'ok', actor('direccion_tecnica', 'direccion_tecnica'))
    const r = await repo.conformarOrden(o.id, [{ ordenLineaId: ol.id, resultado: 'OTRO_LOTE', loteId: otro.loteId, cantidad: Math.min(ol.cantidad, otro.disponible), nota: 'Encontré este' }], 1, undefined, SANDRA)
    expect(r).toMatchObject({ ok: true })
    const v = (await repo.obtenerOrdenPicking(o.id))!
    expect(v.ajustes[0]).toMatchObject({ tipo: 'OTRO_LOTE', loteDespues: otro.lote })
    expect(v.lineasDetalle.some((l) => l.lote === otro.lote && l.conformidad === 'CONFORME')).toBe(true)
  })
})
