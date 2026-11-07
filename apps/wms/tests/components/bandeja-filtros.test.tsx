// @vitest-environment jsdom
// Fase 4 · P2: la bandeja con filtro por ruta y día, «importado, sin procesar» explícito y la creación múltiple de órdenes (confirmación y resultado de cada una).
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const acc = vi.hoisted(() => ({ crearOrdenDePedidoAccion: vi.fn(), crearOrdenesPendientesAccion: vi.fn() }))
vi.mock('@/app/acciones-pedidos', () => ({ actualizarBandejaAccion: vi.fn(), revisarCambioPedidoAccion: vi.fn(), simularCambioEnPedidosAccion: vi.fn() }))
vi.mock('@/app/acciones-salida-manual', () => acc)
import { BandejaPedidosVista } from '@/components/pedidos/bandeja-pedidos'
import { pedidoBandeja } from './ayudas-bandeja'

const bandeja = {
  pedidos: [pedidoBandeja(1, { zona: 'norte', dia: 1 }), pedidoBandeja(2, { zona: 'norte', dia: 2 }), pedidoBandeja(3, { zona: 'sur', dia: 1 }), pedidoBandeja(4, { zona: 'norte', dia: 1, salida: 'OS-9' })],
  ultimoIntento: null, ultimaExitosa: null,
}
beforeEach(() => {
  acc.crearOrdenDePedidoAccion.mockReset()
  acc.crearOrdenDePedidoAccion.mockImplementation(async (id: string) => ({ ok: true, id: `s-${id}`, numero: `OS-${id}`, yaExistia: false, faltaStock: false }))
})

describe('bandeja de pedidos: zona, día y sin procesar', () => {
  it('dice explícitamente que lo importado queda «sin procesar» hasta que alguien pida la orden, y la copia no se borra', () => {
    render(<BandejaPedidosVista bandeja={bandeja} puedeActualizar puedeCrearOrdenes />)
    expect(screen.getByTestId('ped-sin-procesar')).toHaveTextContent('importados, sin procesar')
    expect(screen.getByTestId('ped-sin-procesar')).toHaveTextContent('no se borra nunca')
  })
  it('filtra por zona de reparto, por día planificado y los dos; «Sin filtro» lo deja todo', async () => {
    render(<BandejaPedidosVista bandeja={bandeja} puedeActualizar puedeCrearOrdenes />)
    const ruta = screen.getByTestId('ped-filtro-zona'), dia = screen.getByTestId('ped-filtro-dia')
    expect(screen.getByTestId('ped-conteo')).toHaveTextContent('4 pedidos')
    await userEvent.selectOptions(ruta, 'LIMA-SUR')
    expect(screen.getByTestId('ped-conteo')).toHaveTextContent('1 de 4 pedidos')
    await userEvent.selectOptions(ruta, 'LIMA-NORTE'); await userEvent.selectOptions(dia, '1')
    expect(screen.getByTestId('ped-conteo')).toHaveTextContent('2 de 4 pedidos')
    await userEvent.click(screen.getByTestId('ped-limpiar'))
    expect(screen.getByTestId('ped-conteo')).toHaveTextContent('4 pedidos')
    expect((ruta as HTMLSelectElement).value).toBe('')
  })
  it('un filtro sin resultados muestra el vacío con «Quitar filtros»', async () => {
    render(<BandejaPedidosVista bandeja={bandeja} puedeActualizar puedeCrearOrdenes />)
    await userEvent.selectOptions(screen.getByTestId('ped-filtro-zona'), 'LIMA-SUR'); await userEvent.selectOptions(screen.getByTestId('ped-filtro-dia'), '2')
    expect(screen.getByTestId('ped-sin-resultados')).toBeInTheDocument()
    expect(screen.getByTestId('filtrados-ninguno')).toHaveTextContent('no hay órdenes que crear')
  })
})

describe('Crear órdenes de los pedidos filtrados', () => {
  it('pide confirmación (nada se crea antes), crea solo los marcados que no tienen orden y muestra el resultado de cada uno', async () => {
    render(<BandejaPedidosVista bandeja={bandeja} puedeActualizar puedeCrearOrdenes />)
    await userEvent.selectOptions(screen.getByTestId('ped-filtro-zona'), 'LIMA-NORTE')
    // Norte tiene 3 pedidos, uno ya con orden: se ofrecen 2
    await userEvent.click(screen.getByTestId('crear-filtrados'))
    expect(acc.crearOrdenDePedidoAccion).not.toHaveBeenCalled()
    const marcas = screen.getAllByTestId('filtrados-marca')
    expect(marcas).toHaveLength(2)
    await userEvent.click(marcas[1]) // quita el segundo (ped-2)
    expect(screen.getByTestId('filtrados-confirmar')).toHaveTextContent('crear 1 orden')
    await userEvent.click(screen.getByTestId('filtrados-confirmar'))
    await waitFor(() => expect(screen.getByTestId('filtrados-avance')).toHaveTextContent('Listo'))
    expect(acc.crearOrdenDePedidoAccion).toHaveBeenCalledTimes(1)
    expect(acc.crearOrdenDePedidoAccion).toHaveBeenCalledWith('ped-1')
    expect(screen.getAllByTestId('filtrados-ok')).toHaveLength(1)
  })
  it('si una falla las demás igual se crean y el error dice cuál y por qué', async () => {
    acc.crearOrdenDePedidoAccion.mockImplementation(async (id: string) => id === 'ped-1' ? { ok: false, mensaje: 'El producto PARA-500 no está en el catálogo' } : { ok: true, id: 's', numero: 'OS-2', yaExistia: false, faltaStock: true })
    render(<BandejaPedidosVista bandeja={bandeja} puedeActualizar puedeCrearOrdenes />)
    await userEvent.click(screen.getByTestId('crear-filtrados'))
    await userEvent.click(screen.getByTestId('filtrados-confirmar'))
    await waitFor(() => expect(screen.getByTestId('filtrados-avance')).toHaveTextContent('no se pudo'))
    expect(acc.crearOrdenDePedidoAccion).toHaveBeenCalledTimes(3)
    const err = screen.getAllByTestId('filtrados-error')
    expect(err).toHaveLength(1)
    expect(err[0]).toHaveTextContent('PED-0001'); expect(err[0]).toHaveTextContent('no está en el catálogo')
    expect(within(screen.getByTestId('filtrados-resultados')).getAllByTestId('filtrados-ok')[0]).toHaveTextContent('falta stock')
  })
  it('si la acción se cae, se dice y no se pierde el resto; cancelar no crea nada; sin permiso no hay botón', async () => {
    acc.crearOrdenDePedidoAccion.mockRejectedValueOnce(new Error('red'))
    const { unmount } = render(<BandejaPedidosVista bandeja={bandeja} puedeActualizar puedeCrearOrdenes />)
    await userEvent.click(screen.getByTestId('crear-filtrados'))
    await userEvent.click(screen.getByTestId('filtrados-cancelar'))
    expect(acc.crearOrdenDePedidoAccion).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('crear-filtrados'))
    await userEvent.click(screen.getByTestId('filtrados-confirmar'))
    await waitFor(() => expect(screen.getByTestId('filtrados-avance')).toHaveTextContent('no se pudo'))
    expect(screen.getAllByTestId('filtrados-error')[0]).toHaveTextContent('Vuelve a intentarlo')
    unmount()
    render(<BandejaPedidosVista bandeja={bandeja} puedeActualizar={false} puedeCrearOrdenes={false} />)
    expect(screen.queryByTestId('crear-filtrados')).toBeNull()
  })
})
