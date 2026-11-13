// El Kardex que descarga el cliente (0067): el modelo de Logisalud, una hoja por producto y SIN la columna de ubicación; el Kardex del personal conserva la suya.
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import type { FilaKardex } from '@/domain/inventario'
import { xlsxKardex, xlsxKardexCliente } from '@/services/xlsx/documentos'

const fila = (o: Partial<FilaKardex>): FilaKardex => ({ orden: 1, esSaldoInicial: false, tipoDocumento: 'Acta de Recepción', saldo: 0, esReversa: false, ...o })
const filas = (codigo: string): FilaKardex[] => [
  fila({ orden: 0, esSaldoInicial: true, tipoDocumento: 'Saldo inicial', saldo: 10, producto: codigo }),
  fila({ orden: 1, numeroActa: 'AR-0001', fechaActa: '2026-10-01T15:00:00Z', lote: 'L1', contraparte: 'Proveedor SAC', ruc: '20512345671', tipoDocRef: 'GUÍA DE REMISIÓN', numeroDocRef: 'T001-1', posicion: 'G-7.1', entrada: 40, saldo: 50, propietario: 'AJR_LABS', producto: codigo }),
  fila({ orden: 2, tipoDocumento: 'Salida', lote: 'L1', salida: 5, saldo: 45, posicion: 'G-7.1', propietario: 'AJR_LABS', producto: codigo }),
]
const leer = async (b: Buffer) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(b as unknown as ArrayBuffer); return wb }
const encabezados = (ws: ExcelJS.Worksheet) => (ws.getRow(4).values as unknown[]).slice(1)

describe('Kardex del cliente en Excel', () => {
  it('una hoja por producto, el modelo de Logisalud y sin la columna «Ubicación» (ni su dato)', async () => {
    const wb = await leer(await xlsxKardexCliente('AJR Labs S.A.C.', [
      { codigo: 'DEMO-005', descripcion: 'Amoxicilina 500 mg', filas: filas('DEMO-005 · Amoxicilina 500 mg') },
      { codigo: 'DEMO-008', descripcion: 'Ibuprofeno 400 mg', filas: filas('DEMO-008 · Ibuprofeno 400 mg') },
    ], { desde: '2026-10-01' }, 'LS-FR.41'))
    expect(wb.worksheets.map((w) => w.name)).toEqual(['DEMO-005', 'DEMO-008'])
    const ws = wb.worksheets[0]
    expect(ws.getCell('A1').value).toBe('Tarjeta de Control de Existencias (Kardex)')
    expect(String(ws.getCell('A2').value)).toMatch(/AJR Labs S\.A\.C\. · DEMO-005 · Amoxicilina 500 mg · Cód\. Formato: LS-FR\.41/)
    expect(String(ws.getCell('A3').value)).toMatch(/Rango: 1 oct 2026 — hoy · Saldo inicial 10 · Entradas 40 · Salidas 5 · Saldo final 45/)
    expect(encabezados(ws)).toEqual(['Producto', 'Tipo Documento', 'Nro Acta', 'Fecha Acta', 'Lote', 'Proveedor/Cliente', 'Ruc', 'Documento', 'Nro Doc.', 'Entrada', 'Salida', 'Saldo', 'Tipo de ingreso', 'Propietario'])
    const entrada = ws.getRow(6).values as unknown[]
    expect(entrada.slice(1)).toEqual(['DEMO-005 · Amoxicilina 500 mg', 'Acta de Recepción', 'AR-0001', '1 oct 2026', 'L1', 'Proveedor SAC', '20512345671', 'GUÍA DE REMISIÓN', 'T001-1', 40, 0, 50, '', 'AJR_LABS'])
    expect(JSON.stringify(ws.getSheetValues())).not.toContain('G-7.1')
  })
  it('el RUC va como texto y la hoja nunca repite nombre', async () => {
    const wb = await leer(await xlsxKardexCliente('Cliente', [
      { codigo: 'A/B:C', descripcion: 'x', filas: filas('x') }, { codigo: 'A-B-C', descripcion: 'y', filas: filas('y') }, { codigo: 'a-b-c', descripcion: 'z', filas: filas('z') },
    ], {}, 'LS-FR-KDX (provisional)'))
    const nombres = wb.worksheets.map((w) => w.name.toLowerCase())
    expect(new Set(nombres).size).toBe(3)
    expect(wb.worksheets[0].getCell('G6').numFmt).toBe('@')
    expect(String(wb.worksheets[0].getCell('A2').value)).toContain('(provisional, pendiente de código controlado)')
  })
  it('sin movimientos, una hoja que lo dice', async () => {
    const wb = await leer(await xlsxKardexCliente('Cliente', [], {}, 'LS-FR.41'))
    expect(wb.worksheets).toHaveLength(1)
    expect(String(wb.worksheets[0].getCell('A3').value)).toBe('No hay movimientos para este rango.')
  })
  it('el Kardex del personal conserva su columna de ubicación', async () => {
    const wb = await leer(await xlsxKardex(filas('DEMO-005'), { productoId: 'p' }, 'DEMO-005', 'LS-FR.41'))
    expect(encabezados(wb.worksheets[0])).toContain('Ubicación')
    expect(JSON.stringify(wb.worksheets[0].getSheetValues())).toContain('G-7.1')
  })
})
