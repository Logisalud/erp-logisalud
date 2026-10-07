// Alta (Sandra) y validación (Katia) del maestro regulatorio, como funciones atómicas.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla } from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba() }, 60_000)
afterAll(async () => { await base?.cerrar() })
const P = () => base.personas

const alta = (quien: string, codigo: string, rs: string | null = 'EG-5001', vence: string | null = '2030-06-30') =>
  base.como(quien, async (c) => (await c.query(
    `select wms.crear_producto($1, 'Producto de prueba', 'Caja x 10', 'Marca', 'Principio', 'TABLETA', $2, $3, 'Fabricante', 'Tableta') as id`,
    [codigo, rs, vence])).rows[0].id as string)

describe('alta de producto', () => {
  it('Sandra crea el producto y su dato regulatorio, en PENDIENTE y a su nombre', async () => {
    const id = await alta(P().sandra.id, 'ALTA-1')
    const r = (await base.admin.query('select * from wms.producto_regulatorio where producto_id = $1', [id])).rows[0]
    expect(r).toMatchObject({ estado_validacion: 'PENDIENTE', registro_sanitario: 'EG-5001', creado_por: P().sandra.id })
    const p = (await base.admin.query('select * from catalogo.productos where id = $1', [id])).rows[0]
    expect(p).toMatchObject({ codigo: 'ALTA-1', unidad_medida: 'TABLETA' })
  })

  it('un auxiliar o el Jefe de Almacén no dan de alta', async () => {
    expect((await falla(alta(P().aux.id, 'ALTA-2'))).code).toBe('42501')
    expect((await falla(alta(P().charlie.id, 'ALTA-3'))).code).toBe('42501')
  })

  it('el código no se repite', async () => {
    await alta(P().sandra.id, 'ALTA-4')
    const e = await falla(alta(P().sandra.id, 'ALTA-4'))
    expect(e.code).toBe('23505')
    expect(e.message).toMatch(/Ya existe un producto con el código ALTA-4/)
  })

  it('código y descripción son obligatorios', async () => {
    const e = await falla(base.como(P().sandra.id, (c) => c.query(`select wms.crear_producto('  ', 'x')`)))
    expect(e.message).toMatch(/necesita código y descripción/)
  })

  it('es atómico: si falla el dato regulatorio no queda un producto a medias', async () => {
    const antes = (await base.admin.query('select count(*)::int n from catalogo.productos')).rows[0].n
    await falla(base.como(P().sandra.id, (c) => c.query(`select wms.crear_producto('ATOM-1', 'Atómico', null, null, null, 'UND', null, 'no-es-fecha')`)))
    const despues = (await base.admin.query('select count(*)::int n from catalogo.productos')).rows[0].n
    expect(despues).toBe(antes)
  })
})

describe('validación por Dirección Técnica', () => {
  it('Katia valida y la base estampa quién y cuándo', async () => {
    const id = await alta(P().sandra.id, 'VAL-1')
    await base.como(P().katia.id, (c) => c.query(`select wms.validar_producto($1, 'VALIDADO')`, [id]))
    const r = (await base.admin.query('select * from wms.producto_regulatorio where producto_id = $1', [id])).rows[0]
    expect(r.estado_validacion).toBe('VALIDADO')
    expect(r.validado_por).toBe(P().katia.id)
    expect(r.validado_en).toBeInstanceOf(Date)
  })

  it('Sandra no valida su propio trabajo', async () => {
    const id = await alta(P().sandra.id, 'VAL-2')
    const e = await falla(base.como(P().sandra.id, (c) => c.query(`select wms.validar_producto($1, 'VALIDADO')`, [id])))
    expect(e.code).toBe('42501')
  })

  it('no se valida sin registro sanitario ni vencimiento', async () => {
    const id = await alta(P().sandra.id, 'VAL-3', null, null)
    const e = await falla(base.como(P().katia.id, (c) => c.query(`select wms.validar_producto($1, 'VALIDADO')`, [id])))
    expect(e.message).toMatch(/hacen falta el registro sanitario y su vencimiento/)
  })

  it('observar exige decir qué pasa; Sandra corrige y vuelve a PENDIENTE', async () => {
    const id = await alta(P().sandra.id, 'VAL-4')
    expect((await falla(base.como(P().katia.id, (c) => c.query(`select wms.validar_producto($1, 'OBSERVADO')`, [id])))).message).toMatch(/qué falta/)
    await base.como(P().katia.id, (c) => c.query(`select wms.validar_producto($1, 'OBSERVADO', 'El vencimiento no coincide con el certificado')`, [id]))
    await base.como(P().sandra.id, (c) => c.query(`select wms.actualizar_regulatorio($1, 'EG-5001', '2031-01-31')`, [id]))
    const r = (await base.admin.query('select estado_validacion, observacion from wms.producto_regulatorio where producto_id = $1', [id])).rows[0]
    expect(r).toMatchObject({ estado_validacion: 'PENDIENTE', observacion: null })
  })

  it('cambiar el registro sanitario de algo validado exige validar de nuevo, y Sandra no lo toca', async () => {
    const id = await alta(P().sandra.id, 'VAL-5')
    await base.como(P().katia.id, (c) => c.query(`select wms.validar_producto($1, 'VALIDADO')`, [id]))
    expect((await falla(base.como(P().sandra.id, (c) => c.query(`select wms.actualizar_regulatorio($1, 'EG-X', '2032-01-01')`, [id])))).code).toBe('42501')
    await base.como(P().katia.id, (c) => c.query(`select wms.actualizar_regulatorio($1, 'EG-X', '2032-01-01')`, [id]))
    expect((await base.admin.query('select estado_validacion from wms.producto_regulatorio where producto_id = $1', [id])).rows[0].estado_validacion).toBe('PENDIENTE')
  })

  it('las validaciones quedan en la auditoría', async () => {
    const id = await alta(P().sandra.id, 'VAL-6')
    await base.como(P().katia.id, (c) => c.query(`select wms.validar_producto($1, 'VALIDADO')`, [id]))
    const a = await base.admin.query(`select actor from wms.audit_events where evento = 'producto_validado' and entidad_id = $1`, [id])
    expect(a.rows[0].actor).toBe(P().katia.id)
  })
})
