// S7 (migración 0020): embalaje en bultos («1 de 3»), reparto exacto de lo confirmado, reapertura con motivo y «listo para carga».
import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let aux1: string
let sandra: string
let dt: string
let n = 0

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

async function persona(rol: string | string[]): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  for (const r of Array.isArray(rol) ? rol : [rol]) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, r])
  return id
}
async function producto(): Promise<string> {
  n += 1
  const id = (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [`EM-${n}-${randomUUID().slice(0, 4)}`, `Producto embalaje ${n}`])).id as string
  await base.admin.query(`insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, estado_validacion, creado_por, validado_por, validado_en) values ($1, 'EG-9', '2031-01-01', 'VALIDADO', $2, $2, now())`, [id, dt])
  await subir('REGISTRO_SANITARIO', id)
  return id
}
const subir = (tipo: string, alcance: string) => como(dt, (c) => c.query('select wms.subir_documento_regulatorio($1, $2, $3, $4, $5, $6, null, null, null, null)', [tipo, alcance, 'doc.pdf', `docs/${randomUUID()}.pdf`, sha(randomUUID()), 1234]))
async function sembrar(prod: string, pos: string, lote: string, vence: string, cantidad: number) {
  const posId = await idPosicion(base.admin, pos)
  const existente = await uno(`select id from wms.lotes where producto_id = $1 and codigo = $2 and propietario_id = $3`, [prod, lote, logissa])
  const loteId = existente?.id ?? (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, $3, $4) returning id`, [prod, lote, vence, logissa])).id
  await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: logissa, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: cantidad }]))
  return loteId as string
}
/** Salida con picking completo; con `conforme` también la conformidad. */
async function salida(prod: string, cantidad: number, conforme = true) {
  const id = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb) id`, [logissa, JSON.stringify([{ producto_id: prod, cantidad }])])).rows[0].id as string)
  await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [id]))
  const orden = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [id])).rows[0].id as string)
  const lineas = await q('select id, cantidad from wms.ordenes_picking_lineas where orden_id = $1 order by id', [orden])
  for (const l of lineas) await como(aux1, (c) => c.query('select wms.registrar_picking($1, $2, $3, $4)', [l.id, 'PICKEADA', l.cantidad, null]))
  if (conforme) for (const l of lineas) await como(sandra, (c) => c.query('select wms.dar_conformidad($1, $2, $3, null, $4)', [l.id, 'CONFORME', null, null]))
  const numero = (await uno('select numero from wms.salidas where id = $1', [id])).numero as string
  return { id, numero }
}
const confirmado = (salidaId: string) => q('select * from wms._confirmado_por_lote($1)', [salidaId]) as Promise<{ linea_id: string; lote_id: string; cantidad: number }[]>
const embalar = (quien: string, salidaId: string, bultos: unknown) => como(quien, async (c) => (await c.query('select wms.embalar_salida($1, $2::jsonb) n', [salidaId, JSON.stringify(bultos)])).rows[0].n as number)
const bultosDe = (salidaId: string) => q(`select secuencia, total, codigo, estado from wms.bultos where salida_id = $1 order by embalado_en, secuencia`, [salidaId])

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  dt = base.personas.katia.id
  jt = await persona('jefe_transporte'); aux1 = await persona('auxiliar'); sandra = await persona(['asistente_dt', 'conformidad_despacho'])
  await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-7', 'S', 'PISO', 'DESPACHO')`)
  await base.admin.query(`update wms.parametros set valor = 'STG-7' where clave = 'posicion_despacho_defecto'`)
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('embalar en bultos', () => {
  it('reparte lo confirmado (dos lotes) en 3 bultos «1 de 3»; el código de cada bulto es el del QR', async () => {
    const p = await producto()
    const la = await sembrar(p, 'F-6.1', 'LOTE-EA', en(120), 6)
    const lb = await sembrar(p, 'F-6.2', 'LOTE-EB', en(300), 20)
    const s = await salida(p, 10)
    const c = await confirmado(s.id)
    const linea = c[0].linea_id
    expect(c.map((x) => x.cantidad).sort()).toEqual([4, 6])
    const n = await embalar(aux1, s.id, [
      { contenido: [{ linea_id: linea, lote_id: la, cantidad: 4 }] },
      { contenido: [{ linea_id: linea, lote_id: la, cantidad: 2 }, { linea_id: linea, lote_id: lb, cantidad: 1 }] },
      { contenido: [{ linea_id: linea, lote_id: lb, cantidad: 3 }] },
    ])
    expect(n).toBe(3)
    expect(await bultosDe(s.id)).toEqual([
      { secuencia: 1, total: 3, codigo: `${s.numero}-B1`, estado: 'EMBALADO' }, { secuencia: 2, total: 3, codigo: `${s.numero}-B2`, estado: 'EMBALADO' }, { secuencia: 3, total: 3, codigo: `${s.numero}-B3`, estado: 'EMBALADO' },
    ])
    expect((await uno(`select count(*)::int n from wms.audit_events where evento = 'salida_embalada' and entidad_id = $1`, [s.id])).n).toBe(1)
  })

  it('no sobra ni falta una unidad, ningún bulto va vacío, el lote tiene que ser de lo confirmado y un lote no se repite en el mismo bulto', async () => {
    const p = await producto()
    const l = await sembrar(p, 'F-6.3', 'LOTE-EC', en(200), 50)
    const otro = await sembrar(await producto(), 'F-6.4', 'LOTE-EX', en(200), 5)
    const s = await salida(p, 10)
    const [{ linea_id: linea }] = await confirmado(s.id)
    const err = async (b: unknown) => (await falla(embalar(aux1, s.id, b))).message
    expect(await err([{ contenido: [{ linea_id: linea, lote_id: l, cantidad: 9 }] }])).toMatch(/Faltan 1 unidades del lote LOTE-EC/)
    expect(await err([{ contenido: [{ linea_id: linea, lote_id: l, cantidad: 11 }] }])).toMatch(/Sobran 1 unidades del lote LOTE-EC: solo se confirmaron 10/)
    expect(await err([{ contenido: [{ linea_id: linea, lote_id: l, cantidad: 10 }] }, { contenido: [] }])).toMatch(/El bulto 2 está vacío/)
    expect(await err([{ contenido: [{ linea_id: linea, lote_id: l, cantidad: 0 }] }])).toMatch(/mayor que cero/)
    expect(await err([{ contenido: [{ linea_id: linea, lote_id: otro, cantidad: 10 }] }])).toMatch(/no está en lo confirmado/)
    expect(await err([{ contenido: [{ linea_id: linea, lote_id: l, cantidad: 5 }, { linea_id: linea, lote_id: l, cantidad: 5 }] }])).toMatch(/repite un lote/)
    expect(await err([])).toMatch(/1 a 99 bultos/)
    expect(await err(Array.from({ length: 100 }, () => ({ contenido: [{ linea_id: linea, lote_id: l, cantidad: 1 }] })))).toMatch(/1 a 99 bultos/)
    expect(await bultosDe(s.id)).toEqual([])
  })

  it('solo con todo el pedido conforme; una sola vez; y quienes pueden: auxiliar, Almacén y Transporte (no la asistente de DT ni quien no tiene rol)', async () => {
    const p = await producto()
    const l = await sembrar(p, 'F-7.1', 'LOTE-ED', en(200), 50)
    const sin = await salida(p, 5, false)
    const [{ linea_id: lineaSin }] = await q('select linea_id from wms.ordenes_picking_lineas ol join wms.ordenes_picking o on o.id = ol.orden_id where o.salida_id = $1', [sin.id])
    expect((await falla(embalar(aux1, sin.id, [{ contenido: [{ linea_id: lineaSin, lote_id: l, cantidad: 5 }] }]))).message).toMatch(/cuando todo el pedido tiene la conformidad/)
    const s = await salida(p, 5)
    const [{ linea_id: linea }] = await confirmado(s.id)
    const bultos = [{ contenido: [{ linea_id: linea, lote_id: l, cantidad: 5 }] }]
    for (const quien of [sandra, base.personas.sinRol.id, base.personas.auditor.id]) expect((await falla(embalar(quien, s.id, bultos))).message, quien).toMatch(/No tienes permiso para embalar/)
    await embalar(jt, s.id, bultos)
    expect((await falla(embalar(aux1, s.id, bultos))).message).toMatch(/ya está embalado/)
  })

  it('los bultos y su contenido no se editan ni se borran', async () => {
    const p = await producto()
    const l = await sembrar(p, 'F-7.2', 'LOTE-EE', en(200), 50)
    const s = await salida(p, 5)
    const [{ linea_id: linea }] = await confirmado(s.id)
    await embalar(aux1, s.id, [{ contenido: [{ linea_id: linea, lote_id: l, cantidad: 5 }] }])
    const b = await uno('select id from wms.bultos where salida_id = $1', [s.id])
    expect((await falla(base.admin.query(`update wms.bultos set total = 2 where id = $1`, [b.id]))).message).toMatch(/no se edita/)
    expect((await falla(base.admin.query('delete from wms.bultos where id = $1', [b.id]))).message).toMatch(/no se borra/)
    expect((await falla(base.admin.query('update wms.bulto_contenido set cantidad = 1 where bulto_id = $1', [b.id]))).message).toMatch(/no se edita/)
    expect((await falla(base.admin.query('delete from wms.bulto_contenido where bulto_id = $1', [b.id]))).message).toMatch(/no se edita/)
  })
})

