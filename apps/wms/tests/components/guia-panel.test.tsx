// @vitest-environment jsdom
// Piloto (0036): «Registrar guía emitida» — valida mientras escribes, manda lo escrito y, según el modo, la pantalla de documentación muestra esto o «Emitir guía».
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const acc = vi.hoisted(() => ({
  registrarGuiaPanelAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, id: 'g1', numero: 'TTT1-00000012', pedidos: 'ENVIADO' as const }) as unknown),
  emitirGuiaElectronicaAccion: vi.fn(),
  registrarGreAccion: vi.fn(),
  reenviarAvisosPedidosAccion: vi.fn(),
}))
vi.mock('@/app/acciones-picking', () => acc)
import { RegistrarGuiaPanel } from '@/components/salidas/registrar-guia-panel'

const lineas = [{ productoCodigo: 'P-1', producto: 'Paracetamol', lote: 'L2515', vence: '2028-06-30', cantidad: 20 }]
const alRegistrar = vi.fn()
beforeEach(() => { acc.registrarGuiaPanelAccion.mockClear(); alRegistrar.mockClear() })
const ver = () => render(<RegistrarGuiaPanel salidaId="s1" hoy="2026-11-03" lineas={lineas} alRegistrar={alRegistrar} />)

describe('registrar guía emitida en el panel', () => {
  it('muestra lo confirmado, no deja registrar con el número vacío o mal escrito y explica el error', async () => {
    ver()
    expect(screen.getByTestId('guia-panel-lineas')).toHaveTextContent('L2515')
    const boton = screen.getByTestId('registrar-guia-panel-boton')
    expect(boton).toBeDisabled()
    await userEvent.type(screen.getByTestId('panel-numero'), '1234')
    expect(screen.getByTestId('panel-error-numero')).toHaveTextContent('serie, guion y número')
    expect(boton).toBeDisabled()
    await userEvent.clear(screen.getByTestId('panel-numero'))
    await userEvent.type(screen.getByTestId('panel-numero'), 'ttt1-00000012')
    expect(screen.queryByTestId('panel-error-numero')).toBeNull()
    expect(boton).toBeEnabled()
  })

  it('el enlace debe empezar con https:// y la fecha no puede ser de mañana', async () => {
    ver()
    await userEvent.type(screen.getByTestId('panel-numero'), 'TTT1-00000012')
    await userEvent.type(screen.getByTestId('panel-enlace'), 'panel.nubefact.com/g')
    expect(screen.getByTestId('panel-error-enlace')).toHaveTextContent('https://')
    expect(screen.getByTestId('registrar-guia-panel-boton')).toBeDisabled()
    await userEvent.clear(screen.getByTestId('panel-enlace'))
    expect(screen.getByTestId('registrar-guia-panel-boton')).toBeEnabled()
  })

  it('envía número, fecha, estado, enlace y nota, y dice qué pasó y qué sigue', async () => {
    ver()
    await userEvent.type(screen.getByTestId('panel-numero'), 'TTT1-00000012')
    await userEvent.selectOptions(screen.getByTestId('panel-estado'), 'PENDIENTE')
    await userEvent.type(screen.getByTestId('panel-enlace'), 'https://panel.nubefact.com/g.pdf')
    await userEvent.type(screen.getByTestId('panel-nota'), 'Emitida por Roberto')
    await userEvent.click(screen.getByTestId('registrar-guia-panel-boton'))
    await waitFor(() => expect(acc.registrarGuiaPanelAccion).toHaveBeenCalledTimes(1))
    expect(acc.registrarGuiaPanelAccion).toHaveBeenCalledWith('s1', { numero: 'TTT1-00000012', fechaEmision: '2026-11-03', estado: 'PENDIENTE', enlace: 'https://panel.nubefact.com/g.pdf', nota: 'Emitida por Roberto' })
    await waitFor(() => expect(alRegistrar).toHaveBeenCalled())
    expect(alRegistrar.mock.calls[0][0]).toMatch(/Pedidos ya tiene el número.*Siguiente: completa el paquete documental/)
  })

  it('si la base rechaza (número repetido), muestra el motivo y no da el éxito por hecho', async () => {
    acc.registrarGuiaPanelAccion.mockResolvedValueOnce({ ok: false as const, mensaje: 'La guía TTT1-00000012 ya está registrada (vigente o anulada): un número emitido en el panel no se repite' })
    ver()
    await userEvent.type(screen.getByTestId('panel-numero'), 'TTT1-00000012')
    await userEvent.click(screen.getByTestId('registrar-guia-panel-boton'))
    expect(await screen.findByTestId('error-guia-panel')).toHaveTextContent('no se repite')
    expect(alRegistrar).not.toHaveBeenCalled()
  })
})
