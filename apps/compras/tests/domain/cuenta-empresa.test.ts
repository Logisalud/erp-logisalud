import { describe, expect, it } from 'vitest'
import { cuentaEmpresaPorDefecto, etiquetaCuentaEmpresa, type CuentaEmpresa } from '@/domain/cuenta-empresa'

/** Las cuatro que pasó Mariela (2026-09-30), tal cual quedaron en la 0075. */
const cuenta = (codigoInterno: string, nombre: string, numeroCuenta: string, moneda: string, esPredeterminada = false): CuentaEmpresa => ({
  id: codigoInterno, codigoInterno, nombre, banco: nombre.split(' ')[0], numeroCuenta, moneda, esPredeterminada,
})
const bcpSoles1 = cuenta('CF010', 'BCP SOLES 1', '1917315019079', 'PEN', true)
const bcpSoles2 = cuenta('CF003', 'BCP SOLES 2', '1949920143063', 'PEN')
const bcpDolares = cuenta('CF004', 'BCP DÓLARES', '1939948625169', 'USD')
const interbank = cuenta('CF005', 'INTERBANK SOLES', '2003006303674', 'PEN')
const las4 = [bcpSoles2, bcpDolares, interbank, bcpSoles1] // desordenadas a propósito

describe('cuenta de origen preseleccionada', () => {
  it('un pago en soles sale por defecto de la 79 (CF010, BCP SOLES 1) — pedido de Sebas', () => {
    expect(cuentaEmpresaPorDefecto(las4, 'PEN')?.codigoInterno).toBe('CF010')
  })

  it('un pago en dólares NO propone una cuenta en soles: propone BCP DÓLARES', () => {
    // Si viniera la 79, Tesorería tendría que acordarse de cambiarla en cada
    // pago en USD, y el día que no se acuerde el sistema dice que salió de
    // una cuenta de la que no salió.
    expect(cuentaEmpresaPorDefecto(las4, 'USD')?.codigoInterno).toBe('CF004')
  })

  it('no depende del orden en que vengan de la base', () => {
    expect(cuentaEmpresaPorDefecto([...las4].reverse(), 'PEN')?.codigoInterno).toBe('CF010')
  })

  it('si no hay ninguna de la moneda del pago, cae en la predeterminada', () => {
    expect(cuentaEmpresaPorDefecto([bcpSoles1, bcpSoles2], 'USD')?.codigoInterno).toBe('CF010')
  })

  it('sin predeterminada, la primera de esa moneda', () => {
    expect(cuentaEmpresaPorDefecto([bcpDolares, bcpSoles2, interbank], 'PEN')?.codigoInterno).toBe('CF003')
  })

  it('sin cuentas, nada', () => {
    expect(cuentaEmpresaPorDefecto([], 'PEN')).toBeNull()
  })
})

describe('cómo se muestra', () => {
  it('nombre y número, que es como la reconoce Contabilidad en el extracto', () => {
    expect(etiquetaCuentaEmpresa(bcpSoles1)).toBe('BCP SOLES 1 — 1917315019079')
  })
})
