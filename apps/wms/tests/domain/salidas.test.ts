import { describe, expect, it } from 'vitest'
import { asignarLinea, emiteGuiaDelWms, loteApto, origenDelStock, validarMotivoSalida, type LoteDisponible } from '@/domain/salidas'

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
  it('lo vencido no sale por ninguna salida: ni Logissa ni un cliente (pesquisa, venta, muestra o devolución); va a Bajas', () => {
    for (const m of ['VENTA', 'PESQUISA_DIGEMID', 'MUESTRA'] as const) expect(loteApto('2026-09-01', 'CLIENTE', m, HOY)).toMatchObject({ apto: false, requiereAprobacionDt: false })
    expect(loteApto('2026-09-01', 'CLIENTE', 'PESQUISA_DIGEMID', HOY).razon).toMatch(/pesquisa DIGEMID nunca es de lotes vencidos/)
    expect(loteApto('2026-09-01', 'PROVEEDOR', 'DEVOLUCION_PROVEEDOR', HOY).razon).toMatch(/no se devuelve vencido a nadie/)
    expect(loteApto('2026-09-01', 'DISTRIBUCION', 'VENTA', HOY).razon).toMatch(/solo va a Bajas/)
    expect(loteApto('2026-10-20', 'CLIENTE', 'VENTA', HOY)).toMatchObject({ apto: true, requiereAprobacionDt: false }) // el mínimo de 60 días no es del cliente
    expect(loteApto('2026-10-14', 'CLIENTE', 'PESQUISA_DIGEMID', HOY).apto).toBe(true) // vence hoy: todavía no está vencido
  })
})

describe('devolución al proveedor (Logissa): solo antes del vencimiento y según la política de canje', () => {
  it('sin política (valores iniciales) basta con que no esté vencido; sin fecha no se puede evaluar', () => {
    expect(loteApto('2026-10-14', 'PROVEEDOR', 'DEVOLUCION_PROVEEDOR', HOY, 0).apto).toBe(true)
    expect(loteApto('2026-10-13', 'PROVEEDOR', 'DEVOLUCION_PROVEEDOR', HOY, 0).apto).toBe(false)
    expect(loteApto(null, 'PROVEEDOR', 'DEVOLUCION_PROVEEDOR', HOY, 0).razon).toMatch(/sin fecha|no tiene fecha/i)
  })
  it('la política de canje es configurable: mínimo y máximo de días antes de vencer', () => {
    const canje = { diasMinimos: 30, diasMaximos: 180 }
    expect(loteApto('2026-11-20', 'PROVEEDOR', 'DEVOLUCION_PROVEEDOR', HOY, 0, canje)).toMatchObject({ apto: true }) // faltan 37
    expect(loteApto('2026-11-01', 'PROVEEDOR', 'DEVOLUCION_PROVEEDOR', HOY, 0, canje).razon).toMatch(/al menos 30 días.*le faltan 18/)
    expect(loteApto('2027-06-01', 'PROVEEDOR', 'DEVOLUCION_PROVEEDOR', HOY, 0, canje).razon).toMatch(/180 días o menos/)
  })
  it('lleva su lote indicado: no se completa con otro lote', () => {
    const lotes = [lote('X', '2027-01-01', 30), lote('Y', '2027-06-01', 100)]
    expect(asignarLinea({ tipo: 'PROVEEDOR', motivo: 'DEVOLUCION_PROVEEDOR', cantidad: 50, hoy: HOY, lotes, loteIndicadoId: 'l:X' })).toMatchObject({ ok: false, aptoTotal: 30 })
    expect(asignarLinea({ tipo: 'PROVEEDOR', motivo: 'DEVOLUCION_PROVEEDOR', cantidad: 20, hoy: HOY, lotes, loteIndicadoId: 'l:Y' })).toMatchObject({ ok: true, asignaciones: [{ codigo: 'Y', cantidad: 20 }] })
  })
})

