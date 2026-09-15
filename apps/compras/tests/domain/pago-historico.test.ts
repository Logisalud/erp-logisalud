import { describe, expect, it } from 'vitest'
import { puedeRegistrarsePagoHistorico } from '@/domain/obligacion'

const BACKLOG = 'Regularización de pagos antiguos (pre-ERP)'

describe('pago ya realizado — excepción del backlog pre-ERP', () => {
  it('se puede documentar antes de cualquier decisión de Contabilidad', () => {
    expect(puedeRegistrarsePagoHistorico('registrada', BACKLOG)).toBe(true)
    expect(puedeRegistrarsePagoHistorico('pendiente_factura', BACKLOG)).toBe(true)
  })

  it('SOLO la categoría del backlog — ninguna otra', () => {
    // Este es el punto: si esto devolviera true para otra categoría, sería
    // una forma de saltarse conformidad y propuesta en el flujo normal.
    expect(puedeRegistrarsePagoHistorico('registrada', 'Combustible')).toBe(false)
    expect(puedeRegistrarsePagoHistorico('registrada', 'Seguros')).toBe(false)
    expect(puedeRegistrarsePagoHistorico('registrada', null)).toBe(false)
    expect(puedeRegistrarsePagoHistorico('registrada', '')).toBe(false)
  })

  it('una vez que Contabilidad decidió, sigue el camino normal', () => {
    // No se reescribe por atrás algo que ya entró al circuito.
    expect(puedeRegistrarsePagoHistorico('observada', BACKLOG)).toBe(false)
    expect(puedeRegistrarsePagoHistorico('conforme', BACKLOG)).toBe(false)
    expect(puedeRegistrarsePagoHistorico('en_propuesta', BACKLOG)).toBe(false)
  })

  it('lo ya pagado, anulado o rechazado no se vuelve a pagar', () => {
    expect(puedeRegistrarsePagoHistorico('pagada', BACKLOG)).toBe(false)
    expect(puedeRegistrarsePagoHistorico('anulada', BACKLOG)).toBe(false)
    expect(puedeRegistrarsePagoHistorico('rechazada', BACKLOG)).toBe(false)
  })
})

describe('la excepción NO se filtró a la tabla general de transiciones', () => {
  it('registrada → pagada sigue sin ser una transición válida', async () => {
    const { transicionPermitida } = await import('@/domain/obligacion')
    // Es a propósito: en la tabla general se leería como "cualquier
    // obligación registrada puede saltar a pagada". La excepción vive con
    // nombre propio, no como regla.
    expect(transicionPermitida('registrada', 'pagada')).toBe(false)
  })
})
