// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const acc = vi.hoisted(() => ({
  buscarProductosSalidaAccion: vi.fn(async (..._a: unknown[]) => [{ id: 'p1', codigo: 'DEMO-001', descripcion: 'Dapagliflozina 10 mg', presentacion: 'Caja x 30', coincidencia: 'código del cliente DIPH-0001' }] as unknown[]),
  lotesParaSalidaAccion: vi.fn(async (..._a: unknown[]) => [
    { loteId: 'l1', codigo: 'L-VIEJO', productoId: 'p1', propietarioId: 'logissa', propietario: 'Logissa', vence: '2027-03-31', disponibleAprobado: 30, enBajas: 0, enReserva: false },
    { loteId: 'l2', codigo: 'L-NUEVO', productoId: 'p1', propietarioId: 'logissa', propietario: 'Logissa', vence: '2028-09-30', disponibleAprobado: 100, enBajas: 0, enReserva: false },
  ] as unknown[]),
  validarLineaConLoteAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, lote: { loteId: 'lx', codigo: 'GRE-1' }, vence: '2028-06-30' }) as unknown),
  ordenDelPedidoAccion: vi.fn(async (..._a: unknown[]) => null as unknown),
  subirGreClienteAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, ref: 'gre-cliente/x.pdf', nombre: 'gre.pdf' })),
  crearOrdenManualAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, ordenes: [{ id: 'o1', numero: 'OS-2026-00042', motivo: 'VENTA' }] }) as unknown),
}))
vi.mock('@/app/acciones-salida-manual', () => acc)
import { FormOrdenManual } from '@/components/salidas/form-orden-manual'

const propietarios = [
  { id: 'logissa', razonSocial: 'Logissa', esDuenoAlmacen: true }, { id: 'diph', razonSocial: 'Diphasac', esDuenoAlmacen: false }, { id: 'ajr', razonSocial: 'AJR Labs', esDuenoAlmacen: false },
]
const props = { clasesPermitidas: ['A', 'B', 'C'] as ('A' | 'B' | 'C')[], motivosCPermitidos: ['MUESTRA', 'DEVOLUCION_PROVEEDOR'] as ('MUESTRA' | 'DEVOLUCION_PROVEEDOR')[], propietarios, hoy: '2026-10-19' }

beforeEach(() => { Object.values(acc).forEach((f) => f.mockClear()); acc.ordenDelPedidoAccion.mockImplementation(async () => null) })

async function elegirProducto(fila = 0) {
  const filas = screen.getAllByTestId('fila-linea-orden')
  await userEvent.type(within(filas[fila]).getByTestId('buscar-producto-salida'), 'dapa')
  await userEvent.click(await within(filas[fila]).findByTestId('opcion-producto-salida'))
}

describe('Nueva Orden de Salida: el tipo se elige primero y cada rol ve solo los suyos', () => {
  it('con los tres tipos, cada uno explica qué es y quién lo crea; sin elegir no hay tabla', () => {
    render(<FormOrdenManual {...props} />)
    for (const c of ['A', 'B', 'C']) expect(screen.getByTestId(`clase-${c}`)).toBeInTheDocument()
    expect(screen.getByTestId('clase-A')).toHaveTextContent('La crea solo el Jefe de Transporte.')
    expect(screen.getByTestId('clase-B')).toHaveTextContent('No lleva guía del WMS')
    expect(screen.queryByTestId('lineas-orden')).toBeNull()
    expect(screen.getByTestId('crear-orden-manual')).toBeDisabled()
  })

  it('un rol que solo puede crear B y C no ve el tipo A; quien solo autoriza muestras ve C con la devolución apagada', async () => {
    const { unmount } = render(<FormOrdenManual {...props} clasesPermitidas={['B', 'C']} />)
    expect(screen.queryByTestId('clase-A')).toBeNull()
    unmount()
    render(<FormOrdenManual {...props} clasesPermitidas={['C']} motivosCPermitidos={['MUESTRA']} />)
    expect(screen.getByTestId('datos-C')).toBeInTheDocument() // con un solo tipo ya viene elegido
    expect(screen.getByTestId('motivo-C-DEVOLUCION_PROVEEDOR')).toBeDisabled()
    await userEvent.click(screen.getByTestId('motivo-C-MUESTRA'))
    expect(screen.getByTestId('lineas-orden')).toBeInTheDocument()
  })
})

