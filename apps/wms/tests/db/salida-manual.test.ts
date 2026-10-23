// SA-2 (migración 0028): cómo iniciar una Orden de Salida — desde la bandeja, desde la ruta o a mano (tipos A, B y C). Un pedido, una orden; el pedido que llega después se une a la
// orden manual sin duplicar; cada tipo exige su rol; los lotes del cliente se validan como lo hace el dominio; la migración se puede volver a aplicar.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PedidoSnapshot } from '@/domain/pedidos-despacho'
import { type BaseDePrueba, SQL, crearBaseDePrueba, falla, idPropietario, sembrarStock } from './helpers'

let base: BaseDePrueba
let logissa: string
let diph: string
let ajr: string
let jt: string        // jefe_transporte
let ja: string        // jefe_almacen (sin jefe_transporte)
let aux: string
let muestras: string  // autoriza_salidas_sin_venta
let kat: string

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

let nProd = 0
async function producto(): Promise<{ id: string; codigo: string }> {
  nProd += 1
  const codigo = `SM-P${nProd}-${randomUUID().slice(0, 4)}`
  return { id: (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [codigo, `Producto SM ${nProd}`])).id, codigo }
}
/** Stock Aprobado de Logissa (o de un cliente) con su lote. */
const stock = (prod: string, lote: string, vence: string, cantidad: number, propietario = 'LOGISSA', pos?: string, estado: 'APROBADO' | 'BAJAS_RECHAZADOS' = 'APROBADO') =>
  sembrarStock(base, { posicion: pos ?? (estado === 'BAJAS_RECHAZADOS' ? (propietario === 'LOGISSA' ? 'E-8.1.2' : 'J-12.1') : propietario === 'LOGISSA' ? 'F-1.1' : propietario === 'DIPHASAC' ? 'A-14.2' : 'G-7.1'), producto: prod, lote, vence, cantidad, propietario, estado })

const CLIENTE = { ruc: '20123456789', razon_social: 'Botica Salud SAC', direccion: 'Av. Lima 123, Lima', ubigeo: '150101' }
const manual = (quien: string, clase: string, motivo: string | null, propietario: string | null, lineas: unknown[], extra: { pedido?: string | null; cliente?: unknown; gre?: string | null; archivo?: string | null; token?: string | null } = {}) =>
  como(quien, async (c) => (await c.query('select wms.crear_orden_salida_manual($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, $9) id',
    [clase, motivo, propietario, JSON.stringify(lineas), extra.pedido ?? null, extra.cliente === undefined ? null : JSON.stringify(extra.cliente), extra.gre ?? null, extra.archivo ?? null, extra.token ?? null])).rows[0].id as string)
const salida = (id: string) => uno('select * from wms.salidas where id = $1', [id])
const lineasDe = (id: string) => q('select sl.*, lt.codigo as lote_codigo from wms.salida_lineas sl left join wms.lotes lt on lt.id = sl.lote_id where sl.salida_id = $1 order by sl.creada_en, sl.id', [id])

