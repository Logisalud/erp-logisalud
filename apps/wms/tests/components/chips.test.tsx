// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
vi.mock('@/app/acciones-entradas', () => ({ cambiarRolDemoAccion: async () => {} }))
import { ChipEstado, ChipPorTrasladar, ChipPorVerificar, ChipRS } from '@/components/chips'
import { BannerDemo } from '@/components/banner-demo'

describe('estados: texto + ícono, nunca solo color', () => {
  it('cada estado sanitario lleva su texto y un ícono', () => {
    for (const [estado, texto] of [['CUARENTENA', 'Cuarentena'], ['DEVOLUCIONES', 'Devoluciones'], ['APROBADO', 'Aprobado'], ['BAJAS_RECHAZADOS', 'Bajas/Rechazados']] as const) {
      const { container, unmount } = render(<ChipEstado estado={estado} />)
      expect(screen.getByText(texto)).toBeInTheDocument()
      expect(container.querySelector('svg')).not.toBeNull()
      unmount()
    }
  })

  it('el registro sanitario dice su situación con palabras', () => {
    const { container } = render(<><ChipRS situacion="VENCIDO" /><ChipRS situacion="POR_VENCER" /><ChipRS situacion="VIGENTE" /><ChipRS situacion="SIN_DATO" /></>)
    for (const t of ['Registro vencido', 'Por vencer', 'Registro vigente', 'Sin registro']) expect(screen.getByText(t)).toBeInTheDocument()
    expect(container.querySelectorAll('svg')).toHaveLength(4)
  })

  it('por verificar y por trasladar también llevan texto e ícono', () => {
    const { container } = render(<><ChipPorVerificar /><ChipPorTrasladar /></>)
    for (const t of ['Por verificar en sitio', 'Aprobado · por trasladar']) expect(screen.getByText(t)).toBeInTheDocument()
    expect(container.querySelectorAll('svg')).toHaveLength(2)
  })
})

describe('aviso DEMO', () => {
  it('dice que son datos de prueba y que no hay conexión a ninguna base real', () => {
    render(<BannerDemo rolActual="jefe_almacen" />)
    const aviso = screen.getByRole('status')
    expect(aviso).toHaveTextContent('DEMO')
    expect(aviso).toHaveTextContent('sin conexión a ninguna base real')
  })
})
