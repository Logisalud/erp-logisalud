// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ocCoincide, SelectorOrdenCompra } from '@/components/entradas/selector-orden-compra'
import type { OcPendiente } from '@/domain/entradas-vistas'

const item = (id: string, descripcion: string, saldo: number, codigo = id) => ({ ocItemId: id, productoId: `p-${id}`, codigo, descripcion, pedida: saldo, recibida: 0, saldo, facturada: 0 })
const ocs: OcPendiente[] = [
  { ocId: 'a', codigo: 'OC-2026-0001', fechaEmision: '2026-11-01', proveedorNombre: 'Dare Nutrition', proveedorRuc: '20111111111', items: [item('1', 'GUMMIES KIDS CALCIO', 20), item('2', 'ACIDO FÓLICO 800 MCG', 20), item('3', 'YA RECIBIDO', 0)] },
  { ocId: 'b', codigo: 'OC-2026-0009', fechaEmision: '2026-11-08', proveedorNombre: 'Diphasac', proveedorRuc: '20222222222', items: [item('4', 'MUCOFLUX 200MG', 1567)] },
  { ocId: 'c', codigo: 'OC-2026-0028', fechaEmision: '2026-10-20', proveedorNombre: 'JAM PHARMACEUTICAL SAC', proveedorRuc: '20333333333', items: [item('5', 'TELCARD H 80MG', 10), item('6', 'IRBECARD 150MG', 15)] },
]

