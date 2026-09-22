import { describe, expect, it } from 'vitest'
import {
  puedeAprobarse,
  siguienteCodigoPropuesta,
  transicionPermitida,
  validarPropuesta,
  propuestaVigente,
} from '@/domain/propuesta'

describe('transicionPermitida', () => {
  it('borrador solo puede pasar a pendiente_aprobacion', () => {
    expect(transicionPermitida('borrador', 'pendiente_aprobacion')).toBe(true)
    expect(transicionPermitida('borrador', 'aprobada')).toBe(false)
  })

  it('pendiente_aprobacion puede aprobarse o rechazarse', () => {
    expect(transicionPermitida('pendiente_aprobacion', 'aprobada')).toBe(true)
    expect(transicionPermitida('pendiente_aprobacion', 'rechazada')).toBe(true)
  })

  it('una rechazada NO vuelve a borrador: se arma un lote nuevo', () => {
    // La transición estuvo declarada desde el principio y ninguna función la
    // usó nunca — una promesa que nada cumplía. Se quitó el 2026-09-19.
    // Rechazar ya libera las obligaciones a `conforme`, así que rearmar es
    // crear otro lote, no revivir este con su rechazo colgando.
    expect(transicionPermitida('rechazada', 'borrador')).toBe(false)
  })

  it('aprobada es un estado final', () => {
    expect(transicionPermitida('aprobada', 'borrador')).toBe(false)
  })
})

describe('puedeAprobarse', () => {
  it('solo pendiente_aprobacion', () => {
    expect(puedeAprobarse('pendiente_aprobacion')).toBe(true)
    expect(puedeAprobarse('borrador')).toBe(false)
    expect(puedeAprobarse('aprobada')).toBe(false)
  })
})

describe('siguienteCodigoPropuesta', () => {
  it('primera del año', () => {
    expect(siguienteCodigoPropuesta(2026, null)).toBe('PP-2026-0001')
  })

  it('correlativo desde la última', () => {
    expect(siguienteCodigoPropuesta(2026, 'PP-2026-0007')).toBe('PP-2026-0008')
  })
})

describe('validarPropuesta', () => {
  it('exige al menos una obligación', () => {
    expect(validarPropuesta([])).toHaveLength(1)
  })

  it('sin errores con al menos una', () => {
    expect(validarPropuesta(['ob-1'])).toEqual([])
  })
})

describe('propuestaVigente — una obligación en varios lotes', () => {
  /**
   * El caso real de C-0044 (2026-09-22): estuvo en PP-2026-0014, se lo
   * rechazaron, volvió a `conforme`, entró a PP-2026-0016 y ese se aprobó.
   * Quedaron DOS filas en `propuesta_detalle`, y Tesorería no podía
   * registrar el voucher: `ejecutarPago` pedía la fila con `.maybeSingle()`,
   * que tolera cero pero falla con dos, y el error salía como "Esta
   * obligación no tiene una propuesta asociada" — lo contrario de la verdad.
   */
  const rechazada = { estado: 'rechazada', createdAt: '2026-09-18T01:11:07Z', codigo: 'PP-2026-0014' }
  const aprobada = { estado: 'aprobada', createdAt: '2026-09-18T16:21:13Z', codigo: 'PP-2026-0016' }

  it('el lote rechazado no manda: gana el que sigue vivo', () => {
    expect(propuestaVigente([rechazada, aprobada])?.codigo).toBe('PP-2026-0016')
  })

  it('y no depende del orden en que vengan las filas', () => {
    // Postgres no garantiza orden sin `order by`: el bug de
    // `mapaPropuestaDeObligacion` era justamente pisar el mapa fila por fila.
    expect(propuestaVigente([aprobada, rechazada])?.codigo).toBe('PP-2026-0016')
  })

  it('con un solo lote, ese es', () => {
    expect(propuestaVigente([aprobada])?.codigo).toBe('PP-2026-0016')
  })

  it('si el único lote fue rechazado, no hay lote vigente', () => {
    // La obligación volvió a `conforme` y hay que armarle uno nuevo. Devolver
    // el rechazado haría que el pago se apoye en un lote que nadie aprobó.
    expect(propuestaVigente([rechazada])).toBeNull()
  })

  it('sin lotes, null', () => {
    expect(propuestaVigente([])).toBeNull()
  })

  it('un borrador o un pendiente también están vivos: no son rechazos', () => {
    // No los elige para pagar —de eso se encarga el chequeo de `aprobada` en
    // ejecutarPago—, pero sí son "la propuesta de esta obligación".
    expect(propuestaVigente([{ estado: 'borrador', createdAt: '2026-09-20T00:00:00Z' }])?.estado).toBe('borrador')
    expect(propuestaVigente([rechazada, { estado: 'pendiente_aprobacion', createdAt: '2026-09-21T00:00:00Z' }])?.estado)
      .toBe('pendiente_aprobacion')
  })

  it('si hubiera dos vivos —que no debería—, gana el más reciente', () => {
    const viejo = { estado: 'aprobada', createdAt: '2026-01-01T00:00:00Z', codigo: 'PP-2026-0001' }
    expect(propuestaVigente([viejo, aprobada])?.codigo).toBe('PP-2026-0016')
  })
})
