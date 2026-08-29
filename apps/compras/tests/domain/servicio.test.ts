import { describe, expect, it } from 'vitest'
import {
  estadoTrasConformidad, estadoTrasSubirFactura, transicionPermitida,
  validarObligacionServicio, validarOS, superaUmbralDetraccion,
} from '@/domain/servicio'

describe('superaUmbralDetraccion', () => {
  it('alerta cuando el total en soles supera S/700', () => {
    expect(superaUmbralDetraccion(700.01, 'PEN')).toBe(true)
    expect(superaUmbralDetraccion(701, 'PEN')).toBe(true)
  })

  it('no alerta con exactamente 700 o menos', () => {
    expect(superaUmbralDetraccion(700, 'PEN')).toBe(false)
    expect(superaUmbralDetraccion(500, 'PEN')).toBe(false)
  })

  it('no alerta en USD — la detracción se calcula sobre soles', () => {
    expect(superaUmbralDetraccion(1000, 'USD')).toBe(false)
  })
})

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
  const base = {
    proveedorServicioId: 'p-1', descripcionServicio: 'Mantenimiento', montoEstimado: 800,
    moneda: 'PEN' as const, condicionesPagoDias: 30,
  }

  it('sin errores con un borrador completo', () => {
    expect(validarOS(base)).toEqual([])
  })

  it('exige proveedor de servicio', () => {
    expect(validarOS({ ...base, proveedorServicioId: '' }).some((e) => e.campo === 'proveedorServicioId')).toBe(true)
  })

  it('exige condición de pago — no se puede dejar en blanco', () => {
    expect(validarOS({ ...base, condicionesPagoDias: null }).some((e) => e.campo === 'condicionesPagoDias')).toBe(true)
  })

  it('acepta 0 días (contado) como condición de pago válida', () => {
    expect(validarOS({ ...base, condicionesPagoDias: 0 })).toEqual([])
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