let nPed = 0
const pedido = (codigo: string, cantidad: number, extra: Partial<PedidoSnapshot> = {}): PedidoSnapshot => {
  nPed += 1
  return {
    pedidoId: `sm-${nPed}-${randomUUID().slice(0, 4)}`, numero: `PED-M${String(nPed).padStart(3, '0')}`, version: 1, estado: 'READY_FOR_OPERATIONS', fecha: hoy, modificadoEn: `${hoy}T10:00:00Z`,
    cliente: { id: `c-${nPed}`, nombre: `Botica ${nPed} SAC`, ruc: '20123456789', ubigeo: '150101' },
    lineas: [{ lineaId: 'l-1', productoCodigo: codigo, descripcion: 'Producto', cantidad }], ...extra,
  }
}
const importar = (peds: PedidoSnapshot[]) => como(jt, (c) => c.query('select wms.registrar_importacion_pedidos($1, $2::jsonb, null)', ['sa2.test', JSON.stringify(peds)]))
const delPedido = (p: PedidoSnapshot) => uno('select * from wms.pedidos_despacho where pedido_id = $1 and vigente', [p.pedidoId])
const deBandeja = (quien: string, p: PedidoSnapshot) => como(quien, async (c) => (await c.query('select wms.crear_orden_de_pedido($1) r', [p.pedidoId])).rows[0].r as Record<string, unknown>)

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  diph = await idPropietario(base.admin, 'DIPHASAC')
  ajr = await idPropietario(base.admin, 'AJR_LABS')
  jt = await persona('jefe_transporte'); ja = await persona('jefe_almacen'); aux = await persona('auxiliar'); muestras = await persona('autoriza_salidas_sin_venta'); kat = await persona('direccion_tecnica')
  await base.admin.query(`update wms.parametros set valor = '23:59' where clave = 'hora_corte_planificacion'`)
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('tipo A: venta manual de distribución', () => {
  it('la crea el Jefe de Transporte con el número de pedido; queda manual, por conciliar, con el cliente escrito y el stock asignado por FEFO', async () => {
    const p = await producto()
    await stock(p.id, 'A-VIEJO', en(120), 30); await stock(p.id, 'A-NUEVO', en(400), 100)
    const id = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 50 }], { pedido: 'PED-A-001', cliente: CLIENTE })
    const s = await salida(id)
    expect(s).toMatchObject({ tipo: 'DISTRIBUCION', motivo: 'VENTA', origen: 'MANUAL', creada_desde: 'MANUAL', pedido_numero: 'PED-A-001', por_conciliar: true, referencia_tipo: 'pedido_numero', referencia_id: 'PED-A-001', propietario_id: logissa, estado: 'ABIERTA', creada_por: jt })
    expect(s.numero).toMatch(/^OS-\d{4}-\d{5}$/)
    expect(s.cliente_manual).toMatchObject({ ruc: '20123456789', razon_social: 'Botica Salud SAC', ubigeo: '150101' })
    expect(s.requiere_embalaje).toBe(false) // ubigeo de Lima: sin embalaje
    const l = await lineasDe(id)
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ estado: 'ASIGNADA', cantidad: 50 })
    const rs = await q(`select lt.codigo, sum(r.cantidad)::int n from wms.reservas r join wms.lotes lt on lt.id = r.lote_id where r.linea_id = $1 group by lt.codigo order by lt.codigo`, [l[0].id])
    expect(rs).toEqual([{ codigo: 'A-NUEVO', n: 20 }, { codigo: 'A-VIEJO', n: 30 }]) // FEFO: primero el que vence antes
    expect((await uno(`select count(*)::int n from wms.audit_events where evento = 'orden_manual_creada' and entidad_id = $1`, [id])).n).toBe(1)
  })

  it('un ubigeo de provincia sí se embala', async () => {
    const p = await producto(); await stock(p.id, 'A-PROV', en(300), 20)
    const id = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 5 }], { pedido: 'PED-A-PROV', cliente: { ...CLIENTE, ubigeo: '040101' } })
    expect((await salida(id)).requiere_embalaje).toBe(true)
  })

  it('el lote que se prefirió se aplica con las reglas de la edición de lotes (y si no cumple, la orden no se crea)', async () => {
    const p = await producto()
    await stock(p.id, 'E-FEFO', en(100), 40); const largo = await stock(p.id, 'E-LARGO', en(500), 40); const corto = await stock(p.id, 'E-CORTO', en(20), 40)
    const id = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 10, lote_id: largo.loteId }], { pedido: 'PED-A-LOTE', cliente: CLIENTE })
    expect((await lineasDe(id))[0].lote_codigo).toBe('E-LARGO')
    expect((await uno(`select distinto_de_fefo from wms.cambios_lote_asignado where linea_id = $1`, [(await lineasDe(id))[0].id])).distinto_de_fefo).toBe(true)
    const e = await falla(manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 10, lote_id: corto.loteId }], { pedido: 'PED-A-LOTE2', cliente: CLIENTE }))
    expect(e.message).toMatch(/vence en 20 días: un pedido de venta pide al menos 60/)
    expect(await uno(`select 1 from wms.salidas where pedido_numero = 'PED-A-LOTE2'`)).toBeUndefined()
  })

  it('solo el Jefe de Transporte: el Jefe de Almacén, el auxiliar y Dirección Técnica no', async () => {
    const p = await producto(); await stock(p.id, 'A-ROL', en(300), 10)
    for (const quien of [ja, aux, kat, muestras, base.personas.sinRol.id]) {
      const e = await falla(manual(quien, 'A', null, null, [{ producto_id: p.id, cantidad: 1 }], { pedido: 'PED-A-ROL', cliente: CLIENTE }))
      expect(e.message, quien).toMatch(/Solo el Jefe de Transporte crea una venta manual|Sesión|permiso/i)
    }
    expect(await uno(`select 1 from wms.salidas where pedido_numero = 'PED-A-ROL'`)).toBeUndefined()
  })

  it('el número de pedido es obligatorio y el cliente se valida (RUC de 11 números, razón social, dirección, ubigeo de 6 números)', async () => {
    const p = await producto(); await stock(p.id, 'A-VAL', en(300), 10)
    const l = [{ producto_id: p.id, cantidad: 1 }]
    expect((await falla(manual(jt, 'A', null, null, l, { pedido: '  ', cliente: CLIENTE }))).message).toBe('El número de pedido es obligatorio: la orden queda ligada a ese pedido')
    expect((await falla(manual(jt, 'A', null, null, l, { pedido: 'PED-V1', cliente: { ...CLIENTE, ruc: '2012345' } }))).message).toBe('El RUC tiene 11 números')
    expect((await falla(manual(jt, 'A', null, null, l, { pedido: 'PED-V1', cliente: { ...CLIENTE, razon_social: ' ' } }))).message).toBe('Escribe la razón social del cliente')
    expect((await falla(manual(jt, 'A', null, null, l, { pedido: 'PED-V1', cliente: { ...CLIENTE, direccion: '' } }))).message).toBe('Escribe la dirección de entrega')
    expect((await falla(manual(jt, 'A', null, null, l, { pedido: 'PED-V1', cliente: { ...CLIENTE, ubigeo: '1501' } }))).message).toBe('El ubigeo tiene 6 números (el código del distrito de entrega)')
    expect((await falla(manual(jt, 'A', null, null, [...l, ...l], { pedido: 'PED-V1', cliente: CLIENTE }))).message).toBe('Un producto aparece una sola vez: junta sus cantidades')
  })

  it('un pedido no puede tener dos órdenes: el número repetido (aunque cambien mayúsculas y espacios) se rechaza con el número de la orden; la base también lo impide', async () => {
    const p = await producto(); await stock(p.id, 'A-DUP', en(300), 50)
    const l = [{ producto_id: p.id, cantidad: 2 }]
    const id = await manual(jt, 'A', null, null, l, { pedido: 'PED-DUP-1', cliente: CLIENTE })
    const n = (await salida(id)).numero as string
    const e = await falla(manual(jt, 'A', null, null, l, { pedido: ' ped-dup-1 ', cliente: CLIENTE }))
    expect(e.message).toBe(`El pedido ped-dup-1 ya tiene la Orden de Salida ${n}. Un pedido no puede tener dos órdenes`)
    // sin pasar por la función: el índice único lo rechaza
    const otra = await uno(`select id from wms.salidas where id = $1`, [id])
    const dup = await falla(base.admin.query(`insert into wms.salidas (numero, tipo, motivo, propietario_id, creada_por, pedido_numero) values ('OS-X-1', 'DISTRIBUCION', 'VENTA', $1, $2, ' ped-dup-1')`, [logissa, jt]))
    expect(dup.code).toBe('23505')
    expect(otra).toBeTruthy()
    // una orden cancelada no cuenta: se puede crear otra con ese número
    await como(jt, (c) => c.query(`select wms.cancelar_salida($1, 'Pedido repetido')`, [id]))
    const nueva = await manual(jt, 'A', null, null, l, { pedido: 'PED-DUP-1', cliente: CLIENTE })
    expect(nueva).not.toBe(id)
  })

  it('«¿este número ya tiene orden?»: la orden viva, el pedido que ya está en la bandeja o nada; solo para el personal', async () => {
    const p = await producto(); await stock(p.id, 'A-ORD', en(300), 50)
    const id = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 2 }], { pedido: 'PED-ORD-1', cliente: CLIENTE })
    const consulta = (quien: string, n: string) => como(quien, async (c) => (await c.query('select wms.orden_del_pedido($1) r', [n])).rows[0].r as Record<string, unknown> | null)
    expect(await consulta(ja, ' ped-ord-1')).toMatchObject({ tipo: 'ORDEN', id, estado: 'ABIERTA' })
    expect(await consulta(ja, 'PED-ORD-NO')).toBeNull()
    const ped = pedido(p.codigo, 1); await importar([ped])
    expect(await consulta(ja, ped.numero)).toEqual({ tipo: 'EN_BANDEJA', pedido_numero: ped.numero })
    expect((await falla(consulta(base.personas.sinRol.id, 'PED-ORD-1'))).message).toBe('Sin acceso')
  })

  it('el mismo token devuelve la misma orden (idempotente)', async () => {
    const p = await producto(); await stock(p.id, 'A-TOK', en(300), 50)
    const t = randomUUID()
    const a = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 1 }], { pedido: 'PED-TOK-1', cliente: CLIENTE, token: t })
    const b = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 1 }], { pedido: 'PED-TOK-1', cliente: CLIENTE, token: t })
    expect(b).toBe(a)
  })

  it('un pedido que ya llegó por la bandeja se atiende desde la bandeja, no a mano', async () => {
    const p = await producto(); await stock(p.id, 'A-YA', en(300), 50)
    const ped = pedido(p.codigo, 3); await importar([ped])
    const e = await falla(manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 3 }], { pedido: ped.numero, cliente: CLIENTE }))
    expect(e.message).toBe(`El pedido ${ped.numero} ya llegó por la bandeja: créale la orden desde «Pedidos por despachar»`)
  })

  it('sin stock suficiente la orden se crea con la línea SIN_STOCK y avisa al Jefe de Transporte (decide el vendedor del pedido)', async () => {
    const p = await producto(); await stock(p.id, 'A-POCO', en(300), 3)
    const id = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 10 }], { pedido: 'PED-A-POCO', cliente: CLIENTE })
    expect((await lineasDe(id))[0]).toMatchObject({ estado: 'SIN_STOCK' })
    expect((await uno(`select count(*)::int n from wms.alertas where tipo = 'STOCK_INSUFICIENTE' and estado = 'ABIERTA' and clave = 'stock:' || $1`, [(await lineasDe(id))[0].id])).n).toBe(1)
  })
})

