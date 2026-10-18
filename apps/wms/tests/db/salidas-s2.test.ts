// S2 (migración 0012): núcleo de stock de salidas — asignación FEFO (A) y por lote indicado (B), vencidos y 60 días, excepción de lote,
// «comprometido» único con Mover, picking → conformidad → salida → retorno, e invariantes. Sin pantallas.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let ajr: string
let diph: string
let jt: string // jefe_transporte
let sandra: string // asistente_dt + conformidad_despacho
let aux1: string // auxiliar (picker)
let aux2: string
let muestras: string // autoriza_salidas_sin_venta
let stg: string // posición de Pendiente de conformidad

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => {
  const d = new Date(`${hoy}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]

async function persona(rol: string | string[]): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  for (const r of Array.isArray(rol) ? rol : [rol]) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, r])
  return id
}

let nProd = 0
async function producto(): Promise<string> {
  nProd += 1
  const r = await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [`S2-P${nProd}-${randomUUID().slice(0, 4)}`, `Producto S2 ${nProd}`])
  return r.id
}

/** Deja `cantidad` unidades Aprobadas de un lote nuevo en una posición (carga inicial). */
async function sembrar(prod: string, pos: string, lote: string, vence: string | null, dueno: string, cantidad: number, estado = 'APROBADO') {
  const posId = await idPosicion(base.admin, pos)
  const loteRow = await uno(`select id from wms.lotes where producto_id = $1 and codigo = $2 and propietario_id = $3`, [prod, lote, dueno])
  const loteId = loteRow?.id ?? (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, $3, $4) returning id`, [prod, lote, vence, dueno])).id
  const procedencia = randomUUID()
  await base.como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{
    posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: dueno, estado: estado as 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: procedencia, delta: cantidad }]))
  return { posId, loteId, procedencia }
}

const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
const crear = (id: string, tipo: string, motivo: string, dueno: string, lineas: unknown[], ref: string | null = null, token: string | null = null) =>
  como(id, async (c) => (await c.query('select wms.crear_salida($1, $2, $3, $4::jsonb, $5, $6, $7) id', [tipo, motivo, dueno, JSON.stringify(lineas), ref ? 'pedido' : null, ref, token])).rows[0].id as string)
const asignar = (id: string, salida: string) => como(id, async (c) => (await c.query('select * from wms.asignar_salida($1)', [salida])).rows)
const lineas = (salida: string) => q(`select sl.*, lt.codigo as lote_codigo, lf.codigo as fefo_codigo from wms.salida_lineas sl
    left join wms.lotes lt on lt.id = sl.lote_id left join wms.lotes lf on lf.id = sl.lote_fefo_id where sl.salida_id = $1 order by sl.creada_en, sl.id`, [salida])
const reservas = (linea: string) => q(`select r.*, ps.codigo as posicion, lt.codigo as lote from wms.reservas r join wms.posiciones ps on ps.id = r.posicion_id
    join wms.lotes lt on lt.id = r.lote_id where r.linea_id = $1 order by ps.codigo, r.id`, [linea])
const saldoEn = async (prod: string, pos: string) => (await uno(`select coalesce(sum(s.cantidad), 0)::int n from wms.saldos s join wms.posiciones ps on ps.id = s.posicion_id where s.producto_id = $1 and ps.codigo = $2`, [prod, pos])).n as number
const disp = (id: string, dueno: string, prod: string) => como(id, async (c) => (await c.query('select * from wms.disponibilidad_por_lote($1, $2)', [dueno, prod])).rows)

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  ajr = await idPropietario(base.admin, 'AJR_LABS')
  diph = await idPropietario(base.admin, 'DIPHASAC')
  jt = await persona('jefe_transporte')
  sandra = await persona(['asistente_dt', 'conformidad_despacho'])
  aux1 = await persona('auxiliar')
  aux2 = await persona('auxiliar')
  muestras = await persona('autoriza_salidas_sin_venta')
  stg = (await uno(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-1', 'S', 'PISO', 'DESPACHO') returning id`)).id
  await base.admin.query(`update wms.parametros set valor = 'STG-1' where clave = 'posicion_despacho_defecto'`)
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('disponible y vendible: una sola fuente', () => {
  it('saldo − comprometido; lo vendible exige Aprobado, no vencido y ≥ 60 días (solo Logissa)', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'LOTE-OK', en(200), logissa, 100)
    await sembrar(p, 'F-1.2', 'LOTE-CORTO', en(30), logissa, 40) // < 60 días: disponible, no vendible
    await sembrar(p, 'F-2.1', 'LOTE-VENCIDO', en(-5), logissa, 10) // vencido
    await sembrar(p, 'G-7.1', 'AJR-1', en(10), ajr, 25) // de un cliente: se ve por separado
    const filas = await disp(jt, logissa, p)
    const por = Object.fromEntries(filas.map((f) => [f.lote, f]))
    expect(por['LOTE-OK']).toMatchObject({ saldo: 100, comprometido: 0, disponible: 100, vendible: 100, vencido: false })
    expect(por['LOTE-CORTO']).toMatchObject({ saldo: 40, disponible: 40, vendible: 0 })
    expect(por['LOTE-VENCIDO']).toMatchObject({ saldo: 10, vencido: true, vendible: 0 })
    expect(filas.map((f) => f.lote)).toEqual(['LOTE-VENCIDO', 'LOTE-CORTO', 'LOTE-OK']) // por vencimiento
    expect(Number((await como(jt, async (c) => (await c.query('select vendible from wms.stock_vendible($1)', [p])).rows[0])).vendible)).toBe(100)
    const cli = await disp(jt, ajr, p)
    expect(cli).toHaveLength(1)
    expect(cli[0]).toMatchObject({ lote: 'AJR-1', disponible: 25, vendible: 0 }) // «vendible» es de Logissa
  })

  it('el vendible solo lo lee el personal (o el cliente de su propio propietario)', async () => {
    const p = await producto()
    const e = await falla(como(base.personas.sinRol.id, (c) => c.query('select * from wms.disponibilidad_por_lote($1, $2)', [logissa, p])))
    expect(e.message).toMatch(/Sin acceso/)
  })
})

