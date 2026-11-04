// @vitest-environment jsdom
// Piloto C y F: cuadro de firma (Borrar / Listo), firmas del acta en orden, corrección de la fecha del lote y marca de proveedores.
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const acc = vi.hoisted(() => {
  const ok = async (..._a: unknown[]) => ({ ok: true as const }) as unknown
  return {
    anularActaAccion: vi.fn(ok), confirmarIngresoAccion: vi.fn(ok), firmarActaAccion: vi.fn(ok), generarActaAccion: vi.fn(ok), reemitirActaAccion: vi.fn(ok),
    corregirVencimientoLoteAccion: vi.fn(ok), marcarProveedorVencimientoAccion: vi.fn(ok), aprobarVersionFormatoAccion: vi.fn(ok),
  }
})
vi.mock('@/app/acciones-entradas', () => acc)
import { CuadroFirma } from '@/components/firma/cuadro-firma'
import { PanelActa } from '@/components/entradas/panel-acta'
import { PanelVencimiento } from '@/components/lotes/panel-vencimiento'
import { ListaProveedores } from '@/components/proveedores/lista-proveedores'
import { PanelFormato } from '@/components/calidad/panel-formato'
import type { SolicitudDetalle } from '@/domain/entradas-vistas'

beforeEach(() => {
  Object.values(acc).forEach((f) => f.mockClear())
  // jsdom no trae canvas: un contexto mínimo y un PNG fijo.
  const ctx = { scale: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {} }
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,FIRMA'
  Element.prototype.setPointerCapture = () => {}
})

const dibujar = (lienzo: HTMLElement) => {
  fireEvent.pointerDown(lienzo, { clientX: 5, clientY: 5, pointerId: 1 })
  fireEvent.pointerMove(lienzo, { clientX: 40, clientY: 30, pointerId: 1 })
  fireEvent.pointerUp(lienzo, { pointerId: 1 })
}

describe('cuadro de firma reutilizable', () => {
  it('«Listo» y «Borrar» empiezan apagados; tras dibujar, Listo entrega la imagen y Borrar la quita', async () => {
    const onListo = vi.fn()
    render(<CuadroFirma onListo={onListo} />)
    expect(screen.getByTestId('firma-lista')).toBeDisabled()
    expect(screen.getByTestId('borrar-firma')).toBeDisabled()
    expect(screen.getByTestId('estado-firma')).toHaveTextContent('Dibuja la firma en el cuadro.')
    dibujar(screen.getByTestId('lienzo-firma'))
    expect(onListo).not.toHaveBeenCalled()        // dibujar solo no firma: falta «Listo»
    expect(screen.getByTestId('estado-firma')).toHaveTextContent('pulsa «Listo»')
    await userEvent.click(screen.getByTestId('firma-lista'))
    expect(onListo).toHaveBeenLastCalledWith('data:image/png;base64,FIRMA')
    expect(screen.getByTestId('estado-firma')).toHaveTextContent('Firma lista')
    expect(screen.getByTestId('firma-lista')).toBeDisabled()
    await userEvent.click(screen.getByTestId('borrar-firma'))
    expect(onListo).toHaveBeenLastCalledWith(null)
    expect(screen.getByTestId('firma-lista')).toBeDisabled()
  })
  it('es táctil y legible en el teléfono: el lienzo no deja que la pantalla se desplace al dibujar y los botones miden 48 px', () => {
    render(<CuadroFirma onListo={() => {}} />)
    expect(screen.getByTestId('lienzo-firma').className).toContain('touch-none')
    expect(screen.getByTestId('firma-lista').className).toContain('btn-primary')   // .btn-primary y .btn-secondary usan min-h-12
    expect(screen.getByTestId('borrar-firma').className).toContain('btn-secondary')
  })
})

