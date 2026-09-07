// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { CampoDetraccion } from '@/components/campo-detraccion'

/**
 * Envoltorio mínimo que reproduce cómo lo usan los 3 formularios reales
 * (Pago Directo, OS, OC): el padre es dueño del estado, el componente solo
 * lo muestra — ver components/campo-detraccion.tsx.
 */
function Envoltorio({ total }: { total: number }) {
  const [tieneDetraccion, setTieneDetraccion] = useState<boolean | null>(null)
  const [porcentaje, setPorcentaje] = useState('')
  const [monto, setMonto] = useState('')
  return (
    <CampoDetraccion
      total={total}
      moneda="PEN"
      tieneDetraccion={tieneDetraccion}
      onTieneDetraccionChange={setTieneDetraccion}
      porcentaje={porcentaje}
      onPorcentajeChange={setPorcentaje}
      monto={monto}
      onMontoChange={setMonto}
    />
  )
}

describe('CampoDetraccion', () => {
  it('por debajo del umbral, "No" se ve marcado sin que la persona haga nada', () => {
    render(<Envoltorio total={500} />)
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Sí' })).not.toBeChecked()
  })

  it('por encima del umbral, ninguno se ve marcado hasta que contesta', () => {
    render(<Envoltorio total={800} />)
    expect(screen.getByRole('radio', { name: 'No' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Sí' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Sí' })).toBeRequired()
  })

  it('por debajo del umbral, los radios no son obligatorios', () => {
    render(<Envoltorio total={500} />)
    expect(screen.getByRole('radio', { name: 'Sí' })).not.toBeRequired()
  })

  it('contestar "Sí" muestra los chips de % y el monto', async () => {
    const user = userEvent.setup()
    render(<Envoltorio total={800} />)
    await user.click(screen.getByRole('radio', { name: 'Sí' }))
    expect(screen.getByRole('button', { name: '12%' })).toBeInTheDocument()
    expect(screen.getByLabelText(/% de detracción/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Monto de detracción/)).toBeInTheDocument()
  })

  it('un chip calcula el monto como total × porcentaje / 100', async () => {
    const user = userEvent.setup()
    render(<Envoltorio total={1000} />)
    await user.click(screen.getByRole('radio', { name: 'Sí' }))
    await user.click(screen.getByRole('button', { name: '12%' }))
    expect(screen.getByLabelText(/Monto de detracción/)).toHaveValue(120)
  })

  it('contestar "No" oculta los campos de % y monto', async () => {
    const user = userEvent.setup()
    render(<Envoltorio total={800} />)
    await user.click(screen.getByRole('radio', { name: 'Sí' }))
    await user.click(screen.getByRole('radio', { name: 'No' }))
    expect(screen.queryByLabelText(/% de detracción/)).not.toBeInTheDocument()
  })

  it('muestra los errores de servidor cuando se pasan', () => {
    render(
      <CampoDetraccion
        total={800}
        moneda="PEN"
        tieneDetraccion={null}
        onTieneDetraccionChange={vi.fn()}
        porcentaje=""
        onPorcentajeChange={vi.fn()}
        monto=""
        onMontoChange={vi.fn()}
        errorTieneDetraccion="Indica si esta factura incluye detracción — supera S/700."
      />
    )
    expect(screen.getByText(/Indica si esta factura incluye detracción/)).toBeInTheDocument()
  })
})
