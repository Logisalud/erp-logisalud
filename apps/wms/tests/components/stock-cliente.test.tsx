// @vitest-environment jsdom
// Stock del cliente (0067): la página pública (resumen, lo que vence como filtro, búsqueda, lotes, Kardex) y la pantalla del personal para generar el enlace.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const acc = vi.hoisted(() => ({ crearEnlaceStockClienteAccion: vi.fn(), revocarEnlaceStockClienteAccion: vi.fn() }))
vi.mock('@/app/acciones-stock-cliente', () => acc)
const refrescar = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ usePathname: () => '/stock/abc', useRouter: () => ({ refresh: refrescar, push: () => {} }) }))
import { StockCliente } from '@/components/stock-cliente/stock-cliente'
import { EnlaceStockCliente } from '@/components/stock-cliente/enlace-stock-cliente'
import type { EnlaceStockVista, RespuestaStockCliente } from '@/domain/stock-cliente'

type Datos = Extract<RespuestaStockCliente, { estado: 'OK' }>
const datos: Datos = {
  estado: 'OK', cliente: { codigo: 'AJR_LABS', nombre: 'AJR Labs S.A.C.' }, hoy: '2026-11-13', actualizadoEn: '2026-11-13T13:15:00Z', tramos: [90, 180, 365],
  productos: [
    { productoId: 'p1', codigo: 'DEMO-005', codigoCliente: 'AJR0026', descripcion: 'Amoxicilina 500 mg', presentacion: 'Caja x 30', stock: 142, disponible: 100, enRevision: 0, vencido: 12, lotes: [
      { loteId: 'l1', lote: 'A1', vence: '2026-11-01', dias: -12, vencido: true, stock: 12, disponible: 0, enRevision: 0 },
      { loteId: 'l2', lote: 'A2', vence: '2027-01-10', dias: 58, vencido: false, stock: 30, disponible: 30, enRevision: 0 },
      { loteId: 'l3', lote: 'A3', vence: '2028-01-01', dias: 414, vencido: false, stock: 100, disponible: 70, enRevision: 0 }] },
    { productoId: 'p2', codigo: 'DEMO-008', descripcion: 'Ibuprofeno 400 mg', stock: 8, disponible: 5, enRevision: 3, vencido: 0, lotes: [
      { loteId: 'l4', lote: 'B1', vence: '2027-04-20', dias: 158, vencido: false, stock: 8, disponible: 5, enRevision: 3 }] },
  ],
}
const vacio: Datos = { ...datos, productos: [] }
beforeEach(() => { acc.crearEnlaceStockClienteAccion.mockReset(); acc.revocarEnlaceStockClienteAccion.mockReset(); refrescar.mockReset() })

