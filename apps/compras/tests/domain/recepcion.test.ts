import { describe, it, expect } from 'vitest'
import { recepcionQuedaConforme } from '@/domain/recepcion'

/**
 * Lo único que quedó de las reglas de recepción viejas. `clasificarLinea`,
 * `validarRecepcion` y `mesesEntre` se eliminaron con el modelo de tres
 * columnas (2026-09-18) y sus tests se fueron con ellas — las reglas nuevas
 * se prueban en tests/domain/recepcion-tres-columnas.test.ts.
 */
describe('recepcionQuedaConforme', () => {
  it('es conforme cuando ninguna línea tiene discrepancia', () => {
    expect(
      recepcionQuedaConforme([
        { tipoDiscrepancia: 'ninguna', resuelta: false },
        { tipoDiscrepancia: 'ninguna', resuelta: false },
      ])
    ).toBe(true)
  })

  it('no es conforme con una discrepancia sin resolver', () => {
    expect(
      recepcionQuedaConforme([
        { tipoDiscrepancia: 'ninguna', resuelta: false },
        { tipoDiscrepancia: 'faltante', resuelta: false },
      ])
    ).toBe(false)
  })

  it('vuelve a ser conforme cuando todas las discrepancias están resueltas', () => {
    expect(
      recepcionQuedaConforme([
        { tipoDiscrepancia: 'faltante', resuelta: true },
        { tipoDiscrepancia: 'danado', resuelta: true },
      ])
    ).toBe(true)
  })

  it('una recepción sin líneas no bloquea nada', () => {
    expect(recepcionQuedaConforme([])).toBe(true)
  })
})
