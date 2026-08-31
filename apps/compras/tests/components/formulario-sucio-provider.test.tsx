// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, useTransition } from 'react'
import {
  FormularioSucioProvider,
  useFormularioSucio,
  useMarcarSucioAlEditar,
} from '@/components/formulario-sucio-provider'

/**
 * Consumidor mínimo que reproduce components/nav.tsx: el botón "Menú
 * principal" pide navegar a través de `solicitarNavegacion` — nunca
 * router.back() ni window.confirm(), igual que el real (ver
 * components/nav.tsx).
 */
function BotonMenuPrincipal({ onNavegar }: { onNavegar: () => void }) {
  const { solicitarNavegacion } = useFormularioSucio()
  return (
    <button onClick={() => solicitarNavegacion(onNavegar)}>Menú principal</button>
  )
}

/**
 * Formulario de prueba con un input controlado por defaultValue (simula un
 * formulario precargado al montar) y `useMarcarSucioAlEditar` — el mismo
 * hook que usan los 11 formularios reales.
 */
function FormularioDePrueba({ valorInicial = '' }: { valorInicial?: string }) {
  const sucio = useMarcarSucioAlEditar()
  return (
    <form onChange={sucio.onChange} data-testid="formulario">
      <label>
        Campo
        <input aria-label="Campo" name="campo" defaultValue={valorInicial} />
      </label>
    </form>
  )
}

/**
 * Reproduce el patrón real de un formulario con useFormState (ver
 * app/pago-directo/nueva/formulario.tsx): cada submit reemplaza el `estado`
 * devuelto por la Server Action y React vuelve a bindear `accion` — esto
 * fuerza un re-render del componente completo en cada vuelta.
 */
type EstadoAccion = { ok: boolean; intentos: number } | null

async function accionDePrueba(estadoPrevio: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return { ok: false, intentos: (estadoPrevio?.intentos ?? 0) + 1 }
}

/**
 * El paquete `react-dom` publicado en npm (18.3.1, el que usa este repo) no
 * expone `useFormState` en su build — Next.js lo resuelve con su propio
 * react-dom con canary features al buildear la app de verdad (ver
 * app/pago-directo/nueva/formulario.tsx). Acá, fuera de Next, se reimplementa
 * el mismo contrato (estado + acción que se re-bindea en cada render) con
 * primitivas reales de React para poder ejercitar el caso que importa: que
 * el guard sobrevive al re-render que dispara cada nuevo `estado`.
 */
function useFormStateDePrueba<S>(
  accion: (estadoPrevio: S, formData: FormData) => Promise<S>,
  estadoInicial: S
): [S, (formData: FormData) => void] {
  const [estado, setEstado] = useState(estadoInicial)
  const [, startTransition] = useTransition()
  function accionBindeada(formData: FormData) {
    startTransition(async () => {
      const nuevo = await accion(estado, formData)
      setEstado(nuevo)
    })
  }
  return [estado, accionBindeada]
}

function FormularioConUseFormState() {
  const [estado, accion] = useFormStateDePrueba<EstadoAccion>(accionDePrueba, null)
  const sucio = useMarcarSucioAlEditar()
  return (
    // react-dom 18.3.1 (el publicado en npm, sin las builds canary de Next)
    // no soporta `<form action={fn}>` — mismo motivo que el shim de arriba.
    // onSubmit + FormData reproduce la semántica real sin depender de eso.
    <form
      onChange={sucio.onChange}
      onSubmit={(e) => {
        e.preventDefault()
        accion(new FormData(e.currentTarget))
      }}
    >
      <input aria-label="Campo" name="campo" defaultValue="" />
      <p data-testid="intentos">{estado?.intentos ?? 0}</p>
      <button type="submit">Enviar</button>
    </form>
  )
}

