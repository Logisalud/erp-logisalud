import { describe, expect, it } from 'vitest'
import {
  excedeTamanoMaximo, formatoTamano, mensajeArchivoDemasiadoGrande,
  TAMANO_MAXIMO_ARCHIVO,
} from '@/domain/archivo'

describe('límite de subida (el botón que no hacía nada)', () => {
  it('deja pasar una foto de celular normal', () => {
    expect(excedeTamanoMaximo(2.5 * 1024 * 1024)).toBe(false)
  })

  it('corta justo por encima del máximo, no antes', () => {
    expect(excedeTamanoMaximo(TAMANO_MAXIMO_ARCHIVO)).toBe(false)
    expect(excedeTamanoMaximo(TAMANO_MAXIMO_ARCHIVO + 1)).toBe(true)
  })

  it('se queda por debajo del tope de 4.5 MB de Vercel', () => {
    expect(TAMANO_MAXIMO_ARCHIVO).toBeLessThan(4.5 * 1024 * 1024)
  })

  it('el mensaje dice el peso real y no solo "muy grande"', () => {
    const mensaje = mensajeArchivoDemasiadoGrande('foto.jpg', 6 * 1024 * 1024)
    expect(mensaje).toContain('foto.jpg')
    expect(mensaje).toContain('6.0 MB')
    expect(mensaje).toContain('4.0 MB')
  })

  it('formatea KB y MB según el tamaño', () => {
    expect(formatoTamano(500 * 1024)).toBe('500 KB')
    expect(formatoTamano(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