describe('la página del cliente', () => {
  it('muestra quién es, a qué hora se actualizó, el resumen y cada producto con su código y sus cifras; sin ubicaciones', () => {
    render(<StockCliente token="abc" prefijo="/wms" datos={datos} />)
    expect(screen.getByTestId('stock-cliente')).toHaveTextContent('AJR Labs S.A.C.')
    expect(screen.getByTestId('stock-actualizado')).toHaveTextContent(/13 nov 2026/)
    expect(screen.getByTestId('stock-resumen')).toHaveTextContent('150 unidades')
    expect(screen.getByTestId('stock-resumen')).toHaveTextContent('2 productos')
    expect(screen.getByTestId('stock-disponible-total')).toHaveTextContent('105')
    expect(screen.getByTestId('stock-resumen')).toHaveTextContent('3 siguen en revisión de Calidad')
    const p = screen.getByTestId('stock-producto-DEMO-005')
    expect(p).toHaveTextContent('Amoxicilina 500 mg'); expect(p).toHaveTextContent('AJR0026'); expect(p).toHaveTextContent('Caja x 30'); expect(p).toHaveTextContent('142'); expect(p).toHaveTextContent('12 u vencidas')
    expect(document.body.textContent).not.toMatch(/ubicaci|posici/i)
    expect(screen.getByTestId('stock-aviso')).toHaveTextContent('Disponible')
  })

  it('los lotes se abren y se cierran; cada uno con su vencimiento escrito (texto e ícono, no solo color)', async () => {
    const u = userEvent.setup()
    render(<StockCliente token="abc" prefijo="/wms" datos={datos} />)
    const boton = within(screen.getByTestId('stock-producto-DEMO-005')).getByRole('button')
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('stock-lote-A1')).toBeNull()
    await u.click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('stock-lote-A1')).toHaveAttribute('data-urgencia', 'VENCIDO')
    expect(screen.getByTestId('stock-lote-A1')).toHaveTextContent('Vencido hace 12 días')
    expect(screen.getByTestId('stock-lote-A2')).toHaveAttribute('data-urgencia', 'PRONTO')
    expect(screen.getByTestId('stock-lote-A2')).toHaveTextContent('Vence en 58 días')
    expect(screen.getByTestId('stock-lote-A3')).toHaveAttribute('data-urgencia', 'VIGENTE')
    await u.click(boton)
    expect(screen.queryByTestId('stock-lote-A1')).toBeNull()
  })

  it('«lo que vence» es un filtro: deja solo los lotes de ese grupo (abiertos) y se quita con «Todo el stock»', async () => {
    const u = userEvent.setup()
    render(<StockCliente token="abc" prefijo="/wms" datos={datos} />)
    const filtros = screen.getByTestId('stock-filtros-vence')
    expect(within(filtros).getByTestId('filtro-VENCIDO')).toHaveTextContent('Ya vencidos'); expect(within(filtros).getByTestId('filtro-VENCIDO')).toHaveTextContent('12 u')
    expect(within(filtros).getByTestId('filtro-HASTA_90')).toHaveTextContent('Vencen en menos de 3 meses')
    expect(within(filtros).getByTestId('filtro-HASTA_180')).toHaveTextContent('Vencen entre 3 meses y 6 meses')
    expect(within(filtros).queryByTestId('filtro-HASTA_365')).toBeNull()                  // no hay lotes en ese tramo
    await u.click(within(filtros).getByTestId('filtro-VENCIDO'))
    expect(within(filtros).getByTestId('filtro-VENCIDO')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('stock-lote-A1')).toBeVisible()                              // abierto solo
    expect(screen.queryByTestId('stock-lote-A2')).toBeNull(); expect(screen.queryByTestId('stock-producto-DEMO-008')).toBeNull()
    await u.click(within(filtros).getByTestId('filtro-HASTA_180'))
    expect(screen.getByTestId('stock-producto-DEMO-008')).toBeVisible(); expect(screen.queryByTestId('stock-producto-DEMO-005')).toBeNull()
    await u.click(within(filtros).getByTestId('filtro-todo'))
    expect(screen.getByTestId('stock-producto-DEMO-005')).toBeVisible(); expect(screen.getByTestId('stock-producto-DEMO-008')).toBeVisible()
  })

  it('busca por producto, código o lote; sin resultados lo dice y ofrece volver a todo', async () => {
    const u = userEvent.setup()
    render(<StockCliente token="abc" prefijo="/wms" datos={datos} />)
    await u.type(screen.getByTestId('stock-buscar'), 'ajr0026')
    expect(screen.getByTestId('stock-producto-DEMO-005')).toBeVisible(); expect(screen.queryByTestId('stock-producto-DEMO-008')).toBeNull()
    await u.clear(screen.getByTestId('stock-buscar')); await u.type(screen.getByTestId('stock-buscar'), 'b1')
    expect(screen.getByTestId('stock-producto-DEMO-008')).toBeVisible()
    await u.clear(screen.getByTestId('stock-buscar')); await u.type(screen.getByTestId('stock-buscar'), 'zzz')
    const sin = screen.getByTestId('stock-sin-resultados'); expect(sin).toHaveTextContent('No encontramos productos')
    await u.click(within(sin).getByRole('button', { name: /ver todo mi stock/i }))
    expect(screen.getByTestId('stock-producto-DEMO-005')).toBeVisible()
  })

  it('el Kardex se pide al mismo enlace: producto (o todos) y fechas opcionales, con el prefijo de la aplicación', () => {
    render(<StockCliente token="abc123" prefijo="/wms" datos={datos} />)
    const form = screen.getByTestId('stock-kardex-form')
    expect(form).toHaveAttribute('action', '/wms/stock/abc123/kardex'); expect(form).toHaveAttribute('method', 'get')
    const sel = screen.getByTestId('kardex-producto') as HTMLSelectElement
    expect([...sel.options].map((o) => o.textContent)).toEqual(['Todos mis productos', 'AJR0026 · Amoxicilina 500 mg', 'Ibuprofeno 400 mg'])
    expect(sel.name).toBe('producto'); expect(screen.getByTestId('kardex-desde')).toHaveAttribute('name', 'desde'); expect(screen.getByTestId('kardex-hasta')).toHaveAttribute('name', 'hasta')
    expect(screen.getByTestId('kardex-descargar')).toHaveTextContent('Descargar Kardex')
  })

  it('«Actualizar» vuelve a pedir los datos', async () => {
    const u = userEvent.setup()
    render(<StockCliente token="abc" prefijo="/wms" datos={datos} />)
    await u.click(screen.getByTestId('stock-actualizar'))
    await waitFor(() => expect(refrescar).toHaveBeenCalled())
  })

  it('sin productos: un vacío que dice qué pasa, sin filtros ni Kardex', () => {
    render(<StockCliente token="abc" prefijo="/wms" datos={vacio} />)
    expect(screen.getByTestId('stock-vacio')).toHaveTextContent('Por ahora no tienes productos')
    expect(screen.queryByTestId('stock-filtros-vence')).toBeNull(); expect(screen.queryByTestId('stock-kardex')).toBeNull()
  })

  it('si nada vence en los tramos lo dice', () => {
    const d: Datos = { ...datos, productos: [{ ...datos.productos[0], vencido: 0, lotes: [datos.productos[0].lotes[2]] }] }
    render(<StockCliente token="abc" prefijo="/wms" datos={d} />)
    expect(screen.getByTestId('stock-nada-vence')).toHaveTextContent('Ningún lote vence en los próximos 12 meses')
  })
})

