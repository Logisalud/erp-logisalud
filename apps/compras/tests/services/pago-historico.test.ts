import { describe, expect, it, vi, beforeEach } from 'vitest'
import { crearSupabaseMock } from './supabase-mock'

vi.mock('@logisalud/auth/server', () => ({
  exigirUsuario: vi.fn(async () => ({ id: 'user-1', email: 'sebas@logisalud.com' })),
  crearClienteServidor: vi.fn(),
  perfilActual: vi.fn(async () => ({ area: 'admin', rol: 'admin' })),
}))

// La categoría se resuelve contra la base en otro servicio; acá se fija en la
// del backlog, que es la única donde este camino existe.
vi.mock('@/services/obligaciones', () => ({
  mapaCategoriasPagoDirecto: vi.fn(async () => new Map([['cat-backlog', 'Regularización de pagos antiguos (pre-ERP)']])),
}))

import { crearClienteServidor } from '@logisalud/auth/server'
import { registrarPagoHistorico } from '@/services/pago-historico'

const obligacionBacklog = {
  data: {
    id: 'ob-1', codigo: 'C-0100', origen: 'gasto_directo', estado: 'registrada',
    moneda: 'PEN', neto_a_pagar: 250, categoria_pago_directo_id: 'cat-backlog',
  },
  error: null,
}

beforeEach(() => vi.clearAllMocks())

describe('registrarPagoHistorico — cuenta de origen (migración 0075)', () => {
  /**
   * A diferencia del pago del lote, acá la cuenta es OPCIONAL: son pagos del
   * backlog, de hace meses, y puede que nadie sepa ya de cuál salieron. Un
   * null honesto vale más que obligar a elegir una cuenta al azar.
   */
  it('sin cuenta se registra igual, y queda en null — no se inventa la 79', async () => {
    const { cliente, llamadas } = crearSupabaseMock([
      obligacionBacklog,
      { data: { id: 'pago-1' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await registrarPagoHistorico({
      obligacionId: 'ob-1', fechaPago: '2026-02-10', numeroOperacion: null, storagePathVoucher: null,
    })
    const insertPago = llamadas.find((l) => l.from === 'pagos')
    expect(insertPago?.payload?.cuenta_empresa_id).toBeNull()
    // Y no se consultó ninguna cuenta: no había nada que validar.
    expect(llamadas.some((l) => l.from === 'cuentas_bancarias_empresa')).toBe(false)
  })

  it('con cuenta, se valida que siga activa y se guarda', async () => {
    const { cliente, llamadas } = crearSupabaseMock([
      obligacionBacklog,
      { data: { id: 'cta-emp-1', activo: true }, error: null },
      { data: { id: 'pago-1' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await registrarPagoHistorico({
      obligacionId: 'ob-1', fechaPago: '2026-02-10', numeroOperacion: null, storagePathVoucher: null,
      cuentaEmpresaId: 'cta-emp-1',
    })
    const insertPago = llamadas.find((l) => l.from === 'pagos')
    expect(insertPago?.payload?.cuenta_empresa_id).toBe('cta-emp-1')
  })

  it('un string vacío del formulario ("No sé de cuál salió") cuenta como null', async () => {
    const { cliente, llamadas } = crearSupabaseMock([
      obligacionBacklog,
      { data: { id: 'pago-1' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await registrarPagoHistorico({
      obligacionId: 'ob-1', fechaPago: '2026-02-10', numeroOperacion: null, storagePathVoucher: null,
      cuentaEmpresaId: '',
    })
    expect(llamadas.find((l) => l.from === 'pagos')?.payload?.cuenta_empresa_id).toBeNull()
  })

  it('una cuenta dada de baja se rechaza antes de crear el pago', async () => {
    const { cliente, llamadas } = crearSupabaseMock([
      obligacionBacklog,
      { data: { id: 'cta-emp-1', activo: false }, error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(registrarPagoHistorico({
      obligacionId: 'ob-1', fechaPago: '2026-02-10', numeroOperacion: null, storagePathVoucher: null,
      cuentaEmpresaId: 'cta-emp-1',
    })).rejects.toThrow(/ya no está activa/i)
    expect(llamadas.some((l) => l.from === 'pagos')).toBe(false)
  })
})