describe('el pedido que llega después por la bandeja se une a la orden manual, sin duplicar', () => {
  it('se vincula el pedido, la referencia pasa al id real, se quita «por conciliar», queda en auditoría y no se crea otra orden', async () => {
    const p = await producto(); await stock(p.id, 'U-1', en(300), 80)
    const id = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 12 }], { pedido: 'PED-UNE-1', cliente: CLIENTE })
    const ped = pedido(p.codigo, 12, { numero: 'ped-une-1' })
    await importar([ped])
    const pd = await delPedido(ped)
    expect(pd.salida_id).toBe(id)
    expect(await salida(id)).toMatchObject({ por_conciliar: false, referencia_tipo: 'pedido', referencia_id: ped.pedidoId, origen: 'MANUAL', creada_desde: 'MANUAL' })
    expect((await uno(`select count(*)::int n from wms.salidas where wms._numero_pedido_norm(pedido_numero) = 'PED-UNE-1' and estado <> 'CANCELADA'`)).n).toBe(1)
    expect((await uno(`select count(*)::int n from wms.audit_events where evento = 'orden_manual_unida_a_pedido' and entidad_id = $1`, [id])).n).toBe(1)
    expect((await uno(`select count(*)::int n from wms.alertas where tipo = 'ORDEN_MANUAL_UNIDA' and mensaje like '%ped-une-1%'`)).n).toBe(1)
    // crear la orden desde la bandeja devuelve la misma, no otra
    expect(await deBandeja(jt, ped)).toMatchObject({ salida_id: id, ya_existia: true })
  })

  it('si la orden ya está en picking, la unión no la reinicia', async () => {
    const p = await producto(); await stock(p.id, 'U-2', en(300), 80)
    const id = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 8 }], { pedido: 'PED-UNE-2', cliente: CLIENTE })
    const orden = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [id])).rows[0].id as string)
    const reservasAntes = await q(`select id, estado from wms.reservas where linea_id = (select id from wms.salida_lineas where salida_id = $1) order by id`, [id])
    await importar([pedido(p.codigo, 8, { numero: 'PED-UNE-2' })])
    expect((await q('select id, estado from wms.ordenes_picking where salida_id = $1 and estado <> \'CANCELADA\'', [id])).map((x) => x.id)).toEqual([orden])
    expect(await q(`select id, estado from wms.reservas where linea_id = (select id from wms.salida_lineas where salida_id = $1) order by id`, [id])).toEqual(reservasAntes)
    expect((await salida(id)).por_conciliar).toBe(false)
  })

  it('SA-3: el pedido se aplica a la orden como una versión nueva: se enlazan las líneas, se aumenta, se agrega y lo que el pedido no trae se quita', async () => {
    const p = await producto(); const q2 = await producto(); const r = await producto()
    await stock(p.id, 'AP-1', en(300), 100); await stock(q2.id, 'AP-2', en(300), 100); await stock(r.id, 'AP-3', en(300), 100)
    const id = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 12 }, { producto_id: r.id, cantidad: 3 }], { pedido: 'PED-APL-1', cliente: CLIENTE })
    const ped = pedido(p.codigo, 20, { numero: 'PED-APL-1', vendedor: 'Rosa Paredes', lineas: [
      { lineaId: 'l-1', productoCodigo: p.codigo, descripcion: 'Producto P', cantidad: 20 }, { lineaId: 'l-2', productoCodigo: q2.codigo, descripcion: 'Producto Q', cantidad: 5 }] })
    await importar([ped])
    const ls = await lineasDe(id)
    const viva = (cod: string) => ls.find((l) => l.producto_id === ({ [p.codigo]: p.id, [q2.codigo]: q2.id, [r.codigo]: r.id } as Record<string, string>)[cod] && l.estado !== 'CANCELADA')
    expect(viva(p.codigo)).toMatchObject({ cantidad: 20, estado: 'ASIGNADA', pedido_linea_id: 'l-1' })
    expect(viva(q2.codigo)).toMatchObject({ cantidad: 5, estado: 'ASIGNADA', pedido_linea_id: 'l-2' })
    expect(viva(r.codigo)).toBeUndefined()          // la línea que el pedido no trae se quitó
    expect((await uno(`select coalesce(sum(r2.cantidad), 0)::int n from wms.reservas r2 join wms.salida_lineas sl on sl.id = r2.linea_id where sl.salida_id = $1 and sl.producto_id = $2 and r2.estado = 'ACTIVA'`, [id, p.id])).n).toBe(20)
    expect((await uno(`select coalesce(sum(r2.cantidad), 0)::int n from wms.reservas r2 join wms.salida_lineas sl on sl.id = r2.linea_id where sl.salida_id = $1 and sl.producto_id = $2 and r2.estado = 'ACTIVA'`, [id, r.id])).n).toBe(0)
    expect(await salida(id)).toMatchObject({ por_conciliar: false, estado: 'ABIERTA', referencia_id: ped.pedidoId })
    expect((await delPedido(ped))).toMatchObject({ salida_id: id, cambio_pendiente: false })
    expect((await uno(`select mensaje from wms.alertas where tipo = 'PEDIDO_CAMBIADO' and mensaje like '%PED-APL-1%'`)).mensaje).toMatch(/PED-APL-1/)
    expect((await uno(`select count(*)::int n from wms.audit_events where evento = 'pedido_cambio_aplicado' and entidad_id = $1`, [id])).n).toBe(1)
  })

  it('SA-3: con el pedido igual a la orden, la unión no cambia las líneas ni avisa de ningún cambio', async () => {
    const p = await producto(); await stock(p.id, 'AP-4', en(300), 100)
    const id = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 7 }], { pedido: 'PED-APL-2', cliente: CLIENTE })
    const antes = await lineasDe(id)
    await importar([pedido(p.codigo, 7, { numero: 'PED-APL-2' })])
    const despues = await lineasDe(id)
    expect(despues.map((l) => [l.id, l.cantidad, l.estado])).toEqual(antes.map((l) => [l.id, l.cantidad, l.estado]))
    expect(despues[0].pedido_linea_id).toBe('l-1')
    expect((await uno(`select count(*)::int n from wms.alertas where tipo = 'PEDIDO_CAMBIADO' and mensaje like '%PED-APL-2%'`)).n).toBe(0)
  })

  it('SA-3: con la hoja de picking ya hecha y el pedido pidiendo menos, la unión reduce la línea, libera lo que sobra y conserva la misma hoja', async () => {
    const p = await producto(); await stock(p.id, 'AP-5', en(300), 100)
    const id = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 10 }], { pedido: 'PED-APL-3', cliente: CLIENTE })
    const orden = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [id])).rows[0].id as string)
    await importar([pedido(p.codigo, 6, { numero: 'PED-APL-3' })])
    expect((await lineasDe(id))[0]).toMatchObject({ cantidad: 6, pedido_linea_id: 'l-1' })
    expect((await q(`select id from wms.ordenes_picking where salida_id = $1 and estado <> 'CANCELADA'`, [id])).map((x) => x.id)).toEqual([orden])
    expect((await uno(`select coalesce(sum(r.cantidad), 0)::int n from wms.reservas r where r.linea_id = $1 and r.estado in ('ACTIVA','EN_TRANSITO','EN_STAGING')`, [(await lineasDe(id))[0].id])).n).toBe(6)
  })

  it('avisa si el cliente del pedido no es el de la orden (RUC distinto)', async () => {
    const p = await producto(); await stock(p.id, 'U-3', en(300), 80)
    await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 2 }], { pedido: 'PED-UNE-3', cliente: CLIENTE })
    await importar([pedido(p.codigo, 2, { numero: 'PED-UNE-3', cliente: { id: 'c-x', nombre: 'Otra SAC', ruc: '20999999999' } })])
    expect((await uno(`select mensaje from wms.alertas where tipo = 'ORDEN_MANUAL_UNIDA' and mensaje like '%PED-UNE-3%'`)).mensaje).toMatch(/OJO: el RUC del cliente no coincide \(orden 20123456789, pedido 20999999999\)/)
  })

  it('una orden manual cancelada no se une: el pedido sigue por planificar', async () => {
    const p = await producto(); await stock(p.id, 'U-4', en(300), 80)
    const id = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 2 }], { pedido: 'PED-UNE-4', cliente: CLIENTE })
    await como(jt, (c) => c.query(`select wms.cancelar_salida($1, 'Error de digitación')`, [id]))
    const ped = pedido(p.codigo, 2, { numero: 'PED-UNE-4' }); await importar([ped])
    expect((await delPedido(ped)).salida_id).toBeNull()
  })
})

