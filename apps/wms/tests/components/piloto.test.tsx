// @vitest-environment jsdom
// Piloto: el banner fijo y la pantalla «Órdenes de compra del piloto» (vacío, lista, aviso de cambio, revisar con éxito y con error).
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const acc = vi.hoisted(() => ({ sincronizarOcsAccion: vi.fn(async () => ({ ok: true as const, mensaje: 'Revisamos 2 órdenes: 1 orden cambió (versión nueva y alerta para Sandra).' }) as unknown) }))
vi.mock('@/app/acciones-entradas', () => acc)
import { BannerPiloto } from '@/components/banner-piloto'
import { OcsPiloto } from '@/components/entradas/ocs-piloto'
import type { OcPilotoVista } from '@/domain/oc-versiones'

const oc = (p: Partial<OcPilotoVista>): OcPilotoVista => ({ ocId: 'o1', codigo: 'OC-100', proveedorNombre: 'Proveedor SAC', estadoCompras: 'confirmada', lineasEnCompras: 3, versionVigente: 1, copiadaEn: '2026-11-04T10:00:00Z', lineasCopia: 3, cambios: 0, avisoAbierto: false, eliminadaEnCompras: false, situacion: 'AL_DIA', ...p })
beforeEach(() => acc.sincronizarOcsAccion.mockClear())

describe('banner del piloto', () => {
  it('dice «PILOTO, datos de prueba» con ícono y texto, y baja debajo del banner DEMO si lo hay', () => {
    const { rerender } = render(<BannerPiloto />)
    const b = screen.getByTestId('banner-piloto')
    expect(b).toHaveTextContent('PILOTO, datos de prueba')
    expect(b.querySelector('svg')).not.toBeNull()
    expect(b.className).toContain('top-0')
    rerender(<BannerPiloto bajoDemo />)
    expect(screen.getByTestId('banner-piloto').className).toContain('top-9')
  })
})

describe('Órdenes de compra del piloto', () => {
  it('vacío: explica qué pasa y qué hacer', () => {
    render(<OcsPiloto lista={[]} puedeRevisar />)
    expect(screen.getByTestId('ocs-vacio')).toHaveTextContent('No hay órdenes de compra abiertas')
    expect(screen.getByTestId('ocs-revisar')).toBeEnabled()
  })
  it('lista: versión vigente y situación con texto (sin copiar, al día, cambió, ya no existe); el aviso de cambio se ve', () => {
    render(<OcsPiloto lista={[oc({ ocId: 'a', versionVigente: 0, situacion: 'SIN_COPIA', copiadaEn: undefined }), oc({ ocId: 'b' }), oc({ ocId: 'c', versionVigente: 3, cambios: 2, avisoAbierto: true, situacion: 'CAMBIO' }), oc({ ocId: 'd', eliminadaEnCompras: true, situacion: 'ELIMINADA' })]} puedeRevisar />)
    const t = screen.getAllByTestId('oc-situacion').map((x) => x.textContent)
    expect(t).toEqual(expect.arrayContaining(['Sin copiar todavía', 'Copia al día', 'Cambió en Compras', 'Ya no existe en Compras']))
    expect(screen.getByTestId('ocs-tabla')).toHaveTextContent('Hay una alerta abierta')
  })
  it('revisar: muestra «Revisando…» y después el resultado y qué sigue; si falla, el error', async () => {
    render(<OcsPiloto lista={[oc({})]} puedeRevisar />)
    await userEvent.click(screen.getByTestId('ocs-revisar'))
    await waitFor(() => expect(screen.getByTestId('ocs-exito')).toHaveTextContent('1 orden cambió'))
    expect(screen.getByTestId('ocs-exito')).toHaveTextContent('Siguiente')
    acc.sincronizarOcsAccion.mockResolvedValueOnce({ ok: false, mensaje: 'Compras no está conectado a esta base' } as never)
    await userEvent.click(screen.getByTestId('ocs-revisar'))
    await waitFor(() => expect(screen.getByTestId('ocs-error-accion')).toHaveTextContent('Compras no está conectado'))
  })
  it('sin permiso solo se mira: no hay botón de revisar', () => {
    render(<OcsPiloto lista={[oc({})]} puedeRevisar={false} />)
    expect(screen.queryByTestId('ocs-revisar')).toBeNull()
  })
})
