import { describe, expect, it } from 'vitest'
import { construirPanoramaDemo } from '@/services/demo/datos'
import { buscarProductosConStock, contenidoDeUbicacion, ubicacionesDeProducto, type LineaParaChequear, type OrdenMovimiento } from '@/domain/inventario'
import { buscar } from '@/domain/panorama'
import {
  borradorTieneContenido, disponibleReal, evaluarLinea, leerBorrador, nuevoBorrador, opcionesDestinoLinea, repartirDestinoDefecto, resumenBarra, textoBarra, textoResumenLargo,
} from '@/domain/movimiento-tabla'
import { descripcionTransitoPosicion, textoTransito, transitoPorLote, transitoPorPosicion } from '@/domain/transito'

const p = construirPanoramaDemo('2026-10-09')
const base = { tieneProducto: true, origen: 'F-3.1', disponible: 48, destino: 'B-2', cantidad: '10' }

describe('modo tabla: el mensaje bajo cada línea', () => {
  it('es neutral mientras falta algo, en el orden en que se completa la línea', () => {
    expect(evaluarLinea({ ...base, tieneProducto: false, origen: undefined, destino: undefined })).toEqual({ tipo: 'falta', texto: 'Busca el producto que vas a mover.' })
    expect(evaluarLinea({ ...base, origen: undefined, destino: undefined })).toEqual({ tipo: 'falta', texto: 'Elige de dónde sale.' })
    expect(evaluarLinea({ ...base, destino: undefined })).toEqual({ tipo: 'falta', texto: 'Elige a dónde va.' })
    expect(evaluarLinea({ ...base, cantidad: '' })).toEqual({ tipo: 'falta', texto: 'Indica cuántas unidades.' })
  })
  it('es un error en rojo si el destino no sirve o si pide más de lo que hay', () => {
    expect(evaluarLinea({ ...base, razonDestino: 'Ya está aprobado: no vuelve a Cuarentena.' })).toEqual({ tipo: 'error', texto: 'Ese destino no sirve: Ya está aprobado: no vuelve a Cuarentena.' })
    expect(evaluarLinea({ ...base, cantidad: '60' })).toEqual({ tipo: 'error', texto: 'Solo hay 48 u disponibles en F-3.1. No se puede mover lo que no existe.' })
    expect(evaluarLinea(base)).toBeNull()
  })
})

describe('modo tabla: disponible real', () => {
  const lineas = [{ id: 1, celdaClave: 'c1', cantidad: '30' }, { id: 2, celdaClave: 'c1', cantidad: '15' }, { id: 3, celdaClave: 'c2', cantidad: '99' }]
  it('descuenta lo que otras líneas de la misma orden sacan del mismo lote y ubicación (no de otras celdas)', () => {
    expect(disponibleReal(100, 'c1', lineas, 1)).toBe(85)
    expect(disponibleReal(100, 'c1', lineas, 2)).toBe(70)
    expect(disponibleReal(100, 'c2', lineas, 3)).toBe(100)
  })
  it('lo que reservan otros movimientos en curso ya viene descontado de la celda', () => {
    const celdas = ubicacionesDeProducto(p, p.productos[0].id, new Map())
    const c = celdas[0]
    const reservado = new Map([[c.clave, 10]])
    const con = ubicacionesDeProducto(p, p.productos[0].id, reservado).find((x) => x.clave === c.clave)!
    expect(con.disponible).toBe(c.disponible - 10)
  })
})

