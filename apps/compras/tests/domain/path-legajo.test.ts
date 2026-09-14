import { describe, expect, it } from 'vitest'

/**
 * El formato de path que exige la policy de Storage
 * `legajos_gastos_escritura` vía `path_legajo_valido(name)`:
 *
 *   ^[0-9]{4}/(0[1-9]|1[0-2])/[^/]+/.+$
 *
 * Está replicado acá a propósito. La regla vive en la base y no se puede
 * importar, así que la única forma de que un cambio de path no vuelva a
 * fallar en silencio —como pasó con `borradores/<uuid>/...`— es tener el
 * contrato escrito de este lado también.
 */
const PATH_LEGAJO_VALIDO = /^[0-9]{4}\/(0[1-9]|1[0-2])\/[^/]+\/.+$/

/** Mismo armado que `subirComprobanteSuelto` en services/aportes-accionista.ts. */
function pathDeBorrador(fecha: Date, uuid: string, nombre: string): string {
  const yyyy = String(fecha.getFullYear())
  const mm = String(fecha.getMonth() + 1).padStart(2, '0')
  const limpio = nombre.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${yyyy}/${mm}/borradores-${uuid}/${limpio}`
}

describe('el path del comprobante en borrador respeta la policy de Storage', () => {
  it('cumple el formato que exige path_legajo_valido', () => {
    const path = pathDeBorrador(new Date('2026-09-14T12:00:00Z'), 'abc-123', 'IMG_7280.jpg')
    expect(path).toMatch(PATH_LEGAJO_VALIDO)
  })

  it('funciona en enero y en diciembre — el mes va con cero a la izquierda', () => {
    expect(pathDeBorrador(new Date(2026, 0, 5), 'u', 'a.pdf')).toMatch(PATH_LEGAJO_VALIDO)
    expect(pathDeBorrador(new Date(2026, 11, 5), 'u', 'a.pdf')).toMatch(PATH_LEGAJO_VALIDO)
  })

  it('el prefijo de borrador va en el TERCER segmento, no al principio', () => {
    // `borradores/<uuid>/archivo` fue el primer intento y la policy lo
    // rechazaba: no arranca con YYYY/MM.
    expect('borradores/abc-123/IMG_7280.jpg').not.toMatch(PATH_LEGAJO_VALIDO)
  })

  it('un nombre con espacios o acentos se limpia y sigue siendo válido', () => {
    const path = pathDeBorrador(new Date(2026, 8, 14), 'u', 'boleta taxi ñ.jpg')
    expect(path).toMatch(PATH_LEGAJO_VALIDO)
    expect(path).not.toContain(' ')
  })
})
