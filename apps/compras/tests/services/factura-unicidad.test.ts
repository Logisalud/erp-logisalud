import { describe, expect, it, vi, beforeEach } from 'vitest'
import { crearSupabaseMock } from './supabase-mock'

const usuario = { id: 'user-1' }

vi.mock('@logisalud/auth/server', () => ({
  exigirUsuario: vi.fn(async () => usuario),
  crearClienteServidor: vi.fn(),
  perfilActual: vi.fn(async () => ({ area: 'contabilidad', rol: 'admin' })),
}))

import { crearClienteServidor } from '@logisalud/auth/server'
import { registrarPagoDirecto, type BorradorPagoDirecto } from '@/services/obligaciones'

function borrador(overrides: Partial<BorradorPagoDirecto> = {}): BorradorPagoDirecto {
  return {
    proveedorId: 'prov-1',
    categoriaId: 'cat-1',
    descripcion: 'Luz de agosto',
    numeroFactura: 'f001-123',
    fechaFactura: '2026-08-01',
    moneda: 'PEN',
    baseImponible: 100,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('registrarPagoDirecto — pre-chequeo de factura duplicada (proveedor + número normalizado)', () => {
  it('rechaza con un error de negocio claro si ya existe una obligación con esa factura para ese proveedor (aunque el número venga con otra capitalización/espacios)', async () => {
    const { cliente, llamadas } = crearSupabaseMock([
      { data: { id: 'prov-1', condicion_pago_dias: 30 }, error: null }, // proveedores
      { data: { id: 'ob-existente' }, error: null }, // ya existe con F001-123 normalizado
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    await expect(registrarPagoDirecto(borrador({ numeroFactura: '  f001-123 ' }))).rejects.toThrow(
      /ya existe una obligación registrada con la factura F001-123/i
    )
    // No llegó a insertar nada.
    expect(llamadas.map((l) => l.from)).toEqual(['proveedores', 'obligaciones'])
  })

  it('permite registrar cuando el número de factura normalizado no choca con ninguna existente', async () => {
    const { cliente } = crearSupabaseMock([
      { data: { id: 'prov-1', condicion_pago_dias: 30 }, error: null },
      { data: null, error: null }, // no hay duplicado
      { data: { id: 'ob-nueva' }, error: null }, // insert
    ])
    vi.mocked(crearClienteServidor).mockReturnValue(cliente)

    const resultado = await registrarPagoDirecto(borrador())
    expect(resultado).toEqual({ id: 'ob-nueva' })
  })
})
