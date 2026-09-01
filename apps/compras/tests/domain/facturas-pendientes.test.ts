import { describe, expect, it } from 'vitest'
import { debeEncolarse, hayRecepcionConSaldoSinFacturar } from '@/domain/facturas-pendientes'

describe('hayRecepcionConSaldoSinFacturar / debeEncolarse', () => {
  it('sin saldo disponible en ninguna línea facturada, la factura debe encolarse', () => {
    const lineas = [{ ocItemId: 'i1', cantidadVerificadaDisponible: 0 }]
    expect(hayRecepcionConSaldoSinFacturar(lineas)).toBe(false)
    expect(debeEncolarse(lineas)).toBe(true)
  })

  it('con saldo en al menos una línea, concilia directo (no se encola)', () => {
    const lineas = [
      { ocItemId: 'i1', cantidadVerificadaDisponible: 0 },
      { ocItemId: 'i2', cantidadVerificadaDisponible: 5 },
    ]
    expect(hayRecepcionConSaldoSinFacturar(lineas)).toBe(true)
    expect(debeEncolarse(lineas)).toBe(false)
  })

  it('sin líneas facturadas, no hay nada que conciliar', () => {
    expect(hayRecepcionConSaldoSinFacturar([])).toBe(false)
    expect(debeEncolarse([])).toBe(true)
  })
})
