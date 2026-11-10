// Informe de validación de la carga de ensayo: por línea qué pasa y qué corregir, totales por estado y veredicto.
import { describe, expect, it } from 'vitest'
import { categoriaDeMensaje, construirInforme, filasDeInforme, informeACsv, resumenDeInforme } from '@/domain/informe-carga'
import { parsearCargaInicial } from '@/domain/inventario'

const fila = (extra: object = {}) => ({ producto: 'P1', lote: 'L1', vence: '2029-01-31', propietario: 'LOGISSA', posicion: 'A-1', estado: 'APROBADO', cantidad: '10', ...extra })
const HOY = '2026-11-02'

describe('categorías', () => {
  it('clasifica los mensajes de la base y del dominio', () => {
    const c = categoriaDeMensaje
    expect(c('Falta el código de lote: todo lote necesita código de lote y fecha de vencimiento')).toBe('lote')
    expect(c('Falta la fecha de vencimiento: todo lote necesita código de lote y fecha de vencimiento')).toBe('vencimiento')
    expect(c('El producto P1 no tiene su registro sanitario y su vencimiento cargados')).toBe('registro_sanitario')
    expect(c('El producto «X» no existe en el catálogo')).toBe('catalogo')
    expect(c('Esta combinación de producto, lote, ubicación y estado ya está en la fila 2')).toBe('duplicado')
    expect(c('El lote L1 aparece con dos vencimientos distintos en el archivo')).toBe('duplicado')
    expect(c('La cantidad debe ser un entero mayor que cero')).toBe('cantidad')
    expect(c('La ubicación «Z-9» no existe')).toBe('ubicacion')
    expect(c('La ubicación A-1 no acepta stock de ese propietario')).toBe('ubicacion')
    expect(c('El propietario «X» no existe')).toBe('propietario')
    expect(c('Faltan las columnas: lote')).toBe('archivo')
  })
})

describe('informe', () => {
  it('todo bien: lista para cargar, con los totales por estado y las unidades', () => {
    const i = construirInforme([fila(), fila({ lote: 'L2', estado: 'CUARENTENA', cantidad: '5' })], [], { hoy: HOY })
    expect(i.totales).toEqual({ total: 2, listas: 2, conAdvertencia: 0, conError: 0 })
    expect(i.veredicto).toBe('LISTA')
    expect(i.veredictoTexto).toBe('Lista para cargar: todas las líneas están bien.')
    expect(i.unidades).toMatchObject({ aprobado: 10, cuarentena: 5, total: 15 })
  })

  it('una línea con error pone el veredicto en «no lista» y dice qué pasa y qué corregir', () => {
    const filas = [fila(), fila({ lote: '' }), fila({ vence: '' })]
    const i = construirInforme(filas, [{ fila: 3, error: 'El producto «P9» no existe en el catálogo' }], { hoy: HOY })
    expect(i.totales).toEqual({ total: 3, listas: 1, conAdvertencia: 0, conError: 2 })
    expect(i.veredicto).toBe('NO_LISTA')
    expect(i.veredictoTexto).toMatch(/No lista para cargar: 2 líneas tienen error/)
    const l2 = i.lineas[1]
    expect(l2.resultado).toBe('ERROR')
    expect(l2.problemas[0]).toMatchObject({ categoria: 'lote', gravedad: 'ERROR' })
    expect(l2.problemas[0].que_corregir).toMatch(/código de lote/)
    expect(i.lineas[2].problemas.map((p) => p.categoria).sort()).toEqual(['catalogo', 'vencimiento'])
    expect(i.porCategoria.map((c) => c.categoria).sort()).toEqual(['catalogo', 'lote', 'vencimiento'])
  })

  it('un mismo mensaje que llega de la base y del dominio se cuenta una sola vez', () => {
    const f = fila({ lote: '' })
    const i = construirInforme([f], [{ fila: 1, error: 'Falta el código de lote: todo lote necesita código de lote y fecha de vencimiento' }], { hoy: HOY })
    expect(i.lineas[0].problemas).toHaveLength(1)
  })

  it('un lote por vencer o ya vencido fuera de Bajas es advertencia: no impide cargar', () => {
    const i = construirInforme([fila({ vence: '2026-12-15' }), fila({ lote: 'L2', vence: '2026-01-01' }), fila({ lote: 'L3', vence: '2026-01-01', estado: 'BAJAS_RECHAZADOS' }), fila({ lote: 'L4' })], [], { hoy: HOY })
    expect(i.lineas.map((l) => l.resultado)).toEqual(['ADVERTENCIA', 'ADVERTENCIA', 'LISTA', 'LISTA'])
    expect(i.lineas[0].problemas[0].que_pasa).toMatch(/vence en 43 días/)
    expect(i.lineas[1].problemas[0].que_pasa).toMatch(/ya venció/)
    expect(i.totales).toMatchObject({ listas: 2, conAdvertencia: 2, conError: 0 })
    expect(i.veredicto).toBe('LISTA')
    expect(i.veredictoTexto).toMatch(/Lista para cargar\. Tiene 2 líneas con advertencia/)
  })

  it('un archivo vacío o con columnas que faltan es «no lista»', () => {
    const vacio = construirInforme([], [{ fila: 0, error: 'El archivo está vacío' }], { hoy: HOY })
    expect(vacio.veredicto).toBe('NO_LISTA')
    expect(vacio.generales).toHaveLength(1)
    const sinFilas = construirInforme([], [], { hoy: HOY })
    expect(sinFilas.veredictoTexto).toBe('No lista para cargar: el archivo no trae filas.')
    const faltan = parsearCargaInicial('producto;lote\nP1;L1')
    const i = construirInforme(faltan.filas, [], { hoy: HOY, erroresLectura: faltan.errores })
    expect(i.generales[0]).toMatchObject({ categoria: 'archivo' })
    expect(i.veredicto).toBe('NO_LISTA')
  })

  it('los errores de lectura (cantidad o fecha que no se entienden) cuentan por fila', () => {
    const r = parsearCargaInicial('producto;lote;vence;propietario;posicion;estado;cantidad\nP1;L1;31/12/2028;LOGISSA;A-1;Aprobado;diez')
    const i = construirInforme(r.filas, [], { hoy: HOY, erroresLectura: r.errores })
    expect(i.lineas[0].problemas[0]).toMatchObject({ categoria: 'cantidad' })
    expect(i.lineas[0].problemas[0].que_corregir).toMatch(/número entero/)
  })

  it('el CSV trae el veredicto, los totales y una fila por problema, con BOM y comillas donde hace falta', () => {
    const i = construirInforme([fila(), fila({ lote: '' })], [], { hoy: HOY, ahora: '2026-11-02T10:00:00Z' })
    const csv = informeACsv(i)
    expect(csv.startsWith('﻿Veredicto,NO LISTA PARA CARGAR')).toBe(true)
    expect(csv).toContain('Con error,1')
    expect(csv).toContain('Fila,Resultado,Producto,Lote,Vence,Propietario,Ubicación,Estado,Cantidad,Qué pasa,Qué hay que corregir')
    expect(csv).toContain('"Falta el código de lote: todo lote necesita código de lote y fecha de vencimiento"'.replace(/"/g, '')) // sin comas: no se encierra
    expect(filasDeInforme(i)).toHaveLength(2)
    expect(resumenDeInforme(i)[0]).toEqual(['Veredicto', 'NO LISTA PARA CARGAR'])
  })
})
