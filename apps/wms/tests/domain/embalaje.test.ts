import { describe, expect, it } from 'vitest'
import { codigoDeBulto, etiquetaBulto, faltaPorColocar, repartoDeMatriz, repartoInicial, validarReparto, type PendienteEmbalar } from '@/domain/embalaje'

const p = (lineaId: string, loteId: string, lote: string, cantidad: number): PendienteEmbalar => ({ lineaId, productoCodigo: 'P1', producto: 'Producto 1', loteId, lote, vence: '2027-10-31', cantidad })
const pend = [p('l1', 'a', 'LA', 6), p('l1', 'b', 'LB', 4)]

describe('reparto en bultos', () => {
  it('todo empieza en el bulto 1 y la matriz se convierte en el envío sin celdas vacías', () => {
    expect(repartoInicial(pend, 3)).toEqual([[6, 0, 0], [4, 0, 0]])
    expect(repartoDeMatriz(pend, [[4, 2, 0], [0, 4, 0]])).toEqual([
      { contenido: [{ lineaId: 'l1', loteId: 'a', cantidad: 4 }] },
      { contenido: [{ lineaId: 'l1', loteId: 'a', cantidad: 2 }, { lineaId: 'l1', loteId: 'b', cantidad: 4 }] },
      { contenido: [] },
    ])
  })

  it('valida con los mismos textos que la base: faltan, sobran, vacío, repetido, lote ajeno y rango de bultos', () => {
    const ok = [{ contenido: [{ lineaId: 'l1', loteId: 'a', cantidad: 6 }, { lineaId: 'l1', loteId: 'b', cantidad: 4 }] }]
    expect(validarReparto(pend, ok)).toBeNull()
    expect(validarReparto(pend, [{ contenido: [{ lineaId: 'l1', loteId: 'a', cantidad: 5 }, { lineaId: 'l1', loteId: 'b', cantidad: 4 }] }])).toBe('Faltan 1 unidades del lote LA por poner en un bulto')
    expect(validarReparto(pend, [{ contenido: [{ lineaId: 'l1', loteId: 'a', cantidad: 6 }, { lineaId: 'l1', loteId: 'b', cantidad: 5 }] }])).toBe('Sobran 1 unidades del lote LB: solo se confirmaron 4')
    expect(validarReparto(pend, [...ok, { contenido: [] }])).toBe('El bulto 2 está vacío')
    expect(validarReparto(pend, [{ contenido: [{ lineaId: 'l1', loteId: 'a', cantidad: 3 }, { lineaId: 'l1', loteId: 'a', cantidad: 3 }, { lineaId: 'l1', loteId: 'b', cantidad: 4 }] }])).toBe('El bulto 1 repite un lote: súmalo en una sola celda')
    expect(validarReparto(pend, [{ contenido: [{ lineaId: 'l1', loteId: 'x', cantidad: 6 }] }])).toBe('El bulto 1 tiene un lote que no está en lo confirmado de este pedido')
    expect(validarReparto(pend, [{ contenido: [{ lineaId: 'l1', loteId: 'a', cantidad: 0 }] }])).toBe('Cada cantidad del bulto 1 debe ser mayor que cero')
    expect(validarReparto(pend, [])).toBe('Un pedido se embala en 1 a 99 bultos')
  })

  it('lo que falta o sobra de una fila, y la etiqueta «1 de 3» con su código', () => {
    expect(faltaPorColocar(pend[0], [4, 1])).toBe(1)
    expect(faltaPorColocar(pend[0], [4, 3])).toBe(-1)
    expect(etiquetaBulto({ secuencia: 1, total: 3 })).toBe('1 de 3')
    expect(codigoDeBulto('SAL-2026-00001', 2)).toBe('SAL-2026-00001-B2')
  })
})
