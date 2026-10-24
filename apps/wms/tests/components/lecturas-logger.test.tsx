// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const acc = vi.hoisted(() => ({
  leerLoggerAccion: vi.fn(async (..._a: unknown[]) => ({ ok: false as const, mensaje: 'x' }) as unknown),
  cerrarRutaAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, fueraDeRango: false, logger: { estado: 'GUARDADO', excede: false, coincide: true, dentroDeFecha: true } }) as unknown),
  corregirCierreRutaAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, version: 2, fueraDeRango: false, logger: { estado: 'NO_LEIDO', motivo: 'x' } }) as unknown),
  registrarImpresionLsFrAccion: vi.fn(), subirEscaneoLsFrAccion: vi.fn(),
  importarLoggerAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, excede: false, coincide: true, dentroDeFecha: true }) as unknown),
}))
vi.mock('@/app/acciones-rutas', () => acc)
import { PanelLsFr } from '@/components/rutas/panel-ls-fr'
import { PanelLecturasLogger, GraficoLecturas } from '@/components/rutas/lecturas-logger'
import { estadisticas, resumenDeInforme, type LecturasLoggerVista } from '@/domain/data-logger'
import { armarRegistroLsFr } from '@/domain/ls-fr-43-03'
import type { RutaVista } from '@/domain/rutas'

const lecturas = (temps: number[]) => temps.map((temperatura, i) => ({ momento: `2026-10-19T${String(9 + Math.floor((i * 5) / 60)).padStart(2, '0')}:${String((24 + i * 5) % 60).padStart(2, '0')}:34`, temperatura }))
const vista = (temps: number[], extra: Partial<LecturasLoggerVista> = {}): LecturasLoggerVista => {
  const l = lecturas(temps); const e = estadisticas(l, 24.9, 5)
  return {
    id: 'l1', archivoNombre: 'informe.pdf', formato: 'PDF', modelo: 'RC-61', serie: 'EFG204104487', intervaloMin: 5, umbralEquipoAlto: 24.5, umbralEquipoBajo: 15.5, primera: e.primera, ultima: e.ultima, puntos: e.puntos,
    tempMin: e.min, tempMax: e.max, tempProm: e.promedio, limite: 24.9, excede: e.excede, lecturasSobreLimite: e.sobreLimite, minutosSobreLimite: e.minutosSobreLimite, primeraExcedencia: e.primeraExcedencia,
    coincideConCierre: true, cierreMin: e.min, cierreMax: e.max, dentroDeFecha: true, importadoPor: 'Roberto', importadoEn: '2026-10-20T13:00:00Z', vigente: true, lecturas: l, ...extra,
  }
}
beforeEach(() => { Object.values(acc).forEach((f) => f.mockClear()) })

