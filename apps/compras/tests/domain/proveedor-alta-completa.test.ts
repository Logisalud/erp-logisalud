import { describe, expect, it } from 'vitest'
import {
  faltaCuentaBancaria,
  validarAltaCompleta,
  validarCuentaBancariaCompleta,
  validarProveedor,
  type BorradorProveedorUnificado,
  type CuentaBancariaBorrador,
} from '@/domain/proveedor'

const proveedor: BorradorProveedorUnificado = {
  tipo: 'mercaderia',
  ruc: '20512345678',
  razonSocial: 'Distribuidora Ejemplo SAC',
  condicionPagoDias: 90,
  monedaPrincipal: 'PEN',
}

const cuenta: CuentaBancariaBorrador = {
  banco: 'BCP',
  numeroCuenta: '191-1234567-0-11',
  cci: '00219100123456701150',
  titular: 'Distribuidora Ejemplo SAC',
  moneda: 'PEN',
}

describe('validarAltaCompleta', () => {
  it('un alta con proveedor y cuenta completos no tiene errores', () => {
    expect(validarAltaCompleta(proveedor, cuenta)).toEqual([])
  })

  it('exige la cuenta bancaria — es el punto de la pieza', () => {
    const errores = validarAltaCompleta(proveedor, { numeroCuenta: '', cci: '', titular: '' })
    expect(errores.some((e) => e.campo === 'numeroCuenta')).toBe(true)
    expect(errores.some((e) => e.campo === 'cci')).toBe(true)
    expect(errores.some((e) => e.campo === 'titular')).toBe(true)
    expect(errores.some((e) => e.campo === 'banco')).toBe(true)
  })

  it('acumula los errores del proveedor Y los de la cuenta, no se detiene en los primeros', () => {
    const errores = validarAltaCompleta({ ...proveedor, ruc: '123' }, { ...cuenta, cci: '999' })
    expect(errores.some((e) => e.campo === 'ruc')).toBe(true)
    expect(errores.some((e) => e.campo === 'cci')).toBe(true)
  })
})

describe('validarCuentaBancariaCompleta', () => {
  it('el CCI tiene que tener 20 dígitos exactos, como el CHECK de la tabla', () => {
    expect(validarCuentaBancariaCompleta({ ...cuenta, cci: '1234567890123456789' }).some((e) => e.campo === 'cci')).toBe(true)
    expect(validarCuentaBancariaCompleta({ ...cuenta, cci: '002191001234567011501' }).some((e) => e.campo === 'cci')).toBe(true)
  })

  it('la moneda de la cuenta tiene que ser PEN o USD', () => {
    expect(validarCuentaBancariaCompleta({ ...cuenta, moneda: 'EUR' }).some((e) => e.campo === 'monedaCuenta')).toBe(true)
  })
})

describe('el alta rápida sigue sin exigir cuenta', () => {
  it('validarProveedor no pide nada bancario — el combobox de una OC no puede frenarse a pedir el CCI', () => {
    expect(validarProveedor(proveedor)).toEqual([])
  })
})

describe('faltaCuentaBancaria', () => {
  it('sin cuentas hay que avisar; con al menos una, no', () => {
    expect(faltaCuentaBancaria(0)).toBe(true)
    expect(faltaCuentaBancaria(1)).toBe(false)
  })
})
