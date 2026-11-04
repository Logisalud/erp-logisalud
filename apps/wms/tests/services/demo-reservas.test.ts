// Reserva de un lote en el modo demostración: mismas reglas que la migración 0022.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const JT = actor('jt', 'jefe_transporte'); const JA = actor('ja', 'jefe_almacen'); const AUX = actor('aux', 'auxiliar'); const KATIA = actor('katia', 'direccion_tecnica')

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

/** Un lote Aprobado con stock y el pedido que lo tiene asignado. */
async function loteAsignado() {
  const [res] = await repo.listarSalidas()
  const s = (await repo.obtenerSalida(res.id))!
  const loteId = s.lineasDetalle[0].asignacion[0].loteId
  return { salidaId: res.id, loteId, lote: s.lineasDetalle[0].asignacion[0].lote }
}

describe('Reserva de un lote (demo)', () => {
  it('la ponen y la quitan solo el Jefe de Transporte y Dirección Técnica, con motivo', async () => {
    const { loteId } = await loteAsignado()
    for (const a of [JA, AUX]) expect(await repo.aplicarReserva(loteId, 'calidad', a)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para poner un lote en Reserva' })
    expect(await repo.aplicarReserva(loteId, '  ', JT)).toMatchObject({ ok: false, mensaje: 'Cuéntanos el motivo de la Reserva' })
    expect(await repo.aplicarReserva(loteId, 'Observación de calidad', JT)).toMatchObject({ ok: true })
    expect(await repo.aplicarReserva(loteId, 'otra vez', KATIA)).toMatchObject({ ok: false, mensaje: 'Ese lote ya está en Reserva' })
    expect((await repo.reservasVigentes()).map((r) => r.loteId)).toEqual([loteId])
    expect(await repo.quitarReserva(loteId, 'ok', JA)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para quitar la Reserva de un lote' })
    expect(await repo.quitarReserva(loteId, '', KATIA)).toMatchObject({ ok: false, mensaje: 'Cuéntanos por qué se quita la Reserva' })
    expect(await repo.quitarReserva(loteId, 'DT revisó el COA', KATIA)).toMatchObject({ ok: true })
    expect(await repo.reservasVigentes()).toEqual([])
    const h = await repo.reservasDelLote(loteId)
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ motivo: 'Observación de calidad', aplicadaPor: 'jt (demo)', quitadaPor: 'katia (demo)', motivoQuita: 'DT revisó el COA' })
    expect(await repo.quitarReserva(loteId, 'otra', KATIA)).toMatchObject({ ok: false, mensaje: 'Ese lote no está en Reserva' })
  })

  it('un lote sin stock Aprobado no entra en Reserva', async () => {
    expect(await repo.aplicarReserva('no-existe', 'prueba', JT)).toMatchObject({ ok: false, mensaje: 'No encontramos ese lote' })
  })

  it('un lote ya asignado que pasa a Reserva avisa al Jefe de Transporte y no se pickea hasta quitar la Reserva', async () => {
    const { salidaId, loteId, lote } = await loteAsignado()
    const o = await repo.generarOrdenPicking(salidaId, JT)
    if (!o.ok) throw new Error(o.mensaje)
    const orden = (await repo.obtenerOrdenPicking(o.id))!
    expect(await repo.aplicarReserva(loteId, 'Alerta de DIGEMID en evaluación', KATIA)).toMatchObject({ ok: true })
    const alertas = await repo.listarAlertas()
    expect(alertas.find((a) => a.tipo === 'LOTE_EN_RESERVA')).toMatchObject({ destinatario: 'jefe_transporte', estado: 'ABIERTA', mensaje: expect.stringContaining(`El lote ${lote} quedó en Reserva`) })
    const delLote = orden.lineasDetalle.find((l) => l.lote === lote)!
    expect(await repo.registrarPicking(delLote.id, 'PICKEADA', undefined, AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('está en Reserva: no se puede pickear') })
    await repo.quitarReserva(loteId, 'DIGEMID confirmó que no aplica', JT)
    expect((await repo.listarAlertas()).find((a) => a.tipo === 'LOTE_EN_RESERVA')?.estado).toBe('ATENDIDA')
    expect(await repo.registrarPicking(delLote.id, 'PICKEADA', undefined, AUX)).toMatchObject({ ok: true })
  })

  it('un lote en Reserva no se ofrece para cambiar el lote de una línea ni se asigna a un pedido nuevo', async () => {
    const { salidaId, loteId } = await loteAsignado()
    const s = (await repo.obtenerSalida(salidaId))!
    const linea = s.lineasDetalle[0]
    await repo.aplicarReserva(loteId, 'calidad', JT)
    const lotes = await repo.lotesParaEditar(linea.id)
    expect(lotes.find((l) => l.loteId === loteId)).toBeUndefined()
  })
})
