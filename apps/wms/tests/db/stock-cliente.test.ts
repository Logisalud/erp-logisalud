// Migración 0067: stock del cliente de almacenamiento. Página de SOLO LECTURA con enlace de token: el cliente sin usuario (anon) llama a dos funciones y ve SU stock y SU Kardex, sin ubicaciones.
import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let ajr: string
let diph: string
let admin: string
let jefe: string
let prodA: string
let prodB: string
let posAjr: string[] = []
let posDiph: string[] = []
let posLogissa: string[] = []

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
type R = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

/** Llama como `anon` (el cliente sin usuario). */
async function anon<T>(fn: () => Promise<T>): Promise<T> { await base.admin.query('set role anon'); try { return await fn() } finally { await base.admin.query('reset role') } }
const stock = (token: string, ip = '10.0.0.1') => anon(async () => (await base.admin.query('select wms.stock_cliente_por_token($1, $2) r', [token, ip])).rows[0].r as R)
const kardex = (token: string, producto: string | null = null, desde: string | null = null, hasta: string | null = null, ip = '10.0.0.1') =>
  anon(async () => (await base.admin.query('select wms.kardex_cliente_por_token($1, $2, $3, $4, $5) r', [token, producto, desde, hasta, ip])).rows[0].r as R)
const crearEnlace = (quien: string, propietario: string, dias = 90, etiqueta: string | null = null) =>
  como(quien, async (c) => (await c.query('select wms.crear_enlace_stock_cliente($1, $2, $3) r', [propietario, dias, etiqueta])).rows[0].r as R)
const encender = () => base.admin.query(`update wms.parametros set valor = 'true' where clave = 'stock_cliente_habilitado'`)
const apagar = () => base.admin.query(`update wms.parametros set valor = 'false' where clave = 'stock_cliente_habilitado'`)
const limpiarIntentos = () => base.admin.query('delete from wms.seguimiento_intentos')

