import { describe, expect, it } from 'vitest'
import { puedePagarseEnCuotas, validarLetras } from '@/domain/financiamiento'

/**
 * "Pago en cuotas" (0044) — antes esto era exclusivo de `origen = 'compra'`
 * porque letras_por_pagar solo apuntaba a compras.proveedores.
 */
describe('puedePagarseEnCuotas', () => {
  it('una compra, un servicio y un pago directo se pueden pagar en cuotas', () => {
    expect(puedePagarseEnCuotas('compra', 'registrada', true)).toBe(true)
    expect(puedePagarseEnCuotas('servicio', 'registrada', true)).toBe(true)
    expect(puedePagarseEnCuotas('gasto_directo', 'conforme', true)).toBe(true)
  })

  it('lo que se le paga a un empleado no se cuotea', () => {
    expect(puedePagarseEnCuotas('anticipo', 'registrada', true)).toBe(false)
    expect(puedePagarseEnCuotas('reembolso', 'registrada', true)).toBe(false)
  })

  it('una cuota no se vuelve a partir en cuotas', () => {
    expect(puedePagarseEnCuotas('prestamo', 'registrada', true)).toBe(false)
    expect(puedePagarseEnCuotas('fraccionamiento_sunat', 'registrada', true)).toBe(false)
    expect(puedePagarseEnCuotas('letra_por_pagar', 'registrada', true)).toBe(false)
  })

  it('sin proveedor no hay a quién pagarle en cuotas', () => {
    expect(puedePagarseEnCuotas('compra', 'registrada', false)).toBe(false)
  })

  it('ya pagada, en propuesta o ya partida: no hay nada que partir', () => {
    expect(puedePagarseEnCuotas('compra', 'pagada', true)).toBe(false)
    expect(puedePagarseEnCuotas('compra', 'cerrada', true)).toBe(false)
    expect(puedePagarseEnCuotas('compra', 'en_propuesta', true)).toBe(false)
    expect(puedePagarseEnCuotas('compra', 'canjeada_por_letra', true)).toBe(false)
  })

  it('una obligación rechazada o anulada (0043) tampoco se cuotea', () => {
    expect(puedePagarseEnCuotas('gasto_directo', 'rechazada', true)).toBe(false)
    expect(puedePagarseEnCuotas('gasto_directo', 'anulada', true)).toBe(false)
  })
})

describe('validarLetras — el N° de letra y el banco son opcionales', () => {
  it('acepta cuotas sin número de letra ni banco, que es el caso de un servicio', () => {
    const errores = validarLetras(
      [
        { monto: 600, fechaVencimiento: '2026-10-15' },
        { monto: 400, fechaVencimiento: '2026-11-15' },
      ],
      1000
    )
    expect(errores).toEqual([])
  })

  it('sigue exigiendo que las cuotas sumen exactamente la obligación', () => {
    const errores = validarLetras([{ monto: 600, fechaVencimiento: '2026-10-15' }], 1000)
    expect(errores.some((e) => e.campo === 'letras')).toBe(true)
  })

  it('sigue exigiendo fecha en cada cuota', () => {
    const errores = validarLetras([{ monto: 1000, fechaVencimiento: '' }], 1000)
    expect(errores.some((e) => e.campo === 'letras.0.fechaVencimiento')).toBe(true)
  })
})
