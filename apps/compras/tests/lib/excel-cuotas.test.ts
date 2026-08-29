import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { generarPlantillaCuotas, parsearCuotasExcel } from '@/lib/excel-cuotas'

function libroABuffer(filas: unknown[][]): ArrayBuffer {
  const hoja = XLSX.utils.aoa_to_sheet(filas)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Cronograma')
  const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

const ENCABEZADO = ['N° Cuota', 'Fecha vencimiento', 'Capital', 'Interés']

describe('parsearCuotasExcel', () => {
  it('parsea un archivo bien formado', () => {
    const buffer = libroABuffer([ENCABEZADO, [1, '2026-09-15', 500, 10], [2, '2026-10-15', 500, 5]])
    const resultado = parsearCuotasExcel(buffer)
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.cuotas).toEqual([
        { numeroCuota: 1, fechaVencimiento: '2026-09-15', montoCapital: 500, montoInteres: 10 },
        { numeroCuota: 2, fechaVencimiento: '2026-10-15', montoCapital: 500, montoInteres: 5 },
      ])
    }
  })

  it('interés vacío se lee como 0, no como error', () => {
    const buffer = libroABuffer([ENCABEZADO, [1, '2026-09-15', 500, '']])
    const resultado = parsearCuotasExcel(buffer)
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.cuotas[0].montoInteres).toBe(0)
  })

  it('rechaza un encabezado equivocado con un mensaje claro', () => {
    const buffer = libroABuffer([['Cuota', 'Fecha', 'Capital', 'Interés'], [1, '2026-09-15', 500, 0]])
    const resultado = parsearCuotasExcel(buffer)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.errores[0].campo).toBe('archivoCuotas')
      expect(resultado.errores[0].mensaje).toMatch(/primera fila/)
    }
  })

  it('rechaza una hoja sin filas de datos', () => {
    const buffer = libroABuffer([ENCABEZADO])
    const resultado = parsearCuotasExcel(buffer)
    expect(resultado.ok).toBe(false)
  })

  it('reporta fila y columna exactas de una celda no numérica', () => {
    const buffer = libroABuffer([ENCABEZADO, [1, '2026-09-15', 'quinientos', 0]])
    const resultado = parsearCuotasExcel(buffer)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.errores).toHaveLength(1)
      expect(resultado.errores[0].campo).toBe('cuotas.0.montoCapital')
      expect(resultado.errores[0].mensaje).toMatch(/Fila 2.*Capital.*quinientos/)
    }
  })

  it('reporta una fecha con formato inválido', () => {
    const buffer = libroABuffer([ENCABEZADO, [1, '15/09/2026', 500, 0]])
    const resultado = parsearCuotasExcel(buffer)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.errores[0].campo).toBe('cuotas.0.fechaVencimiento')
    }
  })

  it('acumula errores de varias filas a la vez, no solo la primera', () => {
    const buffer = libroABuffer([
      ENCABEZADO,
      [1, '2026-09-15', 'malo', 0],
      [2, 'fecha-mala', 500, 0],
    ])
    const resultado = parsearCuotasExcel(buffer)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.errores).toHaveLength(2)
      expect(resultado.errores[0].campo).toBe('cuotas.0.montoCapital')
      expect(resultado.errores[1].campo).toBe('cuotas.1.fechaVencimiento')
    }
  })
})

describe('generarPlantillaCuotas', () => {
  it('genera un archivo que el propio parser acepta', () => {
    const buffer = generarPlantillaCuotas()
    const resultado = parsearCuotasExcel(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer)
    expect(resultado.ok).toBe(true)
  })
})
