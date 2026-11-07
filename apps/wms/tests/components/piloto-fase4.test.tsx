// @vitest-environment jsdom
// Fase 4 · P1: bienvenida del piloto y avisos «PRUEBA» (falta de stock: pantalla de la orden y bandeja de pedidos).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
vi.mock('@/app/acciones-pedidos', () => ({ actualizarBandejaAccion: vi.fn(), revisarCambioPedidoAccion: vi.fn(), simularCambioEnPedidosAccion: vi.fn() }))
vi.mock('@/app/acciones-salida-manual', () => ({ crearOrdenDePedidoAccion: vi.fn(), crearOrdenesPendientesAccion: vi.fn() }))
import { Bienvenida } from '@/components/piloto/bienvenida'
import { FaltaDeStock } from '@/components/salidas/falta-de-stock'
import { BandejaPedidosVista } from '@/components/pedidos/bandeja-pedidos'
import { ENCABEZADO_AVISO_PRUEBA } from '@/domain/modo-piloto'
import { explicarFaltante, type FaltanteLineaVista } from '@/domain/faltante'
import { avisoParaVendedor } from '@/domain/aviso-vendedor'
import { pedidoBandeja } from './ayudas-bandeja'

const faltantes: FaltanteLineaVista[] = [{ lineaId: 'l1', producto: 'Paracetamol 500 mg', productoCodigo: 'PARA-500', explicacion: explicarFaltante({ pedido: 100, hoy: '2026-11-04', existencias: [{ loteId: 'a', codigo: 'L1', vence: '2028-01-31', estado: 'APROBADO', cantidad: 40 }] }) }]
const aviso = avisoParaVendedor({ pedidoNumero: 'PED-0104', cliente: 'Botica SAC', vendedor: 'Rosa', lineas: faltantes })
let portapapeles = ''
beforeEach(() => {
  portapapeles = ''
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => { portapapeles = t } } })
})

describe('bienvenida del piloto', () => {
  it('dice que es un piloto, que lo oficial sigue siendo Odoo y papel, que es de prueba y que se borra el 1 de diciembre', () => {
    render(<Bienvenida piloto aceptar={async () => {}} />)
    const t = screen.getByTestId('bienvenida-piloto').textContent ?? ''
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Esto es un PILOTO')
    expect(t).toContain('Lo oficial sigue siendo el proceso actual')
    expect(t).toContain('Odoo y el papel')
    expect(t).toContain('de prueba')
    expect(t).toContain('1 de diciembre')
    expect(t).toContain('PILOTO, SIN VALOR')
    expect(screen.getAllByTestId(/^bienvenida-punto-/)).toHaveLength(4)
    expect(screen.getByTestId('bienvenida-entendi')).toHaveTextContent('Entendido')
  })
  it('sin la acción solo se lee (no hay botón); fuera del piloto avisa que ya terminó', () => {
    const { rerender } = render(<Bienvenida piloto />)
    expect(screen.queryByTestId('bienvenida-entendi')).toBeNull()
    rerender(<Bienvenida piloto={false} />)
    expect(screen.getByTestId('bienvenida-sin-piloto')).toHaveTextContent('ya terminó')
  })
})

describe('avisos de falta de stock en el piloto', () => {
  it('en el piloto la orden marca el aviso «PRUEBA» y el texto copiable lleva el encabezado', async () => {
    render(<FaltaDeStock faltantes={faltantes} vendedor="Rosa" aviso={aviso} pedidoNumero="PED-0104" piloto />)
    expect(screen.getByTestId('aviso-prueba')).toHaveTextContent('Prueba')
    expect(screen.getByTestId('aviso-vendedor-texto').textContent!.startsWith(ENCABEZADO_AVISO_PRUEBA)).toBe(true)
    await userEvent.click(screen.getByTestId('copiar-aviso-orden'))
    expect(portapapeles.startsWith(ENCABEZADO_AVISO_PRUEBA)).toBe(true)
    expect(portapapeles).toContain('PED-0104')
  })
  it('fuera del piloto el aviso queda como siempre, sin marca', async () => {
    render(<FaltaDeStock faltantes={faltantes} vendedor="Rosa" aviso={aviso} pedidoNumero="PED-0104" />)
    expect(screen.queryByTestId('aviso-prueba')).toBeNull()
    expect(screen.getByTestId('aviso-vendedor-texto').textContent).toBe(aviso)
  })
  it('la bandeja de pedidos hace lo mismo con el aviso de un pedido con falta de stock', async () => {
    const bandeja = { pedidos: [pedidoBandeja(1, { avisoVendedor: aviso })], ultimoIntento: null, ultimaExitosa: null }
    render(<BandejaPedidosVista bandeja={bandeja} puedeActualizar puedeCrearOrdenes piloto />)
    await userEvent.click(screen.getByTestId('abrir-pedido'))
    expect(screen.getAllByTestId('aviso-prueba-bandeja')[0]).toBeInTheDocument()
    await userEvent.click(screen.getAllByTestId('copiar-aviso-bandeja')[0])
    expect(portapapeles.startsWith(ENCABEZADO_AVISO_PRUEBA)).toBe(true)
  })
})
