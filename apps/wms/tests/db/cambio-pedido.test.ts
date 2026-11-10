// SA-3 (migración 0029): la versión nueva del pedido actualiza sola la Orden de Salida (línea quitada, reducida, agregada, aumentada), el pedido cancelado la cancela y
// libera todo, y con el picking ya iniciado lo picado se devuelve a su ubicación con un movimiento verificado antes de seguir o cerrar.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { diferenciasDeLineas, textoAlertaCambio } from '@/domain/cambio-pedido'
import type { LineaPedido, PedidoSnapshot } from '@/domain/pedidos-despacho'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let aux1: string
let aux2: string
let sandra: string
let sinRol: string

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)

async function persona(rol: string | string[]): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  for (const r of Array.isArray(rol) ? rol : [rol]) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, r])
  return id
}

interface Prod { id: string; codigo: string; descripcion: string }
let nProd = 0
async function producto(): Promise<Prod> {
  nProd += 1
  const codigo = `CP-${nProd}-${randomUUID().slice(0, 4)}`.toUpperCase()
  const descripcion = `Producto cambio ${nProd}`
  return { id: (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [codigo, descripcion])).id as string, codigo, descripcion }
}
async function sembrar(prod: string, lote: string, vence: string, cantidad: number, pos = 'F-1.1') {
  const posId = await idPosicion(base.admin, pos)
  const loteId = (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, $3, $4) returning id`, [prod, lote, vence, logissa])).id as string
  await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: logissa, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: cantidad }]))
  return loteId
}
const saldo = async (prod: string, area: string) => Number((await uno(`select coalesce(sum(s.cantidad), 0)::int n from wms.saldos s join wms.posiciones p on p.id = s.posicion_id where s.producto_id = $1 and p.tipo_area = $2 and s.estado = 'APROBADO'`, [prod, area])).n)
const disponible = async (prod: string) => Number((await como(jt, async (c) => (await c.query('select coalesce(sum(disponible), 0)::int n from wms.disponibilidad_por_lote($1, $2)', [logissa, prod])).rows[0])).n)

let nPed = 0
const linea = (id: string, p: Prod, cantidad: number): LineaPedido => ({ lineaId: id, productoCodigo: p.codigo, descripcion: p.descripcion, cantidad })
const snapshot = (lineas: LineaPedido[], extra: Partial<PedidoSnapshot> = {}): PedidoSnapshot => {
  nPed += 1
  return {
    pedidoId: `cp-${nPed}-${randomUUID().slice(0, 4)}`, numero: `PED-C${String(nPed).padStart(3, '0')}`, version: 1, estado: 'READY_FOR_OPERATIONS', fecha: hoy, modificadoEn: `${hoy}T10:00:00Z`,
    cliente: { id: `c-${nPed}`, nombre: `Botica ${nPed} SAC`, ruc: '20123456789' }, vendedor: 'Rosa Paredes', lineas, ...extra,
  }
}
const importar = (peds: unknown[]) => como(jt, async (c) => (await c.query('select wms.registrar_importacion_pedidos($1, $2::jsonb, null) r', ['cambio.test', JSON.stringify(peds)])).rows[0].r as Record<string, unknown>)
const version = (v1: PedidoSnapshot, lineas: LineaPedido[], extra: Partial<PedidoSnapshot> = {}): PedidoSnapshot => ({ ...v1, version: v1.version + 1, lineas, ...extra })
const cancelacion = (v1: PedidoSnapshot, motivo = 'El cliente ya no lo necesita'): PedidoSnapshot => ({ ...v1, version: v1.version + 1, estado: 'CANCELLED', motivoCancelacion: motivo, canceladoPor: 'Rosa Paredes' })

/** Un pedido importado cuya orden de salida (de venta de Logissa) ya tiene su stock asignado por FEFO. */
async function montar(lineas: { p: Prod; cantidad: number }[], extra: Partial<PedidoSnapshot> = {}, opciones: { enlazar?: boolean } = {}) {
  const v1 = snapshot(lineas.map((l, i) => linea(`l-${i + 1}`, l.p, l.cantidad)), extra)
  await importar([v1])
  const salida = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb, 'pedido', $3) id`, [logissa, JSON.stringify(lineas.map((l) => ({ producto_id: l.p.id, cantidad: l.cantidad }))), v1.pedidoId])).rows[0].id as string)
  await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [salida]))
  await base.admin.query('update wms.pedidos_despacho set salida_id = $1 where pedido_id = $2 and vigente', [salida, v1.pedidoId])
  // cada línea de la orden sabe de qué línea del pedido viene (lo normal en una orden nueva; la primera prueba lo deja a la migración)
  if (opciones.enlazar !== false) for (const [i, l] of lineas.entries()) await base.admin.query('update wms.salida_lineas set pedido_linea_id = $1 where salida_id = $2 and producto_id = $3', [`l-${i + 1}`, salida, l.p.id])
  const numero = (await uno('select numero from wms.salidas where id = $1', [salida])).numero as string
  return { v1, salida, numero }
}
const lineasDe = (salida: string) => q(`select id, producto_id, cantidad, cantidad_nueva, estado, pedido_linea_id from wms.salida_lineas where salida_id = $1 order by pedido_linea_id nulls last, id`, [salida])
const reservasDe = (salida: string) => q(`select r.id, r.cantidad, r.estado, lt.codigo lote, r.linea_id from wms.reservas r join wms.lotes lt on lt.id = r.lote_id join wms.salida_lineas sl on sl.id = r.linea_id where sl.salida_id = $1 order by sl.pedido_linea_id nulls last, lt.vence, r.cantidad, r.id`, [salida])
const estadoSalida = (salida: string) => uno('select estado, cancelacion_pendiente, motivo_cancelacion from wms.salidas where id = $1', [salida])
const alerta = (clave: string) => uno('select tipo, destinatario_rol, estado, mensaje from wms.alertas where clave = $1', [clave])
const hoja = async (salida: string, picker: string | null = null) => como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1, $2) id', [salida, picker])).rows[0].id as string)
const conformar = (quien: string, op: string, bultos = 1) => como(quien, (c) => c.query('select wms.conformar_orden($1, null, $2, null)', [op, bultos]))
const pickear = async (quien: string, op: string) => {
  for (const ol of await q('select id, cantidad from wms.ordenes_picking_lineas where orden_id = $1 and picking = $2 and cantidad > 0', [op, 'PENDIENTE'])) {
    await como(quien, (c) => c.query(`select wms.registrar_picking($1, 'PICKEADA', $2)`, [ol.id, ol.cantidad]))
  }
}
const devoluciones = (salida: string) => q('select estado, estado_reserva, cantidad, causa, orden_movimiento_id, devuelta_por, verificada_por from wms.devoluciones_picking where salida_id = $1 order by creada_en, id', [salida])

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  jt = await persona('jefe_transporte'); aux1 = await persona('auxiliar'); aux2 = await persona('auxiliar'); sandra = await persona(['asistente_dt', 'conformidad_despacho']); sinRol = base.personas.sinRol.id
  await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-CP', 'S', 'PISO', 'DESPACHO')`)
  await base.admin.query(`update wms.parametros set valor = 'STG-CP' where clave = 'posicion_despacho_defecto'`)
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('la versión nueva del pedido actualiza sola la Orden de Salida (sin picking)', () => {
  it('línea quitada: se cancela, libera sus reservas y avisa «se quitó X; se liberaron N unidades» (el mismo texto del dominio)', async () => {
    const a = await producto(); const b = await producto()
    await sembrar(a.id, 'A1', en(300), 200); await sembrar(b.id, 'B1', en(300), 200)
    const o = await montar([{ p: a, cantidad: 40 }, { p: b, cantidad: 25 }], {}, { enlazar: false })   // las líneas se enlazan solas con la versión anterior del pedido
    const antes = await disponible(b.id)
    const v2 = version(o.v1, [o.v1.lineas[0]])
    expect(await importar([v2])).toMatchObject({ nuevas_versiones: 1 })
    const l = await lineasDe(o.salida)
    expect(l.map((x) => [x.pedido_linea_id, x.estado])).toEqual([['l-1', 'ASIGNADA'], ['l-2', 'CANCELADA']])
    expect((await reservasDe(o.salida)).map((r) => [r.cantidad, r.estado])).toEqual([[40, 'ACTIVA'], [25, 'LIBERADA']])
    expect(await disponible(b.id)).toBe(antes + 25)                              // lo liberado vuelve al stock libre
    expect(await estadoSalida(o.salida)).toMatchObject({ estado: 'ABIERTA' })      // la orden sigue
    const esperado = textoAlertaCambio({ numeroPedido: o.v1.numero, cambios: diferenciasDeLineas(o.v1.lineas, v2.lineas), liberadas: 25, porDevolver: 0, yaNoFalta: 0, conFalta: 0 })
    expect(esperado).toBe(`El pedido ${o.v1.numero} cambió: se quitó ${b.descripcion} (25 u.); se liberaron 25 unidades.`)
    expect(await alerta(`pedido-cambiado:${o.v1.pedidoId}:2`)).toMatchObject({ tipo: 'PEDIDO_CAMBIADO', destinatario_rol: 'jefe_transporte', estado: 'ABIERTA', mensaje: esperado })
    expect((await uno(`select cambio_pendiente from wms.pedidos_despacho where pedido_id = $1 and vigente`, [o.v1.pedidoId])).cambio_pendiente).toBe(false)
    const aud = await uno(`select despues, motivo from wms.audit_events where evento = 'pedido_cambio_aplicado' and entidad_id = $1`, [o.salida])
    expect(aud.despues).toMatchObject({ pedido: o.v1.numero, version: 2, liberadas: 25, por_devolver: 0 })
  })

  it('cantidad reducida: libera lo sobrante empezando por el lote que vence después, así lo que queda sigue siendo FEFO', async () => {
    const a = await producto()
    await sembrar(a.id, 'PRONTO', en(100), 10); await sembrar(a.id, 'TARDE', en(400), 100)
    const o = await montar([{ p: a, cantidad: 40 }])
    expect((await reservasDe(o.salida)).map((r) => [r.lote, r.cantidad])).toEqual([['PRONTO', 10], ['TARDE', 30]])
    await importar([version(o.v1, [linea('l-1', a, 25)])])
    expect((await reservasDe(o.salida)).filter((r) => r.estado === 'ACTIVA').map((r) => [r.lote, r.cantidad])).toEqual([['PRONTO', 10], ['TARDE', 15]])
    expect(await lineasDe(o.salida)).toMatchObject([{ cantidad: 25, estado: 'ASIGNADA' }])
    expect((await alerta(`pedido-cambiado:${o.v1.pedidoId}:2`)).mensaje).toBe(`El pedido ${o.v1.numero} cambió: se redujo ${a.descripcion} de 40 a 25; se liberaron 15 unidades.`)
    // lo propuesto por FEFO es ahora lo vigente: no aparece como «fuera de FEFO»
    const f = await uno('select asignacion_fefo from wms.salida_lineas where salida_id = $1', [o.salida])
    expect((f.asignacion_fefo as { cantidad: number }[]).map((x) => x.cantidad).sort()).toEqual([10, 15])
    // se reduce otra vez, y se libera todo el lote tardío
    const v3 = version(version(o.v1, [linea('l-1', a, 25)]), [linea('l-1', a, 8)])
    await importar([v3])
    expect((await reservasDe(o.salida)).filter((r) => r.estado === 'ACTIVA').map((r) => [r.lote, r.cantidad])).toEqual([['PRONTO', 8]])
  })

  it('línea agregada: se agrega a la orden y se asigna por FEFO; un producto que el WMS no conoce se avisa y no se inventa', async () => {
    const a = await producto(); const nuevo = await producto()
    await sembrar(a.id, 'AG1', en(300), 100); await sembrar(nuevo.id, 'NU1', en(300), 100)
    const o = await montar([{ p: a, cantidad: 10 }])
    const v2 = version(o.v1, [o.v1.lineas[0], linea('l-2', nuevo, 6), { lineaId: 'l-3', productoCodigo: 'NO-EXISTE-9', descripcion: 'Producto desconocido', cantidad: 3 }])
    await importar([v2])
    const l = await lineasDe(o.salida)
    expect(l).toHaveLength(2)
    expect(l[1]).toMatchObject({ pedido_linea_id: 'l-2', cantidad: 6, estado: 'ASIGNADA' })
    expect((await reservasDe(o.salida)).map((r) => [r.cantidad, r.estado])).toEqual([[10, 'ACTIVA'], [6, 'ACTIVA']])
    expect((await alerta(`pedido-linea-sin-catalogo:${o.v1.pedidoId}:l-3`)).mensaje).toMatch(/agregó un producto que el WMS no conoce \(NO-EXISTE-9\)/)
    expect((await alerta(`pedido-cambiado:${o.v1.pedidoId}:2`)).mensaje).toBe(`El pedido ${o.v1.numero} cambió: se agregó ${nuevo.descripcion} (6 u.).`)
  })

  it('cantidad aumentada: se asigna lo que falta; si no alcanza, la línea queda sin stock y decide el vendedor (sin pendientes a medias)', async () => {
    const a = await producto()
    await sembrar(a.id, 'AU1', en(300), 30)
    const o = await montar([{ p: a, cantidad: 20 }])
    await importar([version(o.v1, [linea('l-1', a, 28)])])
    expect(await lineasDe(o.salida)).toMatchObject([{ cantidad: 28, estado: 'ASIGNADA' }])
    expect((await reservasDe(o.salida)).reduce((t, r) => t + r.cantidad, 0)).toBe(28)
    // pide 40 y solo hay 30: queda SIN_STOCK con la explicación de lo que falta, sin soltar lo ya reservado
    await importar([version(version(o.v1, [linea('l-1', a, 28)]), [linea('l-1', a, 40)])])
    expect(await lineasDe(o.salida)).toMatchObject([{ cantidad: 40, estado: 'SIN_STOCK' }])
    const al = await alerta(`stock:${(await lineasDe(o.salida))[0].id}`)
    expect(al.mensaje).toContain('Stock insuficiente: pide 12 y hay 2 disponibles. Faltan 10: 10 sin stock.')
    expect((await alerta(`pedido-cambiado:${o.v1.pedidoId}:3`)).mensaje).toMatch(/Todavía falta stock en alguna línea: el vendedor decide en Pedidos\.$/)
  })
})

