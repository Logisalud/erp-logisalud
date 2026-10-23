// @vitest-environment jsdom
// SA-1: la pantalla vacía de «Órdenes de salida» explica de dónde vienen las salidas y ofrece los dos caminos; con filtros que no encuentran nada es otro vacío.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const traer = vi.fn()
vi.mock('@/app/acciones-pedidos', () => ({ actualizarBandejaAccion: (...a: unknown[]) => traer(...a) }))
import { ListaSalidas } from '@/components/salidas/lista-salidas'
import type { SalidaResumen } from '@/domain/despacho'

afterEach(() => { cleanup(); traer.mockReset() })

const una: SalidaResumen = { id: 's1', numero: 'OS-2026-00001', pedidoNumero: 'PED-1', cliente: 'Botica Sol', fecha: '2026-10-20', unidades: 10, lineas: 1, etapa: 'ASIGNADA' }

describe('Órdenes de salida vacías', () => {
  it('dice en una frase de dónde nacen las salidas y muestra los dos botones', () => {
    render(<ListaSalidas salidas={[]} verCambios={false} puedeTraer puedeCrear />)
    expect(screen.getByTestId('salidas-vacio-frase')).toHaveTextContent('Las salidas nacen de los pedidos. Trae los pedidos nuevos o crea una salida manual')
    expect(screen.getByTestId('vacio-traer-pedidos')).toHaveTextContent('Traer pedidos nuevos')
    expect(screen.getByTestId('vacio-traer-pedidos')).toBeEnabled()
    expect(screen.getByTestId('vacio-nueva-orden')).toHaveTextContent('Nueva Orden de Salida')
    expect(screen.getByTestId('vacio-nueva-orden')).toHaveAttribute('href', '/salidas/nueva')
  })

  it('«Traer pedidos nuevos» consulta a Pedidos y dice qué sigue (las órdenes se crean desde Pedidos por despachar)', async () => {
    traer.mockResolvedValue({ ok: true, resumen: { nuevos: 3, nuevasVersiones: 0, iguales: 0, antiguas: 0, descartados: [] } })
    render(<ListaSalidas salidas={[]} verCambios={false} puedeTraer puedeCrear />)
    fireEvent.click(screen.getByTestId('vacio-traer-pedidos'))
    await waitFor(() => expect(screen.getByTestId('vacio-traer-ok')).toHaveTextContent('créales su orden de salida'))
    expect(screen.getByTestId('vacio-traer-ok').querySelector('a')).toHaveAttribute('href', '/pedidos')
    expect(traer).toHaveBeenCalledTimes(1)
  })

  it('si Pedidos no responde, lo dice con palabras', async () => {
    traer.mockResolvedValue({ ok: false, mensaje: 'No se pudo conectar con Pedidos' })
    render(<ListaSalidas salidas={[]} verCambios={false} puedeTraer puedeCrear />)
    fireEvent.click(screen.getByTestId('vacio-traer-pedidos'))
    await waitFor(() => expect(screen.getByTestId('vacio-traer-error')).toHaveTextContent('No se pudo conectar con Pedidos'))
  })

  it('sin permiso no hay botones muertos: se explica quién lo hace', () => {
    render(<ListaSalidas salidas={[]} verCambios={false} puedeTraer={false} puedeCrear={false} />)
    expect(screen.queryByTestId('vacio-traer-pedidos')).toBeNull()
    expect(screen.queryByTestId('vacio-nueva-orden')).toBeNull()
    expect(screen.getByTestId('vacio-traer-sin-permiso')).toHaveTextContent('Jefe de Transporte o el Jefe de Almacén')
    expect(screen.getByTestId('vacio-nueva-sin-permiso')).toHaveTextContent('salida manual')
  })

  it('con permiso solo para uno de los caminos, el otro se explica', () => {
    render(<ListaSalidas salidas={[]} verCambios={false} puedeTraer={false} puedeCrear />)
    expect(screen.getByTestId('vacio-nueva-orden')).toBeInTheDocument()
    expect(screen.getByTestId('vacio-traer-sin-permiso')).toBeInTheDocument()
  })
})

describe('Órdenes de salida con filtros que no encuentran nada', () => {
  it('es otro vacío («Ninguna orden coincide con tu búsqueda») y «Quitar filtros» devuelve la lista', () => {
    render(<ListaSalidas salidas={[una]} verCambios={false} puedeTraer puedeCrear />)
    fireEvent.change(screen.getByTestId('buscar-salidas'), { target: { value: 'zzz' } })
    expect(screen.getByTestId('salidas-sin-coincidencias')).toHaveTextContent('Ninguna orden coincide con tu búsqueda')
    expect(screen.queryByTestId('salidas-vacio')).toBeNull()
    fireEvent.click(screen.getByTestId('quitar-filtros-salidas'))
    expect(screen.queryByTestId('salidas-sin-coincidencias')).toBeNull()
    expect(screen.getByTestId('buscar-salidas')).toHaveValue('')
    expect(screen.getAllByTestId('fila-salida').length).toBeGreaterThan(0)
  })

  it('una orden de ejemplo lleva la etiqueta «Ejemplo»; una normal no', () => {
    render(<ListaSalidas salidas={[{ ...una, ejemplo: true }, { ...una, id: 's2', numero: 'OS-2026-00002' }]} verCambios={false} />)
    const filas = screen.getAllByTestId('fila-salida')
    expect(filas[0].querySelector('[data-testid="etiqueta-EJEMPLO"]')).toHaveTextContent('Ejemplo')
    expect(filas[1].querySelector('[data-testid="etiqueta-EJEMPLO"]')).toBeNull()
  })
})
