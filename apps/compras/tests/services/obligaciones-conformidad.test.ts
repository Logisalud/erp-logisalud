import { describe, expect, it, vi, beforeEach } from 'vitest'
import { crearSupabaseMock } from './supabase-mock'

const usuario = { id: 'contador-1' }

vi.mock('@logisalud/auth/server', () => ({
  exigirUsuario: vi.fn(async () => usuario),
  crearClienteServidor: vi.fn(),
  perfilActual: vi.fn(async () => ({ area: 'contabilidad', rol: 'admin' })),
}))

import { crearClienteServidor, perfilActual } from '@logisalud/auth/server'
import { darConformidad } from '@/services/obligaciones'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(perfilActual).mockResolvedValue({ area: 'contabilidad', rol: 'admin' } as any)
})

describe('darConformidad — solo registrada/observada puede pasar a conforme, y es idempotente', () => {
  it('mueve una obligación registrada (origen compra) a conforme', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-1', estado: 'registrada', origen: 'compra', os_id: null }, error: null },
      { data: null, error: null }, // update -> conforme
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(darConformidad('ob-1')).resolves.toBeUndefined()
  })

  it('mueve una obligación observada a conforme (Contabilidad la revisó y la levantó)', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-1', estado: 'observada', origen: 'compra', os_id: null }, error: null },
      { data: null, error: null },
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(darConformidad('ob-1')).resolves.toBeUndefined()
  })

  it('repetir la conformidad sobre una obligación ya conforme NO duplica nada — rechaza con error claro', async () => {
    const { cliente, llamadas } = crearSupabaseMock([{ data: { id: 'ob-1', estado: 'conforme', origen: 'compra', os_id: null }, error: null }])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(darConformidad('ob-1')).rejects.toThrow(/solo una obligación registrada u observada puede pasar a conforme/i)
    // Ni siquiera intenta el update: la única llamada fue la lectura.
    expect(llamadas.map((l) => l.from)).toEqual(['obligaciones'])
  })

  it('una obligación ya pagada no puede "volver" a conforme via darConformidad', async () => {
    const { cliente } = crearSupabaseMock([{ data: { id: 'ob-1', estado: 'pagada', origen: 'compra', os_id: null }, error: null }])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(darConformidad('ob-1')).rejects.toThrow(/solo una obligación registrada u observada puede pasar a conforme/i)
  })

  it('origen servicio: rechaza si el área usuaria todavía no dio conformidad del servicio (servicios.conformidad_servicio)', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-2', estado: 'registrada', origen: 'servicio', os_id: 'os-1' }, error: null },
      { data: null, error: null }, // conformidad_servicio: no hay fila conforme=true
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(darConformidad('ob-2')).rejects.toThrow(/el área usuaria todavía no dio conformidad/i)
  })

  it('origen servicio: permite conformidad cuando sí existe conformidad_servicio.conforme = true', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'ob-2', estado: 'registrada', origen: 'servicio', os_id: 'os-1' }, error: null },
      { data: { id: 'cs-1' }, error: null }, // conformidad_servicio sí existe
      { data: null, error: null }, // update -> conforme
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(darConformidad('ob-2')).resolves.toBeUndefined()
  })

  it('solo Contabilidad (rol admin) o admin general puede dar conformidad', async () => {
    vi.mocked(perfilActual).mockResolvedValue({ area: 'compras', rol: 'admin' } as any)
    const { cliente } = crearSupabaseMock([])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(darConformidad('ob-1')).rejects.toThrow(/solo contabilidad/i)
  })
})