describe('modo tabla: destino por defecto', () => {
  it('se aplica a las líneas con origen y sin destino; avisa cuántas no pueden tomarlo', () => {
    const r = repartirDestinoDefecto([
      { id: 1, tieneOrigen: true, tieneDestino: false }, { id: 2, tieneOrigen: true, tieneDestino: false }, { id: 3, tieneOrigen: true, tieneDestino: true }, { id: 4, tieneOrigen: false, tieneDestino: false },
    ], (id) => id === 1, 'B-2')
    expect(r.asignar).toEqual([1])
    expect(r.omitidas).toBe(1)
    expect(r.nota).toBe('Aplicado a 1 línea. 1 no puede ir a B-2: elige su destino.')
  })
  it('si todas lo reciben, dice que las líneas nuevas lo tomarán', () => {
    expect(repartirDestinoDefecto([{ id: 1, tieneOrigen: true, tieneDestino: false }], () => true, 'B-2').nota).toMatch(/Las líneas nuevas lo tomarán/)
  })
})

describe('modo tabla: barra inferior y resumen', () => {
  const l = (id: number, lista: boolean, cantidad: number, destino: string) => ({ id, lista, cantidad, destino, producto: 'P', lote: 'L', propietario: 'X', origen: 'A' })
  it('«X de Y líneas listas · N u · K destinos»; revisar solo con todas listas', () => {
    const r = resumenBarra([l(1, true, 30, 'B-2'), l(2, true, 20, 'B-2'), l(3, false, 5, 'C-1')])
    expect(textoBarra(r)).toBe('2 de 3 líneas listas · 50 u · 1 destino')
    expect(r.puedeRevisar).toBe(false)
    const ok = resumenBarra([l(1, true, 30, 'B-2'), l(2, true, 20, 'C-1')])
    expect(ok.puedeRevisar).toBe(true)
    expect(textoResumenLargo(ok, 'Reorganización')).toBe('Vas a mover 50 unidades en 2 líneas, hacia 2 destinos. Motivo: Reorganización.')
  })
  it('sin líneas no se puede revisar', () => { expect(resumenBarra([]).puedeRevisar).toBe(false) })
})

describe('modo tabla: ubicaciones en conteo', () => {
  const prod = p.productos.find((x) => ubicacionesDeProducto(p, x.id).length > 1)!
  const celdas = ubicacionesDeProducto(p, prod.id)
  const enConteo = celdas[0].posicionId
  it('no aparece como origen del producto', () => {
    const r = ubicacionesDeProducto(p, prod.id, new Map(), { [enConteo]: 'En conteo' })
    expect(r.some((c) => c.posicionId === enConteo && !c.bloqueada)).toBe(false)
  })
  it('no aparece como destino ni en la búsqueda de productos con stock', () => {
    const linea: LineaParaChequear = { clave: 'x', posicionId: celdas[1]?.posicionId ?? celdas[0].posicionId, propietarioId: celdas[0].propietarioId, propietario: celdas[0].propietario, estado: celdas[0].estado }
    expect(opcionesDestinoLinea(p, '', linea, { [p.posiciones[0].id]: 'En conteo' }, 500).some((o) => o.posicionId === p.posiciones[0].id)).toBe(false)
    expect(buscarProductosConStock(p, prod.descripcion, new Map(), 10, Object.fromEntries(celdas.map((c) => [c.posicionId, 'En conteo'])))).toEqual([])
  })
})

describe('modo tabla: destinos con su motivo', () => {
  it('las que sirven van primero; las que no, deshabilitadas y con el motivo en palabras', () => {
    const prod = p.productos.find((x) => ubicacionesDeProducto(p, x.id).length > 0)!
    const c = ubicacionesDeProducto(p, prod.id)[0]
    const ops = opcionesDestinoLinea(p, '', { clave: 'x', posicionId: c.posicionId, propietarioId: c.propietarioId, propietario: c.propietario, estado: c.estado })
    const primeraNo = ops.findIndex((o) => o.motivo)
    expect(ops.slice(0, primeraNo).every((o) => !o.motivo)).toBe(true)
    expect(ops.filter((o) => o.motivo).every((o) => o.motivo!.length > 8)).toBe(true)
  })
})

