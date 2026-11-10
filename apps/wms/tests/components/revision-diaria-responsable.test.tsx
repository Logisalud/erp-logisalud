// @vitest-environment jsdom
// Piloto · errores de la demo (E-5): en la revisión diaria, «¿Quién lo resuelve?» ofrece solo auxiliares.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
vi.mock('@/app/acciones-operacion', () => ({
  iniciarRevisionAccion: vi.fn(), marcarFocoAccion: vi.fn(), registrarPendienteAccion: vi.fn(), resolverPendienteAccion: vi.fn(), verificarPendienteAccion: vi.fn(), cerrarRevisionAccion: vi.fn(),
}))
import { RevisionDiariaVista } from '@/components/operacion/revision-diaria'
import type { PersonaEquipo, RevisionDiaria } from '@/domain/operacion'

const equipo: PersonaEquipo[] = [
  { id: 'j', nombre: 'Charlie (Jefe de Almacén)', rol: 'jefe_almacen' }, { id: 'a1', nombre: 'Christians (auxiliar)', rol: 'auxiliar' },
  { id: 'a2', nombre: 'Rosa (auxiliar)', rol: 'auxiliar' }, { id: 'k', nombre: 'Katia (Dirección Técnica)', rol: 'direccion_tecnica' }, { id: 's', nombre: 'Sandra (asistente)', rol: 'asistente_dt' },
]
const revision: RevisionDiaria = { id: 'r1', numero: 'RD-20261104', fecha: '2026-11-04', responsableId: 'j', responsable: 'Charlie', estado: 'ABIERTA', focos: [], pendientes: [] }

describe('Revisión diaria · quién lo resuelve', () => {
  it('el selector trae solo a los auxiliares', async () => {
    render(<RevisionDiariaVista hoy="2026-11-04" revision={revision} vivos={[]} equipo={equipo} historial={[]} roles={['jefe_almacen']} actorId="j" />)
    await userEvent.click(screen.getAllByTestId('foco-agregar-pendiente')[0])
    const opciones = within(screen.getByTestId('pendiente-responsable')).getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toEqual(['Elige a una persona', 'Christians (auxiliar)', 'Rosa (auxiliar)'])
    expect(screen.getByTestId('pendiente-solo-auxiliares')).toHaveTextContent('Lo resuelve un auxiliar')
  })
  it('sin auxiliares registrados, lo dice en vez de dejar elegir a otra persona', async () => {
    render(<RevisionDiariaVista hoy="2026-11-04" revision={revision} vivos={[]} equipo={equipo.filter((p) => p.rol !== 'auxiliar')} historial={[]} roles={['jefe_almacen']} actorId="j" />)
    await userEvent.click(screen.getAllByTestId('foco-agregar-pendiente')[0])
    expect(within(screen.getByTestId('pendiente-responsable')).getAllByRole('option')).toHaveLength(1)
    expect(screen.getByTestId('pendiente-solo-auxiliares')).toHaveTextContent('Todavía no hay auxiliares')
  })
})