describe('desde la bandeja y desde la ruta', () => {
  it('«Crear orden de salida»: crea la orden con el stock asignado, marcada «creada desde la bandeja»; repetirlo devuelve la misma', async () => {
    const p = await producto(); await stock(p.id, 'B-1', en(300), 100)
    const ped = pedido(p.codigo, 15); await importar([ped])
    const r = await deBandeja(jt, ped)
    expect(r).toMatchObject({ ya_existia: false, falta_stock: false, creada_desde: 'BANDEJA' })
    const s = await salida(r.salida_id as string)
    expect(s).toMatchObject({ origen: 'PEDIDO', creada_desde: 'BANDEJA', pedido_numero: ped.numero, referencia_tipo: 'pedido', referencia_id: ped.pedidoId, por_conciliar: false })
    expect((await lineasDe(s.id))[0].estado).toBe('ASIGNADA')
    expect((await delPedido(ped)).salida_id).toBe(s.id)
    expect(await deBandeja(jt, ped)).toMatchObject({ salida_id: s.id, ya_existia: true })
    expect((await uno('select count(*)::int n from wms.salidas where pedido_numero = $1', [ped.numero])).n).toBe(1)
  })

  it('cancelar una orden con motivo: libera el stock y el pedido vuelve a «por planificar»; si está en una ruta, primero se quita de la ruta', async () => {
    const p = await producto(); await stock(p.id, 'B-CAN', en(300), 100)
    const ped = pedido(p.codigo, 6); await importar([ped])
    const { salida_id } = await deBandeja(jt, ped)
    const cancelar = (quien: string, id: string, motivo: string) => como(quien, (c) => c.query('select wms.cancelar_orden_salida($1, $2)', [id, motivo]))
    expect((await falla(cancelar(aux, salida_id as string, 'x'))).message).toMatch(/No tienes permiso para preparar salidas/)
    expect((await falla(cancelar(jt, salida_id as string, ' '))).message).toMatch(/La cancelación necesita un motivo/)
    const { ruta, plan } = await rutaCon([ped])
    expect((await falla(cancelar(jt, salida_id as string, 'Me equivoqué'))).message).toMatch(/La orden está en la ruta RUT-\d{4}-\d{5}: quita el pedido de la ruta antes de cancelarla/)
    await plan([], 'Sale de la ruta')
    await cancelar(jt, salida_id as string, 'Me equivoqué de pedido')
    expect((await salida(salida_id as string)).estado).toBe('CANCELADA')
    expect((await delPedido(ped)).salida_id).toBeNull()
    expect(ruta).toBeTruthy()
    expect((await uno(`select coalesce(sum(r.cantidad), 0)::int n from wms.reservas r join wms.salida_lineas sl on sl.id = r.linea_id where sl.salida_id = $1 and r.estado = 'ACTIVA'`, [salida_id])).n).toBe(0)
    // el pedido puede volver a tener su orden
    expect(await deBandeja(jt, ped)).toMatchObject({ ya_existia: false })
  })

  it('exige preparar salidas y no crea la orden de un pedido que cambió', async () => {
    const p = await producto(); await stock(p.id, 'B-2', en(300), 100)
    const ped = pedido(p.codigo, 4); await importar([ped])
    expect((await falla(deBandeja(aux, ped))).message).toMatch(/No tienes permiso para crear órdenes de salida/)
    await importar([{ ...ped, version: 2, lineas: [{ ...ped.lineas[0], cantidad: 5 }] }])
    expect((await falla(deBandeja(jt, ped))).message).toMatch(/cambió en Pedidos: revisa el cambio antes de crear su orden/)
  })

  it('«todos los pedidos por planificar»: crea las órdenes y cuenta los que fallan (producto que el WMS no conoce) sin frenar a los demás', async () => {
    await base.admin.query(`update wms.pedidos_despacho set cambio_pendiente = false`)
    const a = await producto(); await stock(a.id, 'T-1', en(300), 100)
    const b = await producto(); await stock(b.id, 'T-2', en(300), 100)
    const ok1 = pedido(a.codigo, 5); const ok2 = pedido(b.codigo, 5); const malo = pedido('NO-EXISTE-XX', 5)
    await importar([ok1, ok2, malo])
    const r = await como(jt, async (c) => (await c.query('select wms.crear_ordenes_pendientes() r')).rows[0].r as { creadas: number; unidas: number; errores: { pedido: string; motivo: string }[]; ordenes: { pedido: string }[] })
    expect(r.ordenes.map((x) => x.pedido)).toEqual(expect.arrayContaining([ok1.numero, ok2.numero]))
    expect(r.errores).toEqual([{ pedido: malo.numero, motivo: expect.stringContaining('trae un producto que el WMS no conoce (NO-EXISTE-XX)') }])
    expect((await delPedido(malo)).salida_id).toBeNull()
    expect((await delPedido(ok1)).salida_id).not.toBeNull()
    const otra = await como(jt, async (c) => (await c.query('select wms.crear_ordenes_pendientes() r')).rows[0].r as { creadas: number })
    expect(otra.creadas).toBe(0) // todo lo demás ya tenía orden
  })

  async function rutaCon(pedidos: PedidoSnapshot[]) {
    const v = (await uno(`insert into wms.vehiculos (placa, calificado, activo) values ($1, false, true) returning id`, [`R${randomUUID().slice(0, 5)}`.toUpperCase()])).id as string
    const c = (await uno(`insert into wms.personal_transporte (nombre, funcion) values ($1, 'CONDUCTOR') returning id`, [`Cond ${randomUUID().slice(0, 6)}`])).id as string
    const ruta = await como(jt, async (cl) => (await cl.query('select wms.crear_ruta($1, $2, $3, null) id', [en(1), v, c])).rows[0].id as string)
    const plan = (paradas: PedidoSnapshot[], motivo: string | null = null) => como(jt, (cl) => cl.query('select wms.planificar_ruta($1, $2, $3, $4, null, $5::jsonb, $6)', [ruta, en(1), v, c, JSON.stringify(paradas.map((x) => ({ pedido_id: x.pedidoId }))), motivo]))
    await plan(pedidos)
    return { ruta, plan }
  }

  it('la ruta reutiliza la orden ya creada y, al quitar el pedido, esa orden sigue viva (no nació en la ruta)', async () => {
    const p = await producto(); await stock(p.id, 'R-1', en(300), 100)
    const ped = pedido(p.codigo, 6); await importar([ped])
    const { salida_id } = await deBandeja(jt, ped)
    const { ruta, plan } = await rutaCon([ped])
    expect((await uno('select salida_id from wms.ruta_paradas where ruta_id = $1 and activa', [ruta])).salida_id).toBe(salida_id)
    expect((await uno('select count(*)::int n from wms.salidas where pedido_numero = $1', [ped.numero])).n).toBe(1)
    await plan([], 'El cliente la pidió para otro día')
    expect(await salida(salida_id as string)).toMatchObject({ estado: 'ABIERTA', creada_desde: 'BANDEJA' })
    expect((await lineasDe(salida_id as string))[0].estado).toBe('ASIGNADA')
    expect((await delPedido(ped)).salida_id).toBe(salida_id)
  })

  it('la orden que nació en la ruta sí se libera al quitar el pedido', async () => {
    const p = await producto(); await stock(p.id, 'R-2', en(300), 100)
    const ped = pedido(p.codigo, 6); await importar([ped])
    const { ruta, plan } = await rutaCon([ped])
    const sid = (await uno('select salida_id from wms.ruta_paradas where ruta_id = $1 and activa', [ruta])).salida_id as string
    expect(await salida(sid)).toMatchObject({ creada_desde: 'RUTA', origen: 'PEDIDO', pedido_numero: ped.numero })
    await plan([], 'Se cae el pedido')
    expect((await salida(sid)).estado).toBe('CANCELADA')
    expect((await delPedido(ped)).salida_id).toBeNull()
  })

  it('cancelar la ruta también respeta de dónde nació la orden', async () => {
    const p = await producto(); await stock(p.id, 'R-3', en(300), 100)
    const aBandeja = pedido(p.codigo, 3); const aRuta = pedido(p.codigo, 3); await importar([aBandeja, aRuta])
    const { salida_id } = await deBandeja(jt, aBandeja)
    const { ruta } = await rutaCon([aBandeja, aRuta])
    const sRuta = (await uno('select salida_id from wms.ruta_paradas where ruta_id = $1 and pedido_id = $2', [ruta, aRuta.pedidoId])).salida_id as string
    await como(jt, (c) => c.query(`select wms.cancelar_ruta($1, 'No sale hoy')`, [ruta]))
    expect((await salida(salida_id as string)).estado).toBe('ABIERTA')
    expect((await salida(sRuta)).estado).toBe('CANCELADA')
  })

  it('al armar la ruta, un pedido con orden manual vinculada usa esa orden (no crea otra)', async () => {
    const p = await producto(); await stock(p.id, 'R-4', en(300), 100)
    const id = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 4 }], { pedido: 'PED-RUTA-M', cliente: CLIENTE })
    const ped = pedido(p.codigo, 4, { numero: 'PED-RUTA-M' }); await importar([ped])
    const { ruta } = await rutaCon([ped])
    expect((await uno('select salida_id from wms.ruta_paradas where ruta_id = $1 and activa', [ruta])).salida_id).toBe(id)
    expect((await uno(`select count(*)::int n from wms.salidas where wms._numero_pedido_norm(pedido_numero) = 'PED-RUTA-M' and estado <> 'CANCELADA'`)).n).toBe(1)
  })
})

