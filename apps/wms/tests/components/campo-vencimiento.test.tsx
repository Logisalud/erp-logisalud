// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CampoVencimiento } from '@/components/campo-vencimiento'

function Caja({ inicial = '' }: { inicial?: string }) {
  const [v, setV] = useState(inicial)
  return <><label htmlFor="v">Vencimiento</label><CampoVencimiento id="v" value={v} onChange={setV} /><output data-testid="salida">{v}</output></>
}

describe('campo de vencimiento', () => {
  it('se puede escribir en cualquiera de los formatos', () => {
    render(<Caja />)
    fireEvent.change(screen.getByLabelText('Vencimiento'), { target: { value: '06/2028' } })
    expect(screen.getByTestId('salida')).toHaveTextContent('06/2028')
  })

  it('elegir en el calendario llena el campo como dd/mm/aaaa', () => {
    render(<Caja />)
    fireEvent.change(screen.getByTestId('selector-fecha'), { target: { value: '2028-06-30' } })
    expect(screen.getByLabelText('Vencimiento')).toHaveValue('30/06/2028')
  })

  it('el calendario arranca en la fecha ya escrita', () => {
    render(<Caja inicial="30/09/2028" />)
    expect(screen.getByTestId('selector-fecha')).toHaveValue('2028-09-30')
  })

  it('el botón del calendario tiene nombre accesible', () => {
    render(<Caja />)
    expect(screen.getByRole('button', { name: 'Elegir la fecha en el calendario' })).toBeInTheDocument()
  })
})
