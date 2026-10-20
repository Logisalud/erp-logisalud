// S3 (migración 0014): la bandeja de pedidos — importación idempotente, versionado, alerta de cambio, permisos e inmutabilidad del snapshot.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resumirCambios, type PedidoSnapshot } from '@/domain/pedidos-despacho'
import { type BaseDePrueba, crearBaseDePrueba, falla } from './helpers'

let base: BaseDePrueba
let jt: string
let aux: string
let sandra: string
let katia: string
let auditor: string

const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
async function persona(rol: string | null): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  if (rol) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol])
  return id
}
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)

let n = 0
const pedido = (extra: Partial<PedidoSnapshot> = {}): PedidoSnapshot => {
  n += 1
  return {
    pedidoId: `p-${n}`, numero: `PED-${String(n).padStart(4, '0')}`, version: 1, estado: 'READY_FOR_OPERATIONS', fecha: '2026-10-13', modificadoEn: '2026-10-13T15:00:00Z',
    cliente: { id: 'c-1', nombre: 'Botica Salud SAC', ruc: '20123456789', direccion: 'Av. Lima 123', ventanaCita: 'L-V 8:00-12:00' },
    lineas: [{ lineaId: 'l-1', productoCodigo: 'LIZI-10', descripcion: 'Lizinopril 10 mg', cantidad: 20 }, { lineaId: 'l-2', productoCodigo: 'DAPA-10', descripcion: 'Dapagliflozina 10 mg', cantidad: 5 }],
    ...extra,
  }
}
const importar = (id: string, pedidos: unknown, error: string | null = null) =>
  como(id, async (c) => (await c.query('select wms.registrar_importacion_pedidos($1, $2::jsonb, $3) r', ['pedidos.test', pedidos === null ? null : JSON.stringify(pedidos), error])).rows[0].r as Record<string, unknown>)
const vigente = (pedidoId: string) => uno('select * from wms.pedidos_despacho where pedido_id = $1 and vigente', [pedidoId])

