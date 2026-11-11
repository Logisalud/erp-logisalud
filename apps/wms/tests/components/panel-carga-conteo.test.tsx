// @vitest-environment jsdom
// Carga por conteo (piloto, 0061): sin escaneo, cada pedido se cuenta con «− n +» y «Registrar conteo»; Lima no lleva etiquetas y provincia sí. Con el escaneo encendido vuelve el cuadro del QR.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const acc = vi.hoisted(() => ({
  cargarBultoAccion: vi.fn(), confirmarSalidaRutaAccion: vi.fn(), contarBultosCargadosAccion: vi.fn(), excluirPedidoAccion: vi.fn(), guardarChecklistAccion: vi.fn(), liberarUnidadAccion: vi.fn(), retirarBultoAccion: vi.fn(),
}))
vi.mock('@/app/acciones-picking', () => acc)
vi.mock('@/app/acciones-ranking', () => ({ registrarDiferenciaCargaAccion: vi.fn() }))
vi.mock('@/components/carga/lector-camara', () => ({ LectorCamara: () => null }))
import { PanelCarga } from '@/components/carga/panel-carga'
import type { CargaRuta, PedidoCarga } from '@/domain/carga'

const pedido = (n: number, cargados: number, lleva: boolean): PedidoCarga => ({
  salidaId: `s${n}`, salidaNumero: `OS-${n}`, pedidoNumero: `PED-${n}`, cliente: `Cliente ${n}`, secuencia: n, listo: true, excluida: false, llevaEtiqueta: lleva,
  bultos: [1, 2, 3].map((i) => ({ bultoId: `b${n}${i}`, codigo: `OS-${n}-B${i}`, secuencia: i, total: 3, cargado: i <= cargados })),
})
const carga = (escaneoQr: boolean): CargaRuta => ({
  rutaId: 'r1', rutaNumero: 'RUT-1', fecha: '2026-11-11', estado: 'EN_CARGA', pedidos: 2, bultosEsperados: 6, bultosCargados: 1, escaneoQr, tieneVehiculoYConductor: true, checklist: [{ item: 'Limpio', ok: true, nota: '' }],
  itemsChecklist: ['Limpio'], pedidosDetalle: [pedido(1, 1, true), pedido(2, 0, false)], motivosNoLiberar: ['Faltan 5 bultos por cargar'],
})
const ver = (c: CargaRuta) => render(<PanelCarga carga={c} puedeCargar puedeLiberar puedeConfirmar />)

beforeEach(() => { acc.contarBultosCargadosAccion.mockReset(); acc.contarBultosCargadosAccion.mockResolvedValue({ ok: true, contados: 3 }) })

describe('carga por conteo de bultos', () => {
  it('sin escaneo: no hay cuadro de QR; cada pedido dice cuántos van y deja contar', async () => {
    ver(carga(false))
    expect(screen.queryByTestId('bloque-escaneo')).toBeNull()
    const [uno, dos] = screen.getAllByTestId('pedido-carga')
    expect(within(uno).getByTestId('conteo-estado')).toHaveTextContent('1 de 3 bultos contados')
    expect(within(dos).getByTestId('conteo-estado')).toHaveTextContent('0 de 3 bultos contados')
    expect(within(uno).getByTestId('registrar-conteo')).toBeDisabled()                 // no cambió nada todavía
    await userEvent.click(within(uno).getByTestId('conteo-mas')); await userEvent.click(within(uno).getByTestId('conteo-mas'))
    expect(within(uno).getByTestId('conteo-valor')).toHaveTextContent('3')
    expect(within(uno).getByTestId('conteo-mas')).toBeDisabled()                        // no pasa de los bultos del pedido
    await userEvent.click(within(uno).getByTestId('registrar-conteo'))
    expect(acc.contarBultosCargadosAccion).toHaveBeenCalledWith('r1', 's1', 3)
  })

  it('provincia imprime sus etiquetas; Lima dice que no lleva', () => {
    ver(carga(false))
    const [uno, dos] = screen.getAllByTestId('pedido-carga')
    expect(within(uno).getByTestId('etiquetas-pedido')).toHaveAttribute('href', expect.stringContaining('/embalaje/s1/etiquetas'))
    expect(within(dos).getByTestId('sin-etiquetas')).toHaveTextContent('Va a Lima')
    expect(within(dos).queryByTestId('etiquetas-pedido')).toBeNull()
  })

  it('con el escaneo encendido vuelve el cuadro del QR y los bultos uno a uno', () => {
    ver(carga(true))
    expect(screen.getByTestId('bloque-escaneo')).toBeInTheDocument()
    expect(screen.getAllByTestId('bulto-carga').length).toBe(6)
    expect(screen.queryByTestId('registrar-conteo')).toBeNull()
  })
})