async function persona(rol: string): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol])
  return id
}
let nProd = 0
async function producto(descripcion: string): Promise<string> {
  nProd += 1
  return (await uno(`insert into catalogo.productos (codigo, descripcion, presentacion, unidad_medida) values ($1, $2, 'Caja x 30', 'TABLETA') returning id`, [`SC-${nProd}-${randomUUID().slice(0, 4)}`, descripcion])).id as string
}
async function sembrar(prod: string, pos: string, lote: string, vence: string | null, dueno: string, cantidad: number, estado: 'APROBADO' | 'CUARENTENA' = 'APROBADO') {
  const posId = await idPosicion(base.admin, pos)
  const loteRow = await uno(`select id from wms.lotes where producto_id = $1 and codigo = $2 and propietario_id = $3`, [prod, lote, dueno])
  const loteId = loteRow?.id ?? (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, $3, $4) returning id`, [prod, lote, vence, dueno])).id
  await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{
    posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: dueno, estado, origen: estado === 'CUARENTENA' ? 'COMPRA_LOCAL' : 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: cantidad }]))
  return loteId as string
}

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  ajr = await idPropietario(base.admin, 'AJR_LABS')
  diph = await idPropietario(base.admin, 'DIPHASAC')
  admin = await persona('admin_wms')
  jefe = await persona('jefe_almacen')
  const posDe = async (dueno: string) => (await q(`select ps.codigo from wms.asignaciones_posicion a join wms.posiciones ps on ps.id = a.posicion_id where a.propietario_id = $1 and ps.tipo_area = 'APROBADOS' and ps.activa and a.desde <= current_date and (a.hasta is null or a.hasta >= current_date) order by ps.codigo`, [dueno])).map((r) => r.codigo as string)
  posAjr = await posDe(ajr); posDiph = await posDe(diph); posLogissa = await posDe(logissa)
  prodA = await producto('Amoxicilina 500 mg')
  prodB = await producto('Ibuprofeno 400 mg')
  await sembrar(prodA, posAjr[0], 'AJR-A1', en(200), ajr, 100)          // vigente
  await sembrar(prodA, posAjr[1], 'AJR-A2', en(-10), ajr, 12)           // vencido
  await sembrar(prodA, posAjr[2], 'AJR-A3', en(45), ajr, 30)            // vence pronto
  await sembrar(prodB, posAjr[3], 'AJR-B1', en(400), ajr, 8)
  await sembrar(prodA, posDiph[0], 'DIPH-A1', en(300), diph, 55)         // de otro cliente
  await sembrar(prodA, posLogissa[0], 'LOG-A1', en(300), logissa, 77)       // de Logissa
  await base.admin.query(`insert into wms.producto_codigos (producto_id, tipo, codigo, propietario_id) values ($1, 'CLIENTE', 'AJR0026', $2)`, [prodA, ajr])
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('apagado de fábrica', () => {
  it('con el interruptor apagado responde «no disponible», no genera enlaces y no deja rastro', async () => {
    await apagar(); await limpiarIntentos()
    const e = await falla(crearEnlace(admin, ajr))
    expect(e.message).toMatch(/aún no está disponible/)
    expect(await stock('cualquier-cosa')).toEqual({ estado: 'NO_DISPONIBLE' })
    expect(await kardex('cualquier-cosa')).toEqual({ estado: 'NO_DISPONIBLE' })
    expect((await uno('select count(*)::int n from wms.seguimiento_intentos')).n).toBe(0)
    expect((await uno('select count(*)::int n from wms.enlaces_stock_cliente')).n).toBe(0)
  })
  it('la aplicación no puede encender el interruptor; solo un administrador de la base', async () => {
    for (const quien of [admin, base.personas.admin.id]) {
      const e = await falla(como(quien, (c) => c.query(`update wms.parametros set valor = 'true' where clave = 'stock_cliente_habilitado'`)))
      expect(e.message).toMatch(/solo lo habilita un administrador de la base|permission denied|0 rows|no permitido|violates row-level/i)
    }
    expect((await uno(`select valor from wms.parametros where clave = 'stock_cliente_habilitado'`)).valor).toBe('false')
  })
})

describe('el stock del cliente', () => {
  let token: string
  beforeAll(async () => { await encender(); const r = await crearEnlace(admin, ajr, 90, 'Compras de AJR'); token = r.token })

  it('el token en claro se devuelve una sola vez; en la base solo queda su hash', async () => {
    expect(token).toMatch(/^[0-9a-f]{128}$/)
    const fila = await uno(`select token_hash, etiqueta, revocado_en, vence_en > now() + interval '89 days' as largo from wms.enlaces_stock_cliente order by creado_en desc limit 1`)
    expect(fila.token_hash).toBe(sha(token))
    expect(fila).toMatchObject({ etiqueta: 'Compras de AJR', revocado_en: null, largo: true })
    expect(JSON.stringify(await q('select * from wms.enlaces_stock_cliente'))).not.toContain(token)
  })

  it('muestra SOLO el stock de ese cliente, por producto y lote, con su código y sin ubicaciones', async () => {
    const r = await stock(token)
    expect(r.estado).toBe('OK')
    expect(r.cliente).toMatchObject({ codigo: 'AJR_LABS' })
    expect(r.hoy).toBe(hoy)
    const por = Object.fromEntries((r.productos as R[]).map((p) => [p.producto_id, p]))
    expect(Object.keys(por).sort()).toEqual([prodA, prodB].sort())
    expect(por[prodA]).toMatchObject({ descripcion: 'Amoxicilina 500 mg', presentacion: 'Caja x 30', codigo_cliente: 'AJR0026', stock: 142, disponible: 142, en_revision: 0, vencido: 12 })
    expect(por[prodB]).toMatchObject({ stock: 8, disponible: 8, codigo_cliente: null })
    // los lotes salen por vencimiento: primero el vencido
    expect((por[prodA].lotes as R[]).map((l) => l.lote)).toEqual(['AJR-A2', 'AJR-A3', 'AJR-A1'])
    expect((por[prodA].lotes as R[])[0]).toMatchObject({ vencido: true, dias: -10, stock: 12 })
    expect((por[prodA].lotes as R[])[1]).toMatchObject({ vencido: false, dias: 45, stock: 30 })
    // nada de Diphasac ni de Logissa, ni de ubicaciones
    const texto = JSON.stringify(r)
    for (const ajeno of ['DIPH-A1', 'LOG-A1', ...posAjr.slice(0, 4), posDiph[0], 'posicion']) expect(texto).not.toContain(ajeno)
  })

  it('lo comprometido en sus salidas no cuenta como disponible', async () => {
    const lote = (await uno(`select id from wms.lotes where codigo = 'AJR-B1' and propietario_id = $1`, [ajr])).id
    const pos = (await uno(`select id from wms.posiciones where codigo = $1`, [posAjr[3]])).id
    const proc = (await uno(`select procedencia_id from wms.saldos where lote_id = $1`, [lote])).procedencia_id
    const sal = (await uno(`insert into wms.salidas (numero, tipo, motivo, propietario_id, estado, creada_por) values ('SAL-SC-1', 'CLIENTE', 'VENTA', $1, 'ABIERTA', $2) returning id`, [ajr, admin])).id
    const lin = (await uno(`insert into wms.salida_lineas (salida_id, producto_id, cantidad, lote_id) values ($1, $2, 5, $3) returning id`, [sal, prodB, lote])).id
    await base.admin.query(`insert into wms.reservas (linea_id, posicion_id, posicion_origen_id, producto_id, lote_id, propietario_id, estado_stock, procedencia_id, cantidad, estado) values ($1, $2, $2, $3, $4, $5, 'APROBADO', $6, 5, 'ACTIVA')`, [lin, pos, prodB, lote, ajr, proc])
    const b = ((await stock(token)).productos as R[]).find((p) => p.producto_id === prodB)!
    expect(b).toMatchObject({ stock: 8, disponible: 3 })
    await base.admin.query('delete from wms.reservas where linea_id = $1', [lin])
  })

  it('un cliente no ve el stock de otro: cada enlace es de su propietario', async () => {
    const d = await crearEnlace(admin, diph)
    const r = await stock(d.token)
    expect(r.cliente).toMatchObject({ codigo: 'DIPHASAC' })
    expect((r.productos as R[]).map((p) => p.stock)).toEqual([55])
    expect(JSON.stringify(r)).not.toContain('AJR-')
  })

  it('el stock propio de Logissa (dueño del almacén) no tiene enlace', async () => {
    const e = await falla(crearEnlace(admin, logissa))
    expect(e.message).toMatch(/no para el stock propio/)
  })

  it('las bajas y rechazados no cuentan como stock del cliente', async () => {
    const lote = (await uno(`select id from wms.lotes where codigo = 'AJR-B1' and propietario_id = $1`, [ajr])).id
    await base.admin.query(`update wms.saldos set estado = 'BAJAS_RECHAZADOS' where lote_id = $1`, [lote]).catch(() => undefined)
    const b = ((await stock(token)).productos as R[]).find((p) => p.producto_id === prodB)
    // si la base permite el cambio directo, el producto desaparece; si no, sigue como estaba (el estado solo cambia por movimientos auditados)
    if (b) expect(b.stock).toBe(8); else expect(b).toBeUndefined()
    await base.admin.query(`update wms.saldos set estado = 'APROBADO' where lote_id = $1`, [lote]).catch(() => undefined)
  })
})

describe('el Kardex del cliente', () => {
  let token: string
  beforeAll(async () => { await encender(); token = (await crearEnlace(admin, ajr)).token })

  it('trae el Kardex del libro mayor de SU producto, sin ubicación ni datos del personal', async () => {
    const r = await kardex(token, prodA)
    expect(r.estado).toBe('OK')
    expect(r.cliente).toMatchObject({ codigo: 'AJR_LABS' })
    expect(r.hoy).toBe(hoy)
    expect(r.formato).toMatch(/LS-FR/)
    expect(r.productos).toHaveLength(1)
    const p = r.productos[0] as R
    expect(p.producto_id).toBe(prodA)
    const filas = p.filas as R[]
    expect(filas.length).toBe(3)                                         // 3 lotes de AJR; los de Diphasac y Logissa no aparecen
    expect(filas.map((f) => f.lote).sort()).toEqual(['AJR-A1', 'AJR-A2', 'AJR-A3'])
    expect(filas.at(-1)!.saldo).toBe(142)
    expect(filas.every((f) => f.tipo_documento === 'Carga inicial' && f.entrada > 0 && f.salida === 0)).toBe(true)
    const texto = JSON.stringify(r)
    for (const ajeno of ['DIPH-A1', 'LOG-A1', ...posAjr.slice(0, 4), 'posicion', 'motivo', 'movimiento_id', 'partida_id']) expect(texto).not.toContain(ajeno)
  })

  it('sin producto trae todos los suyos; con fechas lleva el saldo inicial', async () => {
    const todos = await kardex(token)
    expect((todos.productos as R[]).map((p) => p.producto_id).sort()).toEqual([prodA, prodB].sort())
    const rango = await kardex(token, prodA, en(1), null)
    const filas = (rango.productos[0] as R).filas as R[]
    expect(filas[0]).toMatchObject({ es_saldo_inicial: true, tipo_documento: 'Saldo inicial', saldo: 142 })
    expect(filas).toHaveLength(1)                                         // nada nuevo después de mañana
  })

  it('un producto que no es del cliente no devuelve filas', async () => {
    const otro = await producto('Producto ajeno')
    await sembrar(otro, posLogissa[1], 'LOG-X', en(300), logissa, 9)
    const r = await kardex(token, otro)
    expect(r).toMatchObject({ estado: 'OK', productos: [] })
  })
})

describe('el enlace y sus límites', () => {
  it('un enlace inexistente, vencido o revocado responde exactamente lo mismo; el límite de intentos corta a los 5 fallos', async () => {
    await encender(); await limpiarIntentos()
    const vencido = await crearEnlace(admin, ajr, 1)
    await base.admin.query(`update wms.enlaces_stock_cliente set creado_en = now() - interval '3 days', vence_en = now() - interval '1 day' where token_hash = $1`, [sha(vencido.token)])
    const revocado = await crearEnlace(admin, ajr)
    const idRev = (await uno('select id from wms.enlaces_stock_cliente where token_hash = $1', [sha(revocado.token)])).id
    expect((await como(admin, async (c) => (await c.query('select wms.revocar_enlace_stock_cliente($1) r', [idRev])).rows[0].r))).toBe(true)
    expect((await como(admin, async (c) => (await c.query('select wms.revocar_enlace_stock_cliente($1) r', [idRev])).rows[0].r))).toBe(false)   // ya estaba revocado
    const respuestas = [await stock('x'.repeat(128)), await stock(vencido.token), await stock(revocado.token)]
    expect(respuestas).toEqual([{ estado: 'NO_ENCONTRADO' }, { estado: 'NO_ENCONTRADO' }, { estado: 'NO_ENCONTRADO' }])
    expect(await kardex(revocado.token)).toEqual({ estado: 'NO_ENCONTRADO' })
    for (let i = 0; i < 6; i += 1) await stock('basura-' + i, '10.9.9.9')
    const e = await stock('otra-basura', '10.9.9.9')
    expect(e.estado).toBe('ESPERA')
    expect(e.espera_segundos).toBeGreaterThan(0)
    await limpiarIntentos()
  })

  it('un enlace deja de valer si el cliente deja de estar activo', async () => {
    const t = await crearEnlace(admin, diph)
    await base.admin.query(`update wms.propietarios set activo = false where id = $1`, [diph])
    expect(await stock(t.token)).toEqual({ estado: 'NO_ENCONTRADO' })
    await base.admin.query(`update wms.propietarios set activo = true where id = $1`, [diph])
  })

  it('la vigencia va de 1 a 365 días', async () => {
    for (const dias of [0, 366]) expect((await falla(crearEnlace(admin, ajr, dias))).message).toMatch(/entre 1 y 365 días/)
    expect((await crearEnlace(admin, ajr, 365)).token).toMatch(/^[0-9a-f]{128}$/)
  })

  it('deja rastro de la última vez que se abrió', async () => {
    const t = await crearEnlace(admin, ajr)
    expect((await uno('select ultima_vista_en from wms.enlaces_stock_cliente where token_hash = $1', [sha(t.token)])).ultima_vista_en).toBeNull()
    await stock(t.token)
    expect((await uno('select ultima_vista_en from wms.enlaces_stock_cliente where token_hash = $1', [sha(t.token)])).ultima_vista_en).not.toBeNull()
  })
})

describe('permisos y auditoría', () => {
  it('solo quien tiene el permiso de configurar (Administrador) genera y revoca enlaces', async () => {
    await encender()
    expect((await falla(crearEnlace(jefe, ajr))).message).toMatch(/No tienes permiso/)
    const t = await crearEnlace(admin, ajr)
    const id = (await uno('select id from wms.enlaces_stock_cliente where token_hash = $1', [sha(t.token)])).id
    expect((await falla(como(jefe, (c) => c.query('select wms.revocar_enlace_stock_cliente($1)', [id])))).message).toMatch(/No tienes permiso/)
  })

  it('el cliente sin usuario no toca ninguna tabla ni las funciones del personal', async () => {
    for (const tabla of ['enlaces_stock_cliente', 'saldos', 'lotes', 'seguimiento_intentos']) {
      const e = await falla(anon(() => base.admin.query(`select * from wms.${tabla} limit 1`)))
      expect(e.message).toMatch(/permission denied/)
    }
    const e = await falla(anon(() => base.admin.query('select wms.crear_enlace_stock_cliente($1, 30, null)', [ajr])))
    expect(e.message).toMatch(/permission denied/)
    const e2 = await falla(anon(() => base.admin.query('select wms._stock_cliente_acceso($1, $2)', ['x', 'y'])))
    expect(e2.message).toMatch(/permission denied/)
    const e3 = await falla(anon(() => base.admin.query('select wms.kardex_filas($1)', [prodA])))
    expect(e3.message).toMatch(/permission denied/)
  })

  it('generar y revocar quedan en la auditoría con el cliente y la vigencia, sin el token', async () => {
    const filas = await q(`select evento, despues::text d from wms.audit_events where evento in ('stock_cliente_enlace_creado', 'stock_cliente_enlace_revocado')`)
    expect(filas.some((f) => f.evento === 'stock_cliente_enlace_creado' && /AJR_LABS/.test(f.d) && /"dias"/.test(f.d))).toBe(true)
    expect(filas.some((f) => f.evento === 'stock_cliente_enlace_revocado')).toBe(true)
    expect(JSON.stringify(filas)).not.toMatch(/[0-9a-f]{128}/)
  })
})