describe('tipo A: número de pedido, cliente y tabla con propuesta FEFO', () => {
  it('avisa al instante que el número ya tiene orden (con enlace a esa orden) y no deja crearla', async () => {
    acc.ordenDelPedidoAccion.mockImplementation(async () => ({ tipo: 'ORDEN', id: 'ya-1', numero: 'OS-2026-00007', estado: 'ABIERTA' }))
    render(<FormOrdenManual {...props} />)
    await userEvent.click(screen.getByTestId('clase-A'))
    await userEvent.type(screen.getByTestId('pedido-numero'), 'PED-77')
    const aviso = await screen.findByTestId('aviso-pedido-con-orden')
    expect(aviso).toHaveTextContent('El pedido PED-77 ya tiene la Orden de Salida OS-2026-00007')
    expect(within(aviso).getByRole('link', { name: /Abrir esa orden/ })).toHaveAttribute('href', '/salidas/ya-1')
    await userEvent.click(screen.getByTestId('crear-orden-manual'))
    expect(acc.crearOrdenManualAccion).not.toHaveBeenCalled()
    expect(await screen.findByTestId('error-pedido-numero')).toHaveTextContent('Un pedido no puede tener dos órdenes')
  })

  it('un pedido que ya llegó por la bandeja manda a «Pedidos por despachar»', async () => {
    acc.ordenDelPedidoAccion.mockImplementation(async () => ({ tipo: 'EN_BANDEJA', pedidoNumero: 'PED-88' }))
    render(<FormOrdenManual {...props} />)
    await userEvent.click(screen.getByTestId('clase-A'))
    await userEvent.type(screen.getByTestId('pedido-numero'), 'ped-88')
    const aviso = await screen.findByTestId('aviso-pedido-en-bandeja')
    expect(within(aviso).getByRole('link', { name: /Ir a Pedidos por despachar/ })).toHaveAttribute('href', '/pedidos')
  })

  it('el número de pedido y el cliente son obligatorios: los errores salen en cada campo', async () => {
    render(<FormOrdenManual {...props} />)
    await userEvent.click(screen.getByTestId('clase-A'))
    await userEvent.click(screen.getByTestId('crear-orden-manual'))
    expect(await screen.findByTestId('error-pedido-numero')).toHaveTextContent('El número de pedido es obligatorio')
    expect(screen.getByTestId('error-ruc')).toHaveTextContent('El RUC tiene 11 números')
    expect(screen.getByTestId('error-ubigeo')).toHaveTextContent('El ubigeo tiene 6 números')
    expect(acc.crearOrdenManualAccion).not.toHaveBeenCalled()
  })

  it('busca el producto por otro código, propone el lote por vencimiento y permite preferir otro; crea la orden y dice qué sigue', async () => {
    render(<FormOrdenManual {...props} />)
    await userEvent.click(screen.getByTestId('clase-A'))
    await userEvent.type(screen.getByTestId('pedido-numero'), 'PED-100')
    await userEvent.type(screen.getByTestId('cliente-ruc'), '20123456789')
    await userEvent.type(screen.getByTestId('cliente-razon-social'), 'Botica Salud SAC')
    await userEvent.type(screen.getByTestId('cliente-direccion'), 'Av. Lima 123')
    await userEvent.type(screen.getByTestId('cliente-ubigeo'), '150101')
    await userEvent.type(within(screen.getByTestId('fila-linea-orden')).getByTestId('buscar-producto-salida'), 'DIPH')
    expect(await screen.findByText(/Lo encontramos por su código del cliente DIPH-0001/)).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('opcion-producto-salida'))
    fireEvent.change(screen.getByTestId('cantidad-linea-orden'), { target: { value: '50' } })
    const prop = await screen.findByTestId('propuesta-fefo')
    expect(prop).toHaveTextContent('L-VIEJO')       // vence primero: toma lo que tiene
    expect(prop).toHaveTextContent('L-NUEVO')       // y completa con el siguiente
    expect(prop).toHaveTextContent('03/2027')
    await userEvent.selectOptions(screen.getByTestId('elegir-lote-linea'), 'l2')
    expect(screen.getByTestId('propuesta-fefo')).toHaveTextContent('Lote que elegiste')
    await userEvent.click(screen.getByTestId('crear-orden-manual'))
    await waitFor(() => expect(acc.crearOrdenManualAccion).toHaveBeenCalledTimes(1))
    const e = acc.crearOrdenManualAccion.mock.calls[0][0] as Record<string, unknown>
    expect(e).toMatchObject({ clase: 'A', pedidoNumero: 'PED-100', cliente: { ruc: '20123456789', razonSocial: 'Botica Salud SAC', ubigeo: '150101' }, lineas: [{ productoId: 'p1', cantidad: 50, loteId: 'l2' }] })
    const ok = await screen.findByTestId('orden-creada')
    expect(ok).toHaveTextContent('OS-2026-00042')
    expect(ok).toHaveTextContent('Sigue:')
    expect(ok).toHaveTextContent('Lo hace: Jefe de Transporte')
    expect(within(ok).getByTestId('abrir-orden-creada')).toHaveAttribute('href', '/salidas/o1')
  })

  it('sin stock suficiente lo dice en la línea y la orden se puede crear igual', async () => {
    acc.lotesParaSalidaAccion.mockImplementationOnce(async () => [{ loteId: 'l1', codigo: 'L-VIEJO', productoId: 'p1', propietarioId: 'logissa', propietario: 'Logissa', vence: '2027-03-31', disponibleAprobado: 5, enBajas: 0, enReserva: false }])
    render(<FormOrdenManual {...props} />)
    await userEvent.click(screen.getByTestId('clase-A'))
    await elegirProducto()
    fireEvent.change(screen.getByTestId('cantidad-linea-orden'), { target: { value: '50' } })
    expect(await screen.findByTestId('sin-stock-linea')).toHaveTextContent('Stock insuficiente')
    expect(screen.getByTestId('sin-stock-linea')).toHaveTextContent('decide el vendedor del pedido')
  })
})

