// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BuscadorGuias } from '@/components/guias/buscador-guias'
import type { GuiaFila } from '@/domain/guias-busqueda'

afterEach(cleanup)
const g = (o: Partial<GuiaFila>): GuiaFila => ({ id: o.numero ?? 'x', numero: 'TTT1-00000001', salidaId: 's1', salidaNumero: 'SAL-1', rolDestinatario: 'CLIENTE', fecha: '2026-11-10', origen: 'NUBEFACT', anulada: false, ...o })
const G = [
  g({ numero: 'TTT1-00000001', destinatario: 'Cliente Uno', estadoSunat: 'ACEPTADA', enlace: 'https://nubefact.test/pdf/1' }),
  g({ numero: 'TTT1-00000002', destinatario: 'Proveedor Dos', rolDestinatario: 'PROVEEDOR', estadoSunat: 'PENDIENTE', fecha: '2026-11-09' }),
  g({ numero: 'TTT1-00000003', destinatario: 'Cliente Tres', anulada: true, motivoAnulacion: 'Dirección equivocada', fecha: '2026-11-08' }),
]
const numeros = () => screen.getAllByTestId('guia-numero').map((x) => x.textContent)

describe('buscador de guías', () => {
  it('muestra todas con su estado en texto y el contador', () => {
    render(<BuscadorGuias guias={G} />)
    expect(numeros()).toEqual(['TTT1-00000001', 'TTT1-00000002', 'TTT1-00000003'])
    expect(screen.getByTestId('guias-contador')).toHaveTextContent('3 guías')
    expect(within(screen.getByTestId('tabla-guias')).getAllByTestId('chip-estado-guia').map((x) => x.textContent)).toEqual(['Aceptada por SUNAT', 'Enviada (esperando a SUNAT)', 'Anulada'])
    expect(screen.getByRole('link', { name: /Abrir el PDF de la guía TTT1-00000001/ })).toHaveAttribute('href', 'https://nubefact.test/pdf/1')
  })
  it('busca por número y filtra por estado y por proveedor; quitar filtros vuelve a todas', () => {
    render(<BuscadorGuias guias={G} />)
    fireEvent.change(screen.getByTestId('buscar-guias'), { target: { value: '00000003' } })
    expect(numeros()).toEqual(['TTT1-00000003']); expect(screen.getByTestId('guias-contador')).toHaveTextContent('1 de 3 guías')
    fireEvent.click(screen.getByTestId('guias-limpiar'))
    fireEvent.change(screen.getByTestId('filtro-rol-guia'), { target: { value: 'PROVEEDOR' } })
    expect(numeros()).toEqual(['TTT1-00000002'])
    fireEvent.click(screen.getByTestId('guias-limpiar'))
    fireEvent.change(screen.getByTestId('filtro-estado-guia'), { target: { value: 'ANULADA' } })
    expect(numeros()).toEqual(['TTT1-00000003']); expect(screen.getByText('Dirección equivocada')).toBeInTheDocument()
  })
  it('sin coincidencias y sin guías dice qué pasa', () => {
    const { unmount } = render(<BuscadorGuias guias={G} />)
    fireEvent.change(screen.getByTestId('buscar-guias'), { target: { value: 'zzz' } })
    expect(screen.getByTestId('guias-sin-coincidencias')).toBeInTheDocument()
    unmount(); render(<BuscadorGuias guias={[]} />)
    expect(screen.getByTestId('guias-vacio')).toBeInTheDocument()
  })
  it('ordena por fecha ascendente al elegir otra columna y volver', () => {
    render(<BuscadorGuias guias={G} />)
    fireEvent.change(screen.getByTestId('orden-guias'), { target: { value: 'numero' } })
    expect(numeros()).toEqual(['TTT1-00000001', 'TTT1-00000002', 'TTT1-00000003'])
  })
})