function Escenario({
  onNavegar, valorInicial, conUseFormState = false, montarFormulario = true,
}: {
  onNavegar: () => void
  valorInicial?: string
  conUseFormState?: boolean
  montarFormulario?: boolean
}) {
  return (
    <FormularioSucioProvider>
      <BotonMenuPrincipal onNavegar={onNavegar} />
      {montarFormulario ? conUseFormState ? <FormularioConUseFormState /> : <FormularioDePrueba valorInicial={valorInicial} /> : null}
    </FormularioSucioProvider>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('FormularioSucioProvider — guard de salida con cambios sin guardar', () => {
  it('formulario sin cambios: click en "Menú principal" navega directo, sin modal', async () => {
    const user = userEvent.setup()
    const onNavegar = vi.fn()
    render(<Escenario onNavegar={onNavegar} />)

    await user.click(screen.getByRole('button', { name: 'Menú principal' }))

    expect(screen.queryByText(/seguro que quieres volver/i)).not.toBeInTheDocument()
    expect(onNavegar).toHaveBeenCalledOnce()
  })

  it('formulario modificado: click en "Menú principal" abre el modal y NO navega todavía', async () => {
    const user = userEvent.setup()
    const onNavegar = vi.fn()
    render(<Escenario onNavegar={onNavegar} />)

    await user.type(screen.getByLabelText('Campo'), 'x')
    await user.click(screen.getByRole('button', { name: 'Menú principal' }))

    expect(screen.getByText(/seguro que quieres volver/i)).toBeInTheDocument()
    expect(onNavegar).not.toHaveBeenCalled()
  })

  it('"Seguir editando" cierra el modal, conserva el valor tipeado y no navega', async () => {
    const user = userEvent.setup()
    const onNavegar = vi.fn()
    render(<Escenario onNavegar={onNavegar} />)

    const input = screen.getByLabelText('Campo') as HTMLInputElement
    await user.type(input, 'valor importante')
    await user.click(screen.getByRole('button', { name: 'Menú principal' }))
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }))

    expect(screen.queryByText(/seguro que quieres volver/i)).not.toBeInTheDocument()
    expect(input.value).toBe('valor importante')
    expect(onNavegar).not.toHaveBeenCalled()
  })

  it('"Salir sin guardar" cierra el modal y sí navega', async () => {
    const user = userEvent.setup()
    const onNavegar = vi.fn()
    render(<Escenario onNavegar={onNavegar} />)

    await user.type(screen.getByLabelText('Campo'), 'x')
    await user.click(screen.getByRole('button', { name: 'Menú principal' }))
    await user.click(screen.getByRole('button', { name: 'Salir sin guardar' }))

    expect(screen.queryByText(/seguro que quieres volver/i)).not.toBeInTheDocument()
    expect(onNavegar).toHaveBeenCalledOnce()
  })

  it('guardado exitoso (desmontar el formulario, como hace un redirect() real) limpia el dirty state solo', async () => {
    const user = userEvent.setup()
    const onNavegar = vi.fn()
    const { rerender } = render(<Escenario onNavegar={onNavegar} montarFormulario={true} />)

    await user.type(screen.getByLabelText('Campo'), 'x')
    // El "guardado" real hace redirect() -> la pantalla cambia -> el
    // formulario se desmonta. useMarcarSucioAlEditar limpia en su cleanup.
    rerender(<Escenario onNavegar={onNavegar} montarFormulario={false} />)

    // Ya no hay nada sucio: el próximo click no debería abrir el modal.
    await user.click(screen.getByRole('button', { name: 'Menú principal' }))
    expect(screen.queryByText(/seguro que quieres volver/i)).not.toBeInTheDocument()
    expect(onNavegar).toHaveBeenCalledOnce()
  })

  it('el modal NO aparece por el valor precargado al montar (defaultValue) — solo por una edición real', async () => {
    const user = userEvent.setup()
    const onNavegar = vi.fn()
    render(<Escenario onNavegar={onNavegar} valorInicial="valor por defecto" />)

    await user.click(screen.getByRole('button', { name: 'Menú principal' }))

    expect(screen.queryByText(/seguro que quieres volver/i)).not.toBeInTheDocument()
    expect(onNavegar).toHaveBeenCalledOnce()
  })

  it('beforeunload solo se registra cuando hay cambios sin guardar, y se remueve al limpiarse', async () => {
    const user = userEvent.setup()
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    render(<Escenario onNavegar={vi.fn()} />)
    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function))

    await user.type(screen.getByLabelText('Campo'), 'x')
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    await user.click(screen.getByRole('button', { name: 'Menú principal' }))
    await user.click(screen.getByRole('button', { name: 'Salir sin guardar' }))
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('no acumula listeners de beforeunload duplicados tras varios re-renders con sucio=true', async () => {
    const user = userEvent.setup()
    const addSpy = vi.spyOn(window, 'addEventListener')
    const { rerender } = render(<Escenario onNavegar={vi.fn()} />)

    await user.type(screen.getByLabelText('Campo'), 'x')
    const llamadasTrasPrimerCambio = addSpy.mock.calls.filter((c) => c[0] === 'beforeunload').length
    expect(llamadasTrasPrimerCambio).toBe(1)

    // Re-render con las mismas props, sucio se mantiene true — el efecto
    // depende de `sucio`, que no cambió, así que no debe re-registrar.
    rerender(<Escenario onNavegar={vi.fn()} />)
    rerender(<Escenario onNavegar={vi.fn()} />)

    const llamadasTotales = addSpy.mock.calls.filter((c) => c[0] === 'beforeunload').length
    expect(llamadasTotales).toBe(1)
  })

  it('funciona con el re-binding de useFormState en cada submit: el dirty state sobrevive a los re-renders que dispara cada nuevo `estado`', async () => {
    const user = userEvent.setup()
    const onNavegar = vi.fn()
    render(<Escenario onNavegar={onNavegar} conUseFormState />)

    await user.type(screen.getByLabelText('Campo'), 'x')

    // Cada submit re-invoca la action, useFormState devuelve un estado
    // nuevo y el componente se re-renderiza (accion queda re-bindeada) —
    // el guard tiene que seguir viendo el formulario como sucio.
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Enviar' }).closest('form')!)
    })
    expect(await screen.findByTestId('intentos')).toHaveTextContent('1')

    await user.click(screen.getByRole('button', { name: 'Menú principal' }))
    expect(screen.getByText(/seguro que quieres volver/i)).toBeInTheDocument()
    expect(onNavegar).not.toHaveBeenCalled()
  })
})

describe('El guard no depende del historial del navegador', () => {
  it('nav.tsx no usa router.back() ni window.confirm()', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const navSrc = sinComentarios(fs.readFileSync(path.resolve(__dirname, '../../components/nav.tsx'), 'utf-8'))
    const guardSrc = sinComentarios(
      fs.readFileSync(path.resolve(__dirname, '../../components/formulario-sucio-provider.tsx'), 'utf-8')
    )

    // Se limpian los comentarios primero porque el propio código documenta
    // en prosa "no usa router.back()" — sin esto el regex matchearía la
    // explicación, no un uso real.
    expect(navSrc).not.toMatch(/router\.back\(/)
    expect(navSrc).not.toMatch(/window\.confirm\(/)
    expect(guardSrc).not.toMatch(/router\.back\(/)
    expect(guardSrc).not.toMatch(/window\.confirm\(/)
    expect(guardSrc).not.toMatch(/\bconfirm\(/)
  })
})