describe('tipo B: cliente de almacenamiento, GRE y validación inmediata por línea', () => {
  async function prepararB() {
    render(<FormOrdenManual {...props} />)
    await userEvent.click(screen.getByTestId('clase-B'))
    expect(screen.getByText(/Elige primero el cliente de almacenamiento/)).toBeInTheDocument() // sin cliente no hay tabla
    await userEvent.selectOptions(screen.getByTestId('propietario-orden'), 'diph')
  }

  it('solo ofrece clientes de almacenamiento y pide el PDF de la GRE', async () => {
    await prepararB()
    const opciones = within(screen.getByTestId('propietario-orden')).getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toEqual(['Elige el cliente', 'Diphasac', 'AJR Labs'])
    const input = screen.getByTestId('gre-archivo') as HTMLInputElement
    await userEvent.upload(input, new File(['%PDF'], 'gre-cliente.pdf', { type: 'application/pdf' }))
    expect(await screen.findByTestId('gre-adjunta')).toHaveTextContent('gre.pdf')
  })

  it('cada línea se valida al instante: el lote de otro propietario muestra el mensaje y, cuando sirve, completa el vencimiento', async () => {
    await prepararB()
    acc.validarLineaConLoteAccion.mockImplementation(async () => ({ ok: false, campo: 'lote', mensaje: 'El lote L-9 no es de este propietario' }))
    await elegirProducto()
    await userEvent.type(screen.getByTestId('lote-linea-orden'), 'L-9')
    fireEvent.change(screen.getByTestId('cantidad-linea-orden'), { target: { value: '5' } })
    await userEvent.selectOptions(screen.getByTestId('motivo-linea-orden'), 'VENTA')
    const mal = await screen.findByText('El lote L-9 no es de este propietario')
    expect(mal.closest('[data-testid="validacion-linea"]')).toHaveAttribute('data-estado', 'error')
    expect(acc.validarLineaConLoteAccion).toHaveBeenLastCalledWith(expect.objectContaining({ propietarioId: 'diph', productoId: 'p1', loteCodigo: 'L-9', cantidad: 5, motivo: 'VENTA' }))
    acc.validarLineaConLoteAccion.mockImplementation(async () => ({ ok: true, lote: { loteId: 'lx', codigo: 'L-10' }, vence: '2028-06-30' }))
    await userEvent.clear(screen.getByTestId('lote-linea-orden'))
    await userEvent.type(screen.getByTestId('lote-linea-orden'), 'L-10')
    await waitFor(() => expect(screen.getByTestId('validacion-linea')).toHaveAttribute('data-estado', 'ok'))
    expect(screen.getByTestId('vence-linea-orden')).toHaveTextContent('06/2028')
  })

  it('no deja crear con una línea inválida y, con todo bien, envía el motivo y el lote de cada línea con la GRE', async () => {
    await prepararB()
    acc.validarLineaConLoteAccion.mockImplementation(async () => ({ ok: false, campo: 'cantidad', mensaje: 'No hay en el lote L-1 con 99 unidades disponibles (hay 5)' }))
    await userEvent.type(screen.getByTestId('gre-numero'), 'T001-00001234')
    await userEvent.upload(screen.getByTestId('gre-archivo'), new File(['%PDF'], 'gre.pdf', { type: 'application/pdf' }))
    await screen.findByTestId('gre-adjunta')
    await elegirProducto()
    await userEvent.type(screen.getByTestId('lote-linea-orden'), 'L-1')
    fireEvent.change(screen.getByTestId('cantidad-linea-orden'), { target: { value: '99' } })
    await userEvent.selectOptions(screen.getByTestId('motivo-linea-orden'), 'VENTA')
    await screen.findByText(/hay 5/)
    await userEvent.click(screen.getByTestId('crear-orden-manual'))
    expect(await screen.findByTestId('error-lineas-orden')).toHaveTextContent('Corrige o completa las líneas marcadas')
    expect(acc.crearOrdenManualAccion).not.toHaveBeenCalled()
    acc.validarLineaConLoteAccion.mockImplementation(async () => ({ ok: true, lote: { loteId: 'lx', codigo: 'L-1' }, vence: '2028-06-30' }))
    fireEvent.change(screen.getByTestId('cantidad-linea-orden'), { target: { value: '4' } })
    await waitFor(() => expect(screen.getByTestId('validacion-linea')).toHaveAttribute('data-estado', 'ok'))
    await userEvent.click(screen.getByTestId('crear-orden-manual'))
    await waitFor(() => expect(acc.crearOrdenManualAccion).toHaveBeenCalledTimes(1))
    expect(acc.crearOrdenManualAccion.mock.calls[0][0]).toMatchObject({ clase: 'B', propietarioId: 'diph', greNumero: 'T001-00001234', greArchivo: 'gre-cliente/x.pdf', lineas: [{ productoId: 'p1', cantidad: 4, loteId: 'lx', motivo: 'VENTA' }] })
  })

  it('el formulario se puede reutilizar con el propietario fijo (B3): no se elige a quién', async () => {
    render(<FormOrdenManual {...props} clasesPermitidas={['B']} propietarioFijo="diph" />)
    const sel = screen.getByTestId('propietario-orden') as HTMLSelectElement
    expect(sel).toBeDisabled()
    expect(sel.value).toBe('diph')
    expect(screen.getByTestId('lineas-orden')).toBeInTheDocument()
  })
})

