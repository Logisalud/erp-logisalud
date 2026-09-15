import { describe, expect, it } from 'vitest'
import {
  esProveedorSinIdentificar, esUsoFueraDelBacklog, RUC_SIN_IDENTIFICAR,
  totalPendienteDeIdentificar,
} from '@/domain/proveedor-sin-identificar'
import { validarRUC } from '@/domain/proveedor'

describe('el RUC del comodín', () => {
  it('pasa la validación del módulo — si no, no se podría crear', () => {
    expect(validarRUC(RUC_SIN_IDENTIFICAR)).toBe(true)
  })

  it('es imposible que sea un RUC peruano real: ninguno empieza en 0', () => {
    // Los RUC peruanos arrancan en 10, 15, 17 o 20. Ese es el punto de
    // elegir once ceros y no un 99999999999, que se parece más a algo real.
    expect(RUC_SIN_IDENTIFICAR.startsWith('0')).toBe(true)
    for (const prefijo of ['10', '15', '17', '20']) {
      expect(RUC_SIN_IDENTIFICAR.startsWith(prefijo)).toBe(false)
    }
  })

  it('reconoce al comodín y no confunde a un proveedor real', () => {
    expect(esProveedorSinIdentificar('00000000000')).toBe(true)
    expect(esProveedorSinIdentificar(' 00000000000 ')).toBe(true)
    expect(esProveedorSinIdentificar('20123456789')).toBe(false)
    expect(esProveedorSinIdentificar(null)).toBe(false)
  })
})

describe('detección de uso fuera del backlog', () => {
  it('la categoría del backlog es uso legítimo', () => {
    expect(esUsoFueraDelBacklog('Regularización de pagos antiguos (pre-ERP)')).toBe(false)
  })

  it('cualquier otra categoría es una señal a corregir', () => {
    // El comodín queda disponible en el buscador de CUALQUIER pago directo:
    // este es el riesgo que el reporte vigila.
    expect(esUsoFueraDelBacklog('Combustible')).toBe(true)
    expect(esUsoFueraDelBacklog(null)).toBe(true)
    expect(esUsoFueraDelBacklog('')).toBe(true)
  })
})

describe('total pendiente de identificar', () => {
  it('agrupa por moneda y nunca mezcla', () => {
    expect(
      totalPendienteDeIdentificar([
        { moneda: 'PEN', monto: 1200 },
        { moneda: 'USD', monto: 300 },
        { moneda: 'PEN', monto: 55.5 },
      ])
    ).toEqual([
      { moneda: 'PEN', monto: 1255.5 },
      { moneda: 'USD', monto: 300 },
    ])
  })
})
