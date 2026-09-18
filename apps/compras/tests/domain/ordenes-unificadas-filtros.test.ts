import { describe, it, expect } from 'vitest'
import { aplicarFiltrosOrdenes, type FilaFiltrable } from '@/domain/ordenes-unificadas'

/**
 * El filtro del visor de "Órdenes de compra y servicio".
 *
 * El primer test es el bug que reportó Mariela: con "Tipo: Mercadería" el
 * listado mostraba también las órdenes de tipo "Bien", porque el filtro
 * elegía qué TABLA consultar en vez de filtrar las filas — y mercadería y
 * bien salen de la misma tabla.
 */

const MERCADERIA: FilaFiltrable = {
  tipo: 'mercaderia',
  codigo: 'OC-2026-0001',
  proveedor: 'Dare Nutrition',
  proveedorId: 'prov-dare',
  ruc: '20512345678',
  estado: 'confirmada',
  fecha: '2026-09-01',
}
const BIEN: FilaFiltrable = {
  tipo: 'bien',
  codigo: 'OC-2026-0002',
  proveedor: 'AB Impresiones',
  proveedorId: 'prov-ab',
  ruc: '20587654321',
  estado: 'facturada',
  fecha: '2026-09-10',
}
const SERVICIO: FilaFiltrable = {
  tipo: 'servicio',
  codigo: 'OS-2026-0001',
  proveedor: 'Notaría Paino',
  proveedorId: 'provs-paino',
  ruc: '20599999999',
  estado: 'conformada',
  fecha: '2026-09-05',
}
const TODAS = [MERCADERIA, BIEN, SERVICIO]

describe('aplicarFiltrosOrdenes — tipo', () => {
  it('"Mercadería" NO trae las de tipo Bien (el bug reportado)', () => {
    const r = aplicarFiltrosOrdenes(TODAS, { tipo: 'mercaderia' })
    expect(r.map((f) => f.codigo)).toEqual(['OC-2026-0001'])
  })

  it('"Bien" NO trae las de mercadería', () => {
    const r = aplicarFiltrosOrdenes(TODAS, { tipo: 'bien' })
    expect(r.map((f) => f.codigo)).toEqual(['OC-2026-0002'])
  })

  it('"Servicio" trae solo órdenes de servicio', () => {
    const r = aplicarFiltrosOrdenes(TODAS, { tipo: 'servicio' })
    expect(r.map((f) => f.codigo)).toEqual(['OS-2026-0001'])
  })

  it('sin tipo trae las tres', () => {
    expect(aplicarFiltrosOrdenes(TODAS, {})).toHaveLength(3)
  })
})

describe('aplicarFiltrosOrdenes — proveedor', () => {
  it('filtra por id', () => {
    const r = aplicarFiltrosOrdenes(TODAS, { proveedorId: 'prov-ab' })
    expect(r.map((f) => f.codigo)).toEqual(['OC-2026-0002'])
  })

  it('un proveedor SIN órdenes devuelve vacío, no la lista entera', () => {
    // El defecto viejo: si el id no se podía resolver contra los proveedores
    // ya cargados, el filtro se salteaba y se veían todas las órdenes.
    expect(aplicarFiltrosOrdenes(TODAS, { proveedorId: 'prov-sin-ordenes' })).toEqual([])
  })

  it('dos proveedores homónimos no se confunden: manda el id', () => {
    const homonimo: FilaFiltrable = { ...SERVICIO, codigo: 'OS-2026-0002', proveedor: 'Dare Nutrition' }
    const r = aplicarFiltrosOrdenes([MERCADERIA, homonimo], { proveedorId: 'prov-dare' })
    expect(r.map((f) => f.codigo)).toEqual(['OC-2026-0001'])
  })
})

describe('aplicarFiltrosOrdenes — estado, fechas y búsqueda', () => {
  it('filtra por estado exacto', () => {
    expect(aplicarFiltrosOrdenes(TODAS, { estado: 'facturada' }).map((f) => f.codigo)).toEqual(['OC-2026-0002'])
  })

  it('el rango de fechas incluye los extremos', () => {
    const r = aplicarFiltrosOrdenes(TODAS, { fechaDesde: '2026-09-01', fechaHasta: '2026-09-05' })
    expect(r.map((f) => f.codigo).sort()).toEqual(['OC-2026-0001', 'OS-2026-0001'])
  })

  it('una fila sin fecha queda fuera de un rango, no dentro', () => {
    const sinFecha: FilaFiltrable = { ...MERCADERIA, codigo: 'OC-SIN-FECHA', fecha: null }
    expect(aplicarFiltrosOrdenes([sinFecha], { fechaDesde: '2026-01-01' })).toEqual([])
  })

  it('la búsqueda ignora tildes y mayúsculas, y también mira el RUC', () => {
    expect(aplicarFiltrosOrdenes(TODAS, { busqueda: 'notaria' }).map((f) => f.codigo)).toEqual(['OS-2026-0001'])
    expect(aplicarFiltrosOrdenes(TODAS, { busqueda: '20587654321' }).map((f) => f.codigo)).toEqual(['OC-2026-0002'])
  })

  it('combina tipo y estado sin interferencias', () => {
    expect(aplicarFiltrosOrdenes(TODAS, { tipo: 'mercaderia', estado: 'facturada' })).toEqual([])
  })

  it('"solo pendientes" deja fuera lo que ya terminó su camino', () => {
    const cerrada: FilaFiltrable = { ...MERCADERIA, codigo: 'OC-CERRADA', estado: 'cerrada' }
    const r = aplicarFiltrosOrdenes([MERCADERIA, cerrada], { soloPendientes: true })
    expect(r.map((f) => f.codigo)).toEqual(['OC-2026-0001'])
  })
})
