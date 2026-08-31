import { describe, expect, it, vi, beforeEach } from 'vitest'
import { crearSupabaseMock } from './supabase-mock'

const usuario = { id: 'user-1', email: 'tesoreria@logisalud.com' }

vi.mock('@logisalud/auth/server', () => ({
  exigirUsuario: vi.fn(async () => usuario),
  crearClienteServidor: vi.fn(),
  perfilActual: vi.fn(async () => ({ area: 'contabilidad', rol: 'admin' })),
}))

// Los efectos secundarios de otros orígenes (anticipo, caja chica,
// financiamiento, impuestos, servicio) no son parte de lo que este archivo
// prueba — se stubean como no-op, igual que harían si la obligación no es
// de ese origen.
vi.mock('@/services/solicitudes-gasto', () => ({ marcarSolicitudPagada: vi.fn(async () => {}) }))
vi.mock('@/services/caja-chica', () => ({ marcarReposicionPagada: vi.fn(async () => {}) }))
vi.mock('@/services/financiamiento', () => ({ marcarVencimientoPagado: vi.fn(async () => {}) }))
vi.mock('@/services/impuestos', () => ({ marcarImpuestoPagado: vi.fn(async () => {}) }))
vi.mock('@/services/servicios', () => ({ marcarServicioPagado: vi.fn(async () => {}) }))

import { crearClienteServidor } from '@logisalud/auth/server'
import { ejecutarPago, type BorradorPago } from '@/services/pagos'

function borrador(overrides: Partial<BorradorPago> = {}): BorradorPago {
  return {
    obligacionId: 'ob-1',
    fechaPago: '2026-08-30',
    cuentaBancariaProveedorId: 'cta-1',
    cuentaBancariaEmpleadoId: null,
    numeroVoucher: 'V-001',
    archivoVoucher: null,
    archivoDetraccion: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ejecutarPago — guard server-side de elegibilidad de pago', () => {
  it('rechaza una obligación registrada (factura registrada, sin conformidad todavía) aunque se la llame directo, sin pasar por la UI', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-1', codigo: 'C-0001', estado: 'registrada', moneda: 'PEN', neto_a_pagar: 100 }, error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(ejecutarPago(borrador())).rejects.toThrow(/solo se puede pagar una obligación que está en una propuesta/i)
  })

  it('rechaza una obligación observada — nunca es pagable directamente', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-1', codigo: 'C-0001', estado: 'observada', moneda: 'PEN', neto_a_pagar: 100 }, error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(ejecutarPago(borrador())).rejects.toThrow(/solo se puede pagar una obligación que está en una propuesta/i)
  })

  it('rechaza una obligación conforme pero que todavía no entró a una propuesta', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-1', codigo: 'C-0001', estado: 'conforme', moneda: 'PEN', neto_a_pagar: 100 }, error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(ejecutarPago(borrador())).rejects.toThrow(/solo se puede pagar una obligación que está en una propuesta/i)
  })

  it('rechaza una obligación en_propuesta cuya propuesta todavía no está aprobada por Gerencia', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-1', codigo: 'C-0001', estado: 'en_propuesta', moneda: 'PEN', neto_a_pagar: 100 }, error: null },
      {
        data: { propuesta_id: 'pp-1', monto_a_pagar: 100, propuestas_pago: { estado: 'pendiente_aprobacion' } },
        error: null,
      },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(ejecutarPago(borrador())).rejects.toThrow(/todavía no está aprobada por gerencia/i)
  })

  it('rechaza si la obligación ya no tiene una propuesta asociada (huérfana)', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-1', codigo: 'C-0001', estado: 'en_propuesta', moneda: 'PEN', neto_a_pagar: 100 }, error: null },
      { data: null, error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(ejecutarPago(borrador())).rejects.toThrow(/no tiene una propuesta asociada/i)
  })

  it('permite pagar una obligación en_propuesta cuya propuesta ya está aprobada — factura conforme + propuesta aprobada = pagable', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-1', codigo: 'C-0001', estado: 'en_propuesta', moneda: 'PEN', neto_a_pagar: 100 }, error: null },
      { data: { propuesta_id: 'pp-1', monto_a_pagar: 100, propuestas_pago: { estado: 'aprobada' } }, error: null },
      { data: { id: 'pago-1' }, error: null }, // insert pagos
      { data: null, error: null }, // insert pago_aplicacion
      { data: null, error: null }, // update obligaciones -> pagada
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    const resultado = await ejecutarPago(borrador())
    expect(resultado).toEqual({ id: 'pago-1' })
  })

  it('no llega a insertar el pago cuando la obligación no está en_propuesta (rechazo ocurre antes de cualquier escritura)', async () => {
    const { cliente, llamadas } = crearSupabaseMock([
      { data: { id: 'ob-1', codigo: 'C-0001', estado: 'observada', moneda: 'PEN', neto_a_pagar: 100 }, error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(ejecutarPago(borrador())).rejects.toThrow()
    // Solo se llegó a leer la obligación — ninguna tabla de escritura (pagos,
    // pago_aplicacion) fue tocada.
    expect(llamadas.map((l) => l.from)).toEqual(['obligaciones'])
  })
})
