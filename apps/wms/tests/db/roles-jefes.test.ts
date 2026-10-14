// Roles de los jefes y cargos (migración 0015, D-81): varios roles por persona, cargo aparte, rol «reemplazo del Jefe» retirado sin borrar historia
// y regla de dos personas por persona.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, sembrarStock, SQL } from './helpers'

let base: BaseDePrueba
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
async function persona(...roles: string[]): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  for (const r of roles) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, r])
  return id
}
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)

beforeAll(async () => { base = await crearBaseDePrueba({ sinMigracion0015: true }) }, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('retirar el rol reemplazo_jefe sin borrar historia', () => {
  let jasury: string
  let antiguaFila: string

  it('antes de la migración, quien tenía el rol lo usa; al aplicarla pasa a jefe_almacen y su fila antigua queda cerrada', async () => {
    jasury = await persona('reemplazo_jefe')
    antiguaFila = (await q(`select id from wms.usuario_roles where user_id = $1`, [jasury]))[0].id
    expect(await como(jasury, async (c) => (await c.query(`select wms.tiene_rol('reemplazo_jefe') a, wms.tiene_rol('jefe_almacen') b`)).rows[0])).toEqual({ a: true, b: false })
    await base.admin.query(SQL.m0015())
    // la historia sigue ahí, cerrada ayer
    expect((await q(`select rol, hasta::text, to_char(current_date - 1, 'YYYY-MM-DD') ayer from wms.usuario_roles where id = $1`, [antiguaFila]))[0]).toMatchObject({ rol: 'reemplazo_jefe', hasta: expect.any(String) })
    const f = (await q(`select hasta::text h, to_char(current_date - 1, 'YYYY-MM-DD') ayer from wms.usuario_roles where id = $1`, [antiguaFila]))[0]
    expect(f.h).toBe(f.ayer)
    // y ahora tiene jefe_almacen, con todos sus permisos
    expect(await como(jasury, async (c) => (await c.query(`select wms.tiene_rol('reemplazo_jefe') a, wms.tiene_rol('jefe_almacen') b, wms.es_usuario() c, wms.tiene_permiso('verificar') d, wms.tiene_permiso('preparar_salidas') e`)).rows[0]))
      .toEqual({ a: false, b: true, c: true, d: true, e: true })
    expect((await q(`select count(*)::int n from wms.audit_events where evento = 'rol_retirado'`))[0].n).toBe(1)
    expect((await q(`select count(*)::int n from wms.permisos_rol where rol = 'reemplazo_jefe'`))[0].n).toBe(0)
  })

  it('es re-ejecutable: no duplica el rol nuevo ni vuelve a cerrar nada', async () => {
    await base.admin.query(SQL.m0015()); await base.admin.query(SQL.m0015())
    expect((await q(`select count(*)::int n from wms.usuario_roles where user_id = $1 and rol = 'jefe_almacen'`, [jasury]))[0].n).toBe(1)
    expect((await q(`select count(*)::int n from wms.usuario_roles where user_id = $1`, [jasury]))[0].n).toBe(2)
    expect((await q(`select count(*)::int n from wms.audit_events where evento = 'rol_retirado'`))[0].n).toBe(1)
  })

  it('quien ya era jefe_almacen no recibe una fila repetida; el rol ya no se puede asignar, pero la historia se puede leer', async () => {
    const x = await persona('jefe_almacen')
    expect((await falla(base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'reemplazo_jefe')`, [x]))).message).toMatch(/ya no existe: asigna Jefe de Almacén/)
    expect((await falla(base.admin.query(`update wms.usuario_roles set rol = 'reemplazo_jefe' where user_id = $1`, [x]))).message).toMatch(/ya no existe/)
    expect((await falla(base.admin.query(`update wms.usuario_roles set hasta = null where id = $1`, [antiguaFila]))).message).toMatch(/no se puede dejar vigente/)
    // la fila histórica se conserva y se puede anotar (no se borra nada)
    await base.admin.query(`update wms.usuario_roles set creado_por = $2 where id = $1`, [antiguaFila, x])
    expect((await q(`select count(*)::int n from wms.usuario_roles where id = $1 and rol = 'reemplazo_jefe'`, [antiguaFila]))[0].n).toBe(1)
  })

  it('una fila de un rol retirado todavía vigente (de antes de la migración) también se cierra en una segunda base', async () => {
    const otra = await crearBaseDePrueba({ sinMigracion0015: true })
    try {
      const id = randomUUID()
      await otra.admin.query('insert into auth.users (id) values ($1)', [id])
      await otra.admin.query(`insert into wms.usuario_roles (user_id, rol, desde) values ($1, 'reemplazo_jefe', current_date - 30)`, [id])
      await otra.admin.query(`insert into wms.usuario_roles (user_id, rol, desde, hasta) values ($1, 'reemplazo_jefe', current_date - 90, current_date - 60)`, [randomUUID()]).catch(() => null)
      await otra.admin.query(SQL.m0015())
      const filas = (await otra.admin.query(`select rol, hasta::text from wms.usuario_roles where user_id = $1 order by rol`, [id])).rows
      expect(filas.map((f) => f.rol)).toEqual(['jefe_almacen', 'reemplazo_jefe'])
      expect(await otra.como(id, async (c) => (await c.query(`select wms.tiene_rol('jefe_almacen') b`)).rows[0].b)).toBe(true)
    } finally { await otra.cerrar() }
  })
})

describe('cargos: se muestran aparte de los roles', () => {
  it('administración asigna el cargo; nadie más; el personal lo ve y quien no es personal solo el suyo', async () => {
    const charlie = await persona('jefe_almacen', 'jefe_transporte')
    const admin = base.personas.admin.id
    await como(admin, (c) => c.query(`select wms.asignar_cargo($1, '  Jefe de Almacén ')`, [charlie]))
    expect((await q('select cargo from wms.cargos_usuario where user_id = $1', [charlie]))[0].cargo).toBe('Jefe de Almacén')
    await como(admin, (c) => c.query(`select wms.asignar_cargo($1, 'Jefe de Almacén y Transporte')`, [charlie])) // se puede cambiar
    expect((await q('select count(*)::int n from wms.cargos_usuario where user_id = $1', [charlie]))[0].n).toBe(1)
    for (const quien of [charlie, base.personas.aux.id, base.personas.katia.id]) {
      expect((await falla(como(quien, (c) => c.query(`select wms.asignar_cargo($1, 'Gerente')`, [charlie])))).message, quien).toMatch(/Solo administración asigna cargos/)
    }
    expect((await falla(como(admin, (c) => c.query(`select wms.asignar_cargo($1, 'x')`, [charlie])))).message).toMatch(/entre 2 y 80/)
    expect(await como(base.personas.aux.id, async (c) => (await c.query('select cargo from wms.cargos_usuario where user_id = $1', [charlie])).rows[0].cargo)).toBe('Jefe de Almacén y Transporte')
    expect(await como(base.personas.sinRol.id, async (c) => (await c.query('select count(*)::int n from wms.cargos_usuario')).rows[0].n)).toBe(0)
    expect((await q(`select count(*)::int n from wms.audit_events where evento = 'cargo_asignado'`))[0].n).toBe(2)
    // el cargo no da permisos: solo los roles
    const sinRoles = await persona()
    await como(admin, (c) => c.query(`select wms.asignar_cargo($1, 'Jefe de Almacén')`, [sinRoles]))
    expect(await como(sinRoles, async (c) => (await c.query(`select wms.es_usuario() a, wms.tiene_permiso('verificar') b`)).rows[0])).toEqual({ a: false, b: false })
  })
})

describe('varios roles por persona y la regla de dos personas', () => {
  it('Charlie y Roberto (jefe_almacen y jefe_transporte) tienen los permisos de ambos roles; Jasury (jefe_almacen) los del Jefe de Almacén, incluidos los de salidas', async () => {
    const charlie = await persona('jefe_almacen', 'jefe_transporte')
    const roberto = await persona('jefe_transporte', 'jefe_almacen')
    const jasury = await persona('jefe_almacen')
    const permisos = (id: string) => como(id, async (c) => (await c.query(
      `select wms.tiene_permiso('verificar') ver, wms.tiene_permiso('preparar_salidas') prep, wms.tiene_permiso('confirmar_salida') conf,
              wms.tiene_permiso('cambiar_lote_asignado') lote, wms.tiene_permiso('imprimir_paquete_documental') imp`)).rows[0])
    expect(await permisos(charlie)).toEqual({ ver: true, prep: true, conf: true, lote: true, imp: true })
    expect(await permisos(roberto)).toEqual({ ver: true, prep: true, conf: true, lote: true, imp: true })
    // Jasury: todo lo del Jefe de Almacén (actual y de salidas), nada del transporte que no sea del Jefe de Almacén
    expect(await permisos(jasury)).toEqual({ ver: true, prep: true, conf: false, lote: true, imp: false })
  })

  it('nadie verifica lo que él mismo ejecutó, aunque tenga ambos roles; otra persona con el rol sí', async () => {
    const charlie = await persona('jefe_almacen', 'jefe_transporte')
    const jasury = await persona('jefe_almacen')
    const s = await sembrarStock(base, { posicion: 'A-15.1', producto: base.productos.dapa, lote: 'RJ-1', propietario: 'DIPHASAC', cantidad: 10 })
    const hasta = await idPosicion(base.admin, 'A-16.1')
    const linea = { desde_posicion_id: s.posicionId, hasta_posicion_id: hasta, lote_id: s.loteId, estado: 'APROBADO', procedencia_id: s.procedencia, cantidad: 3 }
    const id = await como(charlie, async (c) => (await c.query('select wms.ejecutar_movimiento($1::jsonb, $2) as id', [JSON.stringify([linea]), 'Acomodo'])).rows[0].id as string)
    expect((await falla(como(charlie, (c) => c.query('select wms.confirmar_movimiento($1)', [id])))).message).toMatch(/no puede ser quien ejecutó/)
    await como(jasury, (c) => c.query('select wms.confirmar_movimiento($1)', [id]))
    expect((await q('select estado from wms.ordenes_movimiento where id = $1', [id]))[0].estado).toBe('CONFIRMADO')
  })
})
