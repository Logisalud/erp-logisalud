// Fase 4 · P2: filtro de la bandeja por ruta y día de despacho.
import { describe, expect, it } from 'vitest'
import { FILTROS_BANDEJA_VACIOS, SIN_VALOR, filtrarBandeja, opcionesDe, pedidosSinProcesar, validarPedidos, bandejaDeFila } from '@/domain/pedidos-despacho'
import { pedidoBandeja } from '../components/ayudas-bandeja'

const lista = [
  pedidoBandeja(1, { ruta: 'Norte', diaDespacho: '2026-11-05' }), pedidoBandeja(2, { ruta: 'Norte', diaDespacho: '2026-11-06' }),
  pedidoBandeja(3, { ruta: 'Sur', diaDespacho: '2026-11-05' }), pedidoBandeja(4, {}), pedidoBandeja(5, { ruta: 'Sur', salida: 'OS-1' }),
]
const f = (x: Partial<typeof FILTROS_BANDEJA_VACIOS>) => ({ ...FILTROS_BANDEJA_VACIOS, ...x })

describe('filtrarBandeja por ruta y día', () => {
  it('sin filtro deja todo; por ruta, por día, por los dos y «sin ruta»/«sin día»', () => {
    expect(filtrarBandeja(lista, FILTROS_BANDEJA_VACIOS)).toHaveLength(5)
    expect(filtrarBandeja(lista, f({ ruta: 'Norte' })).map((p) => p.pedidoId)).toEqual(['ped-1', 'ped-2'])
    expect(filtrarBandeja(lista, f({ dia: '2026-11-05' })).map((p) => p.pedidoId)).toEqual(['ped-1', 'ped-3'])
    expect(filtrarBandeja(lista, f({ ruta: 'Sur', dia: '2026-11-05' })).map((p) => p.pedidoId)).toEqual(['ped-3'])
    expect(filtrarBandeja(lista, f({ ruta: SIN_VALOR })).map((p) => p.pedidoId)).toEqual(['ped-4'])
    expect(filtrarBandeja(lista, f({ dia: SIN_VALOR })).map((p) => p.pedidoId)).toEqual(['ped-4', 'ped-5'])
    expect(filtrarBandeja(lista, f({ ruta: 'Inexistente' }))).toEqual([])
  })
  it('los filtros viejos (solo q y estado) siguen funcionando', () => {
    expect(filtrarBandeja(lista, { q: '', estado: 'EN_SALIDA' }).map((p) => p.pedidoId)).toEqual(['ped-5'])
  })
  it('opcionesDe cuenta pedidos por ruta y por día y agrega «Sin ruta» / «Sin día» al final', () => {
    expect(opcionesDe(lista, 'ruta')).toEqual([{ valor: 'Norte', etiqueta: 'Norte', cantidad: 2 }, { valor: 'Sur', etiqueta: 'Sur', cantidad: 2 }, { valor: SIN_VALOR, etiqueta: 'Sin ruta', cantidad: 1 }])
    expect(opcionesDe(lista, 'diaDespacho').map((o) => [o.valor, o.cantidad])).toEqual([['2026-11-05', 2], ['2026-11-06', 1], [SIN_VALOR, 2]])
  })
  it('solo los importados sin procesar (sin orden) se pueden crear', () => {
    expect(pedidosSinProcesar(lista).map((p) => p.pedidoId)).toEqual(['ped-1', 'ped-2', 'ped-3', 'ped-4'])
  })
})

describe('de dónde sale la ruta y el día', () => {
  const crudo = (extra: Record<string, unknown>) => ({ pedidoId: 'p1', numero: 'PED-1', version: 1, estado: 'READY_FOR_OPERATIONS', fecha: '2026-11-03', cliente: { id: 'c', nombre: 'C' }, lineas: [{ lineaId: 'l', productoCodigo: 'X', cantidad: 1 }], ...extra })
  it('si Pedidos manda ruta (o zona) y día de despacho, se guardan; un día mal escrito se ignora sin descartar el pedido', () => {
    const r = validarPedidos([crudo({ zona: 'Callao', dia_despacho: '2026-11-07' }), crudo({ pedidoId: 'p2', numero: 'PED-2', ruta: 'Norte', diaDespacho: 'mañana' })])
    expect(r.descartados).toEqual([])
    expect(r.pedidos[0]).toMatchObject({ ruta: 'Callao', diaDespacho: '2026-11-07' })
    expect(r.pedidos[1].ruta).toBe('Norte'); expect(r.pedidos[1].diaDespacho).toBeUndefined()
  })
  it('si Pedidos no la manda, se usa la ruta planificada en el WMS; lo de Pedidos tiene prioridad', () => {
    const base = validarPedidos([crudo({})]).pedidos[0]
    const fila = (snapshot: typeof base) => bandejaDeFila({ id: 'f', snapshot, cambios: [], cambioPendiente: false, importadoEn: '2026-11-03T10:00:00Z', codigosEnCatalogo: new Set(), rutaWms: { numero: 'R-0007', fecha: '2026-11-08' } })
    expect(fila(base)).toMatchObject({ ruta: 'R-0007', diaDespacho: '2026-11-08' })
    expect(fila({ ...base, ruta: 'Norte', diaDespacho: '2026-11-09' })).toMatchObject({ ruta: 'Norte', diaDespacho: '2026-11-09' })
  })
})
