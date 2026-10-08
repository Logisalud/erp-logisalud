// D-38 (migración 0008): presentación y principio activo viven en catalogo.productos. Compras los llena al CREAR; después solo
// Katia y Sandra los editan desde el WMS (con historial). Se prueba contra la réplica de lo que Compras concede hoy (stubs.sql:
// RLS + política `productos_escritura` para compras, direccion_tecnica y admin + grants de INSERT/UPDATE).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla } from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba() }, 60_000)
afterAll(async () => { await base?.cerrar() })
const P = () => base.personas

/** Una persona de Compras: sin rol en el WMS, con permiso de escritura en el catálogo (como `public.area_en('compras', …)`). */
const comoCompras = <T>(fn: (c: import('pg').Client) => Promise<T>) =>
  base.como(P().sinRol.id, async (c) => { await c.query(`select set_config('test.area', 'compras', true)`); return fn(c) })

const crearEnCompras = (codigo: string) => comoCompras(async (c) => (await c.query(
  `insert into catalogo.productos (codigo, descripcion, presentacion, principio_activo, unidad_medida)
   values ($1, 'Producto de Compras', 'Caja x 30', 'Dapagliflozina', 'TABLETA') returning id`, [codigo])).rows[0].id as string)

const editar = (quien: string, id: string, datos: object, motivo: string | null = 'Corrección de la ficha') =>
  base.como(quien, (c) => c.query('select wms.editar_regulatorio($1, $2::jsonb, $3) as n', [id, JSON.stringify(datos), motivo]))

describe('Compras conserva lo que hace hoy', () => {
  it('crea un producto con presentación y principio activo', async () => {
    const id = await crearEnCompras('D38-1')
    const p = (await base.admin.query('select presentacion, principio_activo from catalogo.productos where id = $1', [id])).rows[0]
    expect(p).toEqual({ presentacion: 'Caja x 30', principio_activo: 'Dapagliflozina' })
  })
  it('actualiza las demás columnas (marca, unidad, estado, controla_lote…)', async () => {
    const id = await crearEnCompras('D38-2')
    await comoCompras((c) => c.query(`update catalogo.productos set marca = 'Marca X', unidad_medida = 'CAJA', controla_lote = true, estado = 'inactivo' where id = $1`, [id]))
    expect((await base.admin.query('select marca, unidad_medida, controla_lote, estado from catalogo.productos where id = $1', [id])).rows[0])
      .toEqual({ marca: 'Marca X', unidad_medida: 'CAJA', controla_lote: true, estado: 'inactivo' })
  })
  it('un UPDATE que repite el mismo valor de presentación no estorba (solo cuenta el cambio real)', async () => {
    const id = await crearEnCompras('D38-3')
    await comoCompras((c) => c.query(`update catalogo.productos set presentacion = 'Caja x 30', marca = 'M' where id = $1`, [id]))
  })
})

describe('después de creado, Compras ya no cambia presentación ni principio activo', () => {
  it('lo rechaza con un mensaje claro y el dato no cambia', async () => {
    const id = await crearEnCompras('D38-4')
    const e1 = await falla(comoCompras((c) => c.query(`update catalogo.productos set presentacion = 'Caja x 60' where id = $1`, [id])))
    expect(e1.message).toMatch(/Dirección Técnica desde el WMS/)
    expect(e1.code).toBe('42501')
    expect((await falla(comoCompras((c) => c.query(`update catalogo.productos set principio_activo = 'Otro' where id = $1`, [id])))).message).toMatch(/Dirección Técnica desde el WMS/)
    expect((await base.admin.query('select presentacion, principio_activo from catalogo.productos where id = $1', [id])).rows[0]).toEqual({ presentacion: 'Caja x 30', principio_activo: 'Dapagliflozina' })
  })
  it('tampoco un cambio de ambos campos mezclado con otras columnas', async () => {
    const id = await crearEnCompras('D38-5')
    await falla(comoCompras((c) => c.query(`update catalogo.productos set marca = 'Z', presentacion = 'Frasco' where id = $1`, [id])))
    expect((await base.admin.query('select marca, presentacion from catalogo.productos where id = $1', [id])).rows[0]).toEqual({ marca: null, presentacion: 'Caja x 30' })
  })
})

