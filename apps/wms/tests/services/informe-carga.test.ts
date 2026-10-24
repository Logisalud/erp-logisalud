// Informe de la carga de ensayo con la validación real de la demo (mismas reglas que la base) y su descarga en Excel.
import ExcelJS from 'exceljs'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { construirInforme } from '@/domain/informe-carga'
import { parsearCargaInicial } from '@/domain/inventario'
import { xlsxInformeCarga } from '@/services/xlsx/informe-carga'
import type { Actor } from '@/services/repositorio'

const ADMIN: Actor = { id: 'demo:admin_wms', nombre: 'admin_wms (demo)', roles: ['admin_wms'] }
let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; repo = new RepositorioDemo() })

const CABECERA = 'producto;lote;vence;propietario;posicion;estado;cantidad'
async function informeDe(texto: string) {
  const r = parsearCargaInicial(texto)
  const base = r.filas.length ? await repo.validarCargaInicial(r.filas, ADMIN) : []
  return construirInforme(r.filas, base, { hoy: '2026-11-02', erroresLectura: r.errores })
}

describe('informe de la carga con la validación de la demo', () => {
  it('una carga limpia sale «lista para cargar»', async () => {
    const i = await informeDe(`${CABECERA}\nDEMO-001;CI-1;31/05/2029;LOGISSA;A-6;Cuarentena;10`)
    expect(i.veredicto).toBe('LISTA')
    expect(i.totales).toMatchObject({ total: 1, listas: 1, conError: 0 })
  })

  it('producto sin catálogo, ubicación que no existe, cantidad mala, duplicado y falta de lote/vencimiento salen por línea con su corrección', async () => {
    const i = await informeDe([
      CABECERA,
      'DEMO-001;CI-1;31/05/2029;LOGISSA;A-6;Cuarentena;10',
      'NO-EXISTE;CI-2;31/05/2029;LOGISSA;A-6;Cuarentena;10',
      'DEMO-001;CI-3;31/05/2029;LOGISSA;Z-99;Cuarentena;10',
      'DEMO-001;CI-4;31/05/2029;LOGISSA;A-6;Cuarentena;cero',
      'DEMO-001;CI-1;31/05/2029;LOGISSA;A-6;Cuarentena;4',
      'DEMO-001;;31/05/2029;LOGISSA;A-6;Cuarentena;3',
      'DEMO-001;CI-6;;LOGISSA;A-6;Cuarentena;3',
    ].join('\n'))
    expect(i.veredicto).toBe('NO_LISTA')
    expect(i.totales).toMatchObject({ total: 7, listas: 1, conError: 6 })
    const cats = (n: number) => i.lineas[n - 1].problemas.map((p) => p.categoria)
    expect(cats(2)).toContain('catalogo')
    expect(cats(3)).toContain('ubicacion')
    expect(cats(4)).toContain('cantidad')
    expect(cats(5)).toContain('duplicado')
    expect(cats(6)).toContain('lote')
    expect(cats(7)).toContain('vencimiento')
    for (const l of i.lineas) for (const p of l.problemas) expect(p.que_corregir.length).toBeGreaterThan(10)
  })

  it('el Excel trae la hoja Resumen (veredicto) y la hoja Detalle con una fila por problema', async () => {
    const i = await informeDe(`${CABECERA}\nDEMO-001;CI-1;31/05/2029;LOGISSA;A-6;Cuarentena;10\nNO-EXISTE;CI-2;31/05/2029;LOGISSA;A-6;Cuarentena;10`)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await xlsxInformeCarga(i) as unknown as ArrayBuffer)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Detalle'])
    expect(wb.getWorksheet('Resumen')!.getCell('B3').value).toBe('NO LISTA PARA CARGAR')
    const d = wb.getWorksheet('Detalle')!
    expect(d.getRow(1).getCell(10).value).toBe('Qué pasa')
    expect(d.rowCount).toBe(3)
    expect(d.getRow(3).getCell(2).value).toBe('Con error')
    expect(String(d.getRow(3).getCell(10).value)).toMatch(/catálogo/)
  })
})
