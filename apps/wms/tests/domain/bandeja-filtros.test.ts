// Fase 4 · P2/P8: filtro de la bandeja por zona de reparto y día planificado (el ruteo ya lo hizo Pedidos), y el orden de ruta para precargar paradas.
import { describe, expect, it } from 'vitest'
import { FILTROS_BANDEJA_VACIOS, SIN_VALOR, filtrarBandeja, opcionesDia, opcionesZona, ordenarPorRuteo, pedidosSinProcesar, resumirCambios, ruteoDe, validarPedidos } from '@/domain/pedidos-despacho'
import { paradasDeZona, zonasConPedidos, type PedidoPlanificable } from '@/domain/rutas'
import { pedidoBandeja, ZONAS } from '../components/ayudas-bandeja'

const lista = [
  pedidoBandeja(1, { zona: 'centro', dia: 1, ordenDistrito: 2 }), pedidoBandeja(2, { zona: 'centro', dia: 3, ordenDistrito: 1 }),
  pedidoBandeja(3, { zona: 'norte', dia: 1, ordenDistrito: 1 }), pedidoBandeja(4, {}), pedidoBandeja(5, { zona: 'norte', salida: 'OS-1' }),
]
const f = (x: Partial<typeof FILTROS_BANDEJA_VACIOS>) => ({ ...FILTROS_BANDEJA_VACIOS, ...x })

describe('filtrarBandeja por zona y día planificado', () => {
  it('sin filtro deja todo; por zona, por día, por los dos y «sin zona»/«sin día»', () => {
    expect(filtrarBandeja(lista, FILTROS_BANDEJA_VACIOS)).toHaveLength(5)
    expect(filtrarBandeja(lista, f({ zona: 'LIMA-CENTRO' })).map((p) => p.pedidoId)).toEqual(['ped-1', 'ped-2'])
    expect(filtrarBandeja(lista, f({ dia: '1' })).map((p) => p.pedidoId)).toEqual(['ped-1', 'ped-3'])
    expect(filtrarBandeja(lista, f({ zona: 'LIMA-NORTE', dia: '1' })).map((p) => p.pedidoId)).toEqual(['ped-3'])
    expect(filtrarBandeja(lista, f({ zona: SIN_VALOR })).map((p) => p.pedidoId)).toEqual(['ped-4'])
    expect(filtrarBandeja(lista, f({ dia: SIN_VALOR })).map((p) => p.pedidoId)).toEqual(['ped-4', 'ped-5'])
    expect(filtrarBandeja(lista, f({ zona: 'NO-EXISTE' }))).toEqual([])
  })
  it('los filtros viejos (solo q y estado) siguen funcionando, y la búsqueda encuentra por nombre de zona', () => {
    expect(filtrarBandeja(lista, { q: '', estado: 'EN_SALIDA' }).map((p) => p.pedidoId)).toEqual(['ped-5'])
    expect(filtrarBandeja(lista, { q: 'lima norte', estado: '' }).map((p) => p.pedidoId)).toEqual(['ped-3', 'ped-5'])
  })
  it('las opciones: zonas en el orden de ruta de Pedidos con su cantidad y «Sin zona» al final; días de lunes a domingo y «Sin día»', () => {
    expect(opcionesZona(lista)).toEqual([{ valor: 'LIMA-CENTRO', etiqueta: 'Lima Centro', cantidad: 2 }, { valor: 'LIMA-NORTE', etiqueta: 'Lima Norte', cantidad: 2 }, { valor: SIN_VALOR, etiqueta: 'Sin zona', cantidad: 1 }])
    expect(opcionesDia(lista).map((o) => [o.etiqueta, o.cantidad])).toEqual([['Lunes', 2], ['Miércoles', 1], ['Sin día', 2]])
  })
  it('solo los importados sin procesar (sin orden) se pueden crear', () => {
    expect(pedidosSinProcesar(lista).map((p) => p.pedidoId)).toEqual(['ped-1', 'ped-2', 'ped-3', 'ped-4'])
  })
})

