import { describe, expect, it } from 'vitest'
import { construirPanoramaDemo } from '@/services/demo/datos'
import {
  REPORTES, aCsv, aplicarFiltros, esIdReporte, filasAuditoria, filasCalidad, filasExactitud, filasInventario, filasMovimientos, filasOcupacion, filtrosDeUrl, opcionesDe, puedeVerReporte, resumenDe, valorTexto,
} from '@/domain/reportes'
import type { OrdenMovimiento } from '@/domain/inventario'

const p = construirPanoramaDemo('2026-10-09')

describe('reportes: quién ve qué', () => {
  it('los siete reportes existen; exactitud solo para quien gestiona y auditoría solo para quien audita', () => {
    expect(Object.keys(REPORTES)).toHaveLength(7)
    expect(esIdReporte('INVENTARIO')).toBe(true); expect(esIdReporte('XX')).toBe(false)
    expect(puedeVerReporte('INVENTARIO', ['auxiliar'])).toBe(true)
    expect(puedeVerReporte('EXACTITUD', ['auxiliar'])).toBe(false)
    expect(puedeVerReporte('EXACTITUD', ['jefe_almacen'])).toBe(true)
    expect(puedeVerReporte('AUDITORIA', ['auxiliar'])).toBe(false)
    expect(puedeVerReporte('AUDITORIA', ['auditoria_lectura'])).toBe(true)
    expect(puedeVerReporte('INVENTARIO', [])).toBe(false)
  })
})

describe('reportes: filas', () => {
  it('inventario trae una fila por saldo con producto, lote, ubicación, estado y unidades', () => {
    const f = filasInventario(p)
    expect(f.length).toBeGreaterThan(10)
    expect(Object.keys(f[0])).toEqual(expect.arrayContaining(REPORTES.INVENTARIO.columnas.map((c) => c.clave)))
    expect(resumenDe(REPORTES.INVENTARIO, f).sumas[0].total).toBe(p.saldos.filter((s) => s.cantidad > 0).reduce((n, s) => n + s.cantidad, 0))
  })
  it('ocupación por propietario: asignadas = con stock + libres', () => {
    const f = filasOcupacion(p)
    expect(f.length).toBeGreaterThan(0)
    for (const r of f) expect(Number(r.asignadas)).toBe(Number(r.conStock) + Number(r.libres))
  })
  it('calidad solo lista lo que pide atención', () => {
    const f = filasCalidad(p)
    expect(f.every((r) => r.situacion)).toBe(true)
    expect(f.some((r) => r.situacion === 'En Cuarentena' || r.situacion === 'Vencido' || String(r.situacion).startsWith('Vence en'))).toBe(true)
  })
  it('movimientos: una fila por línea, con quién ejecutó y quién verificó', () => {
    const o: OrdenMovimiento = {
      id: 'o', numero: 'MI-2026-00001', estado: 'EJECUTADO', motivo: 'x', ejecutorId: 'u1', ejecutor: 'Ana', ejecutadoEn: '2026-10-09T15:00:00Z',
      lineas: [1, 2].map((i) => ({ id: `l${i}`, productoId: 'p', producto: 'P', loteId: 'l', lote: 'L', propietario: 'LOGISSA', estado: 'APROBADO' as const, procedenciaId: 'x', desdePosicionId: 'a', desde: 'A-1', haciaPosicionId: 'b', hacia: 'B-1', cantidad: i * 5, verificacion: 'PENDIENTE' as const })),
    }
    const f = filasMovimientos([o])
    expect(f).toHaveLength(2)
    expect(f[0]).toMatchObject({ numero: 'MI-2026-00001', ejecutor: 'Ana', verificador: null, estado: 'Por verificar', fecha: '2026-10-09' })
  })
  it('exactitud: el porcentaje sale de las filas filtradas', () => {
    const f = filasExactitud([
      { conteo: 'CT-1', cerradoEn: '2026-10-08T20:00:00Z', posicion: 'A-1', producto: 'P', lote: 'L', propietario: 'X', estado: 'APROBADO', cantidadSistema: 10, cantidadContada: 10, diferencia: 0, resultado: 'COINCIDE' },
      { conteo: 'CT-1', cerradoEn: '2026-10-08T20:00:00Z', posicion: 'A-2', producto: 'P', lote: 'L', propietario: 'X', estado: 'APROBADO', cantidadSistema: 10, cantidadContada: 8, diferencia: -2, resultado: 'AJUSTADA', causa: 'Conteo previo' },
    ])
    expect(resumenDe(REPORTES.EXACTITUD, f).extra).toBe('Exactitud: 50 % (1 de 2 líneas contadas sin diferencia)')
    expect(resumenDe(REPORTES.EXACTITUD, aplicarFiltros(REPORTES.EXACTITUD, f, { diferencia: 'Sin diferencia' })).extra).toContain('100 %')
  })
  it('auditoría separa fecha y hora de Lima', () => {
    const f = filasAuditoria([{ id: 1, ts: '2026-10-09T03:30:00Z', actor: 'Ana', evento: 'x', entidad: 'conteos', detalle: 'Conteo cerrado' }])
    expect(f[0]).toMatchObject({ fecha: '2026-10-08', actor: 'Ana', evento: 'Conteo cerrado' })
  })
})

