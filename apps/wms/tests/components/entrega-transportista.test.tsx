// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const acc = vi.hoisted(() => ({
  registrarEntregaTransportistaAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, id: 'e1' }) as unknown),
  subirCargoEntregaAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, ref: 'cargo-entrega/foto.jpg', nombre: 'foto.jpg' }) as unknown),
}))
vi.mock('@/app/acciones-salida-manual', () => acc)
import { EntregaTransportista } from '@/components/salidas/entrega-transportista'
import type { SalidaVista } from '@/domain/despacho'

const salida = (extra: Partial<SalidaVista> = {}) => ({ id: 's1', numero: 'OS-2026-00009', tipo: 'CLIENTE', estado: 'ABIERTA', etapa: 'LISTA_PARA_CARGA', lineasDetalle: [], cambios: [], ...extra }) as unknown as SalidaVista
beforeEach(() => { Object.values(acc).forEach((f) => f.mockClear()) })

describe('Entrega al transportista del cliente (tipo B)', () => {
  it('no aparece en una venta de distribución, en una muestra ni en una orden cancelada', () => {
    for (const tipo of ['DISTRIBUCION', 'MUESTRA', 'PROVEEDOR'] as const) {
      const { container, unmount } = render(<EntregaTransportista salida={salida({ tipo })} roles={['jefe_transporte']} usuario="Roberto" />)
      expect(container).toBeEmptyDOMElement(); unmount()
    }
    const { container } = render(<EntregaTransportista salida={salida({ estado: 'CANCELADA' })} roles={['jefe_transporte']} usuario="Roberto" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('mientras la orden no está lista explica por qué y qué falta, sin formulario', () => {
    render(<EntregaTransportista salida={salida({ etapa: 'PENDIENTE_CONFORMIDAD' })} roles={['jefe_transporte']} usuario="Roberto" />)
    expect(screen.getByTestId('entrega-pendiente')).toHaveTextContent('no va en una ruta de Logisalud')
    expect(screen.queryByTestId('registrar-entrega')).toBeNull()
  })

  it('quien no puede entregar ve el aviso y no el formulario', () => {
    render(<EntregaTransportista salida={salida()} roles={['auxiliar']} usuario="Ana" />)
    expect(screen.getByTestId('entrega-form')).toHaveTextContent('Solo el Jefe de Transporte o el Jefe de Almacén registran esta entrega')
    expect(screen.queryByTestId('registrar-entrega')).toBeNull()
  })

  it('valida antes de enviar: nombre, placa o DNI; y manda la entrega con la hora de Lima y quién entrega', async () => {
    render(<EntregaTransportista salida={salida()} roles={['jefe_almacen']} usuario="Charlie" />)
    expect(screen.getByTestId('entrega-almacen')).toHaveValue('Charlie')
    await waitFor(() => expect((screen.getByTestId('entrega-hora') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/))
    await userEvent.click(screen.getByTestId('registrar-entrega'))
    expect(await screen.findByText('Escribe el nombre del transportista (o de quien recoge)')).toBeInTheDocument()
    expect(screen.getByText('Escribe la placa del vehículo o el DNI de quien recoge')).toBeInTheDocument()
    expect(acc.registrarEntregaTransportistaAccion).not.toHaveBeenCalled()
    await userEvent.type(screen.getByTestId('entrega-transportista'), 'Transportes Andes SAC')
    await userEvent.type(screen.getByTestId('entrega-placa'), 'abc-123')
    fireEvent.change(screen.getByTestId('entrega-hora'), { target: { value: '2026-10-20T10:30' } })
    fireEvent.change(screen.getByTestId('entrega-cargo-archivo'), { target: { files: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByTestId('cargo-adjunto')).toHaveTextContent('foto.jpg')
    await userEvent.click(screen.getByTestId('registrar-entrega'))
    await waitFor(() => expect(acc.registrarEntregaTransportistaAccion).toHaveBeenCalledTimes(1))
    expect(acc.registrarEntregaTransportistaAccion.mock.calls[0][0]).toMatchObject({
      salidaId: 's1', transportista: 'Transportes Andes SAC', placa: 'ABC-123', hora: '2026-10-20T15:30:00.000Z', entregaAlmacen: 'Charlie', cargoRef: 'cargo-entrega/foto.jpg', cargoNombre: 'foto.jpg',
    })
    expect(await screen.findByTestId('ok-entrega')).toHaveTextContent('la salida quedó confirmada y el stock bajó')
  })

  it('un error de la base se muestra con sus palabras', async () => {
    acc.registrarEntregaTransportistaAccion.mockImplementation(async () => ({ ok: false, mensaje: 'La orden todavía no está lista para entregarse' }))
    render(<EntregaTransportista salida={salida()} roles={['jefe_transporte']} usuario="Roberto" />)
    await userEvent.type(screen.getByTestId('entrega-transportista'), 'Juan Pérez')
    await userEvent.type(screen.getByTestId('entrega-dni'), '40123456')
    await userEvent.click(screen.getByTestId('registrar-entrega'))
    expect(await screen.findByTestId('error-entrega')).toHaveTextContent('todavía no está lista para entregarse')
  })

  it('una entrega ya registrada se muestra como lectura, con el cargo y sin formulario', () => {
    const entrega = { id: 'e1', transportista: 'Transportes Andes SAC', placa: 'ABC-123', entregadoEn: '2026-10-20T15:30:00Z', entregaAlmacen: 'Charlie', cargoArchivo: 'x', cargoNombre: 'foto.jpg', registradaPor: 'Roberto', registradaEn: '2026-10-20T15:31:00Z' }
    render(<EntregaTransportista salida={salida({ estado: 'CONFIRMADA', etapa: 'ENTREGADA_AL_TRANSPORTISTA', entrega })} roles={['jefe_transporte']} usuario="Roberto" />)
    const bloque = screen.getByTestId('entrega-registrada')
    expect(bloque).toHaveTextContent('Entregada al transportista del cliente')
    expect(bloque).toHaveTextContent('Transportes Andes SAC'); expect(bloque).toHaveTextContent('ABC-123'); expect(bloque).toHaveTextContent('Charlie')
    expect(screen.getByTestId('ver-cargo')).toHaveAttribute('href', '/salidas/s1/cargo')
    expect(screen.queryByTestId('registrar-entrega')).toBeNull()
  })
})
