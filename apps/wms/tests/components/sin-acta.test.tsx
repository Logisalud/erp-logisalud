// @vitest-environment jsdom
// Piloto · errores de la demo (E-4): el acta de una solicitud sin recepción iniciada explica qué falta y ofrece «Iniciar recepción».
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const refrescar = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refrescar, push: () => {} }) }))
const acc = vi.hoisted(() => ({ iniciarRecepcionAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const }) as unknown) }))
vi.mock('@/app/acciones-entradas', () => acc)
import { SinActa } from '@/components/entradas/sin-acta'
import { MENSAJE_SIN_RECEPCION, explicarSinActa } from '@/domain/entradas'

beforeEach(() => { acc.iniciarRecepcionAccion.mockClear(); refrescar.mockClear() })

describe('qué se explica según el estado', () => {
  it('por llegar: explica y deja iniciar (solo a quien recibe)', () => {
    expect(explicarSinActa('PROGRAMADA', true)).toMatchObject({ puedeIniciar: true, texto: expect.stringContaining('la recepción no se inició') })
    expect(explicarSinActa('PROGRAMADA', false)).toMatchObject({ puedeIniciar: false, texto: expect.stringContaining('personal de almacén') })
  })
  it('sin autorizar: dice que primero se autoriza, sin botón; anulada: no habrá acta; con recepción: nada', () => {
    for (const e of ['BORRADOR', 'ENVIADA'] as const) expect(explicarSinActa(e, true)).toMatchObject({ puedeIniciar: false, texto: expect.stringContaining('no está autorizada') })
    expect(explicarSinActa('ANULADA', true)).toMatchObject({ puedeIniciar: false })
    expect(explicarSinActa('EN_RECEPCION', true)).toBeNull()
    expect(explicarSinActa('CERRADA', true)).toBeNull()
  })
  it('el mensaje del servidor ya no es «Solicitud inexistente»', () => {
    expect(MENSAJE_SIN_RECEPCION).toMatch(/Iniciar recepción/)
    expect(MENSAJE_SIN_RECEPCION).not.toMatch(/inexistente/i)
  })
})

describe('pantalla', () => {
  it('«Iniciar recepción» llama a la acción real de la solicitud, avisa y refresca', async () => {
    render(<SinActa solicitudId="sol-1" estado="PROGRAMADA" puedeRecibir />)
    expect(screen.getByTestId('sin-acta-explicacion')).toHaveTextContent('la recepción no se inició')
    await userEvent.click(screen.getByRole('button', { name: /Iniciar recepción/ }))
    expect(acc.iniciarRecepcionAccion).toHaveBeenCalledWith('sol-1')
    await waitFor(() => expect(screen.getByText(/Recepción iniciada/)).toBeInTheDocument())
    expect(refrescar).toHaveBeenCalled()
  })
  it('si la acción falla, muestra el motivo y no inventa un éxito', async () => {
    acc.iniciarRecepcionAccion.mockResolvedValueOnce({ ok: false, mensaje: 'La solicitud está cerrada' })
    render(<SinActa solicitudId="sol-1" estado="PROGRAMADA" puedeRecibir />)
    await userEvent.click(screen.getByTestId('iniciar-recepcion-acta'))
    expect(await screen.findByText('La solicitud está cerrada')).toBeInTheDocument()
  })
  it('sin permiso para recibir o sin autorizar no hay botón', () => {
    const { rerender } = render(<SinActa solicitudId="s" estado="PROGRAMADA" puedeRecibir={false} />)
    expect(screen.queryByTestId('iniciar-recepcion-acta')).toBeNull()
    rerender(<SinActa solicitudId="s" estado="ENVIADA" puedeRecibir />)
    expect(screen.queryByTestId('iniciar-recepcion-acta')).toBeNull()
  })
})