describe('reportes: filtros, exportación y búsqueda', () => {
  const filas = filasInventario(p)
  it('el texto ignora tildes y mayúsculas y acepta coincidencias parciales en cualquier columna', () => {
    const r = aplicarFiltros(REPORTES.INVENTARIO, filas, { q: filas[0].lote as string })
    expect(r.length).toBeGreaterThan(0)
    expect(aplicarFiltros(REPORTES.INVENTARIO, filas, { q: String(filas[0].ubicacion).toLowerCase() }).length).toBeGreaterThan(0)
    expect(aplicarFiltros(REPORTES.INVENTARIO, filas, { q: 'ZZZ-no-existe' })).toEqual([])
    const conTilde = [{ producto: 'Losartán 50 mg', lote: 'L1', vence: null, propietario: 'X', ubicacion: 'A-1', area: 'Aprobados', estado: 'Aprobado', cantidad: 1 }]
    expect(aplicarFiltros(REPORTES.INVENTARIO, conTilde, { q: 'LOSARTAN' })).toHaveLength(1)
  })
  it('selección exacta y rangos de fecha', () => {
    const ops = opcionesDe(filas, 'propietario')
    const una = aplicarFiltros(REPORTES.INVENTARIO, filas, { propietario: ops[0] })
    expect(una.every((r) => r.propietario === ops[0])).toBe(true)
    const hasta = aplicarFiltros(REPORTES.INVENTARIO, filas, { venceHasta: '2026-12-31' })
    expect(hasta.every((r) => r.vence !== null && String(r.vence) <= '2026-12-31')).toBe(true)
  })
  it('el CSV lleva BOM, comillas donde hace falta y los mismos filtros que la pantalla', () => {
    const csv = aCsv(REPORTES.INVENTARIO, [{ producto: 'A, "B"', lote: 'L1', vence: '2027-01-02', propietario: 'X', ubicacion: 'A-1', area: 'Aprobados', estado: 'Aprobado', cantidad: 5 }])
    expect(csv.startsWith('﻿Producto,Lote,Vence')).toBe(true)
    expect(csv).toContain('"A, ""B"""')
    expect(csv.trim().split('\r\n')).toHaveLength(2)
  })
  it('los filtros de la URL solo aceptan las claves del reporte', () => {
    expect(filtrosDeUrl(REPORTES.INVENTARIO, { q: ' abc ', hack: 'x', estado: ['Aprobado', 'otro'] })).toEqual({ q: 'abc', estado: 'Aprobado' })
  })
  it('los valores se muestran como personas los leen', () => {
    const [num, fec, pct] = [REPORTES.INVENTARIO.columnas[7], REPORTES.INVENTARIO.columnas[2], REPORTES.OCUPACION.columnas[4]]
    expect(valorTexto(num, 12)).toBe('12')
    expect(valorTexto(fec, '2027-01-02')).toBe('02/01/2027')
    expect(valorTexto(pct, 66.7)).toBe('66,7 %')
    expect(valorTexto(num, null)).toBe('—')
  })
})
