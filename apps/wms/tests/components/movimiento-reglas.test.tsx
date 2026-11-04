// @vitest-environment jsdom
// Piloto · errores de la demo (E-1 y E-2) en la pantalla de Mover: con «Salida de Cuarentena» el origen es solo de Cuarentena, y el destino nunca ofrece
// ubicaciones de otro propietario.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const acc = vi.hoisted(() => ({
  buscarProductoAccion: vi.fn(async () => []),
  opcionesDestinoAccion: vi.fn(async (..._a: unknown[]) => [{ posicionId: 'p1', codigo: 'A-10.1', area: 'Aprobados', nota: 'Logissa' }] as unknown[]),
}))
vi.mock('@/app/acciones-inventario', () => acc)
import { ListaDestinos, ListaOrigenes } from '@/components/inventario/tabla/selectores'
import { celdasParaMotivo } from '@/domain/regla-motivo'
import type { CeldaDeProducto } from '@/domain/inventario'

const celda = (posicion: string, tipoArea: 'CUARENTENA' | 'APROBADOS'): CeldaDeProducto => ({
  clave: `${posicion}|l|APROBADO|pr`, posicionId: posicion, posicion, area: tipoArea === 'CUARENTENA' ? 'Cuarentena' : 'Aprobados', tipoArea, loteId: 'l', productoId: 'x', codigoProducto: 'X', producto: 'Producto',
  lote: 'L-1', vence: '2028-01-01', propietarioId: 'logissa', propietario: 'LOGISSA', estado: 'APROBADO', procedenciaId: 'pr', cantidad: 10, disponible: 10,
})
const todas = [celda('A-6', 'CUARENTENA'), celda('A-10.1', 'APROBADOS')]

describe('Mover · origen según el motivo', () => {
  it('con «Salida de Cuarentena» solo se ofrecen las ubicaciones de Cuarentena', () => {
    const celdas = celdasParaMotivo(todas, 'Salida de Cuarentena')
    render(<ListaOrigenes celdas={celdas} hayOtras={celdas.length < todas.length} libreDe={(c) => c.disponible} alElegir={() => {}} />)
    const filas = screen.getAllByTestId('opcion-origen')
    expect(filas).toHaveLength(1)
    expect(filas[0]).toHaveTextContent('A-6')
  })
  it('con otro motivo se ofrecen todas', () => {
    render(<ListaOrigenes celdas={celdasParaMotivo(todas, 'Reorganización')} libreDe={(c) => c.disponible} alElegir={() => {}} />)
    expect(screen.getAllByTestId('opcion-origen')).toHaveLength(2)
  })
  it('si el producto no tiene nada en Cuarentena, lo dice y pide cambiar el motivo', () => {
    const celdas = celdasParaMotivo([todas[1]], 'Salida de Cuarentena')
    render(<ListaOrigenes celdas={celdas} hayOtras libreDe={(c) => c.disponible} alElegir={() => {}} />)
    expect(screen.getByTestId('sin-origenes-motivo')).toHaveTextContent('Cambia el motivo')
  })
})

describe('Mover · destino', () => {
  const linea = { clave: '1', posicionId: 'A-6', propietarioId: 'logissa', propietario: 'LOGISSA', estado: 'APROBADO' as const, motivo: 'Salida de Cuarentena' }
  it('le pide al servidor los destinos con el motivo de la línea y muestra solo lo que devuelve', async () => {
    render(<ListaDestinos linea={linea} alElegir={() => {}} />)
    expect(await screen.findByText('A-10.1')).toBeInTheDocument()
    expect(acc.opcionesDestinoAccion).toHaveBeenCalledWith('', expect.objectContaining({ motivo: 'Salida de Cuarentena', propietarioId: 'logissa' }))
  })
  it('al buscar un código que es de otro propietario no aparece y la pantalla explica por qué', async () => {
    acc.opcionesDestinoAccion.mockImplementation(async (q: unknown) => (q === '' ? [{ posicionId: 'p1', codigo: 'A-10.1', area: 'Aprobados', nota: 'Logissa' }] : []) as unknown[])
    render(<ListaDestinos linea={linea} alElegir={() => {}} />)
    await userEvent.type(screen.getByTestId('destino-buscar'), 'J-1')
    expect(await screen.findByTestId('destino-sin-resultados')).toHaveTextContent('Solo se muestran las de LOGISSA y las áreas compartidas')
  })
})