describe('el enlace, en la pantalla del personal', () => {
  const enlaces: EnlaceStockVista[] = [
    { id: 'e1', propietarioId: 'pr1', etiqueta: 'Compras de AJR', creadoEn: '2026-11-01T10:00:00Z', venceEn: '2099-01-01T00:00:00Z', ultimaVistaEn: '2026-11-10T09:00:00Z', estado: 'VIGENTE' },
    { id: 'e2', propietarioId: 'pr1', creadoEn: '2026-10-01T10:00:00Z', venceEn: '2026-10-20T00:00:00Z', estado: 'VENCIDO' },
    { id: 'e3', propietarioId: 'pr1', etiqueta: 'Viejo', creadoEn: '2026-09-01T10:00:00Z', venceEn: '2099-01-01T00:00:00Z', revocadoEn: '2026-09-05T00:00:00Z', estado: 'REVOCADO' },
  ]
  it('genera el enlace con su vigencia y etiqueta, lo muestra una sola vez para copiarlo y avisa que no se vuelve a ver', async () => {
    const u = userEvent.setup()
    acc.crearEnlaceStockClienteAccion.mockResolvedValue({ ok: true, token: 'tok123', venceEn: '2027-02-11T12:00:00Z' })
    render(<EnlaceStockCliente propietarioId="pr1" cliente="AJR Labs" enlaces={enlaces} prefijo="/wms" />)
    await u.type(screen.getByTestId('enlace-etiqueta'), 'Gerencia')
    await u.selectOptions(screen.getByTestId('enlace-vigencia'), '180')
    await u.click(screen.getByTestId('enlace-generar'))
    await waitFor(() => expect(acc.crearEnlaceStockClienteAccion).toHaveBeenCalledWith('pr1', 180, 'Gerencia'))
    const nuevo = await screen.findByTestId('enlace-nuevo')
    expect((within(nuevo).getByTestId('enlace-url') as HTMLInputElement).value).toBe(`${window.location.origin}/wms/stock/tok123`)
    expect(nuevo).toHaveTextContent('no se vuelve a mostrar')
  })
  it('un error de la base se muestra en palabras llanas', async () => {
    const u = userEvent.setup()
    acc.crearEnlaceStockClienteAccion.mockResolvedValue({ ok: false, mensaje: 'No tienes permiso para generar el enlace de stock de un cliente' })
    render(<EnlaceStockCliente propietarioId="pr1" cliente="AJR Labs" enlaces={[]} prefijo="/wms" />)
    await u.click(screen.getByTestId('enlace-generar'))
    expect(await screen.findByTestId('enlace-error')).toHaveTextContent('No tienes permiso')
  })
  it('lista los enlaces con su estado escrito y deja revocar solo los vigentes', async () => {
    const u = userEvent.setup()
    acc.revocarEnlaceStockClienteAccion.mockResolvedValue({ ok: true, revocado: true })
    render(<EnlaceStockCliente propietarioId="pr1" cliente="AJR Labs" enlaces={enlaces} prefijo="/wms" />)
    const lista = screen.getByTestId('enlaces-lista')
    expect(within(lista).getByTestId('enlace-VIGENTE')).toHaveTextContent('Vigente'); expect(within(lista).getByTestId('enlace-VIGENTE')).toHaveTextContent('Compras de AJR')
    expect(within(lista).getByTestId('enlace-VENCIDO')).toHaveTextContent('Todavía no lo abrió'); expect(within(lista).getByTestId('enlace-REVOCADO')).toHaveTextContent('Revocado')
    expect(within(lista).getAllByTestId('enlace-revocar')).toHaveLength(1)
    await u.click(within(lista).getByTestId('enlace-revocar'))
    await waitFor(() => expect(acc.revocarEnlaceStockClienteAccion).toHaveBeenCalledWith('e1'))
  })
})