describe('modo A: FEFO entre lotes aptos', () => {
  it('toma del lote que vence primero, salta los de menos de 60 días y los vencidos, y completa con el siguiente lote FEFO válido', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'VENCIDO', en(-3), logissa, 500)
    await sembrar(p, 'F-1.2', 'CORTO', en(20), logissa, 500) // 20 días: no cumple
    await sembrar(p, 'F-3.1', 'JUSTO', en(60), logissa, 30) // 60 días: cumple (inclusive); no alcanza solo para 50
    await sembrar(p, 'F-4.1', 'B-LARGO', en(300), logissa, 40)
    await sembrar(p, 'F-2.1', 'B-LARGO', en(300), logissa, 40)
    await sembrar(p, 'F-5.1', 'A-MEDIO', en(120), logissa, 200) // completa lo que falta
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 50 }], 'PED-1')
    expect((await lineas(s))[0].estado).toBe('PENDIENTE')
    const r = await asignar(jt, s)
    expect(r[0]).toMatchObject({ estado: 'ASIGNADA' })
    const l = (await lineas(s))[0]
    expect(l.lote_codigo).toBe('JUSTO') // el lote principal de la línea es el primero en FEFO
    expect(l.fefo_codigo).toBe('JUSTO')
    const rs = await reservas(l.id)
    // Una línea, dos lotes (uno por reserva): 30 de JUSTO y los 20 que faltan de A-MEDIO, cada uno en su ubicación.
    expect(rs.map((x) => [x.lote, x.posicion, x.cantidad, x.estado])).toEqual([['JUSTO', 'F-3.1', 30, 'ACTIVA'], ['A-MEDIO', 'F-5.1', 20, 'ACTIVA']])
    expect(rs.reduce((t, x) => t + x.cantidad, 0)).toBe(50)
    // El disponible ya descuenta lo reservado.
    const d = await disp(jt, logissa, p)
    expect(d.find((x) => x.lote === 'JUSTO')).toMatchObject({ saldo: 30, comprometido: 30, disponible: 0 })
    expect(d.find((x) => x.lote === 'A-MEDIO')).toMatchObject({ saldo: 200, comprometido: 20, disponible: 180 })
    expect(d.every((x) => x.disponible >= 0)).toBe(true)
  })

  it('un lote que alcanza en varias celdas no se completa con otro: las celdas van por recorrido', async () => {
    const p = await producto()
    await sembrar(p, 'F-4.1', 'L1', en(100), logissa, 30)
    await sembrar(p, 'F-2.1', 'L1', en(100), logissa, 30) // L1 tiene 60 en total, repartidos en F-2 y F-4
    await sembrar(p, 'F-6.1', 'L2', en(150), logissa, 100)
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 45 }])
    await asignar(jt, s)
    const l = (await lineas(s))[0]
    expect(l.lote_codigo).toBe('L1')
    expect((await reservas(l.id)).map((x) => [x.lote, x.posicion, x.cantidad])).toEqual([['L1', 'F-2.1', 30], ['L1', 'F-4.1', 15]])
  })

  it('una línea que necesita más de lo que hay en el primer lote se completa con el siguiente, en el orden de recorrido de cada lote', async () => {
    const p = await producto()
    await sembrar(p, 'F-4.1', 'L1', en(100), logissa, 30)
    await sembrar(p, 'F-2.1', 'L1', en(100), logissa, 30)
    await sembrar(p, 'F-6.1', 'L2', en(150), logissa, 100)
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 80 }])
    await asignar(jt, s)
    const l = (await lineas(s))[0]
    expect(l.estado).toBe('ASIGNADA')
    expect(l.lote_codigo).toBe('L1')
    expect((await reservas(l.id)).map((x) => [x.lote, x.posicion, x.cantidad])).toEqual([['L1', 'F-2.1', 30], ['L1', 'F-4.1', 30], ['L2', 'F-6.1', 20]])
    // La orden de picking lleva una línea por lote y celda, con su ubicación, ordenadas por el recorrido.
    const o = await como(jt, (c) => c.query('select wms.generar_orden_picking($1) id', [s]))
    const ol = await q(`select ps.codigo as posicion, lt.codigo as lote, x.cantidad from wms.ordenes_picking_lineas x join wms.posiciones ps on ps.id = x.posicion_id
        join wms.lotes lt on lt.id = x.lote_id where x.orden_id = $1 order by x.orden_recorrido nulls last, ps.codigo, x.id`, [o.rows[0].id])
    expect(ol.map((x) => [x.lote, x.posicion, x.cantidad])).toEqual([['L1', 'F-2.1', 30], ['L1', 'F-4.1', 30], ['L2', 'F-6.1', 20]])
  })

  it('nunca toma más de lo disponible: lo reservado por otra línea no cuenta, y el disponible nunca queda negativo', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'U1', en(100), logissa, 60)
    await sembrar(p, 'F-2.1', 'U2', en(200), logissa, 60)
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 50 }, { producto_id: p, cantidad: 50 }])
    await asignar(jt, s)
    const ls = await lineas(s)
    expect(ls.map((x) => x.estado)).toEqual(['ASIGNADA', 'ASIGNADA'])
    expect((await reservas(ls[0].id)).map((x) => [x.lote, x.cantidad])).toEqual([['U1', 50]])
    expect((await reservas(ls[1].id)).map((x) => [x.lote, x.cantidad])).toEqual([['U1', 10], ['U2', 40]]) // la segunda ve lo que reservó la primera
    expect((await disp(jt, logissa, p)).every((x) => x.disponible >= 0)).toBe(true)
  })

  it('sin stock: la línea queda SIN_STOCK, se alerta al Jefe de Transporte (una sola vez) y se resuelve al llegar stock', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'POCO', en(100), logissa, 10)
    await sembrar(p, 'F-1.2', 'CORTO', en(20), logissa, 500) // no cumple 60 días
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 50 }])
    const r1 = await asignar(jt, s)
    expect(r1[0].estado).toBe('SIN_STOCK')
    expect(r1[0].mensaje).toMatch(/hay 510 en total/)
    expect(r1[0].mensaje).toMatch(/500 de lotes que no cumplen vencimiento o vida útil/)
    await asignar(jt, s) // reintentar no duplica la alerta
    const alertas = await q(`select * from wms.alertas where tipo = 'STOCK_INSUFICIENTE' and producto_id = $1`, [p])
    expect(alertas).toHaveLength(1)
    expect(alertas[0]).toMatchObject({ destinatario_rol: 'jefe_transporte', estado: 'ABIERTA' })
    await sembrar(p, 'F-1.3', 'NUEVO', en(90), logissa, 80)
    const r2 = await asignar(jt, s)
    expect(r2[0]).toMatchObject({ estado: 'ASIGNADA' })
    expect((await q(`select estado from wms.alertas where tipo = 'STOCK_INSUFICIENTE' and producto_id = $1`, [p]))[0].estado).toBe('ATENDIDA')
  })

  it('ni sumando los lotes alcanza: no se reserva nada, la línea queda SIN_STOCK y se genera la alerta de stock insuficiente', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'P1', en(90), logissa, 20)
    await sembrar(p, 'F-1.2', 'P2', en(120), logissa, 15)
    await sembrar(p, 'F-1.3', 'P3-CORTO', en(30), logissa, 400) // no cumple 60 días: no suma
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 50 }])
    const r = await asignar(jt, s)
    expect(r[0].estado).toBe('SIN_STOCK')
    expect(r[0].mensaje).toMatch(/Stock insuficiente: la línea pide 50 y, sumando todos los lotes aptos, hay 35/)
    expect(await reservas((await lineas(s))[0].id)).toHaveLength(0) // todo o nada: no queda una reserva parcial
    const d = await disp(jt, logissa, p)
    expect(d.find((x) => x.lote === 'P1')).toMatchObject({ comprometido: 0, disponible: 20 })
    expect(d.every((x) => x.disponible >= 0)).toBe(true)
    const alertas = await q(`select * from wms.alertas where tipo = 'STOCK_INSUFICIENTE' and producto_id = $1`, [p])
    expect(alertas).toHaveLength(1)
    expect(alertas[0]).toMatchObject({ destinatario_rol: 'jefe_transporte', estado: 'ABIERTA' })
    expect(alertas[0].mensaje).toMatch(/Stock insuficiente/)
  })

  it('una línea con varios lotes sale por lote: cada reserva conserva su lote y su cantidad', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'R1', en(90), logissa, 30)
    await sembrar(p, 'F-1.2', 'R2', en(150), logissa, 30)
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 40 }])
    await asignar(jt, s)
    const l = (await lineas(s))[0]
    const o = (await como(jt, (c) => c.query('select wms.generar_orden_picking($1) id', [s]))).rows[0].id
    for (const ol of await q('select id from wms.ordenes_picking_lineas where orden_id = $1', [o])) {
      await como(aux1, (c) => c.query(`select wms.registrar_picking($1, 'PICKEADA', (select cantidad from wms.ordenes_picking_lineas where id = $1))`, [ol.id]))
      await como(sandra, (c) => c.query(`select wms.dar_conformidad($1, 'CONFORME')`, [ol.id]))
    }
    await como(jt, (c) => c.query('select wms.confirmar_salida($1)', [s]))
    expect(l.estado).toBe('ASIGNADA')
    const rs = await reservas(l.id)
    expect(rs.map((x) => [x.lote, x.cantidad, x.estado]).sort()).toEqual([['R1', 30, 'CONSUMIDA'], ['R2', 10, 'CONSUMIDA']])
  })

  it('una ubicación en conteo no se cuenta como stock: el mensaje dice «en conteo», no «no hay»', async () => {
    const p = await producto()
    const { posId } = await sembrar(p, 'F-3.2', 'EN-CONTEO', en(100), logissa, 100)
    const conteo = (await uno(`insert into wms.conteos (numero, tipo, creado_por) values ('CT-S2-1', 'PROGRAMADO', $1) returning id`, [base.personas.charlie.id]).catch(() => null))
    if (!conteo) {
      // El esquema de conteos exige más columnas: se arma por la función de la aplicación.
      await como(base.personas.charlie.id, (c) => c.query('select wms.programar_conteo($1::uuid[], $2)', [[posId], 'prueba']))
    }
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 10 }])
    const r = await asignar(jt, s)
    expect(r[0].estado).toBe('SIN_STOCK')
    expect(r[0].mensaje).toMatch(/100 en ubicaciones en conteo/)
  })
})

describe('Mover y las salidas comparten el «comprometido»', () => {
  it('un Mover no se lleva unidades reservadas por una salida, pero sí el resto', async () => {
    const p = await producto()
    const { posId, loteId, procedencia } = await sembrar(p, 'F-1.1', 'M1', en(100), logissa, 100)
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 70 }])
    await asignar(jt, s)
    const destino = await idPosicion(base.admin, 'F-1.2')
    const mover = (cant: number) => como(base.personas.charlie.id, (c) => c.query('select wms.ejecutar_movimiento($1::jsonb, $2, null) id', [JSON.stringify([{
      lote_id: loteId, desde_posicion_id: posId, hasta_posicion_id: destino, estado: 'APROBADO', procedencia_id: procedencia, cantidad: cant }]), 'reorden']))
    const e = await falla(mover(40))
    expect(e.message).toMatch(/hay 100, otros movimientos ya reservan 70/)
    await mover(30) // lo no prometido sí se puede mover
    // …y ya no queda nada libre.
    expect((await falla(mover(1))).message).toMatch(/ya reservan/)
  })
})

