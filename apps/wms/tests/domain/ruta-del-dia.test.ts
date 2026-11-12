import { describe, expect, it } from 'vitest'
import { armarRutaDelDia, condicionDeParada } from '@/domain/ruta-del-dia'
import type { RutaVista } from '@/domain/rutas'

const parada = (o: Record<string, unknown>) => ({ id: 'p', secuencia: 1, clave: 'c', origen: 'PEDIDO', pedidoNumero: 'PED-1', cliente: 'Cliente', lineas: 1, unidades: 1, stock: 'ASIGNADA', excepcionCorte: false, ...o })
const ruta = { id: 'r', numero: 'RUT-9', fecha: '2026-11-12', estado: 'PLANIFICADA', version: 1, vehiculo: { placa: 'ABC-123' }, conductor: { nombre: 'Hans' }, auxiliar: { nombre: 'Sandra' }, paradas: [
  parada({ id: 'b', secuencia: 2, cliente: 'Segundo', salidaId: 's2', tipoOrden: 'MUESTRA' }),
  parada({ id: 'a', secuencia: 1, cliente: 'Primero', salidaId: 's1', tipoOrden: 'DISTRIBUCION', direccion: 'Av. Lima 1', distrito: 'SJL', telefono: '995021257', vendedor: 'Cintya Vilchez', condicionPago: 'CONTADO', ventanaCita: '8AM A 12PM' }),
] } as unknown as RutaVista

describe('ruta del día', () => {
  it('una fila por parada en el orden de la ruta, con las columnas del formato y «—» donde no hay dato', () => {
    const r = armarRutaDelDia(ruta, new Map([['s1', 'TTT1-00003315']]))
    expect(r).toMatchObject({ numero: 'RUT-9', fecha: '2026-11-12', vehiculo: 'ABC-123', conductor: 'Hans', auxiliar: 'Sandra' })
    expect(r.filas[0]).toEqual({ n: 1, cliente: 'Primero', telefono: '995021257', condicion: 'DESPACHO', guia: 'TTT1-00003315', direccion: 'Av. Lima 1', destino: 'SJL', transportista: 'Hans', representante: 'Cintya Vilchez', formaPago: 'CONTADO', horario: '8AM A 12PM' })
    expect(r.filas[1]).toMatchObject({ n: 2, cliente: 'Segundo', telefono: '—', guia: '—', direccion: '—', representante: '—', formaPago: '—', horario: '—' })
  })
  it('la condición es DESPACHO para una venta y el tipo en los demás casos', () => {
    expect(condicionDeParada('DISTRIBUCION')).toBe('DESPACHO'); expect(condicionDeParada(undefined)).toBe('DESPACHO')
    expect(condicionDeParada('PROVEEDOR')).toBe('DEVOLUCIÓN AL PROVEEDOR')
  })
  it('un pedido anulado o reprogramado se queda en la hoja con su marca (nada se borra); «fuera» sin tipo no lleva marca', () => {
    const con = (tipos: Record<string, 'ANULADO' | 'REPROGRAMADO' | 'FUERA'>) => armarRutaDelDia({ ...ruta, paradas: ruta.paradas.map((p) => (tipos[p.id] ? { ...p, exclusion: { tipo: tipos[p.id], motivo: 'x' } } : p)) }, new Map())
    expect(con({}).filas.map((f) => f.marca)).toEqual([undefined, undefined])
    expect(con({ a: 'ANULADO', b: 'REPROGRAMADO' }).filas.map((f) => [f.cliente, f.marca])).toEqual([['Primero', 'ANULADO'], ['Segundo', 'REPROGRAMADO']])
    expect(con({ a: 'FUERA' }).filas.map((f) => f.marca)).toEqual([undefined, undefined])
  })
  it('los pedidos que salieron del plan (anulado / reprogramado) siguen en la hoja, marcados y en su lugar', () => {
    const [primero, segundo] = [...ruta.paradas].sort((a, b) => a.secuencia - b.secuencia)
    const sale = { ...segundo, secuencia: 2, salidaId: 's9', cliente: 'Se reprograma', exclusion: { tipo: 'REPROGRAMADO' as const, motivo: 'Sale mañana' } }
    const hoja = armarRutaDelDia({ ...ruta, paradas: [primero], excluidas: [sale] }, new Map())
    expect(hoja.filas.map((f) => [f.n, f.cliente, f.marca])).toEqual([[1, 'Primero', undefined], [2, 'Se reprograma', 'REPROGRAMADO']])
  })
})