describe('borrador que no se pierde', () => {
  it('un borrador con algo elegido se recupera tal cual; el motivo solo no cuenta', () => {
    const b = { ...nuevoBorrador('t-1'), motivo: 'Reposición' }
    expect(borradorTieneContenido(b)).toBe(false)
    const con = { ...b, lineas: [{ id: 1, productoId: 'p', celdaClave: 'c', destinoId: 'd', cantidad: '5' }], siguienteId: 2 }
    expect(borradorTieneContenido(con)).toBe(true)
    expect(leerBorrador(JSON.stringify(con))).toMatchObject({ token: 't-1', motivo: 'Reposición', lineas: [{ id: 1, productoId: 'p', celdaClave: 'c', destinoId: 'd', cantidad: '5' }] })
  })
  it('un texto dañado no rompe nada', () => {
    expect(leerBorrador('{no es json')).toBeNull()
    expect(leerBorrador(JSON.stringify({ version: 2 }))).toBeNull()
    expect(leerBorrador(null)).toBeNull()
  })
})

describe('en tránsito, por verificar', () => {
  const orden = (estado: OrdenMovimiento['estado'], ver: 'PENDIENTE' | 'CONFIRMADA'): OrdenMovimiento => ({
    id: 'o1', numero: 'MI-2026-00001', estado, motivo: 'x', ejecutorId: 'u1', ejecutor: 'U', ejecutadoEn: '2026-10-09T10:00:00Z',
    lineas: [{ id: 'l1', productoId: 'p', producto: 'P', loteId: 'lote1', lote: 'L1', propietario: 'X', estado: 'APROBADO', procedenciaId: 'pr', desdePosicionId: 'A', desde: 'A-1', haciaPosicionId: 'B', hacia: 'B-1', cantidad: 60, verificacion: ver }],
  })
  it('origen y destino muestran las unidades mientras nadie verifica; al verificar desaparecen', () => {
    const t = transitoPorPosicion([orden('EJECUTADO', 'PENDIENTE')])
    expect(t.get('A')).toMatchObject({ salen: 60, llegan: 0 })
    expect(t.get('B')).toMatchObject({ salen: 0, llegan: 60 })
    expect(transitoPorLote([orden('EJECUTADO', 'PENDIENTE')]).get('lote1')?.unidades).toBe(60)
    expect(textoTransito(60)).toBe('60 u en tránsito, por verificar')
    expect(descripcionTransitoPosicion(t.get('B')!)).toBe('60 u en tránsito, por verificar (llegan)')
    expect(transitoPorPosicion([orden('CONFIRMADO', 'CONFIRMADA')]).size).toBe(0)
  })
  it('el buscador universal lo dice en la ubicación y en el lote', () => {
    const lote = p.lotes[0]
    const r = buscar(p, lote.codigo, 24, { porLote: new Map([[lote.id, { unidades: 25 }]]) }).find((x) => x.tipo === 'lote' && x.id === lote.id)!
    expect(r.detalle).toContain('25 u en tránsito, por verificar')
  })
})

describe('búsqueda tolerante', () => {
  it('ignora tildes y mayúsculas y acepta coincidencias parciales en nombre, código, lote y ubicación', () => {
    const prod = p.productos.find((x) => /[áéíóú]/i.test(x.descripcion))
    if (prod) {
      const sinTilde = prod.descripcion.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase()
      expect(buscar(p, sinTilde).some((x) => x.id === prod.id)).toBe(true)
    }
    const parcial = p.productos[0].descripcion.slice(2, 8).toUpperCase()
    expect(buscar(p, parcial).some((x) => x.id === p.productos[0].id)).toBe(true)
    const lote = p.lotes[0]
    expect(buscar(p, lote.codigo.toLowerCase()).some((x) => x.tipo === 'lote' && x.id === lote.id)).toBe(true)
    const pos = p.posiciones.find((x) => contenidoDeUbicacion(p, x.id).length > 0)!
    expect(buscar(p, pos.codigo.toLowerCase()).some((x) => x.tipo === 'posicion' && x.id === pos.id)).toBe(true)
  })
})
