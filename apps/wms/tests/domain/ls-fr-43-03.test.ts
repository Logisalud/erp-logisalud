import { describe, expect, it } from 'vitest'
import { armarRegistroLsFr, cierreVigente, conservarHasta, faltaImprimir, fueraDeRangoTemperatura, textoTemperatura, paginarFilas, parametrosDesdeClaves, puedeImprimirLsFr, type FilaLsFr } from '@/domain/ls-fr-43-03'
import type { ParadaVista, RutaVista } from '@/domain/rutas'

const parada = (n: number): ParadaVista => ({ id: `p${n}`, secuencia: n, pedidoId: `ped-${n}`, pedidoNumero: `PED-${n}`, cliente: `Cliente ${n}`, lineas: 1, unidades: 10, stock: 'ASIGNADA', excepcionCorte: false })
const ruta = (n: number, extra: Partial<RutaVista> = {}): RutaVista => ({
  id: 'r1', numero: 'RUT-2026-00001', fecha: '2026-10-15', estado: 'PLANIFICADA', version: 2, paradas: Array.from({ length: n }, (_, i) => parada(i + 1)), versiones: [], registroLsFr: 'BASE',
  creadaPor: 'x', creadaEn: '2026-10-14T10:00:00Z', unidades: n * 10, vehiculo: { id: 'v', placa: 'BKW-757', tipo: 'PROPIO', calificado: true, aptoCadenaFrio: false, activo: true },
  conductor: { id: 'c', nombre: 'Luis Quispe', funcion: 'CONDUCTOR', activo: true }, ...extra,
})

