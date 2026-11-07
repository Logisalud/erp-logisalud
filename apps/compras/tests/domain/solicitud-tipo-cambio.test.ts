import { describe, expect, it } from 'vitest'
import { validarSolicitud, type BorradorSolicitud } from '@/domain/gasto'
import { valoresDeSolicitud } from '@/domain/valores-solicitud'

/**
 * Reembolsos en dólares (Sebas, 2026-10-23): los 14 de suscripciones de
 * software no se podían aprobar porque la solicitud nunca pedía el tipo de
 * cambio, y la deuda en USD lo exige (`tipo_cambio_requerido`).
 */

const reembolso = (over: Partial<BorradorSolicitud>): BorradorSolicitud => ({
  tipo: 'reembolso', categoriaId: 'c', moneda: 'PEN', descripcion: 'Suscripción',
  baseImponible: 20, igv: 0, fechaFactura: '2026-10-14', tipoComprobante: 'factura', ...over,
})
const campos = (b: BorradorSolicitud) => validarSolicitud(b).map((e) => e.campo)

describe('tipo de cambio en una solicitud', () => {
  it('en dólares es obligatorio', () => {
    expect(campos(reembolso({ moneda: 'USD' }))).toContain('tipoCambio')
    expect(campos(reembolso({ moneda: 'USD', tipoCambio: 0 }))).toContain('tipoCambio')
    expect(campos(reembolso({ moneda: 'USD', tipoCambio: 3.752 }))).not.toContain('tipoCambio')
  })

  it('en soles no se pide', () => {
    expect(campos(reembolso({ moneda: 'PEN' }))).not.toContain('tipoCambio')
  })

  it('también en un anticipo en dólares (la deuda nace igual en USD)', () => {
    expect(campos({ tipo: 'anticipo', categoriaId: 'c', moneda: 'USD', descripcion: 'Viaje', montoAnticipo: 100 }))
      .toContain('tipoCambio')
  })

  it('al editar, el guardado vuelve al formulario', () => {
    const v = valoresDeSolicitud({
      tipo: 'reembolso', categoria_id: 'c', moneda: 'USD', descripcion: 'x', monto_solicitado: 20,
      base_imponible: 20, igv: 0, destino: null, fecha_inicio: null, fecha_fin: null, fecha_requerida: null,
      asignado_a: null, quien_autoriza: null, fecha_factura: '2026-10-14', tipo_cambio: '3.7520',
    })
    expect(v.tipoCambio).toBe('3.7520')
  })
})