describe('lecturas del data logger guardadas', () => {
  it('dentro del límite: chip verde con texto, mínima y máxima, y coincide con el cierre', () => {
    render(<PanelLecturasLogger rutaId="r1" logger={[vista([22, 23.5, 24.1])]} fechaRuta="2026-10-19" puedeImportar cerrada sinSalir={false} />)
    expect(screen.getByTestId('logger-chip')).toHaveTextContent('Dentro del límite de 24,9 °C')
    expect(screen.getByTestId('logger-cruce-chip')).toHaveTextContent('Coincide con el cierre')
    expect(screen.getByTestId('logger-datos')).toHaveTextContent('Mínima 22,0 °C')
    expect(screen.getByTestId('logger-datos')).toHaveTextContent('máxima 24,1 °C')
    expect(screen.queryByTestId('logger-excede')).toBeNull()
    expect(screen.getByTestId('grafico-lecturas')).toBeInTheDocument()
  })

  it('sobre el límite: dice cuántas lecturas, cuánto tiempo y a quién se avisó; el gráfico lo describe en su etiqueta', () => {
    render(<PanelLecturasLogger rutaId="r1" logger={[vista([22, 25.3, 25, 24])]} fechaRuta="2026-10-19" puedeImportar cerrada sinSalir={false} />)
    expect(screen.getByTestId('logger-chip')).toHaveTextContent('Superó el límite de 24,9 °C')
    expect(screen.getByTestId('logger-excede')).toHaveTextContent('2 lecturas pasaron el límite')
    expect(screen.getByTestId('logger-excede')).toHaveTextContent('10 min por encima')
    expect(screen.getByTestId('logger-excede')).toHaveTextContent('Dirección Técnica y al Jefe de Transporte')
    expect(screen.getByRole('img')).toHaveAccessibleName(/2 lecturas sobre el límite/)
  })

  it('si no coincide con el cierre o es de otro día, lo explica', () => {
    render(<PanelLecturasLogger rutaId="r1" logger={[vista([22, 24], { coincideConCierre: false, cierreMin: 20, cierreMax: 24 })]} fechaRuta="2026-10-25" puedeImportar cerrada sinSalir={false} />)
    expect(screen.getByTestId('logger-cruce-chip')).toHaveTextContent('No coincide con el cierre')
    const t = screen.getAllByTestId('logger-cruce').map((x) => x.textContent).join(' ')
    expect(t).toMatch(/El cierre anota 20,0 – 24,0 °C y el archivo marca 22,0 – 24,0 °C/)
    expect(t).toMatch(/la ruta es del 25\/10\/2026/)
  })

  it('vacío: una ruta cerrada sin leer ofrece subir el informe; quien no cierra rutas no ve el formulario', async () => {
    const { unmount } = render(<PanelLecturasLogger rutaId="r1" logger={[]} fechaRuta="2026-10-19" puedeImportar cerrada sinSalir={false} />)
    expect(screen.getByTestId('logger-chip')).toHaveTextContent('Sin leer')
    expect(screen.getByTestId('logger-vacio')).toHaveTextContent('se cerró sin leer el informe')
    await userEvent.upload(screen.getByTestId('logger-archivo'), new File(['x'], 'informe.pdf', { type: 'application/pdf' }))
    fireEvent.submit(screen.getByTestId('form-logger')) // jsdom no da por llenado un archivo con `required`: se envía el formulario directo
    await waitFor(() => expect(acc.importarLoggerAccion).toHaveBeenCalledTimes(1))
    const fd = acc.importarLoggerAccion.mock.calls[0][0] as FormData
    expect(fd.get('rutaId')).toBe('r1')
    await waitFor(() => expect(screen.getByTestId('logger-ok')).toHaveTextContent('guardamos sus lecturas'))
    unmount()
    render(<PanelLecturasLogger rutaId="r1" logger={[]} fechaRuta="2026-10-19" puedeImportar={false} cerrada sinSalir={false} />)
    expect(screen.queryByTestId('form-logger')).toBeNull()
  })

  it('error al leer: el mensaje se muestra y no se pierde el formulario', async () => {
    acc.importarLoggerAccion.mockResolvedValueOnce({ ok: false, mensaje: 'No pudimos leer ese archivo', errores: { archivo: 'No pudimos leer ese archivo' } })
    render(<PanelLecturasLogger rutaId="r1" logger={[]} fechaRuta="2026-10-19" puedeImportar cerrada sinSalir={false} />)
    await userEvent.upload(screen.getByTestId('logger-archivo'), new File(['x'], 'raro.pdf', { type: 'application/pdf' }))
    fireEvent.submit(screen.getByTestId('form-logger')) // jsdom no da por llenado un archivo con `required`: se envía el formulario directo
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos leer ese archivo')
    expect(screen.getByTestId('form-logger')).toBeInTheDocument()
  })

  it('el historial guarda las lecturas anteriores', () => {
    render(<PanelLecturasLogger rutaId="r1" logger={[vista([22, 23]), vista([20, 21], { id: 'l0', vigente: false, lecturas: [] })]} fechaRuta="2026-10-19" puedeImportar cerrada sinSalir={false} />)
    expect(screen.getByTestId('logger-historial')).toHaveTextContent('Lecturas anteriores (1)')
  })

  it('el gráfico no se dibuja con menos de dos lecturas', () => {
    const { container } = render(<GraficoLecturas lecturas={lecturas([22])} limite={24.9} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('cierre de la ruta con el archivo del data logger', () => {
  const ruta: RutaVista = { id: 'r1', numero: 'RUT-2026-00001', fecha: '2026-10-19', estado: 'EN_RUTA', version: 1, paradas: [], versiones: [] } as unknown as RutaVista
  const registro = () => armarRegistroLsFr(ruta)

  it('al elegir el archivo se lee, se muestra lo encontrado y se llenan la mínima y la máxima', async () => {
    const inf = { formato: 'PDF' as const, modelo: 'RC-61', intervaloMin: 5, avisos: [], lecturas: lecturas([22, 23.5, 24.1]) }
    acc.leerLoggerAccion.mockResolvedValueOnce({ ok: true, resumen: resumenDeInforme(inf) })
    render(<PanelLsFr ruta={ruta} registro={registro()} puedeCerrar puedeRegistrar />)
    await userEvent.upload(screen.getByTestId('cierre-archivo'), new File(['x'], 'informe.pdf', { type: 'application/pdf' }))
    expect(await screen.findByTestId('logger-leido-ok')).toHaveTextContent('Leímos 3 lecturas')
    expect(screen.getByTestId('cierre-min')).toHaveValue('22,0')
    expect(screen.getByTestId('cierre-max')).toHaveValue('24,1')
    expect(screen.getByTestId('ayuda-temperatura')).toHaveTextContent('El límite en ruta es 24,9 °C, siempre')
  })

  it('con lecturas sobre el límite avisa antes de cerrar a quién se va a alertar', async () => {
    const inf = { formato: 'PDF' as const, avisos: [], lecturas: lecturas([22, 25.3, 24]) }
    acc.leerLoggerAccion.mockResolvedValueOnce({ ok: true, resumen: resumenDeInforme(inf) })
    render(<PanelLsFr ruta={ruta} registro={registro()} puedeCerrar puedeRegistrar />)
    await userEvent.upload(screen.getByTestId('cierre-archivo'), new File(['x'], 'informe.pdf', { type: 'application/pdf' }))
    expect(await screen.findByTestId('logger-leido-excede')).toHaveTextContent('Al cerrar la ruta avisamos a Dirección Técnica y al Jefe de Transporte')
    expect(screen.getByTestId('cierre-max')).toHaveValue('25,3')
  })

  it('si no se puede leer, lo dice y deja anotar a mano; cerrar igual funciona', async () => {
    acc.leerLoggerAccion.mockResolvedValueOnce({ ok: false, mensaje: 'No pudimos leer las lecturas de ese archivo.', errores: { archivo: 'No pudimos leer las lecturas de ese archivo.' } })
    render(<PanelLsFr ruta={ruta} registro={registro()} puedeCerrar puedeRegistrar />)
    await userEvent.upload(screen.getByTestId('cierre-archivo'), new File(['x'], 'raro.gsp', { type: 'application/octet-stream' }))
    expect(await screen.findByTestId('cierre-no-leido')).toHaveTextContent('Puedes cerrar la ruta igual')
    await userEvent.type(screen.getByTestId('cierre-min'), '17,5'); await userEvent.type(screen.getByTestId('cierre-max'), '22,8')
    fireEvent.submit(screen.getByTestId('form-cierre'))
    await waitFor(() => expect(acc.cerrarRutaAccion).toHaveBeenCalledTimes(1))
    const fd = acc.cerrarRutaAccion.mock.calls[0][0] as FormData
    expect([fd.get('rutaId'), fd.get('tempMin'), fd.get('tempMax')]).toEqual(['r1', '17,5', '22,8'])
  })
})
