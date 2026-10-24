import { describe, expect, it } from 'vitest'
import {
  armarBandeja, bandejaDeFila, compararVersion, contarPorEstado, filtrarBandeja, hace, planificarImportacion, resumirCambios, validarPedidos,
  type PedidoBandeja, type PedidoSnapshot,
} from '@/domain/pedidos-despacho'

const pedido = (extra: Partial<PedidoSnapshot> = {}): PedidoSnapshot => ({
  pedidoId: 'p-1', numero: 'PED-0001', version: 1, estado: 'READY_FOR_OPERATIONS', fecha: '2026-10-13', modificadoEn: '2026-10-13T15:00:00Z',
  cliente: { id: 'c-1', nombre: 'Botica Salud SAC', ruc: '20123456789', direccion: 'Av. Lima 123', ventanaCita: 'L-V 8:00-12:00' },
  lineas: [{ lineaId: 'l-1', productoCodigo: 'LIZI-10', descripcion: 'Lizinopril 10 mg', cantidad: 20 }, { lineaId: 'l-2', productoCodigo: 'DAPA-10', descripcion: 'Dapagliflozina 10 mg', cantidad: 5 }],
  ...extra,
})
const crudo = (p: PedidoSnapshot) => JSON.parse(JSON.stringify(p))

describe('contrato con Pedidos: validarPedidos', () => {
  it('acepta un pedido listo y conserva el snapshot del cliente', () => {
    const r = validarPedidos([crudo(pedido())])
    expect(r.descartados).toEqual([])
    expect(r.pedidos[0]).toMatchObject({ pedidoId: 'p-1', version: 1, cliente: { nombre: 'Botica Salud SAC', ruc: '20123456789' } })
    expect(r.pedidos[0].lineas).toHaveLength(2)
  })

  it('descarta solo el pedido malo, con su motivo, y deja pasar a los demás', () => {
    const malos = [
      { ...crudo(pedido()), pedidoId: undefined }, { ...crudo(pedido()), numero: '' }, { ...crudo(pedido()), version: 0 }, { ...crudo(pedido()), version: 1.5 },
      { ...crudo(pedido()), estado: 'DRAFT' }, { ...crudo(pedido()), fecha: 'ayer' }, { ...crudo(pedido()), cliente: { id: 'c' } }, { ...crudo(pedido()), lineas: [] },
      { ...crudo(pedido()), lineas: [{ lineaId: 'l', productoCodigo: 'X', cantidad: 0 }] }, { ...crudo(pedido()), lineas: [{ lineaId: 'l', productoCodigo: 'X', cantidad: 2 }, { lineaId: 'l', productoCodigo: 'Y', cantidad: 2 }] },
      'texto', null,
    ]
    const r = validarPedidos([...malos, crudo(pedido({ pedidoId: 'p-ok', numero: 'PED-OK' }))])
    expect(r.pedidos.map((p) => p.pedidoId)).toEqual(['p-ok'])
    expect(r.descartados).toHaveLength(malos.length)
    expect(r.descartados.map((d) => d.motivo).join(' | ')).toMatch(/READY_FOR_OPERATIONS/)
  })

  it('una respuesta que no es una lista se rechaza entera; la misma versión repetida cuenta una vez', () => {
    expect(validarPedidos({ pedidos: [] }).descartados[0].motivo).toMatch(/lista de pedidos/)
    const r = validarPedidos([crudo(pedido()), crudo(pedido())])
    expect(r.pedidos).toHaveLength(1)
    expect(r.descartados[0].motivo).toMatch(/repetido/)
  })
})

