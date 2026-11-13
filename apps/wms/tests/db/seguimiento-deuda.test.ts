// Migración 0068: el seguimiento del pedido muestra el estado de pagos del cliente (morosidad o «estás al día»). Lee de Cobranzas (`public.clientes`, `public.fn_documentos_cobranza`), que aquí se simulan.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla } from './helpers'

let base: BaseDePrueba
let jt: string
const R_MOROSO = '20100000011'     // debe 3 documentos vencidos y uno que aún no vence
const R_AL_DIA = '20100000022'     // cliente de Cobranzas sin documentos vencidos
const R_DESCONOCIDO = '20100000033' // Cobranzas no lo conoce
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
type R = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
async function anon<T>(fn: () => Promise<T>): Promise<T> { await base.admin.query('set role anon'); try { return await fn() } finally { await base.admin.query('reset role') } }
const consultar = (pedido: string, ruc: string, ip = '10.0.0.1') => anon(async () => (await base.admin.query('select wms.seguimiento_consultar($1, $2, $3) r', [pedido, ruc, ip])).rows[0].r as R)
const porToken = (token: string, ip = '10.0.0.1') => anon(async () => (await base.admin.query('select wms.seguimiento_por_token($1, $2) r', [token, ip])).rows[0].r as R)
const interruptor = (clave: string, valor: string) => base.admin.query(`update wms.parametros set valor = $2 where clave = $1`, [clave, valor])
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }

beforeAll(async () => {
  base = await crearBaseDePrueba({ piloto: true })
  jt = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [jt])
  await base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'jefe_transporte')`, [jt])
  // Cobranzas simulada: los clientes y la función de documentos vencidos (misma firma que la real)
  await base.admin.query(`create table public.clientes (ruc char(11) primary key, razon_social text);
    create table public.docs_cobranza (comprobante text, cliente_ruc text, fecha_vencimiento_efectiva date, saldo numeric);
    create function public.fn_documentos_cobranza(p_fecha_corte date default current_date, p_protestada boolean default true)
      returns table (documento_id uuid, cliente_ruc text, razon_social text, vendedor_nombre text, comprobante text, fecha_emision date, fecha_vencimiento_efectiva date, dias_vencido integer, saldo numeric, tiene_letras boolean)
      language sql stable as $$ select gen_random_uuid(), d.cliente_ruc, null::text, null::text, d.comprobante, null::date, d.fecha_vencimiento_efectiva, (p_fecha_corte - d.fecha_vencimiento_efectiva)::int, d.saldo, false from public.docs_cobranza d where d.saldo > 0 $$;`)
  await base.admin.query(`insert into public.clientes values ($1, 'Botica Morosa'), ($2, 'Botica Puntual')`, [R_MOROSO, R_AL_DIA])
  await base.admin.query(`insert into public.docs_cobranza values
    ('F001-00010', $1, $3::date - 10, 1200.5), ('F001-00007', $1, $3::date - 95, 800), ('F001-00009', $1, $3::date - 40, 99.999), ('F001-00020', $1, $3::date + 15, 5000),
    ('F001-00030', $2, $3::date + 5, 300), ('F001-00031', $2, $3::date - 3, 0)`, [R_MOROSO, R_AL_DIA, hoy])
  const ped = (n: number, ruc: string) => ({ pedidoId: `sd-${n}`, numero: `PED-SD${n}`, version: 1, estado: 'READY_FOR_OPERATIONS', fecha: '2026-11-03', modificadoEn: '2026-11-03T08:00:00Z', cliente: { id: `c${n}`, nombre: 'Botica', ruc, direccion: 'Av. Secreta 123' }, lineas: [{ lineaId: 'l-1', productoCodigo: 'T-DAPA', descripcion: 'Dapagliflozina', cantidad: 10 }], condicionPago: 'Crédito 30 días' })
  await como(jt, (c) => c.query('select wms.registrar_importacion_pedidos($1, $2::jsonb, null)', ['seguimiento-deuda.test', JSON.stringify([ped(1, R_MOROSO), ped(2, R_AL_DIA), ped(3, R_DESCONOCIDO)])]))
  await interruptor('seguimiento_cliente_habilitado', 'true')
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('apagado de fábrica', () => {
  it('con el interruptor de la deuda apagado el seguimiento responde igual que antes, con la deuda en null', async () => {
    await interruptor('seguimiento_deuda_habilitado', 'false')
    const r = await consultar('PED-SD1', R_MOROSO)
    expect(r).toMatchObject({ estado: 'OK', pedido: 'PED-SD1', deuda: null })
    expect(Array.isArray(r.hitos)).toBe(true)
  })
  it('la aplicación no puede encender el interruptor (o falla o no cambia nada)', async () => {
    for (const quien of [jt, base.personas.admin.id]) await como(quien, (c) => c.query(`update wms.parametros set valor = 'true' where clave = 'seguimiento_deuda_habilitado'`)).catch(() => undefined)
    expect((await uno(`select valor from wms.parametros where clave = 'seguimiento_deuda_habilitado'`)).valor).toBe('false')
  })
})

describe('con el interruptor encendido', () => {
  beforeAll(async () => { await interruptor('seguimiento_deuda_habilitado', 'true') })

  it('un cliente con documentos vencidos ve el total, los más atrasados primero y cuántos son; lo que aún no vence no se muestra', async () => {
    const r = await consultar('PED-SD1', R_MOROSO)
    expect(r.estado).toBe('OK')
    expect(r.deuda).toMatchObject({ estado: 'MOROSO', al: hoy, total: 2100.5, max_dias: 95, cantidad: 3 })
    expect((r.deuda.documentos as R[]).map((d) => d.documento)).toEqual(['F001-00007', 'F001-00009', 'F001-00010'])
    expect((r.deuda.documentos as R[])[0]).toEqual({ documento: 'F001-00007', vence: en(-95), dias: 95, saldo: 800 })
    expect(JSON.stringify(r.deuda)).not.toContain('F001-00020')       // vence en 15 días: no es mora
  })

  it('un cliente de Cobranzas sin documentos vencidos está «al día»', async () => {
    const r = await consultar('PED-SD2', R_AL_DIA)
    expect(r.deuda).toEqual({ estado: 'AL_DIA', al: hoy })
  })

  it('si Cobranzas no conoce al cliente no se dice nada (nunca «al día» sin datos)', async () => {
    const r = await consultar('PED-SD3', R_DESCONOCIDO)
    expect(r).toMatchObject({ estado: 'OK', deuda: null })
  })

  it('el enlace con token trae la deuda del cliente de ese pedido', async () => {
    const t = await como(jt, async (c) => (await c.query(`select wms.crear_enlace_seguimiento('PED-SD1', 30) r`)).rows[0].r as R)
    const r = await porToken(t.token)
    expect(r).toMatchObject({ estado: 'OK', pedido: 'PED-SD1' })
    expect(r.deuda).toMatchObject({ estado: 'MOROSO', cantidad: 3 })
    const t2 = await como(jt, async (c) => (await c.query(`select wms.crear_enlace_seguimiento('PED-SD2', 30) r`)).rows[0].r as R)
    expect((await porToken(t2.token)).deuda).toEqual({ estado: 'AL_DIA', al: hoy })
  })

  it('no cambia el acceso: con RUC equivocado o pedido inexistente responde lo de siempre, sin deuda', async () => {
    expect(await consultar('PED-SD1', R_AL_DIA)).toEqual({ estado: 'NO_ENCONTRADO' })
    expect(await consultar('PED-NO-EXISTE', R_MOROSO)).toEqual({ estado: 'NO_ENCONTRADO' })
  })

  it('con más de 30 documentos vencidos lista 30 (los más atrasados) y dice el total real', async () => {
    const ruc = '20100000044'
    await base.admin.query(`insert into public.clientes values ($1, 'Botica Grande')`, [ruc])
    for (let i = 1; i <= 35; i += 1) await base.admin.query(`insert into public.docs_cobranza values ($1, $2, $3::date - $4::int, 10)`, [`F002-${String(i).padStart(5, '0')}`, ruc, hoy, i])
    const ped = { pedidoId: 'sd-9', numero: 'PED-SD9', version: 1, estado: 'READY_FOR_OPERATIONS', fecha: '2026-11-03', modificadoEn: '2026-11-03T08:00:00Z', cliente: { id: 'c9', nombre: 'Botica', ruc, direccion: 'x' }, lineas: [{ lineaId: 'l-1', productoCodigo: 'T-DAPA', descripcion: 'x', cantidad: 1 }], condicionPago: 'Crédito 30 días' }
    await como(jt, (c) => c.query('select wms.registrar_importacion_pedidos($1, $2::jsonb, null)', ['seguimiento-deuda.test2', JSON.stringify([ped])]))
    const d = (await consultar('PED-SD9', ruc)).deuda
    expect(d).toMatchObject({ estado: 'MOROSO', cantidad: 35, total: 350, max_dias: 35 })
    expect(d.documentos).toHaveLength(30)
    expect(d.documentos[0].dias).toBe(35); expect(d.documentos[29].dias).toBe(6)
  })
})

describe('seguridad', () => {
  it('el cliente sin usuario sigue llamando solo a las dos consultas: la deuda no se puede pedir por su cuenta', async () => {
    const fns = (await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'wms' and has_function_privilege('anon', p.oid, 'execute') order by 1`)).map((r) => r.proname)
    expect(fns).toEqual(['kardex_cliente_por_token', 'seguimiento_consultar', 'seguimiento_por_token', 'stock_cliente_por_token'])
    await anon(async () => { await expect(base.admin.query(`select wms._deuda_cliente($1)`, [R_MOROSO])).rejects.toThrow(/permission denied/) })
    await anon(async () => { await expect(base.admin.query(`select * from public.fn_documentos_cobranza()`)).rejects.toThrow(/permission denied/) })
  })

  it('sin Cobranzas (o con otra firma) el seguimiento sigue funcionando y la deuda no sale', async () => {
    await base.admin.query('alter function public.fn_documentos_cobranza(date, boolean) rename to fn_documentos_cobranza_x')
    try {
      expect(await consultar('PED-SD1', R_MOROSO)).toMatchObject({ estado: 'OK', deuda: null })
    } finally { await base.admin.query('alter function public.fn_documentos_cobranza_x(date, boolean) rename to fn_documentos_cobranza') }
  })

  it('un RUC mal formado no consulta nada', async () => {
    expect((await uno(`select wms._deuda_cliente('abc') r`)).r).toBeNull()
    expect((await uno(`select wms._deuda_cliente(null) r`)).r).toBeNull()
  })
})