describe('registro LS-FR.43.03', () => {
  it('arma las filas desde las paradas, con la guía y los bultos que registraron las etapas siguientes; lo que falta queda en blanco', () => {
    const r = armarRegistroLsFr(ruta(2), undefined, { guias: { 'ped-1': 'T001-123' }, cajas: { 'ped-1': 3 }, horaSalida: '2026-10-15T13:30:00Z' })
    expect(r).toMatchObject({ codigo: 'LS-FR.43.03', poe: 'LS-POE.07.05', version: '01', placa: 'BKW-757', conductor: 'Luis Quispe', paginas: 1, horaSalida: '2026-10-15T13:30:00Z' })
    expect(r.filas[0]).toMatchObject({ n: 1, cliente: 'Cliente 1', guia: 'T001-123', cajas: 3, detalle: 'ENTREGA' })
    expect(r.filas[1]).toMatchObject({ n: 2, cliente: 'Cliente 2', guia: undefined, cajas: undefined })
  })
  it('10 filas por página: 10 → 1 página, 11 → 2, 0 → 1; la última se completa con filas numeradas vacías', () => {
    expect(armarRegistroLsFr(ruta(10)).paginas).toBe(1)
    expect(armarRegistroLsFr(ruta(11)).paginas).toBe(2)
    expect(armarRegistroLsFr(ruta(0)).paginas).toBe(1)
    const pags = paginarFilas(armarRegistroLsFr(ruta(11)).filas)
    expect(pags.map((p) => p.length)).toEqual([10, 10])
    expect(pags[1].map((f) => f.n)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(pags[1].filter((f) => 'vacia' in f)).toHaveLength(9)
    expect((pags[0][0] as FilaLsFr).cliente).toBe('Cliente 1')
  })
  it('los parámetros pendientes de Dirección Técnica se listan; al definirlos salen de la lista; el formato lo trae de parámetros', () => {
    expect(parametrosDesdeClaves({}).pendientes).toEqual(['ls_fr_43_03_logger_formato', 'ls_fr_43_03_temperatura_fuera_de_rango'])
    const p = parametrosDesdeClaves({ ls_fr_43_03_codigo: 'LS-FR.43.03', ls_fr_43_03_version: '02', ls_fr_43_03_usuario_significado: 'Quien arma la ruta', cajas_equivale_a_bultos: 'SI', ls_fr_43_03_logger_formato: 'CSV Elitech', ls_fr_43_03_temperatura_fuera_de_rango: 'PENDIENTE', ls_fr_43_03_filas_por_pagina: '8' })
    expect(p).toMatchObject({ version: '02', filasPorPagina: 8, pendientes: ['ls_fr_43_03_temperatura_fuera_de_rango'], conservacionAnios: 5, tempMin: 15, tempMax: 25 })
    expect(armarRegistroLsFr(ruta(9), p).paginas).toBe(2)
  })
  it('solo se imprime con la ruta confirmada', () => {
    expect(puedeImprimirLsFr({ estado: 'BORRADOR' })).toBe(false)
    expect(puedeImprimirLsFr({ estado: 'CANCELADA' })).toBe(false)
    expect(puedeImprimirLsFr({ estado: 'PLANIFICADA' })).toBe(true)
  })
})

describe('LS-FR.43.03 con las respuestas de Dirección Técnica (OS-7)', () => {
  it('USUARIO es el Jefe de Transporte que preparó la ruta; la temperatura de cada fila sale del cierre con el data logger', () => {
    const sin = armarRegistroLsFr(ruta(2, { creadaPor: 'Roberto' }))
    expect(sin.usuario).toBe('Roberto')
    expect(sin.filas[0].temperatura).toBeUndefined()
    const cierre = { version: 1, tempMin: 17.2, tempMax: 22.8, fueraDeRango: false, archivoNombre: 'gsp6.csv', archivoBytes: 900, cerradoPor: 'Roberto', cerradoEn: '2026-10-15T20:00:00Z', vigente: true }
    const con = armarRegistroLsFr(ruta(2), undefined, { cierres: [cierre] })
    expect(con.filas.map((f) => f.temperatura)).toEqual(['17,2 – 22,8 °C', '17,2 – 22,8 °C'])
    expect(cierreVigente(con)).toMatchObject({ tempMin: 17.2 })
  })
  it('una corrección del cierre deja la versión anterior y manda la vigente', () => {
    const v1 = { version: 1, tempMin: 17, tempMax: 22, fueraDeRango: false, archivoNombre: 'a.csv', archivoBytes: 1, cerradoPor: 'R', cerradoEn: 'x', vigente: false }
    const v2 = { ...v1, version: 2, tempMax: 24, vigente: true, motivo: 'Se descargó el archivo equivocado' }
    const r = armarRegistroLsFr(ruta(1), undefined, { cierres: [v2, v1] })
    expect(r.cierres).toHaveLength(2)
    expect(cierreVigente(r)!.version).toBe(2)
    expect(r.filas[0].temperatura).toBe('17,0 – 24,0 °C')
  })
  it('el rango del formato marca (sin bloquear) una mínima o máxima fuera de 15 – 25 °C', () => {
    expect(fueraDeRangoTemperatura(15, 25)).toBe(false)
    expect(fueraDeRangoTemperatura(14.9, 20)).toBe(true)
    expect(fueraDeRangoTemperatura(18, 25.1)).toBe(true)
    expect(fueraDeRangoTemperatura(2, 8, { min: 2, max: 8 })).toBe(false)
    expect(textoTemperatura(2, 8)).toBe('2,0 – 8,0 °C')
  })
  it('se conserva 5 años desde la fecha de la ruta (29 de febrero incluido)', () => {
    expect(conservarHasta('2026-10-15')).toBe('2031-10-15')
    expect(conservarHasta('2028-02-29')).toBe('2033-02-28')
    expect(conservarHasta('2026-10-15', 10)).toBe('2036-10-15')
  })
  it('sin impresión registrada se advierte antes de liberar la unidad', () => {
    expect(faltaImprimir(null)).toBe(true)
    expect(faltaImprimir({ impresiones: [] })).toBe(true)
    expect(faltaImprimir({ impresiones: [{ por: 'Roberto', en: 'x', antesDeSalir: true }] })).toBe(false)
  })
})
