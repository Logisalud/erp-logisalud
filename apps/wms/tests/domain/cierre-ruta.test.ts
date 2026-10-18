// Cierre de ruta con el data logger y escaneo del LS-FR.43.03 (OS-7): las reglas puras que la base de datos repite en la migración 0027.
import { describe, expect, it } from 'vitest'
import { leerTemperatura, MAX_BYTES_ADJUNTO, motivoNoSeCierra, motivoNoSeEscanea, puedeCerrarRuta, puedeRegistrarLsFr, tamanoLegible, validarArchivoLogger, validarCierre, validarEscaneo } from '@/domain/cierre-ruta'

describe('permisos del cierre de ruta', () => {
  it('cierra solo el Jefe de Transporte; imprimen y suben el escaneo Transporte, Almacén y Dirección Técnica', () => {
    expect(puedeCerrarRuta(['jefe_transporte'])).toBe(true)
    expect(puedeCerrarRuta(['jefe_almacen'])).toBe(false)
    expect(puedeCerrarRuta(['direccion_tecnica'])).toBe(false)
    expect(puedeCerrarRuta(['auxiliar'])).toBe(false)
    for (const r of ['jefe_transporte', 'jefe_almacen', 'direccion_tecnica', 'asistente_dt'] as const) expect(puedeRegistrarLsFr([r]), r).toBe(true)
    expect(puedeRegistrarLsFr(['auxiliar'])).toBe(false)
    expect(puedeRegistrarLsFr(['admin_wms'])).toBe(false)
  })
})

describe('validar el cierre', () => {
  it('pide la mínima y la máxima, y que la mínima no pase de la máxima', () => {
    expect(validarCierre({})).toEqual({ tempMin: expect.stringContaining('mínima'), tempMax: expect.stringContaining('máxima') })
    expect(validarCierre({ tempMin: 20, tempMax: 18 })).toEqual({ tempMin: 'La temperatura mínima no puede ser mayor que la máxima.' })
    expect(validarCierre({ tempMin: 17.2, tempMax: 22.8 })).toEqual({})
    expect(validarCierre({ tempMin: 20, tempMax: 20 })).toEqual({})
  })
  it('rechaza valores que el data logger no marca', () => {
    expect(validarCierre({ tempMin: -80, tempMax: 10 }).tempMin).toMatch(/Revisa la mínima/)
    expect(validarCierre({ tempMin: 10, tempMax: 120 }).tempMax).toMatch(/Revisa la máxima/)
  })
  it('lee temperaturas con coma o punto', () => {
    expect(leerTemperatura('17,5')).toBe(17.5)
    expect(leerTemperatura(' 17.55 ')).toBe(17.6)
    expect(leerTemperatura('-2')).toBe(-2)
    expect(leerTemperatura('')).toBeNull()
    expect(leerTemperatura('frío')).toBeNull()
  })
})

describe('archivos', () => {
  it('el archivo del data logger es genérico: cualquier tipo, hasta 10 MB, no vacío', () => {
    expect(validarArchivoLogger({ nombre: 'gsp6.csv', bytes: 2048 })).toBeNull()
    expect(validarArchivoLogger({ nombre: 'registro.elitech', bytes: 2048 })).toBeNull()
    expect(validarArchivoLogger({ nombre: 'x.pdf', bytes: 0 })).toMatch(/vacío/)
    expect(validarArchivoLogger({ nombre: 'x.csv', bytes: MAX_BYTES_ADJUNTO + 1 })).toMatch(/10 MB/)
  })
  it('el escaneo firmado es PDF o foto', () => {
    expect(validarEscaneo({ nombre: 'ruta.PDF', bytes: 10 })).toBeNull()
    expect(validarEscaneo({ nombre: 'ruta.jpeg', bytes: 10 })).toBeNull()
    expect(validarEscaneo({ nombre: 'ruta.docx', bytes: 10 })).toMatch(/PDF, JPG o PNG/)
  })
  it('tamaños legibles', () => {
    expect(tamanoLegible(100)).toBe('1 KB')
    expect(tamanoLegible(2048)).toBe('2 KB')
    expect(tamanoLegible(1.5 * 1024 * 1024)).toBe('1,5 MB')
  })
})

describe('estados de la ruta', () => {
  it('se cierra desde que salió; el escaneo se sube desde que la unidad se libera', () => {
    expect(motivoNoSeCierra('EN_RUTA')).toBeNull()
    expect(motivoNoSeCierra('PENDIENTE_CIERRE')).toBeNull()
    expect(motivoNoSeCierra('LIBERADA')).toMatch(/todavía no salió/)
    expect(motivoNoSeCierra('CERRADA')).toMatch(/ya está cerrada/)
    expect(motivoNoSeEscanea('PLANIFICADA')).toMatch(/liberada/)
    expect(motivoNoSeEscanea('LIBERADA')).toBeNull()
    expect(motivoNoSeEscanea('CERRADA')).toBeNull()
  })
})
