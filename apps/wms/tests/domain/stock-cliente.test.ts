// Stock del cliente (0067): dominio puro. Resumen, búsqueda, «lo que vence», textos y el filtro del Kardex.
import { describe, expect, it } from 'vitest'
import {
  claveVence, direccionDeStockCliente, estadoDeEnlace, filtrarProductos, filtroKardexCliente, lotesQueVencen, nombreArchivoKardex, resumenStock, textoDias, textoPlazo, urgenciaLote,
  type LoteStock, type ProductoStock,
} from '@/domain/stock-cliente'

const lote = (o: Partial<LoteStock> & { lote: string }): LoteStock => ({ loteId: o.lote, stock: 10, disponible: 10, enRevision: 0, vencido: false, ...o })
const prod = (codigo: string, descripcion: string, lotes: LoteStock[], extra: Partial<ProductoStock> = {}): ProductoStock => ({
  productoId: `id-${codigo}`, codigo, descripcion, stock: lotes.reduce((t, l) => t + l.stock, 0), disponible: lotes.reduce((t, l) => t + l.disponible, 0), enRevision: lotes.reduce((t, l) => t + l.enRevision, 0),
  vencido: lotes.filter((l) => l.vencido).reduce((t, l) => t + l.stock, 0), lotes, ...extra,
})
const TRAMOS = [90, 180, 365]
const productos = [
  prod('P-1', 'Amoxicilina 500 mg', [lote({ lote: 'A', vence: '2026-11-01', dias: -12, vencido: true, stock: 12, disponible: 0 }), lote({ lote: 'B', vence: '2027-01-10', dias: 58, stock: 30 }), lote({ lote: 'C', vence: '2028-01-01', dias: 414, stock: 100 })], { codigoCliente: 'AJR0026', presentacion: 'Caja x 30' }),
  prod('P-2', 'Ibuprofeno 400 mg', [lote({ lote: 'D', vence: '2027-04-20', dias: 158, stock: 8, enRevision: 3, disponible: 5 }), lote({ lote: 'E', stock: 4 })]),
]

describe('resumen', () => {
  it('suma lo que hay, lo disponible, lo vencido y lo que vence dentro del primer tramo', () => {
    expect(resumenStock(productos, TRAMOS)).toEqual({ productos: 2, lotes: 5, unidades: 154, disponibles: 35, enRevision: 3, vencidas: 12, porVencer: 30 })
  })
})

describe('búsqueda', () => {
  it('por nombre, código nuestro, código del cliente, presentación o lote; sin tildes ni mayúsculas', () => {
    expect(filtrarProductos(productos, 'amoxi').map((p) => p.codigo)).toEqual(['P-1'])
    expect(filtrarProductos(productos, 'ajr0026').map((p) => p.codigo)).toEqual(['P-1'])
    expect(filtrarProductos(productos, 'p-2').map((p) => p.codigo)).toEqual(['P-2'])
    expect(filtrarProductos(productos, 'caja x 30').map((p) => p.codigo)).toEqual(['P-1'])
    expect(filtrarProductos(productos, 'd').length).toBeGreaterThan(0)
    expect(filtrarProductos(productos, 'ÍBUPROFENO').map((p) => p.codigo)).toEqual(['P-2'])
    expect(filtrarProductos(productos, '   ')).toHaveLength(2)
    expect(filtrarProductos(productos, 'nada')).toEqual([])
  })
})

