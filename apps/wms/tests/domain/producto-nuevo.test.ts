import { describe, expect, it } from 'vitest'
import { esProductoNuevo, esProveedorNuevo, recibidoSinEstaRecepcion, type LineaOcCompras } from '@/domain/producto-nuevo'

const oc = (o: Partial<LineaOcCompras> & { ocItemId: string; productoId: string }): LineaOcCompras => ({ recibida: 0, ...o })

describe('producto nuevo = sin recepciones históricas (D-171)', () => {
  it('sin nada en el WMS ni en Compras es nuevo', () => {
    expect(esProductoNuevo({ productoId: 'p', historiaWms: false, lineasOc: [] })).toBe(true)
  })
  it('el stock inicial de Odoo y el libro del WMS cuentan: un producto con stock inicial NO es nuevo', () => {
    expect(esProductoNuevo({ productoId: 'p', historiaWms: true, lineasOc: [] })).toBe(false)
  })
  it('una recepción previa de Compras (recibida > 0) cuenta; una OC sin recibir, no; la de otro producto, tampoco', () => {
    expect(esProductoNuevo({ productoId: 'p', historiaWms: false, lineasOc: [oc({ ocItemId: 'a', productoId: 'p', recibida: 10 })] })).toBe(false)
    expect(esProductoNuevo({ productoId: 'p', historiaWms: false, lineasOc: [oc({ ocItemId: 'a', productoId: 'p', recibida: 0 })] })).toBe(true)
    expect(esProductoNuevo({ productoId: 'p', historiaWms: false, lineasOc: [oc({ ocItemId: 'a', productoId: 'q', recibida: 99 })] })).toBe(true)
  })
  it('la propia recepción no es su historia: de sus líneas vale lo que Compras mostraba antes', () => {
    const l = oc({ ocItemId: 'a', productoId: 'p', recibida: 480 }) // Compras ya copió esta recepción
    expect(recibidoSinEstaRecepcion(l, new Map([['a', 0]]))).toBe(0)
    expect(esProductoNuevo({ productoId: 'p', historiaWms: false, lineasOc: [l], propias: new Map([['a', 0]]) })).toBe(true)
    expect(esProductoNuevo({ productoId: 'p', historiaWms: false, lineasOc: [l], propias: new Map([['a', 200]]) })).toBe(false) // ya había 200 antes
    expect(esProductoNuevo({ productoId: 'p', historiaWms: false, lineasOc: [l] })).toBe(false)
  })
  it('no existe «el mismo producto con otro laboratorio»: dos productos del catálogo son dos productos', () => {
    const lineas = [oc({ ocItemId: 'a', productoId: 'lab1', recibida: 50 })]
    expect(esProductoNuevo({ productoId: 'lab1', historiaWms: false, lineasOc: lineas })).toBe(false)
    expect(esProductoNuevo({ productoId: 'lab2', historiaWms: false, lineasOc: lineas })).toBe(true)
  })
})

describe('proveedor nuevo', () => {
  const base = { esCompraLocal: true, ruc: '20123456789', nombre: 'Droguería A', otrasCompras: [], lineasOc: [] as LineaOcCompras[] }
  it('primera vez que se le recibe: nuevo', () => expect(esProveedorNuevo(base)).toBe(true))
  it('solo una compra local tiene proveedor que pueda ser nuevo; sin RUC ni nombre tampoco', () => {
    expect(esProveedorNuevo({ ...base, esCompraLocal: false })).toBe(false)
    expect(esProveedorNuevo({ ...base, ruc: undefined, nombre: ' ' })).toBe(false)
  })
  it('otra compra confirmada en el WMS (por RUC) lo vuelve conocido; sin RUC, por nombre sin importar mayúsculas', () => {
    expect(esProveedorNuevo({ ...base, otrasCompras: [{ ruc: '20123456789' }] })).toBe(false)
    expect(esProveedorNuevo({ ...base, otrasCompras: [{ ruc: '20999999999' }] })).toBe(true)
    expect(esProveedorNuevo({ ...base, ruc: undefined, otrasCompras: [{ nombre: ' DROGUERÍA a ' }] })).toBe(false)
  })
  it('una recepción previa en Compras a ese proveedor lo vuelve conocido, salvo que sea la propia recepción', () => {
    const l = oc({ ocItemId: 'a', productoId: 'p', proveedorRuc: '20123456789', recibida: 30 })
    expect(esProveedorNuevo({ ...base, lineasOc: [l] })).toBe(false)
    expect(esProveedorNuevo({ ...base, lineasOc: [l], propias: new Map([['a', 0]]) })).toBe(true)
    expect(esProveedorNuevo({ ...base, lineasOc: [oc({ ocItemId: 'b', productoId: 'p', proveedorRuc: '20123456789', recibida: 0 })] })).toBe(true)
  })
})
