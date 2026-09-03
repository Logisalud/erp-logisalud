import { describe, expect, it } from 'vitest'
import {
  estadoTrasConformidad, estadoTrasRegistrarObligacion, estadoTrasSubirFactura, transicionPermitida,
  validarObligacionServicio, validarOS, superaUmbralDetraccion, facturaSuperaMontoOS,
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

  it('aprobada solo puede pasar a factura_adjunta — nunca directo a facturada/conformada (hallazgo de Mariela, punto 2)', () => {
    expect(transicionPermitida('aprobada', 'factura_adjunta')).toBe(true)
    expect(transicionPermitida('aprobada', 'facturada')).toBe(false)
    expect(transicionPermitida('aprobada', 'conformada')).toBe(false)
  })

  it('factura_adjunta puede pasar a facturada o directo a conformada (según si ya había conformidad)', () => {
    expect(transicionPermitida('factura_adjunta', 'facturada')).toBe(true)
    expect(transicionPermitida('factura_adjunta', 'conformada')).toBe(true)
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
  it('siempre queda en factura_adjunta — nunca salta directo a facturada/conformada, ni con conformidad ya dada', () => {
    // Causa raíz real del hallazgo de Mariela (Contabilidad, punto 2):
    // subir el PDF marcaba la OS como resuelta antes de que existieran
    // los datos reales de la factura (N°/fecha/Base/IGV).
    expect(estadoTrasSubirFactura()).toBe('factura_adjunta')
  })
})

describe('estadoTrasConformidad', () => {
  it('sin factura todavía (aprobada/en_ejecucion): el estado no cambia', () => {
    expect(estadoTrasConformidad('aprobada')).toBe('aprobada')
    expect(estadoTrasConformidad('en_ejecucion')).toBe('en_ejecucion')
  })

  it('factura adjunta pero datos sin completar: tampoco cambia — saltar a conformada ahí repetiría el mismo bug', () => {
    expect(estadoTrasConformidad('factura_adjunta')).toBe('factura_adjunta')
  })

  it('ya facturada (datos completos vía Registrar obligación): pasa a conformada', () => {
    expect(estadoTrasConformidad('facturada')).toBe('conformada')
  })
})

describe('estadoTrasRegistrarObligacion', () => {
  it('sin conformidad previa: queda facturada (falta la conformidad)', () => {
    expect(estadoTrasRegistrarObligacion(false)).toBe('facturada')
  })

  it('con conformidad ya dada mientras estaba en factura_adjunta: pasa directo a conformada', () => {
    expect(estadoTrasRegistrarObligacion(true)).toBe('conformada')
  })
})

describe('validarOS', () => {
  const base = {
    proveedorServicioId: 'p-1', descripcionServicio: 'Mantenimiento', montoEstimado: 800,
    montoIncluyeIgv: false, moneda: 'PEN' as const, condicionesPagoDias: 30,
  }

  it('sin errores con un borrador completo', () => {
    expect(validarOS(base)).toEqual([])
  })

  it('exige proveedor de servicio', () => {
    expect(validarOS({ ...base, proveedorServicioId: '' }).some((e) => e.campo === 'proveedorServicioId')).toBe(true)
  })

  it('exige indicar si el monto es con o sin IGV — no se puede dejar ambiguo', () => {
    expect(validarOS({ ...base, montoIncluyeIgv: null }).some((e) => e.campo === 'montoIncluyeIgv')).toBe(true)
  })

  it('acepta explícitamente con IGV (true) o sin IGV (false)', () => {
    expect(validarOS({ ...base, montoIncluyeIgv: true })).toEqual([])
    expect(validarOS({ ...base, montoIncluyeIgv: false })).toEqual([])
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

  it('bloquea si la factura supera el monto de la OS (hallazgo de Mariela, Contabilidad)', () => {
    const os = { montoEstimado: 100, montoIncluyeIgv: false, moneda: 'PEN' as const }
    const errores = validarObligacionServicio({ ...base, baseImponible: 150, igv: 0 }, os)
    expect(errores.some((e) => e.campo === 'baseImponible' && e.mensaje.includes('supera el monto de la Orden de Servicio'))).toBe(true)
  })

  it('no bloquea si la factura calza con el monto de la OS', () => {
    const os = { montoEstimado: 118, montoIncluyeIgv: true, moneda: 'PEN' as const }
    expect(validarObligacionServicio({ ...base, baseImponible: 100, igv: 18 }, os)).toEqual([])
  })

  it('sin contexto de OS no valida el tope (compatibilidad con llamadas que no lo pasan)', () => {
    expect(validarObligacionServicio(base)).toEqual([])
  })
})

describe('facturaSuperaMontoOS', () => {
  it('OS "sin IGV": compara contra la base imponible de la factura', () => {
    expect(facturaSuperaMontoOS(100, 18, 100, false)).toBe(false)
    expect(facturaSuperaMontoOS(100.01, 0, 100, false)).toBe(true)
  })

  it('OS "con IGV": compara contra el total (base + IGV) de la factura', () => {
    expect(facturaSuperaMontoOS(100, 18, 118, true)).toBe(false)
    expect(facturaSuperaMontoOS(100, 18.01, 118, true)).toBe(true)
  })

  it('OS vieja sin el dato (montoIncluyeIgv null): nunca bloquea', () => {
    expect(facturaSuperaMontoOS(999999, 0, 1, null)).toBe(false)
  })
})
