// @vitest-environment jsdom
// Fase 4 · P9: la página pública del cliente: formulario (vacío, error, espera, éxito), línea de tiempo y sin banners de empleados.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const acc = vi.hoisted(() => ({ consultarSeguimientoAccion: vi.fn(), refrescarSeguimientoAccion: vi.fn(), refrescarPorTokenAccion: vi.fn(), responderEntregaAccion: vi.fn() }))
vi.mock('@/app/seguimiento/acciones', () => acc)
let ruta = '/seguimiento'
vi.mock('next/navigation', () => ({ usePathname: () => ruta, useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
import { PantallaSeguimiento } from '@/components/seguimiento/pantalla-seguimiento'
import { ConsultaSeguimiento } from '@/components/seguimiento/consulta-seguimiento'
import { LineaDeTiempo } from '@/components/seguimiento/linea-de-tiempo'
import { OcultarEnPublicas } from '@/components/ocultar-en-publicas'
import { MarcoPublico } from '@/components/seguimiento/marco-publico'
import { BannerPiloto } from '@/components/banner-piloto'

beforeEach(() => { for (const f of Object.values(acc)) f.mockReset(); ruta = '/seguimiento' })

describe('línea de tiempo', () => {
  it('cada paso con su fecha y hora o «Pendiente», con texto e ícono, y sin hora estimada', () => {
    render(<LineaDeTiempo hitos={[{ estado: 'RECIBIDO', en: '2026-11-03T15:00:00Z' }, { estado: 'PREPARANDO', en: '2026-11-04T14:30:00Z' }]} />)
    const pasos = screen.getAllByTestId('paso-seguimiento')
    expect(pasos).toHaveLength(5)
    expect(pasos[0]).toHaveTextContent('Pedido recibido'); expect(pasos[0]).toHaveTextContent(/3 nov/)
    expect(pasos[1]).toHaveTextContent('paso actual'); expect(pasos[1].querySelector('.motion-safe\\:animate-latido')).not.toBeNull(); expect(pasos[0].querySelector('.motion-safe\\:animate-latido')).toBeNull()
    expect(pasos[3]).toHaveTextContent('Pendiente')
    expect(pasos[0].querySelector('svg')).not.toBeNull()
    expect(screen.getByTestId('linea-de-tiempo').textContent!.toLowerCase()).not.toMatch(/estimad|precio|lote|conductor/)
  })
})

describe('formulario público', () => {
  const llenar = async () => { await userEvent.type(screen.getByTestId('seguimiento-pedido'), 'PED-0123'); await userEvent.type(screen.getByTestId('seguimiento-ruc'), '20512345671') }
  it('al abrir no muestra ningún dato; las respuestas son en lenguaje llano', async () => {
    acc.consultarSeguimientoAccion.mockResolvedValueOnce({ respuesta: { estado: 'NO_ENCONTRADO' }, pedido: 'PED-0123' })
    render(<ConsultaSeguimiento />)
    expect(screen.queryByTestId('linea-de-tiempo')).toBeNull()
    await llenar(); await userEvent.click(screen.getByTestId('seguimiento-consultar'))
    await waitFor(() => expect(screen.getByTestId('seguimiento-no-encontrado')).toHaveTextContent('No encontramos un pedido con esos datos'))
  })
  it('éxito: muestra la línea de tiempo; espera: dice cuántos minutos; error: mensaje simple', async () => {
    acc.consultarSeguimientoAccion.mockResolvedValueOnce({ respuesta: { estado: 'OK', pedido: 'PED-0123', hitos: [{ estado: 'RECIBIDO', en: '2026-11-03T15:00:00Z' }] }, pedido: 'PED-0123' })
    const { unmount } = render(<ConsultaSeguimiento />)
    await llenar(); await userEvent.click(screen.getByTestId('seguimiento-consultar'))
    await waitFor(() => expect(screen.getByTestId('linea-de-tiempo')).toBeInTheDocument())
    unmount()
    acc.consultarSeguimientoAccion.mockResolvedValueOnce({ respuesta: { estado: 'ESPERA', esperaSegundos: 600 }, pedido: 'PED-0123' })
    const r2 = render(<ConsultaSeguimiento />)
    await llenar(); await userEvent.click(screen.getByTestId('seguimiento-consultar'))
    await waitFor(() => expect(screen.getByTestId('seguimiento-espera')).toHaveTextContent('espera 10 minutos'))
    r2.unmount()
    acc.consultarSeguimientoAccion.mockResolvedValueOnce({ respuesta: { estado: 'ERROR' }, pedido: 'PED-0123' })
    render(<ConsultaSeguimiento />)
    await llenar(); await userEvent.click(screen.getByTestId('seguimiento-consultar'))
    await waitFor(() => expect(screen.getByTestId('seguimiento-error')).toHaveTextContent('Intenta de nuevo en unos minutos'))
  })
  it('errores de campo (los que devuelve la validación)', async () => {
    acc.consultarSeguimientoAccion.mockResolvedValueOnce({ errores: { pedido: 'Escribe el número de tu pedido.', ruc: 'El RUC tiene 11 números.' } })
    render(<ConsultaSeguimiento />)
    await userEvent.click(screen.getByTestId('seguimiento-consultar'))
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
  })
})

describe('páginas públicas: sin banners de empleados ni menú', () => {
  it('el banner del piloto se oculta en /seguimiento y se ve en el resto', () => {
    const { unmount } = render(<OcultarEnPublicas><BannerPiloto /></OcultarEnPublicas>)
    expect(screen.queryByTestId('banner-piloto')).toBeNull()
    unmount()
    ruta = '/entradas'
    render(<OcultarEnPublicas><BannerPiloto /></OcultarEnPublicas>)
    expect(screen.getByTestId('banner-piloto')).toBeInTheDocument()
  })
  it('el marco público no trae menú ni nada del WMS; las páginas son públicas en el middleware y no usan el contexto de empleados', () => {
    render(<MarcoPublico titulo="Seguimiento de tu pedido"><p>hola</p></MarcoPublico>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seguimiento de tu pedido')
    expect(screen.queryByRole('navigation')).toBeNull()
    const raiz = resolve(__dirname, '../..')
    for (const f of ['app/seguimiento/page.tsx', 'app/seguimiento/[token]/page.tsx', 'app/seguimiento/acciones.ts']) expect(readFileSync(resolve(raiz, f), 'utf8'), f).not.toMatch(/exigirContexto|obtenerContexto|Shell|shell/)
    const mw = readFileSync(resolve(raiz, 'middleware.ts'), 'utf8')
    expect(mw).toContain("'/seguimiento'"); expect(mw).toContain('esRutaPublicaDelCliente')
    expect(readFileSync(resolve(raiz, 'app/layout.tsx'), 'utf8')).toContain('<OcultarEnPublicas>')
  })
})

describe('estado de pagos del cliente (0068)', () => {
  it('al día: un mensaje alegre con su emoji, el agradecimiento y la fecha de la información', async () => {
    const { EstadoDePagosCliente } = await import('@/components/seguimiento/estado-de-pagos')
    render(<EstadoDePagosCliente deuda={{ estado: 'AL_DIA', al: '2026-11-13' }} />)
    const s = screen.getByTestId('estado-pagos')
    expect(s).toHaveAttribute('data-estado', 'AL_DIA')
    expect(screen.getByTestId('pagos-titulo')).toHaveTextContent('¡Estás al día en tus pagos! 😊')
    expect(s).toHaveTextContent('Gracias por la confianza.'); expect(s).toHaveTextContent('Información al 13 nov 2026')
  })
  it('con documentos vencidos: una tabla simple (documento, cuándo venció, atraso y saldo), el total al pie y qué hacer, en tono tranquilo', async () => {
    const { EstadoDePagosCliente } = await import('@/components/seguimiento/estado-de-pagos')
    render(<EstadoDePagosCliente deuda={{ estado: 'MOROSO', al: '2026-11-13', total: 2100.5, maxDias: 95, cantidad: 5, documentos: [
      { documento: 'F001-00007', vence: '2026-08-10', dias: 95, saldo: 800 }, { documento: 'F001-00010', vence: '2026-11-03', dias: 10, saldo: 1300.5 }] }} />)
    const s = screen.getByTestId('estado-pagos')
    expect(s).toHaveAttribute('data-estado', 'MOROSO')
    expect(screen.getByTestId('pagos-titulo')).toHaveTextContent('Tus pagos pendientes')
    expect(s).toHaveTextContent('Estos documentos ya pasaron su fecha de pago')
    const tabla = screen.getByTestId('pagos-documentos')
    expect(within(tabla).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Documento', 'Venció', 'Atraso', 'Saldo'])
    const fila = screen.getByTestId('pagos-documento-F001-00007')
    expect(within(fila).getAllByRole('cell').map((c) => c.textContent)).toEqual(['F001-00007', '10 ago 2026', '95 días', 'S/ 800.00'])
    expect(screen.getByTestId('pagos-total')).toHaveTextContent('S/ 2,100.50'); expect(screen.getByTestId('pagos-cantidad')).toHaveTextContent('5 documentos vencidos')
    expect(screen.getByTestId('pagos-faltan')).toHaveTextContent('Y 3 documentos vencidos más')
    expect(s).toHaveTextContent('Si ya pagaste'); expect(s).toHaveTextContent('avísanos'); expect(s).not.toHaveTextContent(/asesor/i); expect(s).toHaveTextContent('Gracias por tu comprensión')
    expect(document.body.textContent).not.toMatch(/moroso|deuda|urgente|incumpl/i)       // palabras llanas, sin dramatismo
    expect(s.className).not.toMatch(/amber|red/)                                           // sin colores de alarma
  })
  it('con todos sus documentos a la vista no dice «y más»', async () => {
    const { EstadoDePagosCliente } = await import('@/components/seguimiento/estado-de-pagos')
    render(<EstadoDePagosCliente deuda={{ estado: 'MOROSO', al: '2026-11-13', total: 50, maxDias: 3, cantidad: 1, documentos: [{ documento: 'F001-1', vence: '2026-11-10', dias: 3, saldo: 50 }] }} />)
    expect(screen.queryByTestId('pagos-faltan')).toBeNull(); expect(screen.getByTestId('pagos-cantidad')).toHaveTextContent('1 documento vencido')
  })
})

describe('pantalla del cliente (0069)', () => {
  const base = { estado: 'OK' as const, pedido: 'PED-0123', cliente: 'Botica Santa Rosa', hitos: [{ estado: 'RECIBIDO' as const, en: '2026-11-12T15:00:00Z' }, { estado: 'PREPARANDO' as const, en: '2026-11-12T16:00:00Z' }, { estado: 'EN_CAMINO' as const, en: '2026-11-12T20:00:00Z' }] }
  const origen = { tipo: 'consulta' as const, pedido: 'PED-0123', ruc: '20512345671' }
  it('encabezado, mensaje grande con la hora, línea de tiempo y «Van X de Y» (solo cuentas)', () => {
    render(<PantallaSeguimiento inicial={{ ...base, ruta: { atendidas: 2, total: 6 } }} origen={origen} />)
    expect(screen.getByTestId('seguimiento-encabezado')).toHaveTextContent('Pedido PED-0123 · Botica Santa Rosa')
    expect(screen.getByTestId('mensaje-titulo')).toHaveTextContent('Tu pedido va en camino'); expect(screen.getByTestId('mensaje-hora')).toBeInTheDocument()
    expect(screen.getByTestId('seguimiento-ruta')).toHaveTextContent('Van 2 de 6 entregas de tu ruta')
    expect(screen.getAllByTestId('paso-seguimiento')).toHaveLength(5)
  })
  it('sin «ruta» (una sola parada o parámetro apagado) no se muestra; provincia sin parada termina en «En camino»', () => {
    render(<PantallaSeguimiento inicial={{ ...base, ruta: null, tieneParada: false }} origen={origen} />)
    expect(screen.queryByTestId('seguimiento-ruta')).toBeNull()
    expect(screen.getAllByTestId('paso-seguimiento')).toHaveLength(3)
  })
  it('«Escribir a mi vendedor» abre WhatsApp con el mensaje; sin contacto no hay botón; la guía solo si hay enlace', () => {
    const { unmount } = render(<PantallaSeguimiento inicial={{ ...base, contacto: { nombre: 'ANA LÓPEZ', telefono: '+51912345678', esVendedor: true }, guia: { enlace: 'https://nubefact.example/g/1' } }} origen={origen} />)
    expect(screen.getByTestId('boton-escribir')).toHaveAttribute('href', `https://wa.me/51912345678?text=${encodeURIComponent('Hola Ana, consulto por mi pedido PED-0123')}`)
    expect(screen.getByTestId('boton-guia')).toHaveAttribute('href', 'https://nubefact.example/g/1'); expect(screen.getByTestId('boton-guia')).toHaveTextContent('Ver guía de remisión')
    unmount()
    render(<PantallaSeguimiento inicial={{ ...base, contacto: null, guia: null }} origen={origen} />)
    expect(screen.queryByTestId('boton-escribir')).toBeNull(); expect(screen.queryByTestId('boton-guia')).toBeNull(); expect(screen.queryByText(/error/i)).toBeNull()
  })
  it('modo piloto: el aviso «PRUEBA»', () => {
    const { unmount } = render(<PantallaSeguimiento inicial={{ ...base, prueba: true }} origen={origen} />)
    expect(screen.getByTestId('seguimiento-prueba')).toHaveTextContent('PRUEBA'); unmount()
    render(<PantallaSeguimiento inicial={base} origen={origen} />)
    expect(screen.queryByTestId('seguimiento-prueba')).toBeNull()
  })
  it('entregado: «Entregado ✓», una carita de un toque que se guarda una sola vez', async () => {
    acc.responderEntregaAccion.mockResolvedValueOnce({ estado: 'OK' })
    render(<PantallaSeguimiento inicial={{ ...base, hitos: [...base.hitos, { estado: 'LLEGO', en: '2026-11-12T21:00:00Z' }, { estado: 'ENTREGADO', en: '2026-11-12T21:10:00Z' }] }} origen={origen} />)
    expect(screen.getByTestId('mensaje-titulo')).toHaveTextContent('Entregado ✓'); expect(screen.getByTestId('carita')).toHaveTextContent('¿Cómo fue tu entrega?')
    await userEvent.click(screen.getByTestId('carita-3'))
    await waitFor(() => expect(screen.getByTestId('carita-gracias')).toBeInTheDocument())
    expect(acc.responderEntregaAccion).toHaveBeenCalledWith('PED-0123', '20512345671', 3)
    expect(screen.queryByTestId('carita')).toBeNull()
  })
  it('no entregado: mensaje neutro, sin carita y sin actualizarse más', () => {
    render(<PantallaSeguimiento inicial={{ ...base, hitos: [...base.hitos, { estado: 'NO_ENTREGADO', en: '2026-11-12T21:10:00Z' }] }} origen={origen} />)
    expect(screen.getByTestId('mensaje-titulo')).toHaveTextContent('No pudimos completar la entrega'); expect(screen.getByTestId('mensaje-detalle')).toHaveTextContent('Tu vendedor te contactará')
    expect(screen.queryByTestId('carita')).toBeNull(); expect(screen.getByTestId('seguimiento-actualizado')).toHaveTextContent('Última actualización')
  })
  it('se actualiza sola cada pocos segundos y se pausa con la pestaña oculta', async () => {
    vi.useFakeTimers()
    try {
      acc.refrescarSeguimientoAccion.mockResolvedValue({ ...base })
      render(<PantallaSeguimiento inicial={base} origen={origen} />)
      await vi.advanceTimersByTimeAsync(15_000); expect(acc.refrescarSeguimientoAccion).toHaveBeenCalledTimes(1)
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      await vi.advanceTimersByTimeAsync(45_000); expect(acc.refrescarSeguimientoAccion).toHaveBeenCalledTimes(1)
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    } finally { vi.useRealTimers() }
  })
})
