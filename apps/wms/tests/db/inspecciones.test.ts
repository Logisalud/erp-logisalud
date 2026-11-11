// 0058 · inspecciones de la unidad (LS-FR.49.03 y LS-FR.52.03): una por vehículo, tipo y día; la hace quien conduce y la supervisa OTRA persona; nada se edita ni se borra.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla } from './helpers'
import { FORMATOS, itemsTodoSi } from '../../domain/inspecciones'

let base: BaseDePrueba
let hans: string; let michele: string; let sinPermiso: string; let veh: string
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
const registrar = (quien: string, tipo: string, items: unknown, fecha = hoy, obs: string | null = null, vehiculo = veh) =>
  como(quien, async (c) => (await c.query('select wms.registrar_inspeccion_unidad($1, $2, $3, $4::jsonb, $5) id', [tipo, vehiculo, fecha, JSON.stringify(items), obs])).rows[0].id as string)
const supervisar = (quien: string, id: string) => como(quien, (c) => c.query('select wms.supervisar_inspeccion_unidad($1)', [id]))
const mes = (quien: string, tipo = 'VEHICULO') => como(quien, async (c) => (await c.query('select wms.inspecciones_del_mes($1, $2, $3) r', [tipo, veh, `${hoy.slice(0, 7)}-01`])).rows[0].r as { id: string; conforme: boolean; items: Record<string, string>; realizada_nombre: string | null; supervisada_nombre: string | null }[])

async function persona(rol: string, nombre?: string): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol])
  if (nombre) await base.admin.query(`insert into wms.personal_transporte (nombre, funcion, usuario_id) values ($1, 'CONDUCTOR', $2)`, [nombre, id])
  return id
}