describe('motivos de la salida y de dónde sale el stock', () => {
  it('tipo B: venta, pesquisa DIGEMID, muestra y destrucción; la devolución al proveedor es solo de Logissa', () => {
    for (const m of ['VENTA', 'PESQUISA_DIGEMID', 'MUESTRA', 'DESTRUCCION'] as const) expect(validarMotivoSalida('CLIENTE', m)).toBeNull()
    expect(validarMotivoSalida('CLIENTE', 'DEVOLUCION_PROVEEDOR')).toMatch(/del stock de Logissa/)
    expect(validarMotivoSalida('PROVEEDOR', 'DEVOLUCION_PROVEEDOR')).toBeNull()
    expect(validarMotivoSalida('PROVEEDOR', 'VENTA')).toMatch(/no corresponde/)
    expect(validarMotivoSalida('DISTRIBUCION', 'VENTA')).toBeNull()
    expect(validarMotivoSalida('MUESTRA', 'DESTRUCCION')).toMatch(/no corresponde/)
  })
  it('la destrucción sale solo desde Bajas; lo demás, de Aprobados', () => {
    expect(origenDelStock('DESTRUCCION')).toBe('BAJAS_RECHAZADOS')
    for (const m of ['VENTA', 'PESQUISA_DIGEMID', 'MUESTRA', 'DEVOLUCION_PROVEEDOR'] as const) expect(origenDelStock(m)).toBe('APROBADO')
  })
  it('la salida tipo B no emite guía del WMS (usa la GRE del cliente)', () => {
    expect(emiteGuiaDelWms('CLIENTE')).toBe(false)
    for (const tp of ['DISTRIBUCION', 'MUESTRA', 'PROVEEDOR'] as const) expect(emiteGuiaDelWms(tp)).toBe(true)
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

  it('tipo B: un lote vencido no sale de Aprobados con ningún motivo; la cantidad debe ser entera y positiva', () => {
    const lotes = [lote('V', '2026-09-01', 40)]
    for (const motivo of ['VENTA', 'PESQUISA_DIGEMID', 'MUESTRA'] as const) expect(asignarLinea({ tipo: 'CLIENTE', motivo, cantidad: 10, hoy: HOY, lotes, loteIndicadoId: 'l:V' }).ok).toBe(false)
    expect(() => venta(0, [])).toThrow()
    expect(() => venta(1.5, [])).toThrow()
  })
})

import { avisosFefo, lotesEditables, seApartaDeFefo, textoAvisoFefo, validarEdicionAsignacion } from '@/domain/salidas'

describe('edición libre de la asignación (D-79)', () => {
  const lotes = [lote('A', '2027-01-01', 50), lote('B', '2027-03-01', 40), lote('C', '2027-09-01', 100), lote('ANTES', '2026-12-20', 100), lote('CORTO', '2026-11-01', 100)]
  const base = { cantidadLinea: 50, hoy: HOY, lotes }

  it('cualquier lote válido vale, venza antes o después del FEFO, si la suma es la de la línea', () => {
    expect(validarEdicionAsignacion({ ...base, nueva: [{ loteId: 'l:A', cantidad: 10 }, { loteId: 'l:B', cantidad: 40 }] })).toEqual([])
    expect(validarEdicionAsignacion({ ...base, nueva: [{ loteId: 'l:C', cantidad: 50 }] })).toEqual([])
    expect(validarEdicionAsignacion({ ...base, nueva: [{ loteId: 'l:ANTES', cantidad: 20 }, { loteId: 'l:C', cantidad: 30 }] })).toEqual([])
  })

  it('rechaza: suma distinta, cantidades no positivas, lote repetido, sin 60 días, bloqueado, sin disponible y lote ajeno', () => {
    const err = (nueva: { loteId: string; cantidad: number }[], extra = {}) => validarEdicionAsignacion({ ...base, nueva, ...extra }).join(' | ')
    expect(err([{ loteId: 'l:A', cantidad: 49 }])).toMatch(/La suma de los lotes \(49\)/)
    expect(err([{ loteId: 'l:A', cantidad: 0 }, { loteId: 'l:B', cantidad: 50 }])).toMatch(/mayor que cero/)
    expect(err([{ loteId: 'l:A', cantidad: 25 }, { loteId: 'l:A', cantidad: 25 }])).toMatch(/una sola vez/)
    expect(err([{ loteId: 'l:CORTO', cantidad: 50 }])).toMatch(/vence en 18 días/)
    expect(err([{ loteId: 'l:C', cantidad: 50 }], { lotes: [{ ...lote('C', '2027-09-01', 100), bloqueado: true }] })).toMatch(/bloqueado/)
    expect(err([{ loteId: 'l:C', cantidad: 50 }], { lotes: [lote('C', '2027-09-01', 10)] })).toMatch(/no tiene suficientes unidades/)
    expect(err([{ loteId: 'l:X', cantidad: 50 }])).toMatch(/no corresponde a este producto/)
    expect(err([])).toMatch(/al menos un lote/)
  })

  it('la lista de lotes ofrece solo los válidos, por vencimiento (FEFO primero)', () => {
    expect(lotesEditables({ hoy: HOY, lotes }).map((l) => l.codigo)).toEqual(['ANTES', 'A', 'B', 'C'])
  })

  it('apartarse de FEFO avisa, no bloquea: dice qué lote vence antes; el FEFO no avisa', () => {
    const sinAviso = avisosFefo({ hoy: HOY, lotes, nueva: [{ loteId: 'l:ANTES', cantidad: 50 }] })
    expect(sinAviso).toEqual([])
    const avisos = avisosFefo({ hoy: HOY, lotes, nueva: [{ loteId: 'l:C', cantidad: 50 }] })
    expect(avisos).toEqual([{ loteId: 'l:C', codigo: 'C', antesCodigo: 'ANTES', antesVence: '2026-12-20' }])
    expect(textoAvisoFefo(avisos[0])).toBe('Hay un lote que vence antes (ANTES, vence 12/2026)')
    expect(validarEdicionAsignacion({ ...base, nueva: [{ loteId: 'l:C', cantidad: 50 }] })).toEqual([])
    // el aviso nombra el primero que vence antes y no se eligió (aquí, con ANTES elegido, queda A)
    expect(avisosFefo({ hoy: HOY, lotes, nueva: [{ loteId: 'l:ANTES', cantidad: 20 }, { loteId: 'l:C', cantidad: 30 }] }).map((a) => a.antesCodigo)).toEqual(['A'])
  })

  it('detecta si la asignación final se aparta de la propuesta FEFO', () => {
    const fefo = [{ loteId: 'l:A', cantidad: 30 }, { loteId: 'l:B', cantidad: 20 }]
    expect(seApartaDeFefo(fefo, [{ loteId: 'l:B', cantidad: 20 }, { loteId: 'l:A', cantidad: 30 }])).toBe(false)
    expect(seApartaDeFefo(fefo, [{ loteId: 'l:A', cantidad: 10 }, { loteId: 'l:B', cantidad: 40 }])).toBe(true)
    expect(seApartaDeFefo(fefo, [{ loteId: 'l:C', cantidad: 50 }])).toBe(true)
  })
})