beforeAll(async () => {
  base = await crearBaseDePrueba()
  jt = await persona('jefe_transporte'); aux = await persona('auxiliar'); sandra = await persona('asistente_dt'); katia = await persona('direccion_tecnica'); auditor = await persona('auditoria_lectura')
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('importar pedidos (idempotente)', () => {
  it('un pedido nuevo se guarda con su snapshot, el cliente y queda vigente; importarlo otra vez no duplica', async () => {
    const p = pedido()
    expect(await importar(jt, [p])).toMatchObject({ ok: true, nuevos: 1, nuevas_versiones: 0, iguales: 0, antiguas: 0, descartados: [] })
    const f = await vigente(p.pedidoId)
    expect(f).toMatchObject({ numero: p.numero, version: 1, cliente_nombre: 'Botica Salud SAC', cliente_ruc: '20123456789', vigente: true, cambio_pendiente: false, salida_id: null, importado_por: jt })
    expect(f.snapshot.lineas).toHaveLength(2)
    expect(await importar(jt, [p])).toMatchObject({ nuevos: 0, iguales: 1 })
    expect((await q('select count(*)::int n from wms.pedidos_despacho where pedido_id = $1', [p.pedidoId]))[0].n).toBe(1)
    const imp = await uno('select * from wms.importaciones_pedidos order by en desc limit 1')
    expect(imp).toMatchObject({ ok: true, iguales: 1, nuevos: 0, origen: 'pedidos.test' })
  })

  it('una versión nueva deja la anterior como historia, marca el cambio por revisar y avisa al Jefe de Transporte con lo que cambió (el mismo texto del dominio)', async () => {
    const v1 = pedido()
    await importar(jt, [v1])
    const v2: PedidoSnapshot = { ...v1, version: 2, lineas: [{ ...v1.lineas[0], cantidad: 30 }, { lineaId: 'l-3', productoCodigo: 'OMEP-20', descripcion: 'Omeprazol 20 mg', cantidad: 8 }], cliente: { ...v1.cliente, direccion: 'Jr. Ica 5' } }
    expect(await importar(jt, [v2])).toMatchObject({ nuevos: 0, nuevas_versiones: 1 })
    const filas = await q('select version, vigente, cambio_pendiente, cambios from wms.pedidos_despacho where pedido_id = $1 order by version', [v1.pedidoId])
    expect(filas.map((x) => [x.version, x.vigente, x.cambio_pendiente])).toEqual([[1, false, false], [2, true, true]])
    expect(filas[1].cambios).toEqual(resumirCambios(v1, v2)) // base de datos y dominio dicen lo mismo
    expect(filas[1].cambios).toEqual(['Lizinopril 10 mg: la cantidad pasó de 20 a 30', 'Se agregó Omeprazol 20 mg (8 u.)', 'Se quitó Dapagliflozina 10 mg (5 u.)', 'Cambió la dirección de entrega'])
    const a = await q(`select * from wms.alertas where tipo = 'PEDIDO_CAMBIADO' and clave = $1`, [`pedido-cambiado:${v1.pedidoId}:2`])
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ destinatario_rol: 'jefe_transporte', estado: 'ABIERTA' })
    expect(a[0].mensaje).toMatch(new RegExp(`El pedido ${v1.numero} cambió en Pedidos \\(versión 2\\): Lizinopril 10 mg: la cantidad pasó de 20 a 30`))
    // reintentar la misma versión no repite la alerta
    await importar(jt, [v2])
    expect((await q(`select count(*)::int n from wms.alertas where clave = $1`, [`pedido-cambiado:${v1.pedidoId}:2`]))[0].n).toBe(1)
  })

  it('una versión más vieja que la vigente no pisa nada; en una misma respuesta la más alta queda vigente', async () => {
    const v1 = pedido()
    await importar(jt, [{ ...v1, version: 3 }, v1])
    expect((await vigente(v1.pedidoId)).version).toBe(3)
    expect(await importar(jt, [{ ...v1, version: 2 }])).toMatchObject({ antiguas: 1, nuevas_versiones: 0, nuevos: 0 })
    expect((await vigente(v1.pedidoId)).version).toBe(3)
    expect((await q('select count(*)::int n from wms.pedidos_despacho where pedido_id = $1', [v1.pedidoId]))[0].n).toBe(2) // v1 y v3
  })

  it('si el pedido ya tiene una salida que ya salió, la versión nueva la conserva, queda por revisar y la alerta lo dice', async () => {
    const v1 = pedido()
    await importar(jt, [v1])
    const dueno = (await uno(`select id from wms.propietarios where codigo = 'LOGISSA'`)).id
    const salida = await como(jt, async (c) => (await c.query(`select * from wms.crear_salida('DISTRIBUCION', 'VENTA', $1, '[]'::jsonb, 'pedido', $2, null)`, [dueno, v1.pedidoId]).catch(() => ({ rows: [] }))).rows)
    void salida
    const s = await uno(`insert into wms.salidas (numero, tipo, motivo, propietario_id, referencia_tipo, referencia_id, estado, creada_por)
       values ('SAL-9999-00001', 'DISTRIBUCION', 'VENTA', $1, 'pedido', $2, 'CONFIRMADA', $3) returning id`, [dueno, v1.pedidoId, jt])
    await q('update wms.pedidos_despacho set salida_id = $1 where pedido_id = $2 and vigente', [s.id, v1.pedidoId])
    await importar(jt, [{ ...v1, version: 2, lineas: [{ ...v1.lineas[0], cantidad: 1 }, v1.lineas[1]] }])
    expect(await vigente(v1.pedidoId)).toMatchObject({ version: 2, salida_id: s.id, cambio_pendiente: true })
    expect((await uno(`select mensaje from wms.alertas where clave = $1`, [`pedido-cambiado:${v1.pedidoId}:2`])).mensaje).toMatch(/El pedido .* cambió en Pedidos, pero su orden SAL-9999-00001 ya salió: coordina el cambio con el transportista\.$/)
  })

  it('un pedido mal formado se descarta con su motivo y los demás entran', async () => {
    const ok = pedido()
    const malos = [
      { ...pedido(), pedidoId: '' }, { ...pedido(), version: 0 }, { ...pedido(), estado: 'DRAFT' }, { ...pedido(), fecha: 'ayer' }, { ...pedido(), lineas: [] },
      { ...pedido(), cliente: { id: 'c' } }, { ...pedido(), lineas: [{ lineaId: 'l', productoCodigo: 'X', cantidad: 0 }] }, { ...pedido(), version: 'x' },
    ]
    const r = await importar(jt, [...malos, ok]) as { nuevos: number; descartados: { motivo: string }[] }
    expect(r.nuevos).toBe(1)
    expect(r.descartados).toHaveLength(malos.length)
    expect(r.descartados.map((d) => d.motivo)).toEqual(expect.arrayContaining([expect.stringMatching(/READY_FOR_OPERATIONS/), expect.stringMatching(/mayor que cero/), expect.stringMatching(/no trae líneas/)]))
    expect(await vigente(ok.pedidoId)).toBeTruthy()
  })

  it('si Pedidos no respondió queda el intento fallido y lo ya importado no se toca; una lista que no es lista se rechaza', async () => {
    const antes = (await q('select count(*)::int n from wms.pedidos_despacho'))[0].n
    expect(await importar(jt, null, 'Pedidos no respondió.')).toMatchObject({ ok: false, mensaje: 'Pedidos no respondió.' })
    expect((await q('select count(*)::int n from wms.pedidos_despacho'))[0].n).toBe(antes)
    expect(await uno('select ok, mensaje from wms.importaciones_pedidos order by en desc limit 1')).toEqual({ ok: false, mensaje: 'Pedidos no respondió.' })
    expect((await falla(importar(jt, { no: 'lista' }))).message).toMatch(/en una lista/)
  })
})

