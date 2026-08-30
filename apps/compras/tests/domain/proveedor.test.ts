import { describe, expect, it } from 'vitest'
import {
  validarRUC,
  validarCCI,
  enmascararCuenta,
  validarProveedor,
  validarCuentaBancaria,
  puedeDesactivarseSinAviso,
} from '@/domain/proveedor'

describe('validarRUC', () => {
  it('11 dígitos: válido', () => expect(validarRUC('20123456789')).toBe(true))
  it('10 dígitos: inválido', () => expect(validarRUC('2012345678')).toBe(false))
  it('12 dígitos: inválido', () => expect(validarRUC('201234567890')).toBe(false))
  it('con letras: inválido', () => expect(validarRUC('2012345678A')).toBe(false))
  it('con espacios alrededor: válido (se recorta)', () => expect(validarRUC('  20123456789  ')).toBe(true))
})

describe('validarCCI', () => {
  it('20 dígitos: válido', () => expect(validarCCI('00212345678901234567'.slice(0, 20))).toBe(true))
  it('19 dígitos: inválido', () => expect(validarCCI('1234567890123456789')).toBe(false))
  it('21 dígitos: inválido', () => expect(validarCCI('123456789012345678901')).toBe(false))
  it('con guiones: inválido', () => expect(validarCCI('002-123-456789012345-67'.slice(0, 20))).toBe(false))
})

describe('enmascararCuenta', () => {
  it('deja los últimos 4 dígitos visibles', () => {
    const numero = '00219100123456789012' // 20 dígitos
    expect(enmascararCuenta(numero)).toBe('•'.repeat(16) + '9012')
  })
  it('número corto (4 o menos): se muestra completo', () => {
    expect(enmascararCuenta('1234')).toBe('1234')
    expect(enmascararCuenta('12')).toBe('12')
  })
})

describe('validarProveedor', () => {
  const base = { ruc: '20123456789', razonSocial: 'Acme SAC', condicionPagoDias: 30, monedaPrincipal: 'PEN' }
  it('borrador válido: sin errores', () => expect(validarProveedor(base)).toEqual([]))
  it('RUC inválido', () => expect(validarProveedor({ ...base, ruc: '123' }).some((e) => e.campo === 'ruc')).toBe(true))
  it('razón social vacía', () => expect(validarProveedor({ ...base, razonSocial: '  ' }).some((e) => e.campo === 'razonSocial')).toBe(true))
  it('días de pago negativos', () => expect(validarProveedor({ ...base, condicionPagoDias: -1 }).some((e) => e.campo === 'condicionPagoDias')).toBe(true))
  it('moneda inválida', () => expect(validarProveedor({ ...base, monedaPrincipal: 'EUR' }).some((e) => e.campo === 'monedaPrincipal')).toBe(true))
})

describe('validarCuentaBancaria', () => {
  const base = { numeroCuenta: '191-123456-0-12', cci: '00219100123456012345', titular: 'Acme SAC' }
  it('borrador válido: sin errores', () => expect(validarCuentaBancaria(base)).toEqual([]))
  it('CCI corto', () => expect(validarCuentaBancaria({ ...base, cci: '123' }).some((e) => e.campo === 'cci')).toBe(true))
  it('sin número de cuenta', () => expect(validarCuentaBancaria({ ...base, numeroCuenta: '' }).some((e) => e.campo === 'numeroCuenta')).toBe(true))
  it('sin titular', () => expect(validarCuentaBancaria({ ...base, titular: '  ' }).some((e) => e.campo === 'titular')).toBe(true))
})

describe('puedeDesactivarseSinAviso', () => {
  it('sin movimientos: se puede desactivar sin aviso', () => expect(puedeDesactivarseSinAviso(false)).toBe(true))
  it('con movimientos: hay que avisar antes', () => expect(puedeDesactivarseSinAviso(true)).toBe(false))
})
