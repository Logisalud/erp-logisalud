// @vitest-environment jsdom
// Inspección de la unidad: todo viene en «Sí», se cambia solo lo que no está bien, la nota se pide si hay un «No», el mes completo y quién puede supervisar.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const empujar = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: empujar }) }))
const acc = vi.hoisted(() => ({ registrarInspeccionAccion: vi.fn(), supervisarInspeccionAccion: vi.fn() }))
vi.mock('@/app/acciones-inspecciones', () => acc)
import { InspeccionUnidad } from '@/components/inspecciones/inspeccion-unidad'
import { itemsTodoSi, type InspeccionVista } from '@/domain/inspecciones'

const veh = [{ id: 'v1', placa: 'ABC-123', descripcion: 'Furgón' }, { id: 'v2', placa: 'XYZ-987' }]
const hecha = (p: Partial<InspeccionVista> = {}): InspeccionVista => ({ id: 'i1', tipo: 'VEHICULO', vehiculoId: 'v1', fecha: '2026-11-09', items: itemsTodoSi('VEHICULO'), conforme: true, realizadaPor: 'u1', realizadaNombre: 'Hans', realizadaEn: '2026-11-09T13:00:00Z', ...p })
const montar = (p: Partial<Parameters<typeof InspeccionUnidad>[0]> = {}) => render(<InspeccionUnidad tipo="VEHICULO" vehiculos={veh} vehiculoId="v1" mes="2026-11" hoy="2026-11-10" inspecciones={[]} roles={['conductor']} personaId="u2" {...p} />)
beforeEach(() => { acc.registrarInspeccionAccion.mockReset(); acc.supervisarInspeccionAccion.mockReset(); empujar.mockReset(); acc.registrarInspeccionAccion.mockResolvedValue({ ok: true, id: 'n' }); acc.supervisarInspeccionAccion.mockResolvedValue({ ok: true }) })

describe('Inspección de la unidad (pantalla)', () => {
  it('sin vehículos lo dice; con vehículos pide elegir uno antes de mostrar la lista', () => {
    const { unmount } = montar({ vehiculos: [], vehiculoId: undefined })
    expect(screen.getByTestId('inspeccion-sin-vehiculos')).toBeInTheDocument(); unmount()
    montar({ vehiculoId: undefined }); expect(screen.queryByTestId('inspeccion-formulario')).toBeNull(); expect(screen.getByTestId('inspeccion-vehiculo')).toBeInTheDocument()
  })

  it('todo viene en «Sí» y se guarda con un click; los dos formatos están como pestañas', async () => {
    montar()
    expect(screen.getAllByTestId('inspeccion-punto')).toHaveLength(34)
    expect(screen.getByTestId('tipo-VEHICULO')).toHaveAttribute('aria-current', 'page'); expect(screen.getByTestId('tipo-LIMPIEZA')).toHaveTextContent('LS-FR.52.03')
    expect(screen.getByTestId('marca-soat-SI')).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByTestId('inspeccion-guardar'))
    await waitFor(() => expect(acc.registrarInspeccionAccion).toHaveBeenCalled())
    const d = acc.registrarInspeccionAccion.mock.calls[0][0]
    expect(d).toMatchObject({ tipo: 'VEHICULO', vehiculoId: 'v1', fecha: '2026-11-10' }); expect(Object.values(d.items).every((m) => m === 'SI')).toBe(true)
  })

  it('un «No» pide la nota (no deja guardar sin ella) y la manda', async () => {
    montar()
    await userEvent.click(screen.getByTestId('marca-luces-NO'))
    expect(screen.getByTestId('inspeccion-no-conforme')).toHaveTextContent('Luces operativas')
    expect(screen.getByTestId('inspeccion-guardar')).toBeDisabled(); expect(screen.getByTestId('inspeccion-falta')).toHaveTextContent('cuéntanos qué pasó')
    await userEvent.type(screen.getByTestId('inspeccion-observaciones'), 'Luz trasera rota')
    expect(screen.getByTestId('inspeccion-guardar')).toBeEnabled(); await userEvent.click(screen.getByTestId('inspeccion-guardar'))
    await waitFor(() => expect(acc.registrarInspeccionAccion.mock.calls[0][0]).toMatchObject({ observaciones: 'Luz trasera rota', items: expect.objectContaining({ luces: 'NO' }) }))
  })

  it('si ya hay inspección de ese día no se vuelve a llenar', () => {
    montar({ inspecciones: [hecha({ fecha: '2026-11-10', realizadaNombre: 'Michele' })] })
    expect(screen.getByTestId('inspeccion-ya-hecha')).toHaveTextContent('Michele'); expect(screen.queryByTestId('inspeccion-guardar')).toBeNull()
  })

  it('el mes completo: días con y sin inspección; supervisa otra persona, no quien la hizo', async () => {
    montar({ inspecciones: [hecha(), hecha({ id: 'i2', fecha: '2026-11-08', realizadaPor: 'u2', conforme: false }), hecha({ id: 'i3', fecha: '2026-11-07', supervisadaPor: 'u3', supervisadaNombre: 'Michele' })] })
    expect(screen.getAllByTestId('inspeccion-dia')).toHaveLength(30); expect(screen.getByTestId('inspeccion-resumen')).toHaveTextContent('3 de 30')
    const dia = (f: string) => document.querySelector(`[data-fecha="${f}"]`) as HTMLElement
    expect(dia('2026-11-09')).toHaveAttribute('data-estado', 'CONFORME'); expect(dia('2026-11-08')).toHaveAttribute('data-estado', 'NO_CONFORME'); expect(dia('2026-11-02')).toHaveAttribute('data-estado', 'SIN')
    expect(within(dia('2026-11-07')).getByText(/Supervisó: Michele/)).toBeInTheDocument()
    expect(within(dia('2026-11-08')).queryByTestId('supervisar-inspeccion')).toBeNull()   // la hizo la misma persona (u2)
    await userEvent.click(within(dia('2026-11-09')).getByTestId('supervisar-inspeccion'))
    await waitFor(() => expect(acc.supervisarInspeccionAccion).toHaveBeenCalledWith('i1'))
  })

  it('la limpieza trae su formato, y la descarga en Word apunta al mes y vehículo elegidos', () => {
    montar({ tipo: 'LIMPIEZA' })
    expect(screen.getAllByTestId('inspeccion-punto')).toHaveLength(12); expect(screen.getByTestId('marca-derrame-NO')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('descargar-word')).toHaveAttribute('href', '/wms/inspecciones/word?tipo=LIMPIEZA&vehiculo=v1&mes=2026-11')
  })
})
