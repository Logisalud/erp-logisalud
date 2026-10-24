// @vitest-environment jsdom
// SB-B: la muestra a un trabajador (DNI), el aviso de la devolución con poco plazo (pide motivo, no bloquea), «Copiar correo al proveedor» y «Numeración de guías».
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const acc = vi.hoisted(() => ({
  buscarProductosSalidaAccion: vi.fn(async (..._a: unknown[]) => [{ id: 'p1', codigo: 'DEMO-001', descripcion: 'Dapagliflozina 10 mg', presentacion: 'Caja x 30', coincidencia: 'nombre' }] as unknown[]),
  lotesParaSalidaAccion: vi.fn(async (..._a: unknown[]) => [] as unknown[]),
  validarLineaConLoteAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, lote: { loteId: 'lx', codigo: 'L-1' }, vence: '2026-12-01', aviso: 'Al lote le faltan 39 días para vencer y el proveedor pide al menos 90 días (3 meses). Puedes continuar si escribes el motivo.' }) as unknown),
  ordenDelPedidoAccion: vi.fn(async (..._a: unknown[]) => null as unknown),
  subirGreClienteAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, ref: 'x', nombre: 'x.pdf' })),
  crearOrdenManualAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, ordenes: [{ id: 'o1', numero: 'OS-2026-00042' }] }) as unknown),
}))
vi.mock('@/app/acciones-salida-manual', () => acc)
const num = vi.hoisted(() => ({
  confirmarCorrelativoGuiaAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const }) as unknown),
  corregirCorrelativoGuiaAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const }) as unknown),
  probarConexionNubefactAccion: vi.fn(async () => ({ ok: true, modo: 'PRUEBA', mensaje: 'Nubefact respondió y aceptó el token.' })),
}))
vi.mock('@/app/acciones-picking', () => num)
import { FormOrdenManual } from '@/components/salidas/form-orden-manual'
import { CorreoProveedor } from '@/components/salidas/correo-proveedor'
import { NumeracionGuias } from '@/components/salidas/numeracion-guias'
import type { SalidaVista } from '@/domain/despacho'

const propietarios = [{ id: 'logissa', razonSocial: 'Logissa', esDuenoAlmacen: true }]
const props = { clasesPermitidas: ['C'] as ('A' | 'B' | 'C')[], motivosCPermitidos: ['MUESTRA', 'DEVOLUCION_PROVEEDOR'] as ('MUESTRA' | 'DEVOLUCION_PROVEEDOR')[], propietarios, hoy: '2026-10-23' }
beforeEach(() => { Object.values(acc).forEach((f) => f.mockClear()); Object.values(num).forEach((f) => f.mockClear()) })

async function elegirProducto() {
  const fila = screen.getAllByTestId('fila-linea-orden')[0]
  await userEvent.type(within(fila).getByTestId('buscar-producto-salida'), 'dapa')
  await userEvent.click(await within(fila).findByTestId('opcion-producto-salida'))
}

describe('muestra a nombre de un trabajador', () => {
  it('con «Un trabajador (DNI)» pide 8 números y envía el tipo de documento', async () => {
    render(<FormOrdenManual {...props} />)
    await userEvent.click(screen.getByTestId('motivo-C-MUESTRA'))
    expect(screen.getByLabelText('RUC (11 números)')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('recibe-DNI'))
    expect(screen.getByLabelText('DNI (8 números)')).toHaveAttribute('maxlength', '8')
    expect(screen.getByLabelText('Nombre y apellidos del trabajador')).toBeInTheDocument()
    await userEvent.type(screen.getByTestId('dest-razon-social'), 'Pedro Quispe Mamani')
    await userEvent.type(screen.getByTestId('dest-ruc'), '4012345')
    await userEvent.type(screen.getByTestId('dest-direccion'), 'Jr. Pinos 12')
    await userEvent.type(screen.getByTestId('dest-ubigeo'), '150101')
    await elegirProducto()
    fireEvent.change(screen.getByTestId('cantidad-linea-orden'), { target: { value: '2' } })
    await userEvent.click(screen.getByTestId('crear-orden-manual'))
    expect(await screen.findByTestId('error-dest-ruc')).toHaveTextContent('El DNI tiene 8 números')
    expect(acc.crearOrdenManualAccion).not.toHaveBeenCalled()
    await userEvent.type(screen.getByTestId('dest-ruc'), '6')
    await userEvent.click(screen.getByTestId('crear-orden-manual'))
    await waitFor(() => expect(acc.crearOrdenManualAccion).toHaveBeenCalledTimes(1))
    expect(acc.crearOrdenManualAccion.mock.calls[0][0]).toMatchObject({ clase: 'C', motivo: 'MUESTRA', cliente: { ruc: '40123456', tipoDocumento: 'DNI' } })
  })
})

