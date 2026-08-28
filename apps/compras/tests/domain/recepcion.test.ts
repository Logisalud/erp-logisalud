import { describe, expect, it } from 'vitest'
import {
  clasificarLinea,
  mesesEntre,
  recepcionQuedaConforme,
  validarRecepcion,
  type ProductoParaRecepcion,
} from '@/domain/recepcion'

const PRODUCTO_ESTANDAR: ProductoParaRecepcion = {
  controlaLote: true,
  controlaVencimiento: true,
  mesesVidaUtilMinima: 12,
}

const base = {
  cantidadPedidaPendiente: 10,
  cantidadGuia: 10,
  lote: 'L001',
  fechaVencimiento: '2028-01-01',
  danado: false,
  productoErroneo: false,
  fechaRecepcion: '2026-08-28',
}

describe('clasificarLinea', () => {
  it('sin discrepancia: cantidad exacta, lote y vencimiento lejano', () => {
    const c = clasificarLinea({ ...base, cantidadFisica: 10 }, PRODUCTO_ESTANDAR)
    expect(c).toEqual({
      estadoCalidad: 'bueno', tipoDiscrepancia: 'ninguna',
      cantidadAceptada: 10, cantidadRechazada: 0,
    })
  })

  it('faltante: llegó menos de lo pedido, se acepta lo físico', () => {
    const c = clasificarLinea({ ...base, cantidadFisica: 7 }, PRODUCTO_ESTANDAR)
    expect(c.tipoDiscrepancia).toBe('faltante')
    expect(c.cantidadAceptada).toBe(7)
    expect(c.cantidadRechazada).toBe(0)
  })

  it('sobrante: se acepta hasta lo pedido, se rechaza el excedente', () => {
    const c = clasificarLinea({ ...base, cantidadFisica: 13 }, PRODUCTO_ESTANDAR)
    expect(c.tipoDiscrepancia).toBe('sobrante')
    expect(c.cantidadAceptada).toBe(10)
    expect(c.cantidadRechazada).toBe(3)
  })

  it('vencido: fecha de vencimiento ya pasó, rechazo total', () => {
    const c = clasificarLinea(
      { ...base, cantidadFisica: 10, fechaVencimiento: '2026-08-01' },
      PRODUCTO_ESTANDAR
    )
    expect(c.estadoCalidad).toBe('vencido')
    expect(c.tipoDiscrepancia).toBe('vencido')
    expect(c.cantidadAceptada).toBe(0)
    expect(c.cantidadRechazada).toBe(10)
  })

  it('por vencer: le quedan menos meses que el mínimo del producto', () => {
    const c = clasificarLinea(
      { ...base, cantidadFisica: 10, fechaVencimiento: '2027-01-01' }, // 5 meses desde ago-2026
      PRODUCTO_ESTANDAR
    )
    expect(c.estadoCalidad).toBe('por_vencer')
    expect(c.tipoDiscrepancia).toBe('por_vencer')
    expect(c.cantidadAceptada).toBe(0)
  })

  it('dañado: lo marca Charlie a simple vista, rechazo total', () => {
    const c = clasificarLinea({ ...base, cantidadFisica: 10, danado: true }, PRODUCTO_ESTANDAR)
    expect(c.estadoCalidad).toBe('danado')
    expect(c.tipoDiscrepancia).toBe('danado')
    expect(c.cantidadAceptada).toBe(0)
  })

  it('vencido pesa más que dañado si se dan las dos a la vez', () => {
    const c = clasificarLinea(
      { ...base, cantidadFisica: 10, danado: true, fechaVencimiento: '2026-08-01' },
      PRODUCTO_ESTANDAR
    )
    expect(c.estadoCalidad).toBe('vencido')
  })

  it('producto erróneo pesa más que cualquier otra cosa', () => {
    const c = clasificarLinea(
      { ...base, cantidadFisica: 10, danado: true, productoErroneo: true },
      PRODUCTO_ESTANDAR
    )
    expect(c.tipoDiscrepancia).toBe('producto_erroneo')
  })

  it('lote no informado: el producto lo controla y no llegó ninguno', () => {
    const c = clasificarLinea({ ...base, cantidadFisica: 10, lote: null }, PRODUCTO_ESTANDAR)
    expect(c.tipoDiscrepancia).toBe('lote_no_informado')
    // Se acepta con observación, no se rechaza.
    expect(c.cantidadAceptada).toBe(10)
  })

  it('producto que no controla lote ni vencimiento: nunca clasifica por eso', () => {
    const producto: ProductoParaRecepcion = {
      controlaLote: false, controlaVencimiento: false, mesesVidaUtilMinima: 12,
    }
    const c = clasificarLinea(
      { ...base, cantidadFisica: 10, lote: null, fechaVencimiento: null },
      producto
    )
    expect(c.tipoDiscrepancia).toBe('ninguna')
  })
})

