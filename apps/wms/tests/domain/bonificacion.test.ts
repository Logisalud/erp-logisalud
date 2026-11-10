import { describe, expect, it } from 'vitest'
import { heredarBonificacion, sinGemelosBonificacion, vinculosBonificacion } from '@/domain/bonificacion'
import type { Regulatorio } from '@/domain/tipos'

const reg = (productoId: string): Regulatorio => ({ productoId, registroSanitario: 'RS-1', rsVence: '2030-01-01', fabricante: 'Lab', formaPresentacion: 'Cápsula', concentracion: '800 mcg', condicionAlmacenamiento: '< 30 °C' })
interface P { id: string; codigo: string; descripcion: string; codigoBonificacion?: string; reg?: Regulatorio }
const p = (id: string, codigo: string, extra: { codigoBonificacion?: string; reg?: Regulatorio } = {}): P => ({ id, codigo, descripcion: `Producto ${codigo}`, ...extra })

describe('código de bonificación: el mismo producto con otro código', () => {
  const productos = [
    p('1', 'DRN001', { codigoBonificacion: 'BOD001', reg: reg('1') }),   // el normal apunta a su BO (el BO no se deduce quitando «BO»: BOD001 ↔ DRN001)
    p('2', 'BOD001'),
    p('3', 'DHP027', { codigoBonificacion: 'BODHP027' }),                // vínculo roto: BODHP027 no existe
    p('4', 'BODHP109'),                                                  // BO sin producto normal que lo apunte
    p('5', 'ABC1'),                                                      // producto normal sin bonificación
  ]

  it('arma los pares con el vínculo de Compras; un vínculo roto o un BO suelto no forman par', () => {
    const { baseDe, bonificacionDe } = vinculosBonificacion(productos)
    expect([...baseDe].map(([bo, base]) => [bo, base.codigo])).toEqual([['2', 'DRN001']])
    expect([...bonificacionDe].map(([base, bo]) => [base, bo.codigo])).toEqual([['1', 'BOD001']])
  })

  it('el BO hereda los datos regulatorios del normal (con su propio productoId); los demás quedan igual', () => {
    const r = heredarBonificacion(productos)
    expect(r.find((x) => x.id === '2')?.reg).toEqual({ ...reg('1'), productoId: '2' })
    expect(r.find((x) => x.id === '1')?.reg).toEqual(reg('1'))
    expect(r.find((x) => x.id === '4')?.reg).toBeUndefined()
    expect(r.find((x) => x.id === '5')).toBe(productos[4])
  })

  it('si el normal no tiene datos, el BO tampoco (aunque tuviera una fila propia)', () => {
    const r = heredarBonificacion([p('1', 'AAA1', { codigoBonificacion: 'BOAAA1' }), p('2', 'BOAAA1', { reg: reg('2') })])
    expect(r[1].reg).toBeUndefined()
  })

  it('la lista de pendientes no repite al BO que tiene producto normal, pero sí a los BO sin par', () => {
    expect(sinGemelosBonificacion(productos).map((x) => x.codigo)).toEqual(['DRN001', 'DHP027', 'BODHP109', 'ABC1'])
  })

  it('un producto que se liga a sí mismo, o dos normales que apuntan al mismo BO, no rompen nada', () => {
    const { baseDe } = vinculosBonificacion([p('1', 'X1', { codigoBonificacion: 'X1' }), p('2', 'Y1', { codigoBonificacion: 'BOZ' }), p('3', 'Y2', { codigoBonificacion: 'BOZ' }), p('4', 'BOZ')])
    expect([...baseDe].map(([bo, base]) => [bo, base.codigo])).toEqual([['4', 'Y1']])   // el primero manda
  })
})
