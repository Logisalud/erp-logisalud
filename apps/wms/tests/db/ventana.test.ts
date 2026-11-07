// Ensayo de la ventana de aplicación en Supabase real: los bloques que se pegan en el SQL Editor (scripts/ventana-supabase.mjs) se aplican en una base
// nueva, en su orden, con su cabecera de seguridad y su registro en el historial; se pueden repetir; y la reversa deja todo como estaba, historial incluido.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SQL } from './helpers'
import { armarBloques, PASOS } from '../../scripts/ventana-supabase.mjs'

type Bloque = { orden: number; archivo: string; origen: string; version: string | null; nombre: string | null; sql: string }

const url = process.env.WMS_TEST_DATABASE_URL ?? 'postgres://wms_test:wms_test@127.0.0.1:5432/postgres'
const rollback = readFileSync(resolve(__dirname, '../../supabase/rollback/wms_0001_a_0009_rollback.sql'), 'utf8')
const nombre = `wms_vt_${randomUUID().slice(0, 8)}`
const VERSION = '20261018210000'
let admin: Client
const bloques: Bloque[] = armarBloques({ versionBase: VERSION })
const sqlVentana = (f: string) => readFileSync(resolve(__dirname, '../../supabase/ventana', f), 'utf8')

beforeAll(async () => {
  const raiz = new Client({ connectionString: url })
  await raiz.connect()
  await raiz.query(`create database ${nombre}`)
  await raiz.end()
  const u = new URL(url); u.pathname = `/${nombre}`
  admin = new Client({ connectionString: u.toString() })
  await admin.connect()
  await admin.query(SQL.stubs())
  // El historial de Supabase, con algunas filas de otros módulos (las que hay en el proyecto real).
  await admin.query(`
    create schema if not exists supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
    insert into supabase_migrations.schema_migrations (version, name) values ('20261007164743', 'factoring_canjes_e_ingresos'), ('20261007182945', 'factoring_canje_monto_editable');`)
}, 60_000)

afterAll(async () => {
  await admin?.end()
  const raiz = new Client({ connectionString: url })
  await raiz.connect()
  await raiz.query(`drop database if exists ${nombre} with (force)`)
  await raiz.end()
})

const historial = async () => (await admin.query(`select version, name from supabase_migrations.schema_migrations order by version`)).rows as { version: string; name: string }[]
const fueraDeWms = async () => (await admin.query(`
  select 'obj' k, n.nspname || '.' || c.relname || ':' || c.relkind::text d from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'wms')
  union all select 'fn', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname not in ('pg_catalog', 'information_schema', 'wms')
  union all select 'trg', tgrelid::regclass::text || ':' || tgname from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'wms.%'
  union all select 'filas', 'productos=' || (select count(*) from catalogo.productos)
  order by 1, 2`)).rows