beforeAll(async () => {
  base = await crearBaseDePrueba({ piloto: true })
  hans = await persona('conductor', 'Hans Astoyauri'); michele = await persona('conductor', 'Michele Mauriello'); sinPermiso = await persona('auxiliar')
  veh = (await uno(`insert into wms.vehiculos (placa, activo) values ('INS-001', true) returning id`)).id
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('inspecciones de la unidad (0058)', () => {
  it('quien conduce ve los vehículos disponibles sin leer tablas; quien no tiene el permiso, no', async () => {
    const r = await como(hans, async (c) => (await c.query('select wms.vehiculos_para_inspeccion() r')).rows[0].r as { placa: string }[])
    expect(r.map((x) => x.placa)).toContain('INS-001')
    expect((await falla(como(sinPermiso, (c) => c.query('select wms.vehiculos_para_inspeccion()')))).code).toBe('42501')
  })

  it('registra la inspección del vehículo y la de limpieza; todos los puntos son obligatorios y no se aceptan claves ajenas', async () => {
    const id = await registrar(hans, 'VEHICULO', itemsTodoSi('VEHICULO'))
    expect(await uno('select tipo, conforme, realizada_por from wms.inspecciones_unidad where id = $1', [id])).toMatchObject({ tipo: 'VEHICULO', conforme: true, realizada_por: hans })
    expect((await falla(registrar(hans, 'VEHICULO', itemsTodoSi('VEHICULO')))).message).toMatch(/Ya hay una inspección/)
    const sinUno = { ...itemsTodoSi('LIMPIEZA') } as Record<string, string>; delete sinUno.piso
    expect((await falla(registrar(hans, 'LIMPIEZA', sinUno))).message).toMatch(/Falta marcar un punto/)
    expect((await falla(registrar(hans, 'LIMPIEZA', { ...itemsTodoSi('LIMPIEZA'), soat: 'SI' }))).message).toMatch(/no son de esta inspección/)
    expect((await falla(registrar(hans, 'LIMPIEZA', { ...itemsTodoSi('LIMPIEZA'), piso: 'TAL VEZ' }))).message).toMatch(/Falta marcar un punto/)
    await registrar(hans, 'LIMPIEZA', { ...itemsTodoSi('LIMPIEZA'), derrame: 'SI' })   // el derrame no vuelve no conforme la limpieza
    expect((await uno(`select conforme from wms.inspecciones_unidad where tipo = 'LIMPIEZA'`)).conforme).toBe(true)
    expect((await falla(registrar(sinPermiso, 'VEHICULO', itemsTodoSi('VEHICULO'), sumarDias(-1)))).code).toBe('42501')
  })

  it('con un punto en «No» la nota es obligatoria; fechas: ni futuras ni de hace más de 3 días', async () => {
    const mal = { ...itemsTodoSi('VEHICULO'), luces: 'NO' }
    expect((await falla(registrar(hans, 'VEHICULO', mal, sumarDias(-1)))).message).toMatch(/cuéntanos qué pasó/)
    const id = await registrar(hans, 'VEHICULO', mal, sumarDias(-1), 'Luz trasera rota')
    expect(await uno('select conforme, observaciones from wms.inspecciones_unidad where id = $1', [id])).toMatchObject({ conforme: false, observaciones: 'Luz trasera rota' })
    expect((await falla(registrar(hans, 'VEHICULO', itemsTodoSi('VEHICULO'), sumarDias(1)))).message).toMatch(/no puede ser futura/)
    expect((await falla(registrar(hans, 'VEHICULO', itemsTodoSi('VEHICULO'), sumarDias(-4)))).message).toMatch(/últimos 3 días/)
    await registrar(hans, 'VEHICULO', itemsTodoSi('VEHICULO'), sumarDias(-3))
  })

  it('la supervisa OTRA persona (no quien la hizo) y una sola vez; después ya no cambia', async () => {
    const id = await registrar(michele, 'VEHICULO', itemsTodoSi('VEHICULO'), sumarDias(-2))
    expect((await falla(supervisar(michele, id))).message).toMatch(/otra persona/)
    expect((await falla(supervisar(sinPermiso, id))).code).toBe('42501')
    await supervisar(hans, id)
    expect((await falla(supervisar(hans, id))).message).toMatch(/ya fue supervisada/)
    expect((await falla(base.admin.query(`update wms.inspecciones_unidad set conforme = false where id = $1`, [id]))).message).toMatch(/ya fue supervisada/)
  })

  it('nada se borra ni se edita; la lectura del mes trae nombres y marcas', async () => {
    const libre = await registrar(hans, 'VEHICULO', itemsTodoSi('VEHICULO'), sumarDias(-2), null, (await uno(`insert into wms.vehiculos (placa, activo) values ('INS-002', true) returning id`)).id)
    expect((await falla(base.admin.query('delete from wms.inspecciones_unidad where id = $1', [libre]))).message).toMatch(/no se borran/)
    expect((await falla(base.admin.query(`update wms.inspecciones_unidad set items = '{}'::jsonb where id = $1`, [libre]))).message).toMatch(/no se edita/)
    expect(Number((await como(hans, (c) => c.query('select count(*)::int n from wms.inspecciones_unidad'))).rows[0].n)).toBe(0)   // quien conduce no lee la tabla (RLS): solo las funciones
    const r = await mes(hans)
    const supervisada = r.find((x) => x.supervisada_nombre)
    expect(supervisada).toMatchObject({ realizada_nombre: 'Michele Mauriello', supervisada_nombre: 'Hans Astoyauri', conforme: true })
    expect(Object.keys(supervisada!.items).sort()).toEqual(FORMATOS.VEHICULO.puntos.map((p) => p.clave).sort())
    expect((await falla(como(sinPermiso, (c) => c.query('select wms.inspecciones_del_mes($1, $2, $3)', ['VEHICULO', veh, `${hoy.slice(0, 7)}-01`])))).code).toBe('42501')
  })
})

function sumarDias(n: number): string { return new Date(Date.parse(`${hoy}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10) }
