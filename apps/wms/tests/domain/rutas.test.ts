import { describe, expect, it } from 'vitest'
import { claveDeOrden, clavePlanParada, filtrarOrdenesPlanificables, fueraDeCorte, horaLima, ordenSugerido, validarPlan, type OrdenPlanificable, type PedidoPlanificable, type VehiculoVista } from '@/domain/rutas'

const ped = (n: string, extra: Partial<PedidoPlanificable> = {}): PedidoPlanificable => ({ pedidoId: n, numero: `PED-${n}`, cliente: `Cliente ${n}`, lineas: 1, unidades: 10, importadoEn: '2026-10-14T15:00:00Z', cambioPorRevisar: false, sinCatalogo: [], ...extra })
const veh = (extra: Partial<VehiculoVista> = {}): VehiculoVista => ({ id: 'v1', placa: 'ABC-123', tipo: 'PROPIO', calificado: false, aptoCadenaFrio: false, activo: true, ...extra })
const base = (pedidos: PedidoPlanificable[], extra: Partial<Parameters<typeof validarPlan>[0]> = {}) =>
  ({ hoy: '2026-10-14', corte: '16:00', plan: { fecha: '2026-10-15', paradas: pedidos.map((p) => ({ pedidoId: p.pedidoId })) }, vehiculo: veh(), pedidos: new Map(pedidos.map((p) => [p.pedidoId, p])), enOtraRuta: new Map(), ...extra })

describe('corte de planificación (hora de Lima)', () => {
  it('convierte UTC a Lima', () => { expect(horaLima('2026-10-14T21:30:00Z')).toEqual({ fecha: '2026-10-14', hora: '16:30' }); expect(horaLima('2026-10-15T03:00:00Z')).toEqual({ fecha: '2026-10-14', hora: '22:00' }) })
  it('lo importado después de las 16:00 de la víspera queda fuera; antes, dentro; el mismo día de la ruta también queda fuera', () => {
    expect(fueraDeCorte('2026-10-14T20:59:00Z', '2026-10-15')).toBe(false) // 15:59 Lima
    expect(fueraDeCorte('2026-10-14T21:01:00Z', '2026-10-15')).toBe(true)  // 16:01 Lima
    expect(fueraDeCorte('2026-10-15T14:00:00Z', '2026-10-15')).toBe(true)  // ya es el día de la ruta
    expect(fueraDeCorte('2026-10-10T14:00:00Z', '2026-10-15')).toBe(false)
  })
})

describe('validarPlan', () => {
  it('un plan correcto no tiene errores', () => expect(validarPlan(base([ped('1'), ped('2')]))).toEqual([]))
  it('fecha pasada, conductor igual al auxiliar, vehículo inactivo, pedido repetido', () => {
    const e = validarPlan({ ...base([ped('1')]), plan: { fecha: '2026-10-13', conductorId: 'x', auxiliarId: 'x', paradas: [{ pedidoId: '1' }, { pedidoId: '1' }] }, vehiculo: veh({ activo: false }) })
    expect(e).toEqual(expect.arrayContaining(['La fecha de la ruta no puede ser anterior a hoy.', 'El conductor y el auxiliar deben ser personas distintas.', 'El vehículo ABC-123 está inactivo.', 'Hay un pedido o una orden repetida en la ruta.']))
  })
  it('cambio por revisar, otra ruta y producto desconocido (el vehículo calificado ya no se valida: D-153)', () => {
    const e = validarPlan(base([ped('1'), ped('2', { cambioPorRevisar: true }), ped('3'), ped('4', { sinCatalogo: ['X-9'] })], { enOtraRuta: new Map([['3', 'RUT-2026-00001']]) }))
    expect(e).toEqual(expect.arrayContaining([
      'El pedido PED-2 cambió en Pedidos: revisa el cambio antes de planificarlo.',
      'El pedido PED-3 ya está en la ruta RUT-2026-00001.', 'El pedido PED-4 trae un producto que el WMS no conoce (X-9): Dirección Técnica debe darlo de alta.',
    ]))
    expect(e.some((m) => /calificado/.test(m))).toBe(false)
    expect(validarPlan(base([ped('1')], { vehiculo: veh({ calificado: false }) }))).toEqual([])
  })
  it('fuera del corte pide excepción con motivo', () => {
    const tarde = ped('1', { importadoEn: '2026-10-14T22:00:00Z' })
    expect(validarPlan(base([tarde]))).toEqual(['El pedido PED-1 llegó después del corte de las 16:00 de la víspera: marca la excepción y escribe el motivo.'])
    expect(validarPlan({ ...base([tarde]), plan: { fecha: '2026-10-15', paradas: [{ pedidoId: '1', excepcionCorte: true }] } })).toEqual(['La excepción del pedido PED-1 necesita un motivo.'])
    expect(validarPlan({ ...base([tarde]), plan: { fecha: '2026-10-15', paradas: [{ pedidoId: '1', excepcionCorte: true, motivoExcepcion: 'Urgente' }] } })).toEqual([])
  })
})

