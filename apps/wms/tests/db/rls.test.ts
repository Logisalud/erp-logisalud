// RLS, roles, maestro regulatorio, topología sembrada y auditoría (base de datos local).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear, sembrarStock, SQL } from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba() }, 60_000)
afterAll(async () => { await base?.cerrar() })
const P = () => base.personas

describe('migraciones y seed', () => {
  it('son re-ejecutables (un reintento tras un fallo es lo normal)', async () => {
    await base.admin.query(SQL.m0001())
    await base.admin.query(SQL.m0002())
    await base.admin.query(SQL.m0003())
    await base.admin.query(SQL.seed())
    const n = (await base.admin.query('select count(*)::int n from wms.posiciones')).rows[0].n
    expect(n).toBe(348)
    expect((await base.admin.query('select count(*)::int n from wms.asignaciones_posicion')).rows[0].n).toBe(325)
  })

  it('la topología sembrada respeta lo que dice topologia.md', async () => {
    const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
    expect((await q(`select count(*)::int n from wms.posiciones where rack = 'A' and posicion = 27`))[0].n).toBe(4)
    const ajr = await q(`select p.codigo from wms.asignaciones_posicion a join wms.posiciones p on p.id = a.posicion_id
                           join wms.propietarios o on o.id = a.propietario_id where o.codigo = 'AJR_LABS' order by 1`)
    expect(ajr).toHaveLength(19) // 16 pallets de aprobados + J-13.3 + J-13.1 + A-11.1 (adenda)
    const libres = await q(`select p.codigo from wms.posiciones p where p.codigo in ('I-8.1','J-12.4')
                               and not exists (select 1 from wms.asignaciones_posicion a where a.posicion_id = p.id)`)
    expect(libres.map((r) => r.codigo).sort()).toEqual(['I-8.1', 'J-12.4'])
    const adenda = await q(`select estado_confirmacion from wms.documentos_sustento where tipo = 'ADENDA'`)
    expect(adenda[0].estado_confirmacion).toBe('POR_CONFIRMAR')
  })
})

describe('(18) RLS: quien no tiene permiso no lee ni escribe', () => {
  it('una persona sin rol WMS no ve nada', async () => {
    for (const t of ['posiciones', 'propietarios', 'saldos', 'partidas', 'producto_regulatorio', 'lotes']) {
      const n = await base.como(P().sinRol.id, async (c) => (await c.query(`select count(*)::int n from wms.${t}`)).rows[0].n)
      expect(n, `wms.${t}`).toBe(0)
    }
  })

  it('una sesión sin identidad (anónima) no ve nada', async () => {
    const n = await base.como(null, async (c) => (await c.query('select count(*)::int n from wms.posiciones')).rows[0].n)
    expect(n).toBe(0)
  })

  it('con rol, cada quien ve la topología', async () => {
    for (const p of [P().aux, P().charlie, P().katia, P().sandra, P().auditor]) {
      const n = await base.como(p.id, async (c) => (await c.query('select count(*)::int n from wms.posiciones')).rows[0].n)
      expect(n).toBe(348)
    }
  })

  it('nadie escribe el ledger ni los saldos con DML directo', async () => {
    for (const sql of [
      `insert into wms.partidas (movimiento_id, posicion_id, producto_id, lote_id, propietario_id, estado, origen, procedencia_id, delta)
         values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'APROBADO', 'AJUSTE', gen_random_uuid(), 1)`,
      `update wms.saldos set cantidad = 999`,
      `delete from wms.saldos`,
      `insert into wms.movimientos (tipo) values ('INGRESO')`,
    ]) {
      const e = await falla(base.como(P().katia.id, (c) => c.query(sql)))
      expect(e.message, sql).toMatch(/permission denied|row-level security/i)
    }
  })

  it('la configuración solo la escribe admin_wms', async () => {
    const nuevo = `insert into wms.propietarios (codigo, razon_social) values ('NUEVO_CLIENTE', 'Nuevo Cliente')`
    expect((await falla(base.como(P().aux.id, (c) => c.query(nuevo)))).message).toMatch(/row-level security/i)
    expect((await falla(base.como(P().charlie.id, (c) => c.query(nuevo)))).message).toMatch(/row-level security/i)
    expect((await falla(base.como(P().katia.id, (c) => c.query(nuevo)))).message).toMatch(/row-level security/i)
    await base.como(P().admin.id, (c) => c.query(nuevo))
  })

  it('las asignaciones y las posiciones tampoco las edita cualquiera', async () => {
    const e = await base.como(P().aux.id, (c) => c.query(`update wms.posiciones set activa = false where codigo = 'A-6'`))
    expect(e.rowCount).toBe(0) // RLS filtra: no afecta ninguna fila
    const act = (await base.admin.query(`select activa from wms.posiciones where codigo = 'A-6'`)).rows[0].activa
    expect(act).toBe(true)
  })

  it('un auxiliar no puede registrar cambios de estado ni ajustes', async () => {
    const s = await sembrarStock(base, { posicion: 'A-6', producto: base.productos.dapa, lote: 'RLS-1', propietario: 'LOGISSA', estado: 'CUARENTENA', cantidad: 2, origen: 'COMPRA_LOCAL' })
    const e = await falla(base.como(P().aux.id, (c) => postear(c, 'AJUSTE', [
      { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'CUARENTENA', origen: 'AJUSTE', procedencia_id: s.procedencia, delta: 1 },
    ], { sustentoId: 'x' })))
    expect(e.code).toBe('42501')
  })

  it('un auxiliar no puede revertir movimientos', async () => {
    const e = await falla(base.como(P().aux.id, (c) => c.query(`select wms.revertir_movimiento(gen_random_uuid(), 'x')`)))
    expect(e.code).toBe('42501')
  })

  it('sin sesión no se puede postear nada', async () => {
    const e = await falla(base.como(null, (c) => postear(c, 'MOVIMIENTO', [])))
    expect(e.code === '42501' || /Sesión requerida|no tiene partidas|permission denied/i.test(e.message)).toBe(true)
  })
})

