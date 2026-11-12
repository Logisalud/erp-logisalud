// @vitest-environment jsdom
// «Así la ve el transportista» (0063): el Jefe de Transporte revisa la ruta como le aparece al conductor y ve qué le falta a cada parada.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VistaTransportista } from '@/components/rutas/vista-transportista'
import { faltantesDeParada, type RutaMia } from '@/domain/mis-rutas'

const parada = (n: number, extra: Partial<RutaMia['paradas'][number]> = {}): RutaMia['paradas'][number] => ({
  id: `p${n}`, secuencia: n, cliente: `Cliente ${n}`, direccion: `Av. Prueba ${n}`, distrito: 'SJL', ventanaCita: '8AM A 12PM', pedidoNumero: `PED-${n}`, unidades: 10, eventos: [], estado: 'PENDIENTE',
  telefono: '995021257', condicion: 'DESPACHO', guia: 'TTT1-00000012', representante: 'Cintya Vilchez', formaPago: 'CREDITO', ...extra,
})
const ruta = (paradas: RutaMia['paradas']): RutaMia => ({ id: 'r1', numero: 'RUT-1', fecha: '2026-11-12', estado: 'PLANIFICADA', vehiculo: 'ABC-123', conductor: 'Hans', paradas, puedeMarcar: false })

describe('así la ve el transportista', () => {
  it('lista qué le falta a cada parada y cuenta las incompletas', () => {
    expect(faltantesDeParada(parada(1))).toEqual([])
    expect(faltantesDeParada(parada(2, { telefono: undefined, guia: undefined }))).toEqual(['el teléfono del cliente', 'la guía'])
    render(<VistaTransportista ruta={ruta([parada(1), parada(2, { telefono: undefined, guia: undefined })])} />)
    expect(screen.getByTestId('vt-faltan')).toHaveTextContent('1 parada tiene datos por completar')
    const [uno, dos] = screen.getAllByTestId('vt-parada')
    expect(within(uno).queryByTestId('vt-falta')).toBeNull()
    expect(within(dos).getByTestId('vt-falta')).toHaveTextContent('Falta el teléfono del cliente, la guía.')
  })
  it('con todo completo lo dice, y es solo lectura (no hay botones para marcar)', () => {
    render(<VistaTransportista ruta={ruta([parada(1)])} />)
    expect(screen.getByTestId('vt-completa')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
