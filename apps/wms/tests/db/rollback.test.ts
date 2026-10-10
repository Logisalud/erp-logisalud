// La reversa del WMS (0001–0009 + seed) deja la base exactamente como estaba antes: catalogo, compras y public intactos.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SQL } from './helpers'

const url = process.env.WMS_TEST_DATABASE_URL ?? 'postgres://wms_test:wms_test@127.0.0.1:5432/postgres'
const rollback = readFileSync(resolve(__dirname, '../../supabase/rollback/wms_0001_a_0009_rollback.sql'), 'utf8')
const nombre = `wms_rb_${randomUUID().slice(0, 8)}`
let admin: Client

beforeAll(async () => {
  const raiz = new Client({ connectionString: url })
  await raiz.connect()
  await raiz.query(`create database ${nombre}`)
  await raiz.end()
  const u = new URL(url); u.pathname = `/${nombre}`
  admin = new Client({ connectionString: u.toString() })
  await admin.connect()
}, 60_000)

afterAll(async () => {
  await admin?.end()
  const raiz = new Client({ connectionString: url })
  await raiz.connect()
  await raiz.query(`drop database if exists ${nombre} with (force)`)
  await raiz.end()
})

/** Foto de todo lo que existe fuera de `wms`: objetos, columnas, extensiones y filas de catalogo. */
async function foto() {
  const objetos = (await admin.query(`
    select n.nspname, c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'wms') order by 1, 2, 3`)).rows
  const funciones = (await admin.query(`
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname not in ('pg_catalog', 'information_schema', 'wms') order by 1, 2, 3`)).rows
  const columnas = (await admin.query(`
    select table_schema, table_name, column_name, data_type from information_schema.columns
     where table_schema not in ('pg_catalog', 'information_schema', 'wms') order by 1, 2, 3`)).rows
  const extensiones = (await admin.query(`select extname from pg_extension order by 1`)).rows
  const productos = (await admin.query(`select count(*)::int n from catalogo.productos`)).rows[0].n
  const constraints = (await admin.query(`
    select conrelid::regclass::text rel, conname from pg_constraint
     where connamespace::regnamespace::text not in ('pg_catalog', 'information_schema', 'wms') order by 1, 2`)).rows
  return { objetos, funciones, columnas, extensiones, productos, constraints }
}

describe('reversa del WMS', () => {
  it('aplica la cadena completa y la reversa deja todo lo ajeno al WMS idéntico (y es re-ejecutable)', async () => {
    await admin.query(SQL.stubs())
    const antes = await foto()
    for (const m of [SQL.m0001, SQL.m0002, SQL.m0003, SQL.m0004, SQL.m0005, SQL.m0006, SQL.m0007, SQL.m0008, SQL.m0009, SQL.seed]) await admin.query(m())
    expect((await admin.query(`select count(*)::int n from pg_namespace where nspname = 'wms'`)).rows[0].n).toBe(1)

    await admin.query(rollback)
    expect((await admin.query(`select count(*)::int n from pg_namespace where nspname = 'wms'`)).rows[0].n).toBe(0)
    expect(await foto()).toEqual(antes)

    await admin.query(rollback) // segunda vez: sin efecto ni error
    expect(await foto()).toEqual(antes)
  }, 60_000)
})