describe('los bloques de la ventana', () => {
  it('las consultas de control corren (solo lectura) y la huella cambia cuando cambia algo fuera del WMS', async () => {
    const huella = async () => (await admin.query(sqlVentana('01-snapshot-estructura-y-filas.sql')) as unknown as { rows: Record<string, unknown>[] }[])[1].rows
    const filas = async () => (await admin.query(sqlVentana('01-snapshot-estructura-y-filas.sql')) as unknown as { rows: Record<string, unknown>[] }[])[0].rows
    expect((await filas()).length).toBeGreaterThan(0)
    const h1 = await huella()
    expect(h1.length).toBeGreaterThan(0)
    expect(await huella()).toEqual(h1) // misma base, misma huella
    await admin.query(`create table catalogo.zz_prueba_huella (id int)`)
    expect(await huella()).not.toEqual(h1)
    await admin.query(`drop table catalogo.zz_prueba_huella`)
    expect(await huella()).toEqual(h1)
    const sesiones = (await admin.query(sqlVentana('00-sesiones-activas.sql')) as unknown as { rows: unknown[] }[])
    expect(sesiones).toHaveLength(2)
    expect(sqlVentana('02-snapshot-cartera.sql')).toContain('v_saldos')
    expect(sqlVentana('03-definiciones-actuales.sql')).toContain('schemas_compras_y_pagos')
  })

  it('son 9 migraciones y el seed; la 0008 va después de la 0009 y el seed al final; las versiones suben y son mayores que la última del proyecto', () => {
    expect(bloques.map((b) => b.origen.replace(/^.*\//, '').slice(0, 4))).toEqual(['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0009', '0008', '0001'])
    expect(bloques.at(-1)!.origen).toBe('seeds/0001_topologia.sql'); expect(bloques.at(-1)!.version).toBeNull()
    const versiones = bloques.filter((b) => b.version).map((b) => b.version!)
    expect(versiones).toHaveLength(9)
    expect([...versiones].sort()).toEqual(versiones)
    expect(versiones[0] > '20261007182945').toBe(true)
    expect(bloques.map((b) => b.archivo)[0]).toBe('01-0001_base.sql')
  })

  it('cada bloque trae la cabecera de seguridad ANTES del SQL, el SQL de la migración sin tocar y el registro en el historial al final', () => {
    for (const b of bloques) {
      expect(b.sql.indexOf("set lock_timeout = '5s';")).toBeGreaterThan(-1)
      expect(b.sql.indexOf("set statement_timeout = '60s';")).toBeGreaterThan(b.sql.indexOf('lock_timeout'))
      const original = readFileSync(resolve(__dirname, '../../supabase', b.origen), 'utf8').trimEnd()
      expect(b.sql).toContain(original)
      expect(b.sql.indexOf(original)).toBeGreaterThan(b.sql.indexOf("statement_timeout = '60s'"))
      if (b.nombre) expect(b.sql.trimEnd()).toMatch(new RegExp(`insert into supabase_migrations\\.schema_migrations \\(version, name\\) values \\('${b.version}', '${b.nombre}'\\) on conflict \\(version\\) do nothing;$`))
      else expect(b.sql).not.toContain('schema_migrations')
    }
  })

  it('rechaza una versión base mal escrita', () => {
    expect(() => armarBloques({ versionBase: '2026-10-18' })).toThrow(/AAAAMMDDHHMMSS/)
    expect(() => armarBloques({ versionBase: '20261018210055' })).toThrow(/segundos/)
  })

  it('se aplican en orden en una base nueva, quedan anotados y el saldo cuadra; repetir un bloque no duplica nada', async () => {
    const antes = await fueraDeWms()
    for (const b of bloques) await admin.query(b.sql)
    const h = await historial()
    expect(h.filter((x) => x.name?.startsWith('wms_'))).toHaveLength(9)
    expect(h.filter((x) => !x.name?.startsWith('wms_'))).toHaveLength(2) // las de otros módulos siguen
    expect((await admin.query(`select * from wms.verificar_saldos()`)).rows).toEqual([])
    expect((await admin.query(`select count(*)::int n from wms.posiciones`)).rows[0].n).toBeGreaterThan(100) // el seed de topología entró
    await admin.query(bloques[0].sql) // re-ejecutable
    await admin.query(bloques[bloques.length - 1].sql) // el seed también
    expect((await historial()).filter((x) => x.name?.startsWith('wms_'))).toHaveLength(9)
    expect(await fueraDeWms()).not.toEqual(antes) // el trigger de la 0008 y los demás cambios sí quedaron
  }, 120_000)

  it('la reversa quita el WMS y SOLO sus filas del historial: todo lo demás queda como antes de la ventana', async () => {
    await admin.query(rollback)
    const h = await historial()
    expect(h.map((x) => x.name)).toEqual(['factoring_canjes_e_ingresos', 'factoring_canje_monto_editable'])
    expect((await admin.query(`select count(*)::int n from pg_namespace where nspname = 'wms'`)).rows[0].n).toBe(0)
    // antes de aplicar, la base de esta prueba tenía los stubs y el historial; ahora debe verse igual
    const limpia = `wms_vt_ref_${randomUUID().slice(0, 6)}`
    const raiz = new Client({ connectionString: url }); await raiz.connect(); await raiz.query(`create database ${limpia}`); await raiz.end()
    const u = new URL(url); u.pathname = `/${limpia}`
    const ref = new Client({ connectionString: u.toString() }); await ref.connect()
    try {
      await ref.query(SQL.stubs())
      await ref.query(`create schema if not exists supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`)
      const fotoRef = (await ref.query(`
        select 'obj' k, n.nspname || '.' || c.relname || ':' || c.relkind::text d from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'wms')
        union all select 'fn', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname not in ('pg_catalog', 'information_schema', 'wms')
        union all select 'trg', tgrelid::regclass::text || ':' || tgname from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'wms.%'
        union all select 'filas', 'productos=' || (select count(*) from catalogo.productos)
        order by 1, 2`)).rows
      expect(await fueraDeWms()).toEqual(fotoRef)
    } finally {
      await ref.end()
      const r2 = new Client({ connectionString: url }); await r2.connect(); await r2.query(`drop database if exists ${limpia} with (force)`); await r2.end()
    }
  }, 60_000)
})
