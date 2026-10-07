// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const empujar = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: empujar }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a>,
}))
const buscarAccion = vi.fn()
vi.mock('@/app/acciones', () => ({ buscarAccion: (q: string) => buscarAccion(q) }))

import { PaletaBusqueda } from '@/components/paleta-busqueda'

const res = (o: Partial<import('@/domain/panorama').ResultadoBusqueda>) => ({
  tipo: 'producto' as const, id: '1', titulo: 'Dapagliflozina 10 mg', detalle: '168 unidades en 2 ubicaciones',
  posiciones: ['A-8'], unidades: 168, puntaje: 90, href: '/productos/1', ...o,
})

beforeEach(() => { buscarAccion.mockReset(); empujar.mockReset() })

describe('búsqueda universal', () => {
  it('con la caja vacía explica qué se puede buscar', () => {
    render(<PaletaBusqueda onCerrar={() => {}} />)
    expect(screen.getByText('Escribe lo que buscas')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveFocus()
  })

  it('muestra resultados agrupados con su detalle', async () => {
    buscarAccion.mockResolvedValue([res({}), res({ tipo: 'posicion', id: '2', titulo: 'Ubicación A-8', detalle: '48 unidades · 1 lote', href: '/almacen?ver=A-8' })])
    render(<PaletaBusqueda onCerrar={() => {}} />)
    await userEvent.type(screen.getByRole('combobox'), 'dapa')
    await waitFor(() => expect(screen.getByText('Dapagliflozina 10 mg')).toBeInTheDocument())
    expect(screen.getByText('Productos')).toBeInTheDocument()
    expect(screen.getByText('Ubicaciones')).toBeInTheDocument()
    expect(screen.getByText('168 unidades en 2 ubicaciones')).toBeInTheDocument()
  })

  it('sin coincidencias orienta en vez de quedar en blanco', async () => {
    buscarAccion.mockResolvedValue([])
    render(<PaletaBusqueda onCerrar={() => {}} />)
    await userEvent.type(screen.getByRole('combobox'), 'zzz')
    await waitFor(() => expect(screen.getByTestId('busqueda-vacia')).toHaveTextContent('No encontramos “zzz”'))
  })

  it('si el servidor falla lo dice con palabras humanas', async () => {
    buscarAccion.mockRejectedValue(new Error('boom'))
    render(<PaletaBusqueda onCerrar={() => {}} />)
    await userEvent.type(screen.getByRole('combobox'), 'abc')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No pudimos buscar'))
  })

  it('Enter abre el resultado seleccionado y Escape cierra', async () => {
    buscarAccion.mockResolvedValue([res({})])
    const onCerrar = vi.fn()
    render(<PaletaBusqueda onCerrar={onCerrar} />)
    const caja = screen.getByRole('combobox')
    await userEvent.type(caja, 'dapa')
    await waitFor(() => expect(screen.getByRole('option')).toBeInTheDocument())
    await userEvent.keyboard('{Enter}')
    expect(empujar).toHaveBeenCalledWith('/productos/1')
    await userEvent.keyboard('{Escape}')
    expect(onCerrar).toHaveBeenCalled()
  })

  it('descarta respuestas viejas: la última consulta manda', async () => {
    let soltarPrimera: (v: unknown) => void = () => {}
    buscarAccion
      .mockImplementationOnce(() => new Promise((r) => { soltarPrimera = r }))
      .mockResolvedValueOnce([res({ titulo: 'Resultado nuevo', id: 'n' })])
    render(<PaletaBusqueda onCerrar={() => {}} />)
    const caja = screen.getByRole('combobox')
    await userEvent.type(caja, 'a')
    await new Promise((r) => setTimeout(r, 250)) // dispara la 1.ª búsqueda (queda pendiente)
    await userEvent.type(caja, 'b')
    await waitFor(() => expect(screen.getByText('Resultado nuevo')).toBeInTheDocument())
    soltarPrimera([res({ titulo: 'Resultado viejo', id: 'v' })])
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Resultado viejo')).not.toBeInTheDocument()
  })
})