describe('modo B: salida por cuenta de un cliente (lote indicado)', () => {
  it('valida al crear: lote del propietario, del producto, cantidad suficiente; reserva al crear', async () => {
    const p = await producto()
    const p2 = await producto()
    const a = await sembrar(p, 'G-7.1', 'AJR-L1', en(10), ajr, 60) // < 60 días: a un cliente no le aplica el mínimo
    const d = await sembrar(p, 'A-14.1', 'DIPH-L1', en(300), diph, 60)
    await sembrar(p2, 'G-7.2', 'AJR-L2', en(100), ajr, 5)
    // lote de otro propietario
    expect((await falla(crear(jt, 'CLIENTE', 'VENTA', ajr, [{ producto_id: p, cantidad: 10, lote_id: d.loteId }]))).message).toMatch(/no es de este propietario/)
    // lote de otro producto
    expect((await falla(crear(jt, 'CLIENTE', 'VENTA', ajr, [{ producto_id: p2, cantidad: 1, lote_id: a.loteId }]))).message).toMatch(/no corresponde al producto/)
    // sin lote
    expect((await falla(crear(jt, 'CLIENTE', 'VENTA', ajr, [{ producto_id: p, cantidad: 1 }]))).message).toMatch(/Indica el lote/)
    // cantidad insuficiente (la orden no se crea)
    const antes = Number((await uno('select count(*) n from wms.salidas')).n)
    const e = await falla(crear(jt, 'CLIENTE', 'VENTA', ajr, [{ producto_id: p, cantidad: 61, lote_id: a.loteId }]))
    expect(e.message).toMatch(/en el lote AJR-L1 con 61 unidades disponibles/)
    expect(Number((await uno('select count(*) n from wms.salidas')).n)).toBe(antes)
    // una válida reserva al crear, aunque el lote venza en 10 días
    const s = await crear(jt, 'CLIENTE', 'VENTA', ajr, [{ producto_id: p, cantidad: 40, lote_id: a.loteId }], 'OC-9')
    const l = (await lineas(s))[0]
    expect(l).toMatchObject({ estado: 'ASIGNADA', lote_codigo: 'AJR-L1' })
    expect((await reservas(l.id))[0]).toMatchObject({ posicion: 'G-7.1', cantidad: 40, estado: 'ACTIVA' })
    // el «disponible real» del cliente ya descuenta lo reservado
    expect((await disp(jt, ajr, p))[0]).toMatchObject({ saldo: 60, comprometido: 40, disponible: 20 })
    // una segunda orden ve lo que queda
    expect((await falla(crear(jt, 'CLIENTE', 'VENTA', ajr, [{ producto_id: p, cantidad: 30, lote_id: a.loteId }]))).message).toMatch(/hay 20 en total/)
  })

  it('una salida de cliente nunca toma stock de otro propietario (ni del dueño del almacén)', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'LOG-X', en(200), logissa, 500)
    const d = await sembrar(p, 'A-14.2', 'DIPH-X', en(200), diph, 5)
    const s = await crear(jt, 'CLIENTE', 'VENTA', diph, [{ producto_id: p, cantidad: 5, lote_id: d.loteId }])
    const rs = await reservas((await lineas(s))[0].id)
    expect(rs.every((r) => r.propietario_id === diph)).toBe(true)
    expect((await falla(crear(jt, 'CLIENTE', 'VENTA', diph, [{ producto_id: p, cantidad: 1, lote_id: d.loteId }]))).message).toMatch(/hay 0 en total/)
  })

  it('el motivo y el tipo deben corresponder, y cada tipo tiene su propietario', async () => {
    const p = await producto()
    const a = await sembrar(p, 'G-7.3', 'AJR-M', en(100), ajr, 10)
    expect((await falla(crear(jt, 'DISTRIBUCION', 'MUESTRA', logissa, [{ producto_id: p, cantidad: 1 }]))).message).toMatch(/motivo no corresponde/)
    expect((await falla(crear(jt, 'DISTRIBUCION', 'VENTA', ajr, [{ producto_id: p, cantidad: 1 }]))).message).toMatch(/dueño del almacén/)
    expect((await falla(crear(jt, 'CLIENTE', 'VENTA', logissa, [{ producto_id: p, cantidad: 1, lote_id: a.loteId }]))).message).toMatch(/cliente de almacenamiento/)
    expect((await falla(crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 1, lote_id: a.loteId }]))).message).toMatch(/elige el lote por FEFO/)
    expect((await falla(crear(jt, 'CLIENTE', 'COSA', ajr, [{ producto_id: p, cantidad: 1, lote_id: a.loteId }]))).message).toMatch(/motivo no corresponde/)
  })
})

describe('vencidos (D-69, D-70)', () => {
  it('Logissa nunca sale vencido, ni en una venta ni en una muestra', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'VENC-LOG', en(-1), logissa, 100)
    const v = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 10 }])
    expect((await asignar(jt, v))[0].estado).toBe('SIN_STOCK')
    const m = await crear(muestras, 'MUESTRA', 'MUESTRA', logissa, [{ producto_id: p, cantidad: 1 }])
    expect((await asignar(jt, m))[0].estado).toBe('SIN_STOCK')
  })

  it('lo vencido de un cliente no sale por ninguna salida de Aprobados: ni venta, ni muestra, ni pesquisa DIGEMID, ni devolución; la destrucción sale solo desde Bajas (OS-6)', async () => {
    const p = await producto()
    const a = await sembrar(p, 'G-8.1', 'AJR-VENC', en(-20), ajr, 30)
    for (const motivo of ['VENTA', 'MUESTRA']) {
      const e = await falla(crear(jt, 'CLIENTE', motivo, ajr, [{ producto_id: p, cantidad: 5, lote_id: a.loteId }]))
      expect(e.message, motivo).toMatch(/lote AJR-VENC: El lote está vencido: lo vencido solo va a Bajas/i)
    }
    expect((await falla(crear(jt, 'CLIENTE', 'PESQUISA_DIGEMID', ajr, [{ producto_id: p, cantidad: 30, lote_id: a.loteId }]))).message).toMatch(/la pesquisa DIGEMID nunca es de lotes vencidos/)
    // la devolución al proveedor ya no es motivo de un cliente
    expect((await falla(crear(jt, 'CLIENTE', 'DEVOLUCION_PROVEEDOR', ajr, [{ producto_id: p, cantidad: 5, lote_id: a.loteId }]))).message).toMatch(/del stock de Logissa/)
    // la destrucción sale solo desde Bajas: lo que está en Aprobados (aunque esté vencido) no se destruye sin darlo de baja
    expect((await falla(crear(jt, 'CLIENTE', 'DESTRUCCION', ajr, [{ producto_id: p, cantidad: 5, lote_id: a.loteId }]))).message).toMatch(/La destrucción sale solo desde Bajas: del lote AJR-VENC hay 0 unidades en el área de Bajas/)
    // la aprobación de lotes vencidos de Dirección Técnica (D-69) ya no existe
    const s = await crear(jt, 'CLIENTE', 'VENTA', ajr, [{ producto_id: p, cantidad: 1, lote_id: (await sembrar(p, 'G-8.4', 'AJR-OK', en(300), ajr, 5)).loteId }])
    expect((await falla(como(base.personas.katia.id, (c) => c.query('select wms.aprobar_salida_vencida($1, $2)', [s, 'x'])))).message).toMatch(/ya no sale por una salida con aprobación/)
  })

  it('la devolución al proveedor es una salida de Logissa: sale lo que NO está vencido, sin el mínimo de 60 días, y nunca un lote vencido', async () => {
    const p = await producto()
    await sembrar(p, 'F-8.1', 'LOG-VENCIDO', en(-3), logissa, 20)
    await sembrar(p, 'F-8.2', 'LOG-CORTO', en(10), logissa, 20)     // 10 días: una venta no lo toma, una devolución sí
    const s = await crear(jt, 'DISTRIBUCION', 'DEVOLUCION_PROVEEDOR', logissa, [{ producto_id: p, cantidad: 15 }])
    await asignar(jt, s)
    expect((await lineas(s))[0].lote_codigo).toBe('LOG-CORTO')
    expect((await uno('select numero from wms.salidas where id = $1', [s])).numero).toMatch(/^OS-\d{4}-\d{5}$/)
    // todo vencido: sin stock, no sale vencido
    const p2 = await producto()
    await sembrar(p2, 'F-8.3', 'LOG-VENC-2', en(-1), logissa, 10)
    const s2 = await crear(jt, 'DISTRIBUCION', 'DEVOLUCION_PROVEEDOR', logissa, [{ producto_id: p2, cantidad: 5 }])
    expect((await asignar(jt, s2))[0].estado).toBe('SIN_STOCK')
    // la política de canje (parámetro) puede pedir más días de vida útil
    await base.admin.query(`update wms.parametros set valor = '30' where clave = 'devolucion_proveedor_dias_minimos'`)
    try {
      const s3 = await crear(jt, 'DISTRIBUCION', 'DEVOLUCION_PROVEEDOR', logissa, [{ producto_id: p, cantidad: 1 }])
      expect((await asignar(jt, s3))[0].estado).toBe('SIN_STOCK')
    } finally { await base.admin.query(`update wms.parametros set valor = '0' where clave = 'devolucion_proveedor_dias_minimos'`) }
  })

  it('un cliente SÍ puede sacar un lote que vence pronto (el mínimo de 60 días es de las ventas de Logissa)', async () => {
    const p = await producto()
    const a = await sembrar(p, 'G-8.3', 'AJR-CORTO', en(5), ajr, 10)
    const s = await crear(jt, 'CLIENTE', 'VENTA', ajr, [{ producto_id: p, cantidad: 10, lote_id: a.loteId }])
    expect((await lineas(s))[0].estado).toBe('ASIGNADA')
  })
})

describe('muestras de Logissa (D-70)', () => {
  it('solo quien autoriza salidas sin venta las crea; sin el mínimo de 60 días; con FEFO', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'M-CORTO', en(20), logissa, 10) // 20 días: sirve para una muestra
    await sembrar(p, 'F-1.2', 'M-LARGO', en(200), logissa, 10)
    expect((await falla(crear(jt, 'MUESTRA', 'MUESTRA', logissa, [{ producto_id: p, cantidad: 2 }]))).message).toMatch(/Solo quien autoriza salidas sin venta/)
    expect((await falla(crear(base.personas.katia.id, 'MUESTRA', 'MUESTRA', logissa, [{ producto_id: p, cantidad: 2 }]))).message).toMatch(/Solo quien autoriza salidas sin venta/)
    const s = await crear(muestras, 'MUESTRA', 'MUESTRA', logissa, [{ producto_id: p, cantidad: 2 }])
    expect((await uno('select autorizada_por from wms.salidas where id = $1', [s])).autorizada_por).toBe(muestras)
    // asignar es tarea de quien prepara (jefe de transporte), no de quien autoriza
    await asignar(jt, s)
    expect((await lineas(s))[0].lote_codigo).toBe('M-CORTO') // FEFO, y los 20 días no estorban
    // una venta, en cambio, no toma ese lote de 20 días
    const v = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 2 }])
    await asignar(jt, v)
    expect((await lineas(v))[0].lote_codigo).toBe('M-LARGO')
  })
})

