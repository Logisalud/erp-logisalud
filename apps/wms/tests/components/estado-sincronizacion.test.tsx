// @vitest-environment jsdom
// Fase 4 · P6: lo que se ve de la sincronización con Compras: la hora de la última, el resumen y el error en palabras llanas.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EstadoSincronizacion } from '@/components/entradas/estado-sincronizacion'
import { TEXTO_ERROR_SINCRONIZACION } from '@/domain/oc-versiones'

const ahora = new Date('2026-11-07T15:00:00Z')
describe('estado de la sincronización', () => {
  it('«Última sincronización con Compras: hace X min»', () => {
    render(<EstadoSincronizacion r={{ estado: 'AL_DIA', actual: { ultimaEn: '2026-11-07T14:48:00Z' } }} ahora={ahora} />)
    expect(screen.getByTestId('sincronizacion-hace')).toHaveTextContent('Última sincronización con Compras: hace 12 min')
    expect(screen.queryByTestId('sincronizacion-error')).toBeNull()
  })
  it('sin ninguna todavía lo dice; recién sincronizada muestra qué cambió', () => {
    const { rerender } = render(<EstadoSincronizacion r={{ estado: 'SIN_PERMISO', actual: {} }} ahora={ahora} />)
    expect(screen.getByTestId('sincronizacion-hace')).toHaveTextContent('Todavía no se sincronizó')
    rerender(<EstadoSincronizacion r={{ estado: 'SINCRONIZADA', actual: { ultimaEn: '2026-11-07T14:59:59Z' }, resumen: { revisadas: 5, nuevas: 3, cambiadas: 1, eliminadas: 0, sinCambios: 1 } }} ahora={ahora} />)
    expect(screen.getByTestId('sincronizacion-resumen')).toHaveTextContent('3 órdenes nuevas, 1 cambió')
  })
  it('si falla: mensaje en lenguaje llano con ícono, y sigue mostrando la hora de la última que funcionó', () => {
    render(<EstadoSincronizacion r={{ estado: 'ERROR', actual: { ultimaEn: '2026-11-07T13:00:00Z' }, mensaje: TEXTO_ERROR_SINCRONIZACION }} ahora={ahora} />)
    const e = screen.getByTestId('sincronizacion-error')
    expect(e).toHaveTextContent('No pudimos revisar Compras ahora'); expect(e.querySelector('svg')).not.toBeNull()
    expect(screen.getByTestId('sincronizacion-hace')).toHaveTextContent('hace 2 h')
  })
  it('si otra persona la está corriendo, lo dice', () => {
    render(<EstadoSincronizacion r={{ estado: 'EN_CURSO', actual: { ultimaEn: '2026-11-07T14:00:00Z' } }} ahora={ahora} />)
    expect(screen.getByTestId('sincronizacion-en-curso')).toBeInTheDocument()
  })
})
