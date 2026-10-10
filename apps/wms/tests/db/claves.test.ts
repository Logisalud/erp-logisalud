// La lista de claves únicas de services/supabase/claves.ts (usada para paginar con orden estable)
// tiene que coincidir con las claves primarias reales de las migraciones.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearBaseDePrueba, type BaseDePrueba } from './helpers'
import { CLAVES_UNICAS } from '@/services/supabase/claves'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba() }, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('claves únicas para paginar', () => {
  it('cada tabla registrada tiene exactamente esa clave primaria (las vistas, una clave por fila)', async () => {
    for (const [nombre, columnas] of Object.entries(CLAVES_UNICAS)) {
      const [schema, tabla] = nombre.split('.')
      const { rows } = await base.admin.query(
        `select a.attname as col
           from pg_index i
           join pg_class c on c.oid = i.indrelid
           join pg_namespace n on n.oid = c.relnamespace
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
          where i.indisprimary and n.nspname = $1 and c.relname = $2
          order by array_position(i.indkey::int[], a.attnum::int)`,
        [schema, tabla],
      )
      if (tabla.startsWith('v_')) continue // vistas: no tienen PK; su clave es la de la línea de OC
      expect(rows.map((r: { col: string }) => r.col), nombre).toEqual([...columnas])
    }
  })

  it('toda tabla que el adaptador lee con traerTodo está registrada', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const dir = resolve(__dirname, '../../services/supabase')
    const leidas = new Set<string>()
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(resolve(dir, f), 'utf8')
      for (const m of src.matchAll(/traerTodo\('([a-z_]+)',\s*'(wms|catalogo)'/g)) leidas.add(`${m[2]}.${m[1]}`)
    }
    expect(leidas.size).toBeGreaterThan(10)
    for (const t of leidas) expect(CLAVES_UNICAS, t).toHaveProperty([t])
  })
})
