import { describe, expect, it } from 'vitest'
import { construirPanoramaDemo } from '@/services/demo/datos'
import {
  alertasRegulatorias, buscar, filasDeStock, ocupacionPorPropietario, resumenesDeCeldas, stockDePosicion,
  unidadesEnEstado, unidadesPorTrasladar,
} from '@/domain/panorama'
import { posicionAcepta, areaAdmite } from '@/domain/zonas'

const HOY = '2026-10-07'
const p = construirPanoramaDemo(HOY)

describe('datos de demostración coherentes con las reglas', () => {
  it('es determinista', () => {
    expect(construirPanoramaDemo(HOY).saldos).toEqual(p.saldos)
  })

  it('todo el stock cumple la matriz de zonas y el propietario vigente', () => {
    const pos = new Map(p.posiciones.map((x) => [x.id, x]))
    for (const s of p.saldos) {
      const ps = pos.get(s.posicionId)!
      // El Aprobado esperando traslado en Cuarentena es la única excepción (cambio de estado en el lugar).
      const esperaTraslado = s.estado === 'APROBADO' && (ps.tipoArea === 'CUARENTENA' || ps.tipoArea === 'RECEPCION')
      if (!esperaTraslado) {
        const origen = ps.tipoArea === 'DEVOLUCIONES' ? 'DEVOLUCION' : 'COMPRA_LOCAL'
        expect(areaAdmite(ps.tipoArea, s.estado, origen), `${ps.codigo} ${s.estado}`).toBe(true)
      }
      expect(posicionAcepta(ps, s.propietarioId, p.asignaciones, HOY), `${ps.codigo}`).toBe(true)
    }
  })

  it('ningún saldo es cero ni negativo', () => {
    expect(p.saldos.every((s) => s.cantidad > 0)).toBe(true)
  })

  it('el lote ABC tiene a la vez unidades Aprobadas y en Cuarentena, cada una con su procedencia', () => {
    const abc = filasDeStock(p).filter((f) => f.lote.codigo === 'ABC')
    expect(abc.map((f) => f.saldo.estado).sort()).toEqual(['APROBADO', 'CUARENTENA'])
    expect(new Set(abc.map((f) => f.saldo.procedenciaId)).size).toBe(2)
    expect(abc.find((f) => f.saldo.estado === 'APROBADO')!.posicion.codigo).toBe('A-21.1')
    expect(abc.find((f) => f.saldo.estado === 'CUARENTENA')!.posicion.codigo).toBe('A-8')
  })
})

describe('resúmenes para el mapa y el inicio', () => {
  it('agrupa cuatro niveles en una celda', () => {
    const celdas = resumenesDeCeldas(p)
    expect(celdas.get('A-10')!.niveles).toBe(4)
    expect(celdas.get('A-1')!.niveles).toBe(1)
  })

  it('marca "por verificar" las celdas con posiciones por verificar', () => {
    const celdas = resumenesDeCeldas(p)
    expect(celdas.get('I-8')!.porVerificar).toBe(true)
    expect(celdas.get('I-8')!.libre).toBe(true)
    expect(celdas.get('I-8')!.propietarios).toEqual([])
  })

  it('cuenta ocupación por propietario', () => {
    const ocup = ocupacionPorPropietario(p)
    const ajr = ocup.find((o) => o.propietario.codigo === 'AJR_LABS')!
    expect(ajr.posiciones).toBe(19)
    expect(ocup.every((o) => o.conStock <= o.posiciones)).toBe(true)
  })

  it('detecta Aprobados por trasladar y unidades por estado', () => {
    expect(unidadesPorTrasladar(p)).toBe(60)
    expect(unidadesEnEstado(p, 'CUARENTENA')).toBeGreaterThan(0)
  })

  it('alertas regulatorias de los datos de prueba', () => {
    const a = alertasRegulatorias(p)
    expect(a.vencidos.map((x) => x.codigo)).toEqual(['DEMO-015'])
    expect(a.porVencer.map((x) => x.codigo).sort()).toEqual(['DEMO-004', 'DEMO-009'])
    expect(a.sinRegistro.map((x) => x.codigo)).toEqual(['DEMO-023'])
  })

  it('el stock de una posición lista producto, lote y estado', () => {
    const fila = filasDeStock(p).find((f) => f.lote.codigo === 'ABC' && f.saldo.estado === 'APROBADO')!
    const lista = stockDePosicion(p, fila.posicion.id)
    expect(lista.some((f) => f.lote.codigo === 'ABC')).toBe(true)
  })
})

describe('búsqueda universal', () => {
  it('encuentra un producto sin importar tildes y dice dónde está', () => {
    const r = buscar(p, 'dapagliflozina')
    const prod = r.find((x) => x.tipo === 'producto')!
    expect(prod.titulo).toMatch(/Dapagliflozina/)
    expect(prod.detalle).toMatch(/unidades? en \d+ ubicaci/)
    expect(prod.posiciones.length).toBeGreaterThan(0)
  })

  it('encuentra un lote y sus ubicaciones (el lote ABC está en dos)', () => {
    const r = buscar(p, 'ABC').find((x) => x.tipo === 'lote')!
    expect(r.posiciones.sort()).toEqual(['A-21.1', 'A-8'])
    expect(r.unidades).toBe(168)
  })

  it('encuentra una ubicación por código', () => {
    const r = buscar(p, 'A-21.1')
    expect(r[0].tipo).toBe('posicion')
    expect(r[0].titulo).toBe('Ubicación A-21.1')
  })

  it('sin coincidencias devuelve vacío; consulta vacía también', () => {
    expect(buscar(p, 'zzzzqq')).toEqual([])
    expect(buscar(p, '   ')).toEqual([])
  })

  it('prioriza coincidencia exacta de ubicación sobre coincidencias parciales', () => {
    const r = buscar(p, 'A-10.2')
    expect(r[0].titulo).toBe('Ubicación A-10.2')
  })
})