describe('devolución al proveedor de Logissa (OS-6): una salida normal, solo antes del vencimiento y según la política de canje', () => {
  const dev = (lote: string, prod: string, cantidad = 5, quien = jt, propietario = logissa) => crear(quien, 'PROVEEDOR', 'DEVOLUCION_PROVEEDOR', propietario, [{ producto_id: prod, cantidad, lote_id: lote }])

  it('la crea quien prepara salidas (no hace falta «autoriza salidas sin venta»); reserva el lote indicado al crearla; es del dueño del almacén', async () => {
    const p = await producto()
    const a = await sembrar(p, 'F-2.1', 'DEV-1', en(150), logissa, 40)
    const s = await dev(a.loteId, p, 15)
    expect((await uno('select tipo, motivo from wms.salidas where id = $1', [s]))).toMatchObject({ tipo: 'PROVEEDOR', motivo: 'DEVOLUCION_PROVEEDOR' })
    const l = (await lineas(s))[0]
    expect(l.estado).toBe('ASIGNADA'); expect(l.lote_codigo).toBe('DEV-1')
    expect((await falla(dev(a.loteId, p, 5, aux1))).message).toMatch(/No tienes permiso para preparar salidas/)
    const c = await sembrar(p, 'G-9.1', 'DEV-AJR', en(150), ajr, 10)
    expect((await falla(dev(c.loteId, p, 5, jt, ajr))).message).toMatch(/del dueño del almacén/)
    expect((await falla(crear(jt, 'PROVEEDOR', 'VENTA', logissa, [{ producto_id: p, cantidad: 1, lote_id: a.loteId }]))).message).toMatch(/motivo no corresponde/)
    expect((await falla(crear(jt, 'PROVEEDOR', 'DEVOLUCION_PROVEEDOR', logissa, [{ producto_id: p, cantidad: 1 }]))).message).toMatch(/Indica el lote/)
  })

  it('nunca de un lote vencido (va a Bajas); el último día de vigencia todavía se puede; no más de lo disponible', async () => {
    const p = await producto()
    const v = await sembrar(p, 'F-2.2', 'DEV-VENC', en(-1), logissa, 20)
    expect((await falla(dev(v.loteId, p))).message).toMatch(/no se devuelve vencido a nadie\. Va a Bajas/)
    const hoyMismo = await sembrar(p, 'F-2.3', 'DEV-HOY', en(0), logissa, 20)
    expect((await lineas(await dev(hoyMismo.loteId, p, 20)))[0].estado).toBe('ASIGNADA')
    const poco = await sembrar(p, 'F-2.4', 'DEV-POCO', en(100), logissa, 3)
    expect((await falla(dev(poco.loteId, p, 10))).message).toMatch(/No hay en el lote DEV-POCO/)
  })

  it('la política de canje es un parámetro (PENDIENTE de Katia): mínimo y máximo de días antes de vencer', async () => {
    const p = await producto()
    const corto = await sembrar(p, 'F-8.1', 'CANJE-CORTO', en(20), logissa, 10)
    const largo = await sembrar(p, 'F-8.2', 'CANJE-LARGO', en(400), logissa, 10)
    expect((await lineas(await dev(corto.loteId, p)))[0].estado).toBe('ASIGNADA') // sin política: basta con que no esté vencido
    try {
      await base.admin.query(`update wms.parametros set valor = '30' where clave = 'canje_dias_minimos_antes_vencimiento'`)
      await base.admin.query(`update wms.parametros set valor = '180' where clave = 'canje_dias_maximos_antes_vencimiento'`)
      expect((await falla(dev(corto.loteId, p, 2))).message).toMatch(/al menos 30 días antes de vencer; a este le faltan 20/)
      expect((await falla(dev(largo.loteId, p, 2))).message).toMatch(/180 días o menos para vencer; a este le faltan 400/)
      const medio = await sembrar(p, 'F-8.3', 'CANJE-MEDIO', en(100), logissa, 10)
      expect((await lineas(await dev(medio.loteId, p)))[0].estado).toBe('ASIGNADA')
    } finally {
      await base.admin.query(`update wms.parametros set valor = '0' where clave = 'canje_dias_minimos_antes_vencimiento'`)
      await base.admin.query(`update wms.parametros set valor = '' where clave = 'canje_dias_maximos_antes_vencimiento'`)
    }
  })

  it('el tipo B no puede devolver al proveedor, y las salidas viejas con ese motivo no se reescriben (el check nuevo es NOT VALID)', async () => {
    expect((await uno(`select convalidated from pg_constraint where conrelid = 'wms.salidas'::regclass and conname = 'salidas_tipo_motivo_check'`)).convalidated).toBe(false)
    await expect(base.admin.query(`insert into wms.salidas (numero, tipo, motivo, propietario_id, creada_por) values ('SAL-X-1', 'CLIENTE', 'DEVOLUCION_PROVEEDOR', $1, $2)`, [ajr, jt])).rejects.toThrow(/salidas_tipo_motivo_check/)
  })
})

