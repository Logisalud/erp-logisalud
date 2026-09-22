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
    cuentaBancariaProveedorServicioId: null,
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
        data: [{ propuesta_id: 'pp-1', monto_a_pagar: 100, propuestas_pago: { estado: 'pendiente_aprobacion', created_at: '2026-08-01T00:00:00Z' } }],
        error: null,
      },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(ejecutarPago(borrador())).rejects.toThrow(/todavía no está aprobada por gerencia/i)
  })

  it('rechaza si la obligación ya no tiene una propuesta asociada (huérfana)', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-1', codigo: 'C-0001', estado: 'en_propuesta', moneda: 'PEN', neto_a_pagar: 100 }, error: null },
      { data: [], error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(ejecutarPago(borrador())).rejects.toThrow(/no tiene una propuesta asociada/i)
  })

  it('permite pagar una obligación en_propuesta cuya propuesta ya está aprobada — factura conforme + propuesta aprobada = pagable', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-1', codigo: 'C-0001', estado: 'en_propuesta', moneda: 'PEN', neto_a_pagar: 100 }, error: null },
      { data: [{ propuesta_id: 'pp-1', monto_a_pagar: 100, propuestas_pago: { estado: 'aprobada', created_at: '2026-08-01T00:00:00Z' } }], error: null },
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

describe('ejecutarPago — una obligación que estuvo en un lote rechazado (C-0044)', () => {
  /**
   * El bug de producción del 2026-09-22. C-0044 estuvo en PP-2026-0014, se lo
   * rechazaron, entró a PP-2026-0016 y ese se aprobó — dos filas en
   * `propuesta_detalle`. La consulta pedía la fila con `.maybeSingle()`, que
   * tolera cero filas pero FALLA con dos, y como el código trataba cualquier
   * error como "no hay fila", Tesorería veía "Esta obligación no tiene una
   * propuesta asociada" y no podía cerrar el lote de pagos.
   *
   * OJO con el alcance de estos tests: el mock de Supabase es a propósito
   * "tonto" y su `.maybeSingle()` devuelve lo que se le ponga en la cola, así
   * que NO reproduce el error de PostgREST ante dos filas — con el código
   * viejo estos tests habrían pasado igual. Lo que fijan es el
   * comportamiento nuevo: que se elija el lote vigente y que el monto salga
   * de ese. La regla en sí se prueba en tests/domain/propuesta.test.ts, y el
   * caso real quedó verificado contra los datos de producción.
   */
  const dosLotes = [
    { propuesta_id: 'pp-14', monto_a_pagar: 1505.68, propuestas_pago: { estado: 'rechazada', created_at: '2026-09-18T01:11:07Z' } },
    { propuesta_id: 'pp-16', monto_a_pagar: 1505.68, propuestas_pago: { estado: 'aprobada', created_at: '2026-09-18T16:21:13Z' } },
  ]

  it('paga usando el lote aprobado y NO se cae por el rechazado', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-1', codigo: 'C-0044', estado: 'en_propuesta', moneda: 'PEN', neto_a_pagar: 1505.68 }, error: null },
      { data: dosLotes, error: null },
      { data: { id: 'pago-1' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(ejecutarPago(borrador())).resolves.toEqual({ id: 'pago-1' })
  })

  it('el monto sale del lote VIGENTE, no del rechazado', async () => {
    // Si el lote rechazado tenía otro monto (una nota de crédito posterior
    // cambia el neto), pagar por él sería pagar de más o de menos.
    const { cliente, llamadas } = crearSupabaseMock([
      { data: { id: 'ob-1', codigo: 'C-0044', estado: 'en_propuesta', moneda: 'PEN', neto_a_pagar: 900 }, error: null },
      { data: [
        { propuesta_id: 'pp-14', monto_a_pagar: 1505.68, propuestas_pago: { estado: 'rechazada', created_at: '2026-09-18T01:11:07Z' } },
        { propuesta_id: 'pp-16', monto_a_pagar: 900, propuestas_pago: { estado: 'aprobada', created_at: '2026-09-18T16:21:13Z' } },
      ], error: null },
      { data: { id: 'pago-1' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await ejecutarPago(borrador())
    const insertPago = llamadas.find((l) => l.from === 'pagos')
    expect((insertPago as any)?.payload?.monto_total).toBe(900)
  })

  it('si el ÚNICO lote fue rechazado, no paga y lo dice con todas las letras', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-1', codigo: 'C-0044', estado: 'en_propuesta', moneda: 'PEN', neto_a_pagar: 1505.68 }, error: null },
      { data: [dosLotes[0]], error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(ejecutarPago(borrador())).rejects.toThrow(/lote nuevo antes de pagarla/i)
  })
})
