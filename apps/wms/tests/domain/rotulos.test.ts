import { describe, expect, it } from 'vitest'
import { fechaDeConteo, MAXIMO_ROTULOS, codificarPedido, datosDeRotulo, decodificarPedido, fechaDDMMAAAA, puedeImprimirRotulos, statusDeRotulo, textoVencimiento, totalRotulos, validarPedidoRotulos, type CajaSaldo } from '@/domain/rotulos'

const caja = (p: Partial<CajaSaldo> = {}): CajaSaldo => ({ clave: 'l1:APROBADO', loteId: 'l1', estado: 'APROBADO', productoId: 'p1', productoCodigo: 'DHP106', producto: 'DAPHA 10 10 MG CJA X 30 TAB. REC.', registroSanitario: 'EE-01234', lote: 'L-77', vence: '2028-06-30', propietario: 'Diphasac', cantidad: 30, ...p })

describe('rótulos de caja saldo (LS.ET.07)', () => {
  it('lo que sabe el sistema va lleno; la fecha de conteo es hoy; el status APROBADO va en verde', () => {
    const d = datosDeRotulo(caja({ propietario: 'DIPHASAC' }), '2026-11-11')
    expect(d).toMatchObject({ usuario: 'DIPHASAC', producto: 'DAPHA 10 10 MG CJA X 30 TAB. REC.', registroSanitario: 'EE-01234', lote: 'L-77', vencimiento: '06/2028', fechaConteo: '11/11/2026' })
    expect(d.status).toEqual({ texto: 'APROBADO', color: '#6aa84f', textoColor: '#111827' })
  })
  it('el vencimiento muestra lo que escribió la persona (mes y año) o el mes y el año de la fecha', () => {
    expect(textoVencimiento({ vence: '2028-06-30', venceTexto: '06/2028' })).toBe('06/2028'); expect(textoVencimiento({ vence: '2028-06-30' })).toBe('06/2028'); expect(textoVencimiento({})).toBe('')
    expect(fechaDDMMAAAA('2026-11-05')).toBe('05/11/2026'); expect(fechaDDMMAAAA(undefined)).toBe('')
  })
  it('otro estado dice cuál es y no va en verde', () => {
    expect(statusDeRotulo('CUARENTENA').texto).toBe('CUARENTENA'); expect(statusDeRotulo('CUARENTENA').color).not.toBe('#6aa84f')
    expect(statusDeRotulo('BAJAS_RECHAZADOS').texto).toBe('BAJAS/RECHAZADOS')
  })
  it('el pedido de impresión viaja en la dirección, con copias entre 1 y 20, y se valida', () => {
    const p = [{ clave: 'l1:APROBADO', copias: 2 }, { clave: 'l2:CUARENTENA', copias: 1 }]
    expect(decodificarPedido(codificarPedido(p))).toEqual(p)
    expect(decodificarPedido('l1:APROBADO:99,malo,l2:APROBADO:0')).toEqual([{ clave: 'l1:APROBADO', copias: 20 }, { clave: 'l2:APROBADO', copias: 1 }])
    expect(totalRotulos(p)).toBe(3); expect(validarPedidoRotulos([])).toMatch(/al menos una caja/); expect(validarPedidoRotulos(p)).toBeNull()
    expect(validarPedidoRotulos([{ clave: 'l:APROBADO', copias: MAXIMO_ROTULOS + 1 }])).toMatch(/demasiados/)
  })
  it('lo imprimen auxiliares, jefes de almacén y administración; no el conductor', () => {
    for (const r of ['auxiliar', 'jefe_almacen', 'jefe_transporte', 'admin_wms'] as const) expect(puedeImprimirRotulos([r]), r).toBe(true)
    expect(puedeImprimirRotulos(['conductor'])).toBe(false)
  })
})

describe('fechaDeConteo', () => {
  it('acepta hoy y días pasados; lo demás vuelve a hoy', () => {
    expect(fechaDeConteo('2026-11-09', '2026-11-11')).toBe('2026-11-09')
    expect(fechaDeConteo('2026-11-11', '2026-11-11')).toBe('2026-11-11')
    for (const x of ['2026-11-12', '2026-02-30', 'ayer', '', null, undefined]) expect(fechaDeConteo(x, '2026-11-11')).toBe('2026-11-11')
  })
})