describe('la orden creada y los errores', () => {
  it('una guía con motivos mezclados dice cuántas órdenes se crearon', async () => {
    acc.crearOrdenManualAccion.mockImplementation(async () => ({ ok: true, ordenes: [{ id: 'o1', numero: 'OS-2026-00050', motivo: 'VENTA' }, { id: 'o2', numero: 'OS-2026-00051', motivo: 'DESTRUCCION' }] }))
    render(<FormOrdenManual {...props} clasesPermitidas={['C']} motivosCPermitidos={['MUESTRA']} />)
    await userEvent.click(screen.getByTestId('motivo-C-MUESTRA'))
    await elegirProducto()
    fireEvent.change(screen.getByTestId('cantidad-linea-orden'), { target: { value: '2' } })
    await screen.findByTestId('propuesta-fefo')
    await userEvent.click(screen.getByTestId('crear-orden-manual'))
    expect(await screen.findByTestId('orden-creada')).toHaveTextContent('se crearon 2 órdenes')
    const filas = screen.getAllByTestId('orden-creada-fila')
    expect(filas[1]).toHaveTextContent('Destrucción')
    expect(filas[1]).toHaveTextContent('Bajas')
  })

  it('un error de la base de datos se muestra con sus palabras', async () => {
    acc.crearOrdenManualAccion.mockImplementation(async () => ({ ok: false, mensaje: 'Solo quien autoriza salidas sin venta registra una muestra' }))
    render(<FormOrdenManual {...props} clasesPermitidas={['C']} motivosCPermitidos={['MUESTRA']} />)
    await userEvent.click(screen.getByTestId('motivo-C-MUESTRA'))
    await elegirProducto()
    fireEvent.change(screen.getByTestId('cantidad-linea-orden'), { target: { value: '2' } })
    await screen.findByTestId('propuesta-fefo')
    await userEvent.click(screen.getByTestId('crear-orden-manual'))
    expect(await screen.findByTestId('error-crear-orden')).toHaveTextContent('Solo quien autoriza salidas sin venta registra una muestra')
  })
})
