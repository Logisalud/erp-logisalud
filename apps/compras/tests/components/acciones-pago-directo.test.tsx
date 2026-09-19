// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * El botón de Anular / Rechazar de la ficha de una obligación.
 *
 * Se testea acá y no solo en dominio porque lo que importa es la SECUENCIA
 * de clics: escribir el motivo, pedir confirmación, confirmar. Un test de
 * dominio no ve que "Confirmar anulación" a secas ya no manda nada.
 *
 * Las Server Actions se mockean: el test mira el comportamiento del
 * formulario, no lo que escribe la base.
 */
/**
 * `useFormState`/`useFormStatus` los sirve Next en runtime, no el react-dom
 * suelto que usa jsdom. Se sustituyen por equivalentes mínimos: `useFormState`
 * devuelve el estado inicial y un dispatch que llama a la acción con el
 * FormData, que es exactamente lo que hace el de verdad al enviar.
 */
vi.mock('react-dom', async () => {
  const real = await vi.importActual<typeof import('react-dom')>('react-dom')
  const { useState } = await import('react')
  return {
    ...real,
    useFormStatus: () => ({ pending: false }),
    useFormState: (accion: (previo: unknown, form: FormData) => unknown, inicial: unknown) => {
      const [estado, setEstado] = useState(inicial)
      return [estado, async (form: FormData) => setEstado(await accion(estado, form))]
    },
  }
})

const anular = vi.fn(async () => null)
const rechazar = vi.fn(async () => null)

vi.mock('@/app/cuentas-por-pagar/[id]/actions', () => ({
  anularPagoDirectoAction: (...args: unknown[]) => anular(...(args as [])),
  rechazarPagoDirectoAction: (...args: unknown[]) => rechazar(...(args as [])),
}))

const { BotonAnularPagoDirecto, BotonRechazarPagoDirecto } = await import(
  '@/app/cuentas-por-pagar/[id]/acciones-pago-directo'
)

beforeEach(() => {
  anular.mockClear()
  rechazar.mockClear()
})

describe('BotonAnularPagoDirecto', () => {
  it('arranca cerrado: anular nunca es un solo clic', () => {
    render(<BotonAnularPagoDirecto obligacionId="ob-1" registro="anticipo" />)
    expect(screen.getByRole('button', { name: 'Anular…' })).toBeTruthy()
    expect(screen.queryByPlaceholderText('Motivo de la anulación…')).toBeNull()
  })

  it('sin motivo escrito no deja ni pedir confirmación', async () => {
    const user = userEvent.setup()
    render(<BotonAnularPagoDirecto obligacionId="ob-1" registro="anticipo" />)
    await user.click(screen.getByRole('button', { name: 'Anular…' }))

    const confirmar = screen.getByRole('button', { name: 'Confirmar anulación' })
    expect((confirmar as HTMLButtonElement).disabled).toBe(true)
  })

  it('con motivo, "Confirmar anulación" pregunta primero y NO manda todavía', async () => {
    const user = userEvent.setup()
    render(<BotonAnularPagoDirecto obligacionId="ob-1" registro="anticipo" />)
    await user.click(screen.getByRole('button', { name: 'Anular…' }))
    await user.type(screen.getByPlaceholderText('Motivo de la anulación…'), 'Duplicado')
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }))

    expect(screen.getByText('¿Seguro que quieres anular el anticipo?')).toBeTruthy()
    expect(screen.getByText(/No se puede deshacer/)).toBeTruthy()
    expect(anular).not.toHaveBeenCalled()
  })

  it('"No, volver" cancela la confirmación sin perder el motivo', async () => {
    const user = userEvent.setup()
    render(<BotonAnularPagoDirecto obligacionId="ob-1" registro="anticipo" />)
    await user.click(screen.getByRole('button', { name: 'Anular…' }))
    const caja = screen.getByPlaceholderText('Motivo de la anulación…')
    await user.type(caja, 'Duplicado')
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }))
    await user.click(screen.getByRole('button', { name: 'No, volver' }))

    expect(screen.queryByText('¿Seguro que quieres anular el anticipo?')).toBeNull()
    expect((caja as HTMLTextAreaElement).value).toBe('Duplicado')
    expect(anular).not.toHaveBeenCalled()
  })

  it('cambiar el motivo después de confirmar vuelve atrás: no se confirma un texto y se manda otro', async () => {
    const user = userEvent.setup()
    render(<BotonAnularPagoDirecto obligacionId="ob-1" registro="anticipo" />)
    await user.click(screen.getByRole('button', { name: 'Anular…' }))
    await user.type(screen.getByPlaceholderText('Motivo de la anulación…'), 'Duplicado')
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }))
    expect(screen.getByText('¿Seguro que quieres anular el anticipo?')).toBeTruthy()

    await user.type(screen.getByPlaceholderText('Motivo de la anulación…'), ' con la OC')
    expect(screen.queryByText('¿Seguro que quieres anular el anticipo?')).toBeNull()
  })

  it('"Cancelar" cierra todo y limpia el motivo', async () => {
    const user = userEvent.setup()
    render(<BotonAnularPagoDirecto obligacionId="ob-1" registro="anticipo" />)
    await user.click(screen.getByRole('button', { name: 'Anular…' }))
    await user.type(screen.getByPlaceholderText('Motivo de la anulación…'), 'Duplicado')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('button', { name: 'Anular…' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Anular…' }))
    expect((screen.getByPlaceholderText('Motivo de la anulación…') as HTMLTextAreaElement).value).toBe('')
  })
})

describe('BotonRechazarPagoDirecto', () => {
  it('usa su propio texto: rechazar no es anular', async () => {
    const user = userEvent.setup()
    render(<BotonRechazarPagoDirecto obligacionId="ob-1" registro="reembolso" />)
    await user.click(screen.getByRole('button', { name: 'Rechazar…' }))
    await user.type(screen.getByPlaceholderText('Motivo del rechazo…'), 'Factura ilegible')
    await user.click(screen.getByRole('button', { name: 'Confirmar rechazo' }))

    expect(screen.getByText('¿Seguro que quieres rechazar el reembolso?')).toBeTruthy()
    expect(screen.getByText(/vuelve a quien lo registró/)).toBeTruthy()
  })
})
