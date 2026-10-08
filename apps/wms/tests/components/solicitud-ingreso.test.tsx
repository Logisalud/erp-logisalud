// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
const { verificarLineaAccion, ajustarSolicitudAccion } = vi.hoisted(() => ({
  verificarLineaAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, verificadas: 1, total: 1 })),
  ajustarSolicitudAccion: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, version: 3 })),
}))
vi.mock('@/app/acciones-entradas', () => ({ verificarLineaAccion, ajustarSolicitudAccion, buscarProductosAccion: async () => [] }))
import { BloqueCantidadFisica } from '@/components/entradas/bloque-fisico'
import { LineasSolicitud } from '@/components/entradas/lineas-solicitud'
import type { BloqueFisico, SolicitudDetalle } from '@/domain/entradas-vistas'

const base: SolicitudDetalle = {
  id: 's1', numero: 'SI-2026-00001', tipo: 'COMPRA_LOCAL', estado: 'EN_RECEPCION', paso: 'VERIFICANDO', version: 1, propietarioId: 'p', propietario: 'LOGISSA',
  ocId: 'oc1', ocCodigo: 'OC-1', origenCreacion: 'INTERNO', creadoEn: '2026-10-08T10:00:00Z', cambios: [], versiones: [], actas: [], organolepticas: [], alertas: [],
  bloqueadoPorFirmas: false, conDiferencias: false, cantidadFisica: [], estadoInicial: 'CUARENTENA',
  lineas: [{ id: 'l1', productoId: 'prod', codigo: 'DEMO-001', descripcion: 'Dapagliflozina 10 mg', lote: 'L1', vence: '2028-06-30', cantidad: 50, inicial: 50, estadoLinea: 'ESPERADA', verificacion: 'PENDIENTE' }],
}
const posiciones = [{ id: 'pos:A-6', codigo: 'A-6', area: 'Cuarentena', ocupadas: 0 }]

beforeEach(() => { verificarLineaAccion.mockClear(); ajustarSolicitudAccion.mockClear() })

describe('verificar lo que llegó', () => {
  it('muestra lo que esperamos y dos caminos: Coincide o Hay una diferencia', async () => {
    render(<LineasSolicitud solicitud={base} posiciones={posiciones} hoy="2026-10-08" puedeRecibir puedeAjustar />)
    expect(screen.getByText(/Esto es lo que esperamos/)).toBeInTheDocument()
    expect(screen.getByTestId('progreso-verificacion')).toHaveTextContent('Verificadas 0 de 1')
    await userEvent.click(screen.getByTestId('coincide'))
    await waitFor(() => expect(verificarLineaAccion).toHaveBeenCalledWith('s1', 'l1', { coincide: true, posicionId: 'pos:A-6' }))
  })

  it('una diferencia de cantidad dice "Actualizaremos la Solicitud de 50 → 45" y pide el motivo', async () => {
    render(<LineasSolicitud solicitud={base} posiciones={posiciones} hoy="2026-10-08" puedeRecibir puedeAjustar />)
    await userEvent.click(screen.getByTestId('hay-diferencia'))
    const guardar = screen.getByTestId('actualizar-continuar')
    expect(guardar).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Cantidad encontrada/), { target: { value: '45' } })
    expect(screen.getByTestId('texto-diferencia')).toHaveTextContent('Actualizaremos la Solicitud de 50 → 45. El cambio quedará registrado.')
    expect(guardar).toBeDisabled() // falta el motivo
    await userEvent.type(screen.getByLabelText(/¿Por qué cambia\?/), 'Faltaron 5')
    expect(guardar).toBeEnabled()
    await userEvent.click(guardar)
    await waitFor(() => expect(verificarLineaAccion).toHaveBeenCalledWith('s1', 'l1', expect.objectContaining({ coincide: false, cantidad: 45, motivo: 'Faltaron 5', posicionId: 'pos:A-6' })))
  })

  it('sin permiso de recepción no hay botones de verificación', () => {
    render(<LineasSolicitud solicitud={base} posiciones={posiciones} hoy="2026-10-08" puedeRecibir={false} puedeAjustar={false} />)
    expect(screen.queryByTestId('coincide')).toBeNull()
    expect(screen.getByTestId('cantidad-linea')).toHaveTextContent('50')
  })

  it('una línea ajustada muestra inicial → final', () => {
    const s = { ...base, lineas: [{ ...base.lineas[0], cantidad: 45, estadoLinea: 'AJUSTADA' as const, verificacion: 'AJUSTADA' as const, posicionCodigo: 'A-6' }] }
    render(<LineasSolicitud solicitud={s} posiciones={posiciones} hoy="2026-10-08" puedeRecibir puedeAjustar />)
    expect(screen.getByTestId('cambio-cantidad')).toHaveTextContent('inicial 50 → final 45')
    expect(screen.getByText('Se ajustó')).toBeInTheDocument()
  })
})

describe('Cantidad física confirmada', () => {
  const bloque = (estado: BloqueFisico['estado']): BloqueFisico => ({ ocItemId: 'oi', productoId: 'prod', descripcion: 'Dapagliflozina 10 mg', ocCodigo: 'OC-1', fisica: 45, base: 0, esperado: 45, registrado: estado === 'OK' ? 45 : 0, estado })

  it('muestra el valor grande, el enlace a Compras y el estado en palabras', () => {
    render(<BloqueCantidadFisica bloques={[bloque('FALTA')]} ocId="oc1" ocCodigo="OC-1" solicitudNumero="SI-2026-00001" />)
    expect(screen.getByRole('heading', { name: 'Cantidad física confirmada' })).toBeInTheDocument()
    expect(screen.getByTestId('valor-fisico')).toHaveTextContent('45')
    expect(screen.getByText('Falta registrarlo en Compras')).toBeInTheDocument()
    expect(screen.getByTestId('abrir-compras')).toHaveAttribute('href', '/compras/almacen/recepciones/nueva/oc1')
    expect(screen.getByText(/se copia a mano/)).toBeInTheDocument()
  })

  it('el botón Copiar deja el valor en el portapapeles', async () => {
    const escribir = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escribir }, configurable: true })
    render(<BloqueCantidadFisica bloques={[bloque('FALTA')]} ocId="oc1" ocCodigo="OC-1" solicitudNumero="SI-2026-00001" />)
    await userEvent.click(screen.getByTestId('copiar-fisico'))
    await waitFor(() => expect(escribir).toHaveBeenCalledWith('45'))
    expect(await screen.findByText('Copiado')).toBeInTheDocument()
  })

  it('cuando Compras ya lo registró, pasa a verde y ya no pide copiar', () => {
    render(<BloqueCantidadFisica bloques={[bloque('OK')]} ocId="oc1" ocCodigo="OC-1" solicitudNumero="SI-2026-00001" />)
    expect(screen.getByText('Compras ya lo tiene registrado')).toBeInTheDocument()
    expect(screen.queryByTestId('abrir-compras')).toBeNull()
  })

  it('con varias líneas ofrece "Copiar todo"', () => {
    render(<BloqueCantidadFisica bloques={[bloque('FALTA'), { ...bloque('NO_COINCIDE'), ocItemId: 'oi2', descripcion: 'Otro' }]} ocId="oc1" ocCodigo="OC-1" solicitudNumero="SI-1" />)
    expect(screen.getByTestId('copiar-todo')).toBeInTheDocument()
    expect(screen.getAllByTestId('fila-fisica')).toHaveLength(2)
  })
})