describe('edición libre de la asignación (D-79): elegir lotes, con reglas de seguridad, aviso FEFO y trazabilidad', () => {
  async function pedido(cantidad = 20) {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'E-CORTO', en(90), logissa, 100)
    const largo = await sembrar(p, 'F-2.1', 'E-LARGO', en(400), logissa, 100)
    const medio = await sembrar(p, 'F-3.1', 'E-MEDIO', en(200), logissa, 5) // pocas unidades
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad }])
    await asignar(jt, s)
    const l = (await lineas(s))[0]
    expect(l.lote_codigo).toBe('E-CORTO')
    const corto = await uno(`select id from wms.lotes where producto_id = $1 and codigo = 'E-CORTO'`, [p])
    return { p, s, l, largo, medio, corto: corto.id as string }
  }
  const cambiar = (id: string, linea: string, asignaciones: { lote: string; cantidad: number }[], motivo?: string) =>
    como(id, (c) => c.query('select wms.editar_asignacion($1, $2::jsonb, $3)', [linea, JSON.stringify(asignaciones.map((a) => ({ lote_id: a.lote, cantidad: a.cantidad }))), motivo ?? null]))
  const activas = async (linea: string) => (await reservas(linea)).filter((r) => r.estado === 'ACTIVA').map((r) => [r.lote, r.cantidad]).sort()

  it('el sistema propone el FEFO y lo deja guardado: la asignación original no cambia nunca', async () => {
    const { l, corto } = await pedido()
    expect(l.asignacion_fefo).toEqual([{ lote_id: corto, lote: 'E-CORTO', vence: expect.any(String), cantidad: 20 }])
  })

  it('reemplazar un lote sin pedir motivo: queda la asignación FEFO original, la anterior, la final, quién y cuándo (inmutable)', async () => {
    const { l, largo, corto } = await pedido()
    await cambiar(jt, l.id, [{ lote: largo.loteId, cantidad: 20 }])
    const l2 = (await lineas(l.salida_id))[0]
    expect(l2).toMatchObject({ lote_codigo: 'E-LARGO', fefo_codigo: 'E-CORTO' })
    expect(l2.asignacion_fefo).toEqual(l.asignacion_fefo) // el FEFO original se conserva
    expect((await reservas(l.id)).map((r) => [r.lote, r.estado]).sort()).toEqual([['E-CORTO', 'LIBERADA'], ['E-LARGO', 'ACTIVA']])
    const c = await uno('select * from wms.cambios_lote_asignado where linea_id = $1', [l.id])
    expect(c).toMatchObject({ por: jt, motivo: null, distinto_de_fefo: true })
    expect(c.asignacion_fefo).toEqual(l.asignacion_fefo)
    expect(c.asignacion_anterior).toEqual([{ lote_id: corto, lote: 'E-CORTO', vence: expect.any(String), cantidad: 20 }])
    expect(c.asignacion_nueva).toEqual([{ lote_id: largo.loteId, lote: 'E-LARGO', vence: expect.any(String), cantidad: 20 }])
    expect(c.en).toBeTruthy()
    expect((await falla(base.admin.query('update wms.cambios_lote_asignado set por = $1', [aux1]))).message).toMatch(/inmutable/i)
  })

  it('el motivo es opcional (texto libre) y se guarda si se escribe; uno demasiado largo se rechaza', async () => {
    const { l, largo, corto } = await pedido()
    await cambiar(jt, l.id, [{ lote: largo.loteId, cantidad: 20 }], '  El cliente pidió vencimiento más largo  ')
    expect((await uno('select motivo from wms.cambios_lote_asignado where linea_id = $1', [l.id])).motivo).toBe('El cliente pidió vencimiento más largo')
    await cambiar(jt, l.id, [{ lote: corto, cantidad: 20 }], '   ') // en blanco = sin motivo
    expect((await q('select motivo from wms.cambios_lote_asignado where linea_id = $1 order by en, id', [l.id])).map((r) => r.motivo)).toEqual(['El cliente pidió vencimiento más largo', null])
    expect((await falla(cambiar(jt, l.id, [{ lote: largo.loteId, cantidad: 20 }], 'x'.repeat(501)))).message).toMatch(/demasiado largo/)
  })

  it('se puede elegir un lote que vence ANTES o DESPUÉS del FEFO (sin regla de «vencer después»)', async () => {
    const { l, p, largo } = await pedido()
    const antes = await sembrar(p, 'F-4.1', 'E-ANTES', en(70), logissa, 100) // vence antes que el FEFO propuesto (E-CORTO, 90)
    await cambiar(jt, l.id, [{ lote: antes.loteId, cantidad: 20 }])
    expect(await activas(l.id)).toEqual([['E-ANTES', 20]])
    await cambiar(jt, l.id, [{ lote: largo.loteId, cantidad: 20 }])
    expect(await activas(l.id)).toEqual([['E-LARGO', 20]])
  })

  it('agregar otro lote, quitar uno y redistribuir cantidades: siempre que la suma sea la cantidad de la línea', async () => {
    const { l, largo, medio, corto } = await pedido(50)
    await cambiar(jt, l.id, [{ lote: corto, cantidad: 20 }, { lote: largo.loteId, cantidad: 30 }])
    expect(await activas(l.id)).toEqual([['E-CORTO', 20], ['E-LARGO', 30]])
    await cambiar(jt, l.id, [{ lote: corto, cantidad: 10 }, { lote: medio.loteId, cantidad: 5 }, { lote: largo.loteId, cantidad: 35 }])
    expect(await activas(l.id)).toEqual([['E-CORTO', 10], ['E-LARGO', 35], ['E-MEDIO', 5]])
    await cambiar(jt, l.id, [{ lote: largo.loteId, cantidad: 50 }])
    expect(await activas(l.id)).toEqual([['E-LARGO', 50]])
    const cambios = await q('select * from wms.cambios_lote_asignado where linea_id = $1 order by en, id', [l.id])
    expect(cambios).toHaveLength(3)
    expect((await lineas(l.salida_id))[0]).toMatchObject({ lote_codigo: 'E-LARGO', fefo_codigo: 'E-CORTO' })
    expect((await disp(jt, logissa, l.producto_id)).every((x) => x.disponible >= 0)).toBe(true) // nunca negativo
  })

  it('una línea con dos lotes FEFO se puede redistribuir entre ellos; volver exactamente al FEFO no cuenta como cambio a FEFO', async () => {
    const p = await producto()
    const a = await sembrar(p, 'F-1.1', 'D-A', en(90), logissa, 30)
    const b = await sembrar(p, 'F-2.1', 'D-B', en(150), logissa, 60)
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 50 }])
    await asignar(jt, s)
    const l = (await lineas(s))[0]
    expect(await activas(l.id)).toEqual([['D-A', 30], ['D-B', 20]])
    await cambiar(jt, l.id, [{ lote: a.loteId, cantidad: 10 }, { lote: b.loteId, cantidad: 40 }])
    expect(await activas(l.id)).toEqual([['D-A', 10], ['D-B', 40]])
    await cambiar(jt, l.id, [{ lote: a.loteId, cantidad: 30 }, { lote: b.loteId, cantidad: 20 }]) // de vuelta a la propuesta FEFO
    expect((await q('select distinto_de_fefo from wms.cambios_lote_asignado where linea_id = $1 order by en, id', [l.id])).map((r) => r.distinto_de_fefo)).toEqual([true, false])
  })

  it('la suma debe ser igual a la cantidad de la línea; cada cantidad es positiva; un lote no se repite', async () => {
    const { l, largo, corto } = await pedido(50)
    expect((await falla(cambiar(jt, l.id, [{ lote: corto, cantidad: 20 }, { lote: largo.loteId, cantidad: 29 }]))).message).toMatch(/La suma de los lotes \(49\) debe ser igual a la cantidad de la línea \(50\)/)
    expect((await falla(cambiar(jt, l.id, [{ lote: corto, cantidad: 60 }, { lote: largo.loteId, cantidad: 0 }]))).message).toMatch(/cantidad, mayor que cero/)
    expect((await falla(cambiar(jt, l.id, [{ lote: largo.loteId, cantidad: 25 }, { lote: largo.loteId, cantidad: 25 }]))).message).toMatch(/una sola vez/)
    expect((await falla(cambiar(jt, l.id, [{ lote: corto, cantidad: -5 }, { lote: largo.loteId, cantidad: 55 }]))).message).toMatch(/cantidad, mayor que cero/)
    expect((await falla(cambiar(jt, l.id, []))).message).toMatch(/al menos un lote/)
    expect((await falla(cambiar(jt, l.id, [{ lote: corto, cantidad: 50 }]))).message).toMatch(/no cambió/)
    expect(await activas(l.id)).toEqual([['E-CORTO', 50]]) // nada de lo anterior dejó rastro
  })

  it('permisos: Jefe de Almacén, Jefe de Transporte y auxiliares editan lotes; Sandra y Muestras no', async () => {
    const { l, largo, corto } = await pedido()
    for (const quien of [sandra, muestras]) expect((await falla(cambiar(quien, l.id, [{ lote: largo.loteId, cantidad: 20 }]))).message).toMatch(/No tienes permiso para editar los lotes/)
    await cambiar(base.personas.charlie.id, l.id, [{ lote: largo.loteId, cantidad: 20 }])
    await cambiar(aux1, l.id, [{ lote: corto, cantidad: 20 }])
    await cambiar(jt, l.id, [{ lote: largo.loteId, cantidad: 20 }])
    expect((await q('select por from wms.cambios_lote_asignado where linea_id = $1 order by en, id', [l.id])).map((r) => r.por)).toEqual([base.personas.charlie.id, aux1, jt])
  })

  it('siguen las reglas de seguridad: alcanza, mismo producto y propietario, Aprobado, sin bloqueo, 60 días y no vencido', async () => {
    const { l, p, medio, largo, corto } = await pedido()
    expect((await falla(cambiar(jt, l.id, [{ lote: medio.loteId, cantidad: 20 }]))).message).toMatch(/no tiene suficientes unidades/) // hay 5, no 20
    const corto60 = await sembrar(p, 'F-4.4', 'E-59', en(59), logissa, 100)
    expect((await falla(cambiar(jt, l.id, [{ lote: corto60.loteId, cantidad: 20 }]))).message).toMatch(/vence en 59 días/) // mínimo de 60 días
    const venc = await sembrar(p, 'F-4.3', 'E-VENC', en(-1), logissa, 100)
    expect((await falla(cambiar(jt, l.id, [{ lote: venc.loteId, cantidad: 20 }]))).message).toMatch(/vencido/)
    const otroProd = await producto()
    const x = await sembrar(otroProd, 'F-4.2', 'OTRO', en(500), logissa, 100)
    expect((await falla(cambiar(jt, l.id, [{ lote: x.loteId, cantidad: 20 }]))).message).toMatch(/no corresponde al producto/)
    const dueno = await sembrar(p, 'A-14.3', 'DIPH', en(500), diph, 100)
    expect((await falla(cambiar(jt, l.id, [{ lote: dueno.loteId, cantidad: 20 }]))).message).toMatch(/no corresponde al producto o al propietario/)
    const cuarentena = await sembrar(p, 'A-6', 'E-CUAR', en(500), logissa, 100, 'CUARENTENA')
    expect((await falla(cambiar(jt, l.id, [{ lote: cuarentena.loteId, cantidad: 20 }]))).message).toMatch(/no tiene suficientes unidades/) // solo cuenta lo Aprobado
    expect(await activas(l.id)).toEqual([['E-CORTO', 20]]) // los rechazos no dejaron rastro
    await cambiar(jt, l.id, [{ lote: largo.loteId, cantidad: 20 }]) // el válido sí
    await cambiar(jt, l.id, [{ lote: corto, cantidad: 20 }])
    expect(await activas(l.id)).toEqual([['E-CORTO', 20]])
  })

  it('un lote bloqueado no se puede asignar', async () => {
    const { l, p, largo } = await pedido()
    const bloq = await uno(`select column_name from information_schema.columns where table_schema = 'wms' and table_name = 'lotes' and column_name in ('bloqueado', 'retenido') limit 1`)
    if (bloq) {
      await q(`update wms.lotes set ${bloq.column_name} = true where id = $1`, [largo.loteId]).catch(() => null)
      const err = await falla(cambiar(jt, l.id, [{ lote: largo.loteId, cantidad: 20 }])).catch(() => null)
      if (err) expect(err.message).toMatch(/bloqueado|no tiene suficientes/)
      await q(`update wms.lotes set ${bloq.column_name} = false where id = $1`, [largo.loteId]).catch(() => null)
    }
    expect(p).toBeTruthy()
  })

  it('lotes_para_editar: solo los válidos, con ubicación, disponible (contando lo ya asignado a la línea) y el FEFO marcado como sugerido', async () => {
    const { l, p, largo } = await pedido(20)
    await sembrar(p, 'F-4.4', 'E-59', en(59), logissa, 100) // sin 60 días: no se ofrece
    await sembrar(p, 'F-4.3', 'E-VENC', en(-1), logissa, 100) // vencido: no se ofrece
    await sembrar(p, 'A-6', 'E-CUAR', en(500), logissa, 100, 'CUARENTENA') // no aprobado: no se ofrece
    const lista = await como(aux1, async (c) => (await c.query('select * from wms.lotes_para_editar($1)', [l.id])).rows)
    expect(lista.map((x) => [x.lote, x.ubicacion, x.disponible, x.asignado, x.sugerido])).toEqual([
      ['E-CORTO', 'F-1.1', 100, 20, true],   // el disponible cuenta lo que la propia línea ya tiene reservado
      ['E-MEDIO', 'F-3.1', 5, 0, false],
      ['E-LARGO', 'F-2.1', 100, 0, false],
    ])
    expect(largo.loteId).toBeTruthy()
  })

  it('avisos_fefo: dice qué lote vence antes (no bloquea); sin avisos si se eligió el FEFO', async () => {
    const { l, largo, corto } = await pedido(20)
    const avisos = (asign: { lote: string; cantidad: number }[]) => como(aux1, async (c) =>
      (await c.query('select * from wms.avisos_fefo($1, $2::jsonb)', [l.id, JSON.stringify(asign.map((a) => ({ lote_id: a.lote, cantidad: a.cantidad })))])).rows)
    expect(await avisos([{ lote: corto, cantidad: 20 }])).toEqual([])
    const a = await avisos([{ lote: largo.loteId, cantidad: 20 }])
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ lote: 'E-LARGO', antes_lote: 'E-CORTO' })
    await cambiar(jt, l.id, [{ lote: largo.loteId, cantidad: 20 }]) // el aviso no impide continuar
  })

  it('reporte «Cambios a FEFO»: cuántas veces y quién eligió un lote distinto al FEFO, por periodo', async () => {
    const hoyLima = (await uno(`select to_char((now() at time zone 'America/Lima')::date, 'YYYY-MM-DD') as d`)).d
    const rep = (id: string, desde: string | null = null, hasta: string | null = null) =>
      como(id, async (c) => (await c.query('select * from wms.reporte_cambios_fefo($1, $2)', [desde, hasta])).rows)
    const antes = await rep(jt)
    const cuenta = (rows: { persona_id: string; veces: number }[], quien: string) => rows.find((r) => r.persona_id === quien)?.veces ?? 0
    const { l, largo, corto } = await pedido()
    await cambiar(aux1, l.id, [{ lote: largo.loteId, cantidad: 20 }])
    await cambiar(aux1, l.id, [{ lote: corto, cantidad: 20 }]) // vuelve al FEFO: no cuenta
    await cambiar(jt, l.id, [{ lote: largo.loteId, cantidad: 20 }])
    const despues = await rep(jt)
    expect(cuenta(despues, aux1) - cuenta(antes, aux1)).toBe(1)
    expect(cuenta(despues, jt) - cuenta(antes, jt)).toBe(1)
    // por periodo: ayer-anteayer no hay nada de hoy
    expect((await rep(jt, '2000-01-01', '2000-12-31'))).toEqual([])
    expect(cuenta(await rep(jt, String(hoyLima), String(hoyLima)), aux1)).toBeGreaterThanOrEqual(1)
    // quién lo ve
    expect((await falla(rep(aux1))).message).toMatch(/No tienes permiso para ver este reporte/)
    expect((await rep(base.personas.charlie.id)).length).toBeGreaterThan(0)
  })

  it('solo antes del picking; después ya no, y en una salida de cliente tampoco', async () => {
    const { l, s, largo } = await pedido()
    const op = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [s])).rows[0].id)
    await cambiar(jt, l.id, [{ lote: largo.loteId, cantidad: 20 }])
    const ol = await q('select lote_id, cantidad from wms.ordenes_picking_lineas where orden_id = $1', [op])
    expect(ol).toHaveLength(1)
    expect(ol[0].lote_id).toBe(largo.loteId)
    const lin = (await q('select id from wms.ordenes_picking_lineas where orden_id = $1', [op]))[0].id
    await como(aux1, (c) => c.query(`select wms.registrar_picking($1, 'PICKEADA', 20, null)`, [lin]))
    expect((await falla(cambiar(jt, l.id, [{ lote: largo.loteId, cantidad: 20 }]))).message).toMatch(/no se editan los lotes/)
    const p = await producto()
    const a = await sembrar(p, 'G-9.1', 'C1', en(100), ajr, 10)
    const b = await sembrar(p, 'G-9.2', 'C2', en(500), ajr, 10)
    const sc = await crear(jt, 'CLIENTE', 'VENTA', ajr, [{ producto_id: p, cantidad: 5, lote_id: a.loteId }])
    const lineaCl = (await lineas(sc))[0].id
    expect((await falla(cambiar(jt, lineaCl, [{ lote: b.loteId, cantidad: 5 }]))).message).toMatch(/solo se editan en un pedido de venta/)
  })

  it('la orden de picking refleja la asignación editada, con una línea por lote y su ubicación', async () => {
    const { l, s, largo, corto } = await pedido(50)
    const op = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [s])).rows[0].id)
    await cambiar(jt, l.id, [{ lote: corto, cantidad: 20 }, { lote: largo.loteId, cantidad: 30 }])
    const ol = await q(`select lt.codigo as lote, ps.codigo as posicion, x.cantidad from wms.ordenes_picking_lineas x join wms.lotes lt on lt.id = x.lote_id
        join wms.posiciones ps on ps.id = x.posicion_id where x.orden_id = $1 order by ps.codigo`, [op])
    expect(ol.map((x) => [x.lote, x.posicion, x.cantidad])).toEqual([['E-CORTO', 'F-1.1', 20], ['E-LARGO', 'F-2.1', 30]])
  })
})

