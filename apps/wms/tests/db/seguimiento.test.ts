// Fase 4 · P9 (migración 0047): seguimiento para el cliente. APAGADO en el piloto; con el interruptor y fuera del piloto: solo hitos con fecha y hora, límite de intentos y enlace con token (solo hash).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla } from './helpers'

let base: BaseDePrueba
let jt: string
const RUC = '20512345671'
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
type R = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
/** Llama como `anon` (el cliente sin usuario). */
async function anon<T>(fn: () => Promise<T>): Promise<T> { await base.admin.query('set role anon'); try { return await fn() } finally { await base.admin.query('reset role') } }
const consultar = (pedido: string, ruc: string, ip = '10.0.0.1') => anon(async () => (await base.admin.query('select wms.seguimiento_consultar($1, $2, $3) r', [pedido, ruc, ip])).rows[0].r as R)
const porToken = (token: string, ip = '10.0.0.1') => anon(async () => (await base.admin.query('select wms.seguimiento_por_token($1, $2) r', [token, ip])).rows[0].r as R)
const crearEnlace = (quien: string, pedido: string, dias = 30) => como(quien, async (c) => (await c.query('select wms.crear_enlace_seguimiento($1, $2) r', [pedido, dias])).rows[0].r as R)
const limpiarIntentos = () => base.admin.query('delete from wms.seguimiento_intentos')
const encender = async () => { await base.admin.query(`update wms.parametros set valor = 'no' where clave = 'modo_piloto'`); await base.admin.query(`update wms.parametros set valor = 'true' where clave = 'seguimiento_cliente_habilitado'`) }
const apagar = async () => { await base.admin.query(`update wms.parametros set valor = 'si' where clave = 'modo_piloto'`); await base.admin.query(`update wms.parametros set valor = 'false' where clave = 'seguimiento_cliente_habilitado'`) }

