import { describe, expect, it } from 'vitest'
import { asignarLinea, loteApto, type LoteDisponible } from '@/domain/salidas'

const HOY = '2026-10-14'
const lote = (codigo: string, vence: string | null, disponible: number, extra: Partial<LoteDisponible> = {}): LoteDisponible => ({ loteId: `l:${codigo}`, codigo, vence, disponible, ...extra })
const venta = (cantidad: number, lotes: LoteDisponible[]) => asignarLinea({ tipo: 'DISTRIBUCION', motivo: 'VENTA', cantidad, hoy: HOY, lotes })

describe('aptitud del lote', () => {
  it('Logissa nunca sale vencido; la venta pide 60 días (inclusive); las muestras no', () => {
    expect(loteApto('2026-10-13', 'DISTRIBUCION', 'VENTA', HOY).apto).toBe(false)
    expect(loteApto('2026-10-13', 'MUESTRA', 'MUESTRA', HOY).apto).toBe(false)
    expect(loteApto('2026-12-13', 'DISTRIBUCION', 'VENTA', HOY).apto).toBe(true) // 60 días justos
    expect(loteApto('2026-12-12', 'DISTRIBUCION', 'VENTA', HOY).apto).toBe(false) // 59
    expect(loteApto('2026-10-20', 'MUESTRA', 'MUESTRA', HOY).apto).toBe(true)
  })
  it('un cliente solo saca un lote vencido con pesquisa, destrucción o devolución, y con aprobación de Dirección Técnica', () => {
    expect(loteApto('2026-09-01', 'CLIENTE', 'VENTA', HOY).apto).toBe(false)
    for (const m of ['PESQUISA_DIGEMID', 'DESTRUCCION', 'DEVOLUCION_PROVEEDOR'] as const) {
      expect(loteApto('2026-09-01', 'CLIENTE', m, HOY)).toMatchObject({ apto: true, requiereAprobacionDt: true })
    }
    expect(loteApto('2026-10-20', 'CLIENTE', 'VENTA', HOY)).toMatchObject({ apto: true, requiereAprobacionDt: false }) // el mínimo de 60 días no es del cliente
  })
})

describe('asignación de una línea', () => {
  it('tipo A: alcanza con el primer lote FEFO → una sola asignación', () => {
    const r = venta(50, [lote('B', '2027-06-01', 100), lote('A', '2027-01-01', 80)])
    expect(r).toEqual({ ok: true, asignaciones: [{ loteId: 'l:A', codigo: 'A', vence: '2027-01-01', cantidad: 50 }] })
  })

  it('tipo A: si el lote FEFO no alcanza, toma lo que hay y completa con el siguiente lote válido', () => {
    const r = venta(80, [lote('C', '2027-09-01', 100), lote('A', '2027-01-01', 30), lote('B', '2027-03-01', 40)])
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.asignaciones.map((a) => [a.codigo, a.cantidad])).toEqual([['A', 30], ['B', 40], ['C', 10]])
  })

  it('salta los vencidos, los de menos de 60 días, los bloqueados y los sin disponible; nunca toma más de lo disponible', () => {
    const r = venta(70, [
      lote('VENCIDO', '2026-09-01', 500), lote('CORTO', '2026-11-01', 500), lote('BLOQ', '2027-01-01', 500, { bloqueado: true }),
      lote('VACIO', '2027-02-01', 0), lote('A', '2027-03-01', 20), lote('B', '2027-05-01', 60),
    ])
    expect(r).toMatchObject({ ok: true })
    if (r.ok) {
      expect(r.asignaciones.map((a) => [a.codigo, a.cantidad])).toEqual([['A', 20], ['B', 50]])
      expect(r.asignaciones.every((a) => a.cantidad > 0)).toBe(true)
    }
  })

  it('ni sumando los lotes alcanza: no se asigna nada y se explica con el total apto (alerta de stock insuficiente)', () => {
    const r = venta(50, [lote('A', '2027-01-01', 20), lote('B', '2027-02-01', 15), lote('CORTO', '2026-10-30', 400)])
    expect(r).toEqual({ ok: false, motivo: 'STOCK_INSUFICIENTE', pedido: 50, aptoTotal: 35, mensaje: 'Stock insuficiente: la línea pide 50 y, sumando todos los lotes aptos, hay 35.' })
  })

  it('muestras de Logissa: FEFO sin el mínimo de 60 días, también en varios lotes', () => {
    const r = asignarLinea({ tipo: 'MUESTRA', motivo: 'MUESTRA', cantidad: 12, hoy: HOY, lotes: [lote('A', '2026-10-20', 5), lote('B', '2027-01-01', 50)] })
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.asignaciones.map((a) => [a.codigo, a.cantidad])).toEqual([['A', 5], ['B', 7]])
  })

  it('tipo B: una línea, un lote, el que indica el cliente: no se completa con otro lote', () => {
    const lotes = [lote('X', '2027-01-01', 30), lote('Y', '2027-06-01', 100)]
    expect(asignarLinea({ tipo: 'CLIENTE', motivo: 'VENTA', cantidad: 20, hoy: HOY, lotes, loteIndicadoId: 'l:X' })).toMatchObject({ ok: true, asignaciones: [{ codigo: 'X', cantidad: 20 }] })
    const r = asignarLinea({ tipo: 'CLIENTE', motivo: 'VENTA', cantidad: 50, hoy: HOY, lotes, loteIndicadoId: 'l:X' }) // 30 en X: pide dos líneas
    expect(r).toMatchObject({ ok: false, motivo: 'STOCK_INSUFICIENTE', aptoTotal: 30 })
  })

  it('tipo B: un lote vencido solo con los tres motivos; la cantidad debe ser entera y positiva', () => {
    const lotes = [lote('V', '2026-09-01', 40)]
    expect(asignarLinea({ tipo: 'CLIENTE', motivo: 'VENTA', cantidad: 10, hoy: HOY, lotes, loteIndicadoId: 'l:V' }).ok).toBe(false)
    expect(asignarLinea({ tipo: 'CLIENTE', motivo: 'DESTRUCCION', cantidad: 10, hoy: HOY, lotes, loteIndicadoId: 'l:V' }).ok).toBe(true)
    expect(() => venta(0, [])).toThrow()
    expect(() => venta(1.5, [])).toThrow()
  })
})
