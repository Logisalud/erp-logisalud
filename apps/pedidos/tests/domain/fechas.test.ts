import { describe, expect, it } from 'vitest'
import { esFechaCeroDeExcel, formatearFechaProveedor } from '@/domain/fechas'

describe('esFechaCeroDeExcel', () => {
  it('reconoce el cero del calendario de Excel', () => {
    expect(esFechaCeroDeExcel('1899-12-30')).toBe(true)
    // Con hora pegada, como puede venir de un timestamptz.
    expect(esFechaCeroDeExcel('1899-12-30T00:00:00Z')).toBe(true)
    // El cero del calendario base 1904 (Excel de Mac).
    expect(esFechaCeroDeExcel('1899-12-31')).toBe(true)
  })

  it('no marca fechas reales ni valores vacíos', () => {
    expect(esFechaCeroDeExcel('2027-12-31')).toBe(false)
    expect(esFechaCeroDeExcel('1900-01-01')).toBe(false)
    expect(esFechaCeroDeExcel(null)).toBe(false)
    expect(esFechaCeroDeExcel(undefined)).toBe(false)
    expect(esFechaCeroDeExcel('')).toBe(false)
  })
})

describe('formatearFechaProveedor', () => {
  it('muestra "No informado" para el cero de Excel', () => {
    // Es el caso real de DHP216, importado del proyecto de Andrés.
    expect(formatearFechaProveedor('1899-12-30')).toBe('No informado')
  })

  it('muestra "No informado" cuando no hay dato', () => {
    expect(formatearFechaProveedor(null)).toBe('No informado')
    expect(formatearFechaProveedor(undefined)).toBe('No informado')
  })

  it('acepta otro texto para el vacío', () => {
    expect(formatearFechaProveedor('1899-12-30', 'Sin fecha')).toBe('Sin fecha')
    expect(formatearFechaProveedor(null, '—')).toBe('—')
  })

  it('formatea una fecha real como dd/mm/aaaa', () => {
    expect(formatearFechaProveedor('2027-12-31')).toBe('31/12/2027')
    expect(formatearFechaProveedor('2026-08-02')).toBe('02/08/2026')
  })

  it('no corre la fecha un día por zona horaria', () => {
    // Con `new Date('2026-01-01')` + toLocaleDateString en Perú (UTC-5) esto
    // daría 31/12/2025. Por eso se formatea con las partes del texto.
    expect(formatearFechaProveedor('2026-01-01')).toBe('01/01/2026')
  })
})
