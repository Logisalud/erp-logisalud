// La bandeja de pedidos del modo demostración aplica las mismas reglas que la migración 0014.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

const actor = (rol: Actor['roles'][number]): Actor => ({ id: `demo:${rol}`, nombre: `${rol} (demo)`, roles: [rol] })
const JT = actor('jefe_transporte'); const AUX = actor('auxiliar'); const JEFE = actor('jefe_almacen')

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

describe('bandeja de pedidos (demo)', () => {
  it('arranca con tres pedidos ya importados: uno por planificar, uno con salida y un producto que el WMS no conoce', async () => {
    const b = await repo.bandejaPedidos()
    expect(b.pedidos.map((p) => p.numero).sort()).toEqual(['PED-DEMO-101', 'PED-DEMO-102', 'PED-DEMO-103'])
    expect(b.pedidos.find((p) => p.numero === 'PED-DEMO-101')).toMatchObject({ estado: 'EN_SALIDA', salida: expect.stringMatching(/^OS-\d{4}-00001$/), unidades: 26 })
    expect(b.pedidos.find((p) => p.numero === 'PED-DEMO-103')).toMatchObject({ estado: 'POR_PLANIFICAR' })
    expect(b.pedidos.find((p) => p.numero === 'PED-DEMO-103')!.lineas.some((l) => !l.enCatalogo)).toBe(true)
    expect(b.ultimaExitosa).toMatchObject({ ok: true, resumen: { nuevos: 3, nuevasVersiones: 0, descartados: 0 } })
  })

  it('actualizar trae un pedido nuevo y una versión nueva (queda por revisar con lo que cambió y una alerta), descarta el mal formado y no duplica al repetir', async () => {
    const r = await repo.actualizarBandeja(JT)
    expect(r).toMatchObject({ ok: true, resumen: { nuevos: 1, nuevasVersiones: 1, iguales: 2 } })
    if (r.ok) expect(r.resumen.descartados).toEqual([expect.objectContaining({ referencia: 'PED-DEMO-199', motivo: 'El pedido no trae líneas.' })])
    const b = await repo.bandejaPedidos()
    expect(b.pedidos).toHaveLength(4)
    const p102 = b.pedidos.find((p) => p.numero === 'PED-DEMO-102')!
    expect(p102).toMatchObject({ version: 2, estado: 'CAMBIO_POR_REVISAR' })
    expect(p102.cambios).toEqual(expect.arrayContaining([expect.stringMatching(/la cantidad pasó de 40 a 60/), 'Cambió la ventana de cita']))
    const alertas = (await repo.listarAlertas()).filter((a) => a.tipo === 'PEDIDO_CAMBIADO')
    expect(alertas).toHaveLength(1)
    expect(alertas[0]).toMatchObject({ destinatario: 'jefe_transporte', estado: 'ABIERTA' })
    expect((await repo.contarAlertasAbiertas()).jefe_transporte).toBeGreaterThanOrEqual(1)
    // actualizar otra vez no duplica nada ni repite la alerta
    expect(await repo.actualizarBandeja(JT)).toMatchObject({ ok: true, resumen: { nuevos: 0, nuevasVersiones: 0, iguales: 4 } })
    expect((await repo.bandejaPedidos()).pedidos).toHaveLength(4)
    expect((await repo.listarAlertas()).filter((a) => a.tipo === 'PEDIDO_CAMBIADO')).toHaveLength(1)
  })

  it('el cambio se da por revisado una vez; el pedido vuelve a «por planificar»', async () => {
    await repo.actualizarBandeja(JT)
    const id = (await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-102')!.pedidoId
    expect(await repo.revisarCambioPedido(id, AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/No tienes permiso/) })
    expect(await repo.revisarCambioPedido(id, JT)).toEqual({ ok: true })
    expect((await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-102')!.estado).toBe('POR_PLANIFICAR')
    expect(await repo.revisarCambioPedido(id, JT)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/no tiene cambios por revisar/) })
    expect(await repo.revisarCambioPedido('no-existe', JT)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/No encontramos ese pedido/) })
  })

  it('solo el Jefe de Transporte y el Jefe de Almacén actualizan la bandeja', async () => {
    expect(await repo.actualizarBandeja(AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/No tienes permiso/) })
    expect(await repo.actualizarBandeja(JEFE)).toMatchObject({ ok: true })
  })
})
