import { describe, expect, it } from 'vitest'
import {
  cambioExigeAviso, etiquetaEdicion, puedeEditarseObligacion, puedeEditarseOS,
  puedeEditarseSolicitud,
} from '@/domain/edicion'

describe('ventana de edición — solo antes de la decisión', () => {
  it('OS: se edita esperando al jefe, no después', () => {
    expect(puedeEditarseOS('pendiente_jefe')).toBe(true)
    expect(puedeEditarseOS('aprobada')).toBe(false)
    expect(puedeEditarseOS('rechazada_jefe')).toBe(false)
    expect(puedeEditarseOS('facturada')).toBe(false)
    expect(puedeEditarseOS('cerrada')).toBe(false)
  })

  it('Pago Directo: se edita antes de la conformidad de Contabilidad', () => {
    expect(puedeEditarseObligacion('pendiente_factura')).toBe(true)
    expect(puedeEditarseObligacion('registrada')).toBe(true)
    // 'observada' ya es una revisión real de Contabilidad.
    expect(puedeEditarseObligacion('observada')).toBe(false)
    expect(puedeEditarseObligacion('conforme')).toBe(false)
    expect(puedeEditarseObligacion('pagada')).toBe(false)
    expect(puedeEditarseObligacion('rechazada')).toBe(false)
    expect(puedeEditarseObligacion('anulada')).toBe(false)
  })

  it('Anticipo/Reembolso: se editan mientras esperan decisión', () => {
    expect(puedeEditarseSolicitud('pendiente_jefe')).toBe(true)
    expect(puedeEditarseSolicitud('pendiente_contabilidad')).toBe(true)
    expect(puedeEditarseSolicitud('aprobada')).toBe(false)
    expect(puedeEditarseSolicitud('rechazada_contabilidad')).toBe(false)
    expect(puedeEditarseSolicitud('pagada')).toBe(false)
  })
})

describe('el correo sale solo si cambió el monto', () => {
  it('no avisa por un cambio que no toca la plata', () => {
    expect(cambioExigeAviso(150.5, 150.5)).toBe(false)
  })

  it('avisa por cualquier cambio real de monto, hasta de un centavo', () => {
    expect(cambioExigeAviso(150.5, 150.51)).toBe(true)
    expect(cambioExigeAviso(150.5, 900)).toBe(true)
  })

  it('no se confunde con la basura de los flotantes', () => {
    expect(cambioExigeAviso(0.1 + 0.2, 0.3)).toBe(false)
  })
})

describe('rastro visible', () => {
  it('sin fecha no hay rastro que mostrar', () => {
    expect(etiquetaEdicion('Mariela', null)).toBeNull()
  })

  it('nombra a quien editó', () => {
    expect(etiquetaEdicion('Mariela Casiano', '2026-09-12T14:30:00Z')).toContain('Mariela Casiano')
  })

  it('no inventa un nombre si no lo tiene', () => {
    expect(etiquetaEdicion(null, '2026-09-12T14:30:00Z')).toContain('alguien del ERP')
  })
})
