import { describe, expect, it } from 'vitest'
import { construirPanoramaDemo } from '@/services/demo/datos'
import {
  REPORTES, ORDEN_REPORTES, TRAMO_VENCIDO, aCsv, aplicarFiltros, esIdReporte, etiquetasTramos, filasVencimientos, ordenDeTexto, ordenarFilas, tramoDeDias, totalesPorTramo, textoVence, filasAuditoria, filasCalidad, filasExactitud, filasInventario, filasMovimientos, filasOcupacion, filtrosDeUrl, opcionesDe, puedeVerReporte, resumenDe, valorTexto,
} from '@/domain/reportes'
import type { OrdenMovimiento } from '@/domain/inventario'

const p = construirPanoramaDemo('2026-10-09')

describe('reportes: quién ve qué', () => {
  it('los siete reportes existen; exactitud solo para quien gestiona y auditoría solo para quien audita', () => {
    expect(Object.keys(REPORTES)).toHaveLength(8)
    expect(ORDEN_REPORTES[0]).toBe('VENCIMIENTOS') // el más usado, primero
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
      { conteo: 'CT-1', cerradoEn: '2026-10-08T20:00:00Z', posicion: 'A-1', producto: 'P', lote: 'L', propietario: 'X', estado: 'APROBADO', cantidadSistema: 10, cantidadContada: 10, primerConteo: 10, diferencia: 0, resultado: 'COINCIDE' },
      { conteo: 'CT-1', cerradoEn: '2026-10-08T20:00:00Z', posicion: 'A-2', producto: 'P', lote: 'L', propietario: 'X', estado: 'APROBADO', cantidadSistema: 10, cantidadContada: 8, primerConteo: 8, diferencia: -2, resultado: 'AJUSTADA', causa: 'Conteo previo' },
    ])
    expect(resumenDe(REPORTES.EXACTITUD, f).extra).toBe('Exactitud: 50 % (1 de 2 líneas coincidieron en el primer conteo)')
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
    expect(valorTexto(pct, 66.7)).toBe('66.7 %')
    expect(valorTexto(num, null)).toBe('—')
  })
})

