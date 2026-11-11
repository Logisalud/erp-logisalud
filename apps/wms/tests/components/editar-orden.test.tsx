// @vitest-environment jsdom
// «Editar» la orden: qué campos ofrece según el origen y la etapa, que pida el motivo y que mande solo lo que cambió.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
const acc = vi.hoisted(() => ({ editarOrdenAccion: vi.fn() }))
vi.mock('@/app/acciones-salida-manual', () => acc)
import { EditarOrden } from '@/components/salidas/editar-orden'
import type { SalidaVista } from '@/domain/despacho'

const salida = (p: Partial<SalidaVista> = {}) => ({
  id: 's1', numero: 'OS-2026-00001', estado: 'ABIERTA', creadaDesde: 'MANUAL', origen: 'MANUAL', conPedido: false,
  clienteManual: { ruc: '20123456789', razonSocial: 'Botica Salud SAC', direccion: 'Av. Lima 123', ubigeo: '150101' },
  lineasDetalle: [{ id: 'l1', producto: 'Paracetamol 500 mg', productoCodigo: 'P-1', cantidad: 50, estado: 'ASIGNADA' }], ...p,
}) as unknown as SalidaVista
beforeEach(() => { acc.editarOrdenAccion.mockReset(); acc.editarOrdenAccion.mockResolvedValue({ ok: true, cambios: [], sinStock: 0 }) })

describe('Editar la orden (pantalla)', () => {
  it('quien no prepara salidas, o una orden cerrada, no ve el botón', () => {
    const { unmount } = render(<EditarOrden salida={salida()} roles={['auxiliar']} />); expect(screen.queryByTestId('editar-orden-abrir')).toBeNull(); unmount()
    render(<EditarOrden salida={salida({ estado: 'CANCELADA' })} roles={['jefe_almacen']} />); expect(screen.queryByTestId('editar-orden-abrir')).toBeNull()
  })

  it('una orden manual antes del picking ofrece nota, destinatario y cantidades; las cantidades piden el motivo y se manda solo lo que cambió', async () => {
    render(<EditarOrden salida={salida()} roles={['jefe_almacen']} />)
    await userEvent.click(screen.getByTestId('editar-orden-abrir'))
    expect(screen.getByTestId('editar-destinatario')).toBeInTheDocument(); expect(screen.queryByTestId('editar-orden-limite')).toBeNull()
    expect(screen.getByTestId('editar-orden-guardar')).toBeDisabled()   // nada cambió
    await userEvent.clear(screen.getByTestId('editar-cantidad')); await userEvent.type(screen.getByTestId('editar-cantidad'), '30')
    expect(screen.getByTestId('editar-orden-guardar')).toBeDisabled(); expect(screen.getByTestId('editar-orden-falta')).toHaveTextContent('por qué cambias la orden')
    await userEvent.type(screen.getByTestId('editar-motivo'), 'El cliente pidió menos')
    expect(screen.getByTestId('editar-orden-guardar')).toBeEnabled()
    await userEvent.click(screen.getByTestId('editar-orden-guardar'))
    await waitFor(() => expect(acc.editarOrdenAccion).toHaveBeenCalledWith('s1', { lineas: [{ lineaId: 'l1', cantidad: 30 }] }, 'El cliente pidió menos'))
  })

  it('una orden de un pedido no ofrece «Editar»: se cambia en Pedidos', () => {
    render(<EditarOrden salida={salida({ creadaDesde: 'BANDEJA', origen: 'PEDIDO' })} roles={['jefe_almacen']} />)
    expect(screen.queryByTestId('editar-orden-abrir')).toBeNull()
  })

  it('con el picking empezado solo la nota, con su motivo', async () => {
    render(<EditarOrden salida={salida({ ordenPickingId: 'o1' })} roles={['jefe_transporte']} />)
    await userEvent.click(screen.getByTestId('editar-orden-abrir'))
    expect(screen.getByTestId('editar-orden-limite')).toHaveTextContent('ya empezó el picking'); expect(screen.queryByTestId('editar-lineas')).toBeNull()
  })
})