describe('permisos e inmutabilidad', () => {
  it('actualizan la bandeja el Jefe de Transporte y el Jefe de Almacén; nadie más', async () => {
    const charlie = base.personas.charlie.id
    await importar(charlie, [pedido()])
    for (const quien of [aux, sandra, katia, auditor, base.personas.sinRol.id]) {
      expect((await falla(importar(quien, [pedido()]))).message, quien).toMatch(/No tienes permiso para actualizar la bandeja/)
    }
  })

  it('la leen quienes trabajan las salidas, Dirección Técnica, administración y auditoría; el auxiliar, la asistente y quien no tiene rol no', async () => {
    const lee = (id: string) => como(id, async (c) => (await c.query('select count(*)::int n from wms.pedidos_despacho')).rows[0].n as number)
    for (const quien of [jt, base.personas.charlie.id, katia, base.personas.admin.id, auditor]) expect(await lee(quien), quien).toBeGreaterThan(0)
    for (const quien of [aux, sandra, base.personas.sinRol.id]) expect(await lee(quien), quien).toBe(0)
    expect(await como(aux, async (c) => (await c.query('select count(*)::int n from wms.importaciones_pedidos')).rows[0].n)).toBe(0)
    expect(await como(jt, async (c) => (await c.query('select count(*)::int n from wms.importaciones_pedidos')).rows[0].n)).toBeGreaterThan(0)
  })

  it('nadie escribe con DML directo; el snapshot y los intentos no se editan ni se borran', async () => {
    const p = pedido(); await importar(jt, [p])
    expect((await falla(como(jt, (c) => c.query(`update wms.pedidos_despacho set cliente_nombre = 'x' where pedido_id = $1`, [p.pedidoId])))).message).toMatch(/permission denied|row-level|0 rows|policy/i)
    expect((await falla(base.admin.query(`update wms.pedidos_despacho set cliente_nombre = 'x' where pedido_id = $1`, [p.pedidoId]))).message).toMatch(/no se edita/)
    expect((await falla(base.admin.query(`update wms.pedidos_despacho set snapshot = '{}'::jsonb where pedido_id = $1`, [p.pedidoId]))).message).toMatch(/no se edita/)
    expect((await falla(base.admin.query(`delete from wms.pedidos_despacho where pedido_id = $1`, [p.pedidoId]))).message).toMatch(/no se borra/)
    expect((await falla(base.admin.query(`update wms.importaciones_pedidos set ok = false`))).message).toMatch(/inmutable/i)
    await base.admin.query(`update wms.pedidos_despacho set cambio_pendiente = false where pedido_id = $1`, [p.pedidoId]) // lo único que sí cambia
  })

  it('revisar un cambio: lo limpia una vez y solo quien planifica; queda en la auditoría', async () => {
    const v1 = pedido(); await importar(jt, [v1]); await importar(jt, [{ ...v1, version: 2 }])
    expect((await vigente(v1.pedidoId)).cambio_pendiente).toBe(true)
    expect((await falla(como(aux, (c) => c.query('select wms.revisar_cambio_pedido($1)', [v1.pedidoId])))).message).toMatch(/No tienes permiso para revisar/)
    await como(jt, (c) => c.query('select wms.revisar_cambio_pedido($1)', [v1.pedidoId]))
    expect((await vigente(v1.pedidoId)).cambio_pendiente).toBe(false)
    expect((await falla(como(jt, (c) => c.query('select wms.revisar_cambio_pedido($1)', [v1.pedidoId])))).message).toMatch(/no tiene cambios por revisar/)
    expect((await falla(como(jt, (c) => c.query('select wms.revisar_cambio_pedido($1)', ['no-existe'])))).message).toMatch(/No encontramos ese pedido/)
    expect((await q(`select count(*)::int n from wms.audit_events where evento = 'cambio_pedido_revisado'`))[0].n).toBeGreaterThan(0)
  })

  it('la migración 0014 es re-ejecutable', async () => {
    const { SQL } = await import('./helpers')
    await base.admin.query(SQL.m0014())
    await base.admin.query(SQL.m0014())
    expect((await q('select count(*)::int n from wms.pedidos_despacho'))[0].n).toBeGreaterThan(0)
  })
})
