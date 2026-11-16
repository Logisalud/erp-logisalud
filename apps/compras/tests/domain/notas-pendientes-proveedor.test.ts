import { describe, expect, it } from 'vitest'
import {
  clasificarDiferencia, filtrarNotasPendientes, leerFiltroNotasPendientes, puedeRegistrarDocumentoExcedente,
  puedeVerNotasPendientes, resumenPorProveedor, validarDocumentoExcedente, type DiferenciaRecepcion,
} from '@/domain/notas-pendientes-proveedor'

/** El caso real de hoy: Reumasol, OC-2026-0019, 300 unidades que no llegaron. */
const reumasol: DiferenciaRecepcion = {
  lineaId: 'l1', recepcionId: 'r1', fechaRecepcion: '2026-09-25', recibidoPor: 'Charlie Chancco',
  ocCodigo: 'OC-2026-0019', moneda: 'PEN', proveedorId: 'p1', proveedor: 'Reumasol', ruc: '20605601261',
  numeroFactura: 'F002-002161', productoCodigo: 'REU102', producto: 'REUMA SOL NF POTE x 60 G',
  cantidadFactura: 300, cantidadFisica: 0, precioUnitario: 6.8199, exoneradoIgv: false, observaciones: 'No llegó',
  obligacionId: 'o1', obligacionCodigo: 'C-0154', esperaNotaCredito: true, notasCredito: [], documentoExcedente: null,
}
const HOY = '2026-11-16'

describe('cada diferencia', () => {
  it('llegó menos: nota de crédito pendiente mientras la deuda la espera', () => {
    const f = clasificarDiferencia(reumasol, HOY)
    expect(f.tipo).toBe('nota_credito')
    expect(f.diferencia).toBe(300)
    expect(f.montoEstimado).toBe(2414.24) // 300 × 6.8199 × 1.18
    expect(f.estado).toBe('pendiente')
    expect(f.dias).toBe(52)
  })

  it('la NC registrada la cierra, y los días se cuentan hasta que llegó', () => {
    const f = clasificarDiferencia({
      ...reumasol, esperaNotaCredito: false, notasCredito: [{ numero: 'FC02-88', fecha: '2026-10-05' }],
    }, HOY)
    expect(f.estado).toBe('recibida')
    expect(f.documento).toBe('NC FC02-88')
    expect(f.dias).toBe(10)
  })

  it('una NC suelta no cierra el caso si la deuda sigue frenada', () => {
    expect(clasificarDiferencia({ ...reumasol, notasCredito: [{ numero: 'X', fecha: '2026-10-01' }] }, HOY).estado)
      .toBe('pendiente')
  })

  it('llegó más: factura o nota de débito, sin IGV si el producto es exonerado', () => {
    const f = clasificarDiferencia({ ...reumasol, cantidadFactura: 10, cantidadFisica: 12, exoneradoIgv: true, precioUnitario: 5 }, HOY)
    expect(f.tipo).toBe('factura_o_debito')
    expect(f.montoEstimado).toBe(10)
    expect(f.estado).toBe('pendiente')
    const cerrada = clasificarDiferencia({
      ...reumasol, cantidadFactura: 10, cantidadFisica: 12,
      documentoExcedente: { tipo: 'nota_debito', numero: 'ND01-5', fecha: '2026-10-01' },
    }, HOY)
    expect(cerrada.documento).toBe('Nota de débito ND01-5')
  })
})

describe('resumen por proveedor', () => {
  it('suma solo lo pendiente, por moneda, y ordena por el más antiguo', () => {
    const filas = [
      clasificarDiferencia(reumasol, HOY),
      clasificarDiferencia({ ...reumasol, lineaId: 'l2', fechaRecepcion: '2026-11-10', precioUnitario: 1, cantidadFactura: 10 }, HOY),
      clasificarDiferencia({ ...reumasol, lineaId: 'l3', proveedorId: 'p2', proveedor: 'DIMEXA', moneda: 'USD', fechaRecepcion: '2026-11-15' }, HOY),
      clasificarDiferencia({ ...reumasol, lineaId: 'l4', esperaNotaCredito: false, notasCredito: [{ numero: 'a', fecha: '2026-10-01' }] }, HOY),
    ]
    const r = resumenPorProveedor(filas)
    expect(r.map((x) => x.proveedor)).toEqual(['Reumasol', 'DIMEXA'])
    expect(r[0].casos).toBe(2)
    expect(r[0].montoPorMoneda).toEqual([{ moneda: 'PEN', monto: 2426.04 }])
    expect(r[0].masAntiguo).toBe(52)
    expect(r[1].montoPorMoneda[0].moneda).toBe('USD')
  })
})

describe('filtros', () => {
  it('por defecto muestra lo pendiente', () => {
    expect(leerFiltroNotasPendientes({})).toEqual({ estado: 'pendiente', tipo: 'todos', busqueda: '' })
  })

  it('busca por proveedor, RUC, OC, factura o deuda', () => {
    const filas = [clasificarDiferencia(reumasol, HOY)]
    for (const q of ['reuma', '20605601261', 'oc-2026-0019', 'F002', 'c-0154']) {
      expect(filtrarNotasPendientes(filas, { estado: 'todas', tipo: 'todos', busqueda: q })).toHaveLength(1)
    }
    expect(filtrarNotasPendientes(filas, { estado: 'recibida', tipo: 'todos', busqueda: '' })).toHaveLength(0)
  })
})

it('lo ven Contabilidad, Gerencia y Tesorería; registra documentos solo Contabilidad', () => {
  expect(['contabilidad', 'gerencia', 'tesoreria', 'admin'].every(puedeVerNotasPendientes)).toBe(true)
  expect(puedeVerNotasPendientes('almacen')).toBe(false)
  expect(puedeRegistrarDocumentoExcedente('contabilidad')).toBe(true)
  expect(puedeRegistrarDocumentoExcedente('tesoreria')).toBe(false)
})

it('el documento del excedente pide tipo, número, fecha, archivo y líneas', () => {
  const ok = { tipo: 'nota_debito', numero: 'ND01-5', fechaEmision: '2026-11-10', storagePath: 'x.pdf', lineas: ['l1'] }
  expect(validarDocumentoExcedente(ok)).toBeNull()
  expect(validarDocumentoExcedente({ ...ok, tipo: 'boleta' })).toContain('factura o nota de débito')
  expect(validarDocumentoExcedente({ ...ok, storagePath: null })).toContain('archivo')
  expect(validarDocumentoExcedente({ ...ok, lineas: [] })).toContain('líneas')
})
