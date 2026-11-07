// Fase 4 · P2: en la demo la bandeja trae la ruta y el día de despacho de la ruta planificada en el WMS (y «sin ruta» para el resto).
import { beforeEach, describe, expect, it } from 'vitest'
import { opcionesDe } from '@/domain/pedidos-despacho'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'
import { sumarDiasISO as sumarDias } from '@/domain/operacion'

const JT: Actor = { id: 'demo:jt', nombre: 'JT (demo)', roles: ['jefe_transporte', 'jefe_almacen'] }
let repo: RepositorioDemo
beforeEach(() => { (globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; process.env.WMS_DEMO_LOCAL = '1'; repo = new RepositorioDemo() })

describe('bandeja demo: ruta y día', () => {
  it('un pedido llevado a una ruta aparece con su número de ruta y su fecha; los demás, sin ruta', async () => {
    const antes = await repo.bandejaPedidos()
    expect(antes.pedidos.some((p) => !p.ruta)).toBe(true)  // no todos están en una ruta
    const ped = antes.pedidos.find((p) => p.estado === 'POR_PLANIFICAR' && !p.ruta)!
    const pan = await repo.panoramaRutas()
    const hoy = pan.hoy
    const veh = pan.vehiculos.find((v) => v.activo)!
    const pers = pan.personal
    const ruta = await repo.crearRuta({ fecha: sumarDias(hoy, 3), vehiculoId: veh.id, conductorId: pers.find((x) => x.funcion === 'CONDUCTOR')?.id, auxiliarId: pers.find((x) => x.funcion === 'AUXILIAR')?.id } as never, JT)
    if (!ruta.ok) throw new Error(ruta.mensaje)
    const plan = await repo.planificarRuta(ruta.id, { fecha: sumarDias(hoy, 3), vehiculoId: veh.id, paradas: [{ pedidoId: ped.pedidoId }] } as never, JT)
    if (!plan.ok) throw new Error(plan.mensaje)
    const despues = await repo.bandejaPedidos()
    const x = despues.pedidos.find((p) => p.pedidoId === ped.pedidoId)!
    expect(x.ruta).toMatch(/\S/); expect(x.diaDespacho).toBe(sumarDias(hoy, 3))
    expect(opcionesDe(despues.pedidos, 'ruta').some((o) => o.valor === x.ruta)).toBe(true)
  })
})
