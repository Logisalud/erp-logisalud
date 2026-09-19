// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * La ficha del proveedor: se MIRA, y recién al tocar "Editar datos" se puede
 * cambiar algo.
 *
 * Se testea acá y no en dominio porque lo que importa es la secuencia de
 * clics. Un test de dominio no ve que la pantalla abría con los campos
 * listos para escribir, que es justo el problema que reportó Sebas: entrar a
 * consultar un RUC y pisar la razón social de un roce en el celular.
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

const guardar = vi.fn(async () => ({ ok: true }))

vi.mock('@/app/proveedores/acciones-unificadas', () => ({
  guardarDatosProveedorAction: () => guardar(),
  cambiarActivoAction: () => async () => null,
  crearCuentaBancariaAction: () => async () => null,
  eliminarCuentaBancariaAction: async () => undefined,
}))

const { DetalleProveedor } = await import('@/app/proveedores/detalle-proveedor')
// La ficha vive dentro del provider que avisa "tenés cambios sin guardar"
// al navegar. Se envuelve igual acá porque el hook exige el contexto.
const { FormularioSucioProvider } = await import('@/components/formulario-sucio-provider')

const proveedor = {
  fuente: 'compra' as const,
  id: 'p-1',
  ruc: '10749251650',
  razonSocial: 'DIPHASAC SAC',
  nombreComercial: null,
  contactoNombre: null,
  contactoEmail: null,
  contactoTelefono: null,
  condicionPagoDias: 30,
  monedaPrincipal: 'PEN',
  activo: true,
  direccionFiscal: null,
  observaciones: null,
}

const pintar = () =>
  render(
    <FormularioSucioProvider>
      <DetalleProveedor proveedor={proveedor} cuentas={[]} tieneMovimientos={false} />
    </FormularioSucioProvider>
  )

beforeEach(() => guardar.mockClear())

describe('ficha del proveedor', () => {
  it('abre en modo lectura: ningún campo listo para escribir', () => {
    pintar()
    expect(screen.getByText('DIPHASAC SAC')).toBeTruthy()
    expect(screen.queryByLabelText?.('Razón social')).toBeFalsy()
    // Lo que de verdad importa: no hay caja de texto de la razón social.
    expect(document.querySelector('input[name="razonSocial"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Editar datos' })).toBeTruthy()
  })

  it('"Editar datos" abre el formulario con lo que ya está guardado', async () => {
    const user = userEvent.setup()
    pintar()
    await user.click(screen.getByRole('button', { name: 'Editar datos' }))

    const razon = document.querySelector('input[name="razonSocial"]') as HTMLInputElement
    expect(razon).not.toBeNull()
    expect(razon.value).toBe('DIPHASAC SAC')
    expect((document.querySelector('input[name="ruc"]') as HTMLInputElement).value)
      .toBe('10749251650')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeTruthy()
  })

  it('"Cancelar" vuelve a lectura y DESCARTA lo escrito', async () => {
    const user = userEvent.setup()
    pintar()
    await user.click(screen.getByRole('button', { name: 'Editar datos' }))

    const razon = document.querySelector('input[name="razonSocial"]') as HTMLInputElement
    await user.clear(razon)
    await user.type(razon, 'ALGO MAL ESCRITO')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    // Volvió a lectura y sigue mostrando lo guardado, no lo tipeado.
    expect(screen.getByText('DIPHASAC SAC')).toBeTruthy()
    expect(guardar).not.toHaveBeenCalled()

    // Y al reabrir, el campo trae lo guardado: cancelar descartó de verdad.
    await user.click(screen.getByRole('button', { name: 'Editar datos' }))
    expect((document.querySelector('input[name="razonSocial"]') as HTMLInputElement).value)
      .toBe('DIPHASAC SAC')
  })

  it('en lectura, los campos vacíos se ven como "—" y no como un hueco', async () => {
    pintar()
    // Este proveedor no tiene nombre comercial, contacto, correo ni teléfono.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  })

  /**
   * NO se testea que "Guardar cambios" dispare la Server Action.
   *
   * `<form action={fn}>` lo implementa Next, no el react-dom suelto que usa
   * jsdom: el submit no llega a ninguna parte y la afirmación mediría el
   * framework, no nuestro código. Lo que sí es nuestro —que la ficha abra
   * cerrada, que Editar traiga lo guardado y que Cancelar descarte— está
   * cubierto arriba. El guardado real se prueba en producción, que es donde
   * ese cableado existe.
   */
})
