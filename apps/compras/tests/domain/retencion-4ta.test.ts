import { describe, expect, it } from 'vitest'
import { validarPagoDirecto } from '@/domain/obligacion'
import {
  calcularRxh, constanciaVencidaAlPagar, constanciaVigentePara, esRucDePersonaNatural,
  explicarRetencion, noSuperaUmbral,
} from '@/domain/retencion-4ta'

/**
 * RxH con retención de 4ta (modelo validado por Sebas y Mariela, 2026-10-28).
 * Los montos de ejemplo son los RxH reales de octubre: E001-31 por
 * S/ 3,228.74 (hoy registrado a mano por el neto de 2,970.44) y E001-48 por
 * S/ 600.
 */

describe('cuánto se retiene', () => {
  it('regla general: 8% y se paga el 92%', () => {
    expect(calcularRxh({ monto: 3228.74, moneda: 'PEN', constanciaVigente: false }))
      .toEqual({ monto: 3228.74, retencion: 258.3, neto: 2970.44, motivo: 'retenido' })
  })

  it('con constancia de suspensión vigente: 100% al profesional', () => {
    expect(calcularRxh({ monto: 3228.74, moneda: 'PEN', constanciaVigente: true }))
      .toEqual({ monto: 3228.74, retencion: 0, neto: 3228.74, motivo: 'constancia_suspension' })
  })

  it('S/ 1,500 o menos: por defecto SE RETIENE — no se aplica solo', () => {
    expect(calcularRxh({ monto: 600, moneda: 'PEN', constanciaVigente: false }).retencion).toBe(48)
  })

  it('S/ 1,500 o menos y quien registra decide no retener', () => {
    expect(calcularRxh({ monto: 600, moneda: 'PEN', constanciaVigente: false, noRetenerPorMonto: true }))
      .toEqual({ monto: 600, retencion: 0, neto: 600, motivo: 'no_supera_1500' })
    expect(calcularRxh({ monto: 1500, moneda: 'PEN', constanciaVigente: false, noRetenerPorMonto: true }).retencion).toBe(0)
  })

  it('pedir "no retener" en un recibo que supera el umbral no tiene efecto', () => {
    expect(calcularRxh({ monto: 1500.01, moneda: 'PEN', constanciaVigente: false, noRetenerPorMonto: true }).motivo)
      .toBe('retenido')
  })

  it('en dólares el umbral se compara convertido', () => {
    expect(noSuperaUmbral(400, 'USD', 3.45)).toBe(true) // S/ 1,380
    expect(noSuperaUmbral(450, 'USD', 3.45)).toBe(false) // S/ 1,552.50
  })
})

describe('constancia de suspensión', () => {
  const c2026 = { ejercicio: 2026, numero: '0123456789', fechaEmision: '2026-03-10' }

  it('ampara los recibos del mismo año desde su emisión', () => {
    expect(constanciaVigentePara([c2026], '2026-10-15')).toBe(c2026)
    expect(constanciaVigentePara([c2026], '2026-02-28')).toBeNull()
  })

  it('vence sola el 31 de diciembre', () => {
    expect(constanciaVigentePara([c2026], '2027-01-05')).toBeNull()
  })

  it('una anulada no ampara nada', () => {
    expect(constanciaVigentePara([{ ...c2026, anulada: true }], '2026-10-15')).toBeNull()
  })

  it('aviso si el recibo amparado se paga el año siguiente', () => {
    expect(constanciaVencidaAlPagar({ motivo: 'constancia_suspension', fechaRecibo: '2026-12-20', fechaPago: '2027-01-08' })).toBe(true)
    expect(constanciaVencidaAlPagar({ motivo: 'constancia_suspension', fechaRecibo: '2026-12-20', fechaPago: '2026-12-30' })).toBe(false)
    expect(constanciaVencidaAlPagar({ motivo: 'retenido', fechaRecibo: '2026-12-20', fechaPago: '2027-01-08' })).toBe(false)
  })
})

it('solo una persona natural (RUC 10) emite RxH', () => {
  expect(esRucDePersonaNatural('10759602124')).toBe(true)
  expect(esRucDePersonaNatural('20604137510')).toBe(false)
})

it('la explicación nombra la constancia', () => {
  expect(explicarRetencion('constancia_suspension', { ejercicio: 2026, numero: '0123' }))
    .toBe('No se retiene: constancia de suspensión 2026 N° 0123.')
})

describe('Pago Directo con Recibo por Honorarios', () => {
  const base = {
    proveedorId: 'p', categoriaId: 'c', descripcion: 'Nómina octubre', numeroFactura: 'E001-31',
    fechaFactura: '2026-10-28', moneda: 'PEN', tipoCambio: null, baseImponible: 3228.74,
  }

  it('no pide declarar detracción aunque supere S/ 700 (no aplica a la 4ta)', () => {
    expect(validarPagoDirecto({ ...base, tipoComprobante: 'rxh' })).toEqual([])
    expect(validarPagoDirecto({ ...base, tipoComprobante: 'factura' }).map((e) => e.campo)).toContain('tieneDetraccion')
  })

  it('un RxH no se registra como pendiente de comprobante', () => {
    expect(validarPagoDirecto({ ...base, tipoComprobante: 'rxh', pendienteFactura: true }).map((e) => e.campo))
      .toContain('tipoComprobante')
  })
})