describe('Katia y Sandra los editan desde el WMS', () => {
  it('con historial (campo, antes, después, usuario, motivo)', async () => {
    const id = await crearEnCompras('D38-6')
    expect((await editar(P().katia.id, id, { presentacion: 'Caja x 60', principio_activo: 'Dapagliflozina propanodiol' })).rows[0].n).toBe(2)
    expect((await base.admin.query('select presentacion, principio_activo from catalogo.productos where id = $1', [id])).rows[0])
      .toEqual({ presentacion: 'Caja x 60', principio_activo: 'Dapagliflozina propanodiol' })
    const h = (await base.admin.query('select campo, antes, despues, usuario, motivo from wms.producto_regulatorio_cambios where producto_id = $1 order by id', [id])).rows
    expect(h).toEqual([
      { campo: 'presentacion', antes: 'Caja x 30', despues: 'Caja x 60', usuario: P().katia.id, motivo: 'Corrección de la ficha' },
      { campo: 'principio_activo', antes: 'Dapagliflozina', despues: 'Dapagliflozina propanodiol', usuario: P().katia.id, motivo: 'Corrección de la ficha' },
    ])
  })
  it('Sandra también; un valor igual no genera historial; vaciar un campo queda registrado', async () => {
    const id = await crearEnCompras('D38-7')
    expect((await editar(P().sandra.id, id, { presentacion: 'Caja x 30' })).rows[0].n).toBe(0)
    expect((await editar(P().sandra.id, id, { principio_activo: '' })).rows[0].n).toBe(1)
    expect((await base.admin.query('select principio_activo from catalogo.productos where id = $1', [id])).rows[0].principio_activo).toBeNull()
  })
  it('otros roles, sin motivo o sobre un producto inexistente: se rechaza', async () => {
    const id = await crearEnCompras('D38-8')
    for (const quien of [P().charlie, P().aux, P().admin, P().auditor, P().sinRol]) {
      expect((await falla(editar(quien.id, id, { presentacion: 'X' }))).code).toBe('42501')
    }
    expect((await falla(editar(P().katia.id, id, { presentacion: 'X' }, '  '))).message).toMatch(/necesita su motivo/)
    expect((await falla(editar(P().katia.id, '00000000-0000-0000-0000-000000000000', { presentacion: 'X' }))).message).toMatch(/no existe en el catálogo/)
    expect((await base.admin.query('select presentacion from catalogo.productos where id = $1', [id])).rows[0].presentacion).toBe('Caja x 30')
  })
})

describe('las cargas por migración o importación no se bloquean', () => {
  it('postgres (migraciones) y service_role (importadores) cambian los dos campos', async () => {
    const id = await crearEnCompras('D38-9')
    await base.admin.query(`update catalogo.productos set presentacion = 'Importada' where id = $1`, [id])
    await base.admin.query(`grant usage on schema catalogo to service_role`)
    await base.admin.query(`grant select, update on catalogo.productos to service_role`)
    await base.admin.query(`set role service_role`)
    try { await base.admin.query(`update catalogo.productos set principio_activo = 'Importado' where id = $1`, [id]) } finally { await base.admin.query(`reset role`) }
    expect((await base.admin.query('select presentacion, principio_activo from catalogo.productos where id = $1', [id])).rows[0]).toEqual({ presentacion: 'Importada', principio_activo: 'Importado' })
  })
})

describe('la migración 0008', () => {
  it('es re-ejecutable', async () => {
    const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/0008_wms_presentacion_principio_activo.sql'), 'utf8')
    await base.admin.query(sql)
    await base.admin.query(sql)
    expect((await base.admin.query(`select count(*)::int n from pg_trigger where tgname = 'proteger_presentacion_principio'`)).rows[0].n).toBe(1)
  })
  it('su reversa quita el trigger y devuelve editar_regulatorio a la versión de 0006', async () => {
    const reversa = readFileSync(resolve(__dirname, '../../supabase/rollback/wms_0008_rollback.sql'), 'utf8')
    const id = await crearEnCompras('D38-10')
    await base.admin.query(reversa)
    await base.admin.query(reversa) // re-ejecutable
    expect((await base.admin.query(`select count(*)::int n from pg_trigger where tgname = 'proteger_presentacion_principio'`)).rows[0].n).toBe(0)
    expect((await falla(editar(P().katia.id, id, { presentacion: 'X' }))).message).toMatch(/no se edita aquí/)
    // sin el trigger, Compras vuelve a poder cambiar el dato (estado anterior a 0008)
    await comoCompras((c) => c.query(`update catalogo.productos set presentacion = 'Caja x 60' where id = $1`, [id]))
    // y editar los campos regulatorios de siempre sigue funcionando
    expect((await editar(P().katia.id, id, { concentracion: '10 mg' })).rows[0].n).toBe(1)
  })
})