describe('ordenSugerido', () => {
  it('por distrito, cita y cliente; sin distrito al final', () => {
    const o = ordenSugerido([{ cliente: 'B', distrito: 'Surco' }, { cliente: 'A', distrito: 'Ate' }, { cliente: 'C' }, { cliente: 'D', distrito: 'Ate', ventanaCita: '8:00' }])
    expect(o.map((x) => x.cliente)).toEqual(['A', 'D', 'B', 'C'])
  })
})

describe('paradas por orden (SA-6): venta manual sin pedido en la bandeja, muestra y devolución al proveedor', () => {
  const ord = (n: string, extra: Partial<OrdenPlanificable> = {}): OrdenPlanificable => ({ salidaId: n, clave: claveDeOrden(n), numero: `OS-2026-0000${n}`, tipo: 'DISTRIBUCION', pedidoNumero: `PED-M${n}`, cliente: `Botica ${n}`, lineas: 1, unidades: 5, creadaEn: '2026-10-14T15:00:00Z', sinStock: false, ...extra })
  const conOrdenes = (ordenes: OrdenPlanificable[], extra: Partial<Parameters<typeof validarPlan>[0]> = {}) =>
    ({ hoy: '2026-10-14', corte: '16:00', plan: { fecha: '2026-10-15', paradas: ordenes.map((o) => ({ salidaId: o.salidaId })) }, vehiculo: veh(), pedidos: new Map(), enOtraRuta: new Map(), ordenes: new Map(ordenes.map((o) => [o.clave, o])), ordenesEnOtraRuta: new Map(), ...extra })

  it('la clave de una parada es el pedido o «orden:<id>»', () => {
    expect(clavePlanParada({ pedidoId: 'p1' })).toBe('p1')
    expect(clavePlanParada({ salidaId: 's1' })).toBe('orden:s1')
    expect(clavePlanParada({})).toBe('')
  })
  it('un plan con órdenes correctas y pedidos mezclados no tiene errores', () => {
    expect(validarPlan(conOrdenes([ord('1'), ord('2', { tipo: 'MUESTRA', pedidoNumero: undefined })]))).toEqual([])
    const e = conOrdenes([ord('1')], { pedidos: new Map([['9', ped('9')]]), plan: { fecha: '2026-10-15', paradas: [{ pedidoId: '9' }, { salidaId: '1' }] } })
    expect(validarPlan(e)).toEqual([])
  })
  it('una orden repetida, en otra ruta o desconocida; y la de un cliente de almacenamiento no entra', () => {
    expect(validarPlan({ ...conOrdenes([ord('1')]), plan: { fecha: '2026-10-15', paradas: [{ salidaId: '1' }, { salidaId: '1' }] } })).toEqual(['Hay un pedido o una orden repetida en la ruta.'])
    expect(validarPlan(conOrdenes([ord('1')], { ordenesEnOtraRuta: new Map([['orden:1', 'RUT-2026-00004']]) }))).toEqual(['La orden OS-2026-00001 ya está en la ruta RUT-2026-00004.'])
    expect(validarPlan({ ...conOrdenes([]), plan: { fecha: '2026-10-15', paradas: [{ salidaId: 'x' }] } })).toEqual(['Una de las órdenes ya no se puede planificar.'])
    expect(validarPlan(conOrdenes([ord('1', { tipo: 'CLIENTE' })]))).toEqual(['La orden OS-2026-00001 es por cuenta de un cliente de almacenamiento: no va en una ruta de Logisalud, se entrega al transportista del cliente.'])
  })
  it('el corte vale también para una orden: creada después del corte pide excepción con motivo', () => {
    const tarde = ord('1', { creadaEn: '2026-10-14T22:00:00Z' })
    expect(validarPlan(conOrdenes([tarde]))).toEqual(['La orden OS-2026-00001 se creó después del corte de las 16:00 de la víspera: marca la excepción y escribe el motivo.'])
    expect(validarPlan({ ...conOrdenes([tarde]), plan: { fecha: '2026-10-15', paradas: [{ salidaId: '1', excepcionCorte: true }] } })).toEqual(['La excepción de la orden OS-2026-00001 necesita un motivo.'])
    expect(validarPlan({ ...conOrdenes([tarde]), plan: { fecha: '2026-10-15', paradas: [{ salidaId: '1', excepcionCorte: true, motivoExcepcion: 'Urgente' }] } })).toEqual([])
  })
  it('el buscador de órdenes encuentra por número de orden, de pedido, cliente o RUC', () => {
    const lista = [ord('1', { ruc: '20123456789' }), ord('2', { cliente: 'Clínica Sur', pedidoNumero: undefined })]
    expect(filtrarOrdenesPlanificables(lista, 'ped-m1').map((o) => o.salidaId)).toEqual(['1'])
    expect(filtrarOrdenesPlanificables(lista, 'clinica').map((o) => o.salidaId)).toEqual(['2'])
    expect(filtrarOrdenesPlanificables(lista, '2012345').map((o) => o.salidaId)).toEqual(['1'])
    expect(filtrarOrdenesPlanificables(lista, '')).toHaveLength(2)
  })
})
