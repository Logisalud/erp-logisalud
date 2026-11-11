// @vitest-environment jsdom
// Fase 4 · P4: «Mis rutas» en el celular: vacío, error, lista, «PILOTO, no reemplaza el proceso actual», botones grandes por parada y el resultado de cada marca.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const refrescar = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refrescar, push: () => {} }) }))
const acc = vi.hoisted(() => ({ registrarEventoParadaAccion: vi.fn() }))
vi.mock('@/app/acciones-mis-rutas', () => acc)
import { MisRutas } from '@/components/mis-rutas/mis-rutas'
import type { ParadaMia, RutaMia } from '@/domain/mis-rutas'

const parada = (n: number, p: Partial<ParadaMia> = {}): ParadaMia => ({ id: `p${n}`, secuencia: n, cliente: `Botica ${n} SAC`, direccion: `Av. Prueba ${n}`, distrito: 'Lima', pedidoNumero: `PED-${n}`, unidades: 30, eventos: [], estado: 'PENDIENTE', ...p })
const ruta = (p: Partial<RutaMia> = {}): RutaMia => ({ id: 'r1', numero: 'RUT-2026-00001', fecha: '2026-11-05', estado: 'EN_RUTA', vehiculo: 'ABC-123', conductor: 'Luis Quispe', auxiliar: 'Ana Ríos', paradas: [parada(1), parada(2)], puedeMarcar: true, ...p })
beforeEach(() => { acc.registrarEventoParadaAccion.mockReset(); refrescar.mockReset(); acc.registrarEventoParadaAccion.mockResolvedValue({ ok: true, retornoPorOriginar: false, rutaPendienteDeCierre: false }) })

