// @vitest-environment jsdom
// Fase 4 · P3: la pantalla de la carga de ensayo: marca «piloto» visible y el informe obligatorio antes de «Cargar».
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const acc = vi.hoisted(() => ({ confirmarCargaInicialAccion: vi.fn(), crearCargaInicialAccion: vi.fn(), validarCargaInicialAccion: vi.fn(), informeCargaAccion: vi.fn() }))
vi.mock('@/app/acciones-inventario', () => acc)
import { CargaInicial } from '@/components/inventario/carga-inicial'
import { construirInforme } from '@/domain/informe-carga'
import { parsearCargaInicial, type CargaInicialVista } from '@/domain/inventario'

const CSV = 'producto;lote;vence;propietario;posicion;estado;cantidad\nDEMO-001;ENS-1;31/12/2029;LOGISSA;A-6;APROBADO;50'
const cargaVista = (p: Partial<CargaInicialVista> = {}): CargaInicialVista => ({ id: 'c1', numero: 'CI-2026-00001', estado: 'BORRADOR', creadoPor: 'Admin', creadoEn: '2026-11-05T10:00:00Z', filas: 1, unidades: 50, porEstado: { aprobado: 50, cuarentena: 0, bajas: 0 }, ...p })
beforeEach(() => {
  Object.values(acc).forEach((f) => f.mockReset())
  acc.validarCargaInicialAccion.mockResolvedValue([])
  acc.crearCargaInicialAccion.mockResolvedValue({ ok: true, id: 'c2', numero: 'CI-2026-00002' })
  acc.informeCargaAccion.mockImplementation(async (t: string) => ({ ok: true, informe: construirInforme(parsearCargaInicial(t).filas, [], { hoy: '2026-11-05', erroresLectura: [] }) }))
})

describe('pantalla de la carga de ensayo', () => {
  it('en el piloto avisa que es una carga de ENSAYO y marca las cargas del piloto', () => {
    render(<CargaInicial cargas={[cargaVista({ piloto: true })]} puedeCargar puedeConfirmar piloto />)
    expect(screen.getByTestId('aviso-carga-ensayo')).toHaveTextContent('1 de diciembre')
    expect(screen.getByTestId('aviso-carga-ensayo')).toHaveTextContent('Odoo')
    expect(screen.getByTestId('chip-carga-ensayo')).toHaveTextContent('Ensayo')
  })
  it('fuera del piloto no hay aviso ni marca', () => {
    render(<CargaInicial cargas={[cargaVista()]} puedeCargar puedeConfirmar />)
    expect(screen.queryByTestId('aviso-carga-ensayo')).toBeNull()
    expect(screen.queryByTestId('chip-carga-ensayo')).toBeNull()
  })
  it('«Cargar» está bloqueado hasta armar el informe «Lista»; si el texto cambia, hay que armarlo de nuevo', async () => {
    render(<CargaInicial cargas={[]} puedeCargar puedeConfirmar piloto />)
    await userEvent.type(screen.getByTestId('texto-carga'), 'x')
    await userEvent.clear(screen.getByTestId('texto-carga'))
    await userEvent.click(screen.getByTestId('texto-carga'))
    await userEvent.paste(CSV)
    await userEvent.click(screen.getByTestId('revisar-carga'))
    await waitFor(() => expect(screen.getByTestId('carga-sin-errores')).toBeInTheDocument())
    expect(screen.getByTestId('informe-obligatorio')).toHaveTextContent('arma el informe')
    expect(screen.getByTestId('guardar-carga')).toBeDisabled()
    await userEvent.click(screen.getByTestId('armar-informe'))
    await waitFor(() => expect(screen.getByTestId('veredicto')).toHaveAttribute('data-veredicto', 'LISTA'))
    expect(screen.getByTestId('guardar-carga')).toBeEnabled()
    expect(screen.getByTestId('guardar-carga')).toHaveTextContent('Cargar como ensayo')
    // cambia el texto: el informe ya no vale
    await userEvent.type(screen.getByTestId('texto-carga'), '\n')
    expect(screen.queryByTestId('guardar-carga')).toBeNull()
    await userEvent.click(screen.getByTestId('revisar-carga'))
    await waitFor(() => expect(screen.getByTestId('guardar-carga')).toBeDisabled())
    await userEvent.click(screen.getByTestId('armar-informe'))
    await waitFor(() => expect(screen.getByTestId('guardar-carga')).toBeEnabled())
    await userEvent.click(screen.getByTestId('guardar-carga'))
    await waitFor(() => expect(acc.crearCargaInicialAccion).toHaveBeenCalledTimes(1))
  })
  it('un informe «No lista» o que falla deja «Cargar» bloqueado', async () => {
    acc.informeCargaAccion.mockResolvedValueOnce({ ok: false, mensaje: 'No se pudo armar el informe' })
    render(<CargaInicial cargas={[]} puedeCargar puedeConfirmar piloto />)
    await userEvent.click(screen.getByTestId('texto-carga'))
    await userEvent.paste(CSV)
    await userEvent.click(screen.getByTestId('revisar-carga'))
    await waitFor(() => expect(screen.getByTestId('carga-sin-errores')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('armar-informe'))
    await waitFor(() => expect(screen.getByTestId('informe-error')).toBeInTheDocument())
    expect(screen.getByTestId('guardar-carga')).toBeDisabled()
  })
})
