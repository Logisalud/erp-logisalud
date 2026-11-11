// @vitest-environment jsdom
// «Tomar para conformidad»: libre / mía / de otra persona, quién ve qué botón y que el Jefe asigna.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
const acc = vi.hoisted(() => ({ tomarParaConformidadAccion: vi.fn(), soltarConformidadAccion: vi.fn(), asignarConformidadAccion: vi.fn() }))
vi.mock('@/app/acciones-picking', () => acc)
import { TomaConformidad } from '@/components/picking/toma-conformidad'
import type { OrdenPickingResumen } from '@/domain/despacho'

const orden = (p: Partial<OrdenPickingResumen> = {}) => ({ id: 'o1', numero: 'OP-1', pickerId: 'u-picker', ...p }) as OrdenPickingResumen
const personal = [{ id: 'u-picker', nombre: 'Picker' }, { id: 'u2', nombre: 'Sandra' }, { id: 'u3', nombre: 'Katia' }]
beforeEach(() => { for (const f of Object.values(acc)) f.mockReset().mockResolvedValue({ ok: true }) })

describe('Tomar para conformidad (pantalla)', () => {
  it('libre: quien puede la toma; quien picó ve por qué no', async () => {
    const { unmount } = render(<TomaConformidad orden={orden()} roles={['auxiliar']} personaId="u2" personal={personal} />)
    expect(screen.getByTestId('toma-estado')).toHaveTextContent('Libre')
    await userEvent.click(screen.getByTestId('tomar-conformidad'))
    await waitFor(() => expect(acc.tomarParaConformidadAccion).toHaveBeenCalledWith('o1')); unmount()
    render(<TomaConformidad orden={orden()} roles={['auxiliar']} personaId="u-picker" personal={personal} />)
    expect(screen.queryByTestId('tomar-conformidad')).toBeNull(); expect(screen.getByTestId('toma-no-puede')).toHaveTextContent('no quien hizo el picking')
  })

  it('mía: la suelto; de otra persona: bloqueada, sin «Tomar»; el Jefe la puede soltar', async () => {
    const { unmount } = render(<TomaConformidad orden={orden({ conformidadTomadaPor: 'u2' })} roles={['auxiliar']} personaId="u2" personal={personal} />)
    expect(screen.getByTestId('toma-estado')).toHaveTextContent('La tienes tomada')
    await userEvent.click(screen.getByTestId('soltar-conformidad')); await waitFor(() => expect(acc.soltarConformidadAccion).toHaveBeenCalledWith('o1')); unmount()
    const r = render(<TomaConformidad orden={orden({ conformidadTomadaPor: 'u2', conformidadTomadaNombre: 'Sandra' })} roles={['auxiliar']} personaId="u3" personal={personal} />)
    expect(screen.getByTestId('toma-estado')).toHaveTextContent('La tomó Sandra'); expect(screen.queryByTestId('tomar-conformidad')).toBeNull(); expect(screen.queryByTestId('soltar-conformidad')).toBeNull(); r.unmount()
    render(<TomaConformidad orden={orden({ conformidadTomadaPor: 'u2', conformidadTomadaNombre: 'Sandra' })} roles={['jefe_almacen']} personaId="u3" personal={personal} />)
    expect(screen.getByTestId('soltar-conformidad')).toBeInTheDocument()
  })

  it('solo el Jefe asigna, y no a quien picó', async () => {
    const { unmount } = render(<TomaConformidad orden={orden()} roles={['auxiliar']} personaId="u2" personal={personal} />)
    expect(screen.queryByTestId('asignar-conformidad')).toBeNull(); unmount()
    render(<TomaConformidad orden={orden()} roles={['jefe_transporte']} personaId="u3" personal={personal} />)
    const opciones = Array.from(screen.getByTestId('asignar-persona').querySelectorAll('option')).map((o) => o.textContent)
    expect(opciones).toEqual(['Asignar a…', 'Sandra', 'Katia'])
    expect(screen.getByTestId('asignar-conformidad-boton')).toBeDisabled()
    await userEvent.selectOptions(screen.getByTestId('asignar-persona'), 'u2'); await userEvent.click(screen.getByTestId('asignar-conformidad-boton'))
    await waitFor(() => expect(acc.asignarConformidadAccion).toHaveBeenCalledWith('o1', 'u2'))
  })
})
