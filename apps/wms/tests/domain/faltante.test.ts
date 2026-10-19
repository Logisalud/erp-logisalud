// SA-3: por qué falta stock. Las cuatro causas (sin stock, Cuarentena, Reserva, vencimiento menor a 60 días), con cantidades.
import { describe, expect, it } from 'vitest'
import { explicarFaltante, listarCausas, textoFaltante, type ExistenciaLote } from '@/domain/faltante'

const HOY = '2026-10-14'
const ex = (codigo: string, cantidad: number, extra: Partial<ExistenciaLote> = {}): ExistenciaLote => ({ loteId: `l:${codigo}`, codigo, vence: '2028-06-30', estado: 'APROBADO', cantidad, ...extra })
const explicar = (pedido: number, existencias: ExistenciaLote[], extra = {}) => explicarFaltante({ pedido, hoy: HOY, existencias, ...extra })

describe('explicarFaltante', () => {
  it('si alcanza, no hay faltante', () => {
    const r = explicar(30, [ex('A', 20), ex('B', 20)])
    expect(r).toMatchObject({ hayFaltante: false, faltan: 0, disponibles: 40 })
    expect(r.texto).toBe('Hay stock suficiente: pide 30 y hay 40 disponibles.')
  })

  it('sin nada de nada: todo lo que falta es «sin stock»', () => {
    const r = explicar(50, [])
    expect(r).toMatchObject({ disponibles: 0, faltan: 50, causas: { SIN_STOCK: 50, CUARENTENA: 0, RESERVA: 0, VENCIMIENTO_MENOR_60: 0 } })
    expect(r.texto).toBe('Stock insuficiente: pide 50 y hay 0 disponibles. Faltan 50: 50 sin stock.')
  })

  it('causa 1 · Cuarentena: el stock existe pero todavía no se aprobó', () => {
    const r = explicar(50, [ex('A', 30), ex('C', 15, { estado: 'CUARENTENA' })])
    expect(r.causas).toEqual({ SIN_STOCK: 5, CUARENTENA: 15, RESERVA: 0, VENCIMIENTO_MENOR_60: 0 })
    expect(r.texto).toBe('Stock insuficiente: pide 50 y hay 30 disponibles. Faltan 20: 15 en Cuarentena y 5 sin stock.')
  })

  it('causa 2 · Reserva: el lote está Aprobado pero Reservado (no se asigna)', () => {
    const r = explicar(50, [ex('A', 30), ex('R', 12, { reservado: true })])
    expect(r.causas).toMatchObject({ RESERVA: 12, SIN_STOCK: 8 })
    expect(r.texto).toMatch(/12 en Reserva y 8 sin stock/)
  })

  it('causa 3 · vencimiento menor a 60 días: el lote está Aprobado pero vence pronto (o ya venció)', () => {
    const r = explicar(50, [ex('A', 30), ex('P', 9, { vence: '2026-11-20' }), ex('V', 4, { vence: '2026-09-01' })])
    expect(r.causas).toMatchObject({ VENCIMIENTO_MENOR_60: 13, SIN_STOCK: 7 })
    expect(r.texto).toMatch(/13 con vencimiento menor a 60 días y 7 sin stock/)
    expect(explicar(10, [ex('Justo', 10, { vence: '2026-12-13' })]).hayFaltante).toBe(false) // 60 días justos sí sirve
    expect(explicar(10, [ex('Casi', 10, { vence: '2026-12-12' })]).causas.VENCIMIENTO_MENOR_60).toBe(10)
  })

  it('las cuatro causas juntas, con cantidades, y la suma de las causas es lo que falta', () => {
    const r = explicar(100, [ex('A', 40), ex('C', 25, { estado: 'CUARENTENA' }), ex('R', 10, { reservado: true }), ex('P', 5, { vence: '2026-10-30' })])
    expect(r.disponibles).toBe(40)
    expect(r.faltan).toBe(60)
    expect(r.causas).toEqual({ CUARENTENA: 25, RESERVA: 10, VENCIMIENTO_MENOR_60: 5, SIN_STOCK: 20 })
    expect(Object.values(r.causas).reduce((t, n) => t + n, 0)).toBe(r.faltan)
    expect(r.texto).toBe('Stock insuficiente: pide 100 y hay 40 disponibles. Faltan 60: 25 en Cuarentena, 10 en Reserva, 5 con vencimiento menor a 60 días y 20 sin stock.')
  })

  it('lo que existe y no se puede usar nunca se cuenta más que lo que falta; el detalle conserva lo completo', () => {
    const r = explicar(20, [ex('A', 15), ex('C', 100, { estado: 'CUARENTENA' }), ex('R', 50, { reservado: true })])
    expect(r.faltan).toBe(5)
    expect(r.causas).toEqual({ CUARENTENA: 5, RESERVA: 0, VENCIMIENTO_MENOR_60: 0, SIN_STOCK: 0 })
    expect(r.existentes).toMatchObject({ cuarentena: 100, reserva: 50 })
  })

  it('un lote en Reserva y a la vez por vencer cuenta una sola vez, como Reserva; lo de otros estados (Bajas, Devoluciones) no cuenta', () => {
    const r = explicar(10, [ex('X', 8, { reservado: true, vence: '2026-10-20' }), ex('D', 50, { estado: 'DEVOLUCIONES' }), ex('B', 50, { estado: 'BAJAS_RECHAZADOS' })])
    expect(r.existentes).toEqual({ cuarentena: 0, reserva: 8, vencimiento: 0, enConteo: 0 })
    expect(r.causas).toMatchObject({ RESERVA: 8, SIN_STOCK: 2 })
  })

  it('las unidades en una ubicación en conteo no se usan: quedan como «sin stock» y se anotan aparte', () => {
    const r = explicar(10, [ex('A', 6), ex('K', 6, { enConteo: true })])
    expect(r).toMatchObject({ disponibles: 6, faltan: 4, existentes: { enConteo: 6 }, causas: { SIN_STOCK: 4 } })
  })

  it('si la línea indica su lote (cliente de almacenamiento), solo cuenta ese lote', () => {
    const r = explicarFaltante({ pedido: 10, hoy: HOY, tipo: 'CLIENTE', motivo: 'VENTA', loteIndicadoId: 'l:A', existencias: [ex('A', 4), ex('B', 100)] })
    expect(r).toMatchObject({ disponibles: 4, faltan: 6 })
  })

  it('una venta de Logissa pide 60 días; una muestra no', () => {
    const lotes = [ex('P', 10, { vence: '2026-10-30' })]
    expect(explicar(10, lotes).hayFaltante).toBe(true)
    expect(explicarFaltante({ pedido: 10, hoy: HOY, tipo: 'MUESTRA', motivo: 'MUESTRA', existencias: lotes }).hayFaltante).toBe(false)
  })

  it('rechaza una cantidad pedida que no es un entero positivo', () => {
    expect(() => explicar(0, [])).toThrow()
    expect(() => explicar(1.5, [])).toThrow()
  })
})

describe('el texto', () => {
  it('lista las causas sin ceros, con comas y una «y» al final', () => {
    expect(listarCausas({ SIN_STOCK: 0, CUARENTENA: 0, RESERVA: 0, VENCIMIENTO_MENOR_60: 0 })).toBe('')
    expect(listarCausas({ SIN_STOCK: 3, CUARENTENA: 0, RESERVA: 0, VENCIMIENTO_MENOR_60: 0 })).toBe('3 sin stock')
    expect(listarCausas({ SIN_STOCK: 3, CUARENTENA: 2, RESERVA: 0, VENCIMIENTO_MENOR_60: 0 })).toBe('2 en Cuarentena y 3 sin stock')
    expect(textoFaltante(9, 4, 5, { SIN_STOCK: 1, CUARENTENA: 2, RESERVA: 1, VENCIMIENTO_MENOR_60: 1 })).toBe('Stock insuficiente: pide 9 y hay 4 disponibles. Faltan 5: 2 en Cuarentena, 1 en Reserva, 1 con vencimiento menor a 60 días y 1 sin stock.')
  })
})