describe('reabrir el embalaje', () => {
  it('pide motivo, anula los bultos (queda la historia) y se vuelve a embalar con otro reparto', async () => {
    const p = await producto()
    const l = await sembrar(p, 'F-7.3', 'LOTE-EF', en(200), 50)
    const s = await salida(p, 8)
    const [{ linea_id: linea }] = await confirmado(s.id)
    await embalar(aux1, s.id, [{ contenido: [{ linea_id: linea, lote_id: l, cantidad: 8 }] }])
    expect((await falla(como(aux1, (c) => c.query('select wms.reabrir_embalaje($1, $2)', [s.id, '  '])))).message).toMatch(/por qué se reabre/)
    expect((await falla(como(sandra, (c) => c.query('select wms.reabrir_embalaje($1, $2)', [s.id, 'x'])))).message).toMatch(/No tienes permiso para reabrir el embalaje/)
    await como(aux1, (c) => c.query('select wms.reabrir_embalaje($1, $2)', [s.id, 'Se partió una caja']))
    expect(await uno(`select estado, motivo_anulacion from wms.bultos where salida_id = $1`, [s.id])).toMatchObject({ estado: 'ANULADO', motivo_anulacion: 'Se partió una caja' })
    expect((await falla(como(aux1, (c) => c.query('select wms.reabrir_embalaje($1, $2)', [s.id, 'otra vez'])))).message).toMatch(/no está embalado/)
    await embalar(aux1, s.id, [{ contenido: [{ linea_id: linea, lote_id: l, cantidad: 5 }] }, { contenido: [{ linea_id: linea, lote_id: l, cantidad: 3 }] }])
    expect((await bultosDe(s.id)).map((b) => `${b.estado}:${b.codigo}`)).toEqual([`ANULADO:${s.numero}-B1`, `EMBALADO:${s.numero}-B1`, `EMBALADO:${s.numero}-B2`])
  })
})

