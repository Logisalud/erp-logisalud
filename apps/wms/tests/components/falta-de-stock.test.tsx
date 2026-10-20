// @vitest-environment jsdom
// SA-3: «Copiar aviso para el vendedor» con su confirmación «Copiado», lo que dice la pantalla cuando falta stock y quién puede cambiar qué.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
vi.mock('@/app/acciones-picking', () => ({ ejecutarDevolucionPickingAccion: async () => ({ ok: true }), verificarDevolucionPickingAccion: async () => ({ ok: true }) }))
import { BotonCopiarAviso } from '@/components/salidas/boton-copiar-aviso'
import { FaltaDeStock } from '@/components/salidas/falta-de-stock'
import { DevolverPicado } from '@/components/salidas/devolver-picado'
import { avisoParaVendedor } from '@/domain/aviso-vendedor'
import { explicarFaltante } from '@/domain/faltante'

const faltante = { lineaId: 'l1', producto: 'Paracetamol 500 mg', productoCodigo: 'PARA-500', explicacion: explicarFaltante({ pedido: 100, hoy: '2026-10-14', existencias: [{ loteId: 'a', codigo: 'A', vence: '2028-01-31', estado: 'APROBADO', cantidad: 40 }, { loteId: 'c', codigo: 'C', vence: '2028-01-31', estado: 'CUARENTENA', cantidad: 25 }] }) }

describe('Copiar aviso para el vendedor', () => {
  it('copia el mensaje listo y confirma con «Copiado»', async () => {
    const escribir = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escribir }, configurable: true })
    const texto = avisoParaVendedor({ pedidoNumero: 'PED-1', cliente: 'Botica Sol', vendedor: 'Rosa', lineas: [faltante] })
    render(<BotonCopiarAviso texto={texto} />)
    expect(screen.getByTestId('copiar-aviso')).toHaveTextContent('Copiar aviso para el vendedor')
    fireEvent.click(screen.getByTestId('copiar-aviso'))
    await waitFor(() => expect(screen.getByTestId('copiar-aviso')).toHaveTextContent('Copiado'))
    expect(escribir).toHaveBeenCalledWith(texto)
    expect(escribir.mock.calls[0][0]).toMatch(/^Hola Rosa, no podemos despachar completo el pedido PED-1 de Botica Sol: falta stock\./)
    expect(screen.getByTestId('copiar-aviso-estado')).toHaveTextContent('pégalo en WhatsApp')
  })

  it('si el navegador no deja copiar, lo dice con palabras', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true })
    document.execCommand = vi.fn().mockReturnValue(false)
    render(<BotonCopiarAviso texto="hola" />)
    fireEvent.click(screen.getByTestId('copiar-aviso'))
    await waitFor(() => expect(screen.getByTestId('copiar-aviso-estado')).toHaveTextContent('No se pudo copiar'))
  })
})

describe('Falta stock en la orden', () => {
  it('explica por qué falta con cantidades, dice que decide el vendedor en Pedidos y que son solo dos caminos', () => {
    render(<FaltaDeStock faltantes={[faltante]} vendedor="Rosa Paredes" aviso="mensaje" pedidoNumero="PED-1" />)
    expect(screen.getByTestId('falta-quien-decide')).toHaveTextContent('Decide el vendedor Rosa Paredes, con el cliente y en Pedidos (PED-1)')
    expect(screen.getByTestId('falta-quien-decide')).toHaveTextContent('quitar o reducir la línea')
    expect(screen.getByTestId('falta-quien-decide')).toHaveTextContent('cancelar el pedido')
    expect(screen.getByTestId('faltante-texto')).toHaveTextContent('pide 100 y hay 40 disponibles. Faltan 60: 25 en Cuarentena y 35 sin stock.')
    expect(screen.getByTestId('causa-CUARENTENA')).toHaveTextContent('25 u')
    expect(screen.getByTestId('causa-SIN_STOCK')).toHaveTextContent('35 u')
  })

  it('el Jefe de Transporte lo ve, pero no hay ningún botón para cambiar cantidades del pedido', () => {
    render(<FaltaDeStock faltantes={[faltante]} aviso="mensaje" />)
    const botones = screen.getAllByRole('button').map((b) => b.textContent)
    expect(botones).toEqual(['Copiar aviso para el vendedor'])
    expect(screen.getByTestId('falta-quien-decide')).toHaveTextContent('Decide el vendedor del pedido')
    expect(screen.getByTestId('falta-quien-decide')).toHaveTextContent('Aquí no se cambian cantidades')
  })

  it('sin faltantes no muestra nada', () => {
    const { container } = render(<FaltaDeStock faltantes={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Lo picado vuelve a su ubicación', () => {
  const dev = (estado: 'POR_DEVOLVER' | 'DEVUELTA') => [{ id: 'd1', producto: 'Producto', productoCodigo: 'P', lote: 'L1', cantidad: 8, estado, estadoReserva: 'EN_STAGING' as const, desde: 'K-1', hasta: 'F-1.1', causa: 'CAMBIO_PEDIDO' as const }]
  it('el auxiliar ve «Ya devolví lo picado»; no puede verificar lo que él mismo devolvió', () => {
    render(<DevolverPicado salidaId="s" devoluciones={dev('POR_DEVOLVER')} roles={['auxiliar']} />)
    expect(screen.getByTestId('devolver-picado-ejecutar')).toBeInTheDocument()
    expect(screen.queryByTestId('devolver-picado-verificar')).toBeNull()
    expect(screen.getByTestId('fila-devolucion')).toHaveTextContent('K-1 → F-1.1')
  })
  it('ya devuelto: otra persona de almacén verifica; el Jefe de Transporte solo mira', () => {
    const { unmount } = render(<DevolverPicado salidaId="s" devoluciones={dev('DEVUELTA')} roles={['jefe_almacen']} />)
    expect(screen.getByTestId('devolver-picado-verificar')).toBeInTheDocument()
    unmount()
    render(<DevolverPicado salidaId="s" devoluciones={dev('DEVUELTA')} roles={['jefe_transporte']} />)
    expect(screen.queryByTestId('devolver-picado-verificar')).toBeNull()
  })
  it('con el pedido cancelado dice que la orden se cancela al verificar', () => {
    render(<DevolverPicado salidaId="s" devoluciones={dev('POR_DEVOLVER')} roles={['auxiliar']} cancelacionPendiente motivo="Duplicado" />)
    expect(screen.getByTestId('devolver-explica')).toHaveTextContent('La orden se cancela cuando lo picado vuelva a su ubicación y otra persona lo verifique')
  })
})
