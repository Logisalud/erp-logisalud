import { describe, expect, it } from 'vitest'
import {
  esArchivoReemplazable, etiquetaReemplazo, puedeReemplazarConstancia, validarReemplazo,
} from '@/domain/reemplazo-constancia'

describe('quién puede reemplazar una constancia', () => {
  it('solo admin+admin: Sebastián y Andrés', () => {
    expect(puedeReemplazarConstancia({ area: 'admin', rol: 'admin' })).toBe(true)
  })

  it('Tesorería NO, aunque la RLS de pagos se lo permitiría', () => {
    // Milagritos ejecuta los pagos: dejarla reemplazar el respaldo de un
    // pago que ella misma hizo borraría la separación entre quien paga y
    // quien custodia la evidencia.
    expect(puedeReemplazarConstancia({ area: 'tesoreria', rol: 'operativo' })).toBe(false)
    expect(puedeReemplazarConstancia({ area: 'tesoreria', rol: 'admin' })).toBe(false)
  })

  it('Contabilidad tampoco, ni siquiera rol admin', () => {
    expect(puedeReemplazarConstancia({ area: 'contabilidad', rol: 'admin' })).toBe(false)
  })

  it('un admin de área sin rol admin tampoco', () => {
    expect(puedeReemplazarConstancia({ area: 'admin', rol: 'operativo' })).toBe(false)
    expect(puedeReemplazarConstancia(null)).toBe(false)
  })
})

describe('validación del reemplazo', () => {
  const ok = { cual: 'voucher', motivo: 'subí la foto equivocada', storagePathNuevo: '2026/09/C-1/x.jpg' }

  it('acepta un reemplazo completo', () => {
    expect(validarReemplazo(ok)).toEqual([])
  })

  it('el motivo es OBLIGATORIO — es lo que hace útil al rastro', () => {
    expect(validarReemplazo({ ...ok, motivo: '   ' }).map((e) => e.campo)).toContain('motivo')
  })

  it('sin archivo nuevo no hay nada que reemplazar', () => {
    expect(validarReemplazo({ ...ok, storagePathNuevo: null }).map((e) => e.campo)).toContain('archivo')
  })

  it('solo se reemplazan los dos archivos conocidos', () => {
    expect(esArchivoReemplazable('voucher')).toBe(true)
    expect(esArchivoReemplazable('detraccion')).toBe(true)
    expect(esArchivoReemplazable('factura')).toBe(false)
    expect(validarReemplazo({ ...ok, cual: 'factura' }).map((e) => e.campo)).toContain('cual')
  })
})

describe('el rastro visible', () => {
  it('dice QUÉ archivo, quién y por qué', () => {
    const t = etiquetaReemplazo('voucher', 'Sebastián Gonzales', '2026-09-15T14:30:00Z', 'foto equivocada')
    expect(t).toContain('Voucher del pago')
    expect(t).toContain('Sebastián Gonzales')
    expect(t).toContain('foto equivocada')
  })

  it('distingue la detracción del voucher', () => {
    expect(etiquetaReemplazo('detraccion', 'X', '2026-09-15T14:30:00Z', 'm'))
      .toContain('Comprobante de detracción')
  })

  it('sin reemplazo no hay rastro que mostrar', () => {
    expect(etiquetaReemplazo(null, null, null, null)).toBeNull()
  })

  it('no inventa un nombre si no lo tiene', () => {
    expect(etiquetaReemplazo('voucher', null, '2026-09-15T14:30:00Z', 'm'))
      .toContain('alguien del ERP')
  })
})