describe('propuesta de reemplazo (el picker no encuentra el lote; solo en A)', () => {
  it('primero el mismo lote en otra ubicación; si no hay, el siguiente FEFO válido', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'R1', en(90), logissa, 30)
    await sembrar(p, 'F-2.1', 'R1', en(90), logissa, 30) // mismo lote, otra celda
    await sembrar(p, 'F-3.1', 'R2', en(150), logissa, 100)
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 25 }])
    await asignar(jt, s)
    const l = (await lineas(s))[0]
    expect((await reservas(l.id))[0].posicion).toBe('F-1.1')
    const prop1 = await como(aux1, async (c) => (await c.query('select * from wms.proponer_reemplazo($1)', [l.id])).rows)
    expect(prop1.map((x) => [x.motivo, x.posicion, x.lote])).toEqual([['MISMO_LOTE_OTRA_UBICACION', 'F-2.1', 'R1']])
    // si el resto del lote ya está tomado por otra salida, se propone el siguiente FEFO
    const s2 = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 30 }])
    await asignar(jt, s2)
    const prop2 = await como(aux1, async (c) => (await c.query('select * from wms.proponer_reemplazo($1)', [l.id])).rows)
    expect(prop2.map((x) => [x.motivo, x.lote, x.disponible])).toEqual([['SIGUIENTE_FEFO', 'R2', 100]])
  })

  it('tras editar la asignación, el reemplazo se propone por lote sin pedir que venza después; en una salida de cliente no hay reemplazo', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'X1', en(90), logissa, 100)
    const x2 = await sembrar(p, 'F-2.1', 'X2', en(120), logissa, 100)
    await sembrar(p, 'F-3.1', 'X3', en(200), logissa, 100)
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 100 }])
    await asignar(jt, s)
    const l = (await lineas(s))[0]
    await como(jt, (c) => c.query('select wms.editar_asignacion($1, $2::jsonb, $3)', [l.id, JSON.stringify([{ lote_id: x2.loteId, cantidad: 100 }]), null]))
    // el lote vigente es X2 y está todo reservado: no queda «mismo lote»; el siguiente FEFO válido es X1 (ya no se exige vencer después del original)
    const prop = await como(aux1, async (c) => (await c.query('select * from wms.proponer_reemplazo($1)', [l.id])).rows)
    expect(prop.map((x) => x.lote)).toEqual(['X1', 'X3'])
    const pc = await producto()
    const a = await sembrar(pc, 'G-9.3', 'K1', en(100), ajr, 10)
    const sc = await crear(jt, 'CLIENTE', 'VENTA', ajr, [{ producto_id: pc, cantidad: 5, lote_id: a.loteId }])
    const lineaC = (await lineas(sc))[0].id
    expect((await falla(como(aux1, (c) => c.query('select * from wms.proponer_reemplazo($1)', [lineaC])))).message).toMatch(/no hay reemplazo/)
  })
})