describe('mesesEntre', () => {
  it('cuenta meses completos por año+mes', () => {
    expect(mesesEntre('2026-08-28', '2027-08-28')).toBe(12)
    expect(mesesEntre('2026-08-28', '2027-01-01')).toBe(5)
    expect(mesesEntre('2026-08-28', '2026-08-01')).toBe(0)
  })
})

describe('recepcionQuedaConforme', () => {
  it('conforme si ninguna línea tiene discrepancia', () => {
    expect(recepcionQuedaConforme([
      { tipoDiscrepancia: 'ninguna', resuelta: false },
      { tipoDiscrepancia: 'ninguna', resuelta: false },
    ])).toBe(true)
  })

  it('no conforme si hay una discrepancia sin resolver', () => {
    expect(recepcionQuedaConforme([
      { tipoDiscrepancia: 'ninguna', resuelta: false },
      { tipoDiscrepancia: 'faltante', resuelta: false },
    ])).toBe(false)
  })

  it('conforme si todas las discrepancias ya tienen resolución', () => {
    expect(recepcionQuedaConforme([
      { tipoDiscrepancia: 'faltante', resuelta: true },
      { tipoDiscrepancia: 'sobrante', resuelta: true },
    ])).toBe(true)
  })
})

describe('validarRecepcion', () => {
  const lineaOk = {
    ocItemId: 'item-1', cantidadFisica: 10, cantidadGuia: 10,
    lote: 'L1', fechaVencimiento: '2028-01-01', danado: false, productoErroneo: false,
    controlaLote: true, controlaVencimiento: true,
  }

  it('sin errores con un borrador completo', () => {
    expect(validarRecepcion({
      ocId: 'oc-1', fechaRecepcion: '2026-08-28', guiaRemision: 'G001',
      lineas: [lineaOk],
    })).toEqual([])
  })

  it('exige al menos una línea con cantidad física', () => {
    const errores = validarRecepcion({
      ocId: 'oc-1', fechaRecepcion: '2026-08-28', guiaRemision: null,
      lineas: [{ ...lineaOk, cantidadFisica: 0 }],
    })
    expect(errores.some((e) => e.campo === 'lineas')).toBe(true)
  })

  it('exige fecha de vencimiento si el producto la controla y hay cantidad', () => {
    const errores = validarRecepcion({
      ocId: 'oc-1', fechaRecepcion: '2026-08-28', guiaRemision: null,
      lineas: [{ ...lineaOk, fechaVencimiento: null }],
    })
    expect(errores.some((e) => e.campo === 'lineas.0.fechaVencimiento')).toBe(true)
  })

  it('no exige vencimiento si la línea no tiene cantidad física (fila sin usar)', () => {
    const errores = validarRecepcion({
      ocId: 'oc-1', fechaRecepcion: '2026-08-28', guiaRemision: null,
      lineas: [{ ...lineaOk, cantidadFisica: 0, fechaVencimiento: null }],
    })
    expect(errores.some((e) => e.campo === 'lineas.0.fechaVencimiento')).toBe(false)
  })
})
