// Las rutas del modo demostración aplican las mismas reglas que la migración 0017 (y reutilizan las del dominio).
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

const actor = (...roles: Actor['roles']): Actor => ({ id: `demo:${roles[0]}`, nombre: `${roles[0]} (demo)`, roles })
const JT = actor('jefe_transporte'); const AUX = actor('auxiliar'); const JEFE = actor('jefe_almacen')
const manana = () => new Date(Date.now() + 86_400_000 * 2).toISOString().slice(0, 10)

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

describe('rutas (demo)', () => {
  it('arranca con una ruta planificada con el pedido 101 (su salida con stock asignado), vehículos y personal', async () => {
    const p = await repo.panoramaRutas()
    expect(p.rutas).toHaveLength(1)
    expect(p.rutas[0]).toMatchObject({ estado: 'PLANIFICADA', registroLsFr: 'BASE', version: 3 - 1 })
    expect(p.rutas[0].paradas).toEqual([expect.objectContaining({ pedidoNumero: 'PED-DEMO-101', stock: 'ASIGNADA', salidaNumero: expect.stringMatching(/^OS-/) })])
    expect(p.vehiculos.filter((v) => v.activo)).toHaveLength(4)   // incluye BWO-902, el vehículo de Hans (SB-A)
    expect(p.pedidos.find((x) => x.numero === 'PED-DEMO-101')!.enRuta).toBe(p.rutas[0].numero)
    expect(p.corte).toBe('16:00')
  })

  it('solo el Jefe de Transporte planifica', async () => {
    expect(await repo.crearRuta({ fecha: manana() }, AUX)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para planificar rutas' })
    expect(await repo.crearRuta({ fecha: manana() }, JEFE)).toMatchObject({ ok: false })
  })

  it('crear, agregar un pedido, guardar y confirmar; el pedido pasa a «Con salida»', async () => {
    const r = await repo.crearRuta({ fecha: manana() }, JT)
    if (!r.ok) throw new Error(r.mensaje)
    // el 103 trae un producto que el WMS no conoce: no entra
    expect(await repo.planificarRuta(r.id, { fecha: manana(), paradas: [{ pedidoId: 'ped-demo-103' }] }, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('no conoce') })
    const plan = await repo.planificarRuta(r.id, { fecha: manana(), vehiculoId: 'veh-2', conductorId: 'per-2', auxiliarId: 'per-4', paradas: [{ pedidoId: 'ped-demo-102' }] }, JT)
    expect(plan).toMatchObject({ ok: true, bloqueadosPorStock: [] })
    expect(await repo.confirmarRuta(r.id, JT)).toMatchObject({ ok: true })
    expect((await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-102')).toMatchObject({ estado: 'EN_SALIDA' })
    // un pedido no puede estar en dos rutas
    const r2 = await repo.crearRuta({ fecha: manana() }, JT)
    if (!r2.ok) throw new Error(r2.mensaje)
    expect(await repo.planificarRuta(r2.id, { fecha: manana(), paradas: [{ pedidoId: 'ped-demo-102' }] }, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya está en la ruta') })
  })

  it('un vehículo común sí atiende a cualquier cliente (el vehículo calificado ya no se valida, D-153); un vehículo o conductor no repite el mismo día', async () => {
    const r = await repo.crearRuta({ fecha: manana() }, JT)
    if (!r.ok) throw new Error(r.mensaje)
    await repo.actualizarBandeja(JT) // llega el 104 (botica; antes exigía vehículo calificado)
    expect(await repo.planificarRuta(r.id, { fecha: manana(), vehiculoId: 'veh-3', paradas: [{ pedidoId: 'ped-demo-104' }] }, JT)).toMatchObject({ ok: true })
    expect(JSON.stringify(await repo.panoramaRutas())).not.toMatch(/vehiculoCalificado|calificado\b.*exige/)
    const otra = await repo.crearRuta({ fecha: manana() }, JT)
    if (!otra.ok) throw new Error(otra.mensaje)
    await repo.planificarRuta(r.id, { fecha: manana(), vehiculoId: 'veh-3', conductorId: 'per-2', paradas: [] }, JT)
    expect(await repo.planificarRuta(otra.id, { fecha: manana(), vehiculoId: 'veh-3', paradas: [] }, JT)).toMatchObject({ ok: false, mensaje: 'El vehículo ya está en otra ruta de ese día' })
    expect(await repo.planificarRuta(otra.id, { fecha: manana(), conductorId: 'per-2', paradas: [] }, JT)).toMatchObject({ ok: false, mensaje: 'El conductor ya está en otra ruta de ese día' })
    expect(await repo.planificarRuta(otra.id, { fecha: manana(), conductorId: 'per-5', paradas: [] }, JT)).toMatchObject({ ok: false, mensaje: 'El conductor elegido no está disponible' })
  })

  it('un pedido sin stock suficiente queda bloqueado, avisa al Jefe de Transporte y no deja confirmar; al sacarlo se libera', async () => {
    await repo.actualizarBandeja(JT)
    const r = await repo.crearRuta({ fecha: manana() }, JT)
    if (!r.ok) throw new Error(r.mensaje)
    const plan = await repo.planificarRuta(r.id, { fecha: manana(), vehiculoId: 'veh-2', conductorId: 'per-2', paradas: [{ pedidoId: 'ped-demo-104', excepcionCorte: true, motivoExcepcion: 'Prueba' }] }, JT)
    expect(plan).toMatchObject({ ok: true, bloqueadosPorStock: ['PED-DEMO-104'] })
    expect((await repo.listarAlertas()).some((a) => a.tipo === 'STOCK_INSUFICIENTE' && a.destinatario === 'jefe_transporte')).toBe(true)
    expect(await repo.confirmarRuta(r.id, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('no tienen stock suficiente: PED-DEMO-104') })
    expect(await repo.planificarRuta(r.id, { fecha: manana(), vehiculoId: 'veh-2', conductorId: 'per-2', paradas: [] }, JT)).toMatchObject({ ok: true })
    expect((await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-104')).toMatchObject({ estado: 'POR_PLANIFICAR' })
  })

  it('una ruta planificada exige motivo para cambiar y deja versiones; cancelarla libera los pedidos', async () => {
    const [ruta] = (await repo.panoramaRutas()).rutas
    const cambio = { fecha: ruta.fecha, vehiculoId: 'veh-1', conductorId: 'per-1', auxiliarId: 'per-3', paradas: [] as { pedidoId: string }[] }
    expect(await repo.planificarRuta(ruta.id, cambio, JT)).toMatchObject({ ok: false, mensaje: 'La ruta ya estaba planificada: indica por qué cambia' })
    expect(await repo.planificarRuta(ruta.id, { ...cambio, motivo: 'Se cae la entrega' }, JT)).toMatchObject({ ok: true })
    const v = (await repo.obtenerRuta(ruta.id))!
    expect(v.versiones[0]).toMatchObject({ motivo: 'Se cae la entrega', paradas: 0 })
    expect(await repo.cancelarRuta(ruta.id, '  ', JT)).toMatchObject({ ok: false })
    expect(await repo.cancelarRuta(ruta.id, 'Cliente cerrado', JT)).toMatchObject({ ok: true })
    expect((await repo.obtenerRuta(ruta.id))!).toMatchObject({ estado: 'CANCELADA', motivoCancelacion: 'Cliente cerrado' })
    expect((await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-101')).toMatchObject({ estado: 'POR_PLANIFICAR' })
  })

  it('el personal y los vehículos los administra el Jefe de Transporte, sin repetir nombres ni placas', async () => {
    expect(await repo.guardarPersonal({ nombre: 'Luis Quispe', funcion: 'CONDUCTOR', activo: true }, JT)).toMatchObject({ ok: false, mensaje: 'Ya existe Luis Quispe' })
    const nuevo = await repo.guardarPersonal({ nombre: 'Rosa Vega', funcion: 'AUXILIAR', activo: true }, JT)
    expect(nuevo.ok).toBe(true)
    expect(await repo.guardarPersonal({ nombre: 'Otro', funcion: 'AUXILIAR', activo: true }, AUX)).toMatchObject({ ok: false })
    expect(await repo.guardarVehiculo({ placa: 'bkw-757', tipo: 'PROPIO', calificado: false, aptoCadenaFrio: false, activo: true }, JT)).toMatchObject({ ok: false, mensaje: 'Ya existe un vehículo con la placa BKW-757' })
    expect(await repo.guardarVehiculo({ placa: 'xx', tipo: 'PROPIO', calificado: false, aptoCadenaFrio: false, activo: true }, JT)).toMatchObject({ ok: false })
    expect(await repo.guardarVehiculo({ placa: 'NEW-001', tipo: 'PROPIO', calificado: true, aptoCadenaFrio: false, activo: true }, JT)).toMatchObject({ ok: true })
  })
})