describe('selector de la orden de compra', () => {
  it('una fila por orden, la más reciente (por fecha de emisión) arriba, con su fecha, sus productos y unidades por recibir (sin las líneas ya recibidas)', () => {
    render(<SelectorOrdenCompra ocs={ocs} ocId="" onElegir={() => {}} />)
    const filas = screen.getAllByTestId('oc-fila')
    expect(filas.map((f) => within(f).getByText(/^OC-2026-/).textContent)).toEqual(['OC-2026-0009', 'OC-2026-0001', 'OC-2026-0028'])
    expect(within(filas[0]).getByTestId('oc-fecha')).toHaveTextContent('8 nov 2026')
    expect(within(filas[2]).getByTestId('oc-fecha')).toHaveTextContent('20 oct 2026')
    expect(filas[1]).toHaveTextContent('Dare Nutrition')
    expect(filas[1]).toHaveTextContent('40 uds')
    expect(screen.getByTestId('oc-conteo')).toHaveTextContent('3 órdenes con saldo por recibir')
    // los productos no se ven hasta desplegar
    expect(screen.queryByText('GUMMIES KIDS CALCIO')).toBeNull()
  })

  it('la flecha despliega el detalle sin elegir la orden; se pueden abrir varias y se cierran', async () => {
    const onElegir = vi.fn()
    render(<SelectorOrdenCompra ocs={ocs} ocId="" onElegir={onElegir} />)
    const boton = screen.getByTestId('oc-detalle-boton-OC-2026-0001')
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(boton)
    await userEvent.click(screen.getByTestId('oc-detalle-boton-OC-2026-0028'))
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    const detalle = screen.getByTestId('oc-detalle-OC-2026-0001')
    expect(detalle).toHaveTextContent('GUMMIES KIDS CALCIO')
    expect(detalle).not.toHaveTextContent('YA RECIBIDO')
    expect(screen.getByTestId('oc-detalle-OC-2026-0028')).toHaveTextContent('IRBECARD 150MG')
    expect(onElegir).not.toHaveBeenCalled()
    await userEvent.click(boton)
    expect(screen.queryByTestId('oc-detalle-OC-2026-0001')).toBeNull()
  })

  it('«Elegir» elige la orden y la marca como elegida con texto, no solo con color', async () => {
    const onElegir = vi.fn()
    const { rerender } = render(<SelectorOrdenCompra ocs={ocs} ocId="" onElegir={onElegir} />)
    await userEvent.click(screen.getByTestId('oc-OC-2026-0009'))
    expect(onElegir).toHaveBeenCalledWith('b')
    rerender(<SelectorOrdenCompra ocs={ocs} ocId="b" onElegir={onElegir} />)
    expect(screen.getByTestId('oc-OC-2026-0009')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('oc-OC-2026-0009')).toHaveTextContent('Elegida')
    expect(screen.getByTestId('oc-OC-2026-0001')).toHaveAttribute('aria-checked', 'false')
  })

  it('el buscador filtra por número, proveedor o producto, sin tildes, y avisa si no hay resultados', async () => {
    render(<SelectorOrdenCompra ocs={ocs} ocId="" onElegir={() => {}} />)
    const buscar = screen.getByTestId('oc-buscar')
    await userEvent.type(buscar, 'folico')
    expect(screen.getAllByTestId('oc-fila')).toHaveLength(1)
    expect(screen.getByTestId('oc-conteo')).toHaveTextContent('1 de 3 órdenes')
    await userEvent.clear(buscar); await userEvent.type(buscar, 'jam pharma')
    expect(screen.getByTestId('oc-OC-2026-0028')).toBeInTheDocument()
    await userEvent.clear(buscar); await userEvent.type(buscar, 'zzz')
    expect(screen.getByTestId('oc-sin-resultados')).toHaveTextContent('Ninguna orden coincide con «zzz»')
  })

  it('la fecha de la OC se puede buscar escrita de varias formas', async () => {
    render(<SelectorOrdenCompra ocs={ocs} ocId="" onElegir={() => {}} />)
    const buscar = screen.getByTestId('oc-buscar')
    for (const [escrito, codigo] of [['08/11/2026', 'OC-2026-0009'], ['2026-11-01', 'OC-2026-0001'], ['20 oct', 'OC-2026-0028'], ['10/2026', 'OC-2026-0028']] as const) {
      await userEvent.clear(buscar); await userEvent.type(buscar, escrito)
      expect(screen.getAllByTestId('oc-fila')).toHaveLength(1)
      expect(screen.getByTestId(`oc-${codigo}`)).toBeInTheDocument()
    }
    await userEvent.clear(buscar); await userEvent.type(buscar, 'nov')
    expect(screen.getAllByTestId('oc-fila')).toHaveLength(2)   // las dos de noviembre
  })

  it('el rango «emitida desde / hasta» filtra por fecha; «Limpiar búsqueda» lo deja todo como estaba', async () => {
    render(<SelectorOrdenCompra ocs={[...ocs, { ocId: 'd', codigo: 'OC-2026-0030', proveedorNombre: 'Sin fecha SAC', proveedorRuc: '20444444444', items: [item('7', 'PRODUCTO X', 5)] }]} ocId="" onElegir={() => {}} />)
    expect(screen.getAllByTestId('oc-fila')).toHaveLength(4)
    expect(screen.queryByTestId('oc-limpiar')).toBeNull()
    fireEvent.change(screen.getByTestId('oc-desde'), { target: { value: '2026-11-01' } })
    expect(screen.getAllByTestId('oc-fila').map((f) => within(f).getByText(/^OC-2026-/).textContent)).toEqual(['OC-2026-0009', 'OC-2026-0001'])   // la de octubre y la sin fecha quedan fuera
    fireEvent.change(screen.getByTestId('oc-hasta'), { target: { value: '2026-11-05' } })
    expect(screen.getAllByTestId('oc-fila')).toHaveLength(1)
    expect(screen.getByTestId('oc-conteo')).toHaveTextContent('1 de 4 órdenes')
    await userEvent.click(screen.getByTestId('oc-limpiar'))
    expect(screen.getAllByTestId('oc-fila')).toHaveLength(4)
    expect(screen.getByTestId('oc-desde')).toHaveValue('')
  })

  it('las órdenes sin fecha van al final y muestran un guion', () => {
    render(<SelectorOrdenCompra ocs={[{ ocId: 'd', codigo: 'OC-2026-0099', proveedorNombre: 'Sin fecha SAC', proveedorRuc: '1', items: [item('7', 'PRODUCTO X', 5)] }, ...ocs]} ocId="" onElegir={() => {}} />)
    const filas = screen.getAllByTestId('oc-fila')
    expect(within(filas[3]).getByText(/^OC-2026-/).textContent).toBe('OC-2026-0099')
    expect(within(filas[3]).getByTestId('oc-fecha')).toHaveTextContent('—')
  })

  it('ocCoincide exige todas las palabras y ignora las líneas sin saldo', () => {
    expect(ocCoincide(ocs[0], 'dare calcio')).toBe(true)
    expect(ocCoincide(ocs[0], 'dare mucoflux')).toBe(false)
    expect(ocCoincide(ocs[0], 'recibido')).toBe(false)
    expect(ocCoincide(ocs[0], '')).toBe(true)
  })
})
