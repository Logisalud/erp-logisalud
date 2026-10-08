// Las migraciones se aplican a mano con herramientas que se colgaron con `drop … if exists` sobre objetos inexistentes
// (2026-10-08). Garantías: no hay ese patrón y una base nueva no emite avisos «does not exist, skipping».
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SQL } from './helpers'

const dir = resolve(__dirname, '../../supabase/migrations')
const archivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const url = process.env.WMS_TEST_DATABASE_URL ?? 'postgres://wms_test:wms_test@127.0.0.1:5432/postgres'
const nombre = `wms_mg_${randomUUID().slice(0, 8)}`
let admin: Client
const avisos: string[] = []

beforeAll(async () => {
  const raiz = new Client({ connectionString: url })
  await raiz.connect()
  await raiz.query(`create database ${nombre}`)
  await raiz.end()
  const u = new URL(url); u.pathname = `/${nombre}`
  admin = new Client({ connectionString: u.toString() })
  admin.on('notice', (n) => avisos.push(n.message))
  await admin.connect()
}, 60_000)

afterAll(async () => {
  await admin?.end()
  const raiz = new Client({ connectionString: url })
  await raiz.connect()
  await raiz.query(`drop database if exists ${nombre} with (force)`)
  await raiz.end()
})

describe('migraciones aplicables a mano', () => {
  it('ninguna usa `drop … if exists` (verifican con pg_catalog antes de borrar)', () => {
    for (const f of archivos) {
      const sql = readFileSync(resolve(dir, f), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
      expect(sql, f).not.toMatch(/\bdrop\s+(?:trigger|policy|function|table|view|index|constraint|column|extension|schema)\s+if\s+exists/i)
      expect(sql, f).not.toMatch(/drop\s+constraint\s+if\s+exists|drop\s+column\s+if\s+exists/i)
    }
  })

  it('una base nueva no emite avisos de objetos inexistentes al aplicar la cadena', async () => {
    await admin.query(SQL.stubs())
    avisos.length = 0
    for (const f of archivos) await admin.query(readFileSync(resolve(dir, f), 'utf8'))
    await admin.query(SQL.seed())
    expect(avisos.filter((a) => /does not exist|skipping/i.test(a))).toEqual([])
  }, 60_000)
})
