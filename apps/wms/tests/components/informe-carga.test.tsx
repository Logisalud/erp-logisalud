// @vitest-environment jsdom
// Informe de la carga de ensayo en pantalla: vacío, cargando, error, veredicto y totales, y descarga.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { construirInforme } from '@/domain/informe-carga'

const acc = vi.hoisted(() => ({ informeCargaAccion: vi.fn() }))
vi.mock('@/app/acciones-inventario', () => acc)
import { InformeCarga } from '@/components/inventario/informe-carga'

const fila = (extra: object = {}) => ({ producto: 'P1', lote: 'L1', vence: '2029-01-31', propietario: 'LOGISSA', posicion: 'A-1', estado: 'APROBADO', cantidad: '10', ...extra })
beforeEach(() => { acc.informeCargaAccion.mockReset() })

describe('informe de la carga', () => {
  it('al inicio dice que no hay informe y pide revisar la carga', () => {
    render(<InformeCarga texto="x" />)
    expect(screen.getByTestId('informe-vacio')).toHaveTextContent('Todavía no hay informe')
  })

  it('«no lista»: muestra el veredicto, los totales por estado y por línea qué pasa y qué corregir', async () => {
    acc.informeCargaAccion.mockResolvedValue({ ok: true, informe: construirInforme([fila(), fila({ lote: '' }), fila({ lote: 'L3', vence: '2026-12-01' })], [], { hoy: '2026-11-02' }) })
    render(<InformeCarga texto="x" />)
    await userEvent.click(screen.getByTestId('armar-informe'))
    expect(await screen.findByTestId('veredicto')).toHaveAttribute('data-veredicto', 'NO_LISTA')
    expect(screen.getByTestId('total-lista')).toHaveTextContent('1')
    expect(screen.getByTestId('total-advertencia')).toHaveTextContent('1')
    expect(screen.getByTestId('total-error')).toHaveTextContent('1')
    const lineas = screen.getAllByTestId('linea-informe')
    expect(lineas).toHaveLength(2)                                   // solo lo que hay que mirar
    expect(lineas[0]).toHaveTextContent('Escribe el código de lote')
    await userEvent.click(screen.getByTestId('solo-problemas'))
    expect(screen.getAllByTestId('linea-informe')).toHaveLength(3)
  })

  it('«lista»: veredicto verde y sin líneas con problemas', async () => {
    acc.informeCargaAccion.mockResolvedValue({ ok: true, informe: construirInforme([fila()], [], { hoy: '2026-11-02' }) })
    render(<InformeCarga texto="x" />)
    await userEvent.click(screen.getByTestId('armar-informe'))
    expect(await screen.findByTestId('veredicto')).toHaveAttribute('data-veredicto', 'LISTA')
    expect(screen.getByTestId('informe-sin-problemas')).toBeInTheDocument()
  })

  it('si no se puede armar, muestra el motivo', async () => {
    acc.informeCargaAccion.mockResolvedValue({ ok: false, mensaje: 'No tienes permiso para revisar la carga inicial' })
    render(<InformeCarga texto="x" />)
    await userEvent.click(screen.getByTestId('armar-informe'))
    expect(await screen.findByTestId('informe-error')).toHaveTextContent('No tienes permiso')
  })

  it('la descarga pide el archivo al servidor con el texto y el formato', async () => {
    acc.informeCargaAccion.mockResolvedValue({ ok: true, informe: construirInforme([fila()], [], { hoy: '2026-11-02' }) })
    const fetchMock = vi.fn(async () => new Response('a,b', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn()
    render(<InformeCarga texto="mi,carga" />)
    await userEvent.click(screen.getByTestId('armar-informe'))
    await userEvent.click(await screen.findByTestId('bajar-csv'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    expect(url).toMatch(/\/carga-inicial\/informe$/)
    expect(JSON.parse(init.body)).toEqual({ texto: 'mi,carga', formato: 'csv' })
    vi.unstubAllGlobals()
  })
})
