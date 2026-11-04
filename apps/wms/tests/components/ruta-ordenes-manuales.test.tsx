// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const acc = vi.hoisted(() => ({
  planificarRutaAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, version: 2, bloqueadosPorStock: [] as string[] }) as unknown),
  confirmarRutaAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const }) as unknown),
  cancelarRutaAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const }) as unknown),
}))
vi.mock('@/app/acciones-rutas', () => acc)
vi.mock('@/components/rutas/panel-ls-fr', () => ({ PanelLsFr: () => null }))
import { EditorRuta } from '@/components/rutas/editor-ruta'
import type { OrdenPlanificable, PanoramaRutas, RutaVista } from '@/domain/rutas'

const orden = (n: string, extra: Partial<OrdenPlanificable> = {}): OrdenPlanificable => ({ salidaId: n, clave: `orden:${n}`, numero: `OS-2026-0000${n}`, tipo: 'DISTRIBUCION', pedidoNumero: `PED-M${n}`, cliente: `Botica ${n} SAC`, ruc: '20123456789', direccion: 'Av. Lima 123', lineas: 1, unidades: 5, creadaEn: '2026-10-01T15:00:00Z', sinStock: false, ...extra })
const ruta: RutaVista = { id: 'r1', numero: 'RUT-2026-00001', fecha: '2026-10-25', estado: 'BORRADOR', version: 1, paradas: [], versiones: [{ version: 1, en: '2026-10-20T10:00:00Z', por: 'Roberto', motivo: 'Ruta creada', paradas: 0 }], creadaPor: 'Roberto', creadaEn: '2026-10-20T10:00:00Z', unidades: 0,
  vehiculo: { id: 'v1', placa: 'BKW-757', tipo: 'PROPIO', calificado: true, aptoCadenaFrio: false, activo: true }, conductor: { id: 'c1', nombre: 'Luis Quispe', funcion: 'CONDUCTOR', activo: true } }
const panorama = (ordenes: OrdenPlanificable[]): PanoramaRutas => ({ hoy: '2026-10-20', corte: '16:00', rutas: [ruta], vehiculos: [ruta.vehiculo!], personal: [ruta.conductor!], pedidos: [], ordenes })
beforeEach(() => { Object.values(acc).forEach((f) => f.mockClear()) })

describe('«Órdenes manuales por despachar» junto a «Pedidos por planificar»', () => {
  it('lista las órdenes manuales con su tipo, pedido y destino; sin ninguna, lo dice', () => {
    const { unmount } = render(<EditorRuta ruta={ruta} panorama={panorama([orden('1'), orden('2', { tipo: 'MUESTRA', pedidoNumero: undefined, cliente: 'Clínica Sur' })])} />)
    const lista = screen.getByTestId('lista-ordenes-disponibles')
    expect(within(lista).getAllByTestId('orden-disponible')).toHaveLength(2)
    expect(lista).toHaveTextContent('Botica 1 SAC'); expect(lista).toHaveTextContent('pedido PED-M1'); expect(lista).toHaveTextContent('Muestra de Logissa')
    unmount()
    render(<EditorRuta ruta={ruta} panorama={panorama([])} />)
    expect(screen.getByTestId('sin-ordenes-disponibles')).toHaveTextContent('No hay órdenes manuales para despachar')
  })

  it('agregar una orden la pasa a las paradas (como orden manual) y guardar manda su salidaId, no un pedido', async () => {
    render(<EditorRuta ruta={ruta} panorama={panorama([orden('1'), orden('2')])} />)
    await userEvent.click(screen.getAllByTestId('agregar-orden')[0])
    const p = screen.getByTestId('parada')
    expect(p).toHaveTextContent('Botica 1 SAC'); expect(p).toHaveTextContent('Orden manual · Venta de distribución')
    expect(screen.getAllByTestId('orden-disponible')).toHaveLength(1)
    await userEvent.click(screen.getByTestId('guardar-plan'))
    expect(acc.planificarRutaAccion).toHaveBeenCalledTimes(1)
    expect(acc.planificarRutaAccion.mock.calls[0][1]).toMatchObject({ paradas: [{ salidaId: '1' }] })
    expect((acc.planificarRutaAccion.mock.calls[0][1] as { paradas: object[] }).paradas[0]).not.toHaveProperty('pedidoId')
  })

  it('una orden creada después del corte pide excepción con motivo, igual que un pedido; una sin stock no se puede agregar', async () => {
    render(<EditorRuta ruta={ruta} panorama={panorama([orden('1', { creadaEn: '2026-10-24T22:00:00Z' }), orden('2', { sinStock: true })])} />)
    expect(screen.getAllByTestId('agregar-orden')[1]).toBeDisabled()
    await userEvent.click(screen.getAllByTestId('agregar-orden')[0])
    expect(screen.getByTestId('chip-corte')).toHaveTextContent('Se creó después del corte')
    expect(screen.getByTestId('errores-plan')).toHaveTextContent('se creó después del corte de las 16:00')
    await userEvent.click(screen.getByTestId('excepcion-corte'))
    await userEvent.type(screen.getByTestId('excepcion-motivo'), 'Urgente')
    expect(screen.queryByTestId('errores-plan')).toBeNull()
  })

  it('una orden ya en otra ruta se ve bloqueada con el número de esa ruta', () => {
    render(<EditorRuta ruta={ruta} panorama={panorama([orden('1', { enRuta: 'RUT-2026-00007' })])} />)
    expect(screen.getByTestId('orden-disponible')).toHaveTextContent('Ya está en RUT-2026-00007')
    expect(screen.getByTestId('agregar-orden')).toBeDisabled()
  })
})