describe('Mis rutas (celular)', () => {
  it('siempre dice «PILOTO, no reemplaza el proceso actual»', () => {
    render(<MisRutas rutas={[ruta()]} />)
    expect(screen.getByTestId('mis-rutas-piloto')).toHaveTextContent('PILOTO, no reemplaza el proceso actual')
    expect(screen.getByTestId('mis-rutas-piloto')).toHaveTextContent('papel')
  })
  it('vacío: dice que hoy no hay rutas y qué hacer', () => {
    render(<MisRutas rutas={[]} />)
    expect(screen.getByTestId('mis-rutas-vacio')).toHaveTextContent('Hoy no tienes rutas')
    expect(screen.getByTestId('mis-rutas-piloto')).toBeInTheDocument()
  })
  it('error: lo dice y deja volver a intentar', async () => {
    render(<MisRutas rutas={[]} error="Sin conexión con la base" />)
    expect(screen.getByTestId('mis-rutas-error')).toHaveTextContent('Sin conexión con la base')
    await userEvent.click(screen.getByTestId('mis-rutas-reintentar'))
    expect(refrescar).toHaveBeenCalled()
  })
  it('lista: la ruta con su estado y cada parada con su estado en texto e ícono; los botones son los que corresponden', () => {
    render(<MisRutas rutas={[ruta({ paradas: [parada(1), parada(2, { estado: 'LLEGUE', eventos: [{ id: 'e', evento: 'LLEGUE', hora: '2026-11-05T15:00:00Z' }] })] })]} />)
    expect(screen.getByTestId('mi-ruta-estado')).toHaveTextContent('En ruta')
    const [a, b] = screen.getAllByTestId('mi-parada')
    expect(a).toHaveTextContent('Por visitar'); expect(a.querySelector('[data-testid="parada-LLEGUE"]')).not.toBeNull(); expect(a.querySelector('[data-testid="parada-ENTREGADO"]')).toBeNull()
    expect(b).toHaveTextContent('Llegué'); expect(b.querySelector('[data-testid="parada-ENTREGADO"]')).not.toBeNull(); expect(b.querySelector('[data-testid="parada-RECHAZADO"]')).not.toBeNull()
    expect(b.querySelector('svg')).not.toBeNull()
  })
  it('una ruta que todavía no sale no ofrece botones y lo explica', () => {
    render(<MisRutas rutas={[ruta({ estado: 'LIBERADA', puedeMarcar: false })]} />)
    expect(screen.queryByTestId('parada-LLEGUE')).toBeNull()
    expect(screen.getAllByTestId('parada-aun-no')).toHaveLength(2)
  })
  it('«Llegué» se guarda de una vez y confirma', async () => {
    render(<MisRutas rutas={[ruta()]} />)
    await userEvent.click(screen.getAllByTestId('parada-LLEGUE')[0])
    await waitFor(() => expect(acc.registrarEventoParadaAccion).toHaveBeenCalledTimes(1))
    const f = acc.registrarEventoParadaAccion.mock.calls[0][0] as FormData
    expect(f.get('paradaId')).toBe('p1'); expect(f.get('evento')).toBe('LLEGUE')
    await waitFor(() => expect(screen.getByTestId('parada-exito')).toHaveTextContent('llegaste'))
    expect(refrescar).toHaveBeenCalled()
  })
  it('«Entregado» pide nombre, DNI y foto; si la base dice que falta algo, se ve junto al campo; si todo va bien, confirma', async () => {
    acc.registrarEventoParadaAccion.mockResolvedValueOnce({ ok: false, mensaje: 'El DNI de quien recibió tiene 8 números', errores: { recibioDocumento: 'El DNI de quien recibió tiene 8 números' } })
    render(<MisRutas rutas={[ruta({ paradas: [parada(1, { estado: 'LLEGUE' })] })]} />)
    await userEvent.click(screen.getByTestId('parada-ENTREGADO'))
    expect(screen.getByTestId('recibio-nombre')).toBeInTheDocument(); expect(screen.getByTestId('recibio-dni')).toBeInTheDocument(); expect(screen.getByTestId('foto-entrega')).toHaveAttribute('capture', 'environment')
    await userEvent.type(screen.getByTestId('recibio-nombre'), 'María Pérez')
    await userEvent.type(screen.getByTestId('recibio-dni'), '123')
    await userEvent.click(screen.getByTestId('parada-confirmar'))
    await waitFor(() => expect(screen.getByTestId('parada-error')).toHaveTextContent('8 números'))
    await userEvent.clear(screen.getByTestId('recibio-dni')); await userEvent.type(screen.getByTestId('recibio-dni'), '12345678')
    await userEvent.upload(screen.getByTestId('foto-entrega'), new File([new Uint8Array(10)], 'foto.jpg', { type: 'image/jpeg' }))
    await userEvent.click(screen.getByTestId('parada-confirmar'))
    await waitFor(() => expect(screen.getByTestId('parada-exito')).toHaveTextContent('Entrega registrada con su foto'))
    const f = acc.registrarEventoParadaAccion.mock.calls[1][0] as FormData
    expect(f.get('recibioNombre')).toBe('María Pérez'); expect(f.get('recibioDocumento')).toBe('12345678'); expect(f.get('foto')).toBeTruthy()
  })
  it('«Entregado»: la conformidad del cliente viene en «Sí»; con «No» pide qué no coincidió y lo manda con la entrega', async () => {
    render(<MisRutas rutas={[ruta({ paradas: [parada(1, { estado: 'LLEGUE' })] })]} />)
    await userEvent.click(screen.getByTestId('parada-ENTREGADO'))
    expect(screen.getByTestId('conforme-si')).toBeChecked(); expect(screen.queryByTestId('tipo-diferencia')).toBeNull()
    await userEvent.click(screen.getByTestId('conforme-no'))
    expect(screen.getByTestId('tipo-diferencia')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByTestId('tipo-diferencia'), 'LOTE')
    await userEvent.type(screen.getByTestId('detalle-diferencia'), 'Llegó otro lote')
    await userEvent.type(screen.getByTestId('recibio-nombre'), 'María Pérez'); await userEvent.type(screen.getByTestId('recibio-dni'), '12345678')
    await userEvent.upload(screen.getByTestId('foto-entrega'), new File([new Uint8Array(10)], 'foto.jpg', { type: 'image/jpeg' }))
    await userEvent.click(screen.getByTestId('parada-confirmar'))
    await waitFor(() => expect(acc.registrarEventoParadaAccion).toHaveBeenCalled())
    const f = acc.registrarEventoParadaAccion.mock.calls[0][0] as FormData
    expect(f.get('conforme')).toBe('NO'); expect(f.get('tipoDiferencia')).toBe('LOTE'); expect(f.get('detalleDiferencia')).toBe('Llegó otro lote')
  })
  it('«Rechazado» y «No entregado» piden el motivo y avisan que el Jefe de Transporte registra el retorno', async () => {
    acc.registrarEventoParadaAccion.mockResolvedValueOnce({ ok: true, retornoPorOriginar: true, rutaPendienteDeCierre: false })
    render(<MisRutas rutas={[ruta({ paradas: [parada(1, { estado: 'LLEGUE' })] })]} />)
    await userEvent.click(screen.getByTestId('parada-RECHAZADO'))
    expect(screen.getByTestId('form-RECHAZADO')).toHaveTextContent('Jefe de Transporte')
    await userEvent.type(screen.getByTestId('motivo-parada'), 'El cliente no aceptó el pedido')
    await userEvent.click(screen.getByTestId('parada-confirmar'))
    await waitFor(() => expect(screen.getByTestId('parada-exito')).toHaveTextContent('Jefe de Transporte'))
    expect((acc.registrarEventoParadaAccion.mock.calls[0][0] as FormData).get('motivo')).toBe('El cliente no aceptó el pedido')
  })
  it('si la acción se cae (sin señal) se dice y no se pierde lo escrito', async () => {
    acc.registrarEventoParadaAccion.mockRejectedValueOnce(new Error('red'))
    render(<MisRutas rutas={[ruta({ paradas: [parada(1)] })]} />)
    await userEvent.click(screen.getByTestId('parada-INCIDENCIA'))
    await userEvent.type(screen.getByTestId('motivo-parada'), 'Tráfico en la avenida')
    await userEvent.click(screen.getByTestId('parada-confirmar'))
    await waitFor(() => expect(screen.getByTestId('parada-error')).toHaveTextContent('señal'))
    expect(screen.getByTestId('motivo-parada')).toHaveValue('Tráfico en la avenida')
  })
  it('mobile-first por código (390×844): una columna, botones de 56 px y ningún ancho fijo mayor que el celular', () => {
    const fuente = readFileSync(resolve(__dirname, '../../components/mis-rutas/mis-rutas.tsx'), 'utf8')
    expect(fuente).toContain('max-w-xl'); expect(fuente).toContain('!min-h-14'); expect(fuente).toContain('grid-cols-2')
    const anchos = [...fuente.matchAll(/(?:min-w|w)-\[(\d+)px\]/g)].map((m) => Number(m[1]))
    expect(anchos.filter((n) => n > 390)).toEqual([])
    expect(fuente).not.toMatch(/<table/)
  })
})
