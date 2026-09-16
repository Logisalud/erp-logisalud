import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'
import {
  hojasCandidatas, MAPA_CATEGORIAS, parsearRendicionExcel, PATRON_HOJA_DETALLE,
} from '@/lib/excel-caja-chica'

/** El archivo REAL que Roberto mantiene, tal cual lo mandó Mariela. */
function excelReal(): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, '../fixtures/rendicion-transporte.xlsx'))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/** Arma un .xlsx al vuelo para los casos que el archivo real no cubre. */
function excelDe(filas: unknown[][], nombreHoja = 'DETALLE - 100,00'): ArrayBuffer {
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), nombreHoja)
  const buf: ArrayBuffer = XLSX.write(libro, { type: 'array', bookType: 'xlsx' })
  return buf
}

const CABECERA = ['FECHA', 'UNIDAD', 'CATEGORIA', 'ORIGEN', 'PROVEEDOR', 'NRO DOC', 'DETALLE', 'MONTO']
const fila = (fecha: string, cat: string, monto: number) =>
  [new Date(fecha), 'BKW757', cat, 'CAJA', 'PROVEEDOR S.A.', 'F001-001', 'detalle', monto]

describe('el archivo real de Roberto', () => {
  it('lo parsea entero: 13 filas y S/ 623.25', () => {
    const r = parsearRendicionExcel(excelReal())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.filas).toHaveLength(13)
    expect(r.total).toBe(623.25)
  })

  it('elige la hoja DETALLE por patrón, no la de caja ni las plantillas', () => {
    const r = parsearRendicionExcel(excelReal())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.hoja).toBe('DETALLE - 943,93')
  })

  it('NO lee el monto del nombre de la hoja: dice 943,93 pero el total es 623.25', () => {
    // La trampa del archivo real. Son números distintos: 943,93 es el saldo
    // de la caja, no el de esta rendición.
    const r = parsearRendicionExcel(excelReal())
    if (!r.ok) throw new Error('debería parsear')
    expect(r.hoja).toContain('943,93')
    expect(r.total).toBe(623.25)
  })

  it('mapea la UNIDAD a la placa y junta PROVEEDOR con DETALLE', () => {
    const r = parsearRendicionExcel(excelReal())
    if (!r.ok) throw new Error('debería parsear')
    const primera = r.filas[0]
    expect(primera.placaVehiculo).toBe('BKW757')
    expect(primera.descripcion).toBe('LIMA EXPRESA S.A.C. — MONTERRICO ENTRADA')
    expect(primera.numero).toBe('F153-03890262')
    expect(primera.fecha).toBe('2026-09-08')
    expect(primera.monto).toBe(6.3)
  })

  it('las 5 categorías del archivo mapean al catálogo del ERP', () => {
    const r = parsearRendicionExcel(excelReal())
    if (!r.ok) throw new Error('debería parsear')
    const usadas = new Set(r.filas.map((f) => f.categoriaNombre))
    expect(usadas).toEqual(new Set(['Peajes', 'Cocheras y estacionamientos', 'Combustible']))
  })

  it('las dos placas del archivo se conservan', () => {
    const r = parsearRendicionExcel(excelReal())
    if (!r.ok) throw new Error('debería parsear')
    expect(new Set(r.filas.map((f) => f.placaVehiculo))).toEqual(new Set(['BKW757', 'BWO902']))
  })
})

describe('las tres validaciones que rechazan el archivo', () => {
  it('1. el total declarado no coincide con la suma', () => {
    const r = parsearRendicionExcel(excelDe([
      CABECERA,
      fila('2026-09-08', 'PEAJE', 10),
      fila('2026-09-09', 'PEAJE', 10),
      [null, null, null, null, null, null, null, 999],  // total mentiroso
    ]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errores[0].mensaje).toContain('no coincide')
  })

  it('2. total en cero — la hoja "plantilla" tiene esta forma exacta', () => {
    const r = parsearRendicionExcel(excelDe([
      CABECERA,
      fila('2026-09-08', 'PEAJE', 0),
    ]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    // Un monto en 0 se rechaza fila por fila, antes de llegar al total.
    expect(r.errores[0].mensaje).toMatch(/mayor que cero|S\/ 0/)
  })

  it('3. una categoría desconocida nombra cuál y en qué fila', () => {
    const r = parsearRendicionExcel(excelDe([
      CABECERA,
      fila('2026-09-08', 'LAVADO DE AUTO', 50),
    ]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errores[0].mensaje).toContain('LAVADO DE AUTO')
    expect(r.errores[0].mensaje).toContain('Fila 2')
  })
})

describe('elección de hoja', () => {
  it('con varias candidatas pide elegir, en vez de adivinar', () => {
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([CABECERA]), 'DETALLE - A')
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([CABECERA]), 'DETALLE - B')
    const r = parsearRendicionExcel(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errores[0].mensaje).toContain('Elige')
  })

  it('respeta la hoja que el usuario elige explícitamente', () => {
    const r = parsearRendicionExcel(excelReal(), 'DETALLE - 943,93')
    expect(r.ok).toBe(true)
  })

  it('si la hoja elegida no existe, lo dice', () => {
    const r = parsearRendicionExcel(excelReal(), 'NO EXISTE')
    expect(r.ok).toBe(false)
  })

  it('el patrón tolera espacios y mayúsculas, y no matchea "plantilla"', () => {
    expect(PATRON_HOJA_DETALLE.test('  detalle - 1')).toBe(true)
    expect(PATRON_HOJA_DETALLE.test('plantilla,')).toBe(false)
    expect(hojasCandidatas(['CAJA 2', 'DETALLE - 943,93', 'plantilla'])).toEqual(['DETALLE - 943,93'])
  })
})

describe('estructura y bordes', () => {
  it('si falta una columna lo dice con el nombre', () => {
    const r = parsearRendicionExcel(excelDe([['FECHA', 'MONTO'], [new Date('2026-09-08'), 10]]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errores[0].mensaje).toContain('UNIDAD')
  })

  it('un archivo que no es xlsx no revienta', () => {
    const basura = new TextEncoder().encode('esto no es un excel').buffer
    expect(parsearRendicionExcel(basura as ArrayBuffer).ok).toBe(false)
  })

  it('GAS y GASOLINA son ambos Combustible: se mapea explícito, no por parecido', () => {
    expect(MAPA_CATEGORIAS.GAS).toBe('Combustible')
    expect(MAPA_CATEGORIAS.GASOLINA).toBe('Combustible')
    expect(MAPA_CATEGORIAS.DIESEL).toBe('Combustible')
  })
})