const firma = (rol: 'TRANSPORTISTA' | 'RESPONSABLE_CONTEO' | 'JEFE_ALMACEN' | 'DIRECCION_TECNICA', nombre: string, extra: object = {}) => ({ rol, nombre, firmadoEn: '2026-11-04T15:00:00Z', hash: 'h', capturadoPor: 'Christians', ...extra })
function solicitud(firmas: ReturnType<typeof firma>[]): SolicitudDetalle {
  const hechas = new Set(firmas.map((f) => f.rol))
  return {
    id: 's1', tipo: 'COMPRA_LOCAL', estado: 'EN_RECEPCION', recepcion: { confirmado: false, placa: 'ABC-123' },
    actas: [{ id: 'a1', numero: 'I-202611-0001', estado: 'BORRADOR', hash: 'x'.repeat(64), generadaEn: '2026-11-04T14:00:00Z', firmas,
      faltan: ['TRANSPORTISTA', 'RESPONSABLE_CONTEO', 'JEFE_ALMACEN', 'DIRECCION_TECNICA'].filter((r) => !hechas.has(r as never)), contenido: {} }],
    bloqueadoPorFirmas: firmas.length > 0,
  } as unknown as SolicitudDetalle
}

describe('firmas del acta de recepción', () => {
  it('al inicio le toca al transportista: los demás esperan su turno y nadie puede firmar fuera de orden', () => {
    render(<PanelActa solicitud={solicitud([])} roles={['jefe_almacen', 'direccion_tecnica']} motivoSinActa={null} base="" />)
    expect(screen.getByTestId('le-toca')).toHaveTextContent('Ahora le toca a Transportista')
    expect(screen.getByTestId('abrir-transportista')).toBeInTheDocument()
    expect(screen.getByTestId('turno-DIRECCION_TECNICA')).toHaveTextContent('Espera su turno: antes firma Transportista')
    expect(screen.queryByTestId('firmar-DIRECCION_TECNICA')).toBeNull()
    expect(screen.queryByTestId('firmar-JEFE_ALMACEN')).toBeNull()
    expect(screen.getByTestId('orden-firmas')).toHaveTextContent('propio celular o PC, con su propio usuario')
  })
  it('el botón de cada parte aparece solo cuando le toca y es de quien tiene ese rol; se ve quién registró al transportista', () => {
    const t = firma('TRANSPORTISTA', 'Pedro Quispe', { dni: '45678912', placa: 'ABC-123', imagenRef: 'firmas/' + 'a'.repeat(16) + '-' + 'b'.repeat(64) + '.png', imagenHash: 'b'.repeat(64) })
    const { rerender } = render(<PanelActa solicitud={solicitud([t])} roles={['direccion_tecnica']} motivoSinActa={null} base="/wms" />)
    expect(screen.getByTestId('le-toca')).toHaveTextContent('Responsable de conteo')
    expect(screen.queryByTestId('firmar-DIRECCION_TECNICA')).toBeNull()
    expect(within(screen.getByTestId('firma-TRANSPORTISTA')).getByTestId('capturado-por')).toHaveTextContent('Registró: Christians')
    expect(within(screen.getByTestId('firma-TRANSPORTISTA')).getByRole('img', { name: /Firma de Pedro Quispe/ })).toHaveAttribute('src', '/wms/entradas/s1/acta/a1/firma')
    rerender(<PanelActa solicitud={solicitud([t, firma('RESPONSABLE_CONTEO', 'Christians'), firma('JEFE_ALMACEN', 'Charlie')])} roles={['direccion_tecnica']} motivoSinActa={null} base="/wms" />)
    expect(screen.getByTestId('firmar-DIRECCION_TECNICA')).toBeInTheDocument()
  })
  it('para registrar al transportista hay que dibujar y pulsar «Listo»; la acción lleva nombre, DNI, placa e imagen', async () => {
    render(<PanelActa solicitud={solicitud([])} roles={['jefe_almacen']} motivoSinActa={null} base="" />)
    await userEvent.click(screen.getByTestId('abrir-transportista'))
    expect(screen.getByTestId('firmar-transportista')).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Pedro Quispe')
    await userEvent.type(screen.getByLabelText('DNI'), '45678912')
    dibujar(screen.getByTestId('lienzo-firma'))
    expect(screen.getByTestId('firmar-transportista')).toBeDisabled()
    await userEvent.click(screen.getByTestId('firma-lista'))
    await userEvent.click(screen.getByTestId('firmar-transportista'))
    expect(acc.firmarActaAccion).toHaveBeenCalledWith('a1', { rol: 'TRANSPORTISTA', nombre: 'Pedro Quispe', dni: '45678912', placa: 'ABC-123', imagen: 'data:image/png;base64,FIRMA' })
  })
})

