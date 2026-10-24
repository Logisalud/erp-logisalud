// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const acc = vi.hoisted(() => ({
  guardarPersonalAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, id: 'x' }) as unknown),
  guardarVehiculoAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, id: 'x' }) as unknown),
  cambiarConductorEnDocumentosAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const }) as unknown),
  guardarDocumentosPersonalAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const }) as unknown),
}))
vi.mock('@/app/acciones-rutas', () => acc)
import { RecursosVista } from '@/components/rutas/recursos'
import type { PanoramaRutas, PersonalTransporte } from '@/domain/rutas'

const hans: PersonalTransporte = { id: 'h', nombre: 'Hans', funcion: 'CONDUCTOR', activo: true, licencia: 'Q75084250' }
const michele: PersonalTransporte = { id: 'm', nombre: 'Michele Yermain Mauriello Diaz', funcion: 'CONDUCTOR', activo: true, documentoTipo: 'CE', dni: '004780086', licencia: 'Q004780086' }
const panorama = (extra: Partial<PanoramaRutas> = {}): PanoramaRutas => ({
  hoy: '2026-10-23', corte: '16:00', rutas: [], pedidos: [], ordenes: [], personal: [hans, michele],
  vehiculos: [{ id: 'v', placa: 'BWO-902', descripcion: 'DFSK K05S', tipo: 'PROPIO', calificado: false, aptoCadenaFrio: false, activo: true }],
  conductorEnDocumentos: { personaId: 'm', nombre: michele.nombre }, ...extra,
})
beforeEach(() => { Object.values(acc).forEach((f) => f.mockClear()) })

describe('«Conductor que figura en los documentos» (temporal)', () => {
  it('dice quién figura, que es temporal y que la ruta guarda al conductor real', () => {
    render(<RecursosVista panorama={panorama()} puedeEditar />)
    const p = screen.getByTestId('conductor-en-documentos')
    expect(within(p).getByTestId('conductor-en-documentos-actual')).toHaveTextContent('llevan a Michele Yermain Mauriello Diaz')
    expect(p).toHaveTextContent('siempre guardan al conductor real')
    expect(p).toHaveTextContent('Esto es temporal')
  })

  it('el Jefe de Transporte cambia la persona con motivo; sin cambio o sin motivo no guarda', async () => {
    render(<RecursosVista panorama={panorama()} puedeEditar />)
    const guardar = screen.getByTestId('conductor-en-documentos-guardar')
    expect(guardar).toBeDisabled()   // todavía no cambió nada
    await userEvent.selectOptions(screen.getByTestId('conductor-en-documentos-persona'), 'h')
    expect(guardar).toBeEnabled()
    await userEvent.type(screen.getByTestId('conductor-en-documentos-motivo'), 'Michele no puede esta semana')
    await userEvent.click(guardar)
    expect(acc.cambiarConductorEnDocumentosAccion).toHaveBeenCalledWith('h', 'Michele no puede esta semana')
    expect(await screen.findByText(/Los documentos nuevos llevan a quien elegiste/)).toBeInTheDocument()
  })

  it('«El conductor real de cada ruta» manda null', async () => {
    render(<RecursosVista panorama={panorama()} puedeEditar />)
    await userEvent.selectOptions(screen.getByTestId('conductor-en-documentos-persona'), '')
    await userEvent.type(screen.getByTestId('conductor-en-documentos-motivo'), 'Se terminó lo temporal')
    await userEvent.click(screen.getByTestId('conductor-en-documentos-guardar'))
    expect(acc.cambiarConductorEnDocumentosAccion).toHaveBeenCalledWith(null, 'Se terminó lo temporal')
  })

  it('quien no es Jefe de Transporte lo ve pero no lo cambia', () => {
    render(<RecursosVista panorama={panorama()} puedeEditar={false} />)
    expect(screen.queryByTestId('conductor-en-documentos-guardar')).toBeNull()
    expect(screen.getByTestId('conductor-en-documentos')).toHaveTextContent('Solo el Jefe de Transporte lo cambia')
  })

  it('INTERRUPTOR QUITADO: sin el parámetro la sección no existe', () => {
    render(<RecursosVista panorama={panorama({ conductorEnDocumentos: undefined })} puedeEditar />)
    expect(screen.queryByTestId('conductor-en-documentos')).toBeNull()
  })
})

describe('documento y licencia de cada conductor', () => {
  it('el que no tiene documento muestra «Documento pendiente»; guardar manda tipo, número y licencia', async () => {
    render(<RecursosVista panorama={panorama()} puedeEditar />)
    const filas = screen.getAllByTestId('documentos-conductor')
    expect(filas[0]).toHaveTextContent('Documento pendiente')   // Hans
    expect(filas[1]).not.toHaveTextContent('Documento pendiente')
    await userEvent.type(within(filas[0]).getByTestId('documento-numero'), '12345678')
    await userEvent.click(within(filas[0]).getByTestId('guardar-documentos'))
    expect(acc.guardarDocumentosPersonalAccion).toHaveBeenCalledWith({ id: 'h', documentoTipo: 'DNI', dni: '12345678', licencia: 'Q75084250' })
  })

  it('el carné de extranjería de Michele viene elegido', () => {
    render(<RecursosVista panorama={panorama()} puedeEditar />)
    const tipo = within(screen.getAllByTestId('documentos-conductor')[1]).getByTestId('documento-tipo') as HTMLSelectElement
    expect(tipo.value).toBe('CE')
  })

  it('el vehículo «calificado» se explica como solo informativo', () => {
    render(<RecursosVista panorama={panorama()} puedeEditar />)
    expect(screen.getByTestId('recursos-ruta')).toHaveTextContent('el sistema no valida si es «calificado»')
  })
})