describe('devolución al proveedor con poco plazo', () => {
  async function prepararDevolucion() {
    render(<FormOrdenManual {...props} />)
    await userEvent.click(screen.getByTestId('motivo-C-DEVOLUCION_PROVEEDOR'))
    await userEvent.type(screen.getByTestId('dest-razon-social'), 'Biosana SAC')
    await userEvent.type(screen.getByTestId('dest-ruc'), '20100070970')
    await userEvent.type(screen.getByTestId('dest-direccion'), 'Av. Industrial 450')
    await userEvent.type(screen.getByTestId('dest-ubigeo'), '150119')
    await elegirProducto()
    await userEvent.type(screen.getByTestId('lote-linea-orden'), 'L-1')
    fireEvent.change(screen.getByTestId('cantidad-linea-orden'), { target: { value: '5' } })
    await screen.findByTestId('aviso-devolucion')
  }
  it('avisa (no bloquea): muestra el aviso, pide el motivo y no crea hasta tenerlo', async () => {
    await prepararDevolucion()
    expect(screen.getByTestId('validacion-linea')).toHaveAttribute('data-estado', 'aviso')
    expect(screen.getByTestId('validacion-linea')).toHaveTextContent('le faltan 39 días')
    await userEvent.click(screen.getByTestId('crear-orden-manual'))
    expect(await screen.findByTestId('error-aviso-motivo')).toHaveTextContent('Escribe el motivo para continuar con la devolución.')
    expect(acc.crearOrdenManualAccion).not.toHaveBeenCalled()
    await userEvent.type(screen.getByTestId('aviso-motivo'), 'El proveedor aceptó recibirlo')
    await userEvent.click(screen.getByTestId('crear-orden-manual'))
    await waitFor(() => expect(acc.crearOrdenManualAccion).toHaveBeenCalledTimes(1))
    expect(acc.crearOrdenManualAccion.mock.calls[0][0]).toMatchObject({ clase: 'C', motivo: 'DEVOLUCION_PROVEEDOR', avisoMotivo: 'El proveedor aceptó recibirlo' })
  })
  it('sin aviso (lote con tiempo de sobra) no pide motivo', async () => {
    acc.validarLineaConLoteAccion.mockImplementationOnce(async () => ({ ok: true, lote: { loteId: 'lx', codigo: 'L-1' }, vence: '2027-12-01' }))
    render(<FormOrdenManual {...props} />)
    await userEvent.click(screen.getByTestId('motivo-C-DEVOLUCION_PROVEEDOR'))
    await elegirProducto()
    await userEvent.type(screen.getByTestId('lote-linea-orden'), 'L-1')
    fireEvent.change(screen.getByTestId('cantidad-linea-orden'), { target: { value: '5' } })
    await waitFor(() => expect(screen.getByTestId('validacion-linea')).toHaveAttribute('data-estado', 'ok'))
    expect(screen.queryByTestId('aviso-devolucion')).toBeNull()
  })
})

const salida = {
  numero: 'OS-2026-00031', tipo: 'PROVEEDOR', devolucionAvisoMotivo: 'El proveedor aceptó recibirlo',
  clienteManual: { ruc: '20100070970', razonSocial: 'Biosana SAC', direccion: 'x', ubigeo: '150119' },
  lineasDetalle: [{ id: 'l1', producto: 'Paracetamol 500 mg', productoCodigo: 'P-1001', cantidad: 20, estado: 'ASIGNADA', asignacion: [{ loteId: 'a', lote: 'L-24A', vence: '2026-12-31', cantidad: 20, ubicaciones: [] }] }],
} as unknown as SalidaVista

describe('«Copiar correo al proveedor»', () => {
  it('muestra el correo con producto, lote, vencimiento y cantidad, el motivo del aviso y copia al portapapeles', async () => {
    const escribir = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escribir }, configurable: true })
    render(<CorreoProveedor salida={salida} />)
    const texto = screen.getByTestId('correo-proveedor-texto')
    expect(texto).toHaveTextContent('Paracetamol 500 mg (P-1001) · lote L-24A · vence 31/12/2026 · 20 unidades')
    expect(texto).toHaveTextContent('Estimados Biosana SAC')
    expect(screen.getByTestId('devolucion-aviso-motivo')).toHaveTextContent('El proveedor aceptó recibirlo')
    await userEvent.click(screen.getByTestId('copiar-correo-proveedor'))
    await waitFor(() => expect(escribir).toHaveBeenCalledWith(expect.stringContaining('Asunto: Devolución de producto · Orden OS-2026-00031')))
    expect(screen.getByTestId('copiar-correo-proveedor')).toHaveTextContent('Copiado')
    expect(screen.getByTestId('copiar-correo-proveedor-estado')).toHaveTextContent('pégalo en tu correo')
  })
  it('sin lotes asignados dice qué falta en vez de un correo vacío', () => {
    render(<CorreoProveedor salida={{ ...salida, lineasDetalle: [] } as unknown as SalidaVista} />)
    expect(screen.getByTestId('correo-proveedor-vacio')).toBeInTheDocument()
    expect(screen.queryByTestId('copiar-correo-proveedor')).toBeNull()
  })
})

