// 0052 · los usuarios con el rol auxiliar_transporte entran al personal de transporte (el desplegable «Auxiliar» de la ruta), una sola vez y sin tocar a los demás.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, SQL, crearBaseDePrueba } from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba({ piloto: true, con0008: false }) }, 120_000)
afterAll(async () => { await base?.cerrar() })

const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)

describe('0052 · auxiliares de transporte en el personal', () => {
  it('da de alta a quien tiene el rol vigente, sin duplicar, y no toca a quien no lo tiene ni al rol vencido', async () => {
    const [a, b, c] = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
    for (const id of [a, b, c]) await q('insert into auth.users (id) values ($1) on conflict do nothing', [id])
    await q(`insert into wms.usuario_roles (user_id, rol, desde) values ($1, 'auxiliar_transporte', current_date - 5)`, [a])
    await q(`insert into wms.usuario_roles (user_id, rol, desde, hasta) values ($1, 'auxiliar_transporte', current_date - 30, current_date - 1)`, [b])
    await q(`insert into wms.usuario_roles (user_id, rol, desde) values ($1, 'jefe_transporte', current_date - 5)`, [c])
    await base.admin.query(SQL.m0052())
    await base.admin.query(SQL.m0052())   // re-ejecutable: no duplica
    const filas = await q(`select usuario_id, funcion, activo, nombre from wms.personal_transporte where usuario_id in ($1, $2, $3)`, [a, b, c])
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ usuario_id: a, funcion: 'AUXILIAR', activo: true })
    expect(String(filas[0].nombre).length).toBeGreaterThan(0)
  })
  it('quien ya figuraba en el personal conserva su fila', async () => {
    const d = '44444444-4444-4444-8444-444444444444'
    await q('insert into auth.users (id) values ($1) on conflict do nothing', [d])
    await q(`insert into wms.personal_transporte (nombre, funcion, usuario_id) values ('Ya estaba', 'AUXILIAR', $1)`, [d])
    await q(`insert into wms.usuario_roles (user_id, rol, desde) values ($1, 'auxiliar_transporte', current_date)`, [d])
    await base.admin.query(SQL.m0052())
    expect(await q('select nombre from wms.personal_transporte where usuario_id = $1', [d])).toEqual([{ nombre: 'Ya estaba' }])
  })
})
