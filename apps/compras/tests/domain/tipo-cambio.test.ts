import { describe, expect, it } from 'vitest'
import {
  parsearArchivoSunat, parsearSerieBcrp, restarDias, tipoCambioPublicadoPara,
} from '@/domain/tipo-cambio'

/**
 * Tipo de cambio SUNAT por defecto en las solicitudes en dólares (Sebas,
 * 2026-10-23). Los datos son reales: el archivo de SUNAT y la serie del BCRP
 * tal como respondieron ese día.
 */

describe('archivo diario de SUNAT', () => {
  it('lee la venta del día', () => {
    expect(parsearArchivoSunat('23/10/2026|3.443|3.45|\n')).toEqual({ fecha: '2026-10-23', venta: 3.45 })
  })
  it('cualquier otra cosa (una página de error) no es un tipo de cambio', () => {
    expect(parsearArchivoSunat('<html>Request Rejected</html>')).toBeNull()
  })
})

describe('serie SBS del BCRP', () => {
  const respuesta = {
    periods: [
      { name: '28.Ago.26', values: ['3.356'] },
      { name: '31.Ago.26', values: ['3.367'] },
      { name: '29.Set.26', values: ['3.45'] },
      { name: '08.Oct.26', values: ['n.d.'] },
      { name: '09.Oct.26', values: ['3.457'] },
    ],
  }
  const cierres = parsearSerieBcrp(respuesta)

  it('entiende los meses en español (Ago, Set) y salta los feriados (n.d.)', () => {
    expect(cierres).toEqual([
      { fecha: '2026-08-28', venta: 3.356 },
      { fecha: '2026-08-31', venta: 3.367 },
      { fecha: '2026-09-29', venta: 3.45 },
      { fecha: '2026-10-09', venta: 3.457 },
    ])
  })

  it('SUNAT publica para un día el cierre del día hábil ANTERIOR', () => {
    // Suscripción Claude del 31/08 (lunes): el cierre del viernes 28/08.
    expect(tipoCambioPublicadoPara(cierres, '2026-08-31')?.venta).toBe(3.356)
    // Zoho del 11/10 (domingo), con el 08/10 feriado: el del viernes 09/10.
    expect(tipoCambioPublicadoPara(cierres, '2026-10-11')?.venta).toBe(3.457)
  })

  it('sin un cierre anterior en la lista, no inventa', () => {
    expect(tipoCambioPublicadoPara(cierres, '2026-08-28')).toBeNull()
  })

  it('una respuesta rara no rompe nada', () => {
    expect(parsearSerieBcrp(null)).toEqual([])
    expect(parsearSerieBcrp({ periods: 'x' })).toEqual([])
  })
})

it('restarDias cruza fin de mes y de año', () => {
  expect(restarDias('2026-03-01', 1)).toBe('2026-02-28')
  expect(restarDias('2026-01-05', 10)).toBe('2025-12-26')
})