describe('«Numeración de guías»', () => {
  const estado = { serie: 'TTT1', ultimo: 2887, confirmado: false, proximo: 2888 }
  it('sin confirmar: dice que no se emite una guía real, deja confirmar el primer número y valida lo escrito', async () => {
    render(<NumeracionGuias estado={estado} modo="SIMULADOR" roles={['jefe_transporte']} />)
    expect(screen.getByTestId('correlativo-estado')).toHaveTextContent('Falta confirmar el correlativo inicial')
    expect(screen.getByTestId('numeracion-bloqueo')).toHaveTextContent('Una guía real no sale')
    expect(screen.getByTestId('numeracion-proximo')).toHaveTextContent('TTT1-00002888')
    expect(screen.getByTestId('regla-panel')).toHaveTextContent('el panel de Nubefact solo se usa para dar de baja')
    expect(screen.getByTestId('conexion-destino')).toHaveTextContent('Simulador')   // D-210: siempre dice a qué está conectada
    expect(screen.getByTestId('conexion-destino')).not.toHaveTextContent('Nubefact')
    expect(screen.getByTestId('confirmar-correlativo')).toBeDisabled()
    await userEvent.type(screen.getByTestId('correlativo-inicial'), '0')
    expect(await screen.findByTestId('error-correlativo-inicial')).toHaveTextContent('entero de 1 a 99 999 999')
    await userEvent.clear(screen.getByTestId('correlativo-inicial'))
    await userEvent.type(screen.getByTestId('correlativo-inicial'), '2888')
    await userEvent.click(screen.getByTestId('confirmar-correlativo'))
    await waitFor(() => expect(num.confirmarCorrelativoGuiaAccion).toHaveBeenCalledWith('TTT1', 2888, ''))
    expect(await screen.findByTestId('numeracion-mensaje')).toHaveTextContent('la primera guía real será la TTT1-00002888')
  })
  it('quien no administra la numeración la ve pero no puede cambiarla', () => {
    render(<NumeracionGuias estado={estado} modo="SIMULADOR" roles={['auxiliar']} />)
    expect(screen.getByTestId('numeracion-guias')).toBeInTheDocument()
    expect(screen.queryByTestId('form-confirmar-correlativo')).toBeNull()
  })
  it('confirmada: se puede corregir con un motivo; con Nubefact real aparece «Probar conexión» y su resultado sin valores', async () => {
    render(<NumeracionGuias estado={{ serie: 'TTT1', ultimo: 2900, confirmado: true, proximo: 2901, enCurso: { numero: 2901, salidaNumero: 'OS-2026-00005', incierta: true } }} modo="PRUEBA" roles={['admin_wms']} />)
    expect(screen.getByTestId('correlativo-estado')).toHaveTextContent('Correlativo confirmado')
    expect(screen.getByTestId('numeracion-en-curso')).toHaveTextContent('TTT1-00002901 (OS-2026-00005)')
    expect(screen.queryByTestId('form-confirmar-correlativo')).toBeNull()
    await userEvent.click(within(screen.getByTestId('corregir-correlativo')).getByText(/si Nubefact dice que se saltó/))
    expect(screen.getByTestId('corregir-correlativo-boton')).toBeDisabled()
    await userEvent.type(screen.getByTestId('correlativo-ultimo'), '2905')
    await userEvent.type(screen.getByTestId('correlativo-motivo'), 'Alguien emitió desde el panel')
    await userEvent.click(screen.getByTestId('corregir-correlativo-boton'))
    await waitFor(() => expect(num.corregirCorrelativoGuiaAccion).toHaveBeenCalledWith('TTT1', 2905, 'Alguien emitió desde el panel'))
    expect(screen.getByTestId('conexion-destino')).toHaveTextContent('Nubefact (modo prueba)')
    expect(screen.getByTestId('numeracion-entorno')).toHaveTextContent('Nubefact (modo prueba)')
    await userEvent.click(screen.getByTestId('probar-conexion-boton'))
    expect(await screen.findByTestId('probar-conexion-resultado')).toHaveTextContent('Nubefact respondió y aceptó el token.')
  })
})
