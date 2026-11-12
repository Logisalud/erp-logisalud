// @vitest-environment jsdom
// «Ya no sale»: se elige qué pasa con el pedido, se escribe el motivo y recién ahí se confirma; el texto se entiende sin jerga.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const acc = vi.hoisted(() => ({ yaNoSaleAccion: vi.fn() }))
vi.mock('@/app/acciones-salida-manual', () => acc)
import { YaNoSale } from '@/components/salidas/ya-no-sale'
import { ofrecerYaNoSale, textoResultadoYaNoSale } from '@/domain/ya-no-sale'

beforeEach(() => { acc.yaNoSaleAccion.mockReset(); acc.yaNoSaleAccion.mockResolvedValue({ ok: true, cancelada: false, porDevolver: 12, preGuia: 'TTT1-00000007' }) })

describe('«Ya no sale»', () => {
  it('cuenta qué va a pasar con palabras sencillas y no deja confirmar sin elegir qué pasa con el pedido y sin motivo', async () => {
    render(<YaNoSale salidaId="s1" numero="OS-2026-00031" preGuia="TTT1-00000007" rutaNumero="RUT-9" />)
    await userEvent.click(screen.getByTestId('abrir-ya-no-sale'))
    const t = screen.getByTestId('ya-no-sale').textContent ?? ''
    for (const x of ['TTT1-00000007', 'no se reutiliza', 'vuelve a su ubicación', 'otra persona lo verifica', 'anulado', 'RUT-9']) expect(t).toContain(x)
    expect(t.toLowerCase()).not.toContain('staging')
    expect(screen.getByTestId('confirmar-ya-no-sale')).toBeDisabled()
    await userEvent.type(screen.getByTestId('motivo-ya-no-sale'), 'no')
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 5 letras')
    await userEvent.clear(screen.getByTestId('motivo-ya-no-sale')); await userEvent.type(screen.getByTestId('motivo-ya-no-sale'), 'El cliente canceló')
    expect(screen.getByTestId('confirmar-ya-no-sale')).toBeDisabled()                 // falta elegir qué pasa con el pedido
    await userEvent.click(screen.getByTestId('ya-no-sale-rehacer'))
    expect(screen.getByTestId('confirmar-ya-no-sale')).toBeEnabled()
  })

  it('confirma con lo elegido y cuenta cómo quedó; sin pre-guía no la menciona', async () => {
    render(<YaNoSale salidaId="s1" numero="OS-2026-00031" />)
    await userEvent.click(screen.getByTestId('abrir-ya-no-sale'))
    expect(screen.queryByTestId('ya-no-sale-pre-guia')).toBeNull()
    await userEvent.type(screen.getByTestId('motivo-ya-no-sale'), 'El cliente canceló')
    await userEvent.click(screen.getByTestId('ya-no-sale-cancelar'))
    await userEvent.click(screen.getByTestId('confirmar-ya-no-sale'))
    expect(acc.yaNoSaleAccion).toHaveBeenCalledWith('s1', 'El cliente canceló', false)
    expect(await screen.findByTestId('ya-no-sale-resultado')).toHaveTextContent('falta devolver 12 unidades a su ubicación')
  })

  it('el botón se ofrece solo con picking hecho, sin guía y con la orden abierta; con guía pide anularla primero', () => {
    const base = { estado: 'ABIERTA', etapa: 'PENDIENTE_CONFORMIDAD', ordenPickingId: 'op1' }
    expect(ofrecerYaNoSale(base, false)).toBe('SI')
    expect(ofrecerYaNoSale(base, true)).toBe('ANULAR_GUIA')
    expect(ofrecerYaNoSale({ ...base, ordenPickingId: undefined }, false)).toBe('NO')            // sin picking se usa «Cancelar la orden»
    expect(ofrecerYaNoSale({ ...base, etapa: 'CARGADA' }, false)).toBe('NO')
    expect(ofrecerYaNoSale({ ...base, estado: 'CONFIRMADA' }, false)).toBe('NO')
    expect(ofrecerYaNoSale({ ...base, cancelacionPendiente: true }, false)).toBe('NO')
    expect(ofrecerYaNoSale({ ...base, tipo: 'CLIENTE' }, false)).toBe('NO')
  })

  it('los textos del resultado: cancelada de una vez (rehacer o no) y por cancelarse', () => {
    expect(textoResultadoYaNoSale({ cancelada: true, porDevolver: 0, preGuia: 'TTT1-00000007' }, true)).toMatch(/volvió a la bandeja/)
    expect(textoResultadoYaNoSale({ cancelada: true, porDevolver: 0 }, false)).toMatch(/cancele el pedido en Pedidos/)
    expect(textoResultadoYaNoSale({ cancelada: false, porDevolver: 1 }, true)).toMatch(/falta devolver 1 unidad a su ubicación/)
  })
})
