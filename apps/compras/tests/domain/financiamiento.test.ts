import { describe, expect, it } from 'vitest'
import {
  estaVencida, generarCuotasIguales, validarCuotas, validarFraccionamiento, validarLetras, validarPrestamo,
} from '@/domain/financiamiento'

const cuotaOk = { numeroCuota: 1, fechaVencimiento: '2026-09-30', montoCapital: 1000, montoInteres: 50 }

describe('generarCuotasIguales', () => {
  it('genera N cuotas del mismo valor, sin interés', () => {
    const cuotas = generarCuotasIguales(3, 500)
    expect(cuotas).toHaveLength(3)
    expect(cuotas.every((c) => c.montoCapital === 500 && c.montoInteres === 0)).toBe(true)
    expect(cuotas.map((c) => c.numeroCuota)).toEqual([1, 2, 3])
  })

  it('espacía las fechas un mes por cuota desde el primer vencimiento', () => {
    const cuotas = generarCuotasIguales(3, 100, '2026-01-15')
    expect(cuotas.map((c) => c.fechaVencimiento)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15'])
  })

  it('deja la fecha vacía si no se pasa un primer vencimiento', () => {
    const cuotas = generarCuotasIguales(2, 100)
    expect(cuotas.every((c) => c.fechaVencimiento === '')).toBe(true)
  })
})

describe('validarCuotas', () => {
  it('exige al menos una cuota', () => {
    expect(validarCuotas([]).some((e) => e.campo === 'cuotas')).toBe(true)
  })

  it('sin errores con una cuota completa', () => {
    expect(validarCuotas([cuotaOk])).toEqual([])
  })

  it('rechaza números de cuota repetidos', () => {
    const errores = validarCuotas([cuotaOk, { ...cuotaOk, numeroCuota: 1 }])
    expect(errores.some((e) => e.mensaje.includes('repetido'))).toBe(true)
  })

  it('exige capital positivo', () => {
    const errores = validarCuotas([{ ...cuotaOk, montoCapital: 0 }])
    expect(errores.some((e) => e.mensaje.includes('capital'))).toBe(true)
  })

  it('acepta interés en 0', () => {
    const errores = validarCuotas([{ ...cuotaOk, montoInteres: 0 }])
    expect(errores).toEqual([])
  })
})

describe('validarPrestamo', () => {
  const base = { entidadFinanciera: 'BCP', montoOriginal: 50000, moneda: 'PEN' as const, cuotas: [cuotaOk] }

  it('sin errores con un borrador completo', () => {
    expect(validarPrestamo(base)).toEqual([])
  })

  it('exige entidad financiera', () => {
    const errores = validarPrestamo({ ...base, entidadFinanciera: '' })
    expect(errores.some((e) => e.campo === 'entidadFinanciera')).toBe(true)
  })

  it('exige monto original positivo', () => {
    const errores = validarPrestamo({ ...base, montoOriginal: 0 })
    expect(errores.some((e) => e.campo === 'montoOriginal')).toBe(true)
  })
})

describe('validarFraccionamiento', () => {
  const base = { numeroExpediente: 'EXP-001', deudaOriginal: 20000, cuotas: [cuotaOk] }

  it('sin errores con un borrador completo', () => {
    expect(validarFraccionamiento(base)).toEqual([])
  })

  it('exige número de expediente', () => {
    const errores = validarFraccionamiento({ ...base, numeroExpediente: '' })
    expect(errores.some((e) => e.campo === 'numeroExpediente')).toBe(true)
  })
})

describe('validarLetras', () => {
  it('exige que la suma de las letras coincida con la obligación', () => {
    const errores = validarLetras([{ monto: 500, fechaVencimiento: '2026-10-01' }], 1000)
    expect(errores.some((e) => e.campo === 'letras' && e.mensaje.includes('suman'))).toBe(true)
  })

  it('sin errores cuando la suma coincide', () => {
    const letras = [{ monto: 500, fechaVencimiento: '2026-10-01' }, { monto: 500, fechaVencimiento: '2026-11-01' }]
    expect(validarLetras(letras, 1000)).toEqual([])
  })

  it('tolera un centavo de diferencia por redondeo', () => {
    const letras = [{ monto: 333.33, fechaVencimiento: '2026-10-01' }, { monto: 333.34, fechaVencimiento: '2026-10-01' }, { monto: 333.33, fechaVencimiento: '2026-10-01' }]
    expect(validarLetras(letras, 1000)).toEqual([])
  })

  it('exige al menos una letra', () => {
    expect(validarLetras([], 1000).some((e) => e.campo === 'letras')).toBe(true)
  })
})

describe('estaVencida', () => {
  it('una fecha pasada está vencida', () => {
    expect(estaVencida('2026-01-01', '2026-08-28')).toBe(true)
  })

  it('una fecha futura no está vencida', () => {
    expect(estaVencida('2026-12-01', '2026-08-28')).toBe(false)
  })
})
