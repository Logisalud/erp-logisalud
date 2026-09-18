import { describe, expect, it } from 'vitest'
import {
  netoTrasNotaCredito, puedeRegistrarNotaCreditoDeRecepcion,
  validarNotaCreditoDeRecepcion,
} from '@/domain/nota-credito-recepcion'

describe('quién sube la nota de crédito', () => {
  it('Contabilidad con rol admin, y admin', () => {
    expect(puedeRegistrarNotaCreditoDeRecepcion({ area: 'contabilidad', rol: 'admin' })).toBe(true)
    expect(puedeRegistrarNotaCreditoDeRecepcion({ area: 'admin', rol: 'admin' })).toBe(true)
  })

  it('Almacén NO: la NC es un documento tributario, no de recepción', () => {
    expect(puedeRegistrarNotaCreditoDeRecepcion({ area: 'almacen', rol: 'operativo' })).toBe(false)
  })

  it('Beatriz (contabilidad operativo) tampoco, ni sin perfil', () => {
    expect(puedeRegistrarNotaCreditoDeRecepcion({ area: 'contabilidad', rol: 'operativo' })).toBe(false)
    expect(puedeRegistrarNotaCreditoDeRecepcion(null)).toBe(false)
  })
})

describe('validarNotaCreditoDeRecepcion', () => {
  const base = {
    monto: 200,
    totalObligacion: 1180,
    moneda: 'PEN',
    monedaObligacion: 'PEN',
    motivo: 'faltaron 2 unidades',
    numeroNc: 'NC001-000123',
    fechaEmision: '2026-09-18',
    storagePath: 'ruta/nc.pdf',
    hoy: '2026-09-18',
  }

  it('una NC completa y coherente pasa', () => {
    expect(validarNotaCreditoDeRecepcion(base)).toEqual([])
  })

  it('el monto tiene que ser mayor que cero', () => {
    expect(validarNotaCreditoDeRecepcion({ ...base, monto: 0 }).map((e) => e.campo)).toContain('monto')
  })

  it('no puede superar el total de la obligación', () => {
    const errores = validarNotaCreditoDeRecepcion({ ...base, monto: 2000 })
    expect(errores[0].mensaje).toContain('no puede superar')
  })

  it('igual al total sí se acepta: el proveedor anuló la factura entera', () => {
    expect(validarNotaCreditoDeRecepcion({ ...base, monto: 1180 })).toEqual([])
  })

  it('un centavo de diferencia por punto flotante no es un error del usuario', () => {
    expect(validarNotaCreditoDeRecepcion({ ...base, monto: 1180.001 })).toEqual([])
  })

  it('la moneda tiene que coincidir con la de la obligación', () => {
    const errores = validarNotaCreditoDeRecepcion({ ...base, moneda: 'USD' })
    expect(errores.map((e) => e.campo)).toContain('moneda')
    expect(errores[0].mensaje).toContain('PEN')
  })

  it('exige número, motivo, fecha y archivo', () => {
    expect(validarNotaCreditoDeRecepcion({ ...base, numeroNc: '  ' }).map((e) => e.campo)).toContain('numeroNc')
    expect(validarNotaCreditoDeRecepcion({ ...base, motivo: '' }).map((e) => e.campo)).toContain('motivo')
    expect(validarNotaCreditoDeRecepcion({ ...base, fechaEmision: '' }).map((e) => e.campo)).toContain('fechaEmision')
    expect(validarNotaCreditoDeRecepcion({ ...base, storagePath: null }).map((e) => e.campo)).toContain('archivo')
  })

  it('la fecha se compara contra el día de LIMA, no el del servidor', () => {
    // Emitida hoy: válida. En UTC después de las 19:00 de Lima esto se
    // habría rechazado por "futura" — el mismo bug de zona horaria de antes.
    expect(validarNotaCreditoDeRecepcion({ ...base, fechaEmision: '2026-09-18', hoy: '2026-09-18' }))
      .toEqual([])
    expect(validarNotaCreditoDeRecepcion({ ...base, fechaEmision: '2026-09-20', hoy: '2026-09-18' })
      .map((e) => e.campo)).toContain('fechaEmision')
  })
})

describe('netoTrasNotaCredito', () => {
  it('resta la NC del total', () => {
    expect(netoTrasNotaCredito(1180, 236)).toBe(944)
  })

  it('nunca da negativo', () => {
    expect(netoTrasNotaCredito(100, 500)).toBe(0)
  })
})