describe('con falta de stock decide el vendedor: lo que llega de Pedidos se refleja y queda como quiebre', () => {
  it('quita la línea sin stock: se cancela, la alerta se cierra y queda «LINEA_QUITADA_POR_VENDEDOR» con las cantidades que faltaban', async () => {
    const a = await producto(); const b = await producto()
    await sembrar(a.id, 'Q-A', en(300), 100); await sembrar(b.id, 'Q-B', en(300), 5)
    const o = await montar([{ p: a, cantidad: 10 }, { p: b, cantidad: 12 }])
    const lb = (await lineasDe(o.salida))[1]
    expect(lb.estado).toBe('SIN_STOCK')
    await importar([version(o.v1, [o.v1.lineas[0]])])
    expect((await lineasDe(o.salida)).map((x) => x.estado)).toEqual(['ASIGNADA', 'CANCELADA'])
    expect((await alerta(`stock:${lb.id}`)).estado).toBe('ATENDIDA')
    const qs = await q(`select causa, origen, cantidad_pedida, cantidad_faltante, cantidad_causa, vendedor, pedido_numero, detalle from wms.quiebres_stock where linea_id = $1 and origen = 'PEDIDOS'`, [lb.id])
    expect(qs).toHaveLength(1)
    expect(qs[0]).toMatchObject({ causa: 'LINEA_QUITADA_POR_VENDEDOR', cantidad_pedida: 12, cantidad_faltante: 7, cantidad_causa: 7, vendedor: 'Rosa Paredes', pedido_numero: o.v1.numero })
    expect(qs[0].detalle).toMatchObject({ pedido: 12, disponibles: 5, faltan: 7, version: 2, causas: { SIN_STOCK: 7 } })
    expect((await alerta(`pedido-cambiado:${o.v1.pedidoId}:2`)).mensaje).toBe(`El pedido ${o.v1.numero} cambió: se quitó ${b.descripcion} (12 u.). Ya no falta stock: la orden sigue su flujo.`)
  })

  it('reduce la línea a lo que hay: la orden sigue su flujo, se avisa y queda «LINEA_REDUCIDA_POR_VENDEDOR»', async () => {
    const a = await producto()
    await sembrar(a.id, 'R-A', en(300), 20)
    const o = await montar([{ p: a, cantidad: 50 }])
    const l = (await lineasDe(o.salida))[0]
    expect(l.estado).toBe('SIN_STOCK')
    await importar([version(o.v1, [linea('l-1', a, 20)])])
    expect(await lineasDe(o.salida)).toMatchObject([{ cantidad: 20, estado: 'ASIGNADA' }])
    expect((await reservasDe(o.salida)).map((r) => [r.cantidad, r.estado])).toEqual([[20, 'ACTIVA']])
    expect((await alerta(`stock:${l.id}`)).estado).toBe('ATENDIDA')
    expect((await uno(`select causa, cantidad_causa, detalle from wms.quiebres_stock where linea_id = $1 and origen = 'PEDIDOS'`, [l.id]))).toMatchObject({ causa: 'LINEA_REDUCIDA_POR_VENDEDOR', cantidad_causa: 30, detalle: { de: 50, a: 20 } })
    expect((await alerta(`pedido-cambiado:${o.v1.pedidoId}:2`)).mensaje).toMatch(/se redujo .* de 50 a 20\. Ya no falta stock: la orden sigue su flujo\.$/)
  })

  it('cancela el pedido: la orden se cancela, libera todo, guarda el motivo y queda «CANCELADO_POR_VENDEDOR» solo de las líneas que faltaban', async () => {
    const a = await producto(); const b = await producto()
    await sembrar(a.id, 'C-A', en(300), 100); await sembrar(b.id, 'C-B', en(300), 3)
    const o = await montar([{ p: a, cantidad: 10 }, { p: b, cantidad: 9 }])
    const antes = await disponible(a.id)
    const c = cancelacion(o.v1, 'El cliente prefiere esperar al próximo mes')
    expect(await importar([c])).toMatchObject({ nuevas_versiones: 1, descartados: [] })
    expect(await estadoSalida(o.salida)).toMatchObject({ estado: 'CANCELADA', cancelacion_pendiente: false, motivo_cancelacion: 'El cliente prefiere esperar al próximo mes' })
    expect((await lineasDe(o.salida)).map((x) => x.estado)).toEqual(['CANCELADA', 'CANCELADA'])
    expect((await reservasDe(o.salida)).every((r) => r.estado === 'LIBERADA')).toBe(true)
    expect(await disponible(a.id)).toBe(antes + 10)
    const qs = await q(`select causa, cantidad_causa from wms.quiebres_stock where salida_id = $1 and origen = 'PEDIDOS'`, [o.salida])
    expect(qs).toEqual([{ causa: 'CANCELADO_POR_VENDEDOR', cantidad_causa: 6 }])
    const esperado = textoAlertaCambio({ numeroPedido: o.v1.numero, cambios: [], liberadas: 10, porDevolver: 0, yaNoFalta: 0, conFalta: 0, cancelado: { motivo: 'El cliente prefiere esperar al próximo mes' } })
    expect(await alerta(`pedido-cambiado:${o.v1.pedidoId}:2`)).toMatchObject({ tipo: 'PEDIDO_CANCELADO', destinatario_rol: 'jefe_transporte', mensaje: esperado })
    expect(esperado).toBe(`El pedido ${o.v1.numero} se canceló en Pedidos: El cliente prefiere esperar al próximo mes. Se canceló la orden y se liberaron 10 unidades.`)
    // el pedido queda en la bandeja como cancelado, con su motivo
    const f = await uno(`select snapshot, vigente, version from wms.pedidos_despacho where pedido_id = $1 and vigente`, [o.v1.pedidoId])
    expect(f).toMatchObject({ version: 2, snapshot: { estado: 'CANCELLED', motivoCancelacion: 'El cliente prefiere esperar al próximo mes', canceladoPor: 'Rosa Paredes' } })
    expect((await uno(`select cambios from wms.pedidos_despacho where pedido_id = $1 and vigente`, [o.v1.pedidoId])).cambios).toEqual(['El pedido se canceló en Pedidos: El cliente prefiere esperar al próximo mes'])
  })

  it('quitar todas las líneas equivale a cancelar la orden', async () => {
    const a = await producto(); await sembrar(a.id, 'T-A', en(300), 50)
    const o = await montar([{ p: a, cantidad: 5 }])
    await importar([{ ...o.v1, version: 2, lineas: [{ ...linea('l-nueva', a, 1), productoCodigo: 'NO-EXISTE-1' }] }])   // la línea de antes se quita y la nueva es de un producto desconocido
    expect(await estadoSalida(o.salida)).toMatchObject({ estado: 'CANCELADA', motivo_cancelacion: 'Pedidos quitó todas las líneas del pedido' })
    expect((await reservasDe(o.salida)).every((r) => r.estado === 'LIBERADA')).toBe(true)
  })

  it('un pedido cancelado trae su motivo; sin motivo (o con otro estado) se descarta con su razón; un pedido cancelado no se planifica', async () => {
    const a = await producto(); await sembrar(a.id, 'D-A', en(300), 10)
    const v1 = snapshot([linea('l-1', a, 1)])
    await importar([v1])
    const r = await importar([{ ...v1, version: 2, estado: 'CANCELLED' }, { ...v1, pedidoId: 'otro', numero: 'PED-OTRO', estado: 'DRAFT' }])
    expect(r.descartados).toEqual([
      { referencia: v1.numero, motivo: 'Un pedido cancelado trae el motivo de la cancelación (motivoCancelacion).' },
      { referencia: 'PED-OTRO', motivo: 'Solo se importan pedidos READY_FOR_OPERATIONS o CANCELLED.' },
    ])
    // cancelado sin orden: queda vigente como cancelado y no se puede meter en una ruta
    await importar([cancelacion(v1, 'Duplicado')])
    const pd = await uno('select id, snapshot from wms.pedidos_despacho where pedido_id = $1 and vigente', [v1.pedidoId])
    expect(pd.snapshot.estado).toBe('CANCELLED')
    const ruta = await como(jt, async (c) => (await c.query('select wms.crear_ruta($1, null, null, null) id', [en(3)])).rows[0].id as string)
    await base.admin.query(`update wms.parametros set valor = '23:59' where clave = 'hora_corte_planificacion'`)
    const e = await falla(como(jt, (c) => c.query('select wms.planificar_ruta($1, $2, null, null, null, $3::jsonb, null)', [ruta, en(3), JSON.stringify([{ pedido_id: v1.pedidoId, excepcion_corte: true, motivo_excepcion: 'prueba' }])])))
    expect(e.message).toMatch(new RegExp(`El pedido ${v1.numero} se canceló en Pedidos: no se puede planificar`))
  })

  it('una orden que ya salió no se toca: se avisa al Jefe de Transporte', async () => {
    const a = await producto(); await sembrar(a.id, 'S-A', en(300), 10)
    const o = await montar([{ p: a, cantidad: 2 }])
    await base.admin.query(`update wms.salidas set estado = 'CONFIRMADA' where id = $1`, [o.salida])
    await importar([cancelacion(o.v1)])
    expect((await estadoSalida(o.salida)).estado).toBe('CONFIRMADA')
    expect((await alerta(`pedido-cambiado:${o.v1.pedidoId}:2`))).toMatchObject({ tipo: 'PEDIDO_CANCELADO', mensaje: `El pedido ${o.v1.numero} se canceló en Pedidos: El cliente ya no lo necesita. La orden ya salió: coordina el retorno con el transportista.` })
  })

  it('una orden manual de venta (tipo A) que referencia el pedido por su número se actualiza igual: la unión es por referencia, no por la bandeja', async () => {
    const a = await producto(); await sembrar(a.id, 'M-A', en(300), 100)
    const v1 = snapshot([linea('l-1', a, 10)])
    // la orden existe antes de que el pedido llegue por la bandeja (SA-2 la crea con el número del pedido)
    const salida = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb, 'pedido', $3) id`, [logissa, JSON.stringify([{ producto_id: a.id, cantidad: 10 }]), v1.numero])).rows[0].id as string)
    await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [salida]))
    await importar([v1])                                                       // primera versión: nada que cambiar
    expect((await reservasDe(salida)).map((r) => r.cantidad)).toEqual([10])
    await importar([version(v1, [linea('l-1', a, 4)])])                        // la segunda sí se aplica a la orden manual
    expect((await reservasDe(salida)).filter((r) => r.estado === 'ACTIVA').map((r) => r.cantidad)).toEqual([4])
    expect(await lineasDe(salida)).toMatchObject([{ cantidad: 4, pedido_linea_id: 'l-1' }])
  })
})

describe('con la hoja de picking ya impresa (nadie picó todavía)', () => {
  it('la hoja se actualiza sola: lo quitado queda en cero, lo agregado entra, y la alerta pide volver a imprimirla', async () => {
    const a = await producto(); const b = await producto(); const c = await producto()
    await sembrar(a.id, 'H-A', en(300), 100); await sembrar(b.id, 'H-B', en(300), 100); await sembrar(c.id, 'H-C', en(300), 100)
    const o = await montar([{ p: a, cantidad: 10 }, { p: b, cantidad: 8 }])
    const op = await hoja(o.salida)
    expect((await q('select cantidad from wms.ordenes_picking_lineas where orden_id = $1 order by cantidad', [op])).map((x) => x.cantidad)).toEqual([8, 10])
    await importar([version(o.v1, [linea('l-1', a, 6), linea('l-3', c, 5)])])    // reduce A, quita B, agrega C
    const lineasHoja = await q('select cantidad, picking, conformidad from wms.ordenes_picking_lineas where orden_id = $1 order by cantidad, id', [op])
    expect(lineasHoja.filter((x) => x.cantidad > 0).map((x) => x.cantidad).sort()).toEqual([5, 6])
    expect(lineasHoja.filter((x) => x.cantidad === 0)).toHaveLength(1)           // la de B ya no cuenta
    expect(lineasHoja.filter((x) => x.cantidad > 0).every((x) => x.picking === 'PENDIENTE' && x.conformidad === 'PENDIENTE')).toBe(true)
    expect((await lineasDe(o.salida)).map((x) => x.estado)).toEqual(['EN_PICKING', 'CANCELADA', 'EN_PICKING'])
    expect((await alerta(`pedido-cambiado:${o.v1.pedidoId}:2`)).mensaje).toMatch(/Vuelve a imprimir la hoja de picking\.$/)
    // la conformidad de lo que queda funciona (la orden sigue su flujo)
    await como(jt, (cl) => cl.query('select wms.designar_picker($1, $2)', [op, aux1]))
    expect(await conformar(sandra, op, 2).then(() => 'ok')).toBe('ok')
    expect(await saldo(a.id, 'DESPACHO')).toBe(6)
    expect(await saldo(c.id, 'DESPACHO')).toBe(5)
    expect(await saldo(b.id, 'DESPACHO')).toBe(0)
  })
})

describe('con el picking ya iniciado: lo picado se devuelve a su ubicación con un movimiento verificado', () => {
  /** Una orden con dos líneas, ya conforme: lo picado está en Despacho. */
  async function conforme() {
    const a = await producto(); const b = await producto()
    const lote = await sembrar(a.id, 'P-A', en(300), 100); await sembrar(b.id, 'P-B', en(300), 100)
    const o = await montar([{ p: a, cantidad: 20 }, { p: b, cantidad: 15 }])
    const op = await hoja(o.salida, aux1)
    await conformar(sandra, op, 2)
    expect(await saldo(a.id, 'DESPACHO')).toBe(20)
    return { ...o, a, b, op, lote }
  }

  it('línea quitada con lo picado en Despacho: queda «por devolver»; la orden no sigue (ni guía, ni salida) hasta que otra persona verifique la devolución', async () => {
    const o = await conforme()
    await importar([version(o.v1, [o.v1.lineas[1]])])
    expect(await devoluciones(o.salida)).toMatchObject([{ estado: 'POR_DEVOLVER', estado_reserva: 'EN_STAGING', cantidad: 20, causa: 'CAMBIO_PEDIDO', orden_movimiento_id: null }])
    expect(await estadoSalida(o.salida)).toMatchObject({ estado: 'ABIERTA', cancelacion_pendiente: false })
    expect((await lineasDe(o.salida)).map((x) => [x.estado, x.cantidad_nueva])).toEqual([['CONFORME', 0], ['CONFORME', null]])
    expect((await reservasDe(o.salida)).map((r) => [r.cantidad, r.estado])).toEqual([[20, 'EN_STAGING'], [15, 'EN_STAGING']]) // sigue comprometido: no se libera solo
    expect(await saldo(o.a.id, 'DESPACHO')).toBe(20)
    expect((await alerta(`devolucion:${o.salida}`))).toMatchObject({ tipo: 'DEVOLUCION_PICKING', destinatario_rol: 'jefe_almacen', estado: 'ABIERTA' })
    expect((await alerta(`pedido-cambiado:${o.v1.pedidoId}:2`)).mensaje).toBe(`El pedido ${o.v1.numero} cambió: se quitó ${o.a.descripcion} (20 u.). Hay 20 unidades ya picadas que se devuelven a su ubicación: otra persona lo verifica antes de seguir.`)
    // mientras tanto, nada avanza: confirmar la salida mueve de Despacho, y aunque tenga permiso la devolución pendiente lo impide
    expect((await falla(como(jt, (c) => c.query('select wms.confirmar_salida($1)', [o.salida])))).message).toMatch(/unidades picadas por devolver a su ubicación/)
    const e2 = await falla(base.admin.query(`insert into wms.bultos (salida_id, secuencia, total, codigo, embalado_por) values ($1, 1, 1, 'X-B1', $2)`, [o.salida, jt]))
    expect(e2.message).toMatch(/unidades picadas por devolver a su ubicación/)
  })

  it('el auxiliar devuelve (se crea la orden de Movimientos internos DESPACHO → ubicación original) y otra persona verifica: el stock vuelve al rack y la línea se cancela', async () => {
    const o = await conforme()
    await importar([version(o.v1, [o.v1.lineas[1]])])
    expect((await falla(como(sinRol, (c) => c.query('select wms.ejecutar_devolucion_picking($1)', [o.salida])))).message).toBe('No tienes permiso para registrar movimientos')
    expect((await falla(como(jt, (c) => c.query('select wms.verificar_devolucion_picking($1)', [o.salida])))).message).toBe('Solo el personal de almacén verifica movimientos')
    expect((await falla(como(aux2, (c) => c.query('select wms.verificar_devolucion_picking($1)', [o.salida])))).message).toMatch(/Todavía no se devolvió nada/)
    const mi = await como(aux1, async (c) => (await c.query('select wms.ejecutar_devolucion_picking($1) id', [o.salida])).rows[0].id as string)
    const orden = await uno('select numero, estado, motivo, ejecutor_id from wms.ordenes_movimiento where id = $1', [mi])
    expect(orden).toMatchObject({ estado: 'EJECUTADO', ejecutor_id: aux1 })
    expect(orden.numero).toMatch(/^MI-\d{4}-\d{5}$/)
    expect(orden.motivo).toMatch(new RegExp(`Devolución de lo picado de ${o.numero}`))
    const ml = await q(`select l.cantidad, d.tipo_area desde, h.codigo hacia from wms.ordenes_movimiento_lineas l join wms.posiciones d on d.id = l.desde_posicion_id join wms.posiciones h on h.id = l.hasta_posicion_id where l.orden_id = $1`, [mi])
    expect(ml).toEqual([{ cantidad: 20, desde: 'DESPACHO', hacia: 'F-1.1' }])
    expect(await devoluciones(o.salida)).toMatchObject([{ estado: 'DEVUELTA', orden_movimiento_id: mi, devuelta_por: aux1 }])
    expect(await saldo(o.a.id, 'DESPACHO')).toBe(20)                          // el libro solo se mueve al verificar
    // quien devolvió no verifica
    expect((await falla(como(aux1, (c) => c.query('select wms.verificar_devolucion_picking($1)', [o.salida])))).message).toMatch(/no puede ser quien devolvió/)
    // otra persona verifica
    await como(aux2, (c) => c.query('select wms.verificar_devolucion_picking($1)', [o.salida]))
    expect(await saldo(o.a.id, 'DESPACHO')).toBe(0)
    expect(await saldo(o.a.id, 'APROBADOS')).toBe(100)
    expect(await devoluciones(o.salida)).toMatchObject([{ estado: 'VERIFICADA', verificada_por: aux2 }])
    expect((await lineasDe(o.salida)).map((x) => [x.estado, x.cantidad_nueva])).toEqual([['CANCELADA', null], ['CONFORME', null]])
    expect((await reservasDe(o.salida)).map((r) => [r.cantidad, r.estado])).toEqual([[20, 'LIBERADA'], [15, 'EN_STAGING']])
    expect((await alerta(`devolucion:${o.salida}`)).estado).toBe('ATENDIDA')
    expect(await uno('select estado, verificador_id from wms.ordenes_movimiento where id = $1', [mi])).toMatchObject({ estado: 'CONFIRMADO', verificador_id: aux2 })
    // el libro guarda a las dos personas
    expect(await uno('select ejecutor_id, verificador_id from wms.movimientos where id = (select movimiento_id from wms.ordenes_movimiento where id = $1)', [mi])).toMatchObject({ ejecutor_id: aux1, verificador_id: aux2 })
    // ahora la orden puede seguir: la salida confirma lo que quedó
    expect(await como(jt, async (c) => (await c.query('select wms.confirmar_salida($1) n', [o.salida])).rows[0].n)).toBe(1)
    expect(await saldo(o.b.id, 'DESPACHO')).toBe(0)
  })

  it('la verificación normal del movimiento (Movimientos internos) también completa la devolución', async () => {
    const o = await conforme()
    await importar([version(o.v1, [o.v1.lineas[1]])])
    const mi = await como(aux1, async (c) => (await c.query('select wms.ejecutar_devolucion_picking($1) id', [o.salida])).rows[0].id as string)
    await como(aux2, (c) => c.query('select wms.confirmar_movimiento($1)', [mi]))
    expect(await devoluciones(o.salida)).toMatchObject([{ estado: 'VERIFICADA', verificada_por: aux2 }])
    expect((await lineasDe(o.salida))[0].estado).toBe('CANCELADA')
  })

  it('si el movimiento se anula, la devolución vuelve a «por devolver»', async () => {
    const o = await conforme()
    await importar([version(o.v1, [o.v1.lineas[1]])])
    const mi = await como(aux1, async (c) => (await c.query('select wms.ejecutar_devolucion_picking($1) id', [o.salida])).rows[0].id as string)
    await como(aux1, (c) => c.query('select wms.anular_movimiento($1, $2)', [mi, 'Me equivoqué de ubicación']))
    expect(await devoluciones(o.salida)).toMatchObject([{ estado: 'POR_DEVOLVER', orden_movimiento_id: null, devuelta_por: null }])
    const mi2 = await como(aux1, async (c) => (await c.query('select wms.ejecutar_devolucion_picking($1) id', [o.salida])).rows[0].id as string)
    expect(mi2).not.toBe(mi)
  })

  it('cantidad reducida por debajo de lo picado: la reserva se parte, solo lo que sobra se devuelve y el resto sigue; las invariantes de la salida siguen valiendo', async () => {
    const o = await conforme()
    await importar([version(o.v1, [linea('l-1', o.a, 12), o.v1.lineas[1]])])
    expect(await devoluciones(o.salida)).toMatchObject([{ estado: 'POR_DEVOLVER', cantidad: 8, estado_reserva: 'EN_STAGING' }])
    expect((await lineasDe(o.salida)).map((x) => [x.cantidad, x.estado])).toEqual([[12, 'CONFORME'], [15, 'CONFORME']])
    expect((await reservasDe(o.salida)).filter((r) => r.estado !== 'LIBERADA').map((r) => r.cantidad).sort((x, y) => x - y)).toEqual([8, 12, 15])
    expect((await falla(como(jt, (c) => c.query('select wms.confirmar_salida($1)', [o.salida])))).message).toMatch(/por devolver/)
    await como(aux1, (c) => c.query('select wms.ejecutar_devolucion_picking($1)', [o.salida]))
    await como(aux2, (c) => c.query('select wms.verificar_devolucion_picking($1)', [o.salida]))
    expect(await saldo(o.a.id, 'DESPACHO')).toBe(12)
    expect(await saldo(o.a.id, 'APROBADOS')).toBe(88)
    expect((await lineasDe(o.salida))[0]).toMatchObject({ cantidad: 12, estado: 'CONFORME' })
    expect(await como(jt, async (c) => (await c.query('select wms.confirmar_salida($1) n', [o.salida])).rows[0].n)).toBe(2)   // la reserva de 12 y la de 15
    expect(await saldo(o.a.id, 'DESPACHO')).toBe(0)
    const aud = await q(`select 1 from wms.audit_events where evento = 'devolucion_picking_verificada' and entidad_id in (select id::text from wms.devoluciones_picking where salida_id = $1)`, [o.salida])
    expect(aud).toHaveLength(1)
  })

  it('pedido cancelado con el picking iniciado: la orden NO se cierra hasta verificar la devolución; entonces se cancela y queda todo libre', async () => {
    const o = await conforme()
    await importar([cancelacion(o.v1, 'Se duplicó con otro pedido')])
    expect(await estadoSalida(o.salida)).toMatchObject({ estado: 'ABIERTA', cancelacion_pendiente: true, motivo_cancelacion: 'Se duplicó con otro pedido' })
    expect((await devoluciones(o.salida)).map((d) => [d.cantidad, d.causa]).sort((x, y) => y[0] - x[0])).toEqual([[20, 'PEDIDO_CANCELADO'], [15, 'PEDIDO_CANCELADO']])
    expect((await alerta(`pedido-cambiado:${o.v1.pedidoId}:2`)).mensaje).toBe(`El pedido ${o.v1.numero} se canceló en Pedidos: Se duplicó con otro pedido. La orden se cancela cuando se devuelvan y verifiquen las 35 unidades ya picadas.`)
    await como(aux1, (c) => c.query('select wms.ejecutar_devolucion_picking($1)', [o.salida]))
    expect(await estadoSalida(o.salida)).toMatchObject({ estado: 'ABIERTA' })     // devolver no basta: falta la verificación
    await como(aux2, (c) => c.query('select wms.verificar_devolucion_picking($1)', [o.salida]))
    expect(await estadoSalida(o.salida)).toMatchObject({ estado: 'CANCELADA', cancelacion_pendiente: false })
    expect((await lineasDe(o.salida)).every((x) => x.estado === 'CANCELADA')).toBe(true)
    expect((await reservasDe(o.salida)).every((r) => r.estado === 'LIBERADA')).toBe(true)
    expect(await saldo(o.a.id, 'DESPACHO')).toBe(0); expect(await saldo(o.b.id, 'DESPACHO')).toBe(0)
    expect(await saldo(o.a.id, 'APROBADOS')).toBe(100); expect(await saldo(o.b.id, 'APROBADOS')).toBe(100)
    expect((await uno(`select estado from wms.ordenes_picking where salida_id = $1`, [o.salida])).estado).toBe('CANCELADA')
    expect((await alerta(`orden-cancelada:${o.salida}`))).toMatchObject({ tipo: 'PEDIDO_CANCELADO', estado: 'ABIERTA' })
    expect((await alerta(`orden-cancelada:${o.salida}`)).mensaje).toBe(`La orden ${o.numero} se canceló: lo picado ya volvió a su ubicación y se verificó.`)
  })

  it('picado desde el celular pero todavía en el rack (aún sin conformidad): no mueve el libro, pero otra persona también lo verifica', async () => {
    const a = await producto(); await sembrar(a.id, 'T-1', en(300), 60)
    const o = await montar([{ p: a, cantidad: 25 }])
    const op = await hoja(o.salida, aux1)
    await pickear(aux1, op)
    expect((await reservasDe(o.salida))[0].estado).toBe('EN_TRANSITO')
    await importar([cancelacion(o.v1)])
    expect(await devoluciones(o.salida)).toMatchObject([{ estado: 'POR_DEVOLVER', estado_reserva: 'EN_TRANSITO', cantidad: 25 }])
    const mi = await como(aux1, async (c) => (await c.query('select wms.ejecutar_devolucion_picking($1) id', [o.salida])).rows[0].id as string)
    expect(mi).toBeNull()                                                           // no hay movimiento del libro: las unidades seguían en el rack
    expect((await falla(como(aux1, (c) => c.query('select wms.verificar_devolucion_picking($1)', [o.salida])))).message).toMatch(/no puede ser quien devolvió/)
    await como(aux2, (c) => c.query('select wms.verificar_devolucion_picking($1)', [o.salida]))
    expect(await estadoSalida(o.salida)).toMatchObject({ estado: 'CANCELADA' })
    expect(await saldo(a.id, 'APROBADOS')).toBe(60)
  })

  it('una reducción que solo toca lo que nadie picó no pide devolver nada', async () => {
    const a = await producto(); const b = await producto()
    await sembrar(a.id, 'U-A', en(300), 60); await sembrar(b.id, 'U-B', en(300), 60)
    const o = await montar([{ p: a, cantidad: 10 }, { p: b, cantidad: 10 }])
    const op = await hoja(o.salida, aux1)
    const primera = (await q('select id, cantidad, producto_id from wms.ordenes_picking_lineas where orden_id = $1 and producto_id = $2', [op, a.id]))[0]
    await como(aux1, (c) => c.query(`select wms.registrar_picking($1, 'PICKEADA', $2)`, [primera.id, primera.cantidad]))    // solo la línea A está picada
    await importar([version(o.v1, [o.v1.lineas[0], linea('l-2', b, 4)])])                                                  // se reduce B (sin picar)
    expect(await devoluciones(o.salida)).toEqual([])
    expect((await reservasDe(o.salida)).filter((r) => r.estado !== 'LIBERADA').map((r) => [r.cantidad, r.estado]).sort((x, y) => Number(y[0]) - Number(x[0]))).toEqual([[10, 'EN_TRANSITO'], [4, 'ACTIVA']])
  })
})

describe('la migración 0029', () => {
  it('es re-ejecutable (y la 0024 también lo sigue siendo después de ella)', async () => {
    const { SQL } = await import('./helpers')
    await base.admin.query(SQL.m0029())
    await base.admin.query(SQL.m0029())
    await base.admin.query(SQL.m0024())
    await base.admin.query(SQL.m0029())
    expect((await uno(`select to_regprocedure('wms.explicar_faltante(uuid)') f`)).f).not.toBeNull()
  })

  it('las funciones internas no se llaman desde la aplicación; las tres públicas sí', async () => {
    for (const sql of [`select wms._aplicar_cambio_pedido(gen_random_uuid(), null, null)`, `select wms._soltar_linea(gen_random_uuid(), 1, 'X', 1)`, `select wms._explicar_faltante(gen_random_uuid())`, `select wms._registrar_quiebre(gen_random_uuid(), 'SIN_STOCK', 1, 1, 1, '{}', 'DETECCION')`]) {
      expect((await falla(como(jt, (c) => c.query(sql)))).message, sql).toMatch(/permission denied/)
    }
  })
})
