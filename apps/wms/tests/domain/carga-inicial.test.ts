// Carga inicial como cambio de sistema (OS-7, D-110): reglas puras que la migración 0027 repite en la base de datos.
import { describe, expect, it } from 'vitest'
import { erroresDeFilaCarga, estadoDeArchivo, pasosDeCargaEnHistoria, puedeConfirmarCargaInicial, puedeSubirCargaInicial, recorridoCarga, resumenCarga } from '@/domain/carga-inicial'
import { parsearCargaInicial } from '@/domain/inventario'

const fila = (extra: object = {}) => ({ producto: 'P1', lote: 'L1', vence: '2029-01-31', propietario: 'LOGISSA', posicion: 'A-1', estado: 'APROBADO', cantidad: '10', ...extra })

describe('permisos', () => {
  it('Administración y Dirección Técnica suben; solo Dirección Técnica confirma', () => {
    expect(puedeSubirCargaInicial(['admin_wms'])).toBe(true)
    expect(puedeSubirCargaInicial(['direccion_tecnica'])).toBe(true)
    expect(puedeSubirCargaInicial(['auxiliar'])).toBe(false)
    expect(puedeConfirmarCargaInicial(['direccion_tecnica'])).toBe(true)
    expect(puedeConfirmarCargaInicial(['admin_wms'])).toBe(false)
  })
})

describe('el archivo', () => {
  it('entiende el estado como lo escribe Odoo: Aprobados, Bajas, con o sin tilde', () => {
    expect(estadoDeArchivo('Aprobados')).toBe('APROBADO')
    expect(estadoDeArchivo(' cuarentena ')).toBe('CUARENTENA')
    expect(estadoDeArchivo('Bajas')).toBe('BAJAS_RECHAZADOS')
    expect(estadoDeArchivo('Bajas/Rechazados')).toBe('BAJAS_RECHAZADOS')
    expect(estadoDeArchivo('Retenido')).toBe('RETENIDO')
  })
  it('parsea el CSV con estados de Odoo y fechas de Perú', () => {
    const r = parsearCargaInicial('producto;lote;vence;propietario;posicion;estado;cantidad\nP1;L1;31/12/2028;logissa;a-1;Aprobados;1.200\nP2;L2;2029-06-30;logissa;q-1;Bajas;3')
    expect(r.errores).toEqual([])
    expect(r.filas).toEqual([
      { producto: 'P1', lote: 'L1', vence: '2028-12-31', propietario: 'LOGISSA', posicion: 'A-1', estado: 'APROBADO', cantidad: '1200' },
      { producto: 'P2', lote: 'L2', vence: '2029-06-30', propietario: 'LOGISSA', posicion: 'Q-1', estado: 'BAJAS_RECHAZADOS', cantidad: '3' },
    ])
  })
  it('todo lote lleva código de lote y vencimiento', () => {
    expect(erroresDeFilaCarga(fila())).toEqual([])
    expect(erroresDeFilaCarga(fila({ lote: ' ' }))[0]).toMatch(/código de lote/)
    expect(erroresDeFilaCarga(fila({ vence: '' }))[0]).toMatch(/fecha de vencimiento/)
    expect(erroresDeFilaCarga(fila({ vence: '2029-13-45' }))[0]).toMatch(/no es válida/)
    expect(erroresDeFilaCarga(fila({ estado: 'RETENIDO' }))[0]).toMatch(/no se carga/)
  })
})

describe('el recorrido', () => {
  it('Aprobados y Bajas entran por Cuarentena; Cuarentena se queda', () => {
    expect(recorridoCarga('APROBADO')).toHaveLength(3)
    expect(recorridoCarga('APROBADO')[1]).toMatch(/Liberación/)
    expect(recorridoCarga('BAJAS_RECHAZADOS')[1]).toMatch(/Baja/)
    expect(recorridoCarga('CUARENTENA')).toEqual(['Ingreso por carga inicial en Cuarentena'])
  })
  it('resume las unidades por estado final', () => {
    expect(resumenCarga([fila({ cantidad: '5' }), fila({ estado: 'CUARENTENA', cantidad: '2' }), fila({ estado: 'BAJAS_RECHAZADOS', cantidad: '1' })])).toEqual({ aprobado: 5, cuarentena: 2, bajas: 1, total: 8 })
  })
  it('en la historia del lote marca cada partida con su paso; lo que no viene de una carga no entra', () => {
    const p = pasosDeCargaEnHistoria([
      { partidaId: 1, tipo: 'CARGA_INICIAL', referencia: 'CI-2026-00001', estado: 'CUARENTENA' },
      { partidaId: 2, tipo: 'CAMBIO_ESTADO', referencia: 'CI-2026-00001', estado: 'CUARENTENA' },
      { partidaId: 3, tipo: 'CAMBIO_ESTADO', referencia: 'CI-2026-00001', estado: 'APROBADO' },
      { partidaId: 4, tipo: 'MOVIMIENTO', referencia: 'CI-2026-00001', estado: 'APROBADO' },
      { partidaId: 5, tipo: 'MOVIMIENTO', referencia: 'MI-2026-00007', estado: 'APROBADO' },
      { partidaId: 6, tipo: 'CARGA_INICIAL', referencia: 'CI-2026-00002', estado: 'CUARENTENA' },
    ])
    expect(p.get(1)).toMatchObject({ paso: 1, total: 3 })
    expect(p.get(3)).toMatchObject({ paso: 2, texto: 'Liberación' })
    expect(p.get(4)).toMatchObject({ paso: 3, texto: 'Ubicación final' })
    expect(p.has(5)).toBe(false)
    expect(p.get(6)).toMatchObject({ paso: 1, total: 1 })
  })
})
