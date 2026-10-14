import { describe, expect, it } from 'vitest'
import { fueraDeCorte, horaLima, ordenSugerido, validarPlan, type PedidoPlanificable, type VehiculoVista } from '@/domain/rutas'

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
    expect(e).toEqual(expect.arrayContaining(['La fecha de la ruta no puede ser anterior a hoy.', 'El conductor y el auxiliar deben ser personas distintas.', 'El vehículo ABC-123 está inactivo.', 'Hay un pedido repetido en la ruta.']))
  })
  it('vehículo calificado, cambio por revisar, otra ruta y producto desconocido', () => {
    const e = validarPlan(base([ped('1', { vehiculoCalificado: 'Furgón' }), ped('2', { cambioPorRevisar: true }), ped('3'), ped('4', { sinCatalogo: ['X-9'] })], { enOtraRuta: new Map([['3', 'RUT-2026-00001']]) }))
    expect(e).toEqual(expect.arrayContaining([
      'El cliente de PED-1 exige un vehículo calificado.', 'El pedido PED-2 cambió en Pedidos: revisa el cambio antes de planificarlo.',
      'El pedido PED-3 ya está en la ruta RUT-2026-00001.', 'El pedido PED-4 trae un producto que el WMS no conoce (X-9): Dirección Técnica debe darlo de alta.',
    ]))
    expect(validarPlan(base([ped('1', { vehiculoCalificado: 'Furgón' })], { vehiculo: veh({ calificado: true }) }))).toEqual([])
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
