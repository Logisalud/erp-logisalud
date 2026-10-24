// SA-2 en el modo demostración: cómo iniciar una Orden de Salida (bandeja, ruta y a mano: A, B y C). Mismas reglas y mismas palabras que la migración 0028.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { codigosDemo } from '@/services/demo/salida-manual-demo'
import { estadoE } from '@/services/demo/entradas-demo'
import { sumarDias } from '@/services/demo/datos'
import type { Actor } from '@/services/repositorio'
import type { EntradaOrdenManual } from '@/domain/salida-manual'

const actor = (clave: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${clave}`, nombre: `${clave} (demo)`, roles })
const JT = actor('jefe_transporte', 'jefe_transporte', 'jefe_almacen')
const JA = actor('reemplazante_jefe', 'jefe_almacen')
const AUX = actor('auxiliar', 'auxiliar')
const MUESTRAS = actor('autoriza_salidas_sin_venta', 'autoriza_salidas_sin_venta')
const CLIENTE = { ruc: '20123456789', razonSocial: 'Botica Salud SAC', direccion: 'Av. Lima 123, Lima', ubigeo: '150101' }

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

/** Un producto con stock Aprobado de este propietario y un lote que vence en más de 120 días (para que sirva a una venta). */
async function conStock(codigo: string, minimo = 40) {
  const p = await repo.panorama()
  const prop = p.propietarios.find((x) => x.codigo === codigo)!
  const pos = new Map(p.posiciones.map((x) => [x.id, x]))
  const dias = (iso: string) => (Date.parse(iso) - Date.parse(p.hoy)) / 86_400_000
  const s = p.saldos.find((x) => x.propietarioId === prop.id && x.estado === 'APROBADO' && x.cantidad >= minimo && pos.get(x.posicionId)?.tipoArea === 'APROBADOS'
    && (p.lotes.find((l) => l.id === x.loteId)?.vence ?? '9999-12-31') > p.hoy && dias(p.lotes.find((l) => l.id === x.loteId)?.vence ?? '9999-12-31') > 120)
  if (!s) throw new Error(`Sin stock de prueba para ${codigo}`)
  return { propietarioId: prop.id, productoId: s.productoId, loteId: s.loteId, cantidad: s.cantidad, lote: p.lotes.find((l) => l.id === s.loteId)! }
}
/** Deja `cantidad` unidades de un lote en el área de Bajas (lo que una Orden de Baja traslada). */
function enBajas(propietarioId: string, productoId: string, codigo: string, cantidad: number) {
  const e = estadoE()
  const pos = e.panorama.posiciones.find((x) => x.tipoArea === 'BAJAS_RECHAZADOS')!
  const lote = { id: `lote:bajas-${codigo}`, productoId, codigo, vence: '2026-01-10', propietarioId }
  e.panorama.lotes.push(lote)
  e.panorama.saldos.push({ posicionId: pos.id, productoId, loteId: lote.id, propietarioId, estado: 'BAJAS_RECHAZADOS', procedenciaId: 'proc-bajas', cantidad })
  return lote.id
}
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { if (!r.ok) throw new Error((r as { mensaje?: string }).mensaje); return r as Extract<T, { ok: true }> }
const A = (productoId: string, cantidad: number, pedidoNumero = 'PED-MAN-001', extra: Partial<EntradaOrdenManual> = {}): EntradaOrdenManual => ({ clase: 'A', pedidoNumero, cliente: CLIENTE, lineas: [{ productoId, cantidad }], ...extra })
const B = (propietarioId: string, motivo: 'VENTA' | 'MUESTRA' | 'PESQUISA_DIGEMID' | 'DESTRUCCION', productoId: string, loteId: string, cantidad: number): EntradaOrdenManual =>
  ({ clase: 'B', propietarioId, greNumero: 'T001-00001234', greArchivo: 'gre-cliente/x.pdf', lineas: [{ productoId, loteId, cantidad, motivo }] })

describe('tipo A: venta manual de distribución (demo)', () => {
  it('la crea el Jefe de Transporte con su número de pedido: queda manual, por conciliar, con el cliente escrito y el stock asignado por FEFO', async () => {
    const s = await conStock('LOGISSA')
    const { ordenes } = ok(await repo.crearOrdenManual(A(s.productoId, 5), JT))
    expect(ordenes).toHaveLength(1)
    const v = (await repo.obtenerSalida(ordenes[0].id))!
    expect(v).toMatchObject({ pedidoNumero: 'PED-MAN-001', cliente: 'Botica Salud SAC', tipo: 'DISTRIBUCION', motivo: 'VENTA', origen: 'MANUAL', creadaDesde: 'MANUAL', porConciliar: true, etapa: 'ASIGNADA' })
    expect(v.clienteManual).toMatchObject({ ruc: '20123456789', ubigeo: '150101' })
    expect(v.requiereEmbalaje).toBe(false)
    expect(v.lineasDetalle[0]).toMatchObject({ estado: 'ASIGNADA', cantidad: 5, editable: true })
    expect(v.lineasDetalle[0].asignacion.reduce((t, a) => t + a.cantidad, 0)).toBe(5)
    expect((await repo.listarSalidas()).find((x) => x.id === v.id)).toMatchObject({ origen: 'MANUAL', porConciliar: true, tipo: 'DISTRIBUCION' })
  })

  it('el número de pedido es obligatorio y el cliente se valida; solo el Jefe de Transporte la crea', async () => {
    const s = await conStock('LOGISSA')
    expect(await repo.crearOrdenManual(A(s.productoId, 1, ''), JT)).toMatchObject({ ok: false, mensaje: 'El número de pedido es obligatorio: la orden queda ligada a ese pedido' })
    expect(await repo.crearOrdenManual(A(s.productoId, 1, 'P-1', { cliente: { ...CLIENTE, ruc: '123' } }), JT)).toMatchObject({ ok: false, mensaje: 'El RUC tiene 11 números' })
    expect(await repo.crearOrdenManual(A(s.productoId, 1, 'P-1', { cliente: { ...CLIENTE, ubigeo: '15' } }), JT)).toMatchObject({ ok: false, mensaje: 'El ubigeo tiene 6 números (el código del distrito de entrega)' })
    for (const quien of [JA, AUX, MUESTRAS]) expect(await repo.crearOrdenManual(A(s.productoId, 1), quien)).toMatchObject({ ok: false, mensaje: 'Solo el Jefe de Transporte crea una venta manual' })
    expect(await repo.listarSalidas()).toHaveLength(1) // solo la que sembró la demostración
  })

  it('un pedido no puede tener dos órdenes: el número repetido se rechaza con el de la orden; cancelada, se puede volver a usar', async () => {
    const s = await conStock('LOGISSA')
    const { ordenes } = ok(await repo.crearOrdenManual(A(s.productoId, 2), JT))
    expect(await repo.ordenDelPedido(' ped-man-001 ')).toMatchObject({ tipo: 'ORDEN', id: ordenes[0].id, numero: ordenes[0].numero })
    expect(await repo.crearOrdenManual(A(s.productoId, 2, ' ped-man-001 '), JT)).toMatchObject({ ok: false, mensaje: `El pedido ped-man-001 ya tiene la Orden de Salida ${ordenes[0].numero}. Un pedido no puede tener dos órdenes` })
    ok(await repo.cancelarOrden(ordenes[0].id, 'Número mal digitado', JT))
    expect(await repo.ordenDelPedido('PED-MAN-001')).toBeNull()
    expect(ok(await repo.crearOrdenManual(A(s.productoId, 2), JT)).ordenes[0].id).not.toBe(ordenes[0].id)
  })

  it('el mismo token devuelve la misma orden', async () => {
    const s = await conStock('LOGISSA')
    const a = ok(await repo.crearOrdenManual(A(s.productoId, 1, 'PED-TOK', { token: 'tok-1' }), JT))
    const b = ok(await repo.crearOrdenManual(A(s.productoId, 1, 'PED-TOK', { token: 'tok-1' }), JT))
    expect(b.ordenes[0].id).toBe(a.ordenes[0].id)
    expect((await repo.listarSalidas()).filter((x) => x.pedidoNumero === 'PED-TOK')).toHaveLength(1)
  })

  it('un pedido que ya llegó por la bandeja se atiende desde la bandeja', async () => {
    const s = await conStock('LOGISSA')
    expect(await repo.ordenDelPedido('PED-DEMO-103')).toEqual({ tipo: 'EN_BANDEJA', pedidoNumero: 'PED-DEMO-103' })
    expect(await repo.crearOrdenManual(A(s.productoId, 1, 'PED-DEMO-103'), JT)).toMatchObject({ ok: false, mensaje: 'El pedido PED-DEMO-103 ya llegó por la bandeja: créale la orden desde «Pedidos por despachar»' })
  })

  it('el lote que se prefirió se aplica con las reglas de la edición de lotes', async () => {
    const p = await repo.panorama()
    const s = await conStock('LOGISSA')
    // otro lote del mismo producto con stock: se pide ese en lugar del que propone FEFO
    const otro = p.lotes.filter((l) => l.productoId === s.productoId && l.propietarioId === s.propietarioId).map((l) => l.id)
    const lotes = await repo.lotesParaSalida(s.propietarioId, s.productoId)
    const candidato = lotes.filter((l) => otro.includes(l.loteId) && l.disponibleAprobado >= 3 && !l.enReserva && (l.vence ?? '9999') > p.hoy).sort((a, b) => (b.vence ?? '9999').localeCompare(a.vence ?? '9999'))[0]
    const r = ok(await repo.crearOrdenManual(A(s.productoId, 3, 'PED-LOTE', { lineas: [{ productoId: s.productoId, cantidad: 3, loteId: candidato.loteId }] }), JT))
    expect((await repo.obtenerSalida(r.ordenes[0].id))!.lineasDetalle[0].asignacion.map((a) => a.loteId)).toEqual([candidato.loteId])
    // un lote que no existe o de otro propietario no se acepta (y la orden no queda a medias)
    const antes = (await repo.listarSalidas()).length
    const malo = await repo.crearOrdenManual(A(s.productoId, 3, 'PED-LOTE-2', { lineas: [{ productoId: s.productoId, cantidad: 3, loteId: 'lote:no-existe' }] }), JT)
    expect(malo).toMatchObject({ ok: false })
    expect((await repo.listarSalidas()).length).toBe(antes)
  })

  it('sin stock suficiente la orden se crea con la línea SIN_STOCK (la decisión es del vendedor del pedido)', async () => {
    const s = await conStock('LOGISSA')
    const r = ok(await repo.crearOrdenManual(A(s.productoId, 9_999_999, 'PED-SIN'), JT))
    expect((await repo.obtenerSalida(r.ordenes[0].id))!).toMatchObject({ etapa: 'SIN_STOCK' })
  })
})

describe('el pedido que llega después por la bandeja se une a la orden manual, sin duplicar (demo)', () => {
  it('al actualizar la bandeja llega PED-DEMO-104: toma la orden manual con ese número; no se crea otra y se quita «por conciliar»', async () => {
    const s = await conStock('LOGISSA')
    const r = ok(await repo.crearOrdenManual(A(s.productoId, 4, ' ped-demo-104 ', { cliente: { ...CLIENTE, ruc: '20512345671' } }), JT))
    const antes = (await repo.listarSalidas()).length
    ok(await repo.actualizarBandeja(JT))
    const b = (await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-104')!
    expect(b).toMatchObject({ salida: r.ordenes[0].numero, estado: 'EN_SALIDA' })
    expect((await repo.listarSalidas()).length).toBe(antes)
    expect(await repo.obtenerSalida(r.ordenes[0].id)).toMatchObject({ porConciliar: false, origen: 'MANUAL' })
    expect((await repo.listarAlertas()).some((a) => a.tipo === 'ORDEN_MANUAL_UNIDA' && a.mensaje.includes('PED-DEMO-104'))).toBe(true)
    expect((await repo.auditoria()).some((x) => x.evento === 'orden_manual_unida_a_pedido')).toBe(true)
    // crear la orden desde la bandeja devuelve esa misma
    expect(ok(await repo.crearOrdenDePedido(b.pedidoId, JT))).toMatchObject({ id: r.ordenes[0].id, yaExistia: true })
  })

  it('si la orden ya está en picking, la unión no la reinicia: conserva su hoja de picking y se actualiza a lo que dice el pedido', async () => {
    const s = await conStock('LOGISSA')
    const r = ok(await repo.crearOrdenManual(A(s.productoId, 4, 'PED-DEMO-104', { cliente: { ...CLIENTE, ruc: '20512345671' } }), JT))
    const g = ok(await repo.generarOrdenPicking(r.ordenes[0].id, JT))
    ok(await repo.actualizarBandeja(JT))
    const v = (await repo.obtenerSalida(r.ordenes[0].id))!
    // PED-DEMO-104 pide 250.000 unidades de otro producto: la línea que el pedido no trae se quita y se agrega la suya, que no tiene stock (SA-3: decide el vendedor)
    expect(v).toMatchObject({ ordenPickingId: g.id, porConciliar: false, etapa: 'SIN_STOCK', vendedor: 'Rosa Paredes', conPedido: true })
    expect(v.lineasDetalle.filter((l) => l.estado !== 'CANCELADA').map((l) => [l.cantidad, l.estado])).toEqual([[250_000, 'SIN_STOCK']])
  })

  /** PED-DEMO-104 como lo trae Pedidos (versión 1), con las líneas que se pidan, en vez de las 250.000 unidades de siempre. */
  async function pedido104Con(lineas: { productoId: string; cantidad: number }[]) {
    await repo.bandejaPedidos()
    const e = estadoE()
    const prod = (id: string) => e.panorama.productos.find((p) => p.id === id)!
    const e2 = e.pedidos!
    e2.simulados = { 'ped-demo-104': {
      pedidoId: 'ped-demo-104', numero: 'PED-DEMO-104', version: 1, estado: 'READY_FOR_OPERATIONS', fecha: e.panorama.hoy, modificadoEn: `${e.panorama.hoy}T08:00:00Z`,
      cliente: { id: 'cli-demo-1', nombre: 'Botica Salud Total SAC', ruc: '20512345671', direccion: 'Av. Giraldez 480, Huancayo', distrito: 'Huancayo', ubigeo: '120101' },
      vendedor: 'Rosa Paredes', condicionPago: 'Contado',
      lineas: lineas.map((l, i) => ({ lineaId: `l-${i + 1}`, productoCodigo: prod(l.productoId).codigo, descripcion: prod(l.productoId).descripcion, cantidad: l.cantidad })),
    } }
  }

  it('al unirse, el pedido se aplica a la orden como una versión nueva: sus líneas y cantidades pasan a ser las del pedido (SA-2 + SA-3)', async () => {
    const s = await conStock('LOGISSA')
    const otro = (await repo.panorama()).productos.find((p) => p.estado === 'activo' && p.id !== s.productoId)!
    const r = ok(await repo.crearOrdenManual(A(s.productoId, 3, 'PED-DEMO-104', { cliente: { ...CLIENTE, ruc: '20512345671' } }), JT))
    // el pedido pide más de lo mismo (3 → 8) y una línea más que la orden no tenía
    await pedido104Con([{ productoId: s.productoId, cantidad: 8 }, { productoId: otro.id, cantidad: 2 }])
    ok(await repo.actualizarBandeja(JT))
    const v = (await repo.obtenerSalida(r.ordenes[0].id))!
    expect(v).toMatchObject({ porConciliar: false, origen: 'MANUAL', conPedido: true, vendedor: 'Rosa Paredes' })
    expect(v.lineasDetalle.filter((l) => l.estado !== 'CANCELADA').map((l) => l.cantidad)).toEqual([8, 2])
    expect(v.lineasDetalle[0].asignacion.reduce((t, a) => t + a.cantidad, 0)).toBe(8)
    expect((await repo.listarAlertas()).some((a) => a.tipo === 'PEDIDO_CAMBIADO' && a.mensaje.includes('PED-DEMO-104'))).toBe(true)
  })

  it('si el producto y la cantidad coinciden con el pedido, la unión no cambia nada de la orden', async () => {
    const s = await conStock('LOGISSA')
    const r = ok(await repo.crearOrdenManual(A(s.productoId, 6, 'PED-DEMO-104', { cliente: { ...CLIENTE, ruc: '20512345671' } }), JT))
    const antes = (await repo.obtenerSalida(r.ordenes[0].id))!.lineasDetalle.map((l) => [l.id, l.cantidad, l.estado])
    await pedido104Con([{ productoId: s.productoId, cantidad: 6 }])
    ok(await repo.actualizarBandeja(JT))
    const v = (await repo.obtenerSalida(r.ordenes[0].id))!
    expect(v).toMatchObject({ porConciliar: false, conPedido: true })
    expect(v.lineasDetalle.map((l) => [l.id, l.cantidad, l.estado])).toEqual(antes)
    expect((await repo.listarAlertas()).some((a) => a.tipo === 'PEDIDO_CAMBIADO' && a.mensaje.includes('PED-DEMO-104'))).toBe(false)
  })

  it('avisa si el cliente del pedido no es el de la orden', async () => {
    const s = await conStock('LOGISSA')
    ok(await repo.crearOrdenManual(A(s.productoId, 4, 'PED-DEMO-104'), JT)) // RUC 20123456789, el pedido es de otra botica
    ok(await repo.actualizarBandeja(JT))
    expect((await repo.listarAlertas()).find((a) => a.tipo === 'ORDEN_MANUAL_UNIDA')!.mensaje).toMatch(/OJO: el RUC del cliente no coincide \(orden 20123456789, pedido 20512345671\)/)
  })
})

describe('desde la bandeja y desde la ruta (demo)', () => {
  it('«Crear orden de salida» crea la orden con el stock asignado, marcada «creada desde la bandeja»; repetirlo devuelve la misma', async () => {
    const b = (await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-102')!
    expect(b.estado).toBe('POR_PLANIFICAR')
    const r = ok(await repo.crearOrdenDePedido(b.pedidoId, JT))
    expect(r.yaExistia).toBe(false)
    const v = (await repo.obtenerSalida(r.id))!
    expect(v).toMatchObject({ creadaDesde: 'BANDEJA', origen: 'PEDIDO', pedidoNumero: 'PED-DEMO-102', etapa: 'ASIGNADA', porConciliar: false })
    expect((await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-102')).toMatchObject({ estado: 'EN_SALIDA', salida: v.numero })
    expect(ok(await repo.crearOrdenDePedido(b.pedidoId, JT))).toMatchObject({ id: r.id, yaExistia: true })
  })

  it('exige preparar salidas; un pedido que cambió se revisa antes', async () => {
    const b = (await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-102')!
    expect(await repo.crearOrdenDePedido(b.pedidoId, AUX)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para crear órdenes de salida' })
    ok(await repo.actualizarBandeja(JT)) // el 102 llega como versión 2: cambió
    expect(await repo.crearOrdenDePedido(b.pedidoId, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('cambió en Pedidos: revisa el cambio antes de crear su orden') })
  })

  it('«todos los pedidos por planificar» crea las órdenes y cuenta los que fallan sin frenar a los demás', async () => {
    ok(await repo.actualizarBandeja(JT)) // llega el 104 (sin stock suficiente); el 102 queda por revisar
    const r = ok(await repo.crearOrdenesPendientes(JT))
    const por = Object.fromEntries(r.resumen.ordenes.map((o) => [o.pedido, o]))
    expect(por['PED-DEMO-104']).toMatchObject({ faltaStock: true, unida: false })
    expect(r.resumen.errores).toEqual([{ pedido: 'PED-DEMO-103', motivo: expect.stringContaining('trae un producto que el WMS no conoce (SIN-CATALOGO-9)') }])
    expect(por['PED-DEMO-102']).toBeUndefined() // cambió: se revisa primero
    expect(r.resumen.conFaltaStock).toBe(1)
    expect(ok(await repo.crearOrdenesPendientes(JT)).resumen.creadas).toBe(0)
    expect(await repo.crearOrdenesPendientes(AUX)).toMatchObject({ ok: false })
  })

  it('la ruta reutiliza la orden de la bandeja y, al quitar el pedido, esa orden sigue viva; la que nació en la ruta se libera', async () => {
    const bandeja = (await repo.bandejaPedidos()).pedidos
    const p102 = bandeja.find((p) => p.numero === 'PED-DEMO-102')!
    const orden = ok(await repo.crearOrdenDePedido(p102.pedidoId, JT))
    const manana = sumarDias((await repo.panoramaRutas()).hoy, 2)
    const ruta = ok(await repo.crearRuta({ fecha: manana, vehiculoId: 'veh-2', conductorId: 'per-2', auxiliarId: 'per-4' }, JT))
    const plan = { fecha: manana, vehiculoId: 'veh-2', conductorId: 'per-2', auxiliarId: 'per-4' }
    ok(await repo.planificarRuta(ruta.id, { ...plan, paradas: [{ pedidoId: p102.pedidoId }] }, JT))
    expect((await repo.obtenerRuta(ruta.id))!.paradas[0]).toMatchObject({ salidaNumero: orden.numero })
    expect((await repo.listarSalidas()).filter((s) => s.pedidoNumero === 'PED-DEMO-102')).toHaveLength(1)
    ok(await repo.planificarRuta(ruta.id, { ...plan, paradas: [], motivo: 'Se pasa a otro día' }, JT))
    expect((await repo.obtenerSalida(orden.id))!).toMatchObject({ estado: 'ABIERTA', etapa: 'ASIGNADA', creadaDesde: 'BANDEJA' })
  })

  it('la orden que nace en la ruta se libera al quitar el pedido (lo que no nació ahí, no)', async () => {
    const p102 = (await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-102')!
    const manana = sumarDias((await repo.panoramaRutas()).hoy, 2)
    const ruta = ok(await repo.crearRuta({ fecha: manana, vehiculoId: 'veh-2', conductorId: 'per-2', auxiliarId: 'per-4' }, JT))
    const plan = { fecha: manana, vehiculoId: 'veh-2', conductorId: 'per-2', auxiliarId: 'per-4' }
    ok(await repo.planificarRuta(ruta.id, { ...plan, paradas: [{ pedidoId: p102.pedidoId }] }, JT))
    const numero = (await repo.obtenerRuta(ruta.id))!.paradas[0].salidaNumero!
    const salida = (await repo.listarSalidas()).find((s) => s.numero === numero)!
    expect(await repo.obtenerSalida(salida.id)).toMatchObject({ creadaDesde: 'RUTA' })
    ok(await repo.planificarRuta(ruta.id, { ...plan, paradas: [], motivo: 'Se cae el pedido' }, JT))
    expect(await repo.obtenerSalida(salida.id)).toMatchObject({ estado: 'CANCELADA', etapa: 'CANCELADA' })
    expect((await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-102')).toMatchObject({ estado: 'POR_PLANIFICAR' })
  })
})

describe('tipo B: por cuenta de un cliente de almacenamiento (demo)', () => {
  it('la crean los dos jefes; queda «creada por X en nombre de Y» con su GRE y el lote indicado reservado', async () => {
    const s = await conStock('DIPHASAC')
    for (const quien of [JT, JA]) {
      const r = ok(await repo.crearOrdenManual(B(s.propietarioId, 'VENTA', s.productoId, s.loteId, 3), quien))
      const v = (await repo.obtenerSalida(r.ordenes[0].id))!
      expect(v).toMatchObject({ tipo: 'CLIENTE', motivo: 'VENTA', origen: 'MANUAL', greNumero: 'T001-00001234', greArchivo: 'gre-cliente/x.pdf', porConciliar: false, etapa: 'ASIGNADA' })
      expect(v.lineasDetalle[0]).toMatchObject({ estado: 'ASIGNADA', editable: false }) // el lote lo indica el cliente: no se edita
      expect(v.lineasDetalle[0].asignacion.map((a) => a.loteId)).toEqual([s.loteId])
      const enLista = (await repo.listarSalidas()).find((x) => x.id === v.id)!
      expect(enLista).toMatchObject({ creadaPor: expect.stringContaining('(demo)'), enNombreDe: 'DIPHASAC', cliente: 'DIPHASAC' })
    }
    expect(await repo.crearOrdenManual(B(s.propietarioId, 'VENTA', s.productoId, s.loteId, 1), AUX)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para crear una salida por cuenta de un cliente' })
  })

  it('lote de otro propietario rechazado: el lote es de Diphasac y la orden es de Triamed', async () => {
    const s = await conStock('DIPHASAC')
    const triamed = (await repo.panorama()).propietarios.find((p) => p.codigo === 'TRIAMED')!
    const r = await repo.crearOrdenManual(B(triamed.id, 'VENTA', s.productoId, s.loteId, 1), JT)
    expect(r).toMatchObject({ ok: false, mensaje: `El lote ${s.lote.codigo} no es de este propietario` })
  })

  it('lote insuficiente, en Reserva, vencido', async () => {
    const s = await conStock('DIPHASAC')
    expect(await repo.crearOrdenManual(B(s.propietarioId, 'VENTA', s.productoId, s.loteId, s.cantidad + 1), JT)).toMatchObject({ ok: false, mensaje: expect.stringMatching(new RegExp(`No hay en el lote ${s.lote.codigo} con ${s.cantidad + 1} unidades disponibles \\(hay \\d+\\)`)) })
    const vencido = enBajas(s.propietarioId, s.productoId, 'VENC-1', 5)
    expect(await repo.crearOrdenManual(B(s.propietarioId, 'VENTA', s.productoId, vencido, 1), JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('lo vencido solo va a Bajas') })
    ok(await repo.aplicarReserva(s.loteId, 'Duda de calidad', actor('direccion_tecnica', 'direccion_tecnica')))
    expect(await repo.crearOrdenManual(B(s.propietarioId, 'VENTA', s.productoId, s.loteId, 1), JT)).toMatchObject({ ok: false, mensaje: `El lote ${s.lote.codigo} está en Reserva: no sale hasta que se quite la Reserva` })
  })

  it('destrucción desde Bajas: solo lo que ya está en el área de Bajas', async () => {
    const s = await conStock('DIPHASAC')
    const baja = enBajas(s.propietarioId, s.productoId, 'BAJA-1', 12)
    expect(await repo.crearOrdenManual(B(s.propietarioId, 'DESTRUCCION', s.productoId, s.loteId, 5), JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining(`La destrucción sale solo desde Bajas: del lote ${s.lote.codigo} hay 0 unidades en el área de Bajas y la línea pide 5`) })
    expect(await repo.crearOrdenManual(B(s.propietarioId, 'DESTRUCCION', s.productoId, baja, 13), JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('hay 12 unidades en el área de Bajas y la línea pide 13') })
    const r = ok(await repo.crearOrdenManual(B(s.propietarioId, 'DESTRUCCION', s.productoId, baja, 12), JA))
    const v = (await repo.obtenerSalida(r.ordenes[0].id))!
    expect(v).toMatchObject({ motivo: 'DESTRUCCION', etapa: 'SIN_STOCK' })
    expect(v.lineasDetalle[0]).toMatchObject({ estado: 'PENDIENTE', nota: 'Sale desde Bajas: se prepara con el picking de Bajas' })
  })

  it('la GRE del cliente: número con formato y PDF obligatorios; el propietario es un cliente de almacenamiento', async () => {
    const s = await conStock('DIPHASAC')
    const base = B(s.propietarioId, 'VENTA', s.productoId, s.loteId, 1)
    expect(await repo.crearOrdenManual({ ...base, greNumero: '123' }, JT)).toMatchObject({ ok: false, mensaje: 'El número de la guía se escribe como T001-00001234 (serie, guion y número)' })
    expect(await repo.crearOrdenManual({ ...base, greArchivo: undefined }, JT)).toMatchObject({ ok: false, mensaje: 'Adjunta el PDF de la guía de remisión del cliente' })
    const logissa = (await repo.panorama()).propietarios.find((p) => p.esDuenoAlmacen)!
    expect(await repo.crearOrdenManual({ ...base, propietarioId: logissa.id }, JT)).toMatchObject({ ok: false, mensaje: 'Una salida por cuenta de un cliente es de un cliente de almacenamiento' })
  })

  it('una guía con motivos mezclados se parte en una orden por motivo, todo o nada', async () => {
    const s = await conStock('DIPHASAC')
    const baja = enBajas(s.propietarioId, s.productoId, 'BAJA-2', 4)
    const e: EntradaOrdenManual = { clase: 'B', propietarioId: s.propietarioId, greNumero: 'T001-00000099', greArchivo: 'x.pdf', lineas: [
      { productoId: s.productoId, loteId: s.loteId, cantidad: 2, motivo: 'VENTA' }, { productoId: s.productoId, loteId: baja, cantidad: 4, motivo: 'DESTRUCCION' }] }
    const r = ok(await repo.crearOrdenManual(e, JT))
    expect(r.ordenes.map((o) => o.motivo).sort()).toEqual(['DESTRUCCION', 'VENTA'])
    // si una de las dos falla, ninguna se crea
    const antes = (await repo.listarSalidas()).length
    expect(await repo.crearOrdenManual({ ...e, lineas: [e.lineas[0], { ...e.lineas[1], cantidad: 99 }] }, JT)).toMatchObject({ ok: false })
    expect((await repo.listarSalidas()).length).toBe(antes)
  })

  it('la orden de un cliente no emite guía del WMS (la trae el cliente)', async () => {
    const s = await conStock('DIPHASAC')
    const r = ok(await repo.crearOrdenManual(B(s.propietarioId, 'VENTA', s.productoId, s.loteId, 2), JT))
    const g = await repo.datosGuia(r.ordenes[0].id)
    expect(g).toMatchObject({ tipo: 'CLIENTE', destinatario: { nombre: expect.any(String) } })
  })
})

const DEST = { ruc: '20123456789', razonSocial: 'Clínica Destino SAC', direccion: 'Av. Lima 123, Lima', ubigeo: '150101' }

describe('tipo C: sin venta de Logissa (demo)', () => {
  it('la muestra solo la crea quien autoriza salidas sin venta; el sistema la asigna por FEFO', async () => {
    const s = await conStock('LOGISSA')
    const e: EntradaOrdenManual = { clase: 'C', motivo: 'MUESTRA', cliente: DEST, lineas: [{ productoId: s.productoId, cantidad: 2 }] }
    expect(await repo.crearOrdenManual(e, JT)).toMatchObject({ ok: false, mensaje: 'Solo quien autoriza salidas sin venta registra una muestra' })
    expect(await repo.crearOrdenManual(e, JA)).toMatchObject({ ok: false, mensaje: 'Solo quien autoriza salidas sin venta registra una muestra' })
    const r = ok(await repo.crearOrdenManual(e, MUESTRAS))
    expect((await repo.obtenerSalida(r.ordenes[0].id))!).toMatchObject({ tipo: 'MUESTRA', motivo: 'MUESTRA', origen: 'MANUAL', etapa: 'ASIGNADA' })
    expect((await repo.datosGuia(r.ordenes[0].id))).toMatchObject({ tipo: 'MUESTRA', motivoTraslado: 'OTROS (MUESTRA SIN VALOR COMERCIAL)' })
  })

  it('la devolución al proveedor es de los jefes, con lote indicado y solo antes del vencimiento', async () => {
    const s = await conStock('LOGISSA')
    const vencido = enBajas(s.propietarioId, s.productoId, 'VENC-DEV', 3)
    const e = (loteId: string): EntradaOrdenManual => ({ clase: 'C', motivo: 'DEVOLUCION_PROVEEDOR', cliente: DEST, lineas: [{ productoId: s.productoId, cantidad: 2, loteId }] })
    expect(await repo.crearOrdenManual(e(s.loteId), MUESTRAS)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para preparar salidas' })
    expect(await repo.crearOrdenManual(e(vencido), JA)).toMatchObject({ ok: false, mensaje: expect.stringContaining('El lote está vencido: no se devuelve vencido a nadie') })
    const r = ok(await repo.crearOrdenManual(e(s.loteId), JA))
    const v = (await repo.obtenerSalida(r.ordenes[0].id))!
    expect(v).toMatchObject({ tipo: 'PROVEEDOR', motivo: 'DEVOLUCION_PROVEEDOR', etapa: 'ASIGNADA' })
    expect((await repo.datosGuia(r.ordenes[0].id))).toMatchObject({ tipo: 'PROVEEDOR', motivoTraslado: 'DEVOLUCION' })
    expect(await repo.crearOrdenManual({ clase: 'C', lineas: [{ productoId: s.productoId, cantidad: 1 }] }, JT)).toMatchObject({ ok: false })
  })
})

describe('buscar el producto por cualquiera de sus códigos (demo)', () => {
  it('por nombre, por código interno, por código de barras y, con propietario, por el código de ese cliente', async () => {
    const s = await conStock('DIPHASAC')
    const e = estadoE()
    const p = e.panorama.productos.find((x) => x.id === s.productoId)!
    const codigos = codigosDemo(e).filter((c) => c.productoId === s.productoId)
    const barras = codigos.find((c) => c.tipo === 'BARRAS')!.codigo
    const cliente = codigos.find((c) => c.tipo === 'CLIENTE' && c.propietarioId === s.propietarioId)!.codigo
    expect((await repo.buscarProductosParaSalida(p.codigo)).map((x) => x.id)).toContain(s.productoId)
    expect((await repo.buscarProductosParaSalida(p.descripcion.split(' ')[0])).map((x) => x.id)).toContain(s.productoId)
    expect((await repo.buscarProductosParaSalida(barras)).find((x) => x.id === s.productoId)).toMatchObject({ coincidencia: `código de barras ${barras}` })
    expect((await repo.buscarProductosParaSalida(cliente, s.propietarioId)).find((x) => x.id === s.productoId)).toMatchObject({ coincidencia: `código del cliente ${cliente}` })
    // el código propio de un cliente no sirve para otro propietario
    expect((await repo.buscarProductosParaSalida(cliente)).find((x) => x.id === s.productoId)).toBeUndefined()
    expect(await repo.buscarProductosParaSalida('a')).toEqual([])
  })
})