describe('contrato con Pedidos: pedido cancelado (SA-3)', () => {
  const cancelado = (extra: Record<string, unknown> = {}) => ({ ...crudo(pedido({ version: 2 })), estado: 'CANCELLED', motivoCancelacion: 'El cliente ya no lo necesita', canceladoPor: 'Rosa Paredes', ...extra })

  it('acepta CANCELLED con su motivo y quién lo canceló; conserva las líneas tal como estaban', () => {
    const r = validarPedidos([cancelado()])
    expect(r.descartados).toEqual([])
    expect(r.pedidos[0]).toMatchObject({ estado: 'CANCELLED', version: 2, motivoCancelacion: 'El cliente ya no lo necesita', canceladoPor: 'Rosa Paredes' })
    expect(r.pedidos[0].lineas).toHaveLength(2)
  })
  it('también acepta los nombres en snake_case (motivo_cancelacion, cancelado_por)', () => {
    const r = validarPedidos([{ ...cancelado({ motivoCancelacion: undefined, canceladoPor: undefined }), motivo_cancelacion: 'Duplicado', cancelado_por: 'Ana' }])
    expect(r.pedidos[0]).toMatchObject({ motivoCancelacion: 'Duplicado', canceladoPor: 'Ana' })
  })
  it('un cancelado sin motivo se descarta con su razón; los demás estados siguen sin aceptarse', () => {
    const r = validarPedidos([cancelado({ motivoCancelacion: '  ' }), { ...crudo(pedido({ pedidoId: 'p-2', numero: 'PED-2' })), estado: 'DRAFT' }])
    expect(r.pedidos).toEqual([])
    expect(r.descartados.map((d) => d.motivo)).toEqual(['Un pedido cancelado trae el motivo de la cancelación (motivoCancelacion).', 'Solo se importan pedidos READY_FOR_OPERATIONS o CANCELLED.'])
  })
  it('un pedido listo no arrastra campos de cancelación', () => {
    expect(validarPedidos([{ ...crudo(pedido()), motivoCancelacion: 'x' }]).pedidos[0]).not.toHaveProperty('motivoCancelacion')
  })
  it('resumirCambios dice que se canceló, con el motivo, y nada más', () => {
    const v2 = validarPedidos([cancelado()]).pedidos[0]
    expect(resumirCambios(pedido(), v2)).toEqual(['El pedido se canceló en Pedidos: El cliente ya no lo necesita'])
  })
  it('en la bandeja queda como «Cancelado en Pedidos», con su motivo, al final y sin ser «Por planificar»', () => {
    const v2 = validarPedidos([cancelado()]).pedidos[0]
    const b = bandejaDeFila({ id: 'f', snapshot: v2, cambios: [], cambioPendiente: true, salida: 'OS-2026-00001', importadoEn: '2026-10-13T15:00:00Z', codigosEnCatalogo: new Set() })
    expect(b).toMatchObject({ estado: 'CANCELADO_EN_PEDIDOS', motivoCancelacion: 'El cliente ya no lo necesita', canceladoPor: 'Rosa Paredes' })
    const normal = bandejaDeFila({ id: 'g', snapshot: pedido({ pedidoId: 'p-9', numero: 'PED-9' }), cambios: [], cambioPendiente: false, importadoEn: '2026-10-13T15:00:00Z', codigosEnCatalogo: new Set() })
    expect(filtrarBandeja([b, normal], { q: '', estado: '' }).map((p) => p.numero)).toEqual(['PED-9', 'PED-0001'])
    expect(contarPorEstado([b, normal]).CANCELADO_EN_PEDIDOS).toBe(1)
  })
})

describe('versionado: importar es idempotente', () => {
  it('compara la versión recibida con la vigente', () => {
    expect(compararVersion(undefined, 1)).toBe('NUEVO')
    expect(compararVersion(2, 2)).toBe('IGUAL')
    expect(compararVersion(2, 3)).toBe('NUEVA_VERSION')
    expect(compararVersion(3, 2)).toBe('ANTIGUA')
  })

  it('importar dos veces lo mismo no duplica; una versión nueva reemplaza como vigente y lista lo que cambió; una vieja no pisa nada', () => {
    const v1 = pedido(); const v2 = pedido({ version: 2, lineas: [{ lineaId: 'l-1', productoCodigo: 'LIZI-10', descripcion: 'Lizinopril 10 mg', cantidad: 30 }, { lineaId: 'l-3', productoCodigo: 'OMEP-20', descripcion: 'Omeprazol 20 mg', cantidad: 8 }] })
    const vacio = new Map<string, PedidoSnapshot>()
    const a = planificarImportacion(vacio, [v1])
    expect(a.resumen).toEqual({ nuevos: 1, nuevasVersiones: 0, iguales: 0, antiguas: 0 })
    const vigentes = new Map([[v1.pedidoId, v1]])
    expect(planificarImportacion(vigentes, [v1]).resumen).toEqual({ nuevos: 0, nuevasVersiones: 0, iguales: 1, antiguas: 0 })
    const b = planificarImportacion(vigentes, [v2])
    expect(b.resumen.nuevasVersiones).toBe(1)
    expect(b.insertar[0].cambios).toEqual([
      'Lizinopril 10 mg: la cantidad pasó de 20 a 30', 'Se agregó Omeprazol 20 mg (8 u.)', 'Se quitó Dapagliflozina 10 mg (5 u.)',
    ])
    expect(planificarImportacion(new Map([[v2.pedidoId, v2]]), [v1]).resumen).toEqual({ nuevos: 0, nuevasVersiones: 0, iguales: 0, antiguas: 1 })
    // dos versiones nuevas en la misma respuesta: la más alta queda vigente
    const c = planificarImportacion(vacio, [pedido({ version: 3 }), v1])
    expect(c.insertar.map((x) => x.pedido.version)).toEqual([1, 3])
  })

  it('resume cambios del cliente, de la cita y de la condición de pago', () => {
    const nuevo = pedido({ version: 2, condicionPago: '30 días', cliente: { ...pedido().cliente, direccion: 'Jr. Ica 5', ventanaCita: 'L-V 14:00-17:00' } })
    expect(resumirCambios(pedido(), nuevo)).toEqual(['Cambió la dirección de entrega', 'Cambió la ventana de cita', 'Cambió la condición de pago'])
    // D-153: el vehículo calificado ya no se trae ni se compara; un pedido viejo que aún lo mande no genera aviso
    const conViejo = pedido({ version: 2, cliente: { ...pedido().cliente, ...({ vehiculoCalificado: 'Furgón' } as object) } })
    expect(resumirCambios(pedido(), conViejo)).toEqual([])
    expect(resumirCambios(pedido(), pedido({ version: 2 }))).toEqual([])
  })
})