describe('lo que vence', () => {
  it('agrupa en vencidos y en cada tramo, solo lo que tiene lotes, ordenado por cercanía', () => {
    const g = lotesQueVencen(productos, TRAMOS)
    expect(g.map((x) => x.clave)).toEqual(['VENCIDO', 'HASTA_90', 'HASTA_180'])       // C (414 días) vence después del último tramo; E no tiene fecha
    expect(g.map((x) => x.titulo)).toEqual(['Ya vencidos', 'Vencen en menos de 3 meses', 'Vencen entre 3 meses y 6 meses'])
    expect(g.map((x) => x.unidades)).toEqual([12, 30, 8])
    expect(g[1].filas[0]).toMatchObject({ codigo: 'P-1', codigoCliente: 'AJR0026', lote: 'B', dias: 58 })
  })
  it('claveVence y urgenciaLote coinciden con los grupos', () => {
    expect(claveVence({ vencido: true, dias: -1 }, TRAMOS)).toBe('VENCIDO')
    expect(claveVence({ vencido: false, dias: 90 }, TRAMOS)).toBe('HASTA_90')
    expect(claveVence({ vencido: false, dias: 91 }, TRAMOS)).toBe('HASTA_180')
    expect(claveVence({ vencido: false, dias: 366 }, TRAMOS)).toBeNull()
    expect(claveVence({ vencido: false }, TRAMOS)).toBeNull()
    expect(urgenciaLote({ vencido: true, dias: -3 }, TRAMOS)).toBe('VENCIDO')
    expect(urgenciaLote({ vencido: false, dias: 45 }, TRAMOS)).toBe('PRONTO')
    expect(urgenciaLote({ vencido: false, dias: 200 }, TRAMOS)).toBe('VIGENTE')
    expect(urgenciaLote({ vencido: false }, TRAMOS)).toBe('SIN_FECHA')
  })
  it('sin nada que vencer en los tramos, no hay grupos', () => {
    expect(lotesQueVencen([prod('P-9', 'X', [lote({ lote: 'Z', dias: 900, vence: '2029-01-01' })])], TRAMOS)).toEqual([])
  })
})

describe('textos', () => {
  it('plazos y días en lenguaje llano', () => {
    expect([30, 60, 90, 180, 365].map(textoPlazo)).toEqual(['30 días', '2 meses', '3 meses', '6 meses', '12 meses'])
    expect(textoDias(-1, true)).toBe('Vencido hace 1 día')
    expect(textoDias(-10, true)).toBe('Vencido hace 10 días')
    expect(textoDias(0, false)).toBe('Vence hoy')
    expect(textoDias(1, false)).toBe('Vence en 1 día')
    expect(textoDias(45, false)).toBe('Vence en 45 días')
    expect(textoDias(200, false)).toBe('Vence en 7 meses')
    expect(textoDias(undefined, false)).toBe('Sin fecha de vencimiento')
  })
})

describe('Kardex: lo que se pide', () => {
  const uuid = '0a1b2c3d-1234-4abc-8def-0123456789ab'
  it('un producto y fechas válidas; lo inválido se ignora; fechas al revés se ordenan', () => {
    expect(filtroKardexCliente({ producto: uuid, desde: '2026-01-01', hasta: '2026-06-30' })).toEqual({ productoId: uuid, desde: '2026-01-01', hasta: '2026-06-30' })
    expect(filtroKardexCliente({ producto: 'no-es-uuid', desde: '01/01/2026', hasta: '2026-13-45' })).toEqual({})
    expect(filtroKardexCliente({ desde: '2026-06-30', hasta: '2026-01-01' })).toEqual({ desde: '2026-01-01', hasta: '2026-06-30' })
    expect(filtroKardexCliente({})).toEqual({})
  })
  it('el nombre del archivo no lleva caracteres raros', () => {
    expect(nombreArchivoKardex('AJR_LABS', '2026-11-13')).toBe('Kardex AJR_LABS 2026-11-13.xlsx')
    expect(nombreArchivoKardex('Medic Pharma/Lab', '2026-11-13', 'DEMO 007?')).toBe('Kardex Medic_Pharma_Lab DEMO_007 2026-11-13.xlsx')
  })
})

describe('enlaces', () => {
  it('vigente, vencido o revocado', () => {
    const ahora = Date.parse('2026-11-13T12:00:00Z')
    expect(estadoDeEnlace({ venceEn: '2026-12-01T00:00:00Z' }, ahora)).toBe('VIGENTE')
    expect(estadoDeEnlace({ venceEn: '2026-11-01T00:00:00Z' }, ahora)).toBe('VENCIDO')
    expect(estadoDeEnlace({ venceEn: '2026-12-01T00:00:00Z', revocadoEn: '2026-11-10T00:00:00Z' }, ahora)).toBe('REVOCADO')
  })
  it('la dirección completa lleva el prefijo de la aplicación', () => {
    expect(direccionDeStockCliente('https://erp.logisalud.com/', '/wms', 'abc')).toBe('https://erp.logisalud.com/wms/stock/abc')
  })
})
