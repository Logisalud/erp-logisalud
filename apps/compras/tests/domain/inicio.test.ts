import { describe, expect, it } from 'vitest'
import { determinarVistaEntrada } from '@/domain/inicio'

describe('determinarVistaEntrada', () => {
  it('tesoreria, almacen, contabilidad y gerencia tienen vista propia', () => {
    expect(determinarVistaEntrada('tesoreria')).toBe('tesoreria')
    expect(determinarVistaEntrada('almacen')).toBe('almacen')
    expect(determinarVistaEntrada('contabilidad')).toBe('contabilidad')
    expect(determinarVistaEntrada('gerencia')).toBe('gerencia')
  })

  it('admin y áreas sin cola propia (ventas, legal, gestion_humana) caen en la vista genérica', () => {
    expect(determinarVistaEntrada('admin')).toBe('generica')
    expect(determinarVistaEntrada('ventas')).toBe('generica')
    expect(determinarVistaEntrada('legal')).toBe('generica')
    expect(determinarVistaEntrada('gestion_humana')).toBe('generica')
  })

  it('sin área (perfil incompleto): vista genérica', () => {
    expect(determinarVistaEntrada(null)).toBe('generica')
    expect(determinarVistaEntrada(undefined)).toBe('generica')
  })
})