describe('la bandeja', () => {
  const fila = (id: string, extra: Partial<PedidoBandeja> = {}): PedidoBandeja => armarBandeja({
    id, pedidoId: id, numero: `PED-${id}`, version: 1, fecha: '2026-10-13', clienteId: 'c', cliente: 'Botica Salud SAC', lineas: [{ lineaId: 'l', productoCodigo: 'LIZI-10', descripcion: 'Lizinopril 10 mg', cantidad: 20, enCatalogo: true }],
    estado: 'POR_PLANIFICAR', cambios: [], importadoEn: '2026-10-14T10:00:00Z', ...extra,
  })

  it('suma unidades, busca por pedido, cliente, RUC o producto sin importar tildes, y filtra por estado', () => {
    const f = [fila('1'), fila('2', { cliente: 'Farmacia Ángeles', ruc: '20999999999', estado: 'EN_SALIDA' }), fila('3', { estado: 'CAMBIO_POR_REVISAR', fecha: '2026-10-14' })]
    expect(f[0].unidades).toBe(20)
    expect(filtrarBandeja(f, { q: 'angeles', estado: '' }).map((p) => p.id)).toEqual(['2'])
    expect(filtrarBandeja(f, { q: '20999', estado: '' }).map((p) => p.id)).toEqual(['2'])
    expect(filtrarBandeja(f, { q: 'lizinopril', estado: '' })).toHaveLength(3)
    expect(filtrarBandeja(f, { q: '', estado: 'EN_SALIDA' }).map((p) => p.id)).toEqual(['2'])
  })

  it('lo que cambió va primero; luego el más antiguo', () => {
    const f = [fila('1', { fecha: '2026-10-14' }), fila('2', { fecha: '2026-10-10' }), fila('3', { estado: 'CAMBIO_POR_REVISAR', fecha: '2026-10-14' })]
    expect(filtrarBandeja(f, { q: '', estado: '' }).map((p) => p.id)).toEqual(['3', '2', '1'])
    expect(contarPorEstado(f)).toEqual({ POR_PLANIFICAR: 2, EN_SALIDA: 0, CAMBIO_POR_REVISAR: 1, CANCELADO_EN_PEDIDOS: 0 })
  })

  it('«hace X» en palabras', () => {
    const ahora = new Date('2026-10-14T12:00:00Z')
    expect(hace('2026-10-14T11:59:40Z', ahora)).toBe('hace un momento')
    expect(hace('2026-10-14T11:30:00Z', ahora)).toBe('hace 30 min')
    expect(hace('2026-10-14T09:00:00Z', ahora)).toBe('hace 3 h')
    expect(hace('2026-10-13T12:00:00Z', ahora)).toBe('hace 1 día')
    expect(hace('2026-10-10T12:00:00Z', ahora)).toBe('hace 4 días')
  })
})