describe('tipo B: por cuenta de un cliente de almacenamiento', () => {
  const GRE = 'T001-00001234'; const PDF = 'gre-cliente/abc-gre.pdf'
  const b = (quien: string, motivo: string, lineas: unknown[], extra: { gre?: string | null; archivo?: string | null; propietario?: string } = {}) =>
    manual(quien, 'B', motivo, extra.propietario ?? diph, lineas, { gre: extra.gre === undefined ? GRE : extra.gre, archivo: extra.archivo === undefined ? PDF : extra.archivo })

  it('la crean el Jefe de Transporte y el Jefe de Almacén; queda «creada por X en nombre de Y» con su GRE y el lote indicado reservado', async () => {
    const p = await producto(); const lt = await stock(p.id, 'B-DIPH', en(200), 60, 'DIPHASAC')
    for (const quien of [jt, ja]) {
      const id = await b(quien, 'VENTA', [{ producto_id: p.id, cantidad: 10, lote_id: lt.loteId }])
      const s = await salida(id)
      expect(s).toMatchObject({ tipo: 'CLIENTE', motivo: 'VENTA', origen: 'MANUAL', creada_desde: 'MANUAL', propietario_id: diph, creada_en_nombre_de: diph, gre_numero: GRE, gre_archivo: PDF, creada_por: quien, por_conciliar: false, pedido_numero: null })
      expect((await lineasDe(id))[0]).toMatchObject({ estado: 'ASIGNADA', lote_codigo: 'B-DIPH', cantidad: 10 })
    }
  })

  it('un auxiliar o quien solo autoriza muestras no crea una salida de cliente', async () => {
    const p = await producto(); const lt = await stock(p.id, 'B-ROL', en(200), 60, 'DIPHASAC')
    for (const quien of [aux, muestras, kat]) expect((await falla(b(quien, 'VENTA', [{ producto_id: p.id, cantidad: 1, lote_id: lt.loteId }]))).message).toMatch(/No tienes permiso para crear una salida por cuenta de un cliente/)
  })

  it('lote de otro propietario rechazado: el lote es de Diphasac y la orden es de AJR', async () => {
    const p = await producto(); const lt = await stock(p.id, 'B-AJENO', en(200), 60, 'DIPHASAC')
    const e = await falla(b(jt, 'VENTA', [{ producto_id: p.id, cantidad: 5, lote_id: lt.loteId }], { propietario: ajr }))
    expect(e.message).toBe('El lote B-AJENO no es de este propietario')
    expect(await uno(`select 1 from wms.salidas where propietario_id = $1 and tipo = 'CLIENTE'`, [ajr])).toBeUndefined()
  })

  it('lote insuficiente, lote de otro producto, lote vencido, lote en Reserva', async () => {
    const p = await producto(); const o = await producto()
    const lt = await stock(p.id, 'B-POCO', en(200), 7, 'DIPHASAC'); const otro = await stock(o.id, 'B-OTRO', en(200), 9, 'DIPHASAC')
    expect((await falla(b(jt, 'VENTA', [{ producto_id: p.id, cantidad: 8, lote_id: lt.loteId }]))).message).toBe('No hay en el lote B-POCO con 8 unidades disponibles (hay 7)')
    expect((await falla(b(jt, 'VENTA', [{ producto_id: p.id, cantidad: 4, lote_id: lt.loteId }, { producto_id: p.id, cantidad: 4, lote_id: lt.loteId }]))).message).toBe('No hay en el lote B-POCO con 4 unidades disponibles (hay 3)')
    expect((await falla(b(jt, 'VENTA', [{ producto_id: p.id, cantidad: 1, lote_id: otro.loteId }]))).message).toBe('El lote B-OTRO no corresponde al producto de la línea')
    const v = await stock(p.id, 'B-VENCIDO', en(-10), 5, 'DIPHASAC')
    expect((await falla(b(jt, 'VENTA', [{ producto_id: p.id, cantidad: 1, lote_id: v.loteId }]))).message).toMatch(/Lote B-VENCIDO: El lote está vencido: lo vencido solo va a Bajas/)
    expect((await falla(b(jt, 'PESQUISA_DIGEMID', [{ producto_id: p.id, cantidad: 1, lote_id: v.loteId }]))).message).toMatch(/la pesquisa DIGEMID nunca es de lotes vencidos/)
    await como(kat, (c) => c.query(`select wms.aplicar_reserva_lote($1, 'Duda de calidad')`, [lt.loteId]))
    expect((await falla(b(jt, 'VENTA', [{ producto_id: p.id, cantidad: 1, lote_id: lt.loteId }]))).message).toBe('El lote B-POCO está en Reserva: no sale hasta que se quite la Reserva')
  })

  it('un mismo lote repartido en dos líneas no se pasa del disponible; el motivo desconocido se rechaza', async () => {
    const p = await producto(); const lt = await stock(p.id, 'B-DOS', en(200), 10, 'DIPHASAC')
    const id = await b(jt, 'MUESTRA', [{ producto_id: p.id, cantidad: 6, lote_id: lt.loteId }, { producto_id: p.id, cantidad: 4, lote_id: lt.loteId }])
    expect((await lineasDe(id)).map((l) => l.estado)).toEqual(['ASIGNADA', 'ASIGNADA'])
    expect((await falla(b(jt, 'DEVOLUCION_PROVEEDOR', [{ producto_id: p.id, cantidad: 1, lote_id: lt.loteId }]))).message).toBe('El motivo no corresponde a este tipo de salida')
  })

  it('destrucción: solo desde Bajas; lo que está en Aprobados o en otro lugar no sale a destrucción', async () => {
    const p = await producto()
    const aprob = await stock(p.id, 'B-APR', en(200), 20, 'DIPHASAC')
    const baja = await stock(p.id, 'B-BAJA', en(-30), 12, 'DIPHASAC', 'J-12.1', 'BAJAS_RECHAZADOS')
    expect((await falla(b(jt, 'DESTRUCCION', [{ producto_id: p.id, cantidad: 5, lote_id: aprob.loteId }]))).message).toMatch(/La destrucción sale solo desde Bajas: del lote B-APR hay 0 unidades en el área de Bajas y la línea pide 5/)
    expect((await falla(b(jt, 'DESTRUCCION', [{ producto_id: p.id, cantidad: 13, lote_id: baja.loteId }]))).message).toMatch(/del lote B-BAJA hay 12 unidades en el área de Bajas y la línea pide 13/)
    const id = await b(ja, 'DESTRUCCION', [{ producto_id: p.id, cantidad: 12, lote_id: baja.loteId }])
    expect(await salida(id)).toMatchObject({ tipo: 'CLIENTE', motivo: 'DESTRUCCION', creada_en_nombre_de: diph })
    expect((await lineasDe(id))[0]).toMatchObject({ estado: 'PENDIENTE', nota_stock: 'Sale desde Bajas: se prepara con el picking de Bajas' })
  })

  it('la GRE del cliente: número con formato y PDF obligatorios; el propietario es un cliente de almacenamiento', async () => {
    const p = await producto(); const lt = await stock(p.id, 'B-GRE', en(200), 20, 'DIPHASAC')
    const l = [{ producto_id: p.id, cantidad: 1, lote_id: lt.loteId }]
    expect((await falla(b(jt, 'VENTA', l, { gre: '123' }))).message).toBe('El número de la guía se escribe como T001-00001234 (serie, guion y número)')
    expect((await falla(b(jt, 'VENTA', l, { archivo: null }))).message).toBe('Adjunta el PDF de la guía de remisión del cliente')
    expect((await falla(b(jt, 'VENTA', l, { propietario: logissa }))).message).toMatch(/Una salida por cuenta de un cliente es de un cliente de almacenamiento|no es de este propietario/)
    expect((await falla(manual(jt, 'B', 'VENTA', null, l, { gre: GRE, archivo: PDF }))).message).toBe('Elige el cliente de almacenamiento')
  })
})

