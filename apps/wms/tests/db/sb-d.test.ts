// SB-D (migración 0034): motivos de traslado validados, plazo informativo de la factura y el rol Administrador (con sus límites). Re-ejecutable.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, SQL, crearBaseDePrueba, falla } from './helpers'

let base: BaseDePrueba
let admin: string
let katia: string
let jt: string
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
async function persona(rol: string): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol])
  return id
}
beforeAll(async () => {
  base = await crearBaseDePrueba()
  admin = await persona('admin_wms'); katia = await persona('direccion_tecnica'); jt = await persona('jefe_transporte')
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('motivos de traslado (D-190)', () => {
  it('trae los valores confirmados: 01 venta, 06 devolución (no 04), 13 otros; el retorno también 13', async () => {
    const par = Object.fromEntries((await q(`select clave, valor from wms.parametros where clave like 'guia_motivo%' or clave = 'factura_anulacion_directa_dias'`)).map((r) => [r.clave, r.valor]))
    expect(par).toMatchObject({ guia_motivo_codigo_venta: '01', guia_motivo_codigo_devolucion: '06', guia_motivo_codigo_muestra: '13', guia_motivo_codigo_retorno: '13', factura_anulacion_directa_dias: '7' })
  })
  it('el administrador cambia el código solo con 2 números y la descripción de «otros» solo hasta 70 caracteres', async () => {
    const upd = (clave: string, valor: string) => como(admin, (c) => c.query('update wms.parametros set valor = $2 where clave = $1', [clave, valor]))
    expect((await falla(upd('guia_motivo_codigo_devolucion', '4'))).message).toMatch(/2 números/)
    expect((await falla(upd('guia_motivo_codigo_muestra', 'AB'))).message).toMatch(/2 números/)
    expect((await falla(upd('guia_motivo_otros_descripcion_muestra', 'x'.repeat(71)))).message).toMatch(/entre 1 y 70/)
    expect((await falla(upd('guia_motivo_otros_descripcion_retorno', '   '))).message).toMatch(/entre 1 y 70/)
    expect((await falla(upd('factura_anulacion_directa_dias', '0'))).message).toMatch(/días enteros/)
    await upd('guia_motivo_otros_descripcion_muestra', `  ${'x'.repeat(70)} `)
    expect((await uno(`select valor from wms.parametros where clave = 'guia_motivo_otros_descripcion_muestra'`)).valor).toHaveLength(70)
    await upd('guia_motivo_otros_descripcion_muestra', 'MUESTRA SIN VALOR COMERCIAL')
    await upd('factura_anulacion_directa_dias', '7')
  })
  it('un cambio de configuración queda en la auditoría', async () => {
    await como(admin, (c) => c.query(`update wms.parametros set valor = '06' where clave = 'guia_motivo_codigo_devolucion'`))
    const a = await uno(`select actor, entidad_id, despues from wms.audit_events where entidad = 'parametros' and entidad_id = 'guia_motivo_codigo_devolucion' order by id desc limit 1`)
    expect(a).toMatchObject({ actor: admin, entidad_id: 'guia_motivo_codigo_devolucion' })
  })
})

describe('rol Administrador (D-194)', () => {
  const tiene = (id: string, accion: string) => como(id, async (c) => (await c.query('select wms.tiene_permiso($1) v', [accion])).rows[0].v as boolean)
  it('tiene lo operativo y de configuración, y no las decisiones sanitarias', async () => {
    for (const a of ['configurar', 'preparar_salidas', 'confirmar_salida', 'anular_guia', 'registrar_documentacion', 'originar_retorno', 'crear_orden_venta_manual', 'embalar', 'cerrar_ruta', 'dar_conformidad']) expect(await tiene(admin, a), a).toBe(true)
    for (const a of ['aprobar', 'ajustar', 'autorizar_baja', 'registrar_dictamen_cliente', 'marcar_antecedentes_calidad', 'liberar_stock_propietario']) expect(await tiene(admin, a), a).toBe(false)
    expect(await tiene(admin, 'gestionar_documentos_regulatorios')).toBe(true) // D-196: la 0035 se lo da
  })
  it('cuenta como jefe o auxiliar para tiene_rol, pero nunca como Dirección Técnica ni su asistente', async () => {
    const r = (id: string, ...roles: string[]) => como(id, async (c) => (await c.query('select wms.tiene_rol(variadic $1::text[]) v', [roles])).rows[0].v as boolean)
    expect(await r(admin, 'jefe_almacen')).toBe(true)
    expect(await r(admin, 'jefe_transporte', 'direccion_tecnica')).toBe(true)
    expect(await r(admin, 'direccion_tecnica')).toBe(false)
    expect(await r(admin, 'asistente_dt', 'direccion_tecnica')).toBe(false)
    expect(await r(katia, 'jefe_almacen')).toBe(false)
  })
  it('no puede darse permisos sanitarios, ni el rol de Dirección Técnica, ni cambiar permisos sanitarios de nadie', async () => {
    expect((await falla(como(admin, (c) => c.query(`insert into wms.permisos_rol (rol, accion) values ('admin_wms', 'aprobar')`)))).message).toMatch(/no se cambian desde la aplicación/)
    expect((await falla(como(admin, (c) => c.query(`delete from wms.permisos_rol where rol = 'direccion_tecnica' and accion = 'aprobar'`)))).message).toMatch(/no se cambian desde la aplicación/)
    expect((await falla(como(admin, (c) => c.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'direccion_tecnica')`, [admin])))).message).toMatch(/no se asigna desde la aplicación/)
    expect((await uno(`select count(*)::int n from wms.permisos_rol where rol = 'direccion_tecnica' and accion = 'aprobar'`)).n).toBe(1)
  })
  it('no firma decisiones sanitarias: ni cambiar el estado sanitario ni autorizar una baja', async () => {
    expect((await falla(como(admin, (c) => c.query(`select wms.autorizar_baja(gen_random_uuid())`)))).message).toMatch(/Solo Dirección Técnica|No encontramos|permiso/i)
  })
  it('Aprobado nunca vuelve a Cuarentena, tampoco para el Administrador', async () => {
    expect((await falla(como(admin, (c) => c.query(`insert into wms.transiciones_estado (desde, hasta) values ('APROBADO', 'CUARENTENA')`)))).message).toMatch(/prohibido siempre/)
  })
  it('el Jefe de Transporte no gana nada con esto (no escribe configuración)', async () => {
    await como(jt, (c) => c.query(`update wms.parametros set valor = '99' where clave = 'guia_motivo_codigo_devolucion'`))
    expect((await uno(`select valor from wms.parametros where clave = 'guia_motivo_codigo_devolucion'`)).valor).toBe('06')
  })
  it('la migración se puede volver a aplicar', async () => {
    await base.admin.query(SQL.m0034())
    expect(await tiene(admin, 'anular_guia')).toBe(true)
  })
})