beforeAll(async () => {
  base = await crearBaseDePrueba({ piloto: true })
  jt = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [jt])
  await base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'jefe_transporte')`, [jt])
  const ped = (n: number) => ({ pedidoId: `sg-${n}`, numero: `PED-SG${n}`, version: 1, estado: 'READY_FOR_OPERATIONS', fecha: '2026-11-03', modificadoEn: '2026-11-03T08:00:00Z', cliente: { id: 'c1', nombre: 'Botica', ruc: RUC, direccion: 'Av. Secreta 123' }, lineas: [{ lineaId: 'l-1', productoCodigo: 'T-DAPA', descripcion: 'Dapagliflozina', cantidad: 10 }], condicionPago: 'Crédito 30 días' })
  await como(jt, (c) => c.query('select wms.registrar_importacion_pedidos($1, $2::jsonb, null)', ['seguimiento.test', JSON.stringify([ped(1), ped(2)])]))
  // un pedido que ya va en ruta y se entregó (para ver la línea de tiempo completa)
  const pd = await uno(`select id from wms.pedidos_despacho where pedido_id = 'sg-2'`)
  const ruta = (await uno(`insert into wms.rutas (numero, fecha, estado, creada_por, salio_en) values ('RUT-SG-1', current_date, 'EN_RUTA', $1, now()) returning id`, [jt])).id
  const parada = (await uno(`insert into wms.ruta_paradas (ruta_id, secuencia, pedido_id, pedido_despacho_id) values ($1, 1, 'sg-2', $2) returning id`, [ruta, pd.id])).id
  await base.admin.query(`insert into wms.ruta_paradas_eventos (parada_id, ruta_id, evento, recibio_nombre, recibio_documento, foto_ref, foto_hash, por) values ($1, $2, 'ENTREGADO', 'María Pérez', '12345678', 'entregas/x.jpg', $3, $4)`, [parada, ruta, 'a'.repeat(64), jt])
})
afterAll(async () => { await base?.cerrar() })

describe('apagado en el piloto', () => {
  it('con modo_piloto = si responde «no disponible», no genera enlaces y no deja rastro (ni intentos ni tokens), aunque el interruptor esté encendido', async () => {
    for (const interruptor of ['false', 'true']) {
      await base.admin.query(`update wms.parametros set valor = $1 where clave = 'seguimiento_cliente_habilitado'`, [interruptor])
      expect(await consultar('PED-SG1', RUC)).toEqual({ estado: 'NO_DISPONIBLE' })
      expect(await porToken('x'.repeat(64))).toEqual({ estado: 'NO_DISPONIBLE' })
      expect((await falla(crearEnlace(jt, 'PED-SG1'))).message).toMatch(/Seguimiento aún no disponible/)
    }
    expect(Number((await uno('select count(*)::int n from wms.seguimiento_tokens')).n)).toBe(0)
    expect(Number((await uno('select count(*)::int n from wms.seguimiento_intentos')).n)).toBe(0)
    await apagar()
  })
  it('fuera del piloto pero con el interruptor apagado (el valor de fábrica) tampoco está disponible', async () => {
    await base.admin.query(`update wms.parametros set valor = 'no' where clave = 'modo_piloto'`)
    expect((await uno(`select valor from wms.parametros where clave = 'seguimiento_cliente_habilitado'`)).valor).toBe('false')
    expect(await consultar('PED-SG1', RUC)).toEqual({ estado: 'NO_DISPONIBLE' })
    await apagar()
  })
  it('el interruptor solo lo cambia un administrador de la base: ni la aplicación (authenticated) ni anon', async () => {
    for (const rol of ['authenticated', 'anon']) {
      await base.admin.query(`set role ${rol}`)
      try {
        const r = await base.admin.query(`update wms.parametros set valor = 'true' where clave = 'seguimiento_cliente_habilitado'`).catch((e: Error) => { expect(e.message).toMatch(/permission denied|administrador de la base/); return null })
        if (r) expect(r.rowCount).toBe(0)   // sin permiso de escritura: no cambia ninguna fila
      } finally { await base.admin.query('reset role') }
    }
    expect((await uno(`select valor from wms.parametros where clave = 'seguimiento_cliente_habilitado'`)).valor).toBe('false')
  })
})

describe('con el seguimiento encendido (fuera del piloto)', () => {
  beforeAll(encender)
  afterAll(apagar)

  it('pedido + RUC: ve solo los hitos con fecha y hora (sin precios, lotes, dirección ni personal) y sin hora estimada', async () => {
    await limpiarIntentos()
    const r = await consultar('ped-sg1', RUC)
    expect(r.estado).toBe('OK'); expect(r.pedido).toBe('PED-SG1')
    expect(r.hitos.map((h: R) => h.estado)).toEqual(['RECIBIDO'])
    const e = await consultar(' PED-SG2 ', RUC)
    expect(e.hitos.map((h: R) => h.estado)).toEqual(['RECIBIDO', 'EN_RUTA', 'ENTREGADO'])
    expect(e.hitos.every((h: R) => Object.keys(h).sort().join() === 'en,estado' && !Number.isNaN(Date.parse(h.en)))).toBe(true)
    const texto = JSON.stringify(e)
    for (const secreto of ['Av. Secreta', 'Crédito', 'María Pérez', '12345678', 'Dapagliflozina', 'lote', 'precio', 'estimad', 'entregas/x.jpg']) expect(texto.toLowerCase()).not.toContain(secreto.toLowerCase())
    expect(Object.keys(e).sort()).toEqual(['estado', 'hitos', 'pedido'])
  })
  it('no revela si el pedido existe: pedido inexistente y RUC equivocado dan exactamente la misma respuesta', async () => {
    await limpiarIntentos()
    const a = await consultar('PED-NOEXISTE', RUC)
    const b = await consultar('PED-SG1', '20999999999')
    const c = await consultar('PED-SG1', 'abc')
    expect(a).toEqual({ estado: 'NO_ENCONTRADO' }); expect(b).toEqual(a); expect(c).toEqual(a)
  })
  it('límite por pedido: a los 5 fallos espera (aunque después escriba bien el RUC), igual si el pedido existe o no; otro pedido no se afecta', async () => {
    await limpiarIntentos()
    for (let i = 0; i < 5; i++) expect((await consultar('PED-SG1', '20999999999', `10.1.0.${i}`)).estado).toBe('NO_ENCONTRADO')
    const espera = await consultar('PED-SG1', RUC, '10.1.0.99')
    expect(espera.estado).toBe('ESPERA'); expect(espera.espera_segundos).toBeGreaterThan(0); expect(espera.espera_segundos).toBeLessThanOrEqual(900)
    expect(Object.keys(espera).sort()).toEqual(['espera_segundos', 'estado'])
    for (let i = 0; i < 5; i++) await consultar('PED-FANTASMA', RUC, `10.2.0.${i}`)
    expect((await consultar('PED-FANTASMA', RUC, '10.2.0.99')).estado).toBe('ESPERA')   // mismo comportamiento: no se distingue
    expect((await consultar('PED-SG2', RUC, '10.3.0.1')).estado).toBe('OK')
  })
  it('límite por IP: a los 8 fallos desde la misma IP espera aunque pruebe otro pedido; otra IP no se afecta; pasados 15 minutos vuelve a poder', async () => {
    await limpiarIntentos()
    for (let i = 0; i < 8; i++) await consultar(`PED-X${i}`, RUC, '10.9.9.9')
    expect((await consultar('PED-SG2', RUC, '10.9.9.9')).estado).toBe('ESPERA')
    expect((await consultar('PED-SG2', RUC, '10.9.9.10')).estado).toBe('OK')
    await base.admin.query(`update wms.seguimiento_intentos set en = now() - interval '16 minutes'`)
    expect((await consultar('PED-SG2', RUC, '10.9.9.9')).estado).toBe('OK')
  })
  it('enlace con token: se genera con permiso, vive solo como hash, sirve, se revoca y vence', async () => {
    await limpiarIntentos()
    expect((await falla(crearEnlace(base.personas.auditor.id, 'PED-SG1'))).message).toMatch(/No tienes permiso/)
    const e = await crearEnlace(jt, 'PED-SG2', 7)
    expect(e.token).toMatch(/^[0-9a-f]{128}$/)
    expect(new Set(await Promise.all([1, 2, 3].map(async () => (await crearEnlace(jt, 'PED-SG2')).token))).size).toBe(3)
    const fila = await uno('select * from wms.seguimiento_tokens where id = $1', [e.id])
    expect(fila.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(fila)).not.toContain(e.token)
    expect(Number((await uno(`select count(*)::int n from wms.audit_events where evento = 'seguimiento_enlace_creado' and (coalesce(despues::text, '') || coalesce(motivo, '')) like '%' || $1 || '%'`, [e.token])).n)).toBe(0)
    expect(await porToken(e.token)).toMatchObject({ estado: 'OK', pedido: 'PED-SG2' })
    expect(await porToken(`${e.token}0`)).toEqual({ estado: 'NO_ENCONTRADO' })
    expect(Number(await como(jt, async (c) => (await c.query('select wms.revocar_enlaces_seguimiento($1) n', ['PED-SG2'])).rows[0].n))).toBe(4)
    expect(await porToken(e.token)).toEqual({ estado: 'NO_ENCONTRADO' })
    const v = await crearEnlace(jt, 'PED-SG1', 1)
    await base.admin.query(`update wms.seguimiento_tokens set creado_en = now() - interval '3 days', vence_en = now() - interval '2 days' where id = $1`, [v.id])
    expect(await porToken(v.token)).toEqual({ estado: 'NO_ENCONTRADO' })
    expect((await falla(crearEnlace(jt, 'PED-SG1', 400))).message).toMatch(/1 y 90 días/)
    expect((await falla(crearEnlace(jt, 'PED-NOEXISTE'))).message).toMatch(/No encontramos ese pedido/)
  })
  it('límite de intentos también con tokens inventados', async () => {
    await limpiarIntentos()
    for (let i = 0; i < 5; i++) expect((await porToken(`falso-${i}`, `10.7.0.${i}`)).estado).toBe('NO_ENCONTRADO')
    expect((await porToken('otro-falso', '10.7.0.50')).estado).toBe('ESPERA')
  })
})

describe('lo que ve quien no tiene usuario (anon)', () => {
  it('solo puede llamar a las dos consultas: ninguna tabla, ni la vista, ni las demás funciones', async () => {
    const fns = (await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'wms' and has_function_privilege('anon', p.oid, 'execute') order by 1`)).map((r) => r.proname)
    expect(fns).toEqual(['seguimiento_consultar', 'seguimiento_por_token'])
    for (const t of ['pedidos_despacho', 'seguimiento_tokens', 'seguimiento_intentos', 'v_seguimiento_pedido', 'parametros', 'rutas']) {
      await anon(async () => { await expect(base.admin.query(`select 1 from wms.${t} limit 1`)).rejects.toThrow(/permission denied/) })
    }
  })
  it('la vista mínima solo tiene número de pedido y sus hitos', async () => {
    expect((await q(`select column_name from information_schema.columns where table_schema = 'wms' and table_name = 'v_seguimiento_pedido' order by ordinal_position`)).map((r) => r.column_name)).toEqual(['pedido_id', 'numero', 'hitos'])
  })
})