describe('tipo C: sin venta de Logissa', () => {
  it('la muestra solo la crea quien autoriza salidas sin venta (el Jefe de Transporte no); el sistema la asigna por FEFO', async () => {
    const p = await producto(); await stock(p.id, 'C-M1', en(300), 20)
    const e = await falla(manual(jt, 'C', 'MUESTRA', null, [{ producto_id: p.id, cantidad: 2 }]))
    expect(e.message).toBe('Solo quien autoriza salidas sin venta registra una muestra')
    const id = await manual(muestras, 'C', 'MUESTRA', null, [{ producto_id: p.id, cantidad: 2 }], { cliente: CLIENTE })
    expect(await salida(id)).toMatchObject({ tipo: 'MUESTRA', motivo: 'MUESTRA', propietario_id: logissa, origen: 'MANUAL', autorizada_por: muestras, creada_en_nombre_de: null })
    expect((await lineasDe(id))[0]).toMatchObject({ estado: 'ASIGNADA', lote_codigo: 'C-M1' })
  })

  it('la devolución al proveedor es de los jefes, con lote indicado y solo antes del vencimiento', async () => {
    const p = await producto(); const bueno = await stock(p.id, 'C-D1', en(90), 30); const vencido = await stock(p.id, 'C-D2', en(-2), 30)
    const dev = (quien: string, lote: string, cantidad = 5) => manual(quien, 'C', 'DEVOLUCION_PROVEEDOR', null, [{ producto_id: p.id, cantidad, lote_id: lote }], { cliente: CLIENTE })
    expect((await falla(dev(muestras, bueno.loteId))).message).toMatch(/No tienes permiso para preparar salidas/)
    expect((await falla(dev(ja, vencido.loteId))).message).toMatch(/Lote C-D2: El lote está vencido: no se devuelve vencido a nadie/)
    const id = await dev(ja, bueno.loteId)
    expect(await salida(id)).toMatchObject({ tipo: 'PROVEEDOR', motivo: 'DEVOLUCION_PROVEEDOR', propietario_id: logissa, origen: 'MANUAL' })
    expect((await lineasDe(id))[0]).toMatchObject({ estado: 'ASIGNADA', lote_codigo: 'C-D1' })
    expect((await falla(manual(jt, 'C', 'VENTA', null, [{ producto_id: p.id, cantidad: 1 }]))).message).toBe('En una salida sin venta el motivo es muestra o devolución al proveedor')
  })
})

