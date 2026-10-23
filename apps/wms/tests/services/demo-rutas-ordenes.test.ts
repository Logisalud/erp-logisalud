// SA-6 en el modo demostración: las órdenes manuales siguen el flujo normal hasta el despacho. A y C entran a una ruta de Logisalud como parada por orden; B se entrega al
// transportista del cliente. Mismas reglas y mismas palabras que la migración 0030.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { estadoE } from '@/services/demo/entradas-demo'
import type { Actor } from '@/services/repositorio'
import type { EntradaOrdenManual } from '@/domain/salida-manual'
import type { EntradaEntrega } from '@/domain/entrega-transportista'
import { imprimirYConformar } from './ayudas-orden'

const actor = (clave: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${clave}`, nombre: `${clave} (demo)`, roles })
const JT = actor('jefe_transporte', 'jefe_transporte', 'jefe_almacen')
const JA = actor('reemplazante_jefe', 'jefe_almacen')
const AUX = actor('auxiliar', 'auxiliar')
const SANDRA = actor('sandra', 'asistente_dt', 'conformidad_despacho')
const MUESTRAS = actor('autoriza_salidas_sin_venta', 'autoriza_salidas_sin_venta')
const CLIENTE = { ruc: '20123456789', razonSocial: 'Botica Salud SAC', direccion: 'Av. Lima 123, Lima', ubigeo: '150101' }
const DEST = { ruc: '20987654321', razonSocial: 'Clínica Destino SAC', direccion: 'Jr. Cusco 45, Lima', ubigeo: '150101' }
const CHECK = [{ item: 'Vehículo limpio', ok: true, nota: '' }]

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { if (!r.ok) throw new Error((r as { mensaje?: string }).mensaje); return r as Extract<T, { ok: true }> }
async function conStock(codigo: string, minimo = 40, indiceProducto?: number) {
  const p = await repo.panorama()
  const delProducto = indiceProducto === undefined ? undefined : p.productos.filter((x) => x.estado === 'activo')[indiceProducto]?.id
  const prop = p.propietarios.find((x) => x.codigo === codigo)!
  const pos = new Map(p.posiciones.map((x) => [x.id, x]))
  const dias = (iso: string) => (Date.parse(iso) - Date.parse(p.hoy)) / 86_400_000
  const s = p.saldos.find((x) => x.propietarioId === prop.id && x.estado === 'APROBADO' && x.cantidad >= minimo && (!delProducto || x.productoId === delProducto) && pos.get(x.posicionId)?.tipoArea === 'APROBADOS' && dias(p.lotes.find((l) => l.id === x.loteId)?.vence ?? '9999-12-31') > 120)!
  return { propietarioId: prop.id, productoId: s.productoId, loteId: s.loteId, hoy: p.hoy }
}
const en = (hoy: string, n: number) => new Date(Date.parse(`${hoy}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const A = (productoId: string, cantidad: number, pedidoNumero: string, extra: Partial<EntradaOrdenManual> = {}): EntradaOrdenManual => ({ clase: 'A', pedidoNumero, cliente: CLIENTE, lineas: [{ productoId, cantidad }], ...extra })
const muestra = (productoId: string, cantidad = 3): EntradaOrdenManual => ({ clase: 'C', motivo: 'MUESTRA', cliente: DEST, lineas: [{ productoId, cantidad }] })
const stockTotal = async () => (await repo.panorama()).saldos.reduce((t, x) => t + x.cantidad, 0)
async function ruta(hoy: string, dias = 5, veh = 'veh-1', cond = 'per-1') {
  const r = ok(await repo.crearRuta({ fecha: en(hoy, dias), vehiculoId: veh, conductorId: cond }, JT))
  return { id: r.id, fecha: en(hoy, dias), veh, cond }
}
const plan = (r: { fecha: string; veh: string; cond: string }, paradas: { pedidoId?: string; salidaId?: string; excepcionCorte?: boolean; motivoExcepcion?: string }[], motivo?: string) => ({ fecha: r.fecha, vehiculoId: r.veh, conductorId: r.cond, paradas, motivo })

describe('«Órdenes manuales por despachar» y la parada por orden', () => {
  it('el panorama de rutas lista las órdenes A y C abiertas (con su destinatario y stock) y no las de tipo B ni las de la bandeja', async () => {
    const s = await conStock('LOGISSA'); const d = await conStock('DIPHASAC')
    const a = ok(await repo.crearOrdenManual(A(s.productoId, 4, 'PED-RO-001'), JT)).ordenes[0]
    const c = ok(await repo.crearOrdenManual(muestra(s.productoId), MUESTRAS)).ordenes[0]
    ok(await repo.crearOrdenManual({ clase: 'B', propietarioId: d.propietarioId, greNumero: 'T001-00001234', greArchivo: 'gre/x.pdf', lineas: [{ productoId: d.productoId, loteId: d.loteId, cantidad: 2, motivo: 'VENTA' }] }, JT))
    const p = await repo.panoramaRutas()
    expect(p.ordenes.map((o) => o.salidaId).sort()).toEqual([a.id, c.id].sort())
    expect(p.ordenes.find((o) => o.salidaId === a.id)).toMatchObject({ tipo: 'DISTRIBUCION', pedidoNumero: 'PED-RO-001', cliente: 'Botica Salud SAC', ruc: '20123456789', sinStock: false, clave: `orden:${a.id}` })
    expect(p.ordenes.find((o) => o.salidaId === c.id)).toMatchObject({ tipo: 'MUESTRA', cliente: 'Clínica Destino SAC', pedidoNumero: undefined })
  })

  it('A y C entran a una ruta como parada por orden; la ruta se confirma; quitar la parada NO cancela la orden; se puede volver a planificar', async () => {
    const s = await conStock('LOGISSA')
    const a = ok(await repo.crearOrdenManual(A(s.productoId, 4, 'PED-RO-002'), JT)).ordenes[0]
    const c = ok(await repo.crearOrdenManual(muestra(s.productoId), MUESTRAS)).ordenes[0]
    const r = await ruta(s.hoy)
    expect(ok(await repo.planificarRuta(r.id, plan(r, [{ salidaId: a.id }, { salidaId: c.id }]), JT))).toMatchObject({ bloqueadosPorStock: [] })
    const v = (await repo.obtenerRuta(r.id))!
    expect(v.paradas.map((x) => [x.origen, x.salidaNumero, x.cliente, x.pedidoId])).toEqual([['ORDEN', a.numero, 'Botica Salud SAC', undefined], ['ORDEN', c.numero, 'Clínica Destino SAC', undefined]])
    expect(v.paradas[0]).toMatchObject({ pedidoNumero: 'PED-RO-002', clave: `orden:${a.id}`, stock: 'ASIGNADA' })
    expect((await repo.panoramaRutas()).ordenes.find((o) => o.salidaId === a.id)?.enRuta).toBe(v.numero)
    ok(await repo.confirmarRuta(r.id, JT))
    expect((await repo.obtenerRuta(r.id))!.registroLsFr).toBe('BASE')
    // quitar la parada de la orden manual: la orden sigue viva y asignada
    ok(await repo.planificarRuta(r.id, plan(r, [{ salidaId: c.id }], 'El cliente no la quiso hoy'), JT))
    expect((await repo.obtenerSalida(a.id))).toMatchObject({ estado: 'ABIERTA', etapa: 'ASIGNADA' })
    expect((await repo.obtenerRuta(r.id))!.paradas.map((x) => x.salidaNumero)).toEqual([c.numero])
    // cancelar la ruta tampoco cancela las órdenes
    ok(await repo.cancelarRuta(r.id, 'Se cae el viaje', JT))
    expect(await repo.obtenerSalida(c.id)).toMatchObject({ estado: 'ABIERTA' })
    const r2 = await ruta(s.hoy, 6, 'veh-2', 'per-2')
    ok(await repo.planificarRuta(r2.id, plan(r2, [{ salidaId: a.id }, { salidaId: c.id }]), JT))
  })

  it('una orden no puede estar en dos rutas; B, una orden de la bandeja y una cancelada no entran; solo el Jefe de Transporte planifica', async () => {
    const s = await conStock('LOGISSA'); const d = await conStock('DIPHASAC')
    const a = ok(await repo.crearOrdenManual(A(s.productoId, 4, 'PED-RO-003'), JT)).ordenes[0]
    const r1 = await ruta(s.hoy, 5, 'veh-1', 'per-1'); const r2 = await ruta(s.hoy, 5, 'veh-2', 'per-2')
    ok(await repo.planificarRuta(r1.id, plan(r1, [{ salidaId: a.id }]), JT))
    expect(await repo.planificarRuta(r2.id, plan(r2, [{ salidaId: a.id }]), JT)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/La orden OS-\d{4}-\d{5} ya está en la ruta RUT-/) })
    const libre = ok(await repo.crearOrdenManual(A(s.productoId, 1, 'PED-RO-004'), JT)).ordenes[0]
    expect(await repo.planificarRuta(r2.id, plan(r2, [{ salidaId: libre.id }, { salidaId: libre.id }]), JT)).toMatchObject({ ok: false, mensaje: 'Hay un pedido o una orden repetida en la ruta.' })
    const b = ok(await repo.crearOrdenManual({ clase: 'B', propietarioId: d.propietarioId, greNumero: 'T001-00001234', greArchivo: 'gre/x.pdf', lineas: [{ productoId: d.productoId, loteId: d.loteId, cantidad: 2, motivo: 'VENTA' }] }, JT)).ordenes[0]
    expect(await repo.planificarRuta(r2.id, plan(r2, [{ salidaId: b.id }]), JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('no va en una ruta de Logisalud, se entrega al transportista del cliente') })
    const deBandeja = ok(await repo.crearOrdenDePedido((await repo.bandejaPedidos()).pedidos.find((p) => p.estado === 'POR_PLANIFICAR' && p.numero === 'PED-DEMO-102')!.pedidoId, JT))
    // una orden que ya tiene su pedido en la bandeja se planifica como pedido (la parada usa los datos del pedido)
    ok(await repo.planificarRuta(r2.id, plan(r2, [{ salidaId: deBandeja.id }]), JT))
    expect((await repo.obtenerRuta(r2.id))!.paradas[0]).toMatchObject({ origen: 'PEDIDO', pedidoNumero: 'PED-DEMO-102' })
    ok(await repo.planificarRuta(r2.id, plan(r2, []), JT))
    const x = ok(await repo.crearOrdenManual(A(s.productoId, 1, 'PED-RO-005'), JT)).ordenes[0]
    ok(await repo.cancelarOrden(x.id, 'Número mal escrito', JT))
    expect(await repo.planificarRuta(r2.id, plan(r2, [{ salidaId: x.id }]), JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya no está abierta') })
    expect(await repo.planificarRuta(r2.id, plan(r2, [{ salidaId: libre.id }]), JA)).toMatchObject({ ok: false, mensaje: 'No tienes permiso para planificar rutas' })
  })

  it('una orden sin stock suficiente se planifica pero no deja confirmar la ruta', async () => {
    const s = await conStock('LOGISSA')
    const a = ok(await repo.crearOrdenManual(A(s.productoId, 9_999_999, 'PED-RO-006'), JT)).ordenes[0]
    const r = await ruta(s.hoy)
    expect(ok(await repo.planificarRuta(r.id, plan(r, [{ salidaId: a.id }]), JT)).bloqueadosPorStock).toEqual(['PED-RO-006'])
    expect(await repo.confirmarRuta(r.id, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Estos pedidos no tienen stock suficiente: PED-RO-006') })
  })
})

describe('guía, carga y salida confirmada de una orden manual', () => {
  it('A: la guía toma placa, conductor y fecha de la ruta; se carga, se libera y al confirmar la salida el stock baja; LS-FR.43.03 lista la parada con su cliente', async () => {
    const s = await conStock('LOGISSA', 40, 0); const s2 = await conStock('LOGISSA', 40, 1)
    const a = ok(await repo.crearOrdenManual(A(s.productoId, 5, 'PED-RO-010'), JT)).ordenes[0]
    const c = ok(await repo.crearOrdenManual(muestra(s2.productoId, 3), MUESTRAS)).ordenes[0]
    const r = await ruta(s.hoy)
    ok(await repo.planificarRuta(r.id, plan(r, [{ salidaId: a.id }, { salidaId: c.id }]), JT))
    ok(await repo.confirmarRuta(r.id, JT))
    for (const o of [a, c]) {
      await imprimirYConformar(repo, o.id, { jt: JT, picker: AUX, conforme: SANDRA, bultos: 1 })
      const pq = (await repo.paqueteSalida(o.id))!
      await repo.cargarCoaEnBloque(pq.items.map((i) => ({ nombre: `COA_${i.lote}.pdf`, hash: `h-${i.lote}`, bytes: 1000, ref: `demo/${i.lote}.pdf` })), SANDRA)
    }
    // la guía ve la ruta de la parada por orden
    const g = (await repo.datosGuia(a.id))!
    expect(g.ruta).toMatchObject({ numero: (await repo.obtenerRuta(r.id))!.numero, placa: 'BKW-757', conductor: 'Luis Quispe', fecha: r.fecha })
    expect(g.destinatario).toMatchObject({ nombre: 'Botica Salud SAC', ruc: '20123456789', ubigeo: '150101' })
    expect((await repo.datosGuia(c.id))!.destinatario).toMatchObject({ nombre: 'Clínica Destino SAC', ruc: '20987654321' })
    ok(await repo.registrarGre(a.id, 'T001-00000501', undefined, JT)); ok(await repo.registrarGre(c.id, 'T001-00000502', undefined, JT))
    expect((await repo.obtenerSalida(a.id))!.etapa).toBe('LISTA_PARA_CARGA')
    // carga: la conciliación nombra el pedido de la venta manual y, en la muestra, la orden
    const carga = (await repo.cargaRuta(r.id))!
    expect(carga.pedidosDetalle.map((p) => [p.pedidoNumero ?? p.salidaNumero, p.listo])).toEqual([['PED-RO-010', true], [c.numero, true]])
    for (const p of carga.pedidosDetalle) for (const b of p.bultos) ok(await repo.cargarBulto(r.id, b.codigo, AUX))
    ok(await repo.guardarChecklist(r.id, CHECK, AUX)); ok(await repo.liberarUnidad(r.id, JT))
    const antes = await stockTotal()
    ok(await repo.confirmarSalidaRuta(r.id, JT))
    expect(await stockTotal()).toBe(antes - 8)
    expect((await repo.obtenerSalida(a.id))!.etapa).toBe('CONFIRMADA'); expect((await repo.obtenerSalida(c.id))!.etapa).toBe('CONFIRMADA')
    const fr = (await repo.registroLsFr(r.id))!
    expect(fr.filas.map((f) => [f.cliente, f.guia, f.cajas])).toEqual([['Botica Salud SAC', 'T001-00000501', 1], ['Clínica Destino SAC', 'T001-00000502', 1]])
  })

  it('si el pedido de la venta manual llega después por la bandeja, la parada sigue valiendo y es también del pedido; la guía usa los datos del pedido', async () => {
    const s = await conStock('LOGISSA')
    const a = ok(await repo.crearOrdenManual(A(s.productoId, 6, 'PED-DEMO-104', { cliente: { ...CLIENTE, ruc: '20512345671' } }), JT)).ordenes[0]
    const r = await ruta(s.hoy)
    ok(await repo.planificarRuta(r.id, plan(r, [{ salidaId: a.id }]), JT))
    await repo.bandejaPedidos()
    const e = estadoE(); const prod = e.panorama.productos.find((p) => p.id === s.productoId)!
    e.pedidos!.simulados = { 'ped-demo-104': {
      pedidoId: 'ped-demo-104', numero: 'PED-DEMO-104', version: 1, estado: 'READY_FOR_OPERATIONS', fecha: e.panorama.hoy, modificadoEn: `${e.panorama.hoy}T08:00:00Z`,
      cliente: { id: 'cli-demo-1', nombre: 'Botica Salud Total SAC', ruc: '20512345671', direccion: 'Av. Giraldez 480, Huancayo', distrito: 'Huancayo', ubigeo: '120101' },
      vendedor: 'Rosa Paredes', condicionPago: 'Contado', lineas: [{ lineaId: 'l-1', productoCodigo: prod.codigo, descripcion: prod.descripcion, cantidad: 6 }],
    } }
    ok(await repo.actualizarBandeja(JT))
    const v = (await repo.obtenerRuta(r.id))!
    expect(v.paradas).toHaveLength(1)
    expect(v.paradas[0]).toMatchObject({ origen: 'PEDIDO', pedidoId: 'ped-demo-104', salidaNumero: a.numero, cliente: 'Botica Salud Total SAC', clave: 'ped-demo-104' })
    expect((await repo.obtenerSalida(a.id))).toMatchObject({ estado: 'ABIERTA', porConciliar: false, rutaNumero: v.numero })
    // se vuelve a guardar la ruta con el pedido o con la orden: es la misma parada
    ok(await repo.planificarRuta(r.id, plan(r, [{ pedidoId: 'ped-demo-104' }], 'Con el pedido'), JT))
    ok(await repo.planificarRuta(r.id, plan(r, [{ salidaId: a.id }], 'Con la orden'), JT))
    expect((await repo.obtenerRuta(r.id))!.paradas.map((p) => p.pedidoId)).toEqual(['ped-demo-104'])
    expect((await repo.obtenerSalida(a.id))!.estado).toBe('ABIERTA')
  })
})

describe('tipo B: entrega al transportista del cliente (demo)', () => {
  /** Una orden B lista para entregar: picking, conformidad, GRE del cliente, paquete documental y embalaje. */
  async function bLista() {
    const d = await conStock('DIPHASAC')
    const b = ok(await repo.crearOrdenManual({ clase: 'B', propietarioId: d.propietarioId, greNumero: 'T001-00001234', greArchivo: 'gre/x.pdf', lineas: [{ productoId: d.productoId, loteId: d.loteId, cantidad: 4, motivo: 'VENTA' }] }, JT)).ordenes[0]
    await imprimirYConformar(repo, b.id, { jt: JT, picker: AUX, conforme: SANDRA, bultos: 1 })
    const pq = (await repo.paqueteSalida(b.id))!
    await repo.cargarCoaEnBloque(pq.items.map((i) => ({ nombre: `COA_${i.lote}.pdf`, hash: `h-${i.lote}`, bytes: 1000, ref: `demo/${i.lote}.pdf` })), SANDRA)
    ok(await repo.registrarGre(b.id, 'T001-00001234', undefined, JT))
    const emb = (await repo.embalajeSalida(b.id))
    if (emb && emb.porEmbalar.length) ok(await repo.embalarSalida(b.id, [{ contenido: emb.porEmbalar.map((x) => ({ lineaId: x.lineaId, loteId: x.loteId, cantidad: x.cantidad })) }], AUX))
    return { ...b, productoId: d.productoId }
  }
  const entrada = (salidaId: string, extra: Partial<EntradaEntrega> = {}): EntradaEntrega => ({ salidaId, transportista: 'Transportes Andes SAC', placa: 'abc-123', hora: new Date(Date.now() - 60_000).toISOString(), entregaAlmacen: 'Charlie Almacén', ...extra })

  it('la orden B lista pide «Entregar al transportista del cliente»; al registrarlo queda «Entregada al transportista», la salida se confirma y el stock baja una sola vez', async () => {
    const b = await bLista()
    const v0 = (await repo.obtenerSalida(b.id))!
    expect(v0.etapa).toBe('LISTA_PARA_CARGA')
    const antes = await stockTotal()
    expect(await repo.registrarEntregaTransportistaCliente(entrada(b.id), AUX)).toMatchObject({ ok: false, mensaje: 'Solo el Jefe de Transporte o el Jefe de Almacén entregan la mercadería al transportista del cliente' })
    expect(await repo.registrarEntregaTransportistaCliente(entrada(b.id, { transportista: ' ' }), JA)).toMatchObject({ ok: false, mensaje: 'Escribe el nombre del transportista (o de quien recoge)' })
    expect(await repo.registrarEntregaTransportistaCliente(entrada(b.id, { placa: undefined }), JA)).toMatchObject({ ok: false, mensaje: 'Escribe la placa del vehículo o el DNI de quien recoge' })
    expect(await repo.registrarEntregaTransportistaCliente(entrada(b.id, { placa: undefined, documento: '123' }), JA)).toMatchObject({ ok: false, mensaje: 'El DNI tiene 8 números' })
    expect(await repo.registrarEntregaTransportistaCliente(entrada(b.id, { hora: new Date(Date.now() + 3_600_000).toISOString() }), JA)).toMatchObject({ ok: false, mensaje: 'La hora de la entrega no puede ser futura' })
    expect(await stockTotal()).toBe(antes)
    const r = ok(await repo.registrarEntregaTransportistaCliente(entrada(b.id, { cargoRef: 'cargo-entrega/foto.jpg', cargoNombre: 'foto.jpg' }), JA))
    const v = (await repo.obtenerSalida(b.id))!
    expect(v).toMatchObject({ estado: 'CONFIRMADA', etapa: 'ENTREGADA_AL_TRANSPORTISTA' })
    expect(v.entrega).toMatchObject({ id: r.id, transportista: 'Transportes Andes SAC', placa: 'ABC-123', entregaAlmacen: 'Charlie Almacén', cargoArchivo: 'cargo-entrega/foto.jpg' })
    expect(await stockTotal()).toBe(antes - 4)
    expect(ok(await repo.registrarEntregaTransportistaCliente(entrada(b.id), JT)).id).toBe(r.id)       // repetir devuelve la misma entrega
    expect(await stockTotal()).toBe(antes - 4)
    expect((await repo.listarSalidas()).find((x) => x.id === b.id)!.etapa).toBe('ENTREGADA_AL_TRANSPORTISTA')
    expect((await repo.auditoria()).some((x) => x.evento === 'entrega_transportista_cliente')).toBe(true)
  })

  it('solo una orden por cuenta de un cliente, lista para entregar y sin ruta', async () => {
    const s = await conStock('LOGISSA')
    const a = ok(await repo.crearOrdenManual(A(s.productoId, 2, 'PED-RO-020'), JT)).ordenes[0]
    expect(await repo.registrarEntregaTransportistaCliente(entrada(a.id), JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('solo para una orden por cuenta de un cliente') })
    const d = await conStock('DIPHASAC')
    const b = ok(await repo.crearOrdenManual({ clase: 'B', propietarioId: d.propietarioId, greNumero: 'T001-00001299', greArchivo: 'gre/y.pdf', lineas: [{ productoId: d.productoId, loteId: d.loteId, cantidad: 1, motivo: 'VENTA' }] }, JT)).ordenes[0]
    expect(await repo.registrarEntregaTransportistaCliente(entrada(b.id), JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('todavía no está lista para entregarse') })
    expect((await repo.obtenerSalida(b.id))!.estado).toBe('ABIERTA')
  })
})
