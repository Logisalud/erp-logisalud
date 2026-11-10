// 0050 · Código de bonificación (BO…): el mismo producto con otro código; una sola ficha regulatoria (D-213). El BO es un espejo de la ficha del producto normal,
// y editar el BO edita al normal. Un BO sin producto normal (o con el vínculo roto) sigue como cualquier producto.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba } from './helpers'

const j = JSON.stringify
let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba({ piloto: true, con0008: false }) }, 120_000)
afterAll(async () => { await base?.cerrar() })

const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const producto = async (codigo: string, bonificacion: string | null = null) =>
  (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida, codigo_bonificacion) values ($1, $2, 'UND', $3) returning id`, [codigo, `Producto ${codigo}`, bonificacion])).id as string
const editar = (quien: string, id: string, datos: object) => base.como(quien, (c) => c.query('select wms.editar_regulatorio($1, $2::jsonb, $3) n', [id, j(datos), 'Prueba']))
const ficha = (id: string) => uno('select * from wms.producto_regulatorio where producto_id = $1', [id])
const completo = async (id: string) => (await uno('select wms.producto_completo($1) c', [id])).c as boolean

describe('0050 · una sola ficha para el producto y su código de bonificación', () => {
  it('al completar el producto normal, su BO toma la misma ficha y queda completo; la validación también se copia', async () => {
    const normal = await producto('BON-A1', 'BOBON-A1'); const bo = await producto('BOBON-A1')
    await editar(base.personas.sandra.id, normal, { registro_sanitario: 'RS-77', rs_vence: '2031-05-05', fabricante: 'Lab Uno', forma_presentacion: 'Cápsula', concentracion: '800 mcg', condicion_almacenamiento: 'Menos de 30 C' })
    const f = await ficha(bo)
    expect(f).toMatchObject({ registro_sanitario: 'RS-77', fabricante: 'Lab Uno', forma_presentacion: 'Cápsula', concentracion: '800 mcg', condicion_almacenamiento: 'Menos de 30 C' })
    expect(await completo(normal)).toBe(true)
    expect(await completo(bo)).toBe(true)
    expect(f.estado_validacion).toBe((await ficha(normal)).estado_validacion)
  })

  it('un cambio posterior en el normal llega al BO; editar el BO edita al normal (y el historial queda en el normal)', async () => {
    const normal = await producto('BON-B1', 'BOBON-B1'); const bo = await producto('BOBON-B1')
    await editar(base.personas.sandra.id, normal, { registro_sanitario: 'RS-1', rs_vence: '2031-01-01', fabricante: 'Lab', concentracion: '5 mg' })
    await editar(base.personas.katia.id, normal, { concentracion: '10 mg' })
    expect((await ficha(bo)).concentracion).toBe('10 mg')
    expect((await editar(base.personas.sandra.id, bo, { concentracion: '20 mg' })).rows[0].n).toBe(1)
    expect((await ficha(normal)).concentracion).toBe('20 mg')
    expect((await ficha(bo)).concentracion).toBe('20 mg')
    expect(Number((await uno(`select count(*) n from wms.producto_regulatorio_cambios where producto_id = $1`, [bo])).n)).toBe(0)
    expect(Number((await uno(`select count(*) n from wms.producto_regulatorio_cambios where producto_id = $1 and campo = 'concentracion'`, [normal])).n)).toBeGreaterThanOrEqual(2)
  })

  it('el vínculo que Compras agrega después se pone al día con sincronizar_bonificaciones(); si alguien toca la ficha del BO, vuelve la del normal', async () => {
    const normal = await producto('BON-C1'); const bo = await producto('BOBON-C1')
    await editar(base.personas.sandra.id, normal, { registro_sanitario: 'RS-C', rs_vence: '2031-01-01', fabricante: 'Lab C', concentracion: '1 g' })
    expect(await ficha(bo)).toBeUndefined()
    await base.admin.query(`update catalogo.productos set codigo_bonificacion = 'BOBON-C1' where id = $1`, [normal])
    expect(Number((await uno('select wms.sincronizar_bonificaciones() n')).n)).toBeGreaterThanOrEqual(1)
    expect((await ficha(bo)).registro_sanitario).toBe('RS-C')
    await base.admin.query(`update wms.producto_regulatorio set registro_sanitario = 'MANIPULADO' where producto_id = $1`, [bo])
    await uno('select wms.sincronizar_bonificaciones()')
    expect((await ficha(bo)).registro_sanitario).toBe('RS-C')
  })

  it('un BO sin producto normal, o con el vínculo roto, sigue como cualquier producto: su propia ficha', async () => {
    const suelto = await producto('BOBON-D1')
    const roto = await producto('BON-D2', 'BOBON-NO-EXISTE')
    expect(await uno('select wms.producto_base_de($1) b', [suelto]).then((r) => r.b)).toBe(suelto)
    expect(await uno('select wms.producto_base_de($1) b', [roto]).then((r) => r.b)).toBe(roto)
    await editar(base.personas.sandra.id, suelto, { registro_sanitario: 'RS-D', rs_vence: '2031-01-01', fabricante: 'Lab D' })
    expect((await ficha(suelto)).registro_sanitario).toBe('RS-D')
    await editar(base.personas.sandra.id, roto, { registro_sanitario: 'RS-R', rs_vence: '2031-01-01' })
    expect((await ficha(roto)).registro_sanitario).toBe('RS-R')
  })

  it('producto_base_de devuelve el normal para el BO y a sí mismo para el normal; el espejo no deja a la aplicación editar el catálogo', async () => {
    const normal = await producto('BON-E1', 'BOBON-E1'); const bo = await producto('BOBON-E1')
    expect((await uno('select wms.producto_base_de($1) b', [bo])).b).toBe(normal)
    expect((await uno('select wms.producto_base_de($1) b', [normal])).b).toBe(normal)
    expect(Number((await uno(`select count(*) n from catalogo.productos where codigo like 'BON-E1' or codigo like 'BOBON-E1'`)).n)).toBe(2)
  })
})
