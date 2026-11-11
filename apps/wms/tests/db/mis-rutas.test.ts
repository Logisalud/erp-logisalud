// Fase 4 · P4 (migración 0043): «Mis rutas» del conductor y del auxiliar de transporte.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla } from './helpers'

let base: BaseDePrueba
let conductor: string
let auxiliarT: string
let ajeno: string
let jt: string
let ruta: string
let p1: string
let p2: string
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
const HASH = 'a'.repeat(64)
const evento = (quien: string, parada: string, ev: string, datos: Record<string, unknown> = {}) => como(quien, async (c) => (await c.query('select wms.registrar_evento_parada($1, $2, $3::jsonb) id', [parada, ev, JSON.stringify(datos)])).rows[0].id as string)
const entrega = { recibio_nombre: 'María Pérez', recibio_documento: '12345678', foto_ref: 'entregas/abc-foto.jpg', foto_nombre: 'foto.jpg', foto_hash: HASH, foto_bytes: 2048, foto_tipo: 'image/jpeg' }
const mias = (quien: string) => como(quien, async (c) => (await c.query('select wms.mis_rutas_del_dia() r')).rows[0].r as { id: string; estado: string; paradas: { id: string; cliente: string; eventos: { evento: string }[] }[] }[])

async function persona(rol: string): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol])
  return id
}
async function parada(n: number): Promise<string> {
  const pd = (await uno(`insert into wms.pedidos_despacho (pedido_id, version, numero, fecha, cliente_id, cliente_nombre, cliente_ruc, snapshot, cambios, vigente, importado_por)
    values ($1, 1, $1, current_date, 'c1', $2, null, $3::jsonb, '{}', true, $4) returning id`, [`mr-${n}-${randomUUID().slice(0, 4)}`, `Botica ${n} SAC`, JSON.stringify({ cliente: { direccion: `Av. Prueba ${n}`, distrito: 'Lima' }, lineas: [{ cantidad: 10 }] }), jt])).id
  const pedidoId = (await uno('select pedido_id from wms.pedidos_despacho where id = $1', [pd])).pedido_id
  return (await uno(`insert into wms.ruta_paradas (ruta_id, secuencia, pedido_id, pedido_despacho_id) values ($1, $2, $3, $4) returning id`, [ruta, n, pedidoId, pd])).id
}

beforeAll(async () => {
  base = await crearBaseDePrueba({ piloto: true })
  jt = await persona('jefe_transporte')
  conductor = await persona('conductor'); auxiliarT = await persona('auxiliar_transporte'); ajeno = await persona('conductor')
  const c = (await uno(`insert into wms.personal_transporte (nombre, funcion, usuario_id) values ('Luis Prueba', 'CONDUCTOR', $1) returning id`, [conductor])).id
  const a = (await uno(`insert into wms.personal_transporte (nombre, funcion, usuario_id) values ('Ana Prueba', 'AUXILIAR', $1) returning id`, [auxiliarT])).id
  await base.admin.query(`insert into wms.personal_transporte (nombre, funcion, usuario_id) values ('Otro Prueba', 'CONDUCTOR', $1)`, [ajeno])
  ruta = (await uno(`insert into wms.rutas (numero, fecha, estado, conductor_id, auxiliar_id, creada_por) values ('RUT-TEST-1', $1, 'EN_RUTA', $2, $3, $4) returning id`, [hoy, c, a, jt])).id
  p1 = await parada(1); p2 = await parada(2)
})
afterAll(async () => { await base?.cerrar() })