describe('la guía de una salida sin venta lleva guía del WMS; la del cliente, no', () => {
  const emitir = (quien: string, salidaId: string) => como(quien, (c) => c.query(`select wms.registrar_guia_electronica($1, 'TTT1-00000001', 'SIMULADOR', current_date, 12, null, null, 'PENDIENTE')`, [salidaId]))
  it('una muestra y una devolución al proveedor pasan la condición del tipo (siguen los demás requisitos); una orden de cliente dice que la trae el cliente', async () => {
    const p = await producto(); await stock(p.id, 'G-1', en(300), 20); const lt = await stock(p.id, 'G-2', en(90), 20); const cl = await stock(p.id, 'G-3', en(300), 20, 'DIPHASAC')
    const muestra = await manual(muestras, 'C', 'MUESTRA', null, [{ producto_id: p.id, cantidad: 1 }], { cliente: CLIENTE })
    const devol = await manual(jt, 'C', 'DEVOLUCION_PROVEEDOR', null, [{ producto_id: p.id, cantidad: 1, lote_id: lt.loteId }], { cliente: CLIENTE })
    const deCliente = await manual(jt, 'B', 'VENTA', diph, [{ producto_id: p.id, cantidad: 1, lote_id: cl.loteId }], { gre: 'T001-00000077', archivo: 'x.pdf' })
    expect((await falla(emitir(jt, muestra))).message).toBe('La guía se emite cuando todo el pedido tiene la conformidad: sus lotes salen de lo confirmado')
    expect((await falla(emitir(jt, devol))).message).toBe('La guía se emite cuando todo el pedido tiene la conformidad: sus lotes salen de lo confirmado')
    expect((await falla(emitir(jt, deCliente))).message).toBe('La guía de una orden de un cliente de almacenamiento la trae el cliente: registra su GRE, el WMS no la emite')
  })
})