describe('maestro regulatorio: Sandra crea, Katia valida', () => {
  const nuevoProducto = async () => {
    const r = await base.admin.query(`insert into catalogo.productos (codigo, descripcion) values ($1, 'Producto de prueba') returning id`, [`T-${Math.random().toString(36).slice(2, 8)}`])
    return r.rows[0].id as string
  }
  const alta = (id: string, quien: string, estado = 'PENDIENTE') => base.como(quien, (c) => c.query(
    `insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, estado_validacion, creado_por) values ($1, 'EG-77', '2030-05-05', $2, $3)`,
    [id, estado, quien]))

  it('Sandra da de alta en PENDIENTE; no puede darlo por VALIDADO', async () => {
    const id = await nuevoProducto()
    await alta(id, P().sandra.id)
    const e = await falla(base.como(P().sandra.id, (c) => c.query(
      `update wms.producto_regulatorio set estado_validacion = 'VALIDADO', validado_por = $2, validado_en = now() where producto_id = $1`, [id, P().sandra.id])))
    expect(e.message).toMatch(/row-level security/i)
    const otro = await nuevoProducto()
    expect((await falla(alta(otro, P().sandra.id, 'VALIDADO'))).message).toMatch(/row-level security|check/i)
  })

  it('Katia valida; después Sandra ya no puede editar lo validado', async () => {
    const id = await nuevoProducto()
    await alta(id, P().sandra.id)
    await base.como(P().katia.id, (c) => c.query(
      `update wms.producto_regulatorio set estado_validacion = 'VALIDADO', validado_por = $2, validado_en = now() where producto_id = $1`, [id, P().katia.id]))
    const r = await base.como(P().sandra.id, (c) => c.query(`update wms.producto_regulatorio set registro_sanitario = 'OTRO' where producto_id = $1`, [id]))
    expect(r.rowCount).toBe(0)
  })

  it('un auxiliar no da de alta', async () => {
    const id = await nuevoProducto()
    expect((await falla(alta(id, P().aux.id))).message).toMatch(/row-level security/i)
  })

  it('VALIDADO exige quién validó y cuándo', async () => {
    const id = await nuevoProducto()
    const e = await falla(base.admin.query(`insert into wms.producto_regulatorio (producto_id, estado_validacion) values ($1, 'VALIDADO')`, [id]))
    expect(e.message).toMatch(/check/i)
  })
})

describe('(20) auditoría: quién, qué, cuándo, antes, después y por qué', () => {
  it('un movimiento queda auditado con actor, evento, momento y motivo', async () => {
    const s = await sembrarStock(base, { posicion: 'A-14.1', producto: base.productos.dapa, lote: 'AUD-1', propietario: 'DIPHASAC', cantidad: 5 })
    await base.como(P().charlie.id, async (c) => postear(c, 'MOVIMIENTO', [
      { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: -1 },
      { posicion_id: await idPosicion(c, 'A-15.1'), producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: 1 },
    ], { motivo: 'Reubicar por cercanía a despacho' }))
    const r = await base.admin.query(`select * from wms.audit_events where evento = 'movimiento_movimiento' order by id desc limit 1`)
    expect(r.rows[0]).toMatchObject({ actor: P().charlie.id, motivo: 'Reubicar por cercanía a despacho', entidad: 'movimientos' })
    expect(r.rows[0].ts).toBeInstanceOf(Date)
    expect(r.rows[0].despues.partidas).toHaveLength(2)
  })

  it('un cambio de configuración guarda el antes y el después', async () => {
    const id = await base.como(P().admin.id, async (c) => {
      const r = await c.query(`select id from wms.propietarios where codigo = 'TRIAMED'`)
      await c.query(`update wms.propietarios set ruc = '20111111111' where id = $1`, [r.rows[0].id])
      return r.rows[0].id
    })
    const a = await base.admin.query(`select * from wms.audit_events where entidad = 'propietarios' and entidad_id = $1 and evento = 'update'`, [id])
    expect(a.rows[0].actor).toBe(P().admin.id)
    expect(a.rows[0].antes.ruc).toBeNull()
    expect(a.rows[0].despues.ruc).toBe('20111111111')
  })

  it('solo quien tiene permiso de auditar la lee, y nadie la escribe directo', async () => {
    expect((await base.como(P().auditor.id, async (c) => (await c.query('select count(*)::int n from wms.audit_events')).rows[0].n)) > 0).toBe(true)
    expect(await base.como(P().aux.id, async (c) => (await c.query('select count(*)::int n from wms.audit_events')).rows[0].n)).toBe(0)
    const e = await falla(base.como(P().katia.id, (c) => c.query(`insert into wms.audit_events (evento, entidad) values ('falso', 'x')`)))
    expect(e.message).toMatch(/permission denied|row-level security/i)
  })

  it('los roles tampoco se cambian a escondidas: quedan en la auditoría', async () => {
    const x = await base.admin.query(`select count(*)::int n from wms.audit_events where entidad = 'usuario_roles'`)
    expect(x.rows[0].n).toBeGreaterThan(0)
  })
})