describe('corregir la fecha de un lote', () => {
  const h = [{ id: '1', loteId: 'l', antes: '2028-06-01', despues: '2028-06-30', motivo: 'El envase dice 30', usuario: 'Charlie', ts: '2026-11-04T15:00:00Z' }]
  it('muestra «MM/AAAA (solo mes y año)», el historial y pide motivo; sin permiso no hay botón', async () => {
    const { rerender } = render(<PanelVencimiento loteId="l" vence="2028-06-01" venceTexto="06/2028" historia={h} puedeCorregir />)
    expect(screen.getByTestId('vence-lote')).toHaveTextContent('06/2028 (solo mes y año)')
    expect(screen.getByTestId('cambio-vence')).toHaveTextContent('Motivo: El envase dice 30')
    await userEvent.click(screen.getByTestId('abrir-corregir-vence'))
    await userEvent.type(screen.getByLabelText('Fecha correcta'), '30/06/2028')
    await userEvent.type(screen.getByLabelText(/Motivo/), 'El envase dice 30/06/2028')
    await userEvent.click(screen.getByTestId('guardar-corregir-vence'))
    expect(acc.corregirVencimientoLoteAccion).toHaveBeenCalledWith('l', '30/06/2028', 'El envase dice 30/06/2028')
    rerender(<PanelVencimiento loteId="l" vence="2028-06-01" historia={[]} puedeCorregir={false} />)
    expect(screen.queryByTestId('abrir-corregir-vence')).toBeNull()
    expect(screen.getByTestId('historial-vence-vacio')).toBeInTheDocument()
  })
})

describe('proveedores y versiones de formato', () => {
  const lista = [{ ruc: '20600000999', nombre: 'Daré Pharma', soloMesAnio: true }, { ruc: '20100000001', nombre: 'Distribuidora Andina', soloMesAnio: false }]
  it('lista, busca, marca con motivo y muestra el vacío', async () => {
    const { rerender } = render(<ListaProveedores proveedores={lista} puedeMarcar />)
    expect(within(screen.getAllByTestId('fila-proveedor')[0]).getByTestId('marca-solo-mes-anio')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Buscar/), 'andina')
    expect(screen.getAllByTestId('fila-proveedor')).toHaveLength(1)
    await userEvent.click(screen.getByTestId('cambiar-marca'))
    await userEvent.type(screen.getByLabelText(/Motivo/), 'Solo imprime mes y año')
    await userEvent.click(screen.getByTestId('guardar-marca'))
    expect(acc.marcarProveedorVencimientoAccion).toHaveBeenCalledWith('20100000001', 'Distribuidora Andina', true, 'Solo imprime mes y año')
    await userEvent.type(screen.getByLabelText(/Buscar/), 'zzz')
    expect(screen.getByTestId('proveedores-sin-resultados')).toBeInTheDocument()
    rerender(<ListaProveedores proveedores={[]} puedeMarcar={false} />)
    expect(screen.getByTestId('proveedores-vacio')).toBeInTheDocument()
  })
  it('la versión pendiente solo la aprueba Dirección Técnica', async () => {
    const v = [{ formato: 'ACTA_ORGANOLEPTICA' as const, version: 1, resumen: 'a', estado: 'APROBADA' as const }, { formato: 'ACTA_ORGANOLEPTICA' as const, version: 2, resumen: 'b', estado: 'PENDIENTE' as const }]
    const { rerender } = render(<PanelFormato formato="ACTA_ORGANOLEPTICA" versiones={v} puedeAprobar={false} />)
    expect(screen.getByTestId('panel-formato')).toHaveTextContent('Hoy rige la versión 1')
    expect(screen.queryByTestId('aprobar-version-2')).toBeNull()
    rerender(<PanelFormato formato="ACTA_ORGANOLEPTICA" versiones={v} puedeAprobar />)
    await userEvent.click(screen.getByTestId('aprobar-version-2'))
    expect(acc.aprobarVersionFormatoAccion).toHaveBeenCalledWith('ACTA_ORGANOLEPTICA', 2)
  })
})