describe('reporte de Vencimientos', () => {
  const tramos = [90, 180, 365]
  const filas = filasVencimientos(p, tramos)
  const def = REPORTES.VENCIMIENTOS
  it('los tramos por defecto son 3, 6 y 12 meses y se configuran', () => {
    expect(etiquetasTramos(tramos)).toEqual(['Vencido', '0–3 meses', '3–6 meses', '6–12 meses', 'Más de 12 meses', 'Sin fecha'])
    expect(etiquetasTramos([30, 60])).toEqual(['Vencido', '0–30 días', '30–60 días', 'Más de 60 días', 'Sin fecha'])
    expect(tramoDeDias(-1, tramos)).toBe('Vencido'); expect(tramoDeDias(0, tramos)).toBe('0–3 meses'); expect(tramoDeDias(90, tramos)).toBe('0–3 meses')
    expect(tramoDeDias(91, tramos)).toBe('3–6 meses'); expect(tramoDeDias(365, tramos)).toBe('6–12 meses'); expect(tramoDeDias(366, tramos)).toBe('Más de 12 meses'); expect(tramoDeDias(null, tramos)).toBe('Sin fecha')
  })
  it('una fila por lote y ubicación, con todas las columnas pedidas y sin Bajas/Rechazados', () => {
    expect(def.columnas.map((c) => c.etiqueta)).toEqual(['Producto', 'Código', 'Lote', 'Vence', 'Días para vencer', 'Tramo', 'Propietario', 'Ubicación', 'Estado sanitario', 'Unidades'])
    expect(filas.length).toBeGreaterThan(50)
    expect(filas.every((f) => f.estado !== 'Baja / Rechazado' && Number(f.cantidad) > 0)).toBe(true)
    expect(new Set(filas.map((f) => `${f.loteId}|${f.ubicacion}|${f.estado}`)).size).toBe(filas.length)
  })
  it('por defecto abre con los vencidos primero y luego del más próximo al más lejano; cualquier columna ordena', () => {
    const o = ordenarFilas(def, filas, null)
    const dias = o.map((f) => f.dias as number | null).filter((d): d is number => d !== null)
    expect(dias).toEqual([...dias].sort((a, b) => a - b))
    expect(o[0].tramo).toBe(TRAMO_VENCIDO)
    expect(dias.findIndex((d) => d >= 0)).toBeGreaterThan(0) // los vencidos (negativos) van delante
    const porCantidad = ordenarFilas(def, filas, ordenDeTexto(def, 'cantidad:desc'))
    expect(Number(porCantidad[0].cantidad)).toBe(Math.max(...filas.map((f) => Number(f.cantidad))))
    expect(ordenDeTexto(def, 'inexistente:asc')).toBeNull()
  })
  it('lo que no tiene fecha va siempre al final, en cualquier sentido', () => {
    const f = [{ ...filas[0], dias: null, tramo: 'Sin fecha' }, { ...filas[1], dias: 5 }, { ...filas[2], dias: 1 }]
    expect(ordenarFilas(def, f, { clave: 'dias', asc: true }).map((x) => x.dias)).toEqual([1, 5, null])
    expect(ordenarFilas(def, f, { clave: 'dias', asc: false }).map((x) => x.dias)).toEqual([5, 1, null])
  })
  it('los tramos clicables traen su total de lotes y unidades; filtrar por tramo deja solo ese tramo', () => {
    const orden = etiquetasTramos(tramos)
    const chips = totalesPorTramo(filas, orden)
    expect(chips.map((c) => c.tramo)).toEqual(orden)
    expect(chips.reduce((n, c) => n + c.unidades, 0)).toBe(filas.reduce((n, f) => n + Number(f.cantidad), 0))
    const v = chips.find((c) => c.tramo === TRAMO_VENCIDO)!
    const soloVencidos = aplicarFiltros(def, filas, { tramo: TRAMO_VENCIDO })
    expect(soloVencidos.every((f) => f.tramo === TRAMO_VENCIDO)).toBe(true)
    expect(soloVencidos.reduce((n, f) => n + Number(f.cantidad), 0)).toBe(v.unidades)
    expect(new Set(soloVencidos.map((f) => f.loteId)).size).toBe(v.lotes)
  })
  it('filtra por producto (nombre o código) y por ubicación sin tildes ni mayúsculas, y por propietario y estado', () => {
    const f0 = filas[0]
    expect(aplicarFiltros(def, filas, { producto: String(f0.codigo).toLowerCase() }).every((f) => f.codigo === f0.codigo)).toBe(true)
    expect(aplicarFiltros(def, filas, { ubicacion: String(f0.ubicacion).toLowerCase() }).every((f) => String(f.ubicacion).toLowerCase().includes(String(f0.ubicacion).toLowerCase()))).toBe(true)
    expect(aplicarFiltros(def, filas, { propietario: String(f0.propietario), estado: String(f0.estado) }).every((f) => f.propietario === f0.propietario && f.estado === f0.estado)).toBe(true)
    // el filtro de producto no mira las demás columnas: un lote no lo activa
    expect(aplicarFiltros(def, [{ ...f0, producto: 'Losartán', codigo: 'X-1', lote: 'ZZZ9' }], { producto: 'ZZZ9' })).toEqual([])
  })
  it('la descarga trae lo que se ve: mismos filtros y mismo orden', () => {
    const vistas = ordenarFilas(def, aplicarFiltros(def, filas, { tramo: TRAMO_VENCIDO }), ordenDeTexto(def, 'dias:asc'))
    const csv = aCsv(def, vistas).trim().split('\r\n')
    expect(csv).toHaveLength(vistas.length + 1)
    expect(csv[0].split(',')).toEqual(def.columnas.map((c) => c.etiqueta))
    expect(csv.slice(1).every((l) => l.includes(TRAMO_VENCIDO))).toBe(true)
  })
  it('el teléfono muestra producto, lote, cuánto falta y ubicación en una fila compacta', () => {
    const m = def.movil!({ ...filas[0], dias: 12, vence: '2026-10-21' })
    expect(m.titulo).toBe(filas[0].producto)
    expect(m.lineas[0]).toBe(`Lote ${filas[0].lote} · ${filas[0].ubicacion}`)
    expect(m.lineas[1]).toBe('Vence en 12 días (21/10/2026)')
    expect(textoVence(-3)).toBe('Vencido hace 3 días'); expect(textoVence(0)).toBe('Vence hoy'); expect(textoVence(1)).toBe('Vence en 1 día')
  })
})
