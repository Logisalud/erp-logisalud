import { describe, expect, it } from 'vitest'
import {
  estadoTrasConformidad, estadoTrasSubirFactura, transicionPermitida,
  validarObligacionServicio, validarOS,
} from '@/domain/servicio'

describe('transicionPermitida', () => {
  it('pendiente_jefe puede aprobarse o rechazarse', () => {
    expect(transicionPermitida('pendiente_jefe', 'aprobada')).toBe(true)
    expect(transicionPermitida('pendiente_jefe', 'rechazada_jefe')).toBe(true)
  })

  it('aprobada puede saltar directo a conformada (factura y conformidad en cualquier orden)', () => {
    expect(transicionPermitida('aprobada', 'conformada')).toBe(true)
    expect(transicionPermitida('aprobada', 'facturada')).toBe(true)
  })

  it('rechazada_jefe y cerrada son estados finales', () => {
    expect(transicionPermitida('rechazada_jefe', 'aprobada')).toBe(false)
    expect(transicionPermitida('cerrada', 'facturada')).toBe(false)
  })

  it('conformada no se pone a mano a cerrada — lo dispara Tesorería al pagar', () => {
    expect(transicionPermitida('conformada', 'cerrada')).toBe(true)
  })
})

describe('estadoTrasSubirFactura', () => {
  it('sin conformidad previa: queda facturada', () => {
    expect(estadoTrasSubirFactura(false)).toBe('facturada')
  })

  it('con conformidad ya dada: salta directo a conformada', () => {
    expect(estadoTrasSubirFactura(true)).toBe('conformada')
  })
})

describe('estadoTrasConformidad', () => {
  it('sin factura todavía: el estado no cambia', () => {
    expect(estadoTrasConformidad(false, 'aprobada')).toBe('aprobada')
  })

  it('con factura ya subida: pasa a conformada', () => {
    expect(estadoTrasConformidad(true, 'facturada')).toBe('conformada')
  })
})

describe('validarOS', () => {
  const base = { proveedorServicioId: 'p-1', descripcionServicio: 'Mantenimiento', montoEstimado: 800, moneda: 'PEN' as const }

  it('sin errores con un borrador completo', () => {
    expect(validarOS(base)).toEqual([])
  })

  it('exige proveedor de servicio', () => {
    expect(validarOS({ ...base, proveedorServicioId: '' }).some((e) => e.campo === 'proveedorServicioId')).toBe(true)
  })

  it('exige monto estimado positivo', () => {
    expect(validarOS({ ...base, montoEstimado: 0 }).some((e) => e.campo === 'montoEstimado')).toBe(true)
  })
})

describe('validarObligacionServicio', () => {
  const base = { osId: 'os-1', numeroFactura: 'F001-123', fechaFactura: '2026-08-28', baseImponible: 100, igv: 18 }

  it('sin errores con un borrador completo', () => {
    expect(validarObligacionServicio(base)).toEqual([])
  })

  it('acepta IGV en 0 (RUS)', () => {
    expect(validarObligacionServicio({ ...base, igv: 0 }).some((e) => e.campo === 'igv')).toBe(false)
  })

  it('exige que el IGV venga informado, nunca se inventa solo', () => {
    expect(validarObligacionServicio({ ...base, igv: null as any }).some((e) => e.campo === 'igv')).toBe(true)
  })

  it('exige número de factura', () => {
    expect(validarObligacionServicio({ ...base, numeroFactura: '' }).some((e) => e.campo === 'numeroFactura')).toBe(true)
  })
})