describe('listo para carga', () => {
  it('exige conforme + embalado + guía vigente + paquete documental completo, todo a la vez', async () => {
    const p = await producto()
    const l = await sembrar(p, 'F-7.4', 'LOTE-EG', en(200), 50)
    const s = await salida(p, 5)
    const [{ linea_id: linea }] = await confirmado(s.id)
    const listo = () => como(jt, async (c) => (await c.query('select wms.listo_para_carga($1) r', [s.id])).rows[0].r as boolean)
    expect(await listo()).toBe(false)                       // conforme, pero sin embalar, sin guía y sin COA
    await embalar(aux1, s.id, [{ contenido: [{ linea_id: linea, lote_id: l, cantidad: 5 }] }])
    expect(await listo()).toBe(false)                       // embalado; faltan guía y COA
    await como(jt, (c) => c.query('select wms.registrar_gre($1, $2, null)', [s.id, 'T010-00000001']))
    expect(await listo()).toBe(false)                       // guía registrada; falta el COA
    await subir('COA', l)
    expect(await listo()).toBe(true)                        // todo
    await como(aux1, (c) => c.query('select wms.reabrir_embalaje($1, $2)', [s.id, 'Rehacer']))
    expect(await listo()).toBe(false)                       // al reabrir el embalaje deja de estarlo
  })
})

describe('migración 0020', () => {
  it('es re-ejecutable', async () => {
    const { SQL } = await import('./helpers')
    await base.admin.query(SQL.m0020()); await base.admin.query(SQL.m0020())
    expect((await uno(`select count(*)::int n from wms.permisos_rol where accion = 'embalar'`)).n).toBe(4)
  })
})