describe('Mis rutas', () => {
  it('cada quien ve solo sus rutas del día (conductor y auxiliar de la ruta sí; otro conductor, no) y sin leer el inventario', async () => {
    for (const quien of [conductor, auxiliarT]) {
      const r = await mias(quien)
      expect(r).toHaveLength(1)
      expect(r[0].paradas.map((p) => p.cliente)).toEqual(['Botica 1 SAC', 'Botica 2 SAC'])
    }
    expect(await mias(ajeno)).toEqual([])
    expect(Number((await como(conductor, (c) => c.query('select count(*)::int n from wms.saldos'))).rows[0].n)).toBe(0)   // no lee el inventario (RLS)
    expect((await falla(mias(base.personas.charlie.id))).code).toBe('42501')
  })
  it('llegué → entregado con quién recibió (nombre y DNI) y la foto; el orden y las reglas se aplican en la base', async () => {
    expect((await falla(evento(conductor, p1, 'ENTREGADO', entrega))).message).toMatch(/Primero marca «Llegué»/)
    await evento(conductor, p1, 'LLEGUE')
    expect((await falla(evento(conductor, p1, 'LLEGUE'))).message).toMatch(/Ya marcaste/)
    expect((await falla(evento(conductor, p1, 'ENTREGADO', { ...entrega, recibio_documento: '123' }))).message).toMatch(/8 números/)
    expect((await falla(evento(conductor, p1, 'ENTREGADO', { ...entrega, recibio_nombre: '' }))).message).toMatch(/nombre de quien recibió/)
    expect((await falla(evento(conductor, p1, 'ENTREGADO', { ...entrega, foto_ref: null, foto_hash: null }))).message).toMatch(/foto/)
    await evento(auxiliarT, p1, 'ENTREGADO', entrega)
    expect((await uno(`select recibio_nombre, recibio_documento, foto_hash, por from wms.ruta_paradas_eventos where parada_id = $1 and evento = 'ENTREGADO'`, [p1]))).toMatchObject({ recibio_nombre: 'María Pérez', recibio_documento: '12345678', foto_hash: HASH, por: auxiliarT })
    expect((await falla(evento(conductor, p1, 'NO_ENTREGADO', { motivo: 'cliente ausente' }))).message).toMatch(/ya tiene su resultado/)
    await evento(conductor, p1, 'INCIDENCIA', { motivo: 'Tráfico en la avenida' })   // una incidencia se puede anotar siempre
  })
  it('conformidad del cliente (0056): sin marcar cuenta como conforme; «no» pide el tipo de diferencia (cantidad, descripción, lote o documento)', async () => {
    const r3 = (await uno(`insert into wms.rutas (numero, fecha, estado, conductor_id, creada_por) values ('RUT-TEST-3', $1, 'EN_RUTA', (select id from wms.personal_transporte where usuario_id = $2), $3) returning id`, [hoy, conductor, jt])).id
    const pd = (await uno(`select id from wms.pedidos_despacho limit 1`)).id
    const mk = async (n: number) => (await uno(`insert into wms.ruta_paradas (ruta_id, secuencia, pedido_id, pedido_despacho_id, activa) values ($1, $2, $3, $4, true) returning id`, [r3, n, `conf-${n}`, pd])).id as string
    const [a, b, c] = [await mk(1), await mk(2), await mk(3)]
    for (const x of [a, b, c]) await evento(conductor, x, 'LLEGUE')
    await evento(conductor, a, 'ENTREGADO', entrega)
    expect(await uno(`select conforme, tipo_diferencia from wms.ruta_paradas_eventos where parada_id = $1 and evento = 'ENTREGADO'`, [a])).toMatchObject({ conforme: true, tipo_diferencia: null })
    expect((await falla(evento(conductor, b, 'ENTREGADO', { ...entrega, conforme: false }))).message).toMatch(/Elige qué no coincidió/)
    expect((await falla(evento(conductor, b, 'ENTREGADO', { ...entrega, conforme: false, tipo_diferencia: 'COLOR' }))).message).toMatch(/Elige qué no coincidió/)
    await evento(conductor, b, 'ENTREGADO', { ...entrega, conforme: false, tipo_diferencia: 'lote', detalle_diferencia: 'Llegó otro lote' })
    expect(await uno(`select conforme, tipo_diferencia, detalle_diferencia from wms.ruta_paradas_eventos where parada_id = $1 and evento = 'ENTREGADO'`, [b])).toMatchObject({ conforme: false, tipo_diferencia: 'LOTE', detalle_diferencia: 'Llegó otro lote' })
    await evento(conductor, c, 'RECHAZADO', { motivo: 'No lo quiso recibir', conforme: false, tipo_diferencia: 'CANTIDAD' })   // en un rechazo la conformidad no aplica
    expect(await uno(`select conforme, tipo_diferencia from wms.ruta_paradas_eventos where parada_id = $1 and evento = 'RECHAZADO'`, [c])).toMatchObject({ conforme: null, tipo_diferencia: null })
    const vista = (await mias(conductor)).find((r) => r.id === r3)!.paradas.find((p) => p.id === b)!.eventos.find((e) => e.evento === 'ENTREGADO') as unknown as { conforme: boolean; tipo_diferencia: string }
    expect(vista).toMatchObject({ conforme: false, tipo_diferencia: 'LOTE' })
  })
  it('otro conductor no registra nada en una ruta ajena; los eventos solo se agregan', async () => {
    expect((await falla(evento(ajeno, p2, 'LLEGUE'))).code).toBe('42501')
    expect((await falla(base.admin.query('delete from wms.ruta_paradas_eventos'))).message).toMatch(/solo admite agregar/)
    expect((await falla(base.admin.query(`update wms.ruta_paradas_eventos set motivo = 'x'`))).message).toMatch(/solo admite agregar/)
  })
  it('rechazado y no entregado piden motivo y avisan al Jefe de Transporte (retorno por originar); con todas las paradas resueltas la ruta queda pendiente de cierre', async () => {
    expect((await falla(evento(conductor, p2, 'NO_ENTREGADO', { motivo: 'no' }))).message).toMatch(/motivo/)
    await evento(conductor, p2, 'NO_ENTREGADO', { motivo: 'Cliente ausente, local cerrado' })
    const a = await uno(`select tipo, destinatario_rol, mensaje from wms.alertas where tipo = 'RETORNO_POR_ORIGINAR'`)
    expect(a).toMatchObject({ destinatario_rol: 'jefe_transporte' })
    expect(a.mensaje).toMatch(/Origina el retorno/)
    expect((await uno('select estado from wms.rutas where id = $1', [ruta])).estado).toBe('PENDIENTE_CIERRE')
    expect((await mias(conductor))[0].estado).toBe('PENDIENTE_CIERRE')
  })
  it('una ruta que todavía no salió no admite entregas', async () => {
    const r2 = (await uno(`insert into wms.rutas (numero, fecha, estado, conductor_id, creada_por) values ('RUT-TEST-2', $1, 'LIBERADA', (select id from wms.personal_transporte where usuario_id = $2), $3) returning id`, [hoy, conductor, jt])).id
    const pd = (await uno(`select id from wms.pedidos_despacho limit 1`)).id
    const pp = (await uno(`insert into wms.ruta_paradas (ruta_id, secuencia, pedido_id, pedido_despacho_id, activa) values ($1, 1, 'x-lib', $2, true) returning id`, [r2, pd])).id
    expect((await falla(evento(conductor, pp, 'LLEGUE'))).message).toMatch(/todavía no salió/)
  })
})