describe('el ruteo que manda Pedidos', () => {
  const crudo = (extra: Record<string, unknown>) => ({ pedidoId: 'p1', numero: 'PED-1', version: 1, estado: 'READY_FOR_OPERATIONS', fecha: '2026-11-03', cliente: { id: 'c', nombre: 'C' }, lineas: [{ lineaId: 'l', productoCodigo: 'X', cantidad: 1 }], ...extra })
  it('se guarda con los nombres de Pedidos (snake_case); si no hay zona, todo queda vacío; lo que viene mal se ignora sin descartar el pedido', () => {
    const r = validarPedidos([
      crudo({ zona_reparto: { codigo: 'LIMA-SUR', nombre: 'Lima Sur', orden_ruta: 3 }, orden_distrito: 4, dia_planificado: 5, fecha_planificada: '2026-11-13' }),
      crudo({ pedidoId: 'p2', numero: 'PED-2', zona_reparto: null, orden_distrito: null, dia_planificado: null, fecha_planificada: null }),
      crudo({ pedidoId: 'p3', numero: 'PED-3', zona_reparto: { codigo: 'Z', nombre: 'Z', orden_ruta: 'x' }, dia_planificado: 9, fecha_planificada: 'mañana' }),
    ])
    expect(r.descartados).toEqual([])
    expect(r.pedidos[0]).toMatchObject({ zonaReparto: { codigo: 'LIMA-SUR', nombre: 'Lima Sur', ordenRuta: 3 }, ordenDistrito: 4, diaPlanificado: 5, fechaPlanificada: '2026-11-13' })
    expect(ruteoDe(r.pedidos[1] as never)).toEqual({}); expect(r.pedidos[1].zonaReparto).toBeUndefined()
    expect(r.pedidos[2].zonaReparto).toEqual({ codigo: 'Z', nombre: 'Z', ordenRuta: 9999 }); expect(r.pedidos[2].diaPlanificado).toBeUndefined(); expect(r.pedidos[2].fechaPlanificada).toBeUndefined()
  })
  it('una versión nueva que cambia la zona o el día lo avisa', () => {
    const [a] = validarPedidos([crudo({ zona_reparto: { codigo: 'LIMA-SUR', nombre: 'Lima Sur', orden_ruta: 3 }, dia_planificado: 5 })]).pedidos
    const [b] = validarPedidos([crudo({ version: 2, zona_reparto: { codigo: 'LIMA-NORTE', nombre: 'Lima Norte', orden_ruta: 2 }, dia_planificado: 2 })]).pedidos
    expect(resumirCambios(a, b)).toEqual(['Cambió la zona de reparto (ahora Lima Norte)', 'Cambió el día planificado de reparto'])
    expect(resumirCambios(a, a)).toEqual([])
  })
})

describe('orden de ruta para precargar paradas', () => {
  const plan = (n: number, zona: keyof typeof ZONAS | undefined, od: number | undefined, extra: Partial<PedidoPlanificable> = {}): PedidoPlanificable => ({ pedidoId: `p${n}`, numero: `PED-${n}`, cliente: `C${n}`, lineas: 1, unidades: 5, importadoEn: '2026-11-03T10:00:00Z', cambioPorRevisar: false, sinCatalogo: [], zonaReparto: zona ? ZONAS[zona] : undefined, ordenDistrito: od, ...extra })
  const ps = [plan(1, 'norte', 2), plan(2, 'centro', 3), plan(3, 'centro', 1), plan(4, undefined, undefined), plan(5, 'norte', 1), plan(6, 'centro', 2, { enRuta: 'RUT-1' })]
  it('primero la zona (orden_ruta), luego el distrito (orden_distrito); sin zona al final', () => {
    expect(ordenarPorRuteo(ps).map((p) => p.numero)).toEqual(['PED-3', 'PED-6', 'PED-2', 'PED-5', 'PED-1', 'PED-4'])
  })
  it('precargar una zona trae solo lo cargable (no el que ya está en otra ruta), en ese orden, y no repite lo que ya está en el plan', () => {
    expect(paradasDeZona(ps, 'LIMA-CENTRO')).toEqual([{ pedidoId: 'p3' }, { pedidoId: 'p2' }])
    expect(paradasDeZona(ps, 'LIMA-CENTRO', new Set(['p3']))).toEqual([{ pedidoId: 'p2' }])
    expect(paradasDeZona(ps, 'LIMA-NORTE')).toEqual([{ pedidoId: 'p5' }, { pedidoId: 'p1' }])
    expect(paradasDeZona([plan(7, 'sur', 1, { sinCatalogo: ['X'] }), plan(8, 'sur', 2, { cambioPorRevisar: true })], 'LIMA-SUR')).toEqual([])
  })
  it('las zonas con pedidos por cargar, en orden de ruta y con su cantidad', () => {
    expect(zonasConPedidos(ps)).toEqual([{ codigo: 'LIMA-CENTRO', nombre: 'Lima Centro', cantidad: 2 }, { codigo: 'LIMA-NORTE', nombre: 'Lima Norte', cantidad: 2 }])
  })
})