describe('permisos, códigos de producto y re-ejecución', () => {
  it('quien no tiene rol de personal no crea nada; las funciones nuevas no las llama cualquiera', async () => {
    const p = await producto()
    for (const [clase, motivo] of [['A', null], ['B', 'VENTA'], ['C', 'MUESTRA']] as const) {
      const e = await falla(manual(base.personas.sinRol.id, clase, motivo, clase === 'B' ? diph : null, [{ producto_id: p.id, cantidad: 1 }], { pedido: 'X-1', cliente: CLIENTE, gre: 'T001-1', archivo: 'x' }))
      expect(e.code).toBe('42501')
    }
    expect((await falla(como(base.personas.sinRol.id, (c) => c.query('select wms._orden_del_pedido(null::wms.pedidos_despacho, \'RUTA\')')))).message).toMatch(/permission denied/)
    expect((await falla(como(jt, (c) => c.query('select wms._vincular_orden_manual(null::wms.pedidos_despacho, null::wms.salidas)')))).message).toMatch(/permission denied/)
  })

  it('códigos de un producto: barras, del cliente y del proveedor; el del cliente exige de quién es; no se repite', async () => {
    const p = await producto()
    const agregar = (quien: string, tipo: string, codigo: string, prop: string | null = null) => como(quien, async (c) => (await c.query('select wms.agregar_codigo_producto($1, $2, $3, $4) id', [p.id, tipo, codigo, prop])).rows[0].id as string)
    await agregar(kat, 'BARRAS', '7750001234567')
    await agregar(ja, 'CLIENTE', 'DIPH-0042', diph)
    expect((await falla(agregar(ja, 'CLIENTE', 'X-1'))).message).toBe('El código del cliente es de un cliente de almacenamiento: elige cuál')
    expect((await falla(agregar(ja, 'CLIENTE', 'X-1', logissa))).message).toBe('El código del cliente es de un cliente de almacenamiento: elige cuál')
    expect((await falla(agregar(ja, 'BARRAS', ' 7750001234567 '))).message).toBe('Ese código ya está registrado para este producto')
    expect((await falla(agregar(aux, 'BARRAS', '1'))).message).toMatch(/Solo Dirección Técnica, su asistente y el Jefe de Almacén/)
    expect((await q('select tipo, codigo, propietario_id from wms.producto_codigos where producto_id = $1 order by tipo', [p.id]))).toEqual([
      { tipo: 'BARRAS', codigo: '7750001234567', propietario_id: null }, { tipo: 'CLIENTE', codigo: 'DIPH-0042', propietario_id: diph }])
    expect((await como(jt, (c) => c.query('select 1 from wms.producto_codigos where producto_id = $1', [p.id]))).rowCount).toBe(2)
    await expect(como(jt, (c) => c.query(`insert into wms.producto_codigos (producto_id, tipo, codigo) values ($1, 'BARRAS', 'x')`, [p.id]))).rejects.toThrow()
  })

  it('la migración se puede volver a aplicar sin romper lo creado (re-ejecutable) y sin avisos de objetos inexistentes', async () => {
    const avisos: string[] = []
    base.admin.on('notice', (n) => avisos.push(n.message ?? ''))
    const antes = (await uno('select count(*)::int n from wms.salidas')).n
    await base.admin.query(SQL.m0028())
    await base.admin.query(SQL.m0028())
    expect((await uno('select count(*)::int n from wms.salidas')).n).toBe(antes)
    expect(avisos.filter((a) => /does not exist/i.test(a))).toEqual([])  // (los «already exists, skipping» son lo esperado al repetir)
    // sigue funcionando
    const p = await producto(); await stock(p.id, 'RE-1', en(300), 10)
    const id = await manual(jt, 'A', null, null, [{ producto_id: p.id, cantidad: 4 }], { pedido: 'PED-RE-1', cliente: CLIENTE })
    expect(id).toBeTruthy()
    // la 0028 re-ejecutada después de la 0029 conserva la unión que aplica el pedido a la orden (SA-3)
    await importar([pedido(p.codigo, 2, { numero: 'PED-RE-1' })])
    expect((await lineasDe(id))[0]).toMatchObject({ cantidad: 2, pedido_linea_id: 'l-1' })
  })
})