describe('picking → conformidad → salida → retorno (§4.3)', () => {
  async function preparado(cantidad = 50, extra?: { dueno?: string }) {
    const p = await producto()
    await sembrar(p, 'F-2.1', 'FL1', en(100), logissa, 30)
    await sembrar(p, 'F-1.1', 'FL1', en(100), logissa, 30) // recorrido: F-1.1 antes que F-2.1
    await sembrar(p, 'F-5.1', 'OTRO', en(300), logissa, 100)
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', extra?.dueno ?? logissa, [{ producto_id: p, cantidad }], 'PED-77')
    await asignar(jt, s)
    const op = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [s])).rows[0].id as string)
    const ols = await q('select * from wms.ordenes_picking_lineas where orden_id = $1 order by orden_recorrido, id', [op])
    return { p, s, op, ols, linea: (await lineas(s))[0] }
  }
  const pickear = (id: string, ol: string, cant: number) => como(id, (c) => c.query(`select wms.registrar_picking($1, 'PICKEADA', $2, null)`, [ol, cant]))
  const conformar = (id: string, ol: string, res = 'CONFORME', nota: string | null = null) =>
    como(id, async (c) => (await c.query('select wms.dar_conformidad($1, $2, $3, null) m', [ol, res, nota])).rows[0].m as string | null)

  it('la orden de picking sale ordenada por el recorrido del almacén (y con foto del recorrido)', async () => {
    const { ols, op } = await preparado()
    expect(ols.map((x) => x.posicion_id).length).toBe(2)
    const f = await q(`select ps.codigo, ol.cantidad, ol.orden_recorrido from wms.ordenes_picking_lineas ol join wms.posiciones ps on ps.id = ol.posicion_id where ol.orden_id = $1 order by ol.orden_recorrido, ps.codigo`, [op])
    expect(f.map((x) => [x.codigo, x.cantidad])).toEqual([['F-1.1', 30], ['F-2.1', 20]])
    expect(f[0].orden_recorrido).toBeLessThan(f[1].orden_recorrido)
    expect((await uno('select numero, estado from wms.ordenes_picking where id = $1', [op])).numero).toMatch(/^OP-\d{4}-\d{5}$/)
  })

  it('generar la orden es idempotente y no se genera con líneas sin stock', async () => {
    const { s, op } = await preparado()
    expect(await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [s])).rows[0].id)).toBe(op)
    const p = await producto()
    const s2 = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 1 }])
    await asignar(jt, s2)
    expect((await falla(como(jt, (c) => c.query('select wms.generar_orden_picking($1)', [s2])))).message).toMatch(/sin stock o sin asignar/)
  })

  it('el picking NO toca el ledger: las unidades quedan reservadas y en tránsito', async () => {
    const { p, ols, linea } = await preparado()
    const antes = await saldoEn(p, 'F-1.1')
    await pickear(aux1, ols[0].id, ols[0].cantidad)
    expect(await saldoEn(p, 'F-1.1')).toBe(antes)
    expect((await reservas(linea.id)).map((r) => r.estado)).toEqual(['EN_TRANSITO', 'ACTIVA'])
    expect((await uno('select estado from wms.salida_lineas where id = $1', [linea.id])).estado).toBe('EN_PICKING')
    await pickear(aux1, ols[1].id, ols[1].cantidad)
    expect((await uno('select estado from wms.salida_lineas where id = $1', [linea.id])).estado).toBe('PICKEADA')
    expect((await uno('select estado from wms.ordenes_picking where salida_id = $1', [linea.salida_id])).estado).toBe('COMPLETA')
  })

  it('picking: la cantidad es exacta y una discrepancia pide explicación y no mueve nada', async () => {
    const { ols } = await preparado()
    expect((await falla(pickear(aux1, ols[0].id, ols[0].cantidad - 1))).message).toMatch(/exactamente/)
    expect((await falla(como(aux1, (c) => c.query(`select wms.registrar_picking($1, 'DISCREPANCIA', null, null)`, [ols[0].id])))).message).toMatch(/Cuéntanos qué pasó/)
    await como(aux1, (c) => c.query(`select wms.registrar_picking($1, 'DISCREPANCIA', null, 'no encontré el lote')`, [ols[0].id]))
    expect((await uno('select picking, nota_picking from wms.ordenes_picking_lineas where id = $1', [ols[0].id]))).toMatchObject({ picking: 'DISCREPANCIA', nota_picking: 'no encontré el lote' })
    expect((await falla(pickear(aux1, ols[0].id, ols[0].cantidad))).message).toMatch(/ya se registró/)
  })

  it('la conformidad la da OTRA persona con el permiso propio; recién ahí se mueve rack → staging (D-51)', async () => {
    const { p, ols, linea } = await preparado()
    await pickear(aux1, ols[0].id, ols[0].cantidad)
    expect((await falla(conformar(aux1, ols[0].id))).message).toMatch(/No tienes permiso para dar la conformidad/) // el picker no tiene el permiso
    const picker = await persona(['auxiliar', 'conformidad_despacho'])
    await pickear(picker, ols[1].id, ols[1].cantidad)
    expect((await falla(conformar(picker, ols[1].id))).message).toMatch(/otra persona, no quien hizo el picking/) // ni con el permiso, sobre su propio picking
    for (const quien of [jt, aux2, base.personas.charlie.id]) expect((await falla(conformar(quien, ols[0].id))).message).toMatch(/No tienes permiso para dar la conformidad/)
    const rack = await saldoEn(p, 'F-1.1')
    const mov = await conformar(sandra, ols[0].id)
    expect(mov).toBeTruthy()
    expect(await saldoEn(p, 'F-1.1')).toBe(rack - 30)
    expect(await saldoEn(p, 'STG-1')).toBe(30)
    const m = await uno('select * from wms.movimientos where id = $1', [mov])
    expect(m).toMatchObject({ tipo: 'MOVIMIENTO', ejecutor_id: aux1, verificador_id: sandra, referencia_tipo: 'salida_linea', referencia_id: linea.id })
    expect((await reservas(linea.id)).map((r) => [r.posicion, r.estado])).toEqual([['F-2.1', 'EN_TRANSITO'], ['STG-1', 'EN_STAGING']])
    await conformar(sandra, ols[1].id)
    expect((await uno('select estado from wms.salida_lineas where id = $1', [linea.id])).estado).toBe('CONFORME')
    expect((await falla(conformar(sandra, ols[0].id))).message).toMatch(/ya tiene su conformidad/)
  })

  it('una conformidad observada no mueve nada y pide explicación; una línea sin picking no se conforma', async () => {
    const { p, ols, linea } = await preparado()
    expect((await falla(conformar(sandra, ols[0].id))).message).toMatch(/todavía no se pickeó/)
    await pickear(aux1, ols[0].id, ols[0].cantidad)
    expect((await falla(conformar(sandra, ols[0].id, 'OBSERVADA'))).message).toMatch(/Cuéntanos qué observas/)
    const antes = await saldoEn(p, 'F-1.1')
    expect(await conformar(sandra, ols[0].id, 'OBSERVADA', 'caja golpeada')).toBeNull()
    expect(await saldoEn(p, 'F-1.1')).toBe(antes)
    expect((await uno('select estado from wms.salida_lineas where id = $1', [linea.id])).estado).toBe('OBSERVADA')
  })

  it('Despacho tiene varias ubicaciones: sin la ubicación por defecto la conformidad pide indicar cuál usar', async () => {
    await base.admin.query(`update wms.parametros set valor = 'NO-EXISTE' where clave = 'posicion_despacho_defecto'`)
    try {
      const { ols } = await preparado(10)
      await pickear(aux1, ols[0].id, ols[0].cantidad)
      expect((await falla(conformar(sandra, ols[0].id))).message).toMatch(/Hay varias ubicaciones de DESPACHO: indica cuál usar/)
    } finally { await base.admin.query(`update wms.parametros set valor = 'STG-1' where clave = 'posicion_despacho_defecto'`) }
  })

  it('el ciclo completo: SALIDA desde Despacho, idempotencia y Kardex', async () => {
    const { p, s, ols, linea } = await preparado()
    for (const ol of ols) { await pickear(aux1, ol.id, ol.cantidad); await conformar(sandra, ol.id) }
    expect(await saldoEn(p, 'STG-1')).toBe(50)
    // confirmar la salida exige su permiso
    for (const quien of [aux1, sandra, base.personas.charlie.id]) expect((await falla(como(quien, (c) => c.query('select wms.confirmar_salida($1, null)', [s])))).message).toMatch(/No tienes permiso para confirmar salidas/)
    const n = await como(jt, async (c) => (await c.query('select wms.confirmar_salida($1, $2) n', [s, 'tok-1'])).rows[0].n)
    expect(n).toBe(2)
    expect(await saldoEn(p, 'STG-1')).toBe(0)
    expect((await uno('select estado from wms.salidas where id = $1', [s])).estado).toBe('CONFIRMADA')
    expect((await uno('select estado from wms.salida_lineas where id = $1', [linea.id])).estado).toBe('CONFIRMADA')
    // repetir (mismo token, o sin token) no duplica la salida
    expect(await como(jt, async (c) => (await c.query('select wms.confirmar_salida($1, $2) n', [s, 'tok-1'])).rows[0].n)).toBe(0)
    expect((await q(`select 1 from wms.partidas pa join wms.movimientos m on m.id = pa.movimiento_id where m.tipo = 'SALIDA' and pa.producto_id = $1`, [p])).length).toBe(2)
    // el Kardex (y la historia del lote) muestran la salida
    const kardex = await como(jt, async (c) => (await c.query('select tipo_documento, entrada, salida from wms.kardex_filas($1, null, $2, null, null) where not es_saldo_inicial order by orden', [p, logissa])).rows)
    expect(kardex.map((k) => k.tipo_documento)).toEqual(expect.arrayContaining(['Salida']))
    expect(kardex.filter((k) => k.tipo_documento === 'Salida').reduce((t, k) => t + k.salida, 0)).toBe(50)
    // los retornos ya no entran por una zona propia: vuelven como recepción tipo devolución (OS-5)
    expect(await uno(`select to_regprocedure('wms.registrar_retorno(uuid, integer, uuid, text, uuid)') f`)).toMatchObject({ f: null })
  })

  it('los invariantes viven en la base: nadie registra SALIDA, RETORNO ni staging por fuera del flujo', async () => {
    const { p, ols, linea } = await preparado(10)
    await pickear(aux1, ols[0].id, ols[0].cantidad)
    const rack = await idPosicion(base.admin, 'F-1.1')
    const lote = (await uno(`select id from wms.lotes where producto_id = $1 and codigo = 'FL1'`, [p])).id
    const proc = (await uno(`select procedencia_id from wms.saldos where posicion_id = $1 and lote_id = $2`, [rack, lote])).procedencia_id
    const partida = (pos: string, delta: number) => ({ posicion_id: pos, producto_id: p, lote_id: lote, propietario_id: logissa, estado: 'APROBADO' as const, origen: 'CARGA_INICIAL', procedencia_id: proc, delta })
    for (const quien of [jt, sandra, base.personas.charlie.id, base.personas.admin.id, base.personas.katia.id]) {
      for (const tipo of ['SALIDA', 'RETORNO']) {
        const e = await falla(como(quien, (c) => postear(c, tipo, [partida(rack, -1)])))
        expect(e.message, tipo).toMatch(/no habilitado|solo se registran por el flujo de salidas/)
      }
      // mover a mano hacia staging
      const e2 = await falla(como(quien, (c) => postear(c, 'MOVIMIENTO', [partida(rack, -1), partida(stg, 1)])))
      expect(e2.message).toMatch(/solo en las salidas|permiso/)
    }
    // un contexto de salida inventado no sirve
    const e3 = await falla(como(base.personas.admin.id, async (c) => {
      await c.query(`select set_config('wms.salida_ctx', $1, true)`, [JSON.stringify({ paso: randomUUID() })])
      return postear(c, 'SALIDA', [partida(stg, -1)])
    }))
    expect(e3.message).toMatch(/Contexto de salida inválido/)
    // las filas del flujo no se escriben a mano
    for (const sql of [`insert into wms.salida_movimientos (salida_id, linea_id, tipo, cantidad, actor_id) values (gen_random_uuid(), gen_random_uuid(), 'RETORNO', 1, gen_random_uuid())`,
                       `update wms.reservas set cantidad = 999`, `delete from wms.salida_lineas`]) {
      expect((await falla(como(jt, (c) => c.query(sql)))).message, sql).toMatch(/row-level security|permission denied/)
    }
    // pasar a staging más de lo pedido, o retornar más de lo salido, también lo frena el trigger de invariantes (aunque alguien insertara las filas)
    const e4 = await falla(base.admin.query(`insert into wms.salida_movimientos (salida_id, linea_id, tipo, cantidad, actor_id) values ($1, $2, 'STAGING', 11, $3)`, [linea.salida_id, linea.id, jt]))
    expect(e4.message).toMatch(/más de lo pedido/)
    const e5 = await falla(base.admin.query(`insert into wms.salida_movimientos (salida_id, linea_id, tipo, cantidad, actor_id) values ($1, $2, 'RETORNO', 1, $3)`, [linea.salida_id, linea.id, jt]))
    expect(e5.message).toMatch(/no puede superar lo que salió/)
  })

  it('un movimiento de una salida no se revierte a mano', async () => {
    const { ols } = await preparado(10)
    await pickear(aux1, ols[0].id, ols[0].cantidad)
    const mov = await conformar(sandra, ols[0].id)
    const e = await falla(como(base.personas.charlie.id, (c) => c.query('select wms.revertir_movimiento($1, $2)', [mov, 'error'])))
    expect(e.message).toMatch(/pertenece a una salida/)
  })

  it('un conteo no se programa sobre unidades pickeadas o en staging', async () => {
    const p = await producto()
    const { posId } = await sembrar(p, 'F-6.2', 'CNT', en(100), logissa, 20)
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 5 }])
    await asignar(jt, s)
    const op = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [s])).rows[0].id)
    const ol = (await q('select id, cantidad from wms.ordenes_picking_lineas where orden_id = $1', [op]))[0]
    // unidades pickeadas (en tránsito a conformidad): ahí no se programa un conteo.
    await pickear(aux1, ol.id, ol.cantidad)
    const e = await falla(como(base.personas.charlie.id, (c) => c.query('select wms.programar_conteo($1::uuid[], $2)', [[posId], 'prueba'])))
    expect(e.message).toMatch(/unidades de una salida en picking o en staging/)
  })

  it('cancelar libera las reservas si nada salió del rack; después ya no', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'C1', en(100), logissa, 50)
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 40 }])
    await asignar(jt, s)
    expect((await disp(jt, logissa, p))[0].disponible).toBe(10)
    expect((await falla(como(jt, (c) => c.query('select wms.cancelar_salida($1, null)', [s])))).message).toMatch(/necesita un motivo/)
    await como(jt, (c) => c.query('select wms.cancelar_salida($1, $2)', [s, 'el cliente canceló']))
    expect((await disp(jt, logissa, p))[0].disponible).toBe(50)
    expect((await uno('select estado from wms.salidas where id = $1', [s])).estado).toBe('CANCELADA')
    const { s: s2, ols } = await preparado(10)
    await pickear(aux1, ols[0].id, ols[0].cantidad)
    expect((await falla(como(jt, (c) => c.query('select wms.cancelar_salida($1, $2)', [s2, 'x'])))).message).toMatch(/Ya hay unidades pickeadas/)
  })

  it('crear la salida es idempotente por token', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'T1', en(100), logissa, 50)
    const a = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 5 }], null, 'tok-crear')
    const b = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 5 }], null, 'tok-crear')
    expect(b).toBe(a)
    expect(await lineas(a)).toHaveLength(1)
  })
})

