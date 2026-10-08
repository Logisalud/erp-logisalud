// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Cargando from '@/app/(app)/loading'
import ErrorPantalla from '@/app/(app)/error'
import NoEncontrado from '@/app/(app)/not-found'

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))

describe('estados de pantalla: cargando, error y no encontrado', () => {
  it('cargando muestra un esqueleto anunciado, no un spinner infinito', () => {
    render(<Cargando />)
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument()
  })

  it('el error dice qué pasó, tranquiliza y deja reintentar', async () => {
    const reset = vi.fn()
    render(<ErrorPantalla error={new Error('x')} reset={reset} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar esta pantalla')
    expect(screen.getByRole('alert')).toHaveTextContent('Tu información no se perdió')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reset).toHaveBeenCalledOnce()
  })

  it('no encontrado orienta y ofrece volver al inicio', () => {
    render(<NoEncontrado />)
    expect(screen.getByRole('heading', { name: 'No encontramos eso' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
  })
})