describe('permisos y aislamiento de las operaciones de salida', () => {
  it('sin el permiso nadie crea, asigna ni genera: ni el auxiliar, ni Sandra, ni un usuario sin rol', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'P1', en(100), logissa, 10)
    const s = await crear(jt, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 1 }])
    for (const quien of [aux1, sandra, base.personas.sinRol.id, base.personas.auditor.id, base.personas.admin.id]) {
      expect((await falla(crear(quien, 'DISTRIBUCION', 'VENTA', logissa, [{ producto_id: p, cantidad: 1 }]))).message).toMatch(/permiso|Sesión/)
      expect((await falla(asignar(quien, s))).message).toMatch(/permiso/)
      expect((await falla(como(quien, (c) => c.query('select wms.generar_orden_picking($1)', [s])))).message).toMatch(/permiso/)
    }
  })

  it('un usuario de cliente (con el acceso habilitado) no crea ni lee salidas', async () => {
    await base.admin.query(`update wms.parametros set valor = 'true' where clave = 'acceso_clientes_habilitado'`)
    try {
      const cli = randomUUID()
      await base.admin.query('insert into auth.users (id) values ($1)', [cli])
      await base.admin.query(`insert into wms.usuario_roles (user_id, rol, propietario_id) values ($1, 'usuario_cliente', $2)`, [cli, ajr])
      const p = await producto()
      const a = await sembrar(p, 'G-9.4', 'CLI', en(100), ajr, 10)
      expect((await falla(crear(cli, 'CLIENTE', 'VENTA', ajr, [{ producto_id: p, cantidad: 1, lote_id: a.loteId }]))).message).toMatch(/permiso/)
      await crear(jt, 'CLIENTE', 'VENTA', ajr, [{ producto_id: p, cantidad: 1, lote_id: a.loteId }])
      for (const t of ['salidas', 'salida_lineas', 'reservas', 'ordenes_picking', 'ordenes_picking_lineas', 'salida_movimientos', 'cambios_lote_asignado']) {
        expect(await como(cli, async (c) => (await c.query(`select count(*)::int n from wms.${t}`)).rows[0].n), t).toBe(0)
      }
      const d = await falla(como(cli, (c) => c.query('select * from wms.disponibilidad_por_lote($1, null)', [diph])))
      expect(d.message).toMatch(/Sin acceso/)
      // …pero sí ve su propio disponible
      expect(await como(cli, async (c) => (await c.query('select * from wms.disponibilidad_por_lote($1, $2)', [ajr, p])).rows.length)).toBe(1)
    } finally { await base.admin.query(`update wms.parametros set valor = 'false' where clave = 'acceso_clientes_habilitado'`) }
  })

  it('el personal lee las tablas nuevas; sin rol no ve nada', async () => {
    for (const t of ['salidas', 'salida_lineas', 'reservas', 'ordenes_picking']) {
      expect(await como(jt, async (c) => (await c.query(`select count(*)::int n from wms.${t}`)).rows[0].n), t).toBeGreaterThan(0)
      expect(await como(base.personas.sinRol.id, async (c) => (await c.query(`select count(*)::int n from wms.${t}`)).rows[0].n), t).toBe(0)
    }
  })

  it('la migración 0012 es re-ejecutable', async () => {
    const { SQL } = await import('./helpers')
    // la 0012 se reintenta antes de la 0013 (la 0013 le agrega un valor por defecto a editar_asignacion, que la 0012 no puede quitar)
    await base.admin.query('drop function wms.editar_asignacion(uuid, jsonb, text)')
    // la 0017 agregó permisos que la lista de la 0012 no conoce: se quitan para reintentar la 0012 y se vuelven a poner con la 0017
    await base.admin.query(`delete from wms.permisos_rol where accion in ('planificar_ruta', 'registrar_documentacion', 'embalar', 'cargar_ruta', 'liberar_unidad', 'reservar_lote', 'anular_guia', 'solicitar_baja', 'autorizar_baja', 'cerrar_ruta', 'registrar_ls_fr', 'originar_retorno', 'registrar_dictamen_cliente', 'marcar_antecedentes_calidad', 'liberar_stock_propietario')`)
    await base.admin.query(`delete from wms.alertas where tipo in ('PEDIDO_CAMBIADO', 'DOCUMENTO_VENCIDO', 'DOCUMENTACION_INCOMPLETA', 'LOTE_EN_RESERVA', 'BAJA_POR_AUTORIZAR', 'BAJA_POR_TRASLADAR', 'RETORNO_POR_AUTORIZAR', 'DICTAMEN_POR_CONFIRMAR')`) // tipos que la lista de la 0012 no conoce
    await base.admin.query(SQL.m0012())
    await base.admin.query(SQL.m0012())
    await base.admin.query(SQL.m0013()) // la 0013 va siempre después de la 0012 (y también se puede repetir)
    await base.admin.query(SQL.m0013())
    await base.admin.query(SQL.m0017())
    await base.admin.query(SQL.m0017())
    await base.admin.query(SQL.m0018())
    await base.admin.query(SQL.m0018())
    await base.admin.query(SQL.m0019())
    await base.admin.query(SQL.m0019())
    await base.admin.query(SQL.m0020())
    await base.admin.query(SQL.m0020())
    await base.admin.query(SQL.m0021())
    await base.admin.query(SQL.m0021())
    await base.admin.query(SQL.m0022())
    await base.admin.query(SQL.m0022())
    await base.admin.query(SQL.m0023())
    await base.admin.query(SQL.m0023())
    await base.admin.query(SQL.m0024())
    await base.admin.query(SQL.m0024())
    await base.admin.query(SQL.m0025())
    await base.admin.query(SQL.m0025())
    await base.admin.query(SQL.m0026())
    await base.admin.query(SQL.m0026()) // OS-6: re-ejecutable
    await base.admin.query(SQL.m0027())
    await base.admin.query(SQL.m0027())
    expect((await uno(`select count(*)::int n from wms.tipos_movimiento where codigo in ('SALIDA', 'RETORNO') and habilitado`)).n).toBe(1)  // el retorno ya no es un movimiento propio (OS-1)
  })
})
